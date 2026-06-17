import React, { useState, useMemo, useEffect } from 'react';
import { submitApplication, saveApplicationDraft, clearApplicationDraft } from '../../services/dataService';
import { extractInvoiceDetails } from '../../services/geminiService';
import ApprovalRouteSelector from './ApprovalRouteSelector';
import { Loader, Upload, PlusCircle, Trash2, Copy, AlertTriangle } from '../Icons';
import { User, ApplicationWithDetails } from '../../types';
import { useSubmitWithConfirmation } from '../../hooks/useSubmitWithConfirmation';
import { attachResubmissionMeta, buildResubmissionMeta } from '../../utils/applicationResubmission';
import * as XLSX from 'xlsx';

interface TransportExpenseFormProps {
    onSuccess: () => void;
    applicationCodeId: string;
    currentUser: User | null;
    isAIOff: boolean;
    isLoading: boolean;
    error: string;
    draftApplication?: ApplicationWithDetails | null;
}

interface TransportDetail {
    id: string;
    travelDate: string;
    departure: string;
    arrival: string;
    transportMode: string;
    amount: number;
}

const TRANSPORT_MODES = ['電車', 'バス', 'タクシー', '飛行機', 'その他'];

const createEmptyDetail = (): TransportDetail => ({
    id: `row_${Date.now()}`,
    travelDate: new Date().toISOString().split('T')[0],
    departure: '',
    arrival: '',
    transportMode: TRANSPORT_MODES[0],
    amount: 0,
});

const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject("Read failed");
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

const TransportExpenseForm: React.FC<TransportExpenseFormProps> = ({ onSuccess, applicationCodeId, currentUser, isAIOff, isLoading, error: formLoadError, draftApplication }) => {
    const [details, setDetails] = useState<TransportDetail[]>(() => [createEmptyDetail()]);
    const [notes, setNotes] = useState('');
    const [approvalRouteId, setApprovalRouteId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [error, setError] = useState('');
    const { requestConfirmation, ConfirmationDialog } = useSubmitWithConfirmation();

    const isDisabled = isSubmitting || isSavingDraft || isLoading || !!formLoadError;
    const totalAmount = useMemo(() => {
        return details.reduce((sum, item) => {
            const amount = Number(item.amount) || 0;
            return sum + amount;
        }, 0);
    }, [details]);

    const resubmissionMeta = useMemo(() => buildResubmissionMeta(draftApplication), [draftApplication]);

    const addNewRow = () => {
        setDetails(prev => [...prev, createEmptyDetail()]);
    };

    const handleDetailChange = (id: string, field: keyof TransportDetail, value: string | number) => {
        setDetails(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleRemoveRow = (id: string) => setDetails(prev => prev.filter(item => item.id !== id));

    const handleDuplicateRow = (id: string) => {
    setDetails(prev => {
        const targetIndex = prev.findIndex(item => item.id === id);
        if (targetIndex === -1) return prev;

        const target = prev[targetIndex];

        const duplicated: TransportDetail = {
            ...target,
            id: `row_copy_${Date.now()}_${Math.random()}`,
        };

        const next = [...prev];
        next.splice(targetIndex + 1, 0, duplicated);
        return next;
    });
};

    // Handle paste from clipboard
    const handlePaste = async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;

    const target = e.target as HTMLElement;
    const tagName = target.tagName?.toLowerCase();

    const isInputPaste =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select';

    const isBulkPaste =
        text.includes('\t') ||
        text.includes('\n') ||
        text.includes(',');

    if (isInputPaste && !isBulkPaste) {
        return;
    }

    e.preventDefault();

    try {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const newDetails: TransportDetail[] = [];

        let startIndex = 0;
        if (lines.length > 0) {
            const firstLine = lines[0].toLowerCase();
            if (
                firstLine.includes('利用日') ||
                firstLine.includes('日付') ||
                firstLine.includes('travel') ||
                firstLine.includes('出発地') ||
                firstLine.includes('目的地') ||
                firstLine.includes('交通手段') ||
                firstLine.includes('金額') ||
                firstLine.includes('date') ||
                firstLine.includes('departure') ||
                firstLine.includes('arrival')
            ) {
                startIndex = 1;
            }
        }

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];

            const parts = line.includes('\t')
                ? line.split('\t').map(p => p.trim().replace(/^"|"$/g, ''))
                : line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));

            if (parts.length >= 5) {
                let [date, departure, arrival, transport, amount] = parts;

                // ここから下は既存のdate変換処理をそのまま使用

                    // Clean up date field
                    if (date) {
                        date = date.trim();

                        // Handle Excel date numbers
                        if (!isNaN(Number(date)) && date.length <= 10 && date !== '') {
                            try {
                                const excelDate = new Date((Number(date) - 25569) * 86400 * 1000);
                                if (!isNaN(excelDate.getTime())) {
                                    date = excelDate.toISOString().split('T')[0];
                                } else {
                                    date = new Date().toISOString().split('T')[0];
                                }
                            } catch {
                                date = new Date().toISOString().split('T')[0];
                            }
                        }
                        // Handle various date formats
                        else if (date.includes('/') || date.includes('-')) {
                            const parsedDate = new Date(date);
                            if (!isNaN(parsedDate.getTime())) {
                                date = parsedDate.toISOString().split('T')[0];
                                console.log('Converted slash/date:', date);
                            } else {
                                // Handle short format like "1/9" - assume current year
                                const match = date.match(/(\d{1,2})[\/](\d{1,2})/);
                                if (match) {
                                    const [, month, day] = match;
                                    const currentYear = new Date().getFullYear();
                                    // Create date in current year to avoid 1900s interpretation
                                    const fullDate = `${currentYear}/${month}/${day}`;
                                    const parsedDate = new Date(fullDate);
                                    if (!isNaN(parsedDate.getTime())) {
                                        date = parsedDate.toISOString().split('T')[0];
                                    } else {
                                        date = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                    }
                                    console.log('Converted short date (M/D) with current year:', date);
                                } else {
                                    // Try to parse Japanese date format
                                    const jpMatch = date.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                                    if (jpMatch) {
                                        const [, year, month, day] = jpMatch;
                                        date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                        console.log('Converted Japanese slash date:', date);
                                    } else {
                                        date = new Date().toISOString().split('T')[0];
                                        console.log('Invalid date format, using today:', date);
                                    }
                                }
                            }
                        }
                        // Handle Japanese date format like "2026年1月29日"
                        else if (date.includes('年') && date.includes('月') && date.includes('日')) {
                            const match = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                            if (match) {
                                const [, year, month, day] = match;
                                date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                            } else {
                                date = new Date().toISOString().split('T')[0];
                            }
                        }
                        // If no proper date format, use today
                        else {
                            date = new Date().toISOString().split('T')[0];
                        }
                    } else {
                        date = new Date().toISOString().split('T')[0];
                    }

                    if (departure && arrival) {
                        let parsedAmount = parseInt(amount.replace(/[^\d-]/g, '')) || 0;

                        newDetails.push({
                            id: `row_paste_${Date.now()}_${Math.random()}`,
                            travelDate: date,
                            departure: departure.trim(),
                            arrival: arrival.trim(),
                            transportMode: TRANSPORT_MODES.includes(transport) ? transport : TRANSPORT_MODES[0],
                            amount: parsedAmount,
                        });
                    }
                }
            }

            // Check for duplicates before adding
            const uniqueNewDetails = newDetails.filter(newDetail => {
                const isDuplicate = details.some(existing =>
                    existing.travelDate === newDetail.travelDate &&
                    existing.departure === newDetail.departure &&
                    existing.arrival === newDetail.arrival &&
                    existing.amount === newDetail.amount
                );
                return !isDuplicate;
            });

            if (uniqueNewDetails.length > 0) {
                setDetails(prev => [...prev.filter(d => d.departure || d.arrival), ...uniqueNewDetails]);
                setError('');
                if (uniqueNewDetails.length < newDetails.length) {
                    setError(`${newDetails.length - uniqueNewDetails.length}件の重複データを除外しました。`);
                }
            } else {
                setError('貼り付けデータが重複しているか、有効なデータが見つかりませんでした。');
            }
        } catch (err) {
            setError('貼り付けデータの解析に失敗しました。タブ区切りのデータを貼り付けてください。');
        }
    };

    // Handle Excel file upload with proper encoding detection
    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            let text: string;
            let lines: string[] = [];

            // Handle different file types
            if (file.name.endsWith('.csv')) {
                // For CSV files, detect encoding
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                // Check if it's likely Shift-JIS (contains Japanese characters in high bytes)
                const isLikelyShiftJIS = Array.from(uint8Array.slice(0, 1024)).some(byte => byte >= 0x80 && byte <= 0x9F || byte >= 0xE0 && byte <= 0xEF);

                if (isLikelyShiftJIS) {
                    // Use TextDecoder with Shift-JIS
                    const decoder = new TextDecoder('shift-jis');
                    text = decoder.decode(uint8Array);
                } else {
                    // Fallback to UTF-8
                    text = new TextDecoder('utf-8').decode(uint8Array);
                }
                lines = text.split('\n').filter(line => line.trim());
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                // For Excel files, use xlsx library
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                lines = jsonData.map((row: any) => {
                    if (Array.isArray(row)) {
                        return row.map(cell => String(cell).trim()).join('\t');
                    }
                    return String(row).trim();
                }).filter(line => line.trim());
            } else {
                setError('対応していないファイル形式です。CSVまたはExcelファイル(.xlsx/.xls)を使用してください。');
                return;
            }

            const newDetails: TransportDetail[] = [];

            // Skip header row if exists - more robust detection
            let startIndex = 0;
            if (lines.length > 0) {
                const firstLine = lines[0].toLowerCase();
                if (
                    firstLine.includes('利用日') ||
                    firstLine.includes('日付') ||
                    firstLine.includes('travel') ||
                    firstLine.includes('出発地') ||
                    firstLine.includes('目的地') ||
                    firstLine.includes('交通手段') ||
                    firstLine.includes('金額') ||
                    firstLine.includes('date') ||
                    firstLine.includes('departure') ||
                    firstLine.includes('arrival')
                ) {
                    startIndex = 1;
                    console.log('Header row detected and skipped:', lines[0]);
                }
            }

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                // Try both tab and comma separators
                const parts = line.includes('\t') ? line.split('\t').map(p => p.trim().replace(/"/g, '')) : line.split(',').map(p => p.trim().replace(/"/g, ''));

                if (parts.length >= 5) {
                    let [date, departure, arrival, transport, amount] = parts;

                    // Debug logging
                    console.log('Processing row:', { date, departure, arrival, transport, amount });

                    // Clean up date field - handle various date formats
                    if (date) {
                        // Remove extra spaces and normalize
                        date = date.trim();
                        console.log('Original date:', date);

                        // Handle Excel date format (number)
                        if (!isNaN(Number(date)) && date.length <= 10 && date !== '') {
                            try {
                                const excelDate = new Date((Number(date) - 25569) * 86400 * 1000);
                                if (!isNaN(excelDate.getTime())) {
                                    date = excelDate.toISOString().split('T')[0];
                                    console.log('Converted Excel date:', date);
                                } else {
                                    date = new Date().toISOString().split('T')[0];
                                    console.log('Invalid Excel date, using today:', date);
                                }
                            } catch {
                                date = new Date().toISOString().split('T')[0];
                                console.log('Excel date conversion failed, using today:', date);
                            }
                        }
                        // Handle various date formats
                        else if (date.includes('/') || date.includes('-')) {
                            // For dates like "2026/01/29" or "2026-01-29" or "1/9"
                            // First try to parse as is
                            const parsedDate = new Date(date);
                            if (!isNaN(parsedDate.getTime())) {
                                date = parsedDate.toISOString().split('T')[0];
                                console.log('Converted slash/date:', date);
                            } else {
                                // Handle short format like "1/9" - assume current year
                                const match = date.match(/(\d{1,2})[\/](\d{1,2})/);
                                if (match) {
                                    const [, month, day] = match;
                                    const currentYear = new Date().getFullYear();
                                    // Create date in current year to avoid 1900s interpretation
                                    const fullDate = `${currentYear}/${month}/${day}`;
                                    const parsedDate = new Date(fullDate);
                                    if (!isNaN(parsedDate.getTime())) {
                                        date = parsedDate.toISOString().split('T')[0];
                                    } else {
                                        date = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                    }
                                    console.log('Converted short date (M/D) with current year:', date);
                                } else {
                                    // Try to parse Japanese date format
                                    const jpMatch = date.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                                    if (jpMatch) {
                                        const [, year, month, day] = jpMatch;
                                        date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                        console.log('Converted Japanese slash date:', date);
                                    } else {
                                        date = new Date().toISOString().split('T')[0];
                                        console.log('Invalid date format, using today:', date);
                                    }
                                }
                            }
                        }
                        // Handle Japanese date format like "2026年1月29日"
                        else if (date.includes('年') && date.includes('月') && date.includes('日')) {
                            const match = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
                            if (match) {
                                const [, year, month, day] = match;
                                date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                console.log('Converted Japanese date:', date);
                            } else {
                                date = new Date().toISOString().split('T')[0];
                                console.log('Invalid Japanese date, using today:', date);
                            }
                        }
                        // If it's not a valid date format, use today
                        else {
                            date = new Date().toISOString().split('T')[0];
                            console.log('Unknown date format, using today:', date);
                        }
                    } else {
                        date = new Date().toISOString().split('T')[0];
                        console.log('Empty date, using today:', date);
                    }

                    if (departure && arrival) {
                        let parsedAmount = parseInt(amount.replace(/[^\d-]/g, '')) || 0;

                        newDetails.push({
                            id: `row_excel_${Date.now()}_${i}`,
                            travelDate: date,
                            departure: departure.trim(),
                            arrival: arrival.trim(),
                            transportMode: TRANSPORT_MODES.includes(transport) ? transport : TRANSPORT_MODES[0],
                            amount: parsedAmount,
                        });
                    }
                }
            }

            // Check for duplicates before adding
            const uniqueNewDetails = newDetails.filter(newDetail => {
                const isDuplicate = details.some(existing =>
                    existing.travelDate === newDetail.travelDate &&
                    existing.departure === newDetail.departure &&
                    existing.arrival === newDetail.arrival &&
                    existing.amount === newDetail.amount
                );
                return !isDuplicate;
            });

            if (uniqueNewDetails.length > 0) {
                setDetails(prev => [...prev.filter(d => d.departure || d.arrival), ...uniqueNewDetails]);
                setError('');
                if (uniqueNewDetails.length < newDetails.length) {
                    setError(`${newDetails.length - uniqueNewDetails.length}件の重複データを除外しました。`);
                }
            } else {
                setError('ファイルから有効なデータが見つからなかったか、すべて重複していました。');
            }
        } catch (err) {
            console.error('File upload error:', err);
            setError('ファイルの読み込みに失敗しました。ファイル形式を確認してください。');
        } finally {
            e.target.value = '';
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (isAIOff) {
            setError('AI機能は現在無効です。ファイルからの読み取りはできません。');
            return;
        }

        setIsOcrLoading(true);
        setError('');
        try {
            const base64String = await readFileAsBase64(file);
            const ocrData: any = await extractInvoiceDetails(base64String, file.type);

            // Heuristic to parse departure/arrival from description
            const description = ocrData.description || '';
            const parts = description.split(/から|→|～/);
            const departure = parts[0]?.trim() || '';
            const arrival = parts[1]?.trim() || '';

            setDetails(prev => [...prev.filter(d => d.departure || d.arrival), {
                id: `row_ocr_${Date.now()}`,
                travelDate: ocrData.invoiceDate || new Date().toISOString().split('T')[0],
                departure,
                arrival,
                transportMode: TRANSPORT_MODES[0],
                amount: ocrData.totalAmount || 0,
            }]);
        } catch (err: any) {
            if (err.name === 'AbortError') return; // Request was aborted, do nothing
            setError(err.message || 'AI-OCR処理中にエラーが発生しました。');
        } finally {
            setIsOcrLoading(false);
            e.target.value = '';
        }
    };

    const buildSubmissionPayload = () => {
    const sanitizedDetails = details
        .filter(d => d.departure || d.arrival)
        .map(detail => ({
            travelDate: detail.travelDate,
            departure: detail.departure,
            arrival: detail.arrival,
            transportMode: detail.transportMode,
            amount: detail.amount,
        }));

    return {
        applicationCodeId,
        formData: attachResubmissionMeta(
            {
                details: sanitizedDetails,
                notes,
                totalAmount,
            },
            resubmissionMeta
        ),
        approvalRouteId: approvalRouteId && approvalRouteId.trim() ? approvalRouteId : null,
    };
};

    const executeSubmission = async () => {
        if (!currentUser) {
            setError('ユーザー情報が見つかりません。');
            return;
        }
        const payload = buildSubmissionPayload();
        setIsSubmitting(true);
        setError('');
        try {
            await submitApplication(payload, currentUser.id);
            await clearApplicationDraft(applicationCodeId, currentUser.id);
            onSuccess();
        } catch (err: any) {
            setError('申請の提出に失敗しました。');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        if (!approvalRouteId) return setError('承認ルートを選択してください。');
        if (!currentUser) return setError('ユーザー情報が見つかりません。');
        if (details.length === 0 || details.every(d => !d.departure && !d.arrival)) {
            return setError('少なくとも1つの明細を入力してください。');
        }

        requestConfirmation({
            label: '申請を送信する',
            title: 'フォーム送信時に送信しますか？',
            description: 'はいを押すと交通費申請が承認ルートに送信されます。入力内容をもう一度ご確認ください。',
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
    if (!currentUser) {
        setError('ユーザー情報が見つかりません。');
        return;
    }

    const payload = buildSubmissionPayload();

    console.log('[TransportExpenseForm] currentUser.id:', currentUser.id);
    console.log('[TransportExpenseForm] payload:', payload);

    setIsSavingDraft(true);
    setError('');

    try {
        await saveApplicationDraft(payload, currentUser.id);
        setError('');
    } catch (err: any) {
        console.error('[TransportExpenseForm] save draft failed:', err);
        setError(
            err?.message
                ? `下書きの保存に失敗しました: ${err.message}`
                : '下書きの保存に失敗しました。'
        );
    } finally {
        setIsSavingDraft(false);
    }
};

    const clearForm = () => {
        setDetails([createEmptyDetail()]);
        setNotes('');
        setError('');
    };

    useEffect(() => {
        if (!draftApplication || draftApplication.applicationCodeId !== applicationCodeId) return;
        const rawDetails = Array.isArray(draftApplication.formData?.details) ? draftApplication.formData.details : [];
        const restoredDetails = rawDetails.map((detail: any, index: number) => ({
            id: detail.id || `draft_${index}_${Date.now()}`,
            travelDate: detail.travelDate || new Date().toISOString().split('T')[0],
            departure: detail.departure || '',
            arrival: detail.arrival || '',
            transportMode: detail.transportMode || TRANSPORT_MODES[0],
            amount: Number(detail.amount) || 0,
        }));
        setDetails(restoredDetails.length ? restoredDetails : [createEmptyDetail()]);
        setNotes(draftApplication.formData?.notes || '');
        setApprovalRouteId(draftApplication.approvalRouteId || '');
        setError('');
    }, [draftApplication, applicationCodeId]);

    const inputClass = "w-full text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

    return (
        <div className="relative">
            {(isLoading || formLoadError) && (
                <div className="absolute inset-0 bg-white/50 dark:bg-slate-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl p-8">
                    {isLoading && <Loader className="w-12 h-12 animate-spin text-blue-500" />}
                </div>
            )}
            <form onSubmit={handleSubmit} className="p-8 rounded-2xl shadow-sm space-y-8 animate-fade-in-up">

                {formLoadError && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                        <p className="font-bold">フォーム読み込みエラー</p>
                        <p>{formLoadError}</p>
                    </div>
                )}

                <details className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700" open>
                    <summary className="text-base font-semibold cursor-pointer text-slate-700 dark:text-slate-200">明細書 (AI-OCR)</summary>
                    <div className="mt-4 flex items-center gap-4">
                        <label htmlFor="ocr-file-upload" className={`relative inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer ${isOcrLoading || isAIOff || isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isOcrLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                            <span>{isOcrLoading ? '解析中...' : 'ファイルから読み取り'}</span>
                            <input id="ocr-file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*,application/pdf" disabled={isOcrLoading || isAIOff || isDisabled} />
                        </label>
                        {isAIOff && <p className="text-sm text-red-500 dark:text-red-400">AI機能無効のため、OCR機能は利用できません。</p>}
                        {!isAIOff && <p className="text-sm text-slate-500 dark:text-slate-400">交通費の領収書を選択すると、下の表に自動で追加されます。</p>}
                    </div>
                </details>

                <details className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                    <summary className="text-base font-semibold cursor-pointer text-slate-700 dark:text-slate-200">一括入力 (コピペ & Excel)</summary>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Excel/CSVファイルアップロード</label>
                            <div className="flex items-center gap-4">
                                <label htmlFor="excel-upload" className="relative inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer">
                                    <Upload className="w-5 h-5" />
                                    <span>Excel/CSVファイル選択</span>
                                    <input id="excel-upload" type="file" className="sr-only" onChange={handleExcelUpload} accept=".csv,.xlsx,.xls" disabled={isDisabled} />
                                </label>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Excel/CSVファイルから交通費データを一括読み込み（Shift-JIS/UTF-8自動判定、.xlsx/.xls/.csv対応）</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">クリップボードから貼り付け</label>
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.readText().then(text => {
                                            const syntheticEvent = {
                                                preventDefault: () => { },
                                                clipboardData: {
                                                    getData: () => text
                                                }
                                            } as any;
                                            handlePaste(syntheticEvent);
                                        }).catch(() => {
                                            setError('クリップボードへのアクセスが許可されていません。手動で貼り付けてください。');
                                        });
                                    }}
                                    className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                                    disabled={isDisabled}
                                >
                                    📋 クリップボードから貼り付け
                                </button>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Excelからコピーしたデータを貼り付け（タブ区切り対応）<br />
                                    書式: 利用日\t出発地\t目的地\t交通手段\t金額
                                </p>
                            </div>
                        </div>
                    </div>
                </details>

                <div>
                    <label className="block text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">交通費明細 *</label>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg" onPaste={handlePaste}>
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-700/50">
                                <tr>
                                    {['利用日', '出発地', '目的地', '交通手段', '金額(円)', '操作'].map(h => (
    <th
        key={h}
        className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
    >
        {h}
    </th>
))}

                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {details.map((item) => (
                                    <tr key={item.id}>
                                        <td className="p-1"><input type="date" value={item.travelDate} onChange={e => handleDetailChange(item.id, 'travelDate', e.target.value)} className={inputClass} disabled={isDisabled} /></td>
                                        <td className="p-1 min-w-[150px]"><input type="text" placeholder="例: 東京駅" value={item.departure} onChange={e => handleDetailChange(item.id, 'departure', e.target.value)} className={inputClass} disabled={isDisabled} /></td>
                                        <td className="p-1 min-w-[150px]"><input type="text" placeholder="例: 幕張メッセ" value={item.arrival} onChange={e => handleDetailChange(item.id, 'arrival', e.target.value)} className={inputClass} disabled={isDisabled} /></td>
                                        <td className="p-1 min-w-[100px]">
                                            <select value={item.transportMode} onChange={e => handleDetailChange(item.id, 'transportMode', e.target.value)} className={inputClass} disabled={isDisabled}>
                                                {TRANSPORT_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-1 min-w-[100px]"><input type="number" value={item.amount} onChange={e => handleDetailChange(item.id, 'amount', Number(e.target.value))} className={`${inputClass} text-right`} disabled={isDisabled} /></td>
                                        <td className="p-1 min-w-[90px]">
    <div className="flex items-center justify-center gap-1">
        <button
            type="button"
            onClick={() => handleDuplicateRow(item.id)}
            className="px-2 py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 rounded"
            disabled={isDisabled}
            title="この行を複製"
        >
            複製
        </button>

        <button
            type="button"
            onClick={() => handleRemoveRow(item.id)}
            className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 rounded"
            disabled={isDisabled}
            title="この行を削除"
        >
            削除
        </button>
    </div>
</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <button type="button" onClick={addNewRow} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700" disabled={isDisabled}>
                            <PlusCircle className="w-4 h-4" /> 行を追加
                        </button>
                        <div className="text-right">
                            <span className="text-sm text-slate-500 dark:text-slate-400">合計金額: </span>
                            <span className="text-xl font-bold text-slate-800 dark:text-white">¥{totalAmount.toLocaleString()}</span>
                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                ※各行は実費（差分）を入力してください
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <label htmlFor="notes" className="block text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">備考</label>
                    <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputClass} placeholder="補足事項があれば入力してください。" disabled={isDisabled} />
                </div>

                <ApprovalRouteSelector onChange={setApprovalRouteId} isSubmitting={isDisabled} />

                {error && <p className="text-red-500 text-sm bg-red-100 dark:bg-red-900/50 p-3 rounded-lg">{error}</p>}

                <div className="flex justify-end gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <button type="button" onClick={clearForm} className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600" disabled={isDisabled}>内容をクリア</button>
                    <button
                        type="button"
                        onClick={handleSaveDraft}
                        className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
                        disabled={isDisabled}
                    >
                        下書き保存
                    </button>
                    <button type="submit" className="w-40 flex justify-center items-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-400" disabled={isDisabled}>
                        {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : '申請を送信する'}
                    </button>
                </div>
            </form>
            {ConfirmationDialog}
        </div>
    );
};

export default TransportExpenseForm;
