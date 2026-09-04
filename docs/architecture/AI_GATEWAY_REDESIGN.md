# MQ ERP AIゲートウェイ再設計

## 1. 結論

MQ ERPのAI機能は、既存のSupabase Edge FunctionとGemini APIだけで構成する。
新しい外部API契約や常駐サーバーは追加しない。

現在の `gemini-generate` はAPIキー露出を止める緊急対策として有効だが、恒久構造では
ブラウザからGeminiの生リクエストを受け取る汎用プロキシにしない。業務用途ごとに入力・出力・
モデル・上限をサーバー側で固定する「AIゲートウェイ」に変更する。

```text
MQ ERP画面
  └─ aiGatewayClient（型付き業務API）
       └─ Supabase AuthのユーザーJWT
            └─ ai-gateway Edge Function
                 ├─ 認証・権限
                 ├─ 用途別ポリシー
                 ├─ 入力検証・データ最小化
                 ├─ 利用量制限
                 ├─ Gemini呼出し
                 └─ 安全な監査記録
```

## 2. 現行構造の再評価

### 維持するもの

- Gemini APIキーはSupabase Secretだけに保存する。
- Edge Functionは `verify_jwt = true` を維持する。
- ブラウザにはSupabaseの公開可能キーだけを配信する。
- Geminiの呼出しはEdge Functionからだけ行う。
- Previewで検証した同一成果物を本番へ昇格する。

### 変更するもの

| 現行 | 問題 | 新設計 |
|---|---|---|
| `{ request: { model, contents, config } }` を受信 | 利用者がモデル、指示、tools等を任意指定できる | `{ version, operation, input, requestId }` だけを受信 |
| Gemini SDK互換の `any` クライアント | SDKとの差を型検査できない | 用途ごとの型付き関数 |
| JWTがなければanonキーをBearer送信 | ゲートウェイ到達後に失敗し、原因が不明瞭 | セッションなしは送信前に `AUTH_REQUIRED` |
| OriginをPreview URLごとに列挙 | Preview更新のたびに変更が必要 | 本番Origin固定。Previewは認証設定済みの専用検証Originだけ許可 |
| 本文を一律12MBまで許可 | 通常テキストに過大、音声に不十分な場合がある | 用途別の文字数・ファイルサイズ制限 |
| 上流エラー文をそのまま返す可能性 | 内部情報や課金状態を露出し得る | 安定した内部エラーコードへ変換 |
| UIが固定文で例外を隠す | 障害原因を運用者が追えない | 利用者向け文言と `requestId` を表示 |

## 3. 外部公開契約

Edge Function名は既存の `gemini-generate` を移行期間だけ維持し、実装が安定した時点で
`ai-gateway` へ改称する。新しい有料APIを増やす意味ではなく、同じSupabaseプロジェクト内の
Edge Functionの契約整理である。

### リクエスト

```ts
type AIGatewayRequest = {
  version: 1;
  requestId: string; // クライアント生成UUID。再送判定と問合せ用
  operation:
    | 'diagnostic'
    | 'estimate.generate'
    | 'estimate.revise'
    | 'strac.advise'
    | 'minutes.transcribe'
    | 'minutes.summarize'
    | 'document.draft';
  input: unknown; // operation別スキーマでサーバー検証
};
```

ブラウザから `model`、`systemInstruction`、`tools`、Geminiの `config` は受け取らない。
これらはすべてサーバー側の用途別ポリシーで決定する。

### レスポンス

```ts
type AIGatewayResponse<T> =
  | {
      ok: true;
      requestId: string;
      operation: string;
      data: T;
      meta: { modelClass: 'fast' | 'quality'; durationMs: number };
    }
  | {
      ok: false;
      requestId: string;
      error: {
        code:
          | 'AUTH_REQUIRED'
          | 'FORBIDDEN'
          | 'INVALID_INPUT'
          | 'PAYLOAD_TOO_LARGE'
          | 'RATE_LIMITED'
          | 'AI_UNAVAILABLE'
          | 'AI_TIMEOUT'
          | 'INTERNAL_ERROR';
        message: string;
        retryable: boolean;
      };
    };
```

Geminiの生レスポンス、候補一覧、内部エラー、APIキー、トークン数の詳細はブラウザへ返さない。

## 4. 用途別ポリシー

```ts
type OperationPolicy = {
  requiredPermission: string;
  model: string;
  timeoutMs: number;
  maxInputChars?: number;
  maxFileBytes?: number;
  maxOutputTokens: number;
  allowTools: false;
  containsBusinessData: boolean;
};
```

初期値は次のようにする。

| operation | 権限 | 入力上限 | 方針 |
|---|---|---:|---|
| `diagnostic` | ログイン済み全員 | 固定文のみ | 業務データを一切送らず `OK` を確認 |
| `estimate.generate` | 見積作成権限 | 50,000文字 | 固定JSON Schemaで返す |
| `estimate.revise` | 見積編集権限 | 50,000文字 | 元版を上書きせず候補だけ返す |
| `strac.advise` | 分析閲覧権限 | 30,000文字 | 顧客名等を必要に応じて仮名化 |
| `minutes.transcribe` | 議事録権限 | 10MB | 音声専用。通常JSON本文と分離を検討 |
| `minutes.summarize` | 議事録権限 | 100,000文字 | 指示と文字起こしだけ送る |
| `document.draft` | 文書作成権限 | 50,000文字 | 外部送信・メール送信は別承認 |

モデル名は環境変数またはサーバー側定数で管理し、ブラウザには選ばせない。モデル変更時に
クライアント再配備を不要にする。

## 5. 認証と認可

1. フロントは `supabase.auth.getSession()` でユーザーJWTを取得する。
2. セッションがなければEdge Functionを呼ばず `AUTH_REQUIRED` とする。
3. `Authorization: Bearer <user-jwt>` と公開可能キーを正しいヘッダーへ送る。
4. Edge Functionの `verify_jwt = true` を維持する。
5. ハンドラー内でもユーザーを確定し、operationに必要な権限を確認する。
6. 認可にはユーザー編集可能な `user_metadata` を使わない。サーバー管理の権限表または
   `app_metadata` を使う。
7. anonキー、publishable keyだけではAI処理を許可しない。

現行 `getSupabaseFunctionHeaders()` のanon Bearerフォールバックは廃止し、AI専用の
`getAuthenticatedFunctionHeaders()` を設ける。他の既存Functionの互換性を壊さないため、
共通関数を一括変更しない。

## 6. 利用量制限と課金防御

追加の外部サービスは使わず、Supabase Postgresに最小限の利用量テーブルを設ける。
実装時には別途マイグレーションレビューを行い、本設計段階ではDBを変更しない。

```text
private.ai_usage_window
  user_id
  operation
  window_started_at
  request_count
  input_units
  updated_at

private.ai_audit_event
  request_id
  user_id
  operation
  status
  duration_ms
  input_size
  model_class
  created_at
```

- 生のプロンプト、顧客名、案件名、音声、Gemini応答は監査表へ保存しない。
- `request_id` は一意にし、同じ成功済み要求の二重課金を防ぐ。
- 初期上限は小さく設定し、実利用量を見て調整する。
- 429では再試行可能時刻を返すが、自動無限再試行はしない。
- Gemini側の予算・クォータ設定も併用する。

## 7. Edge Function内部構造

Functionを多数に分割せず、1つのEdge Function内をモジュール分割する。これにより用途別管理を
保ちながら、Function間の再帰・連鎖呼出しと運用対象の増加を避ける。

```text
supabase/functions/ai-gateway/
  index.ts                 HTTP入口とレスポンス整形だけ
  auth.ts                  ユーザー確定・権限判定
  contract.ts              共通型
  errors.ts                エラーコード変換
  limits.ts                サイズ・回数・タイムアウト
  audit.ts                 メタデータ監査
  gemini.ts                Gemini HTTP通信
  operations/
    diagnostic.ts
    estimate.ts
    strac.ts
    minutes.ts
    document.ts
  schemas/
    *.ts                   operation別入力・出力検証
```

Gemini通信には明示的なタイムアウトを設ける。ネットワーク障害、429、4xx、5xxを分類し、
秘密情報を含まないログを1リクエスト数件以内で出す。

## 8. フロントエンド構造

Gemini SDK互換オブジェクトを廃止し、画面が業務APIだけを呼ぶ形へ段階移行する。

```ts
interface AIGatewayClient {
  diagnostic(): Promise<{ message: 'OK' }>;
  generateEstimate(input: EstimateInput): Promise<EstimateSuggestion>;
  reviseEstimate(input: EstimateRevisionInput): Promise<EstimateSuggestion>;
  adviseStrac(input: StracInput): Promise<StracAdvice>;
  summarizeMinutes(input: MinutesInput): Promise<MinutesSummary>;
}
```

画面は `response.text` やGemini SDK固有型を直接扱わない。手動確定値、承認、DB保存、メール送信は
AIレスポンスとは別の操作として維持し、AI成功を理由に自動実行しない。

## 9. 安全な疎通確認

`diagnostic` はログイン済み成功系を確認する専用operationとする。

- 入力は受け取らず、サーバー側固定文だけをGeminiへ送る。
- 顧客・見積・会計・議事録データを参照しない。
- DBへ業務データを書かない。
- 返却は `{ message: 'OK' }` だけとする。
- 管理画面に「AI接続確認」ボタンを置き、結果、時刻、requestIdを表示する。

これにより今回のように、成功確認のためにSTRAC実データを送る必要がなくなる。

## 10. 配備設計

```text
1. ローカル: 型検査・単体試験・ビルド
2. Supabase: ai-gatewayをJWT必須で配備
3. Preview: 専用Originと認証リダイレクトを事前登録
4. Preview: diagnostic成功、権限拒否、上限、タイムアウトを確認
5. 成果物検査: APIキーとGemini直URLがないことを確認
6. 同一Preview成果物をVercel productionへ昇格
7. 本番: diagnostic成功を確認
8. 旧公開キーを無効化
9. エラーログと利用量を監視
```

Preview URLを都度ソースへ追加しない。検証用の固定ドメインまたはVercel側で管理する専用エイリアスを
1つ用意し、Supabase Authのリダイレクト許可先とCORS許可先を一致させる。

## 11. 試験項目

### 必須自動試験

- JWTなし、期限切れ、別プロジェクトJWTが拒否される。
- 権限のないoperationが403になる。
- 未知operation、余分なフィールド、上限超過が拒否される。
- ブラウザ指定のモデル・system instruction・toolsが受理されない。
- Gemini 429、タイムアウト、5xxが安定した内部コードへ変換される。
- requestIdの重複で二重実行されない。
- 監査ログにプロンプトや業務データが保存されない。
- `diagnostic` が業務データを参照しない。

### 配備後確認

- 配信JavaScriptにGemini APIキー形式が存在しない。
- 配信JavaScriptにGemini APIの直接URLが存在しない。
- ログイン済み `diagnostic` が `OK` を返す。
- 未認証呼出しが401になる。
- 旧画面の主要AI機能が用途別API経由で動く。
- AI失敗時も見積、承認、保存などの通常業務が壊れない。

## 12. 実装順序

1. `diagnostic` と共通レスポンス型を実装する。
2. AI専用のJWT必須クライアントを実装する。
3. `strac.advise` を最初の業務用途として移行する。
4. 見積生成・修正を移行する。
5. 文書生成、議事録要約を移行する。
6. 音声、画像、Live機能は別途サイズ・ストリーミング設計後に移行する。
7. 全呼出し移行後にGemini SDK互換プロキシとキー読取コードを削除する。
8. Preview E2E後、同一成果物を本番へ昇格する。
9. 本番確認後、旧キーを無効化する。

## 13. 完了条件

- ブラウザにGeminiキーが存在しない。
- ブラウザからGeminiへ直接通信しない。
- ログインと業務権限の両方がなければAIを実行できない。
- 利用者がモデルや任意のGemini設定を指定できない。
- 用途別に入力、出力、サイズ、時間、回数が制限される。
- 業務データを含まないログイン済み成功確認ができる。
- AI障害が通常業務、保存、承認処理を巻き込まない。
- 追加の外部有料API契約なしで運用できる。
