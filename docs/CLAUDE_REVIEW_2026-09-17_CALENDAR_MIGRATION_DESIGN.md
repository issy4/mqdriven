# Claude独立レビュー: カレンダー・Google連携 bp-erp-pro移行設計 2026年9月17日

対象: `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`
実装・配備・DB／DDL／ACL変更・GCP／Vercel設定変更・本番HTTP試験・メール送信は行っていない。Supabase MCPは読み取りのみ。個人メール・トークン値・秘密値は取得・記録していない。

## 1. 総合判定: **要修正**

設計の骨格（`auth.getUser`による検証、所有者をJWTから導出、service_role不使用第一案、GRANT付与を認証実装後にする順序）は妥当。しかし、設計が前提とする**Auth ID↔社員IDの対応列`users.auth_user_id`が、現行アプリコードでは一度も参照されていない未使用列**であるという事実を見落としている。これは3章・5章の根幹に関わるため「要修正」とする。実装前にこの一点を解消すれば、残りの設計は概ね採用可能な水準にある。

## 2. Codex確認との一致点・相違点

### 一致（独立照会で同一の値を得た）

| 項目 | 設計書の記載 | Claudeの再照会 |
| --- | --- | --- |
| Authユーザー26、社員77、`auth_user_id`設定16、有効参照11、不正参照5 | 記載どおり | 完全一致（`auth.users`・`public.users`直接照会） |
| `public.users`に`auth_user_id uuid`と一意インデックス`users_auth_user_id_uniq`が既存 | 記載どおり | 完全一致 |
| `calendar_events`に`authenticated ALL USING(true)`が残存 | 記載どおり | 完全一致（9-17検証で既出） |
| `google-oauth-callback`等はJWTを受け取れないため`verify_jwt=false`にせざるを得ない | 妥当 | 同意。callbackはGoogleからの直接リダイレクトでありSupabaseセッションを持たない |

### 相違・追加発見（設計書が触れていない、または誤った前提）

| 項目 | 設計書の記載 | Claudeの発見 |
| --- | --- | --- |
| **`users.auth_user_id`の実利用状況** | 「既存`public.users.auth_user_id`を正本として使う」と、既に機能している対応列であるかのように扱っている | **アプリコード全体（`*.ts*`）を検索したが、`auth_user_id`が出現するのは`types.ts`の型宣言1箇所のみ**。`App.tsx`・`dataService.ts`・その他どこからも読み書きされていない。**現行アプリは`auth_user_id`を一切使っていない未使用列**であり、「既存の対応を正本にする」という表現は実態と異なる |
| **現行のログインユーザー解決ロジック** | 設計書4.1節・7章では触れられているが、実装との対応が薄い | `App.tsx:1070`で実際に行っているのは`usersData.find(user => user.id === supabaseUser.id)`——**`users.id`をAuth UIDと直接比較**している。`auth_user_id`は参照されない。一致しなければメール一致、それも失敗すれば`usersData[0]`（配列先頭）にフォールバックする（既知のバグ、設計書7.4節が前提とする「先頭fallback」はこの箇所） |
| **`users.id === auth.uid()`は現在何件成立するか** | 未確認・未言及 | SQLで直接検証：`public.users`77件中、`id`が`auth.users.id`と一致する行は**0件**。つまり`App.tsx:1070`の第一の照合方法は、現行データに対して**常に失敗する**。ログイン解決は実質的に「メール一致」または「先頭fallback」だけで動いている |
| **`users`テーブルの自己アクセスRLSポリシー** | 言及なし | `pg_policies`照会で判明：`users_self_select`/`users_self_update`/`users_self_insert`という3ポリシーが存在し、条件は`id = auth.uid()`。上記のとおり**現行77件中この条件に一致する行は0件のため、これらのポリシーは現状すべて死んでいる**。`users`への実際のアクセスは、削除予定の`rls_migration_authenticated_all`（ALL/true）だけが機能させている。設計書6.1節で「既存の広域RLSを絞る」と言っているが、絞った後に何が本人アクセスを担保するのか、**`auth_user_id`ベースの新ポリシーをこのタイミングで追加しないと、`users`テーブルへの本人アクセスが完全に失われる**ことが明記されていない |
| **`public.profiles`という別テーブルの存在** | 言及なし | `handle_new_user()`トリガー関数の定義を確認したところ、`public.users`ではなく**`public.profiles`（id, email, full_name, role, department_id等）へINSERTしている**。つまりSupabaseの標準的な「サインアップ時に自動作成される」テーブルは`profiles`であり、`users`ではない。`profiles`は39件あるが、**その`id`も`auth.users.id`と1件も一致しない**（サインアップ後にAuthユーザーが作り直された、または`profiles`自体が別時期の遺物である可能性）。`profiles.id = users.auth_user_id`で一致するのは5件のみ。**`profiles`は現行の識別で使われていない孤立テーブルの可能性が高いが、断定はしない**。設計書はこのテーブルの存在に触れておらず、Auth ID対応の全体像から漏れている |

## 3. bp-erp-proとbp-erpの比較表

今回のレビュー範囲では両プロジェクトの比較は対象外（9-17検証記録の3章で完了済み）。上記の追加発見はすべてbp-erp-pro内の事実。

## 4. 本番で確認済みの事実（一次データ、今回のレビューで新規に確認したもの）

- `public.users`は77列中「id, name, email, employee_number, department_id, position_id, created_at, role, can_use_anything_analysis, auth_user_id, start_date, end_date, user_code, is_active, name_kana, notification_enabled, is_sales_user」の17列を持つ。
- `public.users`の`id`は`auth.users.id`と一致する行が0件（全77件）。
- `public.users.auth_user_id`はアプリコード（`*.ts*`全体）から一切参照されていない（型定義のみ）。
- `handle_new_user()`（SECURITY DEFINER、anon/authenticated実行可）は`public.profiles`へINSERTする。`public.users`は関与しない。
- `public.profiles`は39件、`id`が`auth.users.id`と一致する行は0件。`public.users`と`email`で一致するのは34件。`public.users.auth_user_id`と`profiles.id`で一致するのは5件。
- `public.users`には`users_self_select`/`users_self_update`/`users_self_insert`（条件`id=auth.uid()`）と`rls_migration_authenticated_all`（ALL/true）が併存する。前者3つは現行データに対し実質機能しない。

## 5. 未確認事項と、確認に必要な担当者・権限

| 未確認事項 | 必要な確認者 |
| --- | --- |
| `auth_user_id`の16件（有効11・不正5）は、いつ・どの手段で設定されたか（手動SQL、一回限りのスクリプト、過去の別機能の名残り） | 石野さん、または過去の実装担当者 |
| `public.profiles`は現在何に使われているか（他アプリ、別画面、完全な遺物か） | 石野さん |
| 現行ログイン解決（`App.tsx:1070`）が実運用でどの経路（ID一致／メール一致／先頭fallback）を通っているか、実際の利用実態 | 実機ログまたは石野さん |
| `auth.users`のAuth基盤自体が過去に作り直された（プロジェクト移行・Auth再構築）事実があるか。`id_equals_auth_id=0`の説明になり得る | 石野さん、インフラ管理者 |

## 6. 修正候補の分類

**重大（実装着手前に必ず解消）**
- 設計書3章・5章の記述を「既存の対応を使う」から「未使用列を新規に対応表として採用する」へ訂正し、**11件の有効リンクが本当に正しい対応か再監査する**手順を追加する。手動設定されたものであれば、設定者・設定方法・根拠を確認しないまま「正本」として採用しない。
- `users`テーブルのRLS再設計に、`users_self_select`/`users_self_update`/`users_self_insert`（`id=auth.uid()`）の扱いを明記する。**現状これらは死んでいるため、`rls_migration_authenticated_all`を削除する前に、`auth_user_id=auth.uid()`を条件とする新しい自己アクセスポリシーへ置き換える**（または既存3ポリシーの条件を`auth_user_id`ベースへ修正する）。この手順が抜けると、広域ポリシー削除の瞬間に`users`テーブルが本人からも読めなくなる。
- `public.profiles`の位置づけを石野さんに確認し、カレンダー移行の識別設計と無関係であることを確認してから設計を確定する。無関係でない場合は5章の設計をやり直す必要がある。

**高（設計書の記載通り。妥当）**
- OAuth callbackの限定SECURITY DEFINER RPC案は、PKCE・暗号化state・単回消費nonce・5分期限の組合せとして標準的で妥当。service_role不使用の第一案も支持する。
- `calendar_events_v2`の`user_id`（Auth ID）と`employee_user_id`（社員ID）の分離自体は正しい設計判断。ただし上記の重大指摘が解消されるまで、`employee_user_id`の解決元（`users.auth_user_id`）の信頼性が確定しない。

**中**
- Google token暗号化（AES-256-GCM、bundle化、key version）は妥当。ciphertext本人SELECT可否の判断は据え置きでよい。
- 管理者一括処理（mbox・休暇展開）の分離方針は妥当。`role='admin'`のみで足りるかは社長・石野さんの判断待ちのままでよい。

**低**
- migrationファイル名の連番・分割は妥当。実装時に日付が重複しないよう生成時に採番し直すことを推奨する程度。

## 7. 石野さんへ追加確認する事項

既存の12項目（`CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`）に加え、次を追加することを推奨する。

> `public.users.auth_user_id`（16件設定済み、うち11件が有効なAuthユーザーを指す）は、いつ・どのように設定されたものでしょうか。また`public.profiles`テーブル（39件）は現在どの機能で使われていますか。カレンダー移行のAuth ID対応設計の前提になるため確認したい趣旨です。

## 8. 実装前に設計書へ反映すべき具体的修正

1. 3章冒頭に「`auth_user_id`は現行アプリコードでは未使用であり、今回新たに正式な識別子として採用する」と明記する。「既存の対応を使う」という表現を訂正する。
2. 5.1節に、有効な11件のリンクを人手で再監査する手順（誰が設定したか確認、社員台帳と突合）を追加する。
3. 6.2節（`calendar_events`基本RLS）の前提として、6章冒頭または新設の6.0節に「`public.users`の`rls_migration_authenticated_all`削除と同時に、`auth_user_id=auth.uid()`を条件とする自己アクセスポリシーへの置換（または既存`users_self_*`3ポリシーの条件修正）を行う」ことを移行前提条件として明記する。
4. `public.profiles`について「現行のAuth ID対応設計とは無関係と判断した根拠（石野さん確認済み／未確認のため保留）」を付記する欄を12章の未確認事項表に追加する。

## 9. 変更していないことの確認

- `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`は変更していない。
- migration作成・適用、Edge Function配備・停止・削除、DB／ACL／RLS変更、本番HTTP試験、メール送信は行っていない。
- 今回実行したSQLはすべて`information_schema`・`pg_policies`・`pg_proc`・`pg_indexes`への読み取り照会と、件数集計のみ。個人名・メールアドレス・トークン値は取得・出力していない。
- 旧`bp-erp`を不要と推定した削除・停止提案は行っていない。
