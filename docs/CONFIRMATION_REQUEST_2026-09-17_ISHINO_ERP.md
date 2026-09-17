# 石野さんへのERP本番環境と名刺管理機能の確認依頼 2026年9月17日

## メール件名

【確認依頼】ERP本番環境と名刺管理機能の配備および権限設定について

## 送信文案

石野さん

お疲れさまです。

ERPの名刺OCR・連絡先管理機能を会社PC側へ取り込み、コード検証とSupabaseの設定確認を行いました。実装変更や本番設定の変更はしていません。

本番環境の経路と意図を誤って判断しないため、以下をご確認ください。秘密鍵や環境変数の値そのものは不要です。設定の有無、利用先、意図だけご回答ください。

### 1 旧bp-erpに残る依存

Supabase MCPでは、次の二つのプロジェクトがどちらも稼働中でした。

- `bp-erp-pro` ID `pkwajxeegidydalcannz`
- `bp-erp` ID `rwjhpfghhgstvplmggks`

過去の引き継ぎと運用記録から、現在の日常運用先は`bp-erp-pro`、`bp-erp`は新規・日常運用では使わない旧環境であることを確認済みです。

一方、mqdrivenには旧IDを参照するEdge Function配備スクリプト、cron migration、補助スクリプト、旧引き継ぎが残っています。また、7月時点の記録では旧bp-erp側に会計機能やStorage上のファイルが残っていました。

現在も旧bp-erpに依存する会計、Storage、Edge Function、cron、外部連携はありますか。残っている場合は機能名だけ教えてください。依存がない参照は、誤配備防止のため更新または廃止してよいでしょうか。

回答：

### 2 Vercelの配備先

`erp.b-p.co.jp`のVercelプロジェクト名、所属アカウントまたはチーム、Root Directoryを教えてください。こちらで参照できたVercelチームの一覧には該当プロジェクトが見つかりませんでした。

回答：

### 3 本番環境変数

本番Vercelプロジェクトに、次のいずれが設定されているかを教えてください。値は不要です。

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

また、実際にサーバーAPIが使用する変数名も教えてください。

回答：

### 4 配備保護と別サーバー経路

Vercel Authentication、パスワード保護、Trusted IPなどのデプロイ保護は設定されていますか。

また、`server/server.js`をCloud Runなどで現在稼働させていますか。稼働中の場合はURL、公開範囲、Vercelとの役割分担を教えてください。

回答：

### 5 名刺管理データの権限設定

`bp-erp-pro`の`customer_contacts`はRLSが有効ですが、MCPで確認した現在のACLとRLSポリシーでは、未ログイン用のanonロールにも全行のSELECT、INSERT、UPDATE、DELETEを許す構成に見えます。

これは意図した設定でしょうか。Data APIの公開対象から外している、または別の入口で保護している場合は、その保護方法を教えてください。

外部からアクセス可能だった、または情報漏えいが発生したと断定しているものではありません。設定の意図を確認したい趣旨です。

回答：

### 6 名刺OCRの本番状態

名刺OCR・連絡先管理機能は、現在`erp.b-p.co.jp`の本番で利用中でしょうか。それともプレビューまたはテスト段階でしょうか。

Supabase側では`gemini-generate`がACTIVE、version 2、`verify_jwt=true`であることを確認しました。Vercel側の配備コードとの対応関係も分かれば教えてください。

回答：

### 7 OCRリトライ処理

現行コードでは、Gemini中継が429または503を返してもSupabase SDKのエラー変換時にHTTPステータスが失われ、想定した2秒、5秒、10秒の再試行が行われないことを隔離テストで再現しました。

こちらで修正案を作成してよいでしょうか。それとも石野さん側で対応予定でしょうか。

回答：

### 8 PDF処理とGoogle Drive

最終コードではPDFを画像へ変換せず、生のPDFをGemini中継へ送っています。最大4ページ制限もなく、`pdfjs-dist`は依存に残っていますがOCR経路では使われていません。この最終仕様は意図どおりでしょうか。

また、Google Driveボタンは最終状態でもコメントアウトされています。意図的に無効のままでしょうか。再有効化の予定があれば教えてください。

回答：

### 9 既存データとラベル変更

`office-support`を`secretariat`へ整理した変更について、過去の`office-support`レコードを移行する必要はないでしょうか。現行表示辞書に`office-support`がないため、既存値はコード文字列のまま表示される可能性があります。

回答：

### 10 OAuth Calendarと社員一覧API

カレンダー・Google連携について、調査で分かったことと、社長が決めた方針をまとめます。

**分かったこと（本番の接続先と関数の配備先がずれています）**

| 項目 | 状況 |
| --- | --- |
| 本番`erp.b-p.co.jp`のSupabase接続先 | `bp-erp-pro`（`pkwajxeegidydalcannz`）（社長確認済み） |
| カレンダー・Google連携のEdge Function配備先 | 旧`bp-erp`（`rwjhpfghhgstvplmggks`）のみ。`bp-erp-pro`には未配備 |
| フロントエンドの呼び出し方 | `calendar-events`・`google-calendar-sync`・`google-oauth-start/status/disconnect`はすべて単一のSupabaseクライアント経由で`functions.invoke()`。接続先はbp-erp-pro |

つまり、本番UIから`calendar-events`等を呼ぶと、関数が存在しないbp-erp-proに向かって失敗する構成です。社長にも「本番UIでは動いていない」と確認しました。

旧bp-erp側の関数は今もACTIVEで残っています（上記5つに`google-oauth-callback`と`calendar-test`を加えた計7スラッグ）。配備されている`calendar-events`のコードを確認したところ、次の状態でした。

- JWTをデコードするだけで署名を検証していない
- リクエスト本文の`user_id`を、トークン由来のIDより優先している
- `service_role`キーでDBに接続しており、RLSを迂回する

旧bp-erpでは`calendar_events`・`user_google_tokens`に対して`service_role`が全操作可能なため、この関数に到達できれば他人の予定の読み書き・削除まで届く構成です。現時点で外部から実際にアクセスされた、または漏えいが起きたと確認したものではありません。ただ、本番UIから呼ばれなくなった関数がインターネット上に残っている状態です。

**社長の方針**

1. カレンダー・Google連携は、旧`bp-erp`側の関数を直すのではなく、**`bp-erp-pro`へ移行して設計し直す**。
2. 設計し直しでは、認証（JWT署名検証）・所有権検査・Auth IDと社員IDの対応を最初から組み込む。現行コードは本文の`user_id`をトークンより優先し、service_roleキーでRLSを迂回しているため、そのまま移すことはしない。
3. 移行にあわせて、旧`bp-erp`側の7スラッグと、`calendar-events`の未整理な代替ファイル7本（`index_debug`/`index_final`/`index_final_bypass`/`index_temp`/`index_working`/`index_minimal`/`index_test`）は整理対象とする。
4. 名刺管理の`customer_contacts`の権限設定（5章）は、この移行とは別の課題として扱う。

**進め方（案）**

| 段階 | 内容 | 担当（案） |
| --- | --- | --- |
| 設計 | bp-erp-pro向けの新しいEdge Function構成、RLSポリシー、Auth ID↔社員IDの対応、移行手順を文書化 | 社長側（Claude/Codex）で作成 → 石野さんレビュー |
| 実装・配備 | 新関数の配備、migration、フロントエンド変更 | レビュー後に決める（石野さん側か社長側か） |
| GCP側 | OAuthリダイレクトURIを`bp-erp-pro`のFunctions URLへ追加 | GCPプロジェクトの管理者（石野さん確認中） |
| 切替 | 本番UIを新関数へ向ける | 検証後 |
| 旧環境停止 | 旧bp-erp側7関数の停止、必要ならデータ退避 | データ退避の要否は石野さん回答待ち |

設計は石野さんの回答を待たずに始められます。回答に依存する箇所は「確認待ち」として設計書に残します。

この方針を前提に、次を教えてください。

- 旧`bp-erp`側の`calendar_events`・`user_google_tokens`に、移行前に退避しておくべきデータはありますか。なければ移行後に停止・削除して構いませんか。
- 旧関数を現在も直接利用する別アプリ、cron、外部連携はありますか。
- Google Cloud側のOAuthクライアント（承認済みリダイレクトURI等）は`bp-erp-pro`のFunctions URLに変える必要があります。どのGCPプロジェクトにあり、誰が管理していますか。
- 移行の設計案はこちら（社長側のClaude/Codex）で作成し、石野さんにレビューしてもらう進め方でよいでしょうか。それとも石野さん側で実装しますか。
- Supabase Edge Functionsの`verify_jwt`設定は、どの構成ファイルまたは配備手順を正本にしていますか。
- `api/users`が返す氏名、メール、役職、在籍状態を、未ログイン状態で参照できる業務要件はありますか。

回答：

### 11 Git運用と追加承認

今後は`personal/main`へ`origin/main`を定期的にマージする運用でよいでしょうか。それとも`origin/main`へ一本化する方針でしょうか。

今回取り込んだ46コミットについて、こちら側で追加テスト、動作確認、または承認が必要な範囲があれば教えてください。

回答：

### 12 旧接続先の整理

日常運用先がbp-erp-proへ移った後も、リポジトリにはbp-erpのプロジェクトIDを固定した箇所が残っています。現行コード、歴史資料、廃止可能なスクリプトに分類した一覧をこちらで作成し、石野さん確認後に整理する進め方でよいでしょうか。

回答：

お手数ですが、分かる範囲からご回答をお願いします。回答を受けた後に必要な修正案を整理し、本番変更は別途確認してから進めます。

よろしくお願いいたします。

## 送信前メモ

- 宛先は石野さんの正式なメールアドレスを確認する。
- 本文に秘密値、APIキー、接続文字列を追記しない。
- この文書の作成時点ではメールを送信していない。
- Claudeの独立再確認結果とCodexのMCP再照会結果を反映済み。送信前に最終確認する。
