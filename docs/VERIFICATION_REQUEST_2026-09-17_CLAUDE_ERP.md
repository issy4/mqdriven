# Claude向け ERP本番境界と名刺管理機能の再確認依頼 2026年9月17日

> 実施状況: Claudeの独立再確認は完了し、回答は`docs/CLAUDE_VERIFICATION_2026-09-17.md`に保存済み。Codexも旧bp-erpのEdge Function一覧、対象2表のACL、配備済みcalendar-eventsとgoogle-calendar-syncをMCPで再照会し、主要結果が一致した。本書は依頼時点の記録として残し、以下の追記を最新状態とする。

## 完了後の追記

- bp-erp-proにはOAuth/Calendar系関数がない。
- 旧bp-erpには主要6関数と`calendar-test`の計7スラッグがACTIVE。従来の「5関数」という呼称は実数と一致しない。
- 旧bp-erpの`calendar_events`と`user_google_tokens`ではauthenticatedとservice_roleが全操作可能。
- 配備コードは本文の`user_id`を採用し、service_roleで操作する。platformの`verify_jwt=true`と所有者認可は別である。
- 本番はbp-erp-proで、フロントのOAuth/Calendar呼出しは単一Supabaseクライアント経由。そのため現行UIでは関数未配備先へinvokeして失敗する構成。
- 旧関数はACTIVEなので、現行UIから呼ばれないことだけで到達不能な死んだコードとは断定しない。

次に必要なのは追加調査の繰り返しではなく、石野さんへ「旧bp-erpの配備を停止または是正してよいか」「別利用者・cron・外部連携があるか」を確認すること。

- 社長決定（同日）: カレンダー・Google連携は本番UIで動いていない。**bp-erp-proへ移行して設計し直す**（UI撤去ではない）。旧bp-erp到達経路も設計し直し。詳細は`CLAUDE_VERIFICATION_2026-09-17.md`9章、送付文は`CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`10章。

## 目的

Codexが2026年9月17日に実施した、名刺管理機能のコード検証とSupabase MCPによる本番メタデータ確認を独立再検証してください。対象となる二つのSupabaseプロジェクトを混同せず、コード上の問題、DB権限、配備状態、外部到達性を分けて判定してください。

本依頼は読み取り調査です。DB更新、DDL、権限変更、Edge Function配備、Vercelデプロイ、本番HTTP到達試験、メール送信は行わないでください。秘密値も取得・記録しないでください。

## 対象

| 区分 | 名称 | プロジェクトID | 2026年9月17日のMCP確認 |
| --- | --- | --- | --- |
| 日常運用の本番 | bp-erp-pro | pkwajxeegidydalcannz | 過去文書とユーザー確認で確定。ACTIVE_HEALTHY、読み取りSQL成功 |
| 旧環境 | bp-erp | rwjhpfghhgstvplmggks | 新規・日常運用では使わない方針。ACTIVE_HEALTHY、読み取りSQL成功。残存依存は要確認 |

`list_projects`には両方が表示されなかったが、IDを直接指定した`get_project`と`execute_sql`は成功した。一覧非表示だけでアクセス不能と判断しないこと。

## 過去記録で確定している使い分け

1. 2026年7月8日時点では、bp-erpが基幹ERP、bp-erp-proが経営計画書用と記録されていた。bp-erp-proは6月17日ごろにbp-erpのpublicスキーマを基に作られたと調査されている。
2. その後、運用先はbp-erp-proへ移った。`bp-estimate-ai/docs/seiri-2026-08-31.md`は、MQ ERP `erp.b-p.co.jp`がbp-erp-proを共有DBとして使い、本番稼働・全社利用していると記録している。
3. `bp-estimate-ai/CURRENT_STATUS.md`と`docs/CRM_DESIGN_AND_OPERATION_2026-09-14.md`は、bp-erp旧環境を新規リード等の本運用対象にせず、運用をbp-erp-proに統一する前提を確定事項としている。
4. Obsidianの`AI-Wiki/wiki/bp-erp-セキュリティ.md`も、7月8日の用途表は古く、現在はbp-erp-proがMQ ERPの実運用接続先であると9月14日に訂正している。

従って、どちらが日常運用先かは石野さんへの質問事項にしない。未確認なのは、旧bp-erpに残る会計、Storage、Edge Function、cron、スクリプト等の依存を今も利用しているか、廃止できるかである。

コード対象は `mqdriven` の `b7625cbdbe7c559087895a0edc939415239bb5f6`。比較元は `4a200e4`。検証記録は `docs/VERIFICATION_2026-09-17_BUSINESS_CARD_AND_API.md`。

## Codexが確認した事実

### コードと隔離テスト

1. `npm run typecheck` と `npm run build` は成功。本番環境変数を使った稼働試験ではない。
2. 既存テストは60成功、1失敗、1スキップ。失敗した`name_kana`フォールバックは比較元でも再現し、今回のマージ回帰とは判定していない。
3. 名刺OCRの空欄は最終正規化で`null`になる。全面的な`null`から空文字への変更ではない。
4. 現行コードはPDFをcanvas画像へ変換せず、生のbase64 PDFをGemini中継へ渡す。最大4ページ制限も現行コードにはない。`pdfjs-dist`は依存に残るがOCR経路で未使用。
5. Google Driveボタンは最終状態でもコメントアウトされている。
6. `geminiService.ts`の再試行判定はエラー文字列を見るが、`geminiProxyClient.ts`はSupabase SDKのHTTPステータスを捨てる。実際のSDKエラー型を使った境界テストで429と503はいずれも1回で終了した。メッセージに429が残る対照ケースでは再試行した。
7. CSVはUTF-8 BOM、CRLF、引用符エスケープを行うが、数式開始文字を無害化しない。
8. 連絡先取得は1000件単位で全件をメモリに蓄積する。画面表示件数だけを取得するサーバーページネーションではない。

### bp-erp-proのMCP確認

1. `customer_contacts`に`follow_status`、`last_contacted_at`、`next_action_date`、`next_action_note`が存在する。
2. `search_customer_link_candidates`と`find_auto_link_customer_candidate`が存在する。両方ともSECURITY INVOKERで、anon、authenticated、service_roleにEXECUTE権限がある。
3. `gemini-generate`はACTIVE、version 2、`verify_jwt=true`。
4. `customer_contacts`はRLS有効。しかしanonとauthenticatedにSELECT、INSERT、UPDATE、DELETEのACLがあり、対応するRLSポリシーの条件も`true`。設定上はanonが全行を読み書き・削除できる状態に見える。Data API公開設定と外部実到達は未確認であり、漏えい・悪用の発生を示すものではない。
5. `calendar_events`と`user_google_tokens`はanon、authenticatedともSELECTのみ。service_roleは4操作とも権限なし。RLSは有効。
6. Edge Function一覧にOAuth/Calendar系5関数は見つからない。別経路での配備は未確認。
7. `get_user_posts`、`create_post`、`add_comment`、`complete_task`はpublicスキーマの関数一覧に見つからない。

## 再確認してほしい事項

### 最優先

1. bp-erp-proの`customer_contacts`について、ACL、RLSポリシー、Data APIのexposed schemasを再確認し、anonからの全行CRUDが実際に意図された設計か判定する。実HTTP試験は禁止。
2. bp-erpにも同じテーブル、列、関数、ACL、RLSがあるか、読み取りSQLで比較する。差分を表にする。
3. 日常運用はbp-erp-proであるという確定事項を前提に、mqdriven内に残る旧ID参照を棚卸しする。少なくとも`deploy_edge_functions.sh`、`supabase/migrations/20260218150000_enable_cron.sql`、`components/estimate/PrintEstimateApp.tsx`、旧引き継ぎ、補助スクリプトにbp-erpのIDが残る。現行経路か歴史資料かを分類し、誤配備・誤接続の危険を評価する。
4. 配備中の`gemini-generate`のコードを取得できる場合、ローカル`supabase/functions/gemini-generate/index.ts`と一致するか確認する。秘密値は取得しない。

### 名刺機能

5. 429、503の再試行不成立を独立再現し、修正候補とテスト条件を提示する。今回は実装しない。
6. PDFの現行仕様、生PDF送信、ページ数上限なし、未使用`pdfjs-dist`について認識が正しいか確認する。
7. CSV数式注入、大量件数の全件取得、Google Driveボタン無効、`office-support`既存値表示の影響を確認する。
8. `customer_contacts`の新規列と二つのRPCについて、リポジトリの再現可能なmigrationが存在するか再確認する。

### APIと配備境界

9. `api/users.ts`と掲示板API3本は呼出元JWTを検証しない。使用するサーバーキー、Vercel保護、RPC権限を含めて実害可能性を評価する。コード上の認証欠落だけで本番到達可能と断定しない。
10. Vercel、Cloud Run、Express、Edge Functionsのうち、実際に本番トラフィックを受ける経路を整理する。
11. 2026年9月14日のOAuth/Calendar確認事項6件が石野さんへ未送信であるという引き継ぎを確認し、今回の確認メール案と重複なく一本化できるか確認する。

## 期待する回答形式

1. 結論の要約
2. Codex確認との一致点と相違点
3. bp-erp-proとbp-erpの比較表
4. 本番で確認済みの事実
5. 未確認事項と、その確認に必要な担当者または権限
6. 修正候補を緊急、高、中、低で分類
7. 石野さんへ送る質問の追加・削除案

事実、推論、未確認を明確に分け、既存データや本番設定は変更しないでください。
