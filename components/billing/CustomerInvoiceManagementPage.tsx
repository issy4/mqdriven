import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '../../services/supabaseClient';
import {
    Building,
    CheckCircle,
    FileText,
    Loader,
    RefreshCw,
    Search,
    Send,
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

interface CombinedInvoice {
    invoice: InvoiceLegacyRow;
    project: ProjectLegacyRow | null;
    customer: CustomerRow | null;
    issue: IssueRecordRow | null;
    delivery: DeliveryRecordRow | null;
    payment: PaymentMatchRow | null;
}

interface CustomerInvoiceSummary {
    customerKey: string;
    customerId: string | null;
    customerCode: string | null;
    customerName: string;
    invoiceCount: number;
    subtotalAmount: number;
    taxAmount: number;
    totalAmount: number;
    unissuedCount: number;
    issuedCount: number;
    pendingCount: number;
    sentCount: number;
    unpaidCount: number;
    paidCount: number;
    unpaidAmount: number;
    lastInvoiceDate: string | null;
    latestCreateDate: string | null;
    invoices: CombinedInvoice[];
}

type IssueFilter = 'all' | 'unissued' | 'issued';
type DeliveryFilter = 'all' | 'not_sent' | 'pending' | 'sent';
type PaymentFilter = 'all' | 'unpaid' | 'paid';

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

const todayDateString = (): string => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const firstDayOfThisMonth = (): string => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
};

const sanitizeCsvValue = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (fileName: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
    const csv = [
        headers.map(sanitizeCsvValue).join(','),
        ...rows.map((row) => row.map(sanitizeCsvValue).join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
};

const logSupabaseError = (label: string, err: any) => {
    console.error(`[CustomerInvoiceManagementPage] ${label} Supabase error`, {
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
    return row.customer?.customer_name || row.project?.customer_code || '顧客未紐付け';
};

const invoiceCustomerCode = (row: CombinedInvoice): string => {
    return row.customer?.customer_code || row.project?.customer_code || '—';
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

const isIssued = (row: CombinedInvoice): boolean => row.issue?.issue_status === 'issued';
const isPending = (row: CombinedInvoice): boolean => row.delivery?.delivery_status === 'pending';
const isSent = (row: CombinedInvoice): boolean => row.delivery?.delivery_status === 'sent';
const isPaid = (row: CombinedInvoice): boolean => row.payment?.payment_status === 'paid';

const unpaidAmountOf = (row: CombinedInvoice): number => {
    const total = numOf(row.invoice.total);

    if (row.payment?.payment_status === 'paid') return 0;

    if (row.payment?.payment_status === 'partial') {
        const balance = numOf(row.payment.balance_amount);
        if (balance > 0) return balance;
        const paid = numOf(row.payment.paid_amount);
        return Math.max(total - paid, 0);
    }

    return total;
};

const customerKeyOf = (row: CombinedInvoice): string => {
    return (
        row.customer?.id ||
        row.customer?.customer_code ||
        row.project?.customer_id ||
        row.project?.customer_code ||
        row.invoice.customer_uuid ||
        'unknown'
    );
};

const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

async function fetchByIn<T>(
    tableName: string,
    columns: string,
    columnName: string,
    values: string[],
): Promise<T[]> {
    const cleanValues = Array.from(new Set(values.filter(Boolean)));
    if (cleanValues.length === 0) return [];

    const supabase = getSupabase();
    const rows: T[] = [];

    for (const chunk of chunkArray(cleanValues, 500)) {
        const { data, error } = await supabase
            .from(tableName)
            .select(columns)
            .in(columnName, chunk);

        if (error) {
            logSupabaseError(`${tableName} by ${columnName}`, error);
            throw error;
        }

        rows.push(...((data || []) as T[]));
    }

    return rows;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const CustomerInvoiceManagementPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState(firstDayOfThisMonth());
    const [dateTo, setDateTo] = useState(todayDateString());
    const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
    const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');

    const [invoices, setInvoices] = useState<InvoiceLegacyRow[]>([]);
    const [projects, setProjects] = useState<Record<string, ProjectLegacyRow>>({});
    const [customers, setCustomers] = useState<Record<string, CustomerRow>>({});
    const [issues, setIssues] = useState<Record<string, IssueRecordRow>>({});
    const [deliveries, setDeliveries] = useState<Record<string, DeliveryRecordRow>>({});
    const [payments, setPayments] = useState<Record<string, PaymentMatchRow>>({});

    const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSelectedCustomerKey(null);

        try {
            const supabase = getSupabase();

            let query = supabase
    .from('invoices_legacy')
    .select(
        'row_uuid, invoice_id, order_id, project_id, project_uuid, customer_uuid, delivery_date, delivery_date_value, specification, subtotal, consumption, total, note, pattern_name, status, create_date',
    )
    .order('delivery_date_value', { ascending: false, nullsFirst: false })
    .limit(2000);

if (dateFrom) {
    query = query.gte('delivery_date_value', dateFrom);
}

if (dateTo) {
    query = query.lte('delivery_date_value', dateTo);
}

            const { data: invoiceData, error: invoicesError } = await query;

            if (invoicesError) {
                logSupabaseError('invoices_legacy', invoicesError);
                throw invoicesError;
            }

            const invoiceRows = (invoiceData || []) as InvoiceLegacyRow[];
            setInvoices(invoiceRows);

            const projectUuids = Array.from(new Set(invoiceRows.map((i) => i.project_uuid).filter((v): v is string => !!v)));
            const projectIds = Array.from(new Set(invoiceRows.map((i) => i.project_id).filter((v): v is string => !!v)));

            const mergedProjectMap: Record<string, ProjectLegacyRow> = {};

            const projectsByUuid = await fetchByIn<ProjectLegacyRow>(
                'projects_legacy',
                'id, project_id, project_code, order_id, order_code, project_name, customer_id, customer_code, sales_user_id, sales_user_code',
                'id',
                projectUuids,
            );

            projectsByUuid.forEach((p) => {
                if (p.id) mergedProjectMap[p.id] = p;
                if (p.project_id) mergedProjectMap[p.project_id] = p;
            });

            const missingProjectIds = projectIds.filter((id) => !mergedProjectMap[id]);
            const projectsByProjectId = await fetchByIn<ProjectLegacyRow>(
                'projects_legacy',
                'id, project_id, project_code, order_id, order_code, project_name, customer_id, customer_code, sales_user_id, sales_user_code',
                'project_id',
                missingProjectIds,
            );

            projectsByProjectId.forEach((p) => {
                if (p.id) mergedProjectMap[p.id] = p;
                if (p.project_id) mergedProjectMap[p.project_id] = p;
            });

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

            const customerRows = await fetchByIn<CustomerRow>(
                'customers',
                'id, customer_code, customer_name, post_no, address_1, address_2, closing_day, pay_day, bill_payment_day',
                'id',
                customerIds,
            );

            const customerMap: Record<string, CustomerRow> = {};
            customerRows.forEach((c) => {
                if (c.id) customerMap[c.id] = c;
            });
            setCustomers(customerMap);

            const invoiceRowUuids = invoiceRows.map((i) => i.row_uuid).filter(Boolean);
            const invoiceNos = invoiceRows.map((i) => i.invoice_id).filter((v): v is string => !!v);

            const [issueByUuid, issueByNo, deliveryByUuid, deliveryByNo, paymentByUuid, paymentByNo] = await Promise.all([
                fetchByIn<IssueRecordRow>(
                    'invoice_issue_records',
                    'id, legacy_invoice_id, invoice_no, issue_status, issued_at, issue_count',
                    'legacy_invoice_id',
                    invoiceRowUuids,
                ),
                fetchByIn<IssueRecordRow>(
                    'invoice_issue_records',
                    'id, legacy_invoice_id, invoice_no, issue_status, issued_at, issue_count',
                    'invoice_no',
                    invoiceNos,
                ),
                fetchByIn<DeliveryRecordRow>(
                    'invoice_delivery_records',
                    'id, legacy_invoice_id, invoice_no, issue_record_id, delivery_method, delivery_status, to_email, cc_email, bcc_email, subject, body, attachment_file_name, sent_at',
                    'legacy_invoice_id',
                    invoiceRowUuids,
                ),
                fetchByIn<DeliveryRecordRow>(
                    'invoice_delivery_records',
                    'id, legacy_invoice_id, invoice_no, issue_record_id, delivery_method, delivery_status, to_email, cc_email, bcc_email, subject, body, attachment_file_name, sent_at',
                    'invoice_no',
                    invoiceNos,
                ),
                fetchByIn<PaymentMatchRow>(
                    'invoice_payment_matches',
                    'id, legacy_invoice_id, invoice_no, customer_code, customer_name, expected_amount, paid_amount, balance_amount, payment_status, payment_date, matched_at, payment_source, payment_reference, note',
                    'legacy_invoice_id',
                    invoiceRowUuids,
                ),
                fetchByIn<PaymentMatchRow>(
                    'invoice_payment_matches',
                    'id, legacy_invoice_id, invoice_no, customer_code, customer_name, expected_amount, paid_amount, balance_amount, payment_status, payment_date, matched_at, payment_source, payment_reference, note',
                    'invoice_no',
                    invoiceNos,
                ),
            ]);

            const issueMap: Record<string, IssueRecordRow> = {};
            [...issueByUuid, ...issueByNo].forEach((r) => {
                if (r.legacy_invoice_id) issueMap[r.legacy_invoice_id] = r;
                if (r.invoice_no) issueMap[r.invoice_no] = r;
            });
            setIssues(issueMap);

            const deliveryMap: Record<string, DeliveryRecordRow> = {};
            [...deliveryByUuid, ...deliveryByNo].forEach((r) => {
                if (r.legacy_invoice_id) deliveryMap[r.legacy_invoice_id] = r;
                if (r.invoice_no) deliveryMap[r.invoice_no] = r;
            });
            setDeliveries(deliveryMap);

            const paymentMap: Record<string, PaymentMatchRow> = {};
            [...paymentByUuid, ...paymentByNo].forEach((r) => {
                if (r.legacy_invoice_id) paymentMap[r.legacy_invoice_id] = r;
                if (r.invoice_no) paymentMap[r.invoice_no] = r;
            });
            setPayments(paymentMap);
        } catch (e) {
            console.error('[CustomerInvoiceManagementPage] failed to load customer invoice data', e);
            setError(e instanceof Error ? e.message : '顧客別請求データの取得に失敗しました。');
        } finally {
            setIsLoading(false);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const combinedInvoices = useMemo<CombinedInvoice[]>(() => {
        return invoices.map((invoice) => {
            const project =
                (invoice.project_uuid ? projects[invoice.project_uuid] : null) ||
                (invoice.project_id ? projects[invoice.project_id] : null) ||
                null;
            const customerId = project?.customer_id || invoice.customer_uuid || null;
            const customer = customerId ? customers[customerId] || null : null;

            return {
                invoice,
                project,
                customer,
                issue: getRecordByInvoice(issues, invoice),
                delivery: getRecordByInvoice(deliveries, invoice),
                payment: getRecordByInvoice(payments, invoice),
            };
        });
    }, [invoices, projects, customers, issues, deliveries, payments]);

    const filteredInvoices = useMemo(() => {
        let rows = combinedInvoices;

        if (issueFilter === 'unissued') rows = rows.filter((r) => !isIssued(r));
        else if (issueFilter === 'issued') rows = rows.filter((r) => isIssued(r));

        if (deliveryFilter === 'not_sent') rows = rows.filter((r) => !r.delivery || !r.delivery.delivery_status);
        else if (deliveryFilter === 'pending') rows = rows.filter((r) => isPending(r));
        else if (deliveryFilter === 'sent') rows = rows.filter((r) => isSent(r));

        if (paymentFilter === 'unpaid') rows = rows.filter((r) => !isPaid(r));
        else if (paymentFilter === 'paid') rows = rows.filter((r) => isPaid(r));

        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            rows = rows.filter((r) =>
                (r.invoice.invoice_id || '').toLowerCase().includes(q) ||
                invoiceOrderCode(r).toLowerCase().includes(q) ||
                invoiceCustomerCode(r).toLowerCase().includes(q) ||
                invoiceCustomerName(r).toLowerCase().includes(q) ||
                invoiceProductName(r).toLowerCase().includes(q),
            );
        }

        return rows;
    }, [combinedInvoices, issueFilter, deliveryFilter, paymentFilter, searchTerm]);

    const customerSummaries = useMemo<CustomerInvoiceSummary[]>(() => {
        const map = new Map<string, CustomerInvoiceSummary>();

        filteredInvoices.forEach((row) => {
            const customerKey = customerKeyOf(row);
            const customerName = invoiceCustomerName(row);
            const customerCode = row.customer?.customer_code || row.project?.customer_code || null;
            const invoiceDate = row.invoice.delivery_date || row.invoice.create_date || null;
            const subtotal = numOf(row.invoice.subtotal);
            const tax = numOf(row.invoice.consumption);
            const total = numOf(row.invoice.total);
            const unpaidAmount = unpaidAmountOf(row);

            if (!map.has(customerKey)) {
                map.set(customerKey, {
                    customerKey,
                    customerId: row.customer?.id || row.project?.customer_id || row.invoice.customer_uuid || null,
                    customerCode,
                    customerName,
                    invoiceCount: 0,
                    subtotalAmount: 0,
                    taxAmount: 0,
                    totalAmount: 0,
                    unissuedCount: 0,
                    issuedCount: 0,
                    pendingCount: 0,
                    sentCount: 0,
                    unpaidCount: 0,
                    paidCount: 0,
                    unpaidAmount: 0,
                    lastInvoiceDate: null,
                    latestCreateDate: null,
                    invoices: [],
                });
            }

            const summary = map.get(customerKey)!;
            summary.invoiceCount += 1;
            summary.subtotalAmount += subtotal;
            summary.taxAmount += tax;
            summary.totalAmount += total;
            summary.unpaidAmount += unpaidAmount;
            summary.invoices.push(row);

            if (isIssued(row)) summary.issuedCount += 1;
            else summary.unissuedCount += 1;

            if (isPending(row)) summary.pendingCount += 1;
            if (isSent(row)) summary.sentCount += 1;

            if (isPaid(row)) summary.paidCount += 1;
            else summary.unpaidCount += 1;

            if (invoiceDate && (!summary.lastInvoiceDate || invoiceDate > summary.lastInvoiceDate)) {
                summary.lastInvoiceDate = invoiceDate;
            }

            if (row.invoice.create_date && (!summary.latestCreateDate || row.invoice.create_date > summary.latestCreateDate)) {
                summary.latestCreateDate = row.invoice.create_date;
            }
        });

        return Array.from(map.values()).sort((a, b) => {
            const aDate = a.lastInvoiceDate || a.latestCreateDate || '';
            const bDate = b.lastInvoiceDate || b.latestCreateDate || '';
            if (aDate !== bDate) return bDate.localeCompare(aDate);
            return b.totalAmount - a.totalAmount;
        });
    }, [filteredInvoices]);

    const selectedSummary = useMemo(() => {
        if (!selectedCustomerKey) return customerSummaries[0] || null;
        return customerSummaries.find((s) => s.customerKey === selectedCustomerKey) || customerSummaries[0] || null;
    }, [customerSummaries, selectedCustomerKey]);

    const selectedInvoices = useMemo(() => {
        return (selectedSummary?.invoices || []).slice().sort((a, b) => {
            const aDate = a.invoice.delivery_date || a.invoice.create_date || '';
            const bDate = b.invoice.delivery_date || b.invoice.create_date || '';
            return bDate.localeCompare(aDate);
        });
    }, [selectedSummary]);

    const totalSummary = useMemo(() => {
        return customerSummaries.reduce(
            (acc, s) => {
                acc.customerCount += 1;
                acc.invoiceCount += s.invoiceCount;
                acc.totalAmount += s.totalAmount;
                acc.unpaidAmount += s.unpaidAmount;
                acc.pendingCount += s.pendingCount;
                acc.sentCount += s.sentCount;
                return acc;
            },
            { customerCount: 0, invoiceCount: 0, totalAmount: 0, unpaidAmount: 0, pendingCount: 0, sentCount: 0 },
        );
    }, [customerSummaries]);

    const handleExportSummaryCsv = () => {
        downloadCsv(
            `顧客別請求サマリー_${dateFrom || 'all'}_${dateTo || 'all'}.csv`,
            ['顧客コード', '顧客名', '請求件数', '小計合計', '消費税合計', '税込合計', '未発行件数', '発行済み件数', '送付待ち件数', '送付済み件数', '未入金件数', '入金済み件数', '未入金額', '最終請求日'],
            customerSummaries.map((s) => [
                s.customerCode || '',
                s.customerName,
                s.invoiceCount,
                Math.round(s.subtotalAmount),
                Math.round(s.taxAmount),
                Math.round(s.totalAmount),
                s.unissuedCount,
                s.issuedCount,
                s.pendingCount,
                s.sentCount,
                s.unpaidCount,
                s.paidCount,
                Math.round(s.unpaidAmount),
                formatDate(s.lastInvoiceDate),
            ]),
        );
    };

    const handleExportDetailCsv = () => {
        downloadCsv(
            `顧客別請求明細_${selectedSummary?.customerCode || selectedSummary?.customerName || 'all'}.csv`,
            ['顧客コード', '顧客名', '請求番号', '受注番号', '品名', '納品日', '小計', '消費税', '合計', '発行状態', '送付状態', '入金状態'],
            selectedInvoices.map((row) => [
                invoiceCustomerCode(row),
                invoiceCustomerName(row),
                row.invoice.invoice_id || '',
                invoiceOrderCode(row),
                invoiceProductName(row),
                formatDate(row.invoice.delivery_date),
                Math.round(numOf(row.invoice.subtotal)),
                Math.round(numOf(row.invoice.consumption)),
                Math.round(numOf(row.invoice.total)),
                row.issue?.issue_status === 'issued' ? '発行済み' : '未発行',
                deliveryStatusLabel(row.delivery?.delivery_method, row.delivery?.delivery_status),
                row.payment?.payment_status === 'paid' ? '入金確認済み' : row.payment?.payment_status === 'partial' ? '一部入金' : '未入金',
            ]),
        );
    };

    const inputClass = 'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
                            <Building className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">顧客別請求書発行・送信管理</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                顧客ごとの請求・発行・送付・入金状況を集計します
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-60"
                    >
                        {isLoading ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        再読込
                    </button>
                </div>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${inputClass} w-full pl-9`}
                            placeholder="顧客名 / 顧客コード / 請求番号 / 受注番号 / 品名で検索"
                        />
                    </div>

                    <div className="lg:col-span-2">
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputClass} w-full`} title="請求作成日 From" />
                    </div>

                    <div className="lg:col-span-2">
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputClass} w-full`} title="請求作成日 To" />
                    </div>

                    <div className="lg:col-span-1">
                        <select value={issueFilter} onChange={(e) => setIssueFilter(e.target.value as IssueFilter)} className={`${inputClass} w-full`}>
                            <option value="all">発行すべて</option>
                            <option value="unissued">未発行</option>
                            <option value="issued">発行済み</option>
                        </select>
                    </div>

                    <div className="lg:col-span-1">
                        <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value as DeliveryFilter)} className={`${inputClass} w-full`}>
                            <option value="all">送付すべて</option>
                            <option value="not_sent">未送付</option>
                            <option value="pending">送付待ち</option>
                            <option value="sent">送付済み</option>
                        </select>
                    </div>

                    <div className="lg:col-span-1">
                        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)} className={`${inputClass} w-full`}>
                            <option value="all">入金すべて</option>
                            <option value="unpaid">未入金</option>
                            <option value="paid">入金済み</option>
                        </select>
                    </div>

                    <div className="lg:col-span-1">
                        <button
                            onClick={loadData}
                            disabled={isLoading}
                            className="w-full bg-emerald-600 text-white font-semibold py-2 px-3 rounded-lg hover:bg-emerald-700 disabled:bg-slate-400"
                        >
                            検索
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">顧客数</p>
                        <p className="font-bold text-slate-900 dark:text-white">{totalSummary.customerCount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">請求件数</p>
                        <p className="font-bold text-slate-900 dark:text-white">{totalSummary.invoiceCount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">請求合計</p>
                        <p className="font-bold text-slate-900 dark:text-white">{JPY(totalSummary.totalAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">未入金額</p>
                        <p className="font-bold text-red-700 dark:text-red-300">{JPY(totalSummary.unpaidAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">送付待ち</p>
                        <p className="font-bold text-yellow-700 dark:text-yellow-300">{totalSummary.pendingCount.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
                        <p className="text-xs text-slate-500">送付済み</p>
                        <p className="font-bold text-green-700 dark:text-green-300">{totalSummary.sentCount.toLocaleString()}</p>
                    </div>
                </div>

                {error && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
                        {error}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-0">
                <div className="border-r border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white">顧客別サマリー</h3>
                            <p className="text-xs text-slate-500">表示件数: {customerSummaries.length.toLocaleString()} / 請求件数: {filteredInvoices.length.toLocaleString()}</p>
                        </div>
                        <button onClick={handleExportSummaryCsv} disabled={customerSummaries.length === 0} className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:underline disabled:text-slate-400 disabled:no-underline">
                            CSV出力
                        </button>
                    </div>

                    <div className="overflow-x-auto max-h-[620px]">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">顧客</th>
                                    <th className="px-4 py-3 text-right">件数</th>
                                    <th className="px-4 py-3 text-right">請求合計</th>
                                    <th className="px-4 py-3 text-right">未入金</th>
                                    <th className="px-4 py-3 text-center">状態</th>
                                    <th className="px-4 py-3">最終請求日</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr><td colSpan={6} className="text-center p-16"><Loader className="w-8 h-8 animate-spin mx-auto text-slate-400" /></td></tr>
                                ) : customerSummaries.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center p-16 text-slate-500"><Building className="w-10 h-10 mx-auto mb-3 text-slate-300" />該当する顧客別請求データがありません。</td></tr>
                                ) : (
                                    customerSummaries.map((summary) => {
                                        const active = selectedSummary?.customerKey === summary.customerKey;
                                        return (
                                            <tr
                                                key={summary.customerKey}
                                                onClick={() => setSelectedCustomerKey(summary.customerKey)}
                                                className={`border-b dark:border-slate-700 cursor-pointer ${active ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-700/30'}`}
                                            >
                                                <td className="px-4 py-3 min-w-[240px]">
                                                    <div className="font-semibold text-slate-900 dark:text-white">{summary.customerName}</div>
                                                    <div className="text-xs text-slate-500 font-mono">{summary.customerCode || 'コードなし'}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">{summary.invoiceCount.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{JPY(summary.totalAmount)}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-red-700 dark:text-red-300">{JPY(summary.unpaidAmount)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex flex-col gap-1 items-center">
                                                        {summary.pendingCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">送付待ち {summary.pendingCount}</span>}
                                                        {summary.unissuedCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">未発行 {summary.unissuedCount}</span>}
                                                        {summary.unpaidCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">未入金 {summary.unpaidCount}</span>}
                                                        {summary.pendingCount === 0 && summary.unissuedCount === 0 && summary.unpaidCount === 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">完了</span>}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">{formatDate(summary.lastInvoiceDate)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white">顧客別請求書一覧</h3>
                            <p className="text-xs text-slate-500">
                                {selectedSummary ? `${selectedSummary.customerName} / ${selectedInvoices.length.toLocaleString()}件` : '顧客を選択してください'}
                            </p>
                        </div>
                        <button onClick={handleExportDetailCsv} disabled={!selectedSummary || selectedInvoices.length === 0} className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:underline disabled:text-slate-400 disabled:no-underline">
                            CSV出力
                        </button>
                    </div>

                    {selectedSummary && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3"><p className="text-xs text-slate-500">請求合計</p><p className="font-bold text-slate-900 dark:text-white">{JPY(selectedSummary.totalAmount)}</p></div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3"><p className="text-xs text-slate-500">未入金額</p><p className="font-bold text-red-700 dark:text-red-300">{JPY(selectedSummary.unpaidAmount)}</p></div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3"><p className="text-xs text-slate-500">送付待ち</p><p className="font-bold text-yellow-700 dark:text-yellow-300">{selectedSummary.pendingCount.toLocaleString()}</p></div>
                            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3"><p className="text-xs text-slate-500">入金済み</p><p className="font-bold text-green-700 dark:text-green-300">{selectedSummary.paidCount.toLocaleString()}</p></div>
                        </div>
                    )}

                    <div className="overflow-x-auto max-h-[620px]">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">請求番号</th>
                                    <th className="px-4 py-3">受注番号</th>
                                    <th className="px-4 py-3">品名</th>
                                    <th className="px-4 py-3">納品日</th>
                                    <th className="px-4 py-3 text-right">合計</th>
                                    <th className="px-4 py-3 text-center">発行</th>
                                    <th className="px-4 py-3 text-center">送付</th>
                                    <th className="px-4 py-3 text-center">入金</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!selectedSummary ? (
                                    <tr><td colSpan={8} className="text-center p-16 text-slate-500">左の顧客一覧から顧客を選択してください。</td></tr>
                                ) : selectedInvoices.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center p-16 text-slate-500">この顧客の請求データがありません。</td></tr>
                                ) : (
                                    selectedInvoices.map((row) => (
                                        <tr key={row.invoice.row_uuid} className="bg-white dark:bg-slate-800 border-b dark:border-slate-700">
                                            <td className="px-4 py-3 font-mono text-slate-900 dark:text-white">{row.invoice.invoice_id || '—'}</td>
                                            <td className="px-4 py-3 font-mono">{invoiceOrderCode(row)}</td>
                                            <td className="px-4 py-3 max-w-[260px] truncate" title={invoiceProductName(row)}>{invoiceProductName(row)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.invoice.delivery_date)}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{JPY(row.invoice.total)}</td>
                                            <td className="px-4 py-3 text-center"><StatusBadge status={row.issue?.issue_status} kind="issue" /></td>
                                            <td className="px-4 py-3 text-center"><StatusBadge status={row.delivery?.delivery_status} kind="delivery" method={row.delivery?.delivery_method} /></td>
                                            <td className="px-4 py-3 text-center"><StatusBadge status={row.payment?.payment_status} kind="payment" /></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(CustomerInvoiceManagementPage);
