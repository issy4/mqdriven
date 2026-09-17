# 2026-09-04 MQ ERP AI安全化・次セッション引継ぎ

> 自宅PC、Codex、Claudeは最初にこのファイルを読む。
> その後 `AGENTS.md`、`CLAUDE.md`、`docs/architecture/AI_GATEWAY_REDESIGN.md` を読む。

## 1. 本日の結論

MQ ERP本番 `https://erp.b-p.co.jp/` の配信JavaScriptにGemini APIキーが含まれ、
ブラウザからGeminiへ直接業務データを送る構造を確認した。

緊急対策として、Gemini APIキーをSupabase Secretへ移し、ログイン済みユーザーだけが呼べる
Supabase Edge Function `gemini-generate` とフロント互換クライアントを作成した。

ただし、変更済みフロントはPreviewまでで、本番へは反映していない。本番画面は旧実装のままで、
STRAC分析のAI経営顧問から接続確認を実行すると
「MQ会計エンジンが一時的に停止しています」と表示された。

本日の最終状態は次のとおり。

```text
緊急安全化コード       作成済み
Edge Function          ACTIVE / version 2
Gemini Secret          設定済み
未認証拒否             HTTP 401を確認済み
型検査                 成功
本番用ローカルビルド   成功
Preview配備            作成済み
PreviewログインE2E     未完了（OAuthが本番へ戻る）
本番フロント反映       未実施
本番ログイン成功系     未確認
旧公開キー無効化       未実施
```

## 2. 重要な安全判断

- 本番配備、DB変更、保存、提出、承認は行っていない。
- 本番STRAC画面の接続確認では、ユーザー許可後に画面上の5案件情報が旧Gemini経路へ送信された。
- APIキーをチャット、ログ、ドキュメントへ転記しない。
- 旧キーは露出済みとして扱い、恒久移行後に新キーへ交換して旧キーを無効化する。
- Preview未検証の成果物をそのまま本番へ反映しない。
- AI失敗を理由に見積・承認・保存・メール送信を自動実行しない。

## 3. 本日変更したファイル

```text
.gitignore
components/AnythingAnalysisPage.tsx
services/Gemini.ts
services/geminiProxyClient.ts
supabase/functions/gemini-generate/index.ts
vite.config.ts
docs/architecture/AI_GATEWAY_REDESIGN.md
docs/HANDOFF_2026-09-04_AI_GATEWAY.md
docs/HANDOFF_NEXT_AGENT.md
CLAUDE.md
```

### 緊急安全化実装

- `vite.config.ts`: Geminiキーをフロントへ埋め込むdefineを削除。
- `services/Gemini.ts`: ブラウザ内 `GoogleGenAI` 生成をやめ、Edge Function互換クライアントへ切替。
- `services/geminiProxyClient.ts`: 既存呼出しを移行する暫定互換層。
- `components/AnythingAnalysisPage.tsx`: 直接キー読取と直接Gemini接続を削除。
- `supabase/functions/gemini-generate/index.ts`: JWT、Origin、モデル、サイズを確認してGeminiを呼ぶ。

### 恒久設計

`docs/architecture/AI_GATEWAY_REDESIGN.md` に再設計を記録した。

中心判断:

1. 新しい外部有料APIは追加しない。
2. 既存Supabase Edge FunctionとGemini APIを利用する。
3. Geminiの生リクエストを中継する汎用プロキシを恒久化しない。
4. `diagnostic`、`estimate.generate`、`strac.advise` 等の用途別契約へ移行する。
5. JWTがない場合のanon Bearerフォールバックを廃止する。
6. モデル、system instruction、toolsはサーバー側で固定する。
7. 業務データを送らないログイン済み疎通確認を実装する。
8. 利用量制限、二重課金防止、内容を保存しない監査ログを追加する。

## 4. 確認済みの事実

Supabase project ref:

```text
pkwajxeegidydalcannz
```

`npx supabase functions list --project-ref pkwajxeegidydalcannz` で、
`gemini-generate` が `ACTIVE`、version 2であることを確認した。

`npx supabase secrets list --project-ref pkwajxeegidydalcannz` で、値を表示せず
`GEMINI_API_KEY` が存在することを確認した。

認証ヘッダーなしの呼出しは次の結果だった。

```text
HTTP 401
UNAUTHORIZED_NO_AUTH_HEADER
```

ローカル検証:

```text
npm run typecheck  成功
npm run build      成功
```

ビルド成果物検査:

```text
AIza形式のキー                         0件
generativelanguage.googleapis.com直URL 0件
gemini-generate                        存在
```

ビルド警告として、`App.tsx` の重複 `case 'detailed_estimate'` と大きなchunkが残っている。
今回のAI安全化が原因のビルド失敗ではないが、別タスクで解消する。

## 5. Previewと本番

Vercel project:

```text
team:    bp-5f70f10d
project: mqdriven-pro
prod:    https://erp.b-p.co.jp/
preview: https://mqdriven-jt6c06djb-bp-5f70f10d.vercel.app
```

Previewは作成済みだが、Google OAuthログイン後にSupabase設定によって本番
`erp.b-p.co.jp` へリダイレクトされた。このためPreview上のログイン済み成功系は未確認。

本番では旧bundle `main-CeWjEMSo.js` が配信されていた。本番のSTRAC AI確認が失敗したことは、
新しいEdge Functionの失敗を意味しない。新フロントが本番に未反映だからである。

## 6. 次回の作業順

### フェーズA: 恒久ゲートウェイの最小実装

1. `AI_GATEWAY_REDESIGN.md` を再読する。
2. `diagnostic` operationと共通レスポンス型を実装する。
3. AI専用JWT必須クライアントを追加し、anon Bearerフォールバックを使わない。
4. STRACを `strac.advise` へ移行し、業務データを必要最小限にする。
5. 認証、権限、未知operation、入力上限、タイムアウトのテストを追加する。

### フェーズB: Preview検証

1. Preview用の固定検証Originまたはエイリアスを決める。
2. Supabase AuthのRedirect URLとEdge Function CORSを同じ値にする。
3. Previewへログインする。
4. `diagnostic` が業務データなしで `OK` を返すことを確認する。
5. 未認証401、権限403、入力超過、Gemini障害時のUIを確認する。
6. 配信bundleにキーとGemini直URLがないことを再確認する。

### フェーズC: 本番切替

ユーザーの明示承認後にのみ行う。

1. 検証済みPreviewの同一成果物をproductionへ昇格する。
2. 本番 `diagnostic` を実行する。
3. 主要AI機能をスモークテストする。
4. 通常の見積・承認・保存がAI障害から独立していることを確認する。
5. 新しいGeminiキーへ交換し、旧公開キーを無効化する。
6. 利用量・請求・エラーログを監視する。

## 7. 次回の最初のコマンド

```powershell
cd C:\Users\shoichi.h\OneDrive\ドキュメント\github\mqdriven
git status --short --branch
git log -5 --oneline
Get-Content -Raw docs\HANDOFF_2026-09-04_AI_GATEWAY.md
Get-Content -Raw docs\architecture\AI_GATEWAY_REDESIGN.md
```

自宅PCではリポジトリの場所へ移動し、最初に `git pull --ff-only` を実行してから同じ文書を読む。

## 8. Claudeへの開始プロンプト

```text
mqdrivenリポジトリの docs/HANDOFF_2026-09-04_AI_GATEWAY.md、
docs/architecture/AI_GATEWAY_REDESIGN.md、AGENTS.md、CLAUDE.mdをすべて読んでください。
本番配備やDB変更はせず、まず現在のGit状態と配備状態を読み取り確認してください。
次に設計書のフェーズAから、diagnosticとJWT必須の型付きAIゲートウェイを実装・テストしてください。
既存の未コミット変更を消さず、Geminiキーや認証トークンを出力しないでください。
```

## 9. やってはいけないこと

- `git reset --hard`、未確認のcheckout、ユーザー変更の削除。
- APIキー、JWT、Secretの値を表示・記録すること。
- Preview未検証で本番へpromoteすること。
- `verify_jwt = false` にしてAI機能を公開すること。
- Gemini SDK互換 `any` プロキシを恒久APIとして拡張すること。
- 本番データを成功確認のためだけにGeminiへ送ること。
- AIレスポンスを自動で見積確定、承認、保存、メール送信へつなぐこと。
