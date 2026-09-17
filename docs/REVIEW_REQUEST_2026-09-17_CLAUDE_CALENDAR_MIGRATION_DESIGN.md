# Claude向け カレンダー・Google連携 bp-erp-pro移行設計の独立レビュー依頼 2026年9月17日

## 目的

Codexが作成した次の設計書を、セキュリティ、Postgres/Supabase、OAuth、移行安全性の観点から独立レビューしてください。

- 対象: `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`
- 移行先: `bp-erp-pro` (`pkwajxeegidydalcannz`)
- 移行元: 旧 `bp-erp` (`rwjhpfghhgstvplmggks`)

本依頼はレビューのみです。実装、ファイル修正、Edge Function配備、DB／DDL／ACL変更、GCP／Vercel設定変更、本番HTTP試験、メール送信は行わないでください。Supabase MCPを使う場合は読み取りだけとし、秘密値、トークン値、個人メールの一覧を取得・記録しないでください。

レビュー結果は新規ファイル `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md` にまとめてください。元の設計書は変更しないでください。

## 前提として読むもの

1. `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`
2. `docs/CLAUDE_VERIFICATION_2026-09-17.md`、特に2章、4章、9章
3. `docs/HANDOFF_2026-09-17_ERP_VERIFICATION_STATUS.md`
4. `../bp-estimate-ai/docs/handoff-2026-09-14-oauth-calendar.md`、特に3章と4章
5. `docs/HANDOFF_2026-09-04_AI_GATEWAY.md`
6. `docs/architecture/AI_GATEWAY_REDESIGN.md`
7. `CLAUDE.md`と`AGENTS.md`

## 確定している方針

- 日常運用・本番接続先はbp-erp-proである。
- 旧bp-erpの既存関数をそのまま修正・複製せず、bp-erp-pro上で設計し直す。
- 本文・クエリの`user_id`を所有者として採用しない。
- 通常関数は`auth.getUser(token)`でJWTを検証し、呼出元JWTとRLSを使う。
- service role不使用を第一案とする。`server/server.js`をservice roleへ変更しない。
- 旧bp-erp側7関数は移行完了後に停止する。停止前に削除しない。
- 現在の本番UIではカレンダー・Google連携は動いていない。

## Codex設計の要約

1. 移行中は `google-oauth-start-v2`、`google-oauth-callback-v2`、`google-oauth-status-v2`、`google-oauth-disconnect-v2`、`calendar-events-v2`、`google-calendar-sync-v2` を使う。
2. 通常関数は `verify_jwt=true` と関数内 `auth.getUser(token)` の二段階で認証する。
3. OAuth callbackはGoogle redirectのため `verify_jwt=false` とし、PKCE、認証付き暗号化state、5分以内のnonce、単回消費、return URL allowlist、rate limitを使う。
4. callbackのDB書込みはservice roleではなく、用途限定の `public.consume_google_oauth_callback_v2` SECURITY DEFINER RPCを第一案とする。
5. Calendar eventの所有者はAuth ID、業務結合は社員IDに分離する。新 `calendar_events_v2` は `user_id=auth.users.id` と `employee_user_id=public.users.id` を持つ。
6. Google tokenは一つのJSON bundleにまとめ、Edge Function内でAES-256-GCM暗号化する。DBにはciphertext、ランダムIV、key versionを保存し、`id_token`は保存しない。
7. Auth IDと社員IDは既存 `public.users.auth_user_id` を正本にし、メール一致・先頭社員fallbackを廃止する。
8. 社員切替閲覧は、A自分のみ、B自分＋管理者は全員、C全員の3案。設計の推奨はB。
9. mbox取込と全社員向け休暇展開は管理者用Edge Function／限定RPCへ分離する。
10. 書込みGRANTは認証・所有権・RLS・否定系テスト完成後の独立migrationで付与する。
11. GCP redirect URIは新旧を一時併記し、UI切替後の標準ロールバックはv2機能フラグOFFとする。旧脆弱経路へ自動fallbackしない。

## Codexが追加確認した集計値

2026年9月17日にbp-erp-proを読み取りSQLで集計した。値一覧や秘密値は取得していない。

| 項目 | 件数 |
| --- | ---: |
| Authユーザー | 26 |
| 社員レコード | 77 |
| `auth_user_id`設定済み | 16 |
| 有効なAuth参照 | 11 |
| 不正参照 | 5 |
| Auth未設定・メール一意一致候補 | 12 |
| Auth未設定・メール未一致社員 | 49 |
| Auth側ID未対応・メール一意一致候補 | 14 |
| Auth側未一致 | 1 |
| 既存`calendar_events` | 380 |
| 既存`user_google_tokens` | 4 |

`public.users`には `auth_user_id` と一意インデックスが既にある。一方、RLSに `authenticated ALL USING (true) WITH CHECK (true)` が残るため、設計では `auth_user_id` と `role` の直接変更を先に封じることを移行条件とした。

## 最優先のレビュー事項

### 1. OAuth callbackの第一案

- JWTのないcallbackから、限定SECURITY DEFINER RPCを呼ぶ構成は妥当か。
- stateにAuth ID、PKCE verifier、nonce、期限、return URLを認証付き暗号化して入れ、DBにはstate hashだけを保存する構成に欠落がないか。
- RPCをPostgRESTから呼ぶためpublic schemaに置き、`PUBLIC`からEXECUTEを剥奪したうえでcallbackに必要なロールへだけ付与する案は成立するか。
- 匿名ロールに限定RPCのEXECUTEを許す場合、nonceをcapabilityとして扱う防御で十分か。service roleを使わずに、より狭く安全な代案があるか。
- nonce確認、token upsert、nonce消費が同一トランザクションになるSQL設計をどう固定すべきか。

### 2. Auth IDと社員ID

- 既存`users.auth_user_id`を新しい対応表より優先する判断は妥当か。
- 不正参照5件がある状態でFK／NOT NULLを段階適用する順序に問題がないか。
- `calendar_events_v2.user_id`をAuth ID、`employee_user_id`を社員IDとする分離は、既存380行の移行とRLSに適しているか。
- `users`の広域RLSを絞る設計が、既存社員管理機能を壊さず認可元を保護できるか。

### 3. RLSとACL

- 設計書のSELECT／INSERT／UPDATE／DELETEポリシーに、permissive policyのOR結合による穴がないか。
- 「本人のみ」「管理者は全員」「全員」の各SELECT案が、書込みを本人だけに保てているか。
- `private.is_erp_admin()` の `SECURITY DEFINER SET search_path=''`、完全修飾名、EXECUTE権限設計が妥当か。
- column-level GRANTを含むtoken更新権限とRLSの組合せに問題がないか。
- 認証実装前に書込みGRANTを付けないmigration順序が実際に守れるか。

### 4. Google token暗号化

- Web Crypto AES-256-GCM、一つのtoken bundle、一回のランダムIV、key versionという構成が適切か。
- ciphertextを本人SELECT可能にする必要があるか。Edge Functionだけが読める、より安全なDB境界をservice roleなしで作れるか。
- refresh時の更新、鍵rotation、Google revoke、再認可、旧4行を移送せず再認可する案を評価してほしい。
- Supabase Vault、DB暗号化、Edge secretのどれを使うべきか。現行のSupabase公式仕様に照らして比較してほしい。

### 5. 管理者一括処理

- mbox取込と休暇展開を管理者用関数へ分離する方針は妥当か。
- 対象社員のAuth ID導出、メール曖昧一致の拒否、冪等source key、監査ログ、トランザクション境界に不足がないか。
- `role='admin'`だけで十分か、カレンダー管理／人事権限を別にすべきかを指摘してほしい。

### 6. 移行とロールバック

- `_v2`表と`-v2`関数を使い、UI未接続配備、Preview、GCP URI併記、本番切替、旧7関数停止、旧データ退避、旧代替ファイル削除の順序に問題がないか。
- UI切替失敗時に旧bp-erpへ戻さず機能フラグOFFとする判断は妥当か。
- 旧Google tokenをコピーせず再認可する第一案が安全か。
- 各段階のロールバックで、DBスキーマやデータの不可逆変更が早すぎないか。

## コードとDBで再照合してほしい箇所

- `services/supabaseClient.ts`
- `services/dataService.ts` のカレンダー、Google同期、全社員休暇展開
- `components/SettingsPage.tsx`
- `components/MySchedulePage.tsx` の社員切替とmbox取込
- `App.tsx` のAuth ID／メール／先頭社員fallback
- `supabase/functions/gemini-generate/index.ts`
- 旧OAuth／Calendar関数のローカルコード
- bp-erp-proの `calendar_events`、`user_google_tokens`、`users` の列、制約、ACL、RLS、索引

DB再照会は集計・メタデータだけにしてください。個人名、メール、Google tokenの値は出力しないでください。

## 期待する回答形式

1. 総合判定: 採用可／要修正／再設計
2. 重大、高、中、低に分けた指摘
3. 指摘ごとの根拠となる設計書の章
4. SQL／RLS／OAuthフローの成立性評価
5. service roleを使わない第一案の成立可否と、必要なら代案
6. 社長が決める事項
7. 石野さんへ追加確認する事項
8. 実装前に設計書へ反映すべき具体的修正
9. 変更していないことの確認

事実、推論、提案、未確認を分けてください。問題がない項目も「確認済み」と明示してください。

## 禁止事項

- 元設計書やコードを変更しない
- migrationを作成・適用しない
- Edge Functionを配備・停止・削除しない
- DB／ACL／RLSを変更しない
- 本番HTTP試験をしない
- メールを送らない
- 秘密値や個人データを取得・記録しない
- 旧bp-erpを不要と推定して停止・削除しない
