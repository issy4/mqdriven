# 引き継ぎ 2026年9月17日 カレンダー移行設計レビュー結果とPR作成

## 次回最初に読むもの

1. `docs/HANDOFF_2026-09-17_ERP_VERIFICATION_STATUS.md`（前段の検証・設計の記録。本ファイルはその続き）
2. `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md`（本ファイルの主題：独立レビュー結果）
3. 本ファイル（PRの作成とその後の未着手事項）

## 位置づけ

`HANDOFF_2026-09-17_ERP_VERIFICATION_STATUS.md`の「次の安全な順序」1番（Claudeに新しい移行設計を独立レビューさせる）は完了した。その結果と、そこから派生したPR作成をここに記録する。この文書を書くまで、レビュー結果とPR番号はセッション内会話とAI側のローカルメモリにしか残っておらず、Gitやリポジトリのドキュメントには反映されていなかった。

## Claude独立レビューの結果

- 成果物: `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md`
- **総合判定: 要修正**
- 重大な見落とし: 設計は`public.users.auth_user_id`を既存の対応列として正本に据えているが、アプリコード（`*.ts*`全体）のどこからも参照されていない未使用列だった。実際のログイン解決（`App.tsx:1070`）は`users.id === supabaseUser.id`で直接照合しており、SQLで確認すると77件中0件が一致（常に失敗し、メール一致か先頭ユーザーへのフォールバックだけで動いている既知バグの実態）。
- 同じ理由で`users`テーブルの自己アクセスRLSポリシー（`users_self_select`等）も現状すべて死んでおり、広域ポリシー`rls_migration_authenticated_all`だけが実質アクセスを支えている。この広域ポリシーを削除する設計（6章）を実行する前に、`auth_user_id`ベースの新ポリシーを先に入れないと`users`が誰からも読めなくなる。
- `handle_new_user()`トリガーは`public.users`ではなく別の`public.profiles`テーブル（39件、これも`auth.users.id`と0件一致）にINSERTしている。設計書はこのテーブルの存在に触れていない。
- 実装前に反映すべき具体的修正点はレビュー本体の8章に4点まとまっている。

## PR作成

- **[issy4/mqdriven#144](https://github.com/issy4/mqdriven/pull/144)** を作成済み・OPEN（作成: 2026-09-17T03:50:05Z / JST 12:50）。
- ヘッド: `shoichi-spec/mqdriven-1`（`shoichi-spec/mqdriven`は本家との血縁のない別リポジトリのため、正式フォークとして`gh repo fork issy4/mqdriven`で新規作成した）。
- 内容: Geminiゲートウェイ安全化（bp-erp-pro側で稼働確認済み）＋今回のERP検証・カレンダー移行設計・独立レビュー文書一式。
- 実装・DB変更・配備は含まない。ドキュメントのみ。
- マージは石野さんの判断待ち。現時点で誰もマージしていない。
- 今後mqdrivenで新しいフォーク／PRを作る場合は`shoichi-spec/mqdriven-1`を使う（`shoichi-spec/mqdriven`との二重管理に注意）。

## 未着手（次回セッションの入口）

1. `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md`8章の4点をCodexへの再依頼mdにまとめ、設計を修正させる。
2. 石野さん向け確認文案（`docs/CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`）に「`auth_user_id`16件・`profiles`39件の由来」の質問を追加してから、社長に送信可否を確認する。
3. 上記いずれも実装・配備・メール送信は行っていない。

## 今回わかった運用上の注意

Claudeのセッション内ローカルメモリ（会社PC内のみ、Git非管理）に作業の時系列やPR番号などの要点をまとめても、それだけでは他のPCやGit履歴からは見えない。設計書・レビュー・PRのような実体はここまでも都度コミット・push済みだったが、「レビュー結果が出た」「PRを作った」という**節目の事実そのもの**を記した文書がリポジトリ側に無かったため、本ファイルで補った。次回以降、設計・実装以外でも節目（レビュー完了、PR作成、送信判断など）ごとにこの種の短い引き継ぎファイルを追加する。
