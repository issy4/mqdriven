import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { submitApplication, saveApplicationDraft, getApplicationDraft, clearApplicationDraft, uploadFile, debugPaymentRecipientsWithServiceRole } from '../../services/dataService';
import { extractInvoiceDetails } from '../../services/geminiService';
import SMTPEmailService from '../../services/smtpEmailService';
import ApprovalRouteSelector from './ApprovalRouteSelector';
import AccountItemSelect from './AccountItemSelect';
import DepartmentSelect from './DepartmentSelect';
import SupplierSearchSelect from './SupplierSearchSelect';
import { useSubmitWithConfirmation } from '../../hooks/useSubmitWithConfirmation';
import { Loader, Upload, PlusCircle, Trash2, AlertTriangle, CheckCircle, FileText, RefreshCw, List, ArrowLeft, ArrowRight, Check, Sparkles, X, Pencil } from '../Icons';
import {
    User,
    InvoiceData,
    Customer,
    AccountItem,
    Job,
    PurchaseOrder,
    Department,
    AllocationDivision,
    JobStatus,
    Toast,
    InvoiceStatus,
    PaymentRecipient,
    BankAccountInfo,
    ApplicationWithDetails,
} from '../../types';
import { findMatchingPaymentRecipientId, findMatchingCustomerId } from '../../utils/matching';
import { attachResubmissionMeta, buildResubmissionMeta } from '../../utils/applicationResubmission';

// --- TYPES AND CONSTANTS ---

type MQAlertLevel = 'INFO' | 'WARNING' | 'ERROR';

interface MQAlert {
    id: string;
    level: MQAlertLevel;
    message: string;
    lineId?: string;
}

interface ExpenseLine {
    id: string;
    lineDate: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amountExclTax: number;
    taxRate: number;
    accountItemId: string;
    allocationDivisionId: string;
    customerId: string;
    customerName: string;
    customCustomerName?: string;
    projectId: string;
    projectName?: string;
    nonCustomerExpense?: boolean;
    linkedRevenueId: string;
    ocrExtracted: boolean;
    purposeType: '自社' | '顧客' | '他社' | 'その他';
    businessCategory: '印刷' | '製造' | '物流' | '業務' | 'その他';
    internalMemo?: string;
}

interface ExpenseInvoiceDraft {
    id: string;
    supplierName: string;
    paymentRecipientId: string;
    registrationNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalGross: number;
    totalNet: number;
    taxAmount: number;
    status: 'Draft' | 'Pending' | 'Approved' | 'Rejected' | '要修正' | '検証済';
    bankAccount: BankAccountInfo;
    lines: ExpenseLine[];
    ocrExtractedFields: Set<string>;
    sourceFile?: { name: string; type: string; url: string };
    isTaxInclusive?: boolean; // New field to track tax selection
}

interface ExpenseAttachment {
    name: string;
    publicUrl: string;
    path: string;
    type: string;
}

interface ExpenseReimbursementFormProps {
    onSuccess: () => void;
    applicationCodeId: string;
    currentUser: User | null;
    customers: Customer[];
    accountItems: AccountItem[];
    jobs: Job[];
    purchaseOrders: PurchaseOrder[];
    departments: Department[];
    allocationDivisions: AllocationDivision[];
    paymentRecipients: PaymentRecipient[];
    onCreatePaymentRecipient?: (recipient: Partial<PaymentRecipient>) => Promise<PaymentRecipient>;
    isAIOff: boolean;
    isLoading: boolean;
    error: string;
    addToast?: (message: string, type: Toast['type']) => void;
    draftApplication?: ApplicationWithDetails | null;
}

interface ComputedTotals {
    net: number;
    tax: number;
    gross: number;
}

const resolveEnvValue = (key: string): string | undefined => {
    if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') {
        const value = (import.meta.env as Record<string, string | undefined>)[key];
        if (value !== undefined) return value;
    }
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
        return process.env[key];
    }
    return undefined;
};

const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const createEmptyLine = (ocr: boolean = false): ExpenseLine => ({
    id: generateId('line'),
    lineDate: new Date().toISOString().split('T')[0],
    description: '',
    quantity: 1,
    unit: '式',
    unitPrice: 0,
    amountExclTax: 0,
    purposeType: '自社',
    businessCategory: '業務',
    taxRate: 10,
    accountItemId: '',
    allocationDivisionId: '',
    customerId: '',
    customerName: '',
    projectId: '',
    customCustomerName: '',
    projectName: '',
    nonCustomerExpense: false,
    linkedRevenueId: '',
    ocrExtracted: ocr,
    internalMemo: '',
});

const ensureExpenseLineShape = (rawLine?: Partial<ExpenseLine> | null): ExpenseLine => {
    const baseLine = createEmptyLine(Boolean(rawLine?.ocrExtracted));
    const merged = {
        ...baseLine,
        ...rawLine,
    };
    const normalizedCustomerName =
        typeof merged.customerName === 'string' && merged.customerName.trim()
            ? merged.customerName
            : typeof merged.customCustomerName === 'string'
                ? merged.customCustomerName
                : '';
    return {
        ...merged,
        id: rawLine?.id || baseLine.id,
        customerName: normalizedCustomerName,
        internalMemo:
            typeof rawLine?.internalMemo === 'string'
                ? rawLine.internalMemo
                : typeof rawLine?.customCustomerName === 'string'
                    ? rawLine.customCustomerName
                    : merged.internalMemo || '',
    };
};

const createEmptyInvoiceDraft = (): ExpenseInvoiceDraft => ({
    id: generateId('invoice'),
    supplierName: '',
    paymentRecipientId: '',
    registrationNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    totalGross: 0,
    totalNet: 0,
    taxAmount: 0,
    status: 'Draft',
    bankAccount: { bankName: '', branchName: '', accountType: '', accountNumber: '' },
    lines: [createEmptyLine()],
    ocrExtractedFields: new Set(),
    isTaxInclusive: false, // Default to tax-exclusive
});

const STEPS = [
    { id: 1, name: '請求書のアップロードと確認' },
    { id: 2, name: '明細の編集' },
    { id: 3, name: '申請内容の最終確認と提出' },
];

const RINGI_BUCKET =
    resolveEnvValue('VITE_RINGI_BUCKET') ??
    resolveEnvValue('NEXT_PUBLIC_RINGI_BUCKET') ??
    resolveEnvValue('RINGI_BUCKET') ??
    'ringi';

const shouldFallbackToDefaultBucket = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const normalized = (error.message || '').toLowerCase();
    if (!normalized) return false;
    return normalized.includes('bucket') && (normalized.includes('not found') || normalized.includes('does not exist'));
};


// --- UTILITY FUNCTIONS ---

const numberFromInput = (value: string) => {
    if (value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject('Read failed'));
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

const toNumberValue = (value: any): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const isCloseTo = (value: number, target: number): boolean => {
    const tolerance = Math.max(1, Math.round(Math.abs(target) * 0.01));
    return Math.abs(value - target) <= tolerance;
};

const computeLineTotals = (invoice: ExpenseInvoiceDraft): ComputedTotals => {
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const lineSum = lines.reduce((sum, line) => sum + toNumberValue(line.amountExclTax), 0);

    const totalGross = toNumberValue(invoice.totalGross);
    const totalNet = toNumberValue(invoice.totalNet);
    const totalTax = toNumberValue(invoice.taxAmount);
    const hasHeaderTotals = totalGross > 0 || totalNet > 0 || totalTax > 0;
    const isTaxInclusive = invoice.isTaxInclusive ?? false;

    if (lineSum === 0 && hasHeaderTotals) {
    // 税込合計だけ入力された場合は、税込金額から税抜・消費税を逆算する
    if (totalGross > 0 && totalNet === 0 && totalTax === 0) {
        const defaultTaxRate = 10;
        const net = Math.round(totalGross / (1 + defaultTaxRate / 100));
        const tax = totalGross - net;

        return {
            net,
            tax,
            gross: totalGross,
        };
    }

    // 税込合計と消費税がある場合
    if (totalGross > 0 && totalTax > 0 && totalNet === 0) {
        const net = Math.max(0, totalGross - totalTax);

        return {
            net,
            tax: totalTax,
            gross: totalGross,
        };
    }

    // 税抜合計と消費税がある場合
    if (totalNet > 0 && totalTax > 0 && totalGross === 0) {
        return {
            net: totalNet,
            tax: totalTax,
            gross: totalNet + totalTax,
        };
    }

    // 税抜合計だけある場合
    if (totalNet > 0 && totalTax === 0 && totalGross === 0) {
        const defaultTaxRate = 10;
        const tax = Math.round(totalNet * (defaultTaxRate / 100));

        return {
            net: totalNet,
            tax,
            gross: totalNet + tax,
        };
    }

    const net = totalNet > 0 ? totalNet : Math.max(0, totalGross - totalTax);
    const tax = totalTax > 0 ? totalTax : Math.max(0, totalGross - net);
    const gross = totalGross > 0 ? totalGross : net + tax;

    return { net, tax, gross };
}

    // Use user's tax selection if explicitly set, otherwise fall back to auto-detection
    const shouldTreatAsInclusive = isTaxInclusive || (hasHeaderTotals && totalGross > 0 && isCloseTo(lineSum, totalGross) && !isCloseTo(lineSum, totalNet));

    if (shouldTreatAsInclusive) {
        const totals = lines.reduce(
            (acc, line) => {
                const grossLine = toNumberValue(line.amountExclTax);
                const rate = toNumberValue(line.taxRate);
                const divisor = 1 + rate / 100;
                const netLine = divisor === 0 ? grossLine : grossLine / divisor;
                const taxLine = grossLine - netLine;
                acc.net += netLine;
                acc.tax += taxLine;
                acc.gross += grossLine;
                return acc;
            },
            { net: 0, tax: 0, gross: 0 }
        );
        return totals;
    }

    const net = lineSum;
    const tax = lines.reduce(
        (sum, line) => sum + toNumberValue(line.amountExclTax) * (toNumberValue(line.taxRate) / 100),
        0
    );
    return { net, tax, gross: net + tax };
};

const syncInvoiceTotals = (draft: ExpenseInvoiceDraft): ExpenseInvoiceDraft => {
    const totals = computeLineTotals(draft);
    return {
        ...draft,
        totalNet: totals.net,
        taxAmount: totals.tax,
        totalGross: totals.gross,
    };
};


// --- UI HELPER COMPONENTS ---

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-700/60 ${className}`}>
        {children}
    </div>
);

const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 ${className}`}>{children}</div>
);

const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <h3 className={`text-lg font-bold text-slate-800 dark:text-slate-100 ${className}`}>{children}</h3>
);

const CardDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <p className={`text-sm text-slate-500 dark:text-slate-400 mt-1 ${className}`}>{children}</p>
);

const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`p-4 sm:p-6 ${className}`}>{children}</div>
);

const OcrLabel: React.FC = () => (
    <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
        <Sparkles className="w-3 h-3" />
        <span>AI-OCR</span>
    </span>
);

const RequiredBadge: React.FC = () => (
    <span className="ml-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 px-1.5 py-0.5 rounded-full">
        必須
    </span>
);

const FormField: React.FC<{
    label: string;
    children: React.ReactNode;
    isOcr?: boolean;
    htmlFor?: string;
    required?: boolean;
    className?: string;
}> = ({ label, children, isOcr, htmlFor, required, className }) => (
    <div className={className}>
        <label htmlFor={htmlFor} className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-2">{label} {required && <RequiredBadge />}</span>
            {isOcr && <OcrLabel />}
        </label>
        <div className="mt-1.5">{children}</div>
    </div>
);

// --- MAIN COMPONENT ---

const ExpenseReimbursementForm: React.FC<ExpenseReimbursementFormProps> = (props) => {
    const {
        onSuccess, applicationCodeId, currentUser, customers, accountItems, jobs, purchaseOrders,
        departments, allocationDivisions, paymentRecipients, onCreatePaymentRecipient,
        isAIOff, isLoading, error: formLoadError, addToast, draftApplication
    } = props;

    const [currentStep, setCurrentStep] = useState(1);
    const [invoice, setInvoice] = useState<ExpenseInvoiceDraft>(createEmptyInvoiceDraft());
    const [departmentId, setDepartmentId] = useState<string>('');
    const [approvalRouteId, setApprovalRouteId] = useState<string>('');
    const [notes, setNotes] = useState('');
    const [isInternalExpense, setIsInternalExpense] = useState(false);
    const [mqExpectedSalesPQ, setMqExpectedSalesPQ] = useState<number | ''>('');
    const [mqExpectedMarginMQ, setMqExpectedMarginMQ] = useState<number | ''>('');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [documentAttachment, setDocumentAttachment] = useState<ExpenseAttachment | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [isDocumentUploading, setIsDocumentUploading] = useState(false);
    const [isRestoring, setIsRestoring] = useState(true);
    const [error, setError] = useState('');
    const { requestConfirmation, ConfirmationDialog } = useSubmitWithConfirmation();
    const resubmissionMeta = useMemo(() => buildResubmissionMeta(draftApplication), [draftApplication]);
    const [emailService] = useState(() => new SMTPEmailService());

    const isDisabled = isSubmitting || isLoading || isRestoring || !!formLoadError || hasSubmitted || isDocumentUploading;

    const mqMRate = useMemo(() => {
        if (mqExpectedSalesPQ === '' || mqExpectedMarginMQ === '') return null;
        const pq = typeof mqExpectedSalesPQ === 'number' ? mqExpectedSalesPQ : Number(mqExpectedSalesPQ);
        const mq = typeof mqExpectedMarginMQ === 'number' ? mqExpectedMarginMQ : Number(mqExpectedMarginMQ);
        if (!Number.isFinite(pq) || pq === 0 || !Number.isFinite(mq)) return null;
        return (mq / pq) * 100;
    }, [mqExpectedSalesPQ, mqExpectedMarginMQ]);

    const normalizeLinesForInternalExpense = useCallback((lines: ExpenseLine[]): ExpenseLine[] => {
        if (!isInternalExpense) return lines;
        return lines.map(line => ({
            ...line,
            customerId: '',
            customerName: '',
            customCustomerName: '',
            projectId: '',
            projectName: '',
            nonCustomerExpense: true,
            internalMemo: line.internalMemo ?? line.customCustomerName ?? '',
        }));
    }, [isInternalExpense]);

    const resetFormFields = useCallback(() => {
        setInvoice(createEmptyInvoiceDraft());
        setDepartmentId('');
        setApprovalRouteId('');
        setNotes('');
        setIsInternalExpense(false);
        setMqExpectedSalesPQ('');
        setMqExpectedMarginMQ('');
        setDocumentAttachment(null);
        setCurrentStep(1);
    }, []);

    // Restore draft logic
    useEffect(() => {
        const restoreDraft = async () => {
            if (!currentUser?.id || !applicationCodeId) {
                setHasSubmitted(false);
                setIsRestoring(false);
                return;
            }

            try {
                const draft = draftApplication ? draftApplication : await getApplicationDraft(applicationCodeId, currentUser.id);
                if (draft?.formData) {
                    const data = draft.formData as any;
                    const baseInvoice = createEmptyInvoiceDraft();
                    const rawLines = Array.isArray(data.invoice?.lines) ? data.invoice.lines : null;
                    const restoredInvoice: ExpenseInvoiceDraft = {
                        ...baseInvoice,
                        ...data.invoice,
                        isTaxInclusive: Boolean(data.invoice?.isTaxInclusive ?? false),
                        lines: rawLines && rawLines.length > 0 ? rawLines.map((line: any) => ensureExpenseLineShape(line)) : baseInvoice.lines,
                        ocrExtractedFields: new Set(data.invoice?.ocrExtractedFields || []),
                    };
                    const documentUrl = data.documentUrl;
                    if (documentUrl) {
                        const attachment: ExpenseAttachment = {
                            name: data.documentName || data.invoice?.sourceFile?.name || '添付ファイル',
                            type: data.documentMimeType || data.invoice?.sourceFile?.type || 'application/pdf',
                            publicUrl: documentUrl,
                            path: data.documentStoragePath || '',
                        };
                        restoredInvoice.sourceFile = {
                            name: attachment.name,
                            type: attachment.type,
                            url: attachment.publicUrl,
                        };
                        setDocumentAttachment(attachment);
                    } else {
                        setDocumentAttachment(null);
                    }
                    const normalizedLines = data.isInternalExpense
                        ? normalizeLinesForInternalExpense(restoredInvoice.lines)
                        : restoredInvoice.lines;
                    setInvoice(syncInvoiceTotals({
                        ...restoredInvoice,
                        lines: normalizedLines,
                    }));
                    setDepartmentId(data.departmentId || '');
                    setApprovalRouteId(data.approvalRouteId || '');
                    setNotes(data.notes || '');
                    setIsInternalExpense(Boolean(data.isInternalExpense));

                    const mq = data.mqAccounting || {};
                    setMqExpectedSalesPQ(
                        typeof mq.expectedSalesPQ === 'number' && Number.isFinite(mq.expectedSalesPQ)
                            ? mq.expectedSalesPQ
                            : ''
                    );
                    setMqExpectedMarginMQ(
                        typeof mq.expectedMarginMQ === 'number' && Number.isFinite(mq.expectedMarginMQ)
                            ? mq.expectedMarginMQ
                            : ''
                    );

                    addToast?.('下書きを復元しました。', 'info');
                } else {
                    setDocumentAttachment(null);
                }
            } catch (err) {
                console.error("Failed to restore draft", err);
            } finally {
                setHasSubmitted(false);
                setIsRestoring(false);
            }
        };
        restoreDraft();
    }, [applicationCodeId, currentUser?.id, draftApplication, addToast]);

    // When the user manually overrides totalGross, store it as a "pinned" value
    // so that the header shows the invoice amount, not the line-computed amount.
    const [pinnedTotalGross, setPinnedTotalGross] = useState<number | null>(null);

    const handleFieldChange = (field: keyof ExpenseInvoiceDraft, value: any) => {
        setInvoice(prev => {
            if (field === 'totalNet' || field === 'taxAmount') {
                // These are always auto-calculated from line items.
                return prev;
            }
            if (field === 'totalGross') {
                // Allow user to manually set totalGross (pinned override)
                const numVal = typeof value === 'number' ? value : Number(value) || 0;
                setPinnedTotalGross(numVal);
                return { ...prev, totalGross: numVal };
            }
            const updated = { ...prev, [field]: value };

            return updated;
        });
    };

    const handleLineChange = (lineId: string, field: keyof ExpenseLine, value: any) => {
        if (isInternalExpense && (field === 'customerId' || field === 'customerName' || field === 'customCustomerName' || field === 'projectId' || field === 'projectName')) {
            return;
        }
        setInvoice(prev => {
            const newLines = prev.lines.map(line => {
                if (line.id !== lineId) return line;
                const updatedLine = { ...line, [field]: value };
                if (field === 'quantity' || field === 'unitPrice' || field === 'amountExclTax') {
                    const quantity = field === 'quantity' ? Number(value) || 0 : Number(updatedLine.quantity) || 0;
                    const unitPrice = field === 'unitPrice' ? Number(value) || 0 : Number(updatedLine.unitPrice) || 0;
                    const amountExclTax = field === 'amountExclTax' ? Number(value) || 0 : quantity * unitPrice;
                    updatedLine.amountExclTax = amountExclTax;
                }
                return updatedLine;
            });

            return syncInvoiceTotals({
                ...prev,
                lines: newLines,
            });
        });
    };

    const addLine = () => {
        setInvoice(prev => {
            const newLines = normalizeLinesForInternalExpense([...prev.lines, createEmptyLine()]);
            return syncInvoiceTotals({
                ...prev,
                lines: newLines,
            });
        });
    };

    const removeLine = (lineId: string) => {
        setInvoice(prev => {
            const newLines = prev.lines.filter(l => l.id !== lineId);
            if (newLines.length === 0) {
                newLines.push(...normalizeLinesForInternalExpense([createEmptyLine()]));
            }
            return syncInvoiceTotals({
                ...prev,
                lines: newLines,
            });
        });
    };

    useEffect(() => {
        if (isInternalExpense) {
            setInvoice(prev => syncInvoiceTotals({
                ...prev,
                lines: normalizeLinesForInternalExpense(prev.lines),
            }));
        }
    }, [isInternalExpense, normalizeLinesForInternalExpense]);

    const persistDocumentAttachment = async (file: File): Promise<ExpenseAttachment> => {
        setIsDocumentUploading(true);
        try {
            const { publicUrl, path } = await (async () => {
                try {
                    return await uploadFile(file, RINGI_BUCKET);
                } catch (err) {
                    if (shouldFallbackToDefaultBucket(err)) {
                        console.warn(`[ExpenseReimbursementForm] Bucket "${RINGI_BUCKET}" is unavailable. Falling back to default storage bucket.`, err);
                        return await uploadFile(file);
                    }
                    throw err;
                }
            })();
            if (!publicUrl) {
                throw new Error('添付ファイルの公開URL取得に失敗しました。');
            }
            const attachment: ExpenseAttachment = {
                name: file.name,
                publicUrl,
                path,
                type: file.type || 'application/octet-stream',
            };
            setDocumentAttachment(attachment);
            return attachment;
        } catch (err: any) {
            console.error('[ExpenseReimbursementForm] Failed to upload document', err);
            throw new Error(err?.message || '添付ファイルの保存に失敗しました。');
        } finally {
            setIsDocumentUploading(false);
        }
    };

    const handleFileDelete = () => {
        setInvoice(prev => ({
            ...prev,
            sourceFile: undefined,
        }));
        setDocumentAttachment(null);
        addToast?.('ファイルを削除しました。', 'info');
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        if (isOcrLoading || isDocumentUploading) {
            addToast?.('ファイル処理中です。完了までお待ちください。', 'info');
            return;
        }

        setIsOcrLoading(true);
        setError('');
        const file = files[0];
        let uploadedAttachment: ExpenseAttachment | null = null;

        try {
            const attachment = await persistDocumentAttachment(file);
            uploadedAttachment = attachment;
            let nextInvoiceState: ExpenseInvoiceDraft;

            if (!isAIOff) {
                const base64 = await readFileAsBase64(file);
                const ocrData: InvoiceData = await extractInvoiceDetails(base64, file.type);
                const newDraft = createEmptyInvoiceDraft();
                const ocrFields = new Set<string>();

                const updateField = (field: keyof ExpenseInvoiceDraft, value: any) => {
                    if (value !== undefined && value !== null) {
                        (newDraft as any)[field] = value;
                        ocrFields.add(field);
                    }
                };

                updateField('supplierName', ocrData.vendorName);
                updateField('registrationNumber', ocrData.registrationNumber);
                updateField('invoiceDate', ocrData.invoiceDate);
                updateField('dueDate', ocrData.dueDate);
                updateField('totalGross', ocrData.totalAmount);
                updateField('totalNet', ocrData.subtotalAmount);
                updateField('taxAmount', ocrData.taxAmount);

                // Detect if this is likely a tax-inclusive invoice
                const totalAmount = Number(ocrData.totalAmount) || 0;
                const subtotalAmount = Number(ocrData.subtotalAmount) || 0;
                const taxAmount = Number(ocrData.taxAmount) || 0;

                // If we have both total and tax, and subtotal is missing or close to total-tax, 
                // it's likely a tax-inclusive invoice
                const isInclusiveLikely = totalAmount > 0 && taxAmount > 0 && (
                    subtotalAmount === 0 ||
                    Math.abs(subtotalAmount - (totalAmount - taxAmount)) < 100
                );

                updateField('isTaxInclusive', isInclusiveLikely);

                if (ocrData.lineItems && ocrData.lineItems.length > 0) {
                    newDraft.lines = ocrData.lineItems.map(item => {
                        const candidateCustomer = (item as any).customerName || ocrData.relatedCustomer || '';
                        // 明細ごとに目的と用途を推定（デフォルト値）
                        const itemDescription = item.description || '';
                        let purposeType: '自社' | '顧客' | '他社' | 'その他' = '自社';
                        let businessCategory: '印刷' | '製造' | '物流' | '業務' | 'その他' = '業務';

                        // 品名から目的を推定
                        if (itemDescription.includes('顧客') || itemDescription.includes('納品')) {
                            purposeType = '顧客';
                        } else if (itemDescription.includes('他社') || itemDescription.includes('外注')) {
                            purposeType = '他社';
                        }

                        // 品名から事業カテゴリを推定
                        if (itemDescription.includes('印刷') || itemDescription.includes('プリント') || itemDescription.includes('刷り')) {
                            businessCategory = '印刷';
                        } else if (itemDescription.includes('製造') || itemDescription.includes('生産') || itemDescription.includes('加工')) {
                            businessCategory = '製造';
                        } else if (itemDescription.includes('配送') || itemDescription.includes('運送') || itemDescription.includes('発送')) {
                            businessCategory = '物流';
                        }

                        return {
                            ...createEmptyLine(true),
                            description: item.description || '',
                            customerName: candidateCustomer || '',
                            customCustomerName: candidateCustomer || '',
                            // Use OCR amount as-is. isTaxInclusive flag controls
                            // how computeLineTotals interprets the amount
                            // (tax-inclusive → back-calculate net; tax-exclusive → add tax).
                            // Do NOT double-convert here.
                            amountExclTax: item.amountExclTax || 0,
                            quantity: item.quantity || 1,
                            unitPrice: item.unitPrice || 0,
                            taxRate: item.taxRate || 10,
                            purposeType,
                            businessCategory,
                        };
                    });
                    ocrFields.add('lines');
                } else if (newDraft.totalNet) {
                    const candidateCustomer = ocrData.relatedCustomer || ocrData.project || '';
                    const itemDescription = ocrData.description || '品名不明';
                    let purposeType: '自社' | '顧客' | '他社' | 'その他' = '自社';
                    let businessCategory: '印刷' | '製造' | '物流' | '業務' | 'その他' = '業務';

                    // 単一明細の場合も推定
                    if (itemDescription.includes('印刷') || itemDescription.includes('プリント')) {
                        businessCategory = '印刷';
                    } else if (itemDescription.includes('製造') || itemDescription.includes('生産')) {
                        businessCategory = '製造';
                    } else if (itemDescription.includes('配送') || itemDescription.includes('運送')) {
                        businessCategory = '物流';
                    }

                    const inferredTaxRate = newDraft.totalNet > 0 && newDraft.taxAmount
                        ? Math.round((newDraft.taxAmount / newDraft.totalNet) * 100)
                        : 10;

                    // Use the gross amount when tax-inclusive, net when tax-exclusive.
                    // computeLineTotals handles the interpretation via isTaxInclusive flag.
                    const lineAmount = isInclusiveLikely
                        ? (newDraft.totalGross || newDraft.totalNet)
                        : newDraft.totalNet;
                    newDraft.lines = [{
                        ...createEmptyLine(true),
                        description: itemDescription,
                        customerName: candidateCustomer || '',
                        customCustomerName: candidateCustomer || '',
                        amountExclTax: lineAmount,
                        taxRate: inferredTaxRate,
                        purposeType,
                        businessCategory,
                    }];
                    ocrFields.add('lines');
                } else if (newDraft.totalGross) {
                    const candidateCustomer = ocrData.relatedCustomer || ocrData.project || '';
                    const itemDescription = ocrData.description || '品名不明';
                    let purposeType: '自社' | '顧客' | '他社' | 'その他' = '自社';
                    let businessCategory: '印刷' | '製造' | '物流' | '業務' | 'その他' = '業務';

                    if (itemDescription.includes('印刷') || itemDescription.includes('プリント')) {
                        businessCategory = '印刷';
                    } else if (itemDescription.includes('製造') || itemDescription.includes('生産')) {
                        businessCategory = '製造';
                    } else if (itemDescription.includes('配送') || itemDescription.includes('運送')) {
                        businessCategory = '物流';
                    }

                    const inferredNet = isInclusiveLikely && newDraft.taxAmount
                        ? Math.max(0, newDraft.totalGross - newDraft.taxAmount)
                        : newDraft.taxAmount
                            ? Math.max(0, newDraft.totalGross - newDraft.taxAmount)
                            : Math.round(newDraft.totalGross / 1.1);
                    const inferredTaxRate = inferredNet > 0 && newDraft.taxAmount
                        ? Math.round((newDraft.taxAmount / inferredNet) * 100)
                        : 10;

                    // For tax-inclusive, use totalGross directly; computeLineTotals will back-calc.
                    const lineAmount2 = isInclusiveLikely
                        ? newDraft.totalGross
                        : inferredNet;
                    newDraft.lines = [{
                        ...createEmptyLine(true),
                        description: itemDescription,
                        customerName: candidateCustomer || '',
                        customCustomerName: candidateCustomer || '',
                        amountExclTax: lineAmount2,
                        taxRate: inferredTaxRate,
                        purposeType,
                        businessCategory,
                    }];
                    ocrFields.add('lines');
                }

                newDraft.ocrExtractedFields = ocrFields;
                nextInvoiceState = newDraft;

                if (ocrFields.size === 0) {
                    console.error('[ExpenseReimbursementForm] OCR returned no usable fields', ocrData);
                    throw new Error('OCR結果を項目として取り込めませんでした。手入力で内容を入力してください。');
                }

                // OCR結果と手入力内容の相違チェック
                const validateOCRConsistency = () => {
                    if (!invoice.sourceFile || !ocrData) return true;

                    // 基本情報の相違チェック
                    const inconsistencies = [];

                    if (invoice.supplierName && ocrData.vendorName &&
                        invoice.supplierName !== ocrData.vendorName) {
                        inconsistencies.push(`サプライヤー名: OCR="${ocrData.vendorName}" vs 入力="${invoice.supplierName}"`);
                    }

                    if (invoice.totalGross && ocrData.totalAmount &&
                        Math.abs(Number(invoice.totalGross) - Number(ocrData.totalAmount)) > 100) {
                        inconsistencies.push(`合計金額: OCR=${ocrData.totalAmount} vs 入力=${invoice.totalGross}`);
                    }

                    if (invoice.invoiceDate && ocrData.invoiceDate &&
                        invoice.invoiceDate !== ocrData.invoiceDate) {
                        inconsistencies.push(`請求日: OCR="${ocrData.invoiceDate}" vs 入力="${invoice.invoiceDate}"`);
                    }

                    if (inconsistencies.length > 0) {
                        console.warn('[ExpenseReimbursementForm] OCRと入力内容に相違:', inconsistencies);
                        return false;
                    }

                    return true;
                };

                if (!validateOCRConsistency()) {
                    throw new Error('OCRで読み取った内容と入力内容に相違があります。内容を確認してください。');
                }
            } else {
                nextInvoiceState = {
                    ...invoice,
                };
            }

            nextInvoiceState.sourceFile = { name: file.name, type: file.type, url: attachment.publicUrl };

            setInvoice(syncInvoiceTotals(nextInvoiceState));
            addToast?.(
                isAIOff ? '請求書ファイルを保存しました。AI-OCRはスキップされました。' : 'OCRが完了しました。内容を確認してください。',
                'success'
            );
        } catch (err: any) {
            if (uploadedAttachment) {
                setInvoice(prev => ({
                    ...prev,
                    sourceFile: {
                        name: uploadedAttachment.name,
                        type: uploadedAttachment.type,
                        url: uploadedAttachment.publicUrl,
                    },
                }));
            }
            const message = err?.message || 'ファイル処理中にエラーが発生しました。';
            setError(message);
            addToast?.(message, 'error');
        } finally {
            setIsOcrLoading(false);
        }
    };

    const buildApplicationPayload = () => {
        const attachmentPayload = documentAttachment
            ? {
                documentUrl: documentAttachment.publicUrl,
                documentName: documentAttachment.name,
                documentMimeType: documentAttachment.type,
                documentStoragePath: documentAttachment.path,
            }
            : {};

        const totalAmount = pinnedTotalGross !== null ? pinnedTotalGross : Math.round(computedTotals.gross);
        const baseFormData = {
            departmentId,
            approvalRouteId,
            notes,
            isInternalExpense,
            totalAmount,
            amount: totalAmount,
            invoice: {
                ...invoice,
                totalGross: pinnedTotalGross !== null ? pinnedTotalGross : invoice.totalGross,
                ocrExtractedFields: Array.from(invoice.ocrExtractedFields),
            },
            mqAccounting: {
                expectedSalesPQ: mqExpectedSalesPQ === '' ? undefined : mqExpectedSalesPQ,
                expectedMarginMQ: mqExpectedMarginMQ === '' ? undefined : mqExpectedMarginMQ,
            },
            ...attachmentPayload,
        };

        return {
            applicationCodeId,
            formData: attachResubmissionMeta(baseFormData, resubmissionMeta),
            approvalRouteId,
            documentUrl: documentAttachment?.publicUrl,
        };
    };

    const executeSubmission = async () => {
    if (!currentUser) {
        setError('ユーザー情報が見つかりません。');
        return;
    }

    setIsSubmitting(true);
    setError('');

    try {
        const payload = buildApplicationPayload();

        console.log('[ExpenseReimbursementForm] submit payload:', payload);
        console.log('[ExpenseReimbursementForm] currentUser.id:', currentUser.id);

        await submitApplication(payload, currentUser.id);
        console.log('[ExpenseReimbursementForm] submitApplication success');

        try {
            await clearApplicationDraft(applicationCodeId, currentUser.id);
            console.log('[ExpenseReimbursementForm] clearApplicationDraft success');
        } catch (draftErr: any) {
            console.warn('[ExpenseReimbursementForm] clearApplicationDraft failed:', {
                message: draftErr?.message,
                details: draftErr?.details,
                hint: draftErr?.hint,
                code: draftErr?.code,
                raw: draftErr,
            });
        }

        setHasSubmitted(true);
        addToast?.('経費精算を送信しました。', 'success');

        if (emailService) {
            try {
                const emailResult = await emailService.sendApplicationNotification(
                    currentUser.email,
                    '経費精算申請を送信しました',
                    `経費精算申請が正常に送信されました。\n\n申請ID: ${applicationCodeId}\n申請日時: ${new Date().toLocaleString('ja-JP')}`
                );

                if (!emailResult.success) {
                    console.warn('Submission email failed:', emailResult.error);
                }
            } catch (emailError) {
                console.error('Email notification error:', emailError);
            }
        }

        onSuccess();
    } catch (err: any) {
        console.error('[ExpenseReimbursementForm] submitApplication failed:', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            raw: err,
        });

        const message = err?.message || '申請の提出に失敗しました。';
        setError(message);
        addToast?.(message, 'error');
    } finally {
        setIsSubmitting(false);
    }
};

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (hasSubmitted) {
            addToast?.('すでに送信済みの申請です。新しい申請を開始してください。', 'info');
            return;
        }
        if (!currentUser) return setError('ユーザー情報が見つかりません。');
        if (!departmentId) return setError('部門を選択してください。');
        if (!approvalRouteId) return setError('承認ルートを選択してください。');
        if (!invoice.supplierName) return setError('サプライヤー名を入力してください。');

        requestConfirmation({
            label: '申請を送信する',
            title: 'フォーム送信時に送信しますか？',
            description: 'はいを選ぶと申請が送信され、承認者に通知されます。内容の最終確認をお願いします。',
            confirmLabel: 'はい',
            cancelLabel: 'いいえ',
            draftLabel: '下書き',
            postConfirmMessage: 'はい（1件の申請を送信しました）',
            forceConfirmation: true,
            onConfirm: executeSubmission,
            onDraft: handleSaveDraft,
        });
    };

    const handleSaveDraft = async () => {
        if (hasSubmitted) {
            addToast?.('送信済みの申請は下書き保存できません。新しい申請を開始してください。', 'info');
            return;
        }
        if (!currentUser) return setError('ユーザー情報が見つかりません。');

        try {
            await saveApplicationDraft(buildApplicationPayload(), currentUser.id);
            addToast?.('下書きを保存しました。', 'success');
        } catch (err: any) {
            setError(err.message || '下書きの保存に失敗しました。');
        }
    };

    const handleStartNewApplication = () => {
        resetFormFields();
        setHasSubmitted(false);
        setError('');
    };

    const computedTotals = useMemo(() => computeLineTotals(invoice), [invoice]);

    if (isRestoring) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader className="w-12 h-12 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="w-full p-2 sm:p-4">
            {/* デバッグ用ボタン */}

            {hasSubmitted && (
                <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-6 dark:border-emerald-500/40 dark:bg-emerald-900/20">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-200">申請完了！</h3>
                            <p className="text-sm text-emerald-700 dark:text-emerald-300">経費精算申請が正常に送信されました</p>
                        </div>
                    </div>
                    <div className="bg-emerald-100 dark:bg-emerald-800/30 rounded-lg p-4 mb-4">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200">
                            <strong>次のステップ：</strong><br />
                            • 承認一覧 &gt; 自分の申請タブで進捗を確認できます<br />
                            • 承認者に通知が送信されました<br />
                            • 承認完了後にメール通知が届きます
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleStartNewApplication}
                            className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                            <PlusCircle className="w-5 h-5 mr-2" />
                            新しい申請を作成
                        </button>
                        <button
                            type="button"
                            onClick={() => window.location.href = '/accounting/approvals'}
                            className="flex-1 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
                        >
                            <List className="w-5 h-5 mr-2" />
                            申請一覧を確認
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {currentStep === 1 && (
                    <div className="space-y-6 animate-fade-in">
                        <Card>
                            <CardHeader>
                                <CardTitle>ステップ1: 請求書のアップロードと確認（任意）</CardTitle>
                                <CardDescription>請求書のPDFや画像をアップロードするとAI-OCRが情報を自動で読み取ります。資料がまだ無い場合は手入力のみで次へ進めます。</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <UploadZone
                                    onFileUpload={handleFileUpload}
                                    onFileDelete={handleFileDelete}
                                    isLoading={isOcrLoading}
                                    isAIOff={isAIOff}
                                    sourceFile={invoice.sourceFile}
                                    isSavingAttachment={isDocumentUploading}
                                    attachment={documentAttachment}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>ヘッダー情報</CardTitle>
                                <CardDescription>OCRが読み取った請求書の基本情報です。誤りがあれば修正してください。</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                                <FormField label="サプライヤー / 支払先" htmlFor="supplierName" required isOcr={invoice.ocrExtractedFields.has('supplierName')} className="md:col-span-2 lg:col-span-3">
                                    <SupplierSearchSelect
                                        suppliers={paymentRecipients}
                                        value={invoice.paymentRecipientId}
                                        searchHint={invoice.supplierName}
                                        onChange={(id, supplier) => {
                                            handleFieldChange('paymentRecipientId', id);
                                            if (supplier) handleFieldChange('supplierName', supplier.companyName || supplier.recipientName);
                                        }}
                                        onCreateSupplier={onCreatePaymentRecipient ? async (name) => {
                                            const created = await onCreatePaymentRecipient({ companyName: name });
                                            handleFieldChange('paymentRecipientId', created.id);
                                            handleFieldChange('supplierName', created.companyName);
                                            return created;
                                        } : undefined}
                                        disabled={isDisabled} required highlightRequired id="supplierName"
                                    />
                                </FormField>
                                <FormField label="登録番号 (インボイス)" htmlFor="registrationNumber" isOcr={invoice.ocrExtractedFields.has('registrationNumber')}>
                                    <input id="registrationNumber" type="text" value={invoice.registrationNumber} onChange={e => handleFieldChange('registrationNumber', e.target.value)} className="w-full rounded-md border-slate-300 dark:border-slate-600" disabled={isDisabled} />
                                </FormField>
                                <FormField label="請求書発行日" htmlFor="invoiceDate" required isOcr={invoice.ocrExtractedFields.has('invoiceDate')}>
                                    <input id="invoiceDate" type="date" value={invoice.invoiceDate} onChange={e => handleFieldChange('invoiceDate', e.target.value)} className="w-full rounded-md border-slate-300 dark:border-slate-600" disabled={isDisabled} required />
                                </FormField>
                                <FormField label="支払期限" htmlFor="dueDate" isOcr={invoice.ocrExtractedFields.has('dueDate')}>
                                    <input id="dueDate" type="date" value={invoice.dueDate} onChange={e => handleFieldChange('dueDate', e.target.value)} className="w-full rounded-md border-slate-300 dark:border-slate-600" disabled={isDisabled} />
                                </FormField>
                                <div className="md:col-span-2 lg:col-span-3">
                                    <FormField label="請求書の税区分" className="md:col-span-2 lg:col-span-3">
                                        <div className="flex items-center gap-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    id="tax-exclusive"
                                                    name="tax-type"
                                                    checked={!invoice.isTaxInclusive}
                                                    onChange={() => handleFieldChange('isTaxInclusive', false)}
                                                    disabled={isDisabled}
                                                    className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                />
                                                <label htmlFor="tax-exclusive" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    税抜請求書
                                                </label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    id="tax-inclusive"
                                                    name="tax-type"
                                                    checked={invoice.isTaxInclusive}
                                                    onChange={() => handleFieldChange('isTaxInclusive', true)}
                                                    disabled={isDisabled}
                                                    className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                />
                                                <label htmlFor="tax-inclusive" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    税込請求書
                                                </label>
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                                                {invoice.isTaxInclusive ?
                                                    '明細金額を税込として扱い、消費税を除いて計算します' :
                                                    '明細金額を税抜として扱い、消費税を加算して計算します'
                                                }
                                            </div>
                                        </div>
                                    </FormField>
                                </div>
                                <div className="md:col-span-2 lg:col-span-3 border-t dark:border-slate-700 pt-6 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <FormField label="税抜合計" htmlFor="totalNet" isOcr={invoice.ocrExtractedFields.has('totalNet')}>
                                        <input
                                            id="totalNet"
                                            type="number"
                                            value={Math.round(computedTotals.net)}
                                            readOnly
                                            className="w-full text-right rounded-md border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 cursor-not-allowed"
                                            disabled={isDisabled}
                                        />
                                    </FormField>
                                    <FormField label="消費税" htmlFor="taxAmount" isOcr={invoice.ocrExtractedFields.has('taxAmount')}>
                                        <input
                                            id="taxAmount"
                                            type="number"
                                            value={Math.round(computedTotals.tax)}
                                            readOnly
                                            className="w-full text-right rounded-md border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 cursor-not-allowed"
                                            disabled={isDisabled}
                                        />
                                    </FormField>
                                    <FormField label="税込合計（請求金額）" htmlFor="totalGross" isOcr={invoice.ocrExtractedFields.has('totalGross')}>
                                        <input
                                            id="totalGross"
                                            type="number"
                                            value={pinnedTotalGross !== null ? pinnedTotalGross : Math.round(computedTotals.gross)}
                                            onChange={e => handleFieldChange('totalGross', numberFromInput(e.target.value))}
                                            className={`w-full text-right rounded-md border-slate-300 dark:border-slate-600 font-bold text-lg ${
                                                pinnedTotalGross !== null && Math.abs(pinnedTotalGross - computedTotals.gross) > 1
                                                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200'
                                                    : ''
                                            }`}
                                            disabled={isDisabled}
                                        />
                                    </FormField>
                                    {pinnedTotalGross !== null && Math.abs(pinnedTotalGross - computedTotals.gross) > 1 && (
                                        <div className="sm:col-span-3 flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                請求金額 ¥{pinnedTotalGross.toLocaleString()} と明細合計 ¥{Math.round(computedTotals.gross).toLocaleString()} に差額があります。
                                                明細行の金額を調整するか、税区分（税込/税抜）を確認してください。
                                                <button
                                                    type="button"
                                                    onClick={() => setPinnedTotalGross(null)}
                                                    className="ml-2 underline font-semibold text-amber-800 dark:text-amber-200 hover:text-amber-900"
                                                >
                                                    自動計算に戻す
                                                </button>
                                            </p>
                                        </div>
                                    )}
                                    <p className="sm:col-span-3 text-xs text-slate-500 dark:text-slate-400">
                                        税抜合計・消費税は明細から自動計算されます。税込合計（請求金額）はOCR値を手動修正可能です。
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-6 animate-fade-in">
                        <Card>
                            <CardHeader>
                                <CardTitle>ステップ2: 明細の編集</CardTitle>
                                <CardDescription>経費の明細を入力または修正します。OCRで読み取られた行はハイライトされています。</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <LineItemTable
                                    lines={invoice.lines}
                                    onLineChange={handleLineChange}
                                    onAddLine={addLine}
                                    onRemoveLine={removeLine}
                                    isDisabled={isDisabled}
                                    customers={customers}
                                    jobs={jobs}
                                    isInternalExpense={isInternalExpense}
                                    accountItems={accountItems}
                                    isTaxInclusive={invoice.isTaxInclusive ?? false}
                                />
                            </CardContent>
                            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end items-center gap-6 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-xl">
                                <div className="text-sm">税抜合計: <span className="font-bold text-lg ml-2">¥{computedTotals.net.toLocaleString()}</span></div>
                                <div className="text-sm">消費税: <span className="font-bold text-lg ml-2">¥{Math.round(computedTotals.tax).toLocaleString()}</span></div>
                                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">税込合計: <span className="text-xl ml-2">¥{Math.round(computedTotals.gross).toLocaleString()}</span></div>
                            </div>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>PQ / MQ（申請全体）</CardTitle>
                                <CardDescription>この経費申請全体に対する期待売上(PQ)と期待限界利益(MQ)を入力すると、m率が自動計算されます。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                                    <FormField label="期待売上 (PQ)">
                                        <input
                                            type="number"
                                            value={mqExpectedSalesPQ === '' ? '' : mqExpectedSalesPQ}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setMqExpectedSalesPQ(v === '' ? '' : Number(v));
                                            }}
                                            className="w-full rounded-md border-slate-300 dark:border-slate-600 text-right"
                                            placeholder="例）1000000"
                                            disabled={isDisabled}
                                        />
                                    </FormField>
                                    <FormField label="期待限界利益 (MQ)">
                                        <input
                                            type="number"
                                            value={mqExpectedMarginMQ === '' ? '' : mqExpectedMarginMQ}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setMqExpectedMarginMQ(v === '' ? '' : Number(v));
                                            }}
                                            className="w-full rounded-md border-slate-300 dark:border-slate-600 text-right"
                                            placeholder="例）400000"
                                            disabled={isDisabled}
                                        />
                                    </FormField>
                                    <div className="space-y-1 text-sm">
                                        <div className="text-slate-500 dark:text-slate-400">m率 (MQ ÷ PQ)</div>
                                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                            {mqMRate === null ? '- %' : `${mqMRate.toFixed(1)}%`}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-6 animate-fade-in">
                        <Card>
                            <CardHeader>
                                <CardTitle>ステップ3: 申請内容の最終確認と提出</CardTitle>
                                <CardDescription>申請内容を確認し、部門と承認ルートを選択して提出してください。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <FormField label="申請部門" htmlFor="departmentId" required>
                                    <DepartmentSelect value={departmentId} onChange={setDepartmentId} required highlightRequired id="departmentId" />
                                </FormField>
                                <FormField label="承認ルート" required>
                                    <ApprovalRouteSelector onChange={setApprovalRouteId} isSubmitting={isDisabled} highlightRequired />
                                </FormField>
                                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-2">
                                    <label className="flex items-start gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            checked={isInternalExpense}
                                            onChange={e => setIsInternalExpense(e.target.checked)}
                                            disabled={isDisabled}
                                        />
                                        <span>社内経費として処理（顧客や案件へ配賦しない）</span>
                                    </label>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        社内備品や福利厚生費など、特定顧客に紐づかない支出の場合はチェックしてください。帳票出力時に「社内用」の目印が付きます。
                                    </p>
                                </div>
                                <FormField label="備考" htmlFor="notes">
                                    <textarea
                                        id="notes"
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        rows={8}
                                        className="w-full rounded-md border-slate-300 dark:border-slate-600 min-h-[200px]"
                                        placeholder="補足事項や承認者へのコメントがあれば入力してください。"
                                        disabled={isDisabled}
                                    />
                                </FormField>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>最終確認</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between text-sm"><span className="text-slate-500">サプライヤー:</span> <span className="font-medium">{invoice.supplierName}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">請求書発行日:</span> <span className="font-medium">{invoice.invoiceDate}</span></div>
                                <div className="flex justify-between text-sm"><span className="text-slate-500">申請部門:</span> <span className="font-medium">{departments.find(d => d.id === departmentId)?.name || '未選択'}</span></div>
                                <div className="flex justify-between text-lg font-bold pt-3 border-t dark:border-slate-700 mt-3"><span className="text-slate-600 dark:text-slate-300">合計申請金額 (税込):</span> <span>¥{Math.round(computedTotals.gross).toLocaleString()}</span></div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {error && <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3" role="alert">{error}</p>}

                <footer className="mt-8 flex justify-between items-center">
                    <button type="button" onClick={() => setCurrentStep(s => Math.max(1, s - 1))} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100 font-semibold disabled:opacity-50" disabled={isDisabled || currentStep === 1}>
                        <ArrowLeft className="w-4 h-4" /> 戻る
                    </button>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={handleSaveDraft} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-2 disabled:opacity-50" disabled={isDisabled}>
                            {isSavingDraft ? <Loader className="w-4 h-4 animate-spin" /> : '下書き保存'}
                        </button>
                        {currentStep < 3 ? (
                            <button type="button" onClick={() => setCurrentStep(s => Math.min(3, s + 1))} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50" disabled={isDisabled}>
                                次へ <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button type="submit" className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:bg-slate-400" disabled={isDisabled}>
                                {isSubmitting ? <Loader className="w-4 h-4 animate-spin" /> : '申請を送信する'}
                            </button>
                        )}
                    </div>
                </footer>
            </form>
            {ConfirmationDialog}
        </div>
    );
};

// --- CHILD COMPONENTS ---

const UploadZone: React.FC<{
    onFileUpload: (files: FileList | null) => void;
    onFileDelete?: () => void;
    isLoading: boolean;
    isAIOff: boolean;
    sourceFile?: { name: string; url: string; type: string };
    isSavingAttachment?: boolean;
    attachment?: ExpenseAttachment | null;
}> = ({ onFileUpload, onFileDelete, isLoading, isAIOff, sourceFile, isSavingAttachment = false, attachment }) => {
    const [isDragging, setIsDragging] = useState(false);
    const isBusy = isLoading || isSavingAttachment;

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!isBusy) setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (isBusy) return;
        onFileUpload(e.dataTransfer.files);
    };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isBusy) return;
        onFileUpload(e.target.files);
        e.target.value = ''; // Reset input
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/50' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400'
                    } ${isBusy && 'opacity-50 cursor-not-allowed'}`}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                    <Upload className="w-10 h-10 mb-4 text-slate-500 dark:text-slate-400" />
                    <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">クリックしてアップロード、またはドラッグ＆ドロップ</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">PDF, PNG, JPG (MAX. 10MB)</p>
                    {isAIOff && (
                        <p className="mt-2 text-xs font-semibold text-amber-600">
                            AI機能が無効のためOCRはスキップされます（ファイルは保存されます）
                        </p>
                    )}
                </div>
                <input
                    id="dropzone-file"
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={isBusy}
                    accept="application/pdf,image/png,image/jpeg"
                />
                {isBusy && (
                    <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex flex-col items-center justify-center rounded-lg z-50">
                        <Loader className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="mt-2 text-sm font-semibold text-blue-600">
                            {isSavingAttachment ? 'ファイルをSupabaseに保存中です...' : 'AI-OCRが解析中...'}
                        </p>
                    </div>
                )}
            </div>
            <div className="h-64 bg-slate-100 dark:bg-slate-900/50 rounded-lg flex flex-col items-center justify-center border dark:border-slate-700 p-4 text-center gap-3 relative">
                {sourceFile ? (
                    <>
                        {sourceFile.type.startsWith('image/') ? (
                            <img src={sourceFile.url} alt={sourceFile.name} className="max-h-full max-w-full object-contain rounded-md" />
                        ) : sourceFile.type === 'application/pdf' ? (
                            <iframe
                                src={sourceFile.url}
                                className="w-full h-full rounded-md"
                                title={sourceFile.name}
                                onLoad={() => console.log('PDF loaded successfully')}
                                onError={() => console.log('PDF failed to load')}
                            />
                        ) : (
                            <div className="text-center p-4">
                                <FileText className="w-16 h-16 mx-auto text-slate-500" />
                                <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">{sourceFile.name}</p>
                                <p className="text-xs text-slate-500">{sourceFile.type}</p>
                            </div>
                        )}
                        {onFileDelete && (
                            <button
                                type="button"
                                onClick={onFileDelete}
                                className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors"
                                title="ファイルを削除"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="text-center text-slate-500">
                        <FileText className="w-16 h-16 mx-auto" />
                        <p className="mt-2">プレビューエリア</p>
                    </div>
                )}
                {attachment?.publicUrl && (
                    <a
                        href={attachment.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-green-700 dark:text-green-300 underline"
                    >
                        <Check className="w-4 h-4" />
                        {attachment.name} を開く
                    </a>
                )}
            </div>
        </div>
    );
};

const LineItemTable: React.FC<{
    lines: ExpenseLine[];
    onLineChange: (lineId: string, field: keyof ExpenseLine, value: any) => void;
    onAddLine: () => void;
    onRemoveLine: (lineId: string) => void;
    isDisabled: boolean;
    customers: Customer[];
    jobs: Job[];
    isInternalExpense: boolean;
    accountItems: AccountItem[];
    isTaxInclusive: boolean;
}> = ({ lines, onLineChange, onAddLine, onRemoveLine, isDisabled, customers, jobs, isInternalExpense, accountItems, isTaxInclusive }) => {
    const inputClass =
        'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';
    const selectClass = inputClass;
    const labelClass = 'text-xs font-semibold text-slate-500 dark:text-slate-400';
    const helperClass = 'text-[11px] text-slate-500 dark:text-slate-400';

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">明細行</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{lines.length} 件</p>
                </div>
                <button
                    type="button"
                    onClick={onAddLine}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    disabled={isDisabled}
                >
                    <PlusCircle className="w-5 h-5" />
                    明細行を追加
                </button>
            </div>

            {lines.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-500">
                    明細がありません。右上の「明細行を追加」から登録してください。
                </div>
            )}

            {lines.map((line, index) => {
                const customerDatalistId = `customer-options-${line.id}`;
                const projectDatalistId = `project-options-${line.id}`;
                const selectedCustomer = customers.find(c => c.id === line.customerId);
                const selectedProject = jobs.find(job => job.id === line.projectId);
                const customerDisplayName = line.customCustomerName || line.customerName || selectedCustomer?.customerName || '';
                const projectDisplayName = line.projectName || selectedProject?.title || '';
                const availableProjects = line.customerId
                    ? jobs.filter(job => job.customerId === line.customerId)
                    : jobs;
                const limitedProjectOptions = availableProjects.slice(0, 30);
                // 使用目的に基づいて顧客フィールドの制御を判断
                const isNonCustomerExpense = line.purposeType === '自社' || line.purposeType === '他社' || line.purposeType === 'その他';

                const handleCustomerInputChange = (value: string) => {
                    const trimmed = value.trim();
                    if (trimmed.length === 0) {
                        onLineChange(line.id, 'customerId', '');
                        onLineChange(line.id, 'customerName', '');
                        onLineChange(line.id, 'customCustomerName', trimmed);
                    } else {
                        const match = customers.find(c => c.customerName === trimmed);
                        if (match) {
                            onLineChange(line.id, 'customerId', match.id);
                            onLineChange(line.id, 'customerName', match.customerName);
                            onLineChange(line.id, 'customCustomerName', '');
                            // 顧客名が入力されたら目的を「顧客」に自動設定
                            if (line.purposeType !== '顧客') {
                                onLineChange(line.id, 'purposeType', '顧客');
                            }
                        } else {
                            onLineChange(line.id, 'customerId', '');
                            onLineChange(line.id, 'customerName', '');
                            onLineChange(line.id, 'customCustomerName', trimmed);
                        }
                    }
                };

                const handleProjectInputChange = (value: string) => {
                    const trimmed = value.trim();
                    const match = availableProjects.find(
                        project => project.title.toLowerCase() === trimmed.toLowerCase()
                    );
                    if (match) {
                        onLineChange(line.id, 'projectId', match.id);
                        onLineChange(line.id, 'projectName', match.title);
                    } else {
                        onLineChange(line.id, 'projectId', '');
                        onLineChange(line.id, 'projectName', value);
                    }
                };

                return (
                    <div
                        key={line.id}
                        className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4 space-y-4 ${line.ocrExtracted ? 'ring-2 ring-amber-200/80 bg-amber-50/60 dark:bg-amber-500/10' : ''
                            }`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">明細 {index + 1}</span>
                                {line.ocrExtracted && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                                        OCR
                                    </span>
                                )}
                                {isNonCustomerExpense && !isInternalExpense && (
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                        非顧客用途
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onRemoveLine(line.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                                disabled={isDisabled}
                            >
                                <Trash2 className="w-4 h-4" />
                                削除
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                            <div className="lg:col-span-4 space-y-1">
                                <label className={labelClass}>品名 / 用途</label>
                                <input
                                    type="text"
                                    value={line.description}
                                    onChange={e => onLineChange(line.id, 'description', e.target.value)}
                                    className={inputClass}
                                    disabled={isDisabled}
                                    placeholder="例: 校了データ発送作業"
                                />
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className={labelClass}>使用目的</label>
                                <select
                                    value={line.purposeType}
                                    onChange={e => onLineChange(line.id, 'purposeType', e.target.value)}
                                    className={selectClass}
                                    disabled={isDisabled}
                                >
                                    <option value="自社">自社</option>
                                    <option value="顧客">顧客</option>
                                    <option value="他社">他社</option>
                                    <option value="その他">その他</option>
                                </select>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className={labelClass}>事業カテゴリ</label>
                                <select
                                    value={line.businessCategory}
                                    onChange={e => onLineChange(line.id, 'businessCategory', e.target.value)}
                                    className={selectClass}
                                    disabled={isDisabled}
                                >
                                    <option value="印刷">印刷</option>
                                    <option value="製造">製造</option>
                                    <option value="物流">物流</option>
                                    <option value="業務">業務</option>
                                    <option value="その他">その他</option>
                                </select>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className={labelClass}>日付</label>
                                <input
                                    type="date"
                                    value={line.lineDate}
                                    onChange={e => onLineChange(line.id, 'lineDate', e.target.value)}
                                    className={inputClass}
                                    disabled={isDisabled}
                                />
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className={labelClass}>金額{isTaxInclusive ? '(税込)' : '(税抜)'}</label>
                                <input
                                    type="number"
                                    value={line.amountExclTax}
                                    onChange={e => onLineChange(line.id, 'amountExclTax', numberFromInput(e.target.value))}
                                    className={`${inputClass} text-right`}
                                    disabled={isDisabled}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                            {!isInternalExpense ? (
                                <>
                                    <div className="lg:col-span-5 space-y-1">
                                        <label className={labelClass}>顧客候補（オートコンプリート可）</label>
                                        <input
                                            type="text"
                                            list={customerDatalistId}
                                            value={customerDisplayName}
                                            onChange={e => handleCustomerInputChange(e.target.value)}
                                            onBlur={e => handleCustomerInputChange(e.target.value)}
                                            className={inputClass}
                                            disabled={isDisabled}
                                            placeholder="顧客名や「その他」「校正用プリント」など"
                                        />
                                        <datalist id={customerDatalistId}>
                                            {customers.map(customer => (
                                                <option key={customer.id} value={customer.customerName} />
                                            ))}
                                        </datalist>
                                        {!line.customerId && !line.customCustomerName && !isDisabled && (
                                            <p className="text-[11px] text-amber-600">
                                                まず名称を入力しておくと後で得意先登録がしやすくなります。
                                            </p>
                                        )}
                                    </div>
                                    <div className="lg:col-span-5 space-y-1">
                                        <label className={labelClass}>プロジェクト / 案件名</label>
                                        <input
                                            type="text"
                                            list={projectDatalistId}
                                            value={projectDisplayName}
                                            onChange={e => handleProjectInputChange(e.target.value)}
                                            onBlur={e => handleProjectInputChange(e.target.value)}
                                            className={inputClass}
                                            disabled={isDisabled}
                                            placeholder="案件名 / プロジェクト名（自由入力可）"
                                        />
                                        <datalist id={projectDatalistId}>
                                            {limitedProjectOptions.map(project => (
                                                <option key={project.id} value={project.title} />
                                            ))}
                                        </datalist>
                                        {!line.customerId && (
                                            <p className={helperClass}>
                                                得意先が未登録でも案件名をメモできます。登録後に紐付けてください。
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="lg:col-span-10 space-y-1">
                                    <label className={labelClass}>社内用途メモ</label>
                                    <textarea
                                        value={line.internalMemo ?? ''}
                                        onChange={e => onLineChange(line.id, 'internalMemo', e.target.value)}
                                        className={inputClass}
                                        rows={3}
                                        placeholder="例: 広報部ノベルティ用・社内研修資料など"
                                        disabled={isDisabled}
                                    />
                                    {!line.internalMemo && !isDisabled && (
                                        <p className={helperClass}>部署や目的を入力しておくと仕訳時に迷いません。</p>
                                    )}
                                </div>
                            )}
                            <div className="lg:col-span-2 space-y-1">
                                <label className={labelClass}>勘定科目</label>
                                <AccountItemSelect
                                    accountItems={accountItems}
                                    value={line.accountItemId}
                                    onChange={(newId: string) => onLineChange(line.id, 'accountItemId', newId)}
                                    disabled={isDisabled}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
export default ExpenseReimbursementForm;

