# 引き継ぎ 2026年9月17日 ERP名刺管理検証と本番境界確認

## 次回最初に読むもの

1. `docs/HANDOFF_2026-09-17_ERP_VERIFICATION_STATUS.md`
2. `docs/VERIFICATION_2026-09-17_BUSINESS_CARD_AND_API.md`
3. `docs/VERIFICATION_REQUEST_2026-09-17_CLAUDE_ERP.md`
4. `docs/CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`
5. `docs/CLAUDE_VERIFICATION_2026-09-17.md`
6. `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`
7. `docs/REVIEW_REQUEST_2026-09-17_CLAUDE_CALENDAR_MIGRATION_DESIGN.md`

Claudeの独立再確認は完了し、`docs/CLAUDE_VERIFICATION_2026-09-17.md`に保存済み。石野さんへのメールはまだ送信していない。

カレンダー・Google連携をbp-erp-proへ移す設計案も完成し、`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`に保存した。実装は未着手。Claude向け独立レビュー依頼は`docs/REVIEW_REQUEST_2026-09-17_CLAUDE_CALENDAR_MIGRATION_DESIGN.md`に作成した。

## 今回の目的

`origin/main`から取り込んだ名刺OCR・連絡先管理機能を、コード、隔離テスト、Supabase MCPの読み取り情報から検証した。併せて、2026年9月14日のOAuth/Calendar調査で残っていたAPI境界と、石野さんへの未送信確認事項を整理した。

実装修正、DB更新、DDL、権限変更、Edge Function配備、Vercelデプロイ、本番HTTP到達試験、メール送信は行っていない。秘密値も取得していない。

## Gitと対象

- リポジトリ: `mqdriven`
- 現在のブランチ: `main`
- HEAD: `b7625cbdbe7c559087895a0edc939415239bb5f6`
- 比較元: `4a200e4`
- `main`は`personal/main`と一致
- 取り込み対象は`4a200e4..b7625cb`の46コミット
- 既存の未追跡ファイル`docs/HANDOFF_2026-09-17_BUSINESS_CARD_MERGE.md`は変更していない
- 今回作成した検証文書も未追跡。コミット・pushは未実施

## 名刺機能の検証結果

### 成功した検査

- `npm run typecheck` 成功
- `npm run build` 成功。本番環境変数を使った稼働試験ではない
- 名刺関連既存テストは9成功、1スキップ。実OCRはモック
- 全体テストは60成功、1失敗、1スキップ
- 失敗した`tests/dataServiceUsers.test.ts`は比較元`4a200e4`でも再現し、今回のマージ回帰ではない

### 確認した問題

1. Gemini中継の429と503で想定した再試行が行われない。Supabase SDKのFunctionsHttpErrorにあるHTTP状態を`geminiProxyClient.ts`が捨て、共通メッセージだけを再throwするため、`geminiService.ts`の文字列判定に一致しない。隔離境界テストで429、503とも呼出し1回で終了することを再現した。
2. CSVはUTF-8 BOM、CRLF、引用符エスケープを行うが、数式開始文字の無害化がない。
3. 連絡先取得は1000件ずつ全件を取得してメモリへ蓄積する方式で、表示分だけを取得するサーバーページネーションではない。
4. Google Driveボタンは最終コードでもコメントアウトされている。
5. `office-support`の表示辞書がなく、既存値はコード文字列のまま表示される可能性がある。

### 当初依頼から訂正した点

- OCR空欄は最終的に`null`へ正規化される。全面的な`null`から空文字への変更ではない。
- PDFはcanvas画像へ変換せず、生のbase64 PDFをGemini中継へ渡す。最大4ページ制限は最終コードにない。
- `pdfjs-dist`は依存に残るが、現行OCR経路では使われていない。
- ブラウザは`geminiProxyClient`を使う。クライアントから直接Gemini APIキーを使う方式へ戻った事実は確認していない。

## Supabase MCP確認

### 接続に関する訂正

最初は`list_projects`に対象が表示されなかったためアクセス不能と判断したが、これは誤り。プロジェクトIDを直接指定すると、二つとも`get_project`と読み取りSQLに成功した。

| プロジェクト | ID | 状態 | 役割 |
| --- | --- | --- | --- |
| bp-erp-pro | pkwajxeegidydalcannz | ACTIVE_HEALTHY | 日常運用の本番。過去文書とユーザー確認で確定 |
| bp-erp | rwjhpfghhgstvplmggks | ACTIVE_HEALTHY | 旧環境。新規・日常運用では使わない。残存依存は要確認 |

### 運用先の過去記録

- 2026年7月8日時点ではbp-erpが基幹、bp-erp-proが経営計画書用だった。
- bp-erp-proは2026年6月17日ごろにbp-erpのpublicスキーマを基に作られたと過去調査にある。
- 2026年8月31日の`bp-estimate-ai/docs/seiri-2026-08-31.md`は、MQ ERP `erp.b-p.co.jp`がbp-erp-proを共有DBとして使い、本番稼働・全社利用していると記録している。
- 2026年9月14日の`bp-estimate-ai/CURRENT_STATUS.md`とCRM設計は、bp-erp旧環境を新規運用に使わず、運用をbp-erp-proに統一する前提を確定している。
- Obsidianの`AI-Wiki/wiki/bp-erp-セキュリティ.md`も、7月の用途表は古く、現在はbp-erp-proがMQ ERPの実運用接続先だと訂正済み。
- 従って「どちらが本番か」は未確認事項ではない。旧bp-erpに会計、Storage、Edge Function、cronなどの残存依存があるかが未確認事項。

### bp-erp-proで確認した事項

- `customer_contacts`に名刺管理の追加4列が実在
- 顧客候補検索の二つのRPCが実在し、SECURITY INVOKER
- `gemini-generate`はACTIVE、version 2、`verify_jwt=true`
- `customer_contacts`はRLS有効だが、anonとauthenticatedにSELECT、INSERT、UPDATE、DELETEのACLがあり、各RLS条件も`true`
- 設定上はanonが全行CRUDできるように見える。Data API公開設定と外部到達は未確認で、漏えい・悪用が発生した証拠ではない
- OAuth/Calendar系Edge Function 5本は配備一覧にない
- 掲示板APIが呼ぶ4つのpublic RPCはbp-erp-proで見つからなかった
- `calendar_events`と`user_google_tokens`のACLは9月14日の記録と一致

## 旧bp-erp参照の残存

日常運用がbp-erp-proへ移った後も、リポジトリには旧IDを固定した箇所が残る。少なくとも次を分類する必要がある。

- `deploy_edge_functions.sh`
- `supabase/migrations/20260218150000_enable_cron.sql`
- `components/estimate/PrintEstimateApp.tsx`
- `scripts/check_db_data.js`
- `scripts/seed_data.js`
- 旧引き継ぎ・会計文書

現行依存、歴史資料、廃止可能のどれかは未判定。旧DBを削除したり、参照を一括置換したりしてはいけない。

## Claude独立再確認で判明した重大事項

Claudeが旧bp-erpも照会し、CodexもMCPで再照会した。

- 旧bp-erpにはOAuth/Calendarの主要6関数と`calendar-test`の計7スラッグがACTIVE
- start、callback、calendar-testは`verify_jwt=false`
- status、disconnect、calendar-events、google-calendar-syncは`verify_jwt=true`
- 旧bp-erpの`calendar_events`と`user_google_tokens`ではauthenticatedとservice_roleが全操作可能
- 配備済みcalendar-eventsは本文の`user_id`をJWT由来IDより優先し、service_roleでDB操作
- 配備済みgoogle-calendar-syncも本文の`user_id`を採用し、service_roleで操作

本番フロントはbp-erp-proの単一Supabaseクライアントを使う。そのため現行UIの直接invokeは関数未配備先へ向かい、失敗する構成。ただし旧bp-erpの関数はACTIVEで、現行UIから呼ばれないだけで外部到達不能とはいえない。本番HTTP試験は未実施。

## 作成した確認書

- Claude向け: `docs/VERIFICATION_REQUEST_2026-09-17_CLAUDE_ERP.md`
- 石野さん向け: `docs/CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`

## bp-erp-pro移行設計の記録

社長決定に従い、旧bp-erpの関数を修正する案ではなく、bp-erp-pro上で認証・所有権・データ移行を設計し直した。

成果物:

- 設計書: `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`
- Claudeレビュー依頼: `docs/REVIEW_REQUEST_2026-09-17_CLAUDE_CALENDAR_MIGRATION_DESIGN.md`

設計の主要点:

- 本番UIから早期到達しないよう、新関数は移行中 `-v2` 名とする。
- 通常関数は`verify_jwt=true`に加えて`auth.getUser(token)`でJWTを検証する。
- 所有者は検証済みAuth IDからだけ導出し、本文・クエリの`user_id`を採用しない。
- anon/publishable keyと呼出元JWTを使ってRLSを適用し、service role不使用を第一案とする。
- OAuth callbackだけはGoogle redirectのため`verify_jwt=false`とし、PKCE、認証付き暗号化state、短寿命nonce、単回消費、限定`SECURITY DEFINER` RPCを組み合わせる。
- Google tokenはアプリケーション可視の平文保存をやめ、Edge Function内のAES-256-GCMで暗号化する案とした。
- 既存`public.users.auth_user_id`をAuth IDと社員IDの正規対応に使い、メール一致・先頭社員fallbackを廃止する。
- 社員切替閲覧は「自分のみ」「管理者は全員」「全員」の3案を残し、「自分＋管理者は全員」を推奨案とした。
- mbox取込と全社員向け休暇展開は、通常ユーザーのなりすまし書込みではなく、権限管理された一括処理へ分離する。
- GCP URI併記、本番UI切替、旧7関数停止、旧データ退避、代替ファイル削除までを7段階に分け、各段階のロールバックを記載した。
- 旧関数の停止と、旧コード／データの削除を区別した。標準ロールバックは機能フラグOFFであり、脆弱な旧経路への自動fallbackは禁止した。

### 追加の読み取り確認

2026年9月17日にSupabase MCPでbp-erp-proを集計だけ再照会した。秘密値・個人メール・トークン値は取得していない。

| 項目 | 件数 |
| --- | ---: |
| `auth.users` | 26 |
| `public.users` | 77 |
| `users.auth_user_id`設定済み | 16 |
| 有効なAuth参照 | 11 |
| 不正なAuth参照 | 5 |
| Auth未設定だがメール一意一致する社員候補 | 12 |
| Auth未設定かつメール未一致の社員 | 49 |
| Auth側でID未対応だがメール一意一致する候補 | 14 |
| Auth側の未一致 | 1 |
| `calendar_events` | 380 |
| `user_google_tokens` | 4 |

メール一致は移行候補の抽出だけに使い、自動確定しない設計とした。

また、`public.users`には`authenticated ALL USING (true) WITH CHECK (true)`のRLSポリシーが残っている。`auth_user_id`と`role`を認可の正本にするには、一般ユーザーがこれらを直接変更できないよう、既存社員管理機能の回帰確認を行ったうえで書込み経路を限定する必要がある。この点を設計の移行前ゲートに追加した。

石野さん向け文案では、本番DBがどちらかを再質問しない。確認対象は、旧bp-erpの残存依存、Vercel配備先、サーバーキーの変数名だけ、配備保護、名刺データ権限、OCR本番状態、429/503修正担当、PDFとDriveの意図、既存ラベル、OAuth/Calendar経路、`api/users`公開要件、Git運用である。

## 次の安全な順序

1. Claudeに新しい移行設計を独立レビューさせる。
2. 社長がカレンダー閲覧範囲3案から選択する。
3. 更新済みの石野さん向け文案を確認し、GCP管理者、旧関数の別利用者、旧データ退避、実装担当を確認する。
4. `users.auth_user_id`の不正参照5件と、移行対象社員の未対応を社員台帳と照合する。メール一致だけで自動更新しない。
5. Claude・石野さんのレビュー結果を設計へ反映する。
6. 社長の別承認後に実装へ進む。現時点では実装・配備・DB変更を行わない。
7. 石野さんへのメールは社長の送信指示後に送る。現時点では未送信。

## 禁止事項

- `customer_contacts`の権限を確認なしに変更しない
- service_roleへの切替やGRANT拡大を認証・所有権設計より先に行わない
- 旧bp-erpを不要と決めつけて削除しない
- 本番HTTP到達試験、DB書込み、配備、メール送信を指示なしに行わない
- 秘密値を文書、ログ、会話へ記録しない
