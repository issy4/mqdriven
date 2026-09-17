# カレンダー・Google連携の bp-erp-pro 移行設計

- 作成日: 2026-09-17
- 対象: MQ ERP (`mqdriven`)
- 移行先: `bp-erp-pro` (`pkwajxeegidydalcannz`)
- 移行元: 旧 `bp-erp` (`rwjhpfghhgstvplmggks`)
- 状態: 設計案。石野さんレビューと社長判断を経て確定する

## 1. 結論

既存7関数をそのまま複製せず、`bp-erp-pro` に `-v2` 名の新関数群を作る。通常の関数は、呼出元JWTを `supabase.auth.getUser(token)` で検証し、anon/publishable key と同じJWTを付けたSupabaseクライアントでRLSを適用する。本文・クエリの `user_id` は所有者決定に使わない。

Google OAuth callbackだけはGoogleからのリダイレクトであり、SupabaseのユーザーJWTを受け取れない。このため `verify_jwt=false` とするが、暗号化・署名した短寿命state、ワンタイムnonce、PKCE、厳格な戻り先allowlistで認証する。DB書込みはservice roleを使わず、用途を限定した `SECURITY DEFINER` RPCでnonce消費と本人トークン保存を1トランザクションにする案を第一案とする。

本番UIは `bp-erp-pro` を向いている一方、同プロジェクトに現行関数名がないため、現在のカレンダー・Google連携は機能しない。切替失敗時も、脆弱性が確認された旧 `bp-erp` へ自動的に戻す設計にはしない。機能フラグをOFFにして安全側へ戻す。

## 2. 設計の前提と確認結果

### 2.1 参照した資料

1. `docs/CLAUDE_VERIFICATION_2026-09-17.md`
2. `../bp-estimate-ai/docs/handoff-2026-09-14-oauth-calendar.md`
3. `docs/HANDOFF_2026-09-04_AI_GATEWAY.md`
4. `docs/architecture/AI_GATEWAY_REDESIGN.md`
5. `CLAUDE.md`
6. `AGENTS.md`

### 2.2 コード・DBの読み取り確認

- `services/supabaseClient.ts` は単一Supabaseクライアントを作り、セッションがない場合にanon keyをBearerへ入れるfallbackがある。
- `services/dataService.ts` は `calendar-events` と `google-calendar-sync` に社員IDを本文で渡す。
- `components/SettingsPage.tsx` と `App.tsx` はOAuth系関数へ社員IDを本文で渡す。
- `App.tsx` はAuth ID不一致時にメール一致、さらに先頭社員へfallbackする。
- `components/MySchedulePage.tsx` は全社員の予定を切替表示し、mbox送信者メールから社員を特定してその社員の予定を作る。
- `services/dataService.ts` の休暇展開は、ブラウザから全社員分を `calendar_events` へ直接INSERTする。
- `bp-erp-pro` の `calendar_events` は380行、`user_google_tokens` は4行ある（2026-09-17の集計値）。データ値は取得していない。
- `public.users` には既に `auth_user_id uuid` と一意インデックス `users_auth_user_id_uniq` がある。新しい対応表は原則不要。
- `public.users` のRLSには `authenticated ALL USING (true) WITH CHECK (true)` が残っている。テーブルACLと組み合わさった場合、`auth_user_id` や `role` の信頼性を壊し得るため、対応列を正本にする前に書込み経路を限定する必要がある。
- 社員77件のうち `auth_user_id` 設定済み16件、有効なAuth参照11件、不正参照5件。未設定のうちメール一意一致候補12件、未一致49件。Auth側26件のうち、ID未対応でメール一意一致候補14件、未一致1件。メール重複は両側とも0件だった。
- `user_google_tokens` は `access_token` と `refresh_token` を平文型の `text` 列に持ち、現行callbackコードはGoogle応答値をそのまま保存する。したがってDBストレージ暗号化とは別に、アプリケーション／DB APIから復号不要で読める「アプリケーション可視の平文」である。秘密値そのものは確認していない。

集計値は移行時点で変わり得るため、実装開始時と本番切替直前に再実行する。

## 3. セキュリティ原則

`public.users.auth_user_id` は現行アプリコードでは未使用であり、今回の移行で新たに正式な識別子として採用する。

1. 通常関数は `verify_jwt=true` とし、関数内でも `auth.getUser(token)` を実行する。`atob` でJWT本文を読む実装は禁止する。
2. 所有者Auth IDは検証済み `user.id` だけから導出する。本文・クエリの `user_id` は受け付けない。
3. DBアクセスは `SUPABASE_ANON_KEY` またはpublishable keyと呼出元JWTを使い、RLSを適用する。
4. `SUPABASE_SERVICE_ROLE_KEY` は第一案では使用しない。`server/server.js` の鍵もservice roleへ変更しない。
5. OAuth callbackはJWTなしでも、署名・暗号化state、PKCE、ワンタイムnonce、期限、redirect allowlistの全条件を満たさなければ処理しない。
6. トークン、認可コード、JWT、state本文、個人メールをログへ出さない。ログはrequest ID、処理種別、結果コード、件数だけにする。
7. 書込みGRANTは、認証処理・所有権検査・RLS・否定系テストが完成した後に適用する。

Supabase公式の推奨どおり、Edge Function内のクライアントに呼出元 `Authorization` を設定してRLSを適用し、`getUser(token)` でユーザーを検証する。callbackのようにAuthorizationを持たない入口だけを例外として個別認証する。

## 4. 新しいEdge Function構成

本番UIから誤って早期到達しないよう、移行中は現行名ではなく `-v2` を使う。旧プロジェクトの7スラッグとの対応は次のとおり。

| 新関数 | `verify_jwt` | 責務 | DB権限・キー |
|---|---:|---|---|
| `google-oauth-start-v2` | true | JWT検証、PKCE生成、短寿命stateとnonce生成、Google認可URL返却 | anon/publishable key＋呼出元JWT。本人のnonce行だけINSERT |
| `google-oauth-callback-v2` | false | state署名・期限・nonce検証、認可コード交換、トークン暗号化、成功／失敗画面へリダイレクト | anon/publishable key。限定RPCだけ実行。service role不使用 |
| `google-oauth-status-v2` | true | 本人の連携有無・期限・scopeだけ返す。トークン更新はしない | anon/publishable key＋呼出元JWT。本人行だけSELECT |
| `google-oauth-disconnect-v2` | true | 本人のGoogle token revokeを試行し、本人の保存トークンを削除 | anon/publishable key＋呼出元JWT。本人行だけDELETE |
| `calendar-events-v2` | true | 予定の一覧・作成・更新・削除。対象範囲はRLSと閲覧方針で決定 | anon/publishable key＋呼出元JWT |
| `google-calendar-sync-v2` | true | 本人の暗号化トークンを復号・refreshし、本人のイベントだけpush/pull | anon/publishable key＋呼出元JWT。暗号鍵はEdge secret |
| `calendar-mbox-import-v1` | true | 管理者専用mbox一括取込。曖昧・未一致はstagingへ記録し予定を作らない | anon/publishable key＋呼出元JWT。限定RPC併用 |
| `calendar-leave-expand-v1` | true | 管理者または人事権限で、承認済み休暇を全社員へ冪等展開 | anon/publishable key＋呼出元JWT。限定RPC併用 |

`calendar-test` は移行しない。検証はローカル／Previewのテストと監視ログで行い、本番に認証回避用関数を残さない。

### 4.1 共通認証処理

全 `verify_jwt=true` 関数は、`gemini-generate` と同じ処理を共有モジュールにする。

```ts
const authorization = req.headers.get('authorization') ?? '';
const token = authorization.replace(/^Bearer\s+/i, '');
if (!token) return json(401, { error: 'Authentication required' });

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false },
});
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return json(401, { error: 'Invalid session' });
const authUserId = user.id;
```

### 4.2 必要な環境変数名

値は設計書・Git・ログへ記録しない。

| 区分 | 環境変数名 | 用途 |
|---|---|---|
| Supabase | `SUPABASE_URL` | bp-erp-pro URL |
| Supabase | `SUPABASE_ANON_KEY` または `SUPABASE_PUBLISHABLE_KEY` | JWT付きRLSクライアント |
| Google | `GOOGLE_CLIENT_ID` | OAuth client |
| Google | `GOOGLE_CLIENT_SECRET` | code交換・refresh |
| Google | `GOOGLE_OAUTH_REDIRECT_URI` | 新callback URI |
| 暗号 | `GOOGLE_TOKEN_ENCRYPTION_KEY_V1` | AES-256-GCMトークン暗号化 |
| state | `GOOGLE_OAUTH_STATE_KEY_V1` | stateの認証付き暗号化／署名 |
| UI戻り先 | `GOOGLE_OAUTH_RETURN_TO_ALLOWLIST` | open redirect防止 |
| CORS | `ERP_ALLOWED_ORIGINS` | 許可するERP origin |
| Frontend | `VITE_CALENDAR_V2_ENABLED` | 本番切替フラグ |

`SUPABASE_SERVICE_ROLE_KEY` は本設計の必須変数に含めない。

## 5. Auth IDと社員IDの対応

### 5.1 採用案

現行アプリコードでは未使用の `public.users.auth_user_id` を、今回の移行で正規の対応列として新たに採用する。

- `users.id`: 業務上の社員ID。既存申請・社員参照との互換性を維持する。
- `users.auth_user_id`: `auth.users.id`。認証主体との1対1対応。
- `calendar_events.user_id`: 移行後はAuth IDを保持する。
- `calendar_events.employee_user_id`: 表示・業務結合用の社員IDを保持する。

`users.auth_user_id` は一意かつ、有効行ではNOT NULL、`auth.users(id)` への参照整合性を持たせる。既存行に不正参照があるため、NOT NULL／FKは監査と補正完了後に段階適用する。

設定済みかつ有効な11件のリンクについても、移行前に人手で再監査する。各リンクを誰が設定したか確認し、Auth IDと社員IDの対応を社員台帳と突合する。設定者または根拠を確認できないリンクや、社員台帳と一致しないリンクは有効とみなさず、管理者確認後に補正する。

また、`users` の既存 `authenticated ALL` ポリシーを残したまま `auth_user_id` を認可判断に使ってはならない。移行前に次を行う。

- `rls_migration_authenticated_all` を削除し、SELECTと書込みを別ポリシーに分離する。
- 一般ユーザーへ `auth_user_id`、`role`、`is_active` の直接UPDATEを許可しない。
- Auth対応の設定・変更は、管理者確認を内蔵した限定RPCだけにする。
- 既存の社員管理画面が更新する列を棚卸しし、安全な列だけcolumn-level GRANTまたは管理者RPCへ移す。
- 変更前後に社員管理、申請、通知、売上担当者選択の回帰試験を行う。

カレンダー用の管理者判定関数は、固定後の `users.auth_user_id` と `users.role` だけを参照する。

ログイン後は次の1件だけを取得する。

```sql
select id, auth_user_id, name, role, is_active
from public.users
where auth_user_id = auth.uid()
  and is_active is true;
```

0件、2件以上、不正参照の場合はログイン済みでもERP利用を拒否し、「社員アカウントとの対応が未設定です。管理者へ連絡してください」と表示する。メール一致や先頭社員へのfallbackは行わない。管理者監査ログへAuth ID、エラー種別、時刻を記録するが、画面や一般ログへ個人情報を過剰に出さない。

### 5.2 移行前に再実行する読み取りSQL

値一覧ではなく件数だけを返す。

```sql
with
a as (
  select id, lower(email) as email
  from auth.users
),
u as (
  select id, auth_user_id, lower(email) as email
  from public.users
),
auth_eval as (
  select
    a.id as auth_id,
    (select count(*) from u where u.auth_user_id = a.id) as by_auth_id,
    (select count(*) from u where u.email = a.email and a.email is not null) as by_email
  from a
),
user_eval as (
  select
    u.id,
    u.auth_user_id,
    exists (select 1 from a where a.id = u.auth_user_id) as valid_link,
    (select count(*) from a where a.email = u.email and u.email is not null) as auth_email_matches
  from u
)
select
  (select count(*) from a) as auth_users_total,
  (select count(*) from u) as employee_users_total,
  (select count(*) from u where auth_user_id is not null) as links_populated,
  (select count(*) from user_eval where auth_user_id is not null and valid_link) as links_valid,
  (select count(*) from user_eval where auth_user_id is not null and not valid_link) as links_dangling,
  (select count(*) from user_eval where auth_user_id is null and auth_email_matches = 1) as email_only_candidates,
  (select count(*) from user_eval where auth_user_id is null and auth_email_matches = 0) as employee_unmatched,
  (select count(*) from auth_eval where by_auth_id = 0 and by_email = 1) as auth_email_candidates,
  (select count(*) from auth_eval where by_auth_id = 0 and by_email = 0) as auth_unmatched;
```

メール一致は移行候補抽出にだけ使い、自動確定しない。石野さんまたは管理者が社員台帳と照合して明示的に `auth_user_id` を設定する。

## 6. DBスキーマ、RLS、ACL

### 6.0 `public.users` 自己アクセスRLSの置換前提

`public.users` の `rls_migration_authenticated_all` を削除する際は、同時に `auth_user_id = auth.uid()` を条件とする自己アクセスポリシーへ置換する。置換は、新規ポリシーの追加または既存の `users_self_select`／`users_self_update`／`users_self_insert` 3ポリシーの条件修正として行う。広域ポリシーだけを先に削除してはならず、この置換完了を6.2節の `calendar_events` 基本RLS着手の前提条件とする。

### 6.1 `calendar_events` の移行方式

既存380行を破壊しないため、直接列の意味を変更せず `calendar_events_v2` を作って移行する。検証後にアプリ参照先をv2へ切替し、安定期間後に名称統合を別migrationで検討する。以下のSQLでは最終名称を `calendar_events` として示すが、初回migrationでは `_v2` を付ける。

```sql
create table public.calendar_events_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_user_id uuid not null references public.users(id),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  source text not null default 'system',
  google_event_id text,
  updated_by_source text not null default 'system',
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at >= start_at),
  unique (user_id, source, source_key)
);

create index calendar_events_v2_user_start_idx
  on public.calendar_events_v2 (user_id, start_at);
create unique index calendar_events_v2_google_owner_idx
  on public.calendar_events_v2 (user_id, google_event_id)
  where google_event_id is not null;
alter table public.calendar_events_v2 enable row level security;
```

既存イベントは `old.user_id -> users.id -> users.auth_user_id` が有効な行だけPreviewへ複写する。未対応行は削除せず、件数・旧イベントID・理由だけを移行例外表へ記録して人手確認する。本番切替条件は、対象社員の未対応0件、重複0件、イベント件数照合一致である。

### 6.2 `calendar_events` 基本RLS

書込みは閲覧方針にかかわらず本人所有行だけに限定する。管理者一括処理はブラウザの通常CRUDではなく、7章の限定RPC／Edge Functionを使う。

```sql
create policy calendar_events_select_own
on public.calendar_events_v2
for select to authenticated
using (user_id = (select auth.uid()));

create policy calendar_events_insert_own
on public.calendar_events_v2
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and employee_user_id = (
    select u.id from public.users u
    where u.auth_user_id = (select auth.uid()) and u.is_active is true
  )
);

create policy calendar_events_update_own
on public.calendar_events_v2
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and employee_user_id = (
    select u.id from public.users u
    where u.auth_user_id = (select auth.uid()) and u.is_active is true
  )
);

create policy calendar_events_delete_own
on public.calendar_events_v2
for delete to authenticated
using (user_id = (select auth.uid()));
```

現行の `calendar_events` にある `authenticated ALL USING (true)` は切替時に必ず削除する。緩い既存ポリシーを残すと、追加した制限ポリシーとOR結合され制限にならない。

### 6.3 社員切替閲覧の選択肢（社長判断）

#### 選択肢A: 自分のみ

基本RLSだけを使う。最小権限で推奨。社員選択UIは廃止する。

#### 選択肢B: 自分＋管理者は全員（推奨）

管理者判定を共通関数へ閉じ込め、一般社員は本人だけ、管理者は全社員を閲覧できる。編集は本人のみのまま。

```sql
create schema if not exists private;

create or replace function private.is_erp_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.auth_user_id = (select auth.uid())
      and u.is_active is true
      and u.role = 'admin'
  );
$$;

revoke all on function private.is_erp_admin() from public, anon;
grant execute on function private.is_erp_admin() to authenticated;

create policy calendar_events_select_admin
on public.calendar_events_v2
for select to authenticated
using ((select private.is_erp_admin()));
```

#### 選択肢C: 認証済み全員が全員分を閲覧

```sql
create policy calendar_events_select_all_staff
on public.calendar_events_v2
for select to authenticated
using (true);
```

予定の件名・説明に機微情報が入る可能性があるため非推奨。採用する場合もINSERT/UPDATE/DELETEは本人だけとする。

### 6.4 `user_google_tokens` の再設計

既存テーブルの平文列をそのまま使わず、暗号化列を持つv2表を新設する。

```sql
create table public.user_google_tokens_v2 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  token_bundle_ciphertext text not null,
  token_bundle_iv text not null,
  key_version smallint not null default 1,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_google_tokens_v2 enable row level security;

create policy google_tokens_select_own
on public.user_google_tokens_v2
for select to authenticated
using (user_id = (select auth.uid()));

create policy google_tokens_delete_own
on public.user_google_tokens_v2
for delete to authenticated
using (user_id = (select auth.uid()));

create policy google_tokens_update_own
on public.user_google_tokens_v2
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
```

暗号方式はEdge Function内のWeb CryptoによるAES-256-GCMとし、鍵は `GOOGLE_TOKEN_ENCRYPTION_KEY_V1` に置く。access tokenとrefresh tokenは一つのJSON bundleとして一回だけ暗号化し、DBにはciphertext、ランダムIV、key versionだけを保存する。同一key/IVで別々の平文を暗号化してはならない。`id_token` は今回のCalendar APIに不要なので保存しない。status APIは暗号化列を返さない。鍵rotationは新versionで再暗号化できる構造にする。

callbackのワンタイム性を担保する補助表も作る。

```sql
create table public.google_oauth_states_v2 (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.google_oauth_states_v2 enable row level security;

create policy google_oauth_states_insert_own
on public.google_oauth_states_v2
for insert to authenticated
with check (user_id = (select auth.uid()));
```

state本体にはAuth JWTを入れず、Auth ID、PKCE verifier、nonce、期限、許可済みreturn URLを認証付き暗号化する。DBにはstate本体ではなくハッシュだけを保存する。一般クライアントにはstate表のSELECT/UPDATE/DELETEをGRANTしない。

OAuth callbackの保存だけは、次の限定RPCで行う。

- 関数名: `public.consume_google_oauth_callback_v2`
- 引数: state nonceのハッシュ、暗号化済みトークン、期限、scope、key version
- 処理: nonceが未使用・期限内であることを確認、nonceの所有者Auth IDを採用、upsert、nonce消費を同一トランザクションで実行
- 禁止: 引数の `user_id` を所有者として採用すること
- 権限: `PUBLIC` からEXECUTEを剥奪し、callbackに必要なロールだけへ付与
- 防御: `SECURITY DEFINER SET search_path=''`、完全修飾名、固定provider、行数1件制限、再利用不可

RPCを匿名実行可能にする点はリスクであるため、推測不能な128bit以上のnonce、5分以内の期限、署名・暗号化state、PKCE、単回消費、rate limitを全て必須にする。レビューでこの案が否決された場合だけ、callback関数内にservice roleを置く第二案を検討する。その場合もcallback専用、state検証後、対象テーブル1行だけ、ログ非出力とし、他関数へservice roleを広げない。

### 6.5 ACL適用順序

1. スキーマ、RLS、限定RPCをmigrationとしてレビューする。
2. 関数認証・所有権検査と否定系テストを完成させる。
3. Previewでanon／他人JWT／本文user_id改ざんが失敗することを確認する。
4. 最後の独立migrationで必要最小限のGRANTを付ける。

```sql
-- 認証・RLSテスト合格後にだけ適用する別migration
grant select, insert, update, delete
  on public.calendar_events_v2 to authenticated;

grant select, delete
  on public.user_google_tokens_v2 to authenticated;

grant update (token_bundle_ciphertext, token_bundle_iv, key_version, expires_at, scope, token_type, updated_at)
  on public.user_google_tokens_v2 to authenticated;

grant insert
  on public.google_oauth_states_v2 to authenticated;
```

callback用限定RPCと管理者一括RPCのEXECUTE権限も個別に列挙し、テーブルへの広いGRANTで代用しない。

### 6.6 migrationファイル案

実装時は次の順で `supabase/migrations/` に追加する。今回ファイルは作らない。

1. `20260917090000_calendar_v2_schema.sql`
2. `20260917091000_calendar_v2_auth_helpers.sql`
3. `20260917091500_users_auth_link_write_lockdown.sql`
4. `20260917092000_calendar_v2_rls.sql`
5. `20260917093000_google_oauth_state_and_token_rpc.sql`
6. `20260917094000_calendar_admin_job_rpc.sql`
7. `20260917095000_calendar_v2_backfill.sql`
8. `20260917100000_calendar_v2_grants_after_auth.sql`
9. `20260917101000_calendar_v2_cutover.sql`

適用済みDBを手作業で変更せず、すべてリポジトリのmigrationと対応させる。

## 7. 壊れる既存機能への回答

### 7.1 社員切替閲覧

6.3のA〜Cを社長判断とする。推奨はB「本人＋管理者は全員」。フロントは閲覧可能社員一覧をサーバーが返す範囲だけ表示し、社員IDを変えてもRLSの範囲を越えられないようにする。選択中の社員IDは閲覧対象にだけ使い、書込み所有者には使わない。

### 7.2 mbox取込

ブラウザで送信者メールを照合して各社員として書く現行方式を廃止する。

1. 管理者だけが `calendar-mbox-import-v1` を実行できる。
2. ファイルサイズ、メッセージ数、MIME、文字コード、処理時間に上限を設ける。
3. 正規化済み送信者メールを `users.email` の一意行へ解決する。
4. 未一致・複数一致・退職者はstagingへ理由付きで保留し、予定を作らない。
5. 予定作成は限定RPCが管理者権限を再確認し、対象社員の `auth_user_id` をDBから導出する。
6. message-idまたは内容ハッシュをsource keyにして再取込を冪等化する。
7. 実行者、対象件数、成功／保留／失敗件数を監査ログへ記録する。

社員になりすまして通常の `calendar-events-v2` を呼ぶことは禁止する。

### 7.3 全社員向け休暇展開

ブラウザからの直接INSERTを廃止し、`calendar-leave-expand-v1` と限定RPCへ移す。

- 実行者は管理者または人事権限を必須とする。
- DB内で承認済み休暇を再確認し、リクエスト本文の申請内容を信用しない。
- 対象は有効かつAuth対応済み社員だけとし、未対応者はエラー報告する。
- `source='approved_leave'` と `source_key='<application-id>:<employee-id>'` の一意制約で冪等化する。
- 一括処理はトランザクション化し、作成・skip・error件数を返す。
- 通常ユーザーに全社員INSERT権限を付与しない。

### 7.4 anon fallback

カレンダー／OAuth用には `getAuthenticatedFunctionHeaders()` を新設し、セッションがなければ例外を返す。anon keyをBearerへ入れない。UIは401／セッションなしを受けたら保存処理を継続せず、再ログイン画面へ誘導する。

既存 `getSupabaseFunctionHeaders()` を直ちに全機能一括変更すると影響範囲が広いため、まずカレンダー専用クライアントを分離し、その後に共通fallbackの廃止を別課題として監査する。

## 8. Google OAuthとトークン管理

### 8.1 認可フロー

1. UIがログイン済みJWTで `google-oauth-start-v2` を呼ぶ。
2. startが `getUser()` で本人確認し、PKCE verifier/challenge、nonce、期限、許可済みreturn URLを生成する。
3. stateは認証付き暗号化を行い、nonceハッシュをDBへ保存する。Auth JWTやaccess tokenをstateへ入れない。
4. Googleは `google-oauth-callback-v2` へ `code` と `state` を返す。
5. callbackはstate、期限、nonce、PKCEを検証し、Google token endpointでcodeを交換する。
6. トークンをAES-GCMで暗号化して限定RPCへ渡す。RPCはstateに結び付いたAuth IDを所有者として保存しnonceを消費する。
7. callbackはallowlist済みERP URLへ成功／失敗コードだけを付けて戻す。token、code、詳細例外をURLへ載せない。

### 8.2 GCPリダイレクトURI変更

新URIは次である。

```text
https://pkwajxeegidydalcannz.supabase.co/functions/v1/google-oauth-callback-v2
```

切替手順:

1. 石野さんからGCPプロジェクト、OAuth client、管理者、同意画面公開状態を確認する。
2. 現行の旧URIを削除せず、新URIをAuthorized redirect URIsへ追加する。
3. GCP反映後、Previewユーザーで新URIの認可・callback・再認可・解除を確認する。
4. 本番UIをv2へ切り替え、監視期間中は両URIを維持する。
5. 旧関数停止とロールバック期間終了後に、別承認で旧URIを削除する。

これによりURI切替時のダウンタイムを避ける。新旧で別OAuth clientを使う場合は、client ID、同意画面、scope、公開状態を個別に検証する。

### 8.3 既存トークンの扱い

既存4行をそのままv2へコピーしない。第一案は全利用者に再認可してもらい、新暗号化形式で保存する。旧refresh tokenの移送は、Google clientが同一であること、データ所有者対応が確定すること、秘密値を安全に移送できることが石野さんレビューで確認された場合だけ別手順を設計する。

## 9. フロントエンド変更箇所

実装内容ではなく変更概要を示す。

| ファイル | 変更概要 |
|---|---|
| `services/dataService.ts` | v2関数名へ変更。通常CRUD・同期から本文 `user_id` を削除。閲覧対象は明示的な `employee_user_id` とし、サーバー許可範囲だけで利用。休暇直接INSERTを管理者関数呼出へ置換 |
| `components/SettingsPage.tsx` | OAuth start/status/disconnectをv2へ変更。本文user_id削除。セッション切れは再ログイン誘導。popup完了通知はoriginを検証 |
| `components/MySchedulePage.tsx` | 閲覧選択肢を社長決定の範囲に限定。書込みは常に本人。mbox処理を管理者一括関数へ移し、ブラウザ内の社員なりすまし保存を廃止 |
| `App.tsx` | `users.auth_user_id` だけで社員を決定。メール一致・先頭ユーザーfallbackを削除。不一致は利用拒否と管理者通知。OAuth v2 statusへ変更 |
| `services/supabaseClient.ts` | カレンダー用の認証必須header取得を追加。セッションなしのanon Bearer fallback禁止。将来的に共通fallback全廃を別監査 |

追加候補として、OAuth／Calendar呼出しを `services/calendarGatewayClient.ts` に集約し、関数名・認証必須・タイムアウト・エラー分類を一元化する。

## 10. 移行手順とロールバック

### 10.0 事前ゲート

- Auth↔社員の集計SQLを再実行し、不正参照5件と対象社員の未対応を解消する。
- 旧／新イベント件数、所有者対応、重複source keyを読み取りで確認する。
- 社長が閲覧方針A〜Cを決める。
- 石野さんがGCP、旧データ退避、運用責任者を回答する。
- Preview検証項目とロールバック責任者を合意する。

### 段階1: bp-erp-proへ新関数を配備（UI未接続）

- `_v2` 表、RLS、限定RPCをmigrationで用意するが、書込みGRANTは最後のmigrationまで付けない。
- `-v2` 関数を配備し、本番UIの `VITE_CALENDAR_V2_ENABLED` はOFFのままにする。
- 認証、所有権、CORS、rate limitの単体・統合テスト後にだけ最小GRANTを適用する。

ロールバック: UI未接続なのでフラグはOFFのまま。v2関数を停止し、追加スキーマは証跡保持のため原則残す。データがない場合だけreview済み逆migrationを検討する。

### 段階2: 検証環境で動作確認

正常系に加え、JWTなし、他人JWT、期限切れJWT、本文user_id改ざん、他人イベントID更新／削除、他人Google event ID、state再利用、期限切れstate、改ざんstate、未許可return URLを確認する。

ロールバック: PreviewフラグをOFFにし、v2関数を停止する。旧環境や本番UIは変更しない。

### 段階3: GCPリダイレクトURIを併記

旧URIを残したまま新callback URIを追加する。

ロールバック: 新URIだけをGCP設定から外す。旧URIと旧関数はこの段階では稼働状態を維持する。

### 段階4: 本番UI切替

本番環境変数でv2フラグをONにし、v2関数名へ切り替える。限定ユーザーから段階展開し、認可成功率、401/403/5xx、同期件数、重複件数を監視する。

ロールバック: フラグをOFFにしてカレンダー・Google連携を停止表示する。脆弱な旧 `bp-erp` へ自動fallbackしない。どうしても旧経路を一時再開する場合は、社長・石野さんの明示承認と期限付き緊急変更として扱う。

### 段階5: 旧bp-erp側7スラッグを停止

ロールバック期間と監視期間が終わった後、次の7関数を「停止」する。

- `google-oauth-start`
- `google-oauth-callback`
- `google-oauth-status`
- `google-oauth-disconnect`
- `calendar-events`
- `google-calendar-sync`
- `calendar-test`

停止と削除は区別する。ここでは履歴・コード・データを削除しない。

ロールバック: 新環境の重大障害で、かつリスク受容が明示された場合だけ旧関数を一時再開する。通常のロールバックは本番機能フラグOFFである。

### 段階6: 旧データを退避

石野さん回答に基づき、旧 `calendar_events` と `user_google_tokens` の保持要否、保存期間、保存場所、アクセス権を決める。Calendar eventは件数・所有者対応を照合して退避する。Google tokenは原則コピーせず、再認可後に旧値を失効・廃棄する計画とする。

ロールバック: 退避物は読み取り専用・暗号化・期限付きで保持し、復元は承認制にする。旧DBの行はこの段階では削除しない。

### 段階7: リポジトリの旧代替ファイル7本を削除

停止・監視・退避完了後、旧関数実装、debug/minimal/final/bypass等の代替ファイルを棚卸しし、対象を明示したPRで削除する。新v2実装とmigrationは残す。

ロールバック: Git revertでコードを復元できる。関数の再配備は別承認とし、コード復元だけで本番を再開しない。

## 11. 検証受入条件

- 全通常関数が有効JWTなしで401になる。
- `auth.getUser()` 失敗時にDBアクセスしない。
- 本文／クエリのuser_idを変えても所有者が変わらない。
- 他人のevent IDを指定した更新・削除が0件または403になる。
- Google由来IDが同じでも、他人行を更新しない複合一意性とfilterがある。
- statusのrefresh更新で必ず本人行だけを更新する。なお本設計ではstatusからrefresh自体を除外する。
- 一般ユーザーが他人予定を書けない。閲覧範囲は社長決定と一致する。
- mbox、休暇展開は権限なしで403、再実行で重複0件となる。
- OAuth state改ざん・再利用・期限切れ・未許可return URLが失敗する。
- DB、レスポンス、URL、ログに平文tokenが出ない。
- 旧経路停止後、フロントコードと環境変数に旧project URLの到達経路がない。
- migration履歴と本番スキーマが一致する。

## 12. 未確認事項と担当者

| 未確認事項 | 判断・確認担当 |
|---|---|
| 社員切替閲覧をA自分のみ／B管理者のみ全員／C全員のどれにするか | 社長 |
| GCPプロジェクト、OAuth client、管理者、同意画面の公開状態 | 石野さん |
| 新旧で同じGoogle OAuth clientを使うか | 石野さん |
| 旧 `calendar_events` の業務上必要な保持範囲と保存期間 | 石野さん、社長 |
| 旧Google tokenを移送せず再認可とする方針の承認 | 石野さん、社長 |
| `users.auth_user_id` の不正参照5件と未対応者の正しい対応 | 石野さんまたは社員台帳管理者 |
| `public.profiles` が現行のAuth ID対応設計とは無関係と判断できる根拠 | 未確認のため保留（石野さん回答待ち） |
| `users` の現行広域RLSを絞る際、社員管理画面が更新を必要とする列 | 石野さん、実装担当 |
| `role='admin'` をカレンダー管理権限として使ってよいか。人事権限を別にするか | 社長、石野さん |
| mbox最大サイズ・保存要否・監査ログ保持期間 | 社長、石野さん |
| OAuth token暗号鍵の保管・rotation責任者 | 石野さん／インフラ管理者 |
| callback用限定RPC案のセキュリティレビュー | 石野さん、実装レビュー担当 |
| 旧7関数を停止できる監視期間と緊急再開承認者 | 社長、石野さん |
| 旧7関数を直接呼ぶ別アプリ、cron、外部連携の有無 | 石野さん |
| Edge Functionの `verify_jwt` 設定・配備手順の正本 | 石野さん |

## 13. 禁止事項

- 本設計書を根拠に、レビュー前に実装・配備・DB／ACL変更・本番HTTP試験を行わない。
- 秘密値を取得、記録、ログ出力、メール添付しない。
- `server/server.js` や通常Edge Functionをservice roleへ切り替えない。
- 認証・所有権検査より先にINSERT/UPDATE/DELETEのGRANTを付けない。
- 旧 `bp-erp` の関数・データを移行完了前に削除しない。
- メール一致や社員一覧の先頭をログインユーザーとして自動採用しない。
- 失敗時に旧プロジェクトへ自動fallbackしない。

## 14. レビュー時の決定事項

実装着手前に、最低限次を決定する。

1. 閲覧範囲は選択肢A〜Cのどれか。
2. 既存イベント380行のうち移行対象と、未対応所有者の扱い。
3. 既存Google token 4行は移送せず再認可とするか。
4. callbackの第一案（限定SECURITY DEFINER RPC）を採用するか。
5. mbox取込と休暇展開の実行権限をadmin／人事のどちらにするか。
6. 旧関数停止までの監視期間と、停止後の緊急対応手順。

以上の決定と石野さんレビューが揃うまでは、設計完了・実装未着手の状態を維持する。

レビュー反映済み（2026-09-17、Claude独立レビュー8章対応）
