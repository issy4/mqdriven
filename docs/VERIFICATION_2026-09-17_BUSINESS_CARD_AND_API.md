# 名刺マージ・API境界 再検証（2026-09-17）

> 接続状況の訂正: 同日、ユーザーのSupabase接続許可後にMCPの get_project へ対象IDを直接指定したところ、bp-erp-pro の取得および execute_sql による読み取りに成功した。list_projects には引き続きtestしか出ない。一覧非表示からアクセス不可とした先の判断は確認不足だった。以下の「本番DB未確認」は初回検証時点の記録であり、末尾の追試を優先する。Vercel側は引き続き未確認。

> 運用先の確認: 過去文書とユーザー確認から、日常運用は bp-erp-pro (`pkwajxeegidydalcannz`) で確定。bp-erp (`rwjhpfghhgstvplmggks`) は新規・日常運用では使わない旧環境。ただし旧側の会計、Storage、Edge Function、cron等に残存依存があるかは未確認であり、単純削除の対象とはしない。

対象: mqdriven `b7625cbdbe7c559087895a0edc939415239bb5f6`。比較元 `4a200e4`。
実装変更・本番リクエスト・DB変更・デプロイ・メール送信は実施していない。
ユーザー作成の `HANDOFF_2026-09-17_BUSINESS_CARD_MERGE.md` は変更していない。

## 実行結果

隔離コピー `C:\Users\shoichi.h\AppData\Local\Temp\mqv3` で実行。
Node v24.15.0 / npm 11.12.1。依存導入は ignore-scripts / omit-optional 後、Windows版Rollupを追加。
通常の本番インストール条件を完全再現したものではない。

| 検査 | 結果 |
| --- | --- |
| npm run typecheck | 成功 |
| npm run build | 成功。ただし本番環境変数なし |
| 既存テスト全体 | 60成功・1失敗・1スキップ |
| 名刺関連の既存3ファイル | 9成功・1スキップ。OCR呼出しはモック |
| 追加OCR境界テスト | 4成功。下記不具合を再現する特性確認テスト |
| 追加API境界テスト | 5成功。認証なしでDB境界まで進むことを確認 |

既存失敗は `tests/dataServiceUsers.test.ts` の name_kana フォールバック。
比較元 `4a200e4` でも同じテストが失敗したため、今回のマージによる回帰とは判定しない。
追加テストは隔離コピーの `tests/businessCardMergeReview.test.ts` と `tests/apiBoundaryReview.test.ts` に保存。
再実行: `node node_modules/vitest/vitest.mjs run tests/businessCardMergeReview.test.ts tests/apiBoundaryReview.test.ts --pool=forks --maxWorkers=1 --reporter=verbose`
追加テスト成功は「安全性が保証された」の意味ではない。問題のある現状を期待値として再現している。

## 名刺機能の確認結果

### 修正候補: 中継API越しの429/503が再試行されない

`services/geminiService.ts:1087` の再試行はエラーメッセージの文字列で判定する。
一方 `services/geminiProxyClient.ts:23` は Supabase SDK のエラーを message のみで再生成する。
SDKの FunctionsHttpError の message は HTTP 429/503 でも共通の `Edge Function returned a non-2xx status code`。
ステータスを保持する context が捨てられるため、対象エラーを判定できない。

実際のOCRサービス・中継クライアント・SDKエラー型を使用し、通信境界だけをモックした。
429/503 とも invoke は1回のみで失敗した。対照として message に429を含めると2秒後の再試行に成功した。
修正方針はHTTPステータスを構造化して保持し、再試行判定に利用すること。今回は未修正。

### 依頼書と最終コードの相違

- 空欄は最終正規化で null になる。モデルの空文字応答を返した追加テストでも email=null を確認。全面的な null→空文字変更ではない。
- PDFは画像変換せず生のbase64を中継する。最大4ページのcanvas変換は最終コードから削除済み。したがって当該canvasメモリ検証は現実装には当てはまらない。
- pdfjs-dist は依存に残るが現行OCRでは使わない。高解像度PDFの実通信・容量限界・OCR精度は未検証。
- Google Driveボタンは `components/BusinessCardUploadSection.tsx:793` 付近でコメントアウトされている。
- ブラウザのOCRは `geminiProxyClient` 経由。クライアントから直接Geminiキーを使う方式に戻ったとは認められない。

### その他の確認・留保

- CSVはUTF-8 BOM、CRLF、全項目の引用符囲みと引用符の二重化がある。数式開始文字の無害化はなく、表計算ソフトで開く際のCSV数式注入対策は修正候補。実際のExcel実行は未検証。
- 連絡先は1000件単位の取得を全件分繰り返してメモリへ蓄積する方式。画面表示分だけを取得するページネーションではない。大量データの実測・クエリプラン検証は未実施。
- 新規の顧客候補検索RPC・follow関連列の作成定義をマイグレーション群で確認できない。配備再現性の懸念であり、本番DBに存在しないと断定しない。
- office-support の表示辞書エントリがなく、既存値はコード文字列のまま表示される。データ消失を確認したものではない。
- lockの変更は278行追加・削除なしで、既存依存バージョンの変更は確認されない。監査結果はlow 3 / moderate 10 / high 20 / critical 2（計35）。pdfjs-dist自体の指摘はなし。今回追加が全脆弱性の原因という意味ではなく、audit fixは未実施。
- OCR応答のconsole出力や汎用AI中継の設計課題は既存部分も含む。新規回帰や外部漏えいの証明と混同しない。
- Edgeのgemini-generateには auth.getUser による検査がある。anon fallback があるだけで未認証利用可能とはいえない。

## 作業順3-2: 残り4本のAPI

対象4本と共有DBクライアントは比較元から差分なし。名刺マージとは別の既存課題。

| 対象 | コード・モックによる確認 |
| --- | --- |
| api/users.ts:39,52 | 呼出元認証なしで users 等のSELECTへ進む |
| api/board/posts.ts:102,140 | GETの user_id、POSTの created_by をRPCに渡す |
| api/board/posts/[id]/comments.ts:47 | 本文 user_id を add_comment に渡す |
| api/board/posts/[id]/complete.ts:46 | 本文 user_id を complete_task に渡す |

認証ヘッダーなしのリクエストを各ハンドラーに与え、DBモック到達と任意の試験用ID転送を5テストで確認。
共有 `api/_lib/supabaseClient.ts` はサーバー設定のキーを使う。呼出元JWTの検証・転送を行わない。

ただし、本番配備・ルーティング・Vercel保護・使用キー・DB ACL・RLS・RPC実装とEXECUTE権限は未確認。
従って「本番で未認証読み書きできる」とは断定しない。3-2はコード/隔離テストまで実施、DB権限を含む総合検証は未完了。

## 本番確認が残る理由と次の安全な順序

接続中のSupabaseアカウントには対象 bp-erp-pro (`pkwajxeegidydalcannz`) が表示されず、見えるVercelチームにもERPプロジェクトがない。
権限・配備情報を再測できていない。以前のACL観測値を現在の保証として流用しない。

1. 石野さんへの6項目（プロジェクト所属、設定キーの有無、配備保護、Express稼働、verify_jwt、社員一覧公開要件）の回答、または対象への読み取りアクセスを得る。
2. 対象テーブルACL/RLSと対象RPCの定義・EXECUTE権限、実際の配備リビジョンを読み取り確認する。
3. 修正する場合は認証・所有権検査・ID対応の設計を先行し、ACLの拡大やservice_roleへの切替を先に行わない。

メール未送信という情報はユーザーが共有したClaudeの確認結果による。今回Gmailを独立再照会したわけではなく、送信もしていない。

## 追試: Supabase MCPからの本番メタデータ確認

対象IDを直接指定し、プロジェクト状態 ACTIVE_HEALTHY を確認。DBの実データや秘密値を取得せず、カタログと配備メタデータのみ照会した。設定変更なし。

- customer_contacts に follow_status / last_contacted_at / next_action_date / next_action_note が実在する。
- 要優先確認: customer_contacts はRLS有効だが、anon/authenticated双方にSELECT/INSERT/UPDATE/DELETEのACLがあり、各操作のRLS条件もtrue。従ってDB権限設定としてはanonロールに全行の読み書き・削除を許す状態。実際のData API公開設定・外部到達試験は未確認/未実施で、外部からの悪用や漏えいが発生したとする証拠ではない。service_roleは4操作すべてACLなし。是正は業務への影響を確認して別途承認を得て行う。
- search_customer_link_candidates / find_auto_link_customer_candidate はpublicに実在。いずれも SECURITY INVOKER。anon/authenticated/service_role のEXECUTE権限あり。参照先の権限と実装まで含む安全性評価は別途必要。
- public の get_user_posts / create_post / add_comment / complete_task はカタログ照会結果に存在しない。このDBを利用する前提では掲示板APIのRPC依存が満たされていない。本番APIの配備先・接続先は未確認なので、現在の画面障害とは断定しない。
- gemini-generate は ACTIVE、version 2、verify_jwt=true。OCR中継の配備自体は確認できた。呼出し成功や配備コードとローカルコードの一致までは確認していない。
- bp-erp-proのEdge一覧は5件で、OAuth/Calendar系は配備されていない。この時点では旧bp-erp側を未照会だったため、両環境を通した評価として不十分だった。末尾の再追試を優先する。
- calendar_events / user_google_tokens のACLは9月14日記録と一致。anon/authenticatedはSELECTのみ、service_roleはSELECT/INSERT/UPDATE/DELETEすべてなし。RLSも確認済み。SELECTのACLがあってもRLSが別途適用される。
- users はservice_roleにSELECTがある。anonにはSELECT ACLがあるが、取得したRLSポリシーはauthenticated向けで、anonから社員一覧が読めるとはいえない。authenticatedにはALL/trueポリシーがあり、self限定ポリシーだけで行制限されている状態ではない。

接続方法は既存Supabase MCP。CLIログイン、キー取得、認証設定の変更は行っていない。

## 再追試 Claude独立確認とCodex再照会

Claudeが`docs/CLAUDE_VERIFICATION_2026-09-17.md`で旧bp-erp側を追加照会し、CodexもSupabase MCPで再照会した。DBや配備の変更、本番HTTP試験はしていない。

- 旧bp-erpには`google-oauth-start`、`google-oauth-callback`、`google-oauth-status`、`google-oauth-disconnect`、`calendar-events`、`google-calendar-sync`、`calendar-test`の7スラッグがACTIVEで配備されている。従来の「5関数」という呼称と実数は一致しない。
- `verify_jwt`はstart、callback、calendar-testがfalse、status、disconnect、calendar-events、google-calendar-syncがtrue。
- 旧bp-erpの`calendar_events`と`user_google_tokens`はauthenticatedとservice_roleがSELECT、INSERT、UPDATE、DELETEすべて可能。service_roleはBYPASSRLS。
- 配備済み`calendar-events`はJWTを関数内で署名検証せずpayloadをdecodeし、本文またはqueryの`user_id`をJWT由来IDより優先して、service_roleクライアントでDB操作する。
- 配備済み`google-calendar-sync`も本文の`user_id`を採用し、service_roleで操作する。platform側は`verify_jwt=true`だが、関数内の所有者検査にはならない。
- 本番接続先はbp-erp-proで確定。AppとdataServiceのOAuth/Calendar呼出しは`services/supabaseClient.ts`の単一クライアントを共用するため、現行本番UIからの直接invokeは関数未配備のbp-erp-proへ向かい、失敗する構成と判断する。
- ただし旧bp-erpの関数URL自体はACTIVEである。現行本番UIから呼ばれないことと、別クライアントや直接呼出しから到達不能であることは同義ではない。

OAuth/Calendarをbp-erp-proへ認証・所有権検査を直して移行するか、現行UIから撤去するかを決める必要がある。旧bp-erpの配備群は利用者と依存先を確認した上で、無効化または是正する。
