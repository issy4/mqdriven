import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { getSupabase } from '../../services/supabaseClient';
import {
    FileText,
    Loader,
    X,
    Send,
    Mail,
    Settings,
    CheckCircle,
    Clock,
    Search,
    RefreshCw,
    Edit,
    Plus,
    Building,
} from '../Icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerRow {
    id: string;
    customer_code: string | null;
    customer_name: string | null;
    post_no: string | null;
    address_1: string | null;
    address_2: string | null;
    closing_day: string | null;
    pay_day: string | null;
    bill_payment_day: string | null;
}

interface CustomerSearchResult {
    id: string;
    customer_code: string | null;
    customer_name: string | null;
    post_no: string | null;
    address_1: string | null;
    address_2: string | null;
}

interface ProjectLegacyRow {
    id: string;
    project_id: string | null;
    project_code: string | null;
    order_id: string | null;
    order_code: string | null;
    project_name: string | null;
    customer_id: string | null;
    customer_code: string | null;
    sales_user_id: string | null;
    sales_user_code: string | null;
}

interface UserRow {
    id: string;
    user_code: string | null;
    name: string | null;
}

interface InvoiceLegacyRow {
    row_uuid: string;
    invoice_id: string | null;
    order_id: string | null;
    project_id: string | null;
    project_uuid: string | null;
    customer_uuid: string | null;
    delivery_date: string | null;
    specification: string | null;
    subtotal: string | null;
    consumption: string | null;
    total: string | null;
    note: string | null;
    pattern_name: string | null;
    status: string | null;
    create_date: string | null;
}

interface InvoiceDetailRow {
    row_uuid: string;
    invoice_uuid: string | null;
    record_no: string | null;
    major_item: string | null;
    medium_item: string | null;
    detail: string | null;
    quantity: string | null;
    unit_price: string | null;
    tax_rate: string | null;
}

interface MasterLegacyRow {
    legacy_id: string | null;
    key_name: string | null;
    value: string | null;
}

interface IssueRecordRow {
    id: string;
    legacy_invoice_id: string | null;
    invoice_no: string | null;
    issue_status: string | null;
    issued_at: string | null;
    issue_count: number | null;
}

interface DeliveryRecordRow {
    id: string;
    legacy_invoice_id: string | null;
    invoice_no: string | null;
    issue_record_id?: string | null;
    delivery_method: string | null;
    delivery_status: string | null;
    to_email: string | null;
    cc_email?: string | null;
    bcc_email?: string | null;
    subject?: string | null;
    body?: string | null;
    attachment_file_name?: string | null;
    sent_at: string | null;
}

interface PaymentMatchRow {
    id: string;
    legacy_invoice_id: string | null;
    invoice_no: string | null;
    customer_code: string | null;
    customer_name: string | null;
    expected_amount: number | string | null;
    paid_amount: number | string | null;
    balance_amount: number | string | null;
    payment_status: string | null;
    payment_date: string | null;
    matched_at?: string | null;
    payment_source?: string | null;
    payment_reference?: string | null;
    note?: string | null;
}

interface BillingSettingRow {
    id: string;
    customer_id: string | null;
    customer_code: string | null;
    customer_name: string | null;
    delivery_method: string | null;
    billing_email: string | null;
    billing_cc: string | null;
    billing_bcc: string | null;
    email_subject_template: string | null;
    email_body_template: string | null;
    attachment_name_template: string | null;
    requires_manual_review: boolean | null;
    notes: string | null;
    is_active: boolean | null;
}

interface CombinedInvoice {
    invoice: InvoiceLegacyRow;
    project: ProjectLegacyRow | null;
    customer: CustomerRow | null;
    salesUser: UserRow | null;
    issue: IssueRecordRow | null;
    delivery: DeliveryRecordRow | null;
    payment: PaymentMatchRow | null;
}

type Tab = 'unissued' | 'issued' | 'pending_send' | 'sent' | 'paid' | 'settings';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ATTACHMENT_NAME_TEMPLATE = '請求書_{{invoice_id}}_{{customer_name}}.pdf';
const DEFAULT_EMAIL_SUBJECT_TEMPLATE = '【請求書送付】{{customer_name}} 御中 請求書のご送付';
const DEFAULT_EMAIL_BODY_TEMPLATE = `{{customer_name}} 御中

いつもお世話になっております。
請求書を添付にてお送りいたします。

ご確認のほど、よろしくお願いいたします。`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JPY = (n: number | string | null | undefined) => {
    const num = typeof n === 'string' ? Number(String(n).replace(/,/g, '')) : n;

    if (num === null || num === undefined || Number.isNaN(num)) return '¥0';

    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
        maximumFractionDigits: 0,
    }).format(Math.round(num));
};

const numOf = (v: string | number | null | undefined): number => {
    if (v === null || v === undefined) return 0;
    const n = typeof v === 'string' ? Number(String(v).replace(/,/g, '')) : v;
    return Number.isNaN(n) ? 0 : n;
};

const formatDate = (v: string | null | undefined): string => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('ja-JP');
};

const formatDateTime = (v: string | null | undefined): string => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('ja-JP');
};

const todayDateString = (): string => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};


const formatJapaneseDateForInvoice = (v: string | null | undefined): string => {
    const d = v ? new Date(v) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}年 ${d.getMonth() + 1}月 ${d.getDate()}日`;
};

const formatJapaneseMonthDay = (v: string | null | undefined): string => {
    const d = v ? new Date(v) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
};

const sanitizeFileName = (value: string): string => {
    return value.replace(/[\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
};

const taxAmountOf = (amount: number, taxRate: string | number | null | undefined): number => {
    const rate = numOf(taxRate);
    if (!rate) return 0;
    return Math.round(amount * (rate / 100));
};

const customerAddress = (c: CustomerRow | CustomerSearchResult | null): string => {
    if (!c) return '—';
    const parts = [c.post_no ? `〒${c.post_no}` : '', c.address_1 || '', c.address_2 || ''].filter(Boolean);
    return parts.length ? parts.join(' ') : '—';
};

const logSupabaseError = (label: string, err: any) => {
    console.error(`[LegacyInvoiceBillingPage] ${label} Supabase error`, {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
    });
};

const invoiceProductName = (row: CombinedInvoice): string => {
    return row.project?.project_name || row.invoice.note || row.invoice.specification || row.invoice.pattern_name || '—';
};

const invoiceOrderCode = (row: CombinedInvoice): string => {
    return row.project?.order_code || row.invoice.order_id || '—';
};

const invoiceCustomerName = (row: CombinedInvoice): string => {
    return row.customer?.customer_name || row.project?.customer_code || '—';
};

const getRecordByInvoice = <T extends { legacy_invoice_id: string | null; invoice_no?: string | null }>(
    map: Record<string, T>,
    invoice: InvoiceLegacyRow,
): T | null => {
    const keys = [invoice.row_uuid, invoice.invoice_id].filter((v): v is string => !!v);
    for (const key of keys) {
        if (map[key]) return map[key];
    }
    return null;
};

const renderTemplate = (template: string | null | undefined, row: CombinedInvoice): string => {
    const invoice = row.invoice;
    const customer = row.customer;
    const project = row.project;

    const values: Record<string, string> = {
        invoice_id: invoice.invoice_id || '',
        order_code: project?.order_code || invoice.order_id || '',
        customer_name: customer?.customer_name || project?.customer_code || '',
        customer_code: customer?.customer_code || project?.customer_code || '',
        project_name: project?.project_name || invoice.note || invoice.specification || '',
        total: JPY(invoice.total),
        delivery_date: formatDate(invoice.delivery_date),
    };

    let result = template || '';
    Object.entries(values).forEach(([key, value]) => {
        result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
    });
    return result;
};

const deliveryMethodLabel = (method: string | null | undefined): string => {
    if (method === 'email') return 'メール';
    if (method === 'post') return '郵送';
    if (method === 'manual') return '手動';
    return method || '—';
};

const deliveryStatusLabel = (method: string | null | undefined, status: string | null | undefined): string => {
    if (!status) return '未送付';
    if (status === 'pending') {
        if (method === 'email') return 'メール送信待ち';
        if (method === 'post') return '郵送待ち';
        if (method === 'manual') return '手動対応待ち';
        return '送付待ち';
    }
    if (status === 'sent') {
        if (method === 'email') return 'メール送信済み';
        if (method === 'post') return '郵送済み';
        if (method === 'manual') return '手動対応済み';
        return '送付済み';
    }
    if (status === 'failed') return '送付失敗';
    return status;
};

const deliveryDoneButtonLabel = (method: string | null | undefined): string => {
    if (method === 'post') return '郵送済みにする';
    if (method === 'manual') return '手動対応済みにする';
    return 'メール送信済みにする';
};

const STATUS_LABELS: Record<string, string> = {
    not_issued: '未発行',
    draft: '下書き',
    issued: '発行済み',
    pending: '送付待ち',
    sent: '送付済み',
    failed: '送付失敗',
    unpaid: '未入金',
    partial: '一部入金',
    paid: '入金確認済み',
};

const StatusBadge: React.FC<{
    status: string | null | undefined;
    kind: 'issue' | 'delivery' | 'payment';
    method?: string | null;
}> = ({ status, kind, method }) => {
    if (!status) {
        const fallback = kind === 'issue' ? '未発行' : kind === 'delivery' ? '未送付' : '未入金';
        return (
            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {fallback}
            </span>
        );
    }

    const label = kind === 'delivery' ? deliveryStatusLabel(method, status) : STATUS_LABELS[status] || status;
    const tone =
        status === 'issued' || status === 'sent' || status === 'paid'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
            : status === 'failed'
              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
              : status === 'partial' || status === 'pending'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

    return <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${tone}`}>{label}</span>;
};


// ---------------------------------------------------------------------------
// Invoice PDF Preview Modal
// ---------------------------------------------------------------------------

const InvoicePdfPreviewModal: React.FC<{
    combined: CombinedInvoice;
    details: InvoiceDetailRow[];
    masterName: (legacyId: string | null | undefined) => string;
    onClose: () => void;
}> = ({ combined, details, masterName, onClose }) => {
    const { invoice, project, customer, salesUser } = combined;
    const subtotal = numOf(invoice.subtotal);
    const consumption = numOf(invoice.consumption);
    const total = numOf(invoice.total);
    const invoiceDate = invoice.create_date || new Date().toISOString();
    const invoiceMonthDay = formatJapaneseMonthDay(invoice.delivery_date || invoice.create_date);
    const salesUserName = salesUser?.name || project?.sales_user_code || '';
    const maxRows = 18;
    const taxRowCount = 1;
    const spacerRowCount = 1;
    const blankRows = Math.max(0, maxRows - details.length - taxRowCount - spacerRowCount);

    const printInvoice = () => {
        const originalTitle = document.title;
        const nextTitle = sanitizeFileName(`請求書_${invoice.invoice_id || 'no'}_${customer?.customer_name || 'customer'}`);

        document.title = nextTitle;
        window.print();

        window.setTimeout(() => {
            document.title = originalTitle;
        }, 1000);
    };

    return (
        <div className="fixed inset-0 bg-slate-950/70 z-[80] overflow-y-auto p-4 print:p-0 print:bg-white">
            <style>{`
                @page {
                    size: A4 portrait;
                    margin: 8mm;
                }

                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    .invoice-print-area,
                    .invoice-print-area * {
                        visibility: visible !important;
                    }
                    .invoice-print-area {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        box-shadow: none !important;
                    }
                    .invoice-preview-toolbar {
                        display: none !important;
                    }
                    .invoice-a4-page {
                        margin: 0 !important;
                        box-shadow: none !important;
                        width: 188mm !important;
                        min-height: 281mm !important;
                        padding: 0 !important;
                    }
                }

                .invoice-a4-page {
                    width: 188mm;
                    min-height: 281mm;
                    margin: 0 auto;
                    background: white;
                    color: #111;
                    box-sizing: border-box;
                    padding: 0;
                    font-family: 'Yu Gothic', 'Meiryo', Arial, sans-serif;
                    font-size: 10px;
                    line-height: 1.35;
                }

                .invoice-title {
                    text-align: center;
                    font-size: 22px;
                    letter-spacing: 12px;
                    font-weight: 700;
                    margin-top: 2mm;
                    margin-bottom: 2mm;
                }

                .invoice-top {
                    display: grid;
                    grid-template-columns: 48% 20% 32%;
                    column-gap: 4mm;
                    min-height: 48mm;
                }

                .invoice-address {
                    padding-left: 9mm;
                    padding-top: 3mm;
                    font-size: 11px;
                }

                .invoice-address .customer-name {
                    margin-top: 5mm;
                    font-size: 12px;
                }

                .invoice-meta {
                    padding-top: 8mm;
                    font-size: 10px;
                }

                .invoice-meta-row {
                    display: grid;
                    grid-template-columns: 66px 1fr;
                    gap: 3mm;
                    margin-bottom: 3mm;
                    align-items: center;
                }

                .seal-box {
                    width: 34mm;
                    height: 14mm;
                    border: 1px solid #111;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    margin-top: 2mm;
                    font-size: 7px;
                    text-align: center;
                }

                .seal-box div {
                    border-right: 1px solid #111;
                    padding-top: 1mm;
                }
                .seal-box div:last-child {
                    border-right: none;
                }

                .invoice-company {
                    position: relative;
                    padding-top: 11mm;
                    font-size: 8px;
                    line-height: 1.35;
                    min-height: 42mm;
                }

                .invoice-company .company-name-row {
                    display: flex;
                    align-items: center;
                    gap: 2mm;
                    font-size: 14px;
                    font-weight: 700;
                    margin-bottom: 1mm;
                    position: relative;
                    z-index: 2;
                }

                .invoice-company .bp-mark {
                    width: 9mm;
                    height: 6mm;
                    border: 1px solid #222;
                    border-radius: 50%;
                    font-size: 7px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                }

                .company-stamp {
                    position: absolute;
                    top: 1mm;
                    left: 33mm;
                    width: 25mm;
                    opacity: 0.82;
                    z-index: 1;
                }

                .bank-lines {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    column-gap: 5mm;
                    font-size: 7px;
                    margin-top: 2mm;
                    margin-bottom: 1.5mm;
                    padding-left: 82mm;
                }

                .invoice-message {
                    font-size: 8px;
                    margin-bottom: 1mm;
                }

                .summary-table,
.detail-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    color: #111;
}

.summary-table {
    width: 98%;
    margin-left: auto;
    margin-right: auto;
    border: 1px solid #111;
    margin-top: 0;
}

.summary-table th,
.summary-table td {
    border: 1px solid #111;
    text-align: center;
    vertical-align: middle;
    padding: 0.4mm 0.6mm;
    font-weight: 400;
    box-sizing: border-box;
}

.summary-table th {
    height: 7mm;
    font-size: 7px;
    line-height: 1.15;
}

.summary-table td {
    height: 6mm;
    font-size: 8px;
    line-height: 1.1;
    text-align: right;
    padding-right: 1mm;
}

/* 左右端の罫線を確実に出す */
.summary-table th:first-child,
.summary-table td:first-child {
    border-left: 1px solid #111 !important;
}

.summary-table th:last-child,
.summary-table td:last-child {
    border-right: 1px solid #111 !important;
}

                .detail-table {
    margin-top: 4mm;
    font-size: 6.8px;
    line-height: 1;
}

.detail-table th,
.detail-table td {
    border: 1px solid #111;
    vertical-align: middle;
    padding: 0.15mm 0.45mm;
    height: auto;
    line-height: 1;
    box-sizing: border-box;
}

.detail-table thead th {
    height: 5.2mm;
    padding: 0.2mm 0.4mm;
    font-size: 7px;
    line-height: 1.05;
    text-align: center;
    font-weight: 600;
    letter-spacing: 0.2px;
}

.detail-table tbody td {
    height: 4.9mm;
    max-height: 4.9mm;
    padding-top: 0.1mm;
    padding-bottom: 0.1mm;
    font-size: 6.8px;
    line-height: 1;
}

.detail-table th {
    text-align: center;
    height: 7mm;
    font-weight: 600;
    letter-spacing: 0.5px;
    line-height: 1.15;
}

.detail-table .small {
    font-size: 6.2px;
    line-height: 1;
}

.detail-table .product-cell {
    font-size: 6.8px;
    line-height: 1;
    word-break: break-word;
}

                .page-count {
                    text-align: right;
                    margin-top: 6mm;
                    font-size: 9px;
                }
            `}</style>

            <div className="invoice-preview-toolbar max-w-[980px] mx-auto mb-4 flex justify-end gap-3">
                <button
                    onClick={printInvoice}
                    className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700"
                >
                    印刷 / PDF保存
                </button>
                <button
                    onClick={onClose}
                    className="bg-slate-100 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200"
                >
                    閉じる
                </button>
            </div>

            <div className="invoice-print-area">
                <div className="invoice-a4-page shadow-2xl">
                    <div className="invoice-title">請　求　書</div>

                    <div className="invoice-top">
                        <div className="invoice-address">
                            <div>{customer?.post_no ? `〒${customer.post_no}` : ''}</div>
                            <div>{[customer?.address_1, customer?.address_2].filter(Boolean).join(' ')}</div>
                            <div className="customer-name">{customer?.customer_name || ''}御中</div>
                        </div>

                        <div className="invoice-meta">
                            <div style={{ marginBottom: '5mm', fontSize: '11px' }}>{formatJapaneseDateForInvoice(invoiceDate)}</div>
                            <div className="invoice-meta-row">
                                <span>お客様コード</span>
                                <span>{customer?.customer_code || project?.customer_code || ''}</span>
                            </div>
                            <div className="invoice-meta-row">
                                <span>担　当　者</span>
                                <span>{salesUserName}</span>
                            </div>
                            <div className="seal-box">
                                <div>担当者</div>
                                <div>検　印</div>
                            </div>
                        </div>

                        <div className="invoice-company">
                            <img src="/images/company-stamp.png" className="company-stamp" alt="社印" />
                            <div className="company-name-row">
                                <span className="bp-mark">bp</span>
                                <span>文唱堂印刷株式会社</span>
                            </div>
                            <div>本　　社　東京都千代田区神田佐久間町3-37</div>
                            <div>〒101-0025　TEL.03(3851)0111㈹</div>
                            <div>FAX.03(3861)1979</div>
                            <div style={{ marginTop: '1mm' }}>町屋工場　東京都荒川区町屋8-22-10</div>
                            <div>〒116-0001　TEL.03(3819)2500㈹</div>
                            <div>FAX.03(3819)2501</div>
                        </div>
                    </div>

                    <div className="bank-lines">
                        <div>■お振込先銀行　三菱UFJ銀行 神田駅前支店(当)2021103</div>
                        <div>みずほ銀行 上野支店(当)0103458</div>
                        <div>　三菱UFJ銀行 堀留支店(当)0301474</div>
                        <div>三井住友銀行 神田支店(当)2003693</div>
                    </div>
                    <div className="invoice-message">
                        毎度ありがとうございます。下記の通り御請求申し上げます。　　■適格請求書登録番号 ： T3-0100-0102-8004
                    </div>

                    <table className="summary-table">
                        <colgroup>
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '11.5%' }} />
                            <col style={{ width: '10.5%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '10.5%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '10.25%' }} />
                            <col style={{ width: '10.25%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>10％対象</th>
                                <th>消費税額(10%)</th>
                                <th>非課税対象</th>
                                <th></th>
                                <th>御買上額(税抜)</th>
                                <th>値引額(税抜)</th>
                                <th>消 費 税</th>
                                <th>今回御買上額</th>
                                <th>今回御請求額</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>{subtotal.toLocaleString()}</td>
                                <td>{consumption.toLocaleString()}</td>
                                <td>0</td>
                                <td></td>
                                <td>{subtotal.toLocaleString()}</td>
                                <td>0</td>
                                <td>{consumption.toLocaleString()}</td>
                                <td>{total.toLocaleString()}</td>
                                <td>{total.toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="detail-table">
                        <colgroup>
                            <col style={{ width: '9.5%' }} />
<col style={{ width: '2.8%' }} />
<col style={{ width: '36.7%' }} />
<col style={{ width: '8.5%' }} />
<col style={{ width: '4.8%' }} />
<col style={{ width: '8%' }} />
<col style={{ width: '11.5%' }} />
<col style={{ width: '9.2%' }} />
<col style={{ width: '9%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>月日</th>
                                <th>区<br />分</th>
                                <th>品　　名</th>
                                <th>数　量</th>
                                <th>単位</th>
                                <th>単　価</th>
                                <th>金　額</th>
                                <th>消費税等</th>
                                <th>摘　要</th>
                            </tr>
                        </thead>
                        <tbody>
                            {details.map((detail) => {
                                const quantity = numOf(detail.quantity);
                                const unitPrice = numOf(detail.unit_price);
                                const amount = quantity * unitPrice;
                                return (
                                    <tr key={detail.row_uuid}>
                                        <td>{invoiceMonthDay}</td>
                                        <td className="center small">{masterName(detail.major_item)}</td>
                                        <td className="product-cell">{detail.detail || ''}</td>
                                        <td className="num">{quantity ? quantity.toLocaleString() : ''}</td>
                                        <td className="center">{quantity ? '式' : ''}</td>
                                        <td className="num">{unitPrice ? unitPrice.toLocaleString() : ''}</td>
                                        <td className="num">{amount ? amount.toLocaleString() : ''}</td>
                                        <td className="center">【外　税】</td>
                                        <td className="small">{masterName(detail.medium_item)}</td>
                                    </tr>
                                );
                            })}

                            <tr>
                                <td>{invoiceMonthDay}</td>
                                <td></td>
                                <td className="small">【 消　費　税　等 】<br />（対象額　{subtotal.toLocaleString()}円）</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td className="num">{consumption.toLocaleString()}</td>
                                <td></td>
                            </tr>

                            <tr>
                                <td></td>
                                <td></td>
                                <td className="center">■　以下余白　■</td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>

                            {Array.from({ length: blankRows }).map((_, index) => (
                                <tr key={`blank-${index}`}>
                                    <td>&nbsp;</td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="page-count">1ページ中1ページ目</div>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Detail Modal
// ---------------------------------------------------------------------------

const InvoiceDetailModal: React.FC<{
    combined: CombinedInvoice;
    onClose: () => void;
    onMarkAsIssued: (combined: CombinedInvoice) => Promise<void>;
    onMarkAsPendingDelivery: (combined: CombinedInvoice) => Promise<void>;
    onMarkAsDeliverySent: (combined: CombinedInvoice) => Promise<void>;
    onMarkAsPaid: (combined: CombinedInvoice) => Promise<void>;
}> = ({ combined, onClose, onMarkAsIssued, onMarkAsPendingDelivery, onMarkAsDeliverySent, onMarkAsPaid }) => {
    const { invoice, project, customer, delivery, payment } = combined;
    const [details, setDetails] = useState<InvoiceDetailRow[]>([]);
    const [masterMap, setMasterMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isMarkingIssued, setIsMarkingIssued] = useState(false);
    const [isMarkingPendingDelivery, setIsMarkingPendingDelivery] = useState(false);
    const [isMarkingDeliverySent, setIsMarkingDeliverySent] = useState(false);
    const [isMarkingPaid, setIsMarkingPaid] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(false);

    const isIssued = combined.issue?.issue_status === 'issued';
    const hasDelivery = !!combined.delivery;
    const isPendingDelivery = delivery?.delivery_status === 'pending';
    const isDeliverySent = delivery?.delivery_status === 'sent';
    const isPaid = payment?.payment_status === 'paid';

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setIsLoading(true);
            setMasterMap({});

            try {
                const supabase = getSupabase();

                const { data, error } = await supabase
                    .from('invoice_details_legacy')
                    .select('row_uuid, invoice_uuid, record_no, major_item, medium_item, detail, quantity, unit_price, tax_rate')
                    .eq('invoice_uuid', invoice.row_uuid);

                if (error) {
                    logSupabaseError('invoice_details_legacy', error);
                    throw error;
                }

                const sorted = ((data || []) as InvoiceDetailRow[])
                    .slice()
                    .sort((a, b) => numOf(a.record_no) - numOf(b.record_no));

                if (!cancelled) {
                    setDetails(sorted);
                }

                const masterLegacyIds = Array.from(
                    new Set(
                        sorted
                            .flatMap((d) => [d.major_item, d.medium_item])
                            .filter((v): v is string => !!v)
                            .map((v) => String(v).trim()),
                    ),
                );

                if (masterLegacyIds.length > 0) {
                    const { data: masterData, error: masterError } = await supabase
                        .from('master_legacy')
                        .select('legacy_id, key_name, value')
                        .in('legacy_id', masterLegacyIds);

                    if (masterError) {
                        logSupabaseError('master_legacy', masterError);
                    } else if (!cancelled) {
                        const nextMasterMap: Record<string, string> = {};
                        ((masterData || []) as MasterLegacyRow[]).forEach((m) => {
                            const key = m.legacy_id ? String(m.legacy_id).trim() : '';
                            if (key) {
                                nextMasterMap[key] = m.value || key;
                            }
                        });
                        setMasterMap(nextMasterMap);
                    }
                } else if (!cancelled) {
                    setMasterMap({});
                }
            } catch (e) {
                console.error('[LegacyInvoiceBillingPage] failed to load invoice details', e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [invoice.row_uuid]);

    const masterName = (legacyId: string | null | undefined): string => {
        if (!legacyId) return '—';
        const key = String(legacyId).trim();
        return masterMap[key] || key;
    };

    const handleMarkAsIssued = async () => {
        const ok = window.confirm(
            `請求番号 ${invoice.invoice_id || '—'} を「発行済み」として登録します。\n\nこの処理ではPDF生成やメール送信は行いません。よろしいですか？`,
        );
        if (!ok) return;
        setIsMarkingIssued(true);
        try {
            await onMarkAsIssued(combined);
        } finally {
            setIsMarkingIssued(false);
        }
    };

    const handleMarkAsPendingDelivery = async () => {
        const ok = window.confirm(
            `請求番号 ${invoice.invoice_id || '—'} を「送付待ち」として登録します。\n\nこの処理では実際のメール送信・郵送処理は行いません。よろしいですか？`,
        );
        if (!ok) return;
        setIsMarkingPendingDelivery(true);
        try {
            await onMarkAsPendingDelivery(combined);
        } finally {
            setIsMarkingPendingDelivery(false);
        }
    };

    const handleMarkAsDeliverySent = async () => {
        const label = deliveryDoneButtonLabel(delivery?.delivery_method);
        const ok = window.confirm(
            `請求番号 ${invoice.invoice_id || '—'} を「${label.replace('にする', '')}」として登録します。\n\nこの処理では実際のメール送信は行わず、送付済みステータスに更新します。よろしいですか？`,
        );
        if (!ok) return;
        setIsMarkingDeliverySent(true);
        try {
            await onMarkAsDeliverySent(combined);
        } finally {
            setIsMarkingDeliverySent(false);
        }
    };

    const handleMarkAsPaid = async () => {
        const ok = window.confirm(
            `請求番号 ${invoice.invoice_id || '—'} を「入金確認済み」として登録します。\n\n請求合計額 ${JPY(invoice.total)} を入金済みとして登録します。よろしいですか？`,
        );
        if (!ok) return;
        setIsMarkingPaid(true);
        try {
            await onMarkAsPaid(combined);
        } finally {
            setIsMarkingPaid(false);
        }
    };


    const handleGenerateInvoiceExcel = async () => {
        if (details.length === 0) {
            window.alert('請求明細がないため、Excelを生成できません。');
            return;
        }

        setIsGeneratingExcel(true);

        try {
            const ExcelJS = await import('exceljs');
            const { saveAs } = await import('file-saver');

            const response = await fetch('/templates/invoice_format.xlsx');
            if (!response.ok) {
                throw new Error('請求書テンプレート /templates/invoice_format.xlsx を読み込めませんでした。');
            }

            const templateBuffer = await response.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(templateBuffer);

            const worksheet = workbook.getWorksheet('フォーマット') || workbook.worksheets[0];
            if (!worksheet) {
                throw new Error('請求書テンプレートに有効なシートがありません。');
            }

            const setCell = (address: string, value: string | number | null) => {
                worksheet.getCell(address).value = value;
            };

            const customerName = customer?.customer_name || '';
            const customerCode = customer?.customer_code || project?.customer_code || '';
            const postNo = customer?.post_no ? `〒${customer.post_no}` : '';
            const address = [customer?.address_1 || '', customer?.address_2 || ''].filter(Boolean).join(' ');
            const subtotal = numOf(invoice.subtotal);
            const consumption = numOf(invoice.consumption);
            const total = numOf(invoice.total);
            const invoiceDate = invoice.create_date || new Date().toISOString();

            // 宛先・請求日・顧客コード
            setCell('A1', postNo);
            setCell('A2', address);
            setCell('A3', customerName ? `${customerName}御中` : '');
            setCell('G5', formatJapaneseDateForInvoice(invoiceDate));
            setCell('G6', 'お客様コード');
            setCell('I6', customerCode);

            // 集計欄。テンプレート側の数式に依存せず、基幹請求データの値を直接入れます。
            setCell('A13', subtotal); // 10%対象
            setCell('C13', consumption); // 消費税額(10%)
            setCell('E13', 0); // 非課税対象
            setCell('F13', subtotal); // 御買上額(税抜)
            setCell('H13', 0); // 値引額(税抜)
            setCell('J13', consumption); // 消費税
            setCell('L13', total); // 今回御買上額
            setCell('N13', total); // 今回御請求額

            const startRow = 16;
            const maxDetailRows = 34; // 16〜49行目を明細エリアとして使用
            const clearColumns = ['A', 'B', 'C', 'G', 'H', 'I', 'K', 'M', 'O'];

            for (let i = 0; i < maxDetailRows; i += 1) {
                const rowNo = startRow + i;
                clearColumns.forEach((col) => {
                    worksheet.getCell(`${col}${rowNo}`).value = null;
                });
            }

            details.slice(0, maxDetailRows).forEach((detail, index) => {
                const rowNo = startRow + index;
                const quantity = numOf(detail.quantity);
                const unitPrice = numOf(detail.unit_price);
                const amount = quantity * unitPrice;
                const tax = taxAmountOf(amount, detail.tax_rate);

                setCell(`A${rowNo}`, formatJapaneseMonthDay(invoice.delivery_date || invoice.create_date));
                setCell(`B${rowNo}`, masterName(detail.major_item));
                setCell(`C${rowNo}`, detail.detail || '');
                setCell(`G${rowNo}`, quantity || null);
                setCell(`H${rowNo}`, '');
                setCell(`I${rowNo}`, unitPrice || null);
                setCell(`K${rowNo}`, amount || null);
                setCell(`M${rowNo}`, tax || null);
                setCell(`O${rowNo}`, detail.tax_rate ? `${detail.tax_rate}%対象` : '');
            });

            const remainingRow = startRow + details.length;
            if (remainingRow < startRow + maxDetailRows) {
                setCell(`C${remainingRow}`, '■　以下余白　■');
            }

            if (details.length > maxDetailRows) {
                window.alert(`明細が${details.length}行あります。テンプレートに収まる先頭${maxDetailRows}行のみ出力しました。`);
            }

            const fileName = sanitizeFileName(`請求書_${invoice.invoice_id || 'no'}_${customerName || 'customer'}.xlsx`);
            const outputBuffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([outputBuffer as BlobPart], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            saveAs(blob, fileName);
        } catch (e) {
            console.error('[LegacyInvoiceBillingPage] failed to generate invoice Excel', e);
            window.alert(e instanceof Error ? e.message : '請求書Excelの生成に失敗しました。');
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">請求書詳細</h2>
                        <p className="text-sm text-slate-500">請求番号: {invoice.invoice_id || '—'}</p>
                        <p className="text-sm text-slate-500">受注番号: {project?.order_code || invoice.order_id || '—'}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="閉じる">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div>
                            <p className="text-sm font-medium text-slate-500">顧客名</p>
                            <p className="font-semibold text-slate-900 dark:text-white">{customer?.customer_name || '—'}</p>
                            <p className="text-sm text-slate-500 mt-1">{customerAddress(customer)}</p>
                        </div>
                        <div className="sm:text-right">
                            <p className="text-sm font-medium text-slate-500">納品日</p>
                            <p className="font-semibold text-slate-900 dark:text-white">{formatDate(invoice.delivery_date)}</p>
                            <p className="text-sm text-slate-500 mt-1">
                                締日: {customer?.closing_day || '—'} / 支払日: {customer?.pay_day || customer?.bill_payment_day || '—'}
                            </p>
                        </div>
                    </div>

                    <div className="mb-4 text-sm whitespace-pre-wrap">
                        <span className="font-medium text-slate-500">品名: </span>
                        <span className="text-slate-700 dark:text-slate-300">{invoiceProductName(combined)}</span>
                    </div>

                    {invoice.specification && (
                        <div className="mb-4 text-sm whitespace-pre-wrap">
                            <span className="font-medium text-slate-500">仕様: </span>
                            <span className="text-slate-700 dark:text-slate-300">{invoice.specification}</span>
                        </div>
                    )}

                    {invoice.note && (
                        <div className="mb-4 text-sm whitespace-pre-wrap">
                            <span className="font-medium text-slate-500">備考: </span>
                            <span className="text-slate-700 dark:text-slate-300">{invoice.note}</span>
                        </div>
                    )}

                    {delivery && (
                        <div className="mb-6 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Send className="w-4 h-4 text-blue-600" />
                                    送付情報
                                </h3>
                                <StatusBadge status={delivery.delivery_status} kind="delivery" method={delivery.delivery_method} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">送付方法</p>
                                    <p className="text-slate-900 dark:text-white">{deliveryMethodLabel(delivery.delivery_method)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">送付済み日時</p>
                                    <p className="text-slate-900 dark:text-white">{formatDateTime(delivery.sent_at)}</p>
                                </div>

                                {delivery.delivery_method === 'email' && (
                                    <>
                                        <div>
                                            <p className="text-xs font-medium text-slate-500">宛先</p>
                                            <p className="text-slate-900 dark:text-white">{delivery.to_email || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-slate-500">CC / BCC</p>
                                            <p className="text-slate-900 dark:text-white">
                                                CC: {delivery.cc_email || '—'} / BCC: {delivery.bcc_email || '—'}
                                            </p>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <p className="text-xs font-medium text-slate-500">件名</p>
                                            <p className="text-slate-900 dark:text-white">{delivery.subject || '—'}</p>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <p className="text-xs font-medium text-slate-500">本文</p>
                                            <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                                                {delivery.body || '—'}
                                            </pre>
                                        </div>
                                    </>
                                )}

                                <div className="sm:col-span-2">
                                    <p className="text-xs font-medium text-slate-500">添付ファイル名</p>
                                    <p className="text-slate-900 dark:text-white">{delivery.attachment_file_name || '—'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {payment && (
                        <div className="mb-6 rounded-xl border border-green-100 dark:border-green-900/50 bg-green-50/60 dark:bg-green-950/20 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-green-600" />
                                    入金情報
                                </h3>
                                <StatusBadge status={payment.payment_status} kind="payment" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">請求額</p>
                                    <p className="text-slate-900 dark:text-white">{JPY(payment.expected_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">入金額</p>
                                    <p className="text-slate-900 dark:text-white">{JPY(payment.paid_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">差額</p>
                                    <p className="text-slate-900 dark:text-white">{JPY(payment.balance_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">入金日</p>
                                    <p className="text-slate-900 dark:text-white">{formatDate(payment.payment_date)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">確認日時</p>
                                    <p className="text-slate-900 dark:text-white">{formatDateTime(payment.matched_at)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500">確認方法</p>
                                    <p className="text-slate-900 dark:text-white">
                                        {payment.payment_source === 'manual' ? '手動登録' : payment.payment_source || '—'}
                                    </p>
                                </div>
                                {payment.note && (
                                    <div className="sm:col-span-2">
                                        <p className="text-xs font-medium text-slate-500">備考</p>
                                        <p className="text-slate-900 dark:text-white">{payment.note}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50">
                                <tr>
                                    <th className="px-3 py-2">No</th>
                                    <th className="px-3 py-2">大項目</th>
                                    <th className="px-3 py-2">中項目</th>
                                    <th className="px-3 py-2">明細</th>
                                    <th className="px-3 py-2 text-right">数量</th>
                                    <th className="px-3 py-2 text-right">単価</th>
                                    <th className="px-3 py-2 text-right">税率</th>
                                    <th className="px-3 py-2 text-right">金額</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={8} className="text-center p-10">
                                            <Loader className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                        </td>
                                    </tr>
                                ) : details.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center p-10 text-slate-500">
                                            明細データがありません。
                                        </td>
                                    </tr>
                                ) : (
                                    details.map((d) => {
                                        const amount = numOf(d.quantity) * numOf(d.unit_price);
                                        return (
                                            <tr key={d.row_uuid} className="border-t border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                                                <td className="px-3 py-2">{d.record_no || '—'}</td>
                                                <td className="px-3 py-2">{masterName(d.major_item)}</td>
                                                <td className="px-3 py-2">{masterName(d.medium_item)}</td>
                                                <td className="px-3 py-2">{d.detail || '—'}</td>
                                                <td className="px-3 py-2 text-right">{numOf(d.quantity).toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right">{JPY(d.unit_price)}</td>
                                                <td className="px-3 py-2 text-right">{d.tax_rate ? `${d.tax_rate}%` : '—'}</td>
                                                <td className="px-3 py-2 text-right font-medium">{JPY(amount)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex justify-end">
                        <div className="w-64 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-slate-500">小計</span>
                                <span className="text-slate-900 dark:text-white">{JPY(invoice.subtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">消費税</span>
                                <span className="text-slate-900 dark:text-white">{JPY(invoice.consumption)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-lg border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                                <span className="text-slate-900 dark:text-white">合計</span>
                                <span className="text-slate-900 dark:text-white">{JPY(invoice.total)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-end gap-3">
                    <div className="flex items-center gap-2 mr-auto">
                        <StatusBadge status={combined.issue?.issue_status} kind="issue" />
                        <StatusBadge status={combined.delivery?.delivery_status} kind="delivery" method={combined.delivery?.delivery_method} />
                        <StatusBadge status={combined.payment?.payment_status} kind="payment" />
                    </div>

                    <button onClick={() => setShowPdfPreview(true)} disabled={isLoading || details.length === 0} className="flex items-center gap-2 bg-slate-800 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-900 disabled:bg-slate-400">
                        <FileText className="w-5 h-5" />
                        請求書PDFプレビュー
                    </button>

                    {!isIssued && (
                        <button onClick={handleMarkAsIssued} disabled={isMarkingIssued} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-slate-400">
                            {isMarkingIssued ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                            発行済みとして登録
                        </button>
                    )}

                    {isIssued && !hasDelivery && (
                        <button onClick={handleMarkAsPendingDelivery} disabled={isMarkingPendingDelivery} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                            {isMarkingPendingDelivery ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            送付待ちにする
                        </button>
                    )}

                    {isIssued && isPendingDelivery && (
                        <button onClick={handleMarkAsDeliverySent} disabled={isMarkingDeliverySent} className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-slate-400">
                            {isMarkingDeliverySent ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                            {deliveryDoneButtonLabel(delivery?.delivery_method)}
                        </button>
                    )}

                    {isIssued && isDeliverySent && !isPaid && (
                        <button onClick={handleMarkAsPaid} disabled={isMarkingPaid} className="flex items-center gap-2 bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:bg-slate-400">
                            {isMarkingPaid ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                            入金確認済みにする
                        </button>
                    )}

                    <button onClick={onClose} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                        閉じる
                    </button>
                </div>
            </div>
            {showPdfPreview && (
                <InvoicePdfPreviewModal
                    combined={combined}
                    details={details}
                    masterName={masterName}
                    onClose={() => setShowPdfPreview(false)}
                />
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Customer Billing Settings Modal
// ---------------------------------------------------------------------------

const emptySetting = (): Partial<BillingSettingRow> => ({
    customer_id: null,
    customer_code: '',
    customer_name: '',
    delivery_method: 'email',
    billing_email: '',
    billing_cc: '',
    billing_bcc: '',
    email_subject_template: DEFAULT_EMAIL_SUBJECT_TEMPLATE,
    email_body_template: DEFAULT_EMAIL_BODY_TEMPLATE,
    attachment_name_template: DEFAULT_ATTACHMENT_NAME_TEMPLATE,
    requires_manual_review: true,
    notes: '',
    is_active: true,
});

const BillingSettingModal: React.FC<{
    setting: Partial<BillingSettingRow> | null;
    onClose: () => void;
    onSaved: () => void;
}> = ({ setting, onClose, onSaved }) => {
    const initialSetting: Partial<BillingSettingRow> = {
        ...emptySetting(),
        ...(setting || {}),
        attachment_name_template: setting?.attachment_name_template || DEFAULT_ATTACHMENT_NAME_TEMPLATE,
        email_subject_template: setting?.email_subject_template || DEFAULT_EMAIL_SUBJECT_TEMPLATE,
        email_body_template: setting?.email_body_template || DEFAULT_EMAIL_BODY_TEMPLATE,
    };

    const [form, setForm] = useState<Partial<BillingSettingRow>>(initialSetting);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customerSearchTerm, setCustomerSearchTerm] = useState(
        `${initialSetting.customer_code || ''} ${initialSetting.customer_name || ''}`.trim(),
    );
    const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(
        initialSetting.customer_id
            ? {
                  id: initialSetting.customer_id,
                  customer_code: initialSetting.customer_code || null,
                  customer_name: initialSetting.customer_name || null,
                  post_no: null,
                  address_1: null,
                  address_2: null,
              }
            : null,
    );

    const update = (key: keyof BillingSettingRow, value: string | boolean | null) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const inputClass =
        'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

    const searchCustomers = async () => {
        const q = customerSearchTerm.trim();
        if (!q) {
            setCustomerSearchResults([]);
            setError('顧客コードまたは顧客名を入力して検索してください。');
            return;
        }

        setIsSearchingCustomer(true);
        setError(null);

        try {
            const supabase = getSupabase();
            const safeKeyword = q.replace(/[%_]/g, '');
            const { data, error } = await supabase
                .from('customers')
                .select('id, customer_code, customer_name, post_no, address_1, address_2')
                .or(`customer_code.ilike.%${safeKeyword}%,customer_name.ilike.%${safeKeyword}%`)
                .order('customer_code', { ascending: true })
                .limit(20);

            if (error) {
                logSupabaseError('customers search', error);
                throw error;
            }

            setCustomerSearchResults((data || []) as CustomerSearchResult[]);
            if (!data || data.length === 0) {
                setError('該当する顧客が見つかりませんでした。');
            }
        } catch (e) {
            console.error('[LegacyInvoiceBillingPage] failed to search customers', e);
            setError(e instanceof Error ? e.message : '顧客検索に失敗しました。');
        } finally {
            setIsSearchingCustomer(false);
        }
    };

    const selectCustomer = (customer: CustomerSearchResult) => {
        setSelectedCustomer(customer);
        setCustomerSearchResults([]);
        setCustomerSearchTerm(`${customer.customer_code || ''} ${customer.customer_name || ''}`.trim());
        setForm((prev) => ({
            ...prev,
            customer_id: customer.id,
            customer_code: customer.customer_code,
            customer_name: customer.customer_name,
        }));
    };

    const clearCustomer = () => {
        setSelectedCustomer(null);
        setCustomerSearchTerm('');
        setCustomerSearchResults([]);
        setForm((prev) => ({
            ...prev,
            customer_id: null,
            customer_code: '',
            customer_name: '',
        }));
    };

    const handleSave = async () => {
        if (!form.customer_id) {
            setError('顧客を検索して選択してください。');
            return;
        }
        if (!form.billing_email && form.delivery_method === 'email') {
            setError('送信方法がメールの場合は、請求先メールを入力してください。');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const supabase = getSupabase();
            const payload = {
                customer_id: form.customer_id ?? null,
                customer_code: form.customer_code || null,
                customer_name: form.customer_name || null,
                delivery_method: form.delivery_method || 'email',
                billing_email: form.billing_email || null,
                billing_cc: form.billing_cc || null,
                billing_bcc: form.billing_bcc || null,
                email_subject_template: form.email_subject_template || DEFAULT_EMAIL_SUBJECT_TEMPLATE,
                email_body_template: form.email_body_template || DEFAULT_EMAIL_BODY_TEMPLATE,
                attachment_name_template: form.attachment_name_template || DEFAULT_ATTACHMENT_NAME_TEMPLATE,
                requires_manual_review: form.requires_manual_review ?? true,
                notes: form.notes || null,
                is_active: form.is_active ?? true,
            };

            if (form.id) {
                const { error } = await supabase.from('customer_billing_settings').update(payload).eq('id', form.id);
                if (error) {
                    logSupabaseError('customer_billing_settings update', error);
                    throw error;
                }
            } else {
                const { error } = await supabase.from('customer_billing_settings').insert(payload);
                if (error) {
                    logSupabaseError('customer_billing_settings insert', error);
                    throw error;
                }
            }

            onSaved();
        } catch (e) {
            console.error('[LegacyInvoiceBillingPage] failed to save billing setting', e);
            setError(e instanceof Error ? e.message : '保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {form.id ? '顧客別請求設定の編集' : '顧客別請求設定の新規登録'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="閉じる">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">顧客検索</label>
                        <div className="flex gap-2">
                            <input
                                className={inputClass}
                                value={customerSearchTerm}
                                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        searchCustomers();
                                    }
                                }}
                                placeholder="顧客コードまたは顧客名で検索"
                            />
                            <button type="button" onClick={searchCustomers} disabled={isSearchingCustomer} className="whitespace-nowrap flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:bg-slate-300">
                                {isSearchingCustomer ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                検索
                            </button>
                        </div>

                        {customerSearchResults.length > 0 && (
                            <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                {customerSearchResults.map((customer) => (
                                    <button key={customer.id} type="button" onClick={() => selectCustomer(customer)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-b-0 border-slate-100 dark:border-slate-700">
                                        <div className="font-semibold text-slate-900 dark:text-white">
                                            {customer.customer_code || '—'}　{customer.customer_name || '—'}
                                        </div>
                                        <div className="text-xs text-slate-500">{customerAddress(customer)}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex justify-between items-start gap-3">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 mb-1">選択中の顧客</p>
                                    {form.customer_id ? (
                                        <>
                                            <p className="font-semibold text-slate-900 dark:text-white">
                                                {form.customer_code || '—'}　{form.customer_name || '—'}
                                            </p>
                                            {selectedCustomer && <p className="text-xs text-slate-500 mt-1">{customerAddress(selectedCustomer)}</p>}
                                        </>
                                    ) : (
                                        <p className="text-sm text-slate-500">未選択</p>
                                    )}
                                </div>
                                {form.customer_id && (
                                    <button type="button" onClick={clearCustomer} className="text-xs text-red-600 hover:underline">
                                        選択解除
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">送信方法</label>
                        <select className={inputClass} value={form.delivery_method || 'email'} onChange={(e) => update('delivery_method', e.target.value)}>
                            <option value="email">メール</option>
                            <option value="post">郵送</option>
                            <option value="manual">手動</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">請求先メール</label>
                            <input className={inputClass} value={form.billing_email || ''} onChange={(e) => update('billing_email', e.target.value)} placeholder="billing@example.com" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">CC</label>
                            <input className={inputClass} value={form.billing_cc || ''} onChange={(e) => update('billing_cc', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">BCC</label>
                            <input className={inputClass} value={form.billing_bcc || ''} onChange={(e) => update('billing_bcc', e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">添付ファイル名テンプレート</label>
                        <input className={inputClass} value={form.attachment_name_template || ''} onChange={(e) => update('attachment_name_template', e.target.value)} placeholder="例：請求書_{{invoice_id}}_{{customer_name}}.pdf" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">メール件名テンプレート</label>
                        <input className={inputClass} value={form.email_subject_template || ''} onChange={(e) => update('email_subject_template', e.target.value)} placeholder="例：【請求書送付】{{customer_name}} 御中 請求書のご送付" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">メール本文テンプレート</label>
                        <textarea className={`${inputClass} min-h-[100px]`} value={form.email_body_template || ''} onChange={(e) => update('email_body_template', e.target.value)} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">備考</label>
                        <textarea className={`${inputClass} min-h-[60px]`} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} />
                    </div>

                    <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={!!form.requires_manual_review} onChange={(e) => update('requires_manual_review', e.target.checked)} />
                            手動確認が必要
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => update('is_active', e.target.checked)} />
                            有効
                        </label>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                        キャンセル
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-slate-400">
                        {isSaving ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'unissued', label: '未発行', icon: FileText },
    { id: 'issued', label: '発行済み', icon: CheckCircle },
    { id: 'pending_send', label: '送付待ち', icon: Clock },
    { id: 'sent', label: '送付済み', icon: Send },
    { id: 'paid', label: '入金確認', icon: Mail },
    { id: 'settings', label: '顧客別設定', icon: Settings },
];

const LegacyInvoiceBillingPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('unissued');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [invoices, setInvoices] = useState<InvoiceLegacyRow[]>([]);
    const [projects, setProjects] = useState<Record<string, ProjectLegacyRow>>({});
    const [customers, setCustomers] = useState<Record<string, CustomerRow>>({});
    const [users, setUsers] = useState<Record<string, UserRow>>({});
    const [issues, setIssues] = useState<Record<string, IssueRecordRow>>({});
    const [deliveries, setDeliveries] = useState<Record<string, DeliveryRecordRow>>({});
    const [payments, setPayments] = useState<Record<string, PaymentMatchRow>>({});
    const [settings, setSettings] = useState<BillingSettingRow[]>([]);
    const [editingSetting, setEditingSetting] = useState<Partial<BillingSettingRow> | null>(null);
    const [selected, setSelected] = useState<CombinedInvoice | null>(null);

    const loadInvoiceData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const supabase = getSupabase();
            const { data: invoicesData, error: invoicesError } = await supabase
                .from('invoices_legacy')
                .select('row_uuid, invoice_id, order_id, project_id, project_uuid, customer_uuid, delivery_date, specification, subtotal, consumption, total, note, pattern_name, status, create_date')
                .order('create_date', { ascending: false })
                .limit(500);

            if (invoicesError) {
                logSupabaseError('invoices_legacy', invoicesError);
                throw invoicesError;
            }

            const invoiceRows = (invoicesData || []) as InvoiceLegacyRow[];
            setInvoices(invoiceRows);

            const projectUuids = Array.from(new Set(invoiceRows.map((invoice) => invoice.project_uuid).filter((id): id is string => !!id)));
            const projectIds = Array.from(new Set(invoiceRows.map((invoice) => invoice.project_id).filter((id): id is string => !!id)));
            const mergedProjectMap: Record<string, ProjectLegacyRow> = {};

            if (projectUuids.length > 0) {
                const { data, error: projectsByUuidError } = await supabase
                    .from('projects_legacy')
                    .select('id, project_id, project_code, order_id, order_code, project_name, customer_id, customer_code, sales_user_id, sales_user_code')
                    .in('id', projectUuids);

                if (projectsByUuidError) {
                    logSupabaseError('projects_legacy by id', projectsByUuidError);
                    throw projectsByUuidError;
                }

                ((data || []) as ProjectLegacyRow[]).forEach((p) => {
                    if (p.id) mergedProjectMap[p.id] = p;
                    if (p.project_id) mergedProjectMap[p.project_id] = p;
                });
            }

            if (projectIds.length > 0) {
                const { data, error: projectsByProjectIdError } = await supabase
                    .from('projects_legacy')
                    .select('id, project_id, project_code, order_id, order_code, project_name, customer_id, customer_code, sales_user_id, sales_user_code')
                    .in('project_id', projectIds);

                if (projectsByProjectIdError) {
                    logSupabaseError('projects_legacy by project_id', projectsByProjectIdError);
                    throw projectsByProjectIdError;
                }

                ((data || []) as ProjectLegacyRow[]).forEach((p) => {
                    if (p.id) mergedProjectMap[p.id] = p;
                    if (p.project_id) mergedProjectMap[p.project_id] = p;
                });
            }

            setProjects(mergedProjectMap);

            const customerIds = Array.from(
                new Set(
                    invoiceRows
                        .map((invoice) => {
                            const project =
                                (invoice.project_uuid ? mergedProjectMap[invoice.project_uuid] : null) ||
                                (invoice.project_id ? mergedProjectMap[invoice.project_id] : null) ||
                                null;
                            return project?.customer_id || invoice.customer_uuid;
                        })
                        .filter((id): id is string => !!id),
                ),
            );

            let customersData: CustomerRow[] = [];
            if (customerIds.length > 0) {
                const { data, error: customersError } = await supabase
                    .from('customers')
                    .select('id, customer_code, customer_name, post_no, address_1, address_2, closing_day, pay_day, bill_payment_day')
                    .in('id', customerIds);

                if (customersError) {
                    logSupabaseError('customers', customersError);
                    throw customersError;
                }
                customersData = (data || []) as CustomerRow[];
            }

            const custMap: Record<string, CustomerRow> = {};
            customersData.forEach((c) => {
                custMap[c.id] = c;
            });
            setCustomers(custMap);

            const salesUserIds = Array.from(
                new Set(Object.values(mergedProjectMap).map((p) => p.sales_user_id).filter((id): id is string => !!id)),
            );
            const salesUserCodes = Array.from(
                new Set(Object.values(mergedProjectMap).map((p) => p.sales_user_code).filter((code): code is string => !!code)),
            );
            const userMap: Record<string, UserRow> = {};

            if (salesUserIds.length > 0) {
                const { data, error: usersByIdError } = await supabase
                    .from('users')
                    .select('id, user_code, name')
                    .in('id', salesUserIds);

                if (usersByIdError) {
                    logSupabaseError('users by id', usersByIdError);
                } else {
                    ((data || []) as UserRow[]).forEach((u) => {
                        if (u.id) userMap[u.id] = u;
                        if (u.user_code) userMap[u.user_code] = u;
                    });
                }
            }

            if (salesUserCodes.length > 0) {
                const { data, error: usersByCodeError } = await supabase
                    .from('users')
                    .select('id, user_code, name')
                    .in('user_code', salesUserCodes);

                if (usersByCodeError) {
                    logSupabaseError('users by user_code', usersByCodeError);
                } else {
                    ((data || []) as UserRow[]).forEach((u) => {
                        if (u.id) userMap[u.id] = u;
                        if (u.user_code) userMap[u.user_code] = u;
                    });
                }
            }

            setUsers(userMap);

            const { data: issueData, error: issueError } = await supabase
                .from('invoice_issue_records')
                .select('id, legacy_invoice_id, invoice_no, issue_status, issued_at, issue_count');

            if (issueError) {
                logSupabaseError('invoice_issue_records', issueError);
                setIssues({});
            } else {
                const issueMap: Record<string, IssueRecordRow> = {};
                ((issueData || []) as IssueRecordRow[]).forEach((r) => {
                    if (r.legacy_invoice_id) issueMap[r.legacy_invoice_id] = r;
                    if (r.invoice_no) issueMap[r.invoice_no] = r;
                });
                setIssues(issueMap);
            }

            const { data: deliveryData, error: deliveryError } = await supabase
                .from('invoice_delivery_records')
                .select('id, legacy_invoice_id, invoice_no, issue_record_id, delivery_method, delivery_status, to_email, cc_email, bcc_email, subject, body, attachment_file_name, sent_at');

            if (deliveryError) {
                logSupabaseError('invoice_delivery_records', deliveryError);
                setDeliveries({});
            } else {
                const deliveryMap: Record<string, DeliveryRecordRow> = {};
                ((deliveryData || []) as DeliveryRecordRow[]).forEach((r) => {
                    if (r.legacy_invoice_id) deliveryMap[r.legacy_invoice_id] = r;
                    if (r.invoice_no) deliveryMap[r.invoice_no] = r;
                });
                setDeliveries(deliveryMap);
            }

            const { data: paymentData, error: paymentError } = await supabase
                .from('invoice_payment_matches')
                .select('id, legacy_invoice_id, invoice_no, customer_code, customer_name, expected_amount, paid_amount, balance_amount, payment_status, payment_date, matched_at, payment_source, payment_reference, note');

            if (paymentError) {
                logSupabaseError('invoice_payment_matches', paymentError);
                setPayments({});
            } else {
                const paymentMap: Record<string, PaymentMatchRow> = {};
                ((paymentData || []) as PaymentMatchRow[]).forEach((r) => {
                    if (r.legacy_invoice_id) paymentMap[r.legacy_invoice_id] = r;
                    if (r.invoice_no) paymentMap[r.invoice_no] = r;
                });
                setPayments(paymentMap);
            }
        } catch (e) {
            console.error('[LegacyInvoiceBillingPage] failed to load legacy invoices', e);
            setError(e instanceof Error ? e.message : '請求データの取得に失敗しました。');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('customer_billing_settings')
                .select('id, customer_id, customer_code, customer_name, delivery_method, billing_email, billing_cc, billing_bcc, email_subject_template, email_body_template, attachment_name_template, requires_manual_review, notes, is_active')
                .order('customer_code', { ascending: true });

            if (error) {
                logSupabaseError('customer_billing_settings', error);
                throw error;
            }
            setSettings((data || []) as BillingSettingRow[]);
        } catch (e) {
            console.error('[LegacyInvoiceBillingPage] failed to load billing settings', e);
            setError(e instanceof Error ? e.message : '顧客別設定の取得に失敗しました。');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'settings') {
            loadSettings();
        } else {
            loadInvoiceData();
        }
    }, [activeTab, loadInvoiceData, loadSettings]);

    const combinedInvoices = useMemo<CombinedInvoice[]>(() => {
        return invoices.map((invoice) => {
            const project =
                (invoice.project_uuid ? projects[invoice.project_uuid] : null) ||
                (invoice.project_id ? projects[invoice.project_id] : null) ||
                null;
            const customerId = project?.customer_id || invoice.customer_uuid || null;
            const customer = customerId ? customers[customerId] || null : null;
            const salesUser = project?.sales_user_id
                ? users[project.sales_user_id] || null
                : project?.sales_user_code
                  ? users[project.sales_user_code] || null
                  : null;

            return {
                invoice,
                project,
                customer,
                salesUser,
                issue: getRecordByInvoice(issues, invoice),
                delivery: getRecordByInvoice(deliveries, invoice),
                payment: getRecordByInvoice(payments, invoice),
            };
        });
    }, [invoices, projects, customers, users, issues, deliveries, payments]);

    const filteredInvoices = useMemo(() => {
        let rows = combinedInvoices;

        if (activeTab === 'unissued') {
            rows = rows.filter((r) => !r.issue || !r.issue.issue_status || r.issue.issue_status === 'not_issued' || r.issue.issue_status === 'draft');
        } else if (activeTab === 'issued') {
            rows = rows.filter((r) => r.issue?.issue_status === 'issued');
        } else if (activeTab === 'pending_send') {
            rows = rows.filter((r) => r.issue?.issue_status === 'issued' && r.delivery?.delivery_status === 'pending');
        } else if (activeTab === 'sent') {
            rows = rows.filter((r) => r.delivery?.delivery_status === 'sent');
        } else if (activeTab === 'paid') {
            rows = rows.filter((r) => r.payment?.payment_status === 'paid' || r.payment?.payment_status === 'partial');
        }

        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            rows = rows.filter((r) =>
                (r.invoice.invoice_id || '').toLowerCase().includes(q) ||
                invoiceOrderCode(r).toLowerCase().includes(q) ||
                invoiceCustomerName(r).toLowerCase().includes(q) ||
                invoiceProductName(r).toLowerCase().includes(q),
            );
        }

        return rows;
    }, [combinedInvoices, activeTab, searchTerm]);

    const filteredSettings = useMemo(() => {
        if (!searchTerm.trim()) return settings;
        const q = searchTerm.trim().toLowerCase();
        return settings.filter(
            (s) =>
                (s.customer_code || '').toLowerCase().includes(q) ||
                (s.customer_name || '').toLowerCase().includes(q) ||
                (s.billing_email || '').toLowerCase().includes(q),
        );
    }, [settings, searchTerm]);

    const fetchBillingSettingForInvoice = async (combined: CombinedInvoice): Promise<BillingSettingRow | null> => {
        const supabase = getSupabase();
        const customer = combined.customer;
        if (!customer) return null;

        const baseSelect =
            'id, customer_id, customer_code, customer_name, delivery_method, billing_email, billing_cc, billing_bcc, email_subject_template, email_body_template, attachment_name_template, requires_manual_review, notes, is_active';

        if (customer.id) {
            const { data, error } = await supabase
                .from('customer_billing_settings')
                .select(baseSelect)
                .eq('is_active', true)
                .eq('customer_id', customer.id)
                .limit(1);
            if (error) {
                logSupabaseError('customer_billing_settings by customer_id', error);
                throw error;
            }
            if (data && data.length > 0) return data[0] as BillingSettingRow;
        }

        if (customer.customer_code) {
            const { data, error } = await supabase
                .from('customer_billing_settings')
                .select(baseSelect)
                .eq('is_active', true)
                .eq('customer_code', customer.customer_code)
                .limit(1);
            if (error) {
                logSupabaseError('customer_billing_settings by customer_code', error);
                throw error;
            }
            if (data && data.length > 0) return data[0] as BillingSettingRow;
        }

        if (customer.customer_name) {
            const { data, error } = await supabase
                .from('customer_billing_settings')
                .select(baseSelect)
                .eq('is_active', true)
                .eq('customer_name', customer.customer_name)
                .limit(1);
            if (error) {
                logSupabaseError('customer_billing_settings by customer_name', error);
                throw error;
            }
            if (data && data.length > 0) return data[0] as BillingSettingRow;
        }

        return null;
    };

    const handleMarkAsIssued = useCallback(
        async (combined: CombinedInvoice) => {
            const supabase = getSupabase();
            const now = new Date().toISOString();
            const { invoice, customer } = combined;

            try {
                if (combined.issue?.id) {
                    const { error } = await supabase
                        .from('invoice_issue_records')
                        .update({
                            issue_status: 'issued',
                            issued_at: combined.issue.issued_at || now,
                            last_issued_at: now,
                            issue_count: (combined.issue.issue_count || 0) + 1,
                            customer_code: customer?.customer_code || null,
                            customer_name: customer?.customer_name || null,
                            note: '手動で発行済みに登録',
                        })
                        .eq('id', combined.issue.id);
                    if (error) {
                        logSupabaseError('invoice_issue_records update issued', error);
                        throw error;
                    }
                } else {
                    const { error } = await supabase.from('invoice_issue_records').insert({
                        legacy_invoice_id: invoice.row_uuid,
                        invoice_no: invoice.invoice_id,
                        customer_code: customer?.customer_code || null,
                        customer_name: customer?.customer_name || null,
                        issue_status: 'issued',
                        issued_at: now,
                        last_issued_at: now,
                        issue_count: 1,
                        note: '手動で発行済みに登録',
                    });
                    if (error) {
                        logSupabaseError('invoice_issue_records insert issued', error);
                        throw error;
                    }
                }

                setSelected(null);
                await loadInvoiceData();
                setActiveTab('issued');
            } catch (e) {
                console.error('[LegacyInvoiceBillingPage] failed to mark invoice as issued', e);
                setError(e instanceof Error ? e.message : '発行済み登録に失敗しました。');
                throw e;
            }
        },
        [loadInvoiceData],
    );

    const handleMarkAsPendingDelivery = useCallback(
        async (combined: CombinedInvoice) => {
            const supabase = getSupabase();

            try {
                if (combined.issue?.issue_status !== 'issued' || !combined.issue?.id) {
                    throw new Error('先に発行済みとして登録してください。');
                }

                const setting = await fetchBillingSettingForInvoice(combined);
                if (!setting) {
                    throw new Error('この顧客の有効な顧客別設定が見つかりません。先に顧客別設定を登録してください。');
                }

                const method = setting.delivery_method || 'email';
                if (method === 'email' && !setting.billing_email) {
                    throw new Error('送信方法がメールですが、請求先メールが設定されていません。');
                }

                const subjectTemplate = setting.email_subject_template || DEFAULT_EMAIL_SUBJECT_TEMPLATE;
                const bodyTemplate = setting.email_body_template || DEFAULT_EMAIL_BODY_TEMPLATE;
                const attachmentNameTemplate = setting.attachment_name_template || DEFAULT_ATTACHMENT_NAME_TEMPLATE;
                const payload = {
                    legacy_invoice_id: combined.invoice.row_uuid,
                    invoice_no: combined.invoice.invoice_id,
                    issue_record_id: combined.issue.id,
                    delivery_method: method,
                    delivery_status: 'pending',
                    to_email: method === 'email' ? setting.billing_email : null,
                    cc_email: method === 'email' ? setting.billing_cc : null,
                    bcc_email: method === 'email' ? setting.billing_bcc : null,
                    subject: method === 'email' ? renderTemplate(subjectTemplate, combined) : null,
                    body: method === 'email' ? renderTemplate(bodyTemplate, combined) : null,
                    attachment_file_name: renderTemplate(attachmentNameTemplate, combined),
                    error_message: null,
                    sent_at: null,
                };

                if (combined.delivery?.id) {
                    const { error } = await supabase.from('invoice_delivery_records').update(payload).eq('id', combined.delivery.id);
                    if (error) {
                        logSupabaseError('invoice_delivery_records update pending', error);
                        throw error;
                    }
                } else {
                    const { error } = await supabase.from('invoice_delivery_records').insert(payload);
                    if (error) {
                        logSupabaseError('invoice_delivery_records insert pending', error);
                        throw error;
                    }
                }

                setSelected(null);
                await loadInvoiceData();
                setActiveTab('pending_send');
            } catch (e) {
                console.error('[LegacyInvoiceBillingPage] failed to mark invoice as pending delivery', e);
                setError(e instanceof Error ? e.message : '送付待ち登録に失敗しました。');
                throw e;
            }
        },
        [loadInvoiceData],
    );

    const handleMarkAsDeliverySent = useCallback(
        async (combined: CombinedInvoice) => {
            const supabase = getSupabase();

            try {
                if (!combined.delivery?.id) {
                    throw new Error('送付待ちレコードが見つかりません。');
                }

                const now = new Date().toISOString();
                const { error } = await supabase
                    .from('invoice_delivery_records')
                    .update({ delivery_status: 'sent', sent_at: now, error_message: null })
                    .eq('id', combined.delivery.id);

                if (error) {
                    logSupabaseError('invoice_delivery_records update sent', error);
                    throw error;
                }

                setSelected(null);
                await loadInvoiceData();
                setActiveTab('sent');
            } catch (e) {
                console.error('[LegacyInvoiceBillingPage] failed to mark delivery as sent', e);
                setError(e instanceof Error ? e.message : '送付済み登録に失敗しました。');
                throw e;
            }
        },
        [loadInvoiceData],
    );

    const handleMarkAsPaid = useCallback(
        async (combined: CombinedInvoice) => {
            const supabase = getSupabase();

            try {
                if (combined.delivery?.delivery_status !== 'sent') {
                    throw new Error('先に送付済みにしてください。');
                }

                const now = new Date().toISOString();
                const paymentDate = todayDateString();
                const total = numOf(combined.invoice.total);
                const payload = {
                    legacy_invoice_id: combined.invoice.row_uuid,
                    invoice_no: combined.invoice.invoice_id,
                    customer_code: combined.customer?.customer_code || combined.project?.customer_code || null,
                    customer_name: combined.customer?.customer_name || null,
                    expected_amount: total,
                    paid_amount: total,
                    balance_amount: 0,
                    payment_status: 'paid',
                    payment_date: paymentDate,
                    matched_at: now,
                    payment_source: 'manual',
                    payment_reference: null,
                    note: '手動で入金確認済みに登録',
                };

                if (combined.payment?.id) {
                    const { error } = await supabase.from('invoice_payment_matches').update(payload).eq('id', combined.payment.id);
                    if (error) {
                        logSupabaseError('invoice_payment_matches update paid', error);
                        throw error;
                    }
                } else {
                    const { error } = await supabase.from('invoice_payment_matches').insert(payload);
                    if (error) {
                        logSupabaseError('invoice_payment_matches insert paid', error);
                        throw error;
                    }
                }

                setSelected(null);
                await loadInvoiceData();
                setActiveTab('paid');
            } catch (e) {
                console.error('[LegacyInvoiceBillingPage] failed to mark invoice as paid', e);
                setError(e instanceof Error ? e.message : '入金確認済み登録に失敗しました。');
                throw e;
            }
        },
        [loadInvoiceData],
    );

    const handleRefresh = () => {
        if (activeTab === 'settings') {
            loadSettings();
        } else {
            loadInvoiceData();
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">請求書発行・送信管理（基幹連携）</h1>
                            <p className="text-sm text-slate-500">基幹SQL Serverから同期された請求データを元にした BtoB 請求管理</p>
                        </div>
                    </div>
                    <button onClick={handleRefresh} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium py-2 px-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600">
                        <RefreshCw className="w-4 h-4" />
                        再読込
                    </button>
                </div>
            </div>

            <div className="px-6 border-b border-slate-200 dark:border-slate-700">
                <nav className="-mb-px flex flex-wrap gap-x-6">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setSearchTerm('');
                                    setActiveTab(tab.id);
                                }}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm transition-colors flex items-center gap-2 ${
                                    isActive
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={activeTab === 'settings' ? '顧客コード / 顧客名 / メールで検索...' : '請求番号 / 受注番号 / 顧客名 / 品名で検索...'}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {activeTab !== 'settings' && (
                    <div className="text-sm text-slate-500">
                        表示件数: <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredInvoices.length}</span> / 取得件数:{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{invoices.length}</span>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <button onClick={() => setEditingSetting(emptySetting())} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">
                        <Plus className="w-5 h-5" />
                        新規登録
                    </button>
                )}
            </div>

            {error && <div className="m-4 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

            {activeTab === 'settings' ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr>
                                <th className="px-6 py-3">顧客コード</th>
                                <th className="px-6 py-3">顧客名</th>
                                <th className="px-6 py-3">送信方法</th>
                                <th className="px-6 py-3">請求先メール</th>
                                <th className="px-6 py-3 text-center">手動確認</th>
                                <th className="px-6 py-3 text-center">状態</th>
                                <th className="px-6 py-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="text-center p-16">
                                        <Loader className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                                    </td>
                                </tr>
                            ) : (
                                filteredSettings.map((s) => (
                                    <tr key={s.id} className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                                        <td className="px-6 py-4 font-mono text-slate-900 dark:text-white">{s.customer_code || '—'}</td>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{s.customer_name || '—'}</td>
                                        <td className="px-6 py-4">{deliveryMethodLabel(s.delivery_method)}</td>
                                        <td className="px-6 py-4">{s.billing_email || '—'}</td>
                                        <td className="px-6 py-4 text-center">{s.requires_manual_review ? '要' : '—'}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${s.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                                {s.is_active ? '有効' : '無効'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => setEditingSetting(s)} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                                                <Edit className="w-4 h-4" />
                                                編集
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {!isLoading && filteredSettings.length === 0 && (
                        <div className="p-16 text-center text-slate-500">
                            <Building className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            顧客別請求設定が登録されていません。
                        </div>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr>
                                <th className="px-4 py-3">請求番号</th>
                                <th className="px-4 py-3">受注番号</th>
                                <th className="px-4 py-3">顧客名</th>
                                <th className="px-4 py-3">品名</th>
                                <th className="px-4 py-3">納品日</th>
                                <th className="px-4 py-3 text-right">小計</th>
                                <th className="px-4 py-3 text-right">消費税</th>
                                <th className="px-4 py-3 text-right">合計</th>
                                <th className="px-4 py-3 text-center">発行</th>
                                <th className="px-4 py-3 text-center">送付</th>
                                <th className="px-4 py-3 text-center">入金</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={11} className="text-center p-16">
                                        <Loader className="w-8 h-8 animate-spin mx-auto text-slate-400" />
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map((row) => (
                                    <tr key={row.invoice.row_uuid} onClick={() => setSelected(row)} className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 cursor-pointer">
                                        <td className="px-4 py-3 font-mono text-slate-900 dark:text-white">{row.invoice.invoice_id || '—'}</td>
                                        <td className="px-4 py-3 font-mono">{invoiceOrderCode(row)}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.customer?.customer_name || '—'}</td>
                                        <td className="px-4 py-3 max-w-[320px] truncate" title={invoiceProductName(row)}>
                                            {invoiceProductName(row)}
                                        </td>
                                        <td className="px-4 py-3">{formatDate(row.invoice.delivery_date)}</td>
                                        <td className="px-4 py-3 text-right">{JPY(row.invoice.subtotal)}</td>
                                        <td className="px-4 py-3 text-right">{JPY(row.invoice.consumption)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{JPY(row.invoice.total)}</td>
                                        <td className="px-4 py-3 text-center"><StatusBadge status={row.issue?.issue_status} kind="issue" /></td>
                                        <td className="px-4 py-3 text-center"><StatusBadge status={row.delivery?.delivery_status} kind="delivery" method={row.delivery?.delivery_method} /></td>
                                        <td className="px-4 py-3 text-center"><StatusBadge status={row.payment?.payment_status} kind="payment" /></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    {!isLoading && filteredInvoices.length === 0 && (
                        <div className="p-16 text-center text-slate-500">
                            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            該当する請求データがありません。
                        </div>
                    )}
                </div>
            )}

            {selected && (
                <InvoiceDetailModal
                    combined={selected}
                    onClose={() => setSelected(null)}
                    onMarkAsIssued={handleMarkAsIssued}
                    onMarkAsPendingDelivery={handleMarkAsPendingDelivery}
                    onMarkAsDeliverySent={handleMarkAsDeliverySent}
                    onMarkAsPaid={handleMarkAsPaid}
                />
            )}

            {editingSetting && (
                <BillingSettingModal
                    setting={editingSetting}
                    onClose={() => setEditingSetting(null)}
                    onSaved={() => {
                        setEditingSetting(null);
                        loadSettings();
                    }}
                />
            )}
        </div>
    );
};

export default React.memo(LegacyInvoiceBillingPage);
