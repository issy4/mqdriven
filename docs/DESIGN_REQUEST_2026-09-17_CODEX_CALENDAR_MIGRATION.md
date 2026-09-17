# Codex向け カレンダー・Google連携のbp-erp-pro移行 設計依頼 2026年9月17日

> 実施状況: 設計は完了し、`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`に保存済み。実装・配備・DB／ACL変更・本番HTTP試験・メール送信は未実施。Claude向け独立レビュー依頼は`docs/REVIEW_REQUEST_2026-09-17_CLAUDE_CALENDAR_MIGRATION_DESIGN.md`に作成した。

## 目的

MQ ERP（mqdriven）のカレンダー・Google OAuth連携を、旧`bp-erp`（`rwjhpfghhgstvplmggks`）から`bp-erp-pro`（`pkwajxeegidydalcannz`）へ移行するための**設計案**を作成する。本依頼は設計のみ。実装・配備・DB変更・本番HTTP試験・メール送信は行わない。

社長決定（2026-09-17）：
- 既存関数を直すのではなく、bp-erp-pro上で**設計し直す**
- フロントエンドから旧bp-erpへの到達経路も設計し直す
- 旧bp-erp側の関数群は移行完了後に停止（削除ではなく移行）

## 前提として読むもの（この順）

1. `docs/CLAUDE_VERIFICATION_2026-09-17.md` — 特に2章「相違」、4章、9章
2. `bp-estimate-ai/docs/handoff-2026-09-14-oauth-calendar.md` — 3章「やってはいけないこと」、4章「是正時に壊れるもの」
3. `docs/HANDOFF_2026-09-04_AI_GATEWAY.md` と `docs/architecture/AI_GATEWAY_REDESIGN.md` — Gemini中継で採った認証方式（`gemini-generate`の`auth.getUser`）を踏襲する
4. `CLAUDE.md`（mqdriven）

## 確定している事実

| 事実 | 根拠 |
| --- | --- |
| 本番`VITE_SUPABASE_URL`はbp-erp-pro | 社長確認 |
| フロントは`services/supabaseClient.ts`の単一クライアント経由で`supabase.functions.invoke()`する | `services/dataService.ts:4487-4582`、`components/SettingsPage.tsx:222-340` |
| bp-erp-proにOAuth/Calendar系関数は**配備なし**（Edge Functionは5本のみ） | Supabase MCP `list_edge_functions` |
| 旧bp-erpに7スラッグがACTIVE（`google-oauth-start/callback/status/disconnect`、`calendar-events`、`google-calendar-sync`、`calendar-test`） | 同上 |
| 配備済み`calendar-events`はJWTを`atob`デコードのみ、本文`user_id`をトークンより優先、`SUPABASE_SERVICE_ROLE_KEY`でRLS迂回 | 配備コード取得済み |
| bp-erp-proの`calendar_events`/`user_google_tokens`はanon/authenticated=SELECTのみ、service_role=権限なし。RLS有効 | `has_table_privilege`照会 |
| bp-erp-proの`user_google_tokens`RLSは自分の行のみ（`auth.uid()=user_id`）。`calendar_events`は`authenticated`にALL/trueポリシー | `pg_policies`照会 |
| `gemini-generate`（bp-erp-pro）は`auth.getUser(token)`で認証し、anonキーのクライアントを使う | 配備コード取得済み |
| 本番UIではカレンダー・Google連携は動いていない | 社長確認 |

## 設計に組み込む要件（必須）

### A. 認証と所有権

1. すべてのEdge Functionで、リクエストのJWTを`supabase.auth.getUser(token)`で検証する（`gemini-generate`と同じ方式）。`atob`デコードによる自前の`sub`取得は禁止。
2. 操作対象の`user_id`は**検証済みトークンの`sub`から導出**し、本文・クエリの`user_id`を採用しない。
3. 書込み・削除は所有者検査を通す。09-14 handoff 4章末の3件（`google-oauth-status`のPATCH行フィルタ欠落、`calendar-events`のupsert所有者未検査、`google-calendar-sync`のGoogle由来ID所有者未検査）を設計段階で潰す。
4. service_roleキーは**使わない**方向を第一案とする。RLS前提で`authenticated`ロール＋呼出元トークンをそのまま転送する構成（`gemini-generate`と同じ）を基本にし、service_roleが不可避な処理（Googleトークンのリフレッシュ等）があれば、その処理単位で理由と最小権限を明記する。
5. `server/server.js`の鍵をservice_roleへ切り替える設計は禁止（09-10からの継続禁止事項）。

### B. Auth IDと社員IDの対応

6. 現行`App.tsx:1068-1077`はAuth ID不一致時にメール一致→先頭ユーザーへフォールバックする。移行後は**この曖昧さを残さない**。Auth ID（`auth.users.id`）と社員レコードの対応表をどう持つか（既存の`users`テーブルの列で足りるか、対応表を新設するか）を設計し、不一致時の挙動（拒否／管理者に通知）を決める。
7. 不一致件数は未確認。設計案には「移行前に不一致件数を数えるSQL」を含める（読み取りのみ）。

### C. 壊れる既存機能への設計上の回答（09-14 handoff 4章）

8. **社員切替閲覧**（`MySchedulePage.tsx:957-1019`）：閲覧範囲を「自分のみ／管理者は全員／全員」のどれにするか、社長判断が必要な選択肢として提示する。設計案では選択肢ごとのRLSポリシーを示す。
9. **mbox取込**（`MySchedulePage.tsx:1277-1310`）：送信者メールから社員を特定して保存する処理は、JWT主体固定と衝突する。「取込は管理者権限の一括処理に分離する」等、代替を提示する。
10. **全社員向け休暇展開**（`dataService.ts:2586-2666`）：直接INSERTは現ACLで既に不可。権限管理された一括処理（Edge FunctionまたはRPC）へ移す案を示す。
11. **anon fallback**（`supabaseClient.ts:69-77`）：セッションなし呼出しは失敗させ、再ログインへ誘導する。

### D. DB権限とRLS

12. bp-erp-proの`calendar_events`は`authenticated`にALL/trueポリシーがある。移行後は**行制限ポリシー**（`user_id = auth.uid()`、閲覧範囲の決定に応じた拡張）に置き換える設計を示す。
13. ACLのGRANT付与（INSERT/UPDATE/DELETE）は、**認証・所有権検査の実装が完了した後**に行う順序を設計書に明記する（09-14 handoff 3章）。
14. 必要なmigrationをリポジトリの`supabase/migrations/`で管理する。`customer_contacts`のように本番DBを直接変更してmigrationが無い状態を繰り返さない。

### E. Google側

15. OAuthリダイレクトURIは`https://pkwajxeegidydalcannz.supabase.co/functions/v1/<callback関数名>`へ変更が必要。GCPプロジェクトの所在・管理者は石野さん確認中。設計案には変更手順と切替時のダウンタイム回避（両URIを一時的に併記）を含める。
16. Googleのrefresh tokenを`user_google_tokens`に保存する際の暗号化有無を検討し、現状（平文か）を確認した上で提案する。秘密値は取得しない。

### F. 移行手順と旧環境の停止

17. 段階：(1) bp-erp-proへ新関数を配備（本番UIからはまだ呼ばない）→ (2) 検証環境で動作確認 → (3) GCPリダイレクトURI併記 → (4) 本番UI切替 → (5) 旧bp-erp側7スラッグ停止 → (6) 旧`calendar_events`/`user_google_tokens`のデータ退避（要否は石野さん回答待ち）→ (7) リポジトリの`calendar-events`代替ファイル7本削除。
18. 各段階のロールバック手順を書く。

## 成果物

`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md` として以下を含める：

1. 新しいEdge Function構成（関数名、責務、認証方式、使用するキー、必要な環境変数名。値は書かない）
2. `calendar_events`/`user_google_tokens`のRLSポリシー案（SQL）とmigrationファイル案
3. Auth ID↔社員ID対応の設計と、不一致件数を数える読み取りSQL
4. 要件C（8〜11）の各機能についての設計上の回答。社長判断が必要な選択肢は選択肢として明示する
5. GCPリダイレクトURI変更手順
6. 移行手順（要件F）とロールバック手順
7. フロントエンド側の変更箇所一覧（`dataService.ts`、`SettingsPage.tsx`、`MySchedulePage.tsx`、`App.tsx`、`supabaseClient.ts`）。変更内容の概要のみ、実装はしない
8. 設計上「未確認」として残る事項と、確認に必要な担当者

## やってはいけないこと

- 実装・配備・DB変更・ACL変更・本番HTTP試験・メール送信
- 秘密値の取得・記録（環境変数は名前のみ）
- `server/server.js`の鍵をservice_roleへ切り替える設計
- ACLのGRANTを認証実装より先に行う手順
- 旧bp-erp側の関数・データの削除（設計書に「停止」と「削除」を区別して書く）

## 補足

- Codex MCP経由の長時間タスクは1800秒でタイムアウトする。本依頼書は手元のCodexへ直接投入する。
- 設計案は石野さんレビューを前提とする。石野さんへの確認事項は`docs/CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`10章にあり、回答が届く前でも設計は進められる（回答に依存する箇所は「石野さん回答待ち」と明記する）。
