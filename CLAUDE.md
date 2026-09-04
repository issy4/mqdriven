# CLAUDE.md - AI向けプロジェクトガイドライン

## 最新セッション引継ぎ（2026-09-04）

MQ ERPのGemini API安全化を続ける場合は、作業前に次をすべて読むこと。

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
