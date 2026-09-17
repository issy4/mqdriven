# Codex向け カレンダー・Google連携 移行設計 修正依頼 2026年9月17日

> 実施状況: 元設計（`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`）へのClaude独立レビュー（`docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md`）が完了し、総合判定は**要修正**。本依頼はその修正のみを対象とする。実装・配備・DB変更・本番HTTP試験・メール送信は行わない。

## 目的

`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`を、レビュー8章の指摘4点に沿って修正する。新規の調査や実装は不要。設計書の記述の訂正・追記が中心。

## 前提として読むもの（この順）

1. `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md` — 特に2章「相違・追加発見」、8章「実装前に設計書へ反映すべき具体的修正」
2. `docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`（修正対象の元設計）
3. `docs/DESIGN_REQUEST_2026-09-17_CODEX_CALENDAR_MIGRATION.md`（元の依頼内容。要件A〜Fは今回も維持）

## レビューで判明した重大な見落とし（修正の根拠）

- 元設計が「既存の対応列」として正本に据えた`public.users.auth_user_id`は、アプリコード（`*.ts*`全体）のどこからも参照されていない未使用列だった。実際のログイン照合（`App.tsx:1070`）は`users.id === supabaseUser.id`で直接比較しており、SQL確認では77件中0件が一致（メール一致か先頭ユーザーへのフォールバックだけで動いている既知バグの実態）。
- 同じ理由で`users`テーブルの自己アクセスRLSポリシー（`users_self_select`等）も現状すべて死んでおり、広域ポリシー`rls_migration_authenticated_all`だけが実質アクセスを支えている。元設計6章の「広域ポリシー削除」を、`auth_user_id`ベースの新ポリシー投入より先に実行すると`users`が誰からも読めなくなる。
- `handle_new_user()`トリガーは`public.users`ではなく別の`public.profiles`テーブル（39件、これも`auth.users.id`と0件一致）にINSERTしている。元設計書はこのテーブルの存在に触れていない。

## 修正指示（レビュー8章の4点）

1. 元設計3章冒頭に、「`auth_user_id`は現行アプリコードでは未使用であり、今回の移行で新たに正式な識別子として採用する」と明記する。「既存の対応を使う」という表現があれば訂正する。
2. 元設計5.1節に、有効な11件のリンク（`auth_user_id`が設定済みの行）を人手で再監査する手順を追加する（誰が設定したか確認、社員台帳と突合）。実行はしない。手順の記述のみ。
3. 元設計6章に6.0節（新設）を追加し、「`public.users`の`rls_migration_authenticated_all`削除と同時に、`auth_user_id = auth.uid()`を条件とする自己アクセスポリシーへの置換（または既存`users_self_*`3ポリシーの条件修正）を行う」ことを、6.2節（`calendar_events`基本RLS）着手の前提条件として明記する。
4. 元設計12章（未確認事項表）に、`public.profiles`について「現行のAuth ID対応設計とは無関係と判断した根拠（石野さん確認済み／未確認のため保留）」を記入する欄を追加する。現時点では「未確認」として残す。

## やってはいけないこと

- 実装・配備・DB変更・ACL変更・本番HTTP試験・メール送信
- 秘密値の取得・記録
- 元設計の要件A〜F（`docs/DESIGN_REQUEST_2026-09-17_CODEX_CALENDAR_MIGRATION.md`）の後退（今回の修正は追記・訂正であり、認証方式やRLS方針の変更ではない）
- `public.profiles`の由来について、確認なしに「無関係」と断定して設計書へ記載すること

## 成果物

`docs/DESIGN_2026-09-17_CALENDAR_MIGRATION_BP_ERP_PRO.md`を直接修正する（差分がわかる形にする）。修正箇所は上記1〜4に対応させ、末尾に「レビュー反映済み（2026-09-17、Claude独立レビュー8章対応）」の一文を追加する。

## 補足

- 石野さんへの確認事項（`public.profiles`の由来を含む）は`docs/CONFIRMATION_REQUEST_2026-09-17_ISHINO_ERP.md`にまとめている。回答が届く前でも今回の修正は進められる（回答に依存する箇所は「石野さん回答待ち」と明記する）。
- Codex MCP経由の長時間タスクは1800秒でタイムアウトする。本依頼書は手元のCodexへ直接投入する。
