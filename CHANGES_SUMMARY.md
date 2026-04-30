# 見積管理一覧表示の修正サマリー

## 問題点
見積管理一覧画面で、「No.」と「件名」の表示がズレていた問題を修正しました。

## 修正内容

### ファイル: `services/dataService.ts`
**関数**: `mapEstimateRow` (行番号: 4055～4160)

#### 修正前（誤り）
```typescript
// 行 4100
estimates_id: toStringOrNull(row.estimates_id) || toStringOrNull(row.id),

// 行 4132
estimateNumber: toNumberOrNull(row.id) || toNumberOrNull(row.estimates_id) || 0,
```

#### 修正後（正しい）
```typescript
// 行 4100
estimates_id: toStringOrNull(row.estimates_id),

// 行 4132
estimateNumber: toNumberOrNull(row.estimates_id) || 0,
```

## 修正の背景
- `row.id` は UUID（文字列）なので `toNumberOrNull` では null になる
- No. 列には `row.estimates_id`（数値）を使用すべき
- 前回の修正で `row.id` を優先していたのは誤りだったため、元に戻した

## マッピング仕様（正しい対応）
| フロント表示 | Estimate型フィールド | 取得元 |
|-----------|------------------|-------|
| No. | `estimateNumber` | `row.estimates_id` |
| 顧客名 | `customerName` | `row.customer_name` |
| 件名 | `title` | `row.project_name` |
| 金額 | `total` | `row.total` |
| MQ率 | `mqRate` | `row.mq_rate` |
| 納期 | `deliveryDate` | `row.delivery_date` |

## テーブル表示確認（EstimateManagementPage.tsx）
```tsx
// 行 1277
<td className="py-3 px-4">{estimate.estimateNumber}</td>  // No.
// 行 1278
<td className="py-3 px-4">{estimate.customerName}</td>    // 顧客名
// 行 1280-1281
<div className="max-w-xs truncate" title={estimate.title}>
    {estimate.title}                                       // 件名
</div>
// 行 1284
{formatJPY(Number(estimate.total) || 0)}                  // 金額
// 行 1294
{formatDate(estimate.deliveryDate || estimate.delivery_date) || '-'} // 納期
```

## 影響範囲
- 見積管理一覧表示の「No.」「顧客名」「件名」が正しく表示される
- 既存の金額、納期、ステータス表示は変更なし
- テーブルのソート機能も正常に動作
