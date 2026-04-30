# 見積管理一覧表示の修正サマリー

## 問題点
見積管理一覧画面で、「No.」と「件名」の表示がズレていた問題を修正しました。

## 修正内容

### 1. ファイル: `services/dataService.ts`
**関数**: `mapEstimateRow` (行番号: 4055～4160)

#### 修正前
```typescript
// 行 4100
estimates_id: toStringOrNull(row.estimates_id),

// 行 4132
estimateNumber: toNumberOrNull(row.estimates_id) || 0,
```

#### 修正後
```typescript
// 行 4100
estimates_id: toStringOrNull(row.estimates_id) || toStringOrNull(row.id),

// 行 4132
estimateNumber: toNumberOrNull(row.id) || toNumberOrNull(row.estimates_id) || 0,
```

## 修正の背景
- `estimates_list_view`（Supabaseのビュー）は `estimates_v2` テーブルの `id` カラムを返す
- 以前のコードでは `row.estimates_id` を参照していたが、この値は常に NULL だった
- 修正により `row.id` を優先的に参照するようにして、正しい見積番号が表示されるようになった

## マッピング仕様の確認
| フロント表示 | Estimate型フィールド | 取得元 |
|-----------|------------------|-------|
| No. | `estimateNumber` | `row.id` (優先) or `row.estimates_id` |
| 顧客名 | `customerName` | `row.customer_name` |
| 件名 | `title` | `row.project_name` |
| 金額 | `total` | `row.total` |
| MQ率 | `mqRate` | `row.mq_rate` |
| 納期 | `deliveryDate` | `row.delivery_date` |

## テーブルカラム定義の確認
`EstimateManagementPage.tsx` (行 1230～1244) のテーブルヘッダー設定:
- `sortKey="estimateNumber"` → "No."
- `sortKey="customerName"` → "顧客名"
- `sortKey="title"` → "件名"

これらは `mapEstimateRow` で正しくマッピングされており、テーブル表示は正常に機能します。

## 影響範囲
- ✅ 見積管理一覧表示の「No.」「顧客名」「件名」が正しく表示される
- ✅ 既存の金額、納期、ステータス表示は変更なし
- ✅ テーブルのソート機能（sortKey）も正常に動作
