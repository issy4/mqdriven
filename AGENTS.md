# Codex / Cursor エージェント指示書

## 最新セッション引継ぎ（最優先）

Gemini API安全化・AIゲートウェイ作業では、着手前に以下を読むこと。

1. `docs/HANDOFF_2026-09-04_AI_GATEWAY.md`
2. `docs/architecture/AI_GATEWAY_REDESIGN.md`
3. `CLAUDE.md`

Preview検証前に本番へ反映しない。秘密情報を出力しない。既存変更を消さない。

## プロジェクト概要
MQDriven ERP。会計まわりは Supabase VIEW ＋ React（Tailwind）で参照中心に寄せている。

---

## 永続コンテキスト（リポジトリ事実・要約）

### 会計 UI の実体パス
メインアプリは **`App.tsx` → `components/Accounting.tsx`** がハブとなり、子画面は **`components/accounting/`**（例: `JournalLedger.tsx`）。ルートに重複した仕訳帳コンポーネントは置かない（旧ファイルは削除済み）。

### 画面ごとのデータ取得（現状・2026-03 更新）
| 画面 | ファイル | 主なデータ源 | メモ |
|------|-----------|----------------|------|
| 仕訳帳 | `components/accounting/JournalLedger.tsx` | `getJournalBookData` → `v_journal_book`（行は `dataService` で UI 形に正規化） | 参照専用。空時「データ未集計」。 |
| 総勘定元帳 | `components/accounting/GeneralLedger.tsx` | `getGeneralLedgerAccountsInPeriod` / `getGeneralLedgerLinesForAccount` → **`v_general_ledger`** | 参照専用。期間内に仕訳のある科目のみプルダウン。 |
| 試算表 | `components/accounting/TrialBalancePage.tsx` | `getTrialBalanceData`（RPC 試行後 `v_trial_balance`） | 据え置き。 |
| 消費税集計 | `components/accounting/TaxSummaryPage.tsx` | **`getTaxSummaryData`** → `v_tax_summary`（期間フィルタ） | `v_accounting_base` 上の仮受/仮払消費税勘定から月次集計（標準10%前提）。該当仕訳が無い月は行なし＝未集計表示。 |

### DB マイグレーションに含まれる VIEW
- `20260311000000_invoice_ocr_and_accounting_fix.sql`: `v_accounting_base`, `v_journal_book`, `v_general_ledger`, `v_trial_balance`
- `20260321120000_v_tax_summary_placeholder.sql`: `v_tax_summary` 初期定義（履歴用）
- `20260321130000_v_tax_summary_aggregate.sql`: **`v_tax_summary`** 実集計（上書き）

**`v_*_stub`**: `dataService` から参照。VIEW 未作成時は **空配列**で落とさない。本番で使うならマイグレーション追加。

### dataService.ts（会計関連の入口）
- `getJournalBookData`, `getGeneralLedgerData`, `getGeneralLedgerAccountsInPeriod`, `getGeneralLedgerLinesForAccount`, `getTrialBalanceData`, `getTaxSummaryData(filters?)`
- スタブ: `getInventoryData` 等（エラー時 `[]`）

### 技術仕様
- Supabase: **`VITE_SUPABASE_URL` 等の環境変数**で接続先を指定（リポジトリに本番 URL・キーをコミットしない）
- VIEW 命名: `v_[機能名]`
- エラーハンドリング: `ensureSupabaseSuccess`（該当箇所）
- UI: Tailwind CSS + React

---

## 目指す原則（会計モジュール）
1. **仕訳明細を起点**にした一貫した集計（スキーマ上は `accounting.journal_lines` 等。VIEW 定義はマイグレーション参照）。
2. **集計は DB（VIEW / RPC）寄せ**、UI は原則読み取り。
3. **データなしは 0 埋めでごまかさない** — 空・未集計を明示。
4. **参照専用** — 誤解を招く編集 UI・不要な操作ボタンは置かない（例外があるなら仕様に明記）。

---

## 完了の定義（エージェント作業）
「完了」と言う前に次を満たすこと:
- 上記 **原則と実装の齟齬**があれば、直すか Issue / 本書に **意図的例外**として記載したうえで収束させる。
- 変更した画面は **データあり / なし** の両方で表示が破綻しないことを確認する。
- 可能なら **lint / test / build** を実行し、結果を残す。

Issue や PR を使う場合は、**Issue を閉じる＝ DoD 満たした** と定義する。

---

## リポジトリ構成（全体像・要約）
| 領域 | 説明 |
|------|------|
| ルート | **Vite + React** メイン ERP UI（`App.tsx`, `components/`）。`npm run dev` / `build` / `typecheck` / `test` |
| `supabase/` | migrations, edge functions |
| `server/`, `mcp-server/`, `memory-server/` | 周辺サービス（メイン画面とは別入口） |
| `PG/` | 過去・実験用サブプロジェクト。本番フローでは **ルートアプリを正** とする |

---

## 技術負債の焼き払い計画
**`docs/TECH_DEBT_BURNDOWN.md`** にフェーズ別の残タスク（請求 RPC 化、`src/` と `components/accounting/` の統合、MOCK データ削除など）を集約した。エージェントがそのまま実装に入るための詳細は **`docs/HANDOFF_NEXT_AGENT.md`**（バックログ T1–T12・`dataService` 索引・検証手順）。

## 直近の改善候補
1. **`v_tax_summary`**: 複数税率・軽減税率は `journal_lines` の税区分列追加後に VIEW を拡張（計画書フェーズ 1）。
2. **`v_*_stub`**: 運用管理画面で必要なら **マイグレーションで VIEW 定義**。
3. **会計 UI ディレクトリ**: `src/components/accounting/*` と `components/accounting/*` の **二重配置を解消**（計画書フェーズ 4）。

---

## 履歴メモ
会計タブは **VIEW + dataService 経由**に寄せ、消費税のクライアント集計フォールバックを廃止済み（2026-03）。
