# Claude独立再検証 2026年9月17日

> Codex再照会追記: 旧bp-erpのEdge Function一覧、`calendar_events`と`user_google_tokens`のACL、配備済み`calendar-events`と`google-calendar-sync`をSupabase MCPで再照会し、Claudeの主要発見と一致した。関数数は、本文で「5関数」と呼んでいる箇所に対して列挙実数が7スラッグあるため、以後は「主要6関数＋calendar-test」と記載する。本番接続先はユーザー確認と過去記録によりbp-erp-proで確定。

対象: `VERIFICATION_REQUEST_2026-09-17_CLAUDE_ERP.md` への回答。Codexの `VERIFICATION_2026-09-17_BUSINESS_CARD_AND_API.md` を独立再検証した。
mqdriven `b7625cbdbe7c559087895a0edc939415239bb5f6`。DB更新・DDL・権限変更・配備・本番HTTP到達試験・メール送信・秘密値取得は行っていない。

## 1. 結論の要約

- Codexが確認したDB権限（`customer_contacts`の全ロール全操作オープン、`calendar_events`/`user_google_tokens`のACL）は、Supabase MCPで独立に再照会し**完全に一致**した。
- ただし、Codexの検証には**重大な見落としがある**。OAuth/Calendar系の主要6関数と`calendar-test`の計7スラッグは「bp-erp-proのEdge Function一覧に無い」ため`verify_jwt`実値が「取得できない」とされていたが、これは**bp-erp-pro側しか調べていなかった**ため。**旧`bp-erp`（`rwjhpfghhgstvplmggks`）側に実際に配備され、ACTIVE状態**である。配備コードも取得し、認証・所有者検査の欠落を実装レベルで直接確認した。
- 本番`VITE_SUPABASE_URL`はbp-erp-proで確定し、OAuth/Calendarの5つの直接呼出しは共通クライアントを使う。従って現行UIは関数未配備先へinvokeして失敗する構成である。一方、旧bp-erpの7スラッグ自体はACTIVEなので、現行UIから呼ばれないことだけで到達不能な死んだコードとは断定しない。

## 2. Codex確認との一致点・相違点

### 一致（独立再照会で同一の値を得た）

| 項目 | Codexの記録 | Claudeの再照会 |
| --- | --- | --- |
| `customer_contacts` ACL | anon/authenticated: SELECT/INSERT/UPDATE/DELETE=true、service_role=なし | 完全一致 |
| `customer_contacts` RLSポリシー | 4ポリシーとも `qual=true`, roles={anon,authenticated} | 完全一致 |
| `calendar_events`(bp-erp-pro) ACL | anon/authenticated=SELECTのみ、service_role=なし | 完全一致 |
| `user_google_tokens`(bp-erp-pro) ACL | anon/authenticated=SELECTのみ、service_role=なし | 完全一致。RLSポリシーは自分の行のみ（`auth.uid()=user_id`） |
| `search_customer_link_candidates`/`find_auto_link_customer_candidate` | SECURITY INVOKER、anon/authenticated/service_role実行可 | 完全一致（`prosecdef=false`で確認） |
| `gemini-generate` | ACTIVE, version 2, verify_jwt=true | 完全一致。**配備コード取得済み**：`supabase.auth.getUser(token)`で認証検査を実装しており、未認証リクエストは401。Codexの「anon fallbackがあるだけで未認証利用可能とはいえない」は**正しい**（実装を見ても認証は機能している） |
| `office-support`辞書欠落 | 表示辞書に無い | `components/sales/LeadManagementPage.tsx:26`で`secretariat`のみ定義、`office-support`のエントリなしを確認 |
| customer_contactsの新規列・RPCがmigrationにない | 配備再現性の懸念 | `list_migrations`で26件確認したが該当する列追加・RPC作成のmigrationは無い。**DBが直接手動変更されており、リポジトリのmigration履歴と乖離**している |

### 相違（Codexの記録を修正・補完する点）

| 項目 | Codexの記録 | Claudeの発見 |
| --- | --- | --- |
| OAuth/Calendar系7スラッグの配備 | 「bp-erp-proの一覧にない」→ `verify_jwt`実値は取得できない、と結論 | **bp-erp-pro側しか照会していない誤り**。旧`bp-erp`側では7スラッグすべて`ACTIVE`：`google-oauth-start`(verify_jwt=false)、`google-oauth-callback`(false)、`google-oauth-status`(true)、`google-oauth-disconnect`(true)、`calendar-events`(true)、`google-calendar-sync`(true)、`calendar-test`(false)。加えて`calendar-events`には`index_debug/index_final/index_final_bypass/index_temp/index_working/index_minimal/index_test`という未整理の代替ファイル7本がリポジトリに残る |
| `calendar-events`のコード内容 | ローカルファイルの記述を根拠に判定 | **配備済みコードを直接取得**し、ローカルと同一（`entrypoint_path`が`/Users/djish/Documents/GitHub/mqdriven/supabase/functions/calendar-events/index.ts`）であることを確認。`getUserIdFromToken`はJWTを`atob`でデコードするだけで署名検証なし。`targetUserId`は本文の`user_id`/クエリの`user_id`をJWT由来より優先。`SUPABASE_SERVICE_ROLE_KEY`でクライアントを作るため**RLSを完全にバイパス**する。09-14handoffの記述は配備済みコードでも正確だったことを確認 |
| bp-erp側`calendar_events`/`user_google_tokens`のACL | 未照会 | **新規確認**：旧bp-erpでは`calendar_events`と`user_google_tokens`ともに`authenticated`と`service_role`が**INSERT/UPDATE/DELETEを含む全権限を保持**（bp-erp-proとは全く異なる権限構成）。`service_role`が全権限を持つ状態で、かつ`calendar-events`関数のコードがservice_roleキーを使い所有者検査をしていないため、**このコードが実際に到達可能なら書込み・削除まで到達する**（09-14handoffの「service_role にGRANTが無いので書き込みは通らない」という安全側の結論は、**bp-erp-proの権限だけを見た場合の話であり、bp-erpには当てはまらない**） |
| bp-erpに`customer_contacts`テーブル | 未照会 | SQLで確認：**bp-erpには`customer_contacts`テーブル自体が存在しない**。名刺機能はbp-erp-pro専用の新機能 |
| list_projectsに両プロジェクトが出ない | Codexは「表示されない」と記録 | Claude側の`list_projects`では**bp-erp-pro・bp-erpとも一覧に表示された**（アカウント権限・セッションの違いによる可能性。断定しない） |

## 3. bp-erp-proとbp-erpの比較表

| 項目 | bp-erp-pro (`pkwajxeegidydalcannz`) | bp-erp (`rwjhpfghhgstvplmggks`) |
| --- | --- | --- |
| 状態 | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| `customer_contacts`テーブル | 存在（anon/authenticated全権限オープン、service_role権限なし） | 存在しない |
| `calendar_events` ACL | anon/authenticated=SELECTのみ、service_role=なし | anon=なし、authenticated=全権限、service_role=全権限 |
| `user_google_tokens` ACL | anon/authenticated=SELECTのみ、service_role=なし | anon=なし、authenticated=全権限、service_role=全権限 |
| OAuth/Calendar Edge Functions（主要6関数＋calendar-testの7スラッグ） | **配備なし** | **配備あり・ACTIVE**（verify_jwtはfalse/true混在） |
| `gemini-generate` | 配備あり・ACTIVE・verify_jwt=true・認証実装確認済み | 配備なし（代わりに`gemini-proxy`, verify_jwt=false が配備） |
| Edge Function総数 | 5（本番運用向けのみ） | 34（本番運用向けに加え、`rag_search_*`/`embed_rebuild_*`/`*_test`/`*_debug`等の実験・テスト関数が多数残存） |
| SECURITY DEFINER関数（anon実行可） | 28件 | 18件（journal/estimate関連が中心） |
| migration管理 | 26件記録（直近は2026-08-26） | 未照会（今回は対象外） |

## 4. 本番で確認済みの事実（一次データ）

- `customer_contacts`：RLS有効だが、ACL・RLSポリシーともに`anon`ロールへ全4操作（SELECT/INSERT/UPDATE/DELETE）を許可する設定。Data API公開設定・外部到達性は未確認。
- `gemini-generate`（bp-erp-pro）：配備コードに`auth.getUser`によるトークン検証があり、未認証リクエストは401で拒否される実装。
- `calendar-events`（bp-erp）：配備コードにJWT署名検証なし、本文の`user_id`がトークンより優先、service_roleキー使用でRLSバイパス。`verify_jwt=true`はSupabaseプラットフォーム側の「有効な署名のJWTが必要」という検査であり、匿名キー自体もJWTであるため、実ユーザーの認証を保証するものではない（署名検証はプラットフォームが行うが、「誰の」トークンかは検査していない）。
- bp-erpには本番運用に無関係と思われる実験用Edge Functionが29本（`rag_search_*`, `embed_rebuild_*`, `*_test`, `*_debug`等）残存し、ほぼ全て`verify_jwt=false`。
- `search_customer_link_candidates`/`find_auto_link_customer_candidate`はSECURITY INVOKERで、呼び出し元の権限（=RLS適用後の`customer_contacts`）に依存する。`customer_contacts`が全ロールオープンである以上、この2関数を経由しても追加のリスクは増えない（両方とも同じ露出面に依存）。

## 5. 未確認事項と、確認に必要な担当者・権限

| 未確認事項 | 必要な確認者・権限 |
| --- | --- |
| 本番UIでOAuth/Calendar機能が表示されるか、実操作時にどのエラーになるか | 石野さん、または許可された実機確認 |
| 旧bp-erpのOAuth/Calendar系7スラッグのうち実際にトラフィックを受けるものがあるか | 石野さん、またはFunction invocationログを見られる権限者 |
| `customer_contacts`のData API exposed schemas設定・実際のHTTP到達性 | 本番相当環境での許可された到達試験（現時点では未実施・未承認） |
| bp-erp側の会計・Storage・cron・外部連携の現役利用有無 | 石野さん |
| `calendar-events`の7本の代替ファイル（`index_debug`等）がどれか1本でも別途配備されていないか | Supabase側の配備履歴を持つ担当者 |

## 6. 修正候補の分類

**緊急**
- なし（DB権限・コード上の欠陥は存在するが、実HTTP到達性が未確認のため「今すぐ悪用されている」と断定できる材料はない。ただし7章の質問への回答次第で緊急に格上げされ得る）

**高**
- `customer_contacts`のACL/RLSをanonから外す（意図した設計でない場合）
- OAuth/Calendar機能をbp-erp-pro上で再設計・再実装する（9章の社長決定。旧bp-erp配備分への認証追加は**取り下げ**）
- 移行完了後、旧bp-erp側の7スラッグを停止し、`calendar-events`の未整理な代替ファイル7本を削除する（データ退避の要否は石野さん確認後）

**中**
- `geminiService.ts`/`geminiProxyClient.ts`間のHTTPステータス欠落によるリトライ不成立の修正
- CSV数式インジェクション対策（先頭が`=,+,-,@`の値のエスケープ）
- `customer_contacts`の新規列・RPCのmigration追補（DBとリポジトリの整合）

**低**
- `office-support`表示辞書への追記（後方互換表示）
- 連絡先一覧の全件取得をページネーション化

## 7. 石野さんへ送る質問の追加・削除案

> 2026-09-17追記: 本章と8章の質問案は、9章の社長決定（移行）により**確定済み**となった。実際の送付文は`CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`10章を正とする。以下は経緯の記録として残す。

**追加すべき質問（最優先）**

> OAuth/Calendar機能は現在利用対象でしょうか。利用する場合はbp-erp-proへ認証・所有権検査を直して移行しますか。利用しない場合は現行UIを無効化し、旧bp-erpのACTIVEな7スラッグを停止または削除してよいでしょうか。旧関数を利用する別アプリ、cron、外部連携があれば教えてください。

理由：本番接続先はbp-erp-proで確定し、現行UIの直接invokeは関数未配備先へ向かう。残る判断は、安全に移行するかUIを撤去するか、旧配備に別の利用者がいるかである。

**修正すべき既存質問**

- 1章（旧bp-erp依存の棚卸し）に「カレンダー・Google連携機能」を明示的に追加する。現状は「会計、Storage、Edge Function、cron、外部連携」という一般的な聞き方で、カレンダー機能がbp-erp側で動いている可能性を石野さんが読み落とす恐れがある。

**削除・統合の必要なし**

- 5章（customer_contactsの権限）、6章（gemini-generate稼働状況）、9章（office-support）はそのまま有効。

---

## 8. 追記（2026-09-17、社長回答後）

社長より「本番`VITE_SUPABASE_URL`は`bp-erp-pro`」と回答があった。これを踏まえてコードを確認した。

### 事実（コード確認済み）

- `services/dataService.ts`・`components/SettingsPage.tsx`はいずれも`services/supabaseClient.ts`の**単一の共有クライアント**（`getSupabase()`）を使う。
- `calendar-events`（3箇所）・`google-calendar-sync`（2箇所）・`google-oauth-status/start/disconnect`（`SettingsPage.tsx`）は、すべてこの共有クライアントの`supabase.functions.invoke(name, ...)`で呼ばれている。**個別に別プロジェクトのURLを組み立てている箇所はない**（`rwjhpfghhgstvplmggks`のハードコードはコード中1箇所のみで、`PrintEstimateApp.tsx:245`の日本語コメント内。これは実装担当者への申し送りコメントであり実行コードではない）。

### 推論（コードからの論理的帰結。実HTTP試験はしていない）

- 本番の`VITE_SUPABASE_URL`が`bp-erp-pro`である以上、`supabase.functions.invoke('calendar-events')`等はbp-erp-pro宛てに送られる。**bp-erp-proには直接呼び出す5関数が配備されていない**ため、本番UIからの呼び出しは失敗し、カレンダー機能・Google連携設定は現状使えない可能性が高い。
- 一方、bp-erp（旧）側のOAuth/Calendar系7スラッグは`ACTIVE`のまま存在する。本番UIからは呼ばれなくても、別クライアントや直接呼出しの可能性は残る。verify_jwt設定はfalse/trueが混在し、認証・所有権検査欠落とservice_roleによるRLSバイパスの問題は解消されていない。

### 未確認（断定しない）

- 本番UIで実際にカレンダー機能やGoogle連携設定を開いたときに何が起きるか（エラー表示か、機能自体が非表示か）は実機確認が必要。憶測で「壊れている」と断定しない。
- bp-erp側の匿名キー・古いバージョンのフロントエンドビルドが今も外部から入手可能かどうかは未確認。

### 石野さんへの質問の再修正

7章で提案した質問は維持しつつ、以下を追記することを提案する。

> カレンダー機能・Google連携設定（設定画面）は、現在の本番UIで正常に動作していますか。利用しない場合、旧bp-erp側に残るOAuth/Calendar系7スラッグと`calendar-events`の代替ファイル7本は停止または整理してよいでしょうか。利用する場合はbp-erp-proへ安全に移行しますか。

理由：本番がbp-erp-proを見ている以上、これらの関数は現行UIからは実質的に呼ばれない可能性が高い。使われていないなら「認証を直す」より先に「エンドポイントごと止める」ほうが安全かつ低コスト。使われているなら、フロントエンドがどうbp-erpに到達しているのか別途調査が必要（現時点のコード読解では経路が見つからない）。

## 9. 社長決定（2026-09-17）

8章の推論に対し、社長から次の回答があった。以後の作業はこれを前提とする。

| 確認事項 | 社長回答 |
| --- | --- |
| カレンダー機能・Google連携設定は本番UIで動いているか | **動いていない** |
| 旧bp-erp側の関数群・代替ファイル7本を削除してよいか | **bp-erp-proに移行したい**（削除ではなく移行） |
| フロントエンドが旧bp-erpに到達する経路 | **これも設計し直し** |

### この決定が意味すること

- 8章の推論（本番からの呼び出しは失敗しているはず）は社長の実機認識と一致した。
- 09-14handoffの「作業順3-2/3-3」は「既存のOAuth/Calendar関数に認証を足す」前提だったが、**その前提は無効**になった。既存関数を直す作業は行わず、bp-erp-pro上での再設計・再実装に置き換える。
- 6章の修正候補「高：`calendar-events`（bp-erp配備分）の所有権検査追加」は**取り下げ**、代わりに「bp-erp-proへの移行設計」を高に置く。旧bp-erp側の関数は移行完了後に停止する（データ退避の要否は石野さんに確認中）。
- 再設計で最初から組み込むべき要件は09-14handoffの4章（Auth IDと社員IDの不一致、社員切替閲覧、mbox取込、休暇展開、anon fallback）と同章末の所有権検査3件。これらは新設計の要件一覧としてそのまま流用できる。

### 次のアクション

1. 石野さんへ確認メール送付（`CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md` 10章を決定反映済み）。送信は社長の指示があった場合のみ。
2. 回答を待つ間に、bp-erp-pro向けカレンダー・Google連携の設計案を作成する（認証・所有権・ID対応を先に決め、Edge Functionの新規作成とGCP側リダイレクトURI変更を含む）。実装・配備は設計レビュー後。
3. `customer_contacts`のanon全権限（5章）は移行とは独立した課題として残る。こちらは石野さんの回答待ち。

---

事実・推論・未確認は上記の通り区別した。3章以降の表・箇条書きの一次データ（ACL・RLS・配備コード）はすべて2026-09-17時点のSupabase MCP照会結果であり、本番の実HTTPアクセス試験・DB変更・配備変更は行っていない。
