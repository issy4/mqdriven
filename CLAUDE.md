# CLAUDE.md - AI向けプロジェクトガイドライン

## 最新セッション引継ぎ（2026-09-17）

ERP名刺管理・カレンダー移行を続ける場合は、作業前に次を順に読むこと。

1. `docs/HANDOFF_2026-09-17_ERP_VERIFICATION_STATUS.md`
2. `docs/CLAUDE_REVIEW_2026-09-17_CALENDAR_MIGRATION_DESIGN.md`（独立レビュー結果：総合判定「要修正」）
3. `docs/HANDOFF_2026-09-17_CALENDAR_MIGRATION_REVIEW_AND_PR.md`（レビュー後の状況とPR #144、次の未着手事項）

Gemini API安全化（2026-09-04分）を続ける場合は、次を読むこと。

1. `docs/HANDOFF_2026-09-04_AI_GATEWAY.md`
2. `docs/architecture/AI_GATEWAY_REDESIGN.md`
3. `AGENTS.md`

Preview検証前に本番へ反映しない。APIキー・JWT・Secretの値を出力しない。
既存の未コミット変更を消さない。

## 金額取得ロジック（重要）

申請データ（formData）から金額を取得するときは、必ず `utils.ts` の `deriveApplicationAmount(formData)` を使うこと。

**絶対にやってはいけないこと:**
- `formData.amount || formData.totalAmount || 0` のようなインライン金額取得を書かないこと
- 各コンポーネントに独自の金額取得ロジックを実装しないこと

**理由:** 経費精算フォーム(EXP)は金額を `formData.invoice.totalGross` に保存するが、他のフォームは `formData.amount` や `formData.totalAmount` に保存する。過去にインラインの金額取得が `invoice.totalGross` を参照し忘れて0円表示になるバグが繰り返し発生した。

```typescript
// OK
import { deriveApplicationAmount } from '../utils';
const amount = deriveApplicationAmount(app.formData);

// NG - 絶対にやらないこと
const amount = formData?.totalAmount || formData?.amount || 0;
```
