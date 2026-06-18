import React, { useState, useEffect, useMemo } from 'react';
import { submitApplication, saveApplicationDraft, clearApplicationDraft, uploadFile } from '../../services/dataService';
import { extractInvoiceDetails } from '../../services/geminiService';
import ApprovalRouteSelector from './ApprovalRouteSelector';
import { Loader, Sparkles, AlertTriangle, Upload, X, FileText, CheckCircle } from '../Icons';
import { User, ApplicationWithDetails } from '../../types';
import ChatApplicationModal from '../ChatApplicationModal';
import { useSubmitWithConfirmation } from '../../hooks/useSubmitWithConfirmation';
import { attachResubmissionMeta, buildResubmissionMeta } from '../../utils/applicationResubmission';

interface ApprovalAttachment {
    id: string;
    name: string;
    type: string;
    url: string;
    path: string;
    ocrSummary?: string;
    isProcessing?: boolean;
}

interface ApprovalFormProps {
    onSuccess: () => void;
    applicationCodeId: string;
    currentUser: User | null;
    isAIOff: boolean;
    isLoading: boolean;
    error: string;
    draftApplication?: ApplicationWithDetails | null;
}

const ApprovalForm: React.FC<ApprovalFormProps> = ({ onSuccess, applicationCodeId, currentUser, isAIOff, isLoading, error: formLoadError, draftApplication }) => {
    const [formData, setFormData] = useState({ title: '', details: '', amount: '', paymentDate: '' });
    const [approvalRouteId, setApprovalRouteId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [error, setError] = useState('');
    const [attachments, setAttachments] = useState<ApprovalAttachment[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const { requestConfirmation, ConfirmationDialog } = useSubmitWithConfirmation();
    const [isChatModalOpen, setIsChatModalOpen] = useState(false);
    const resubmissionMeta = useMemo(() => buildResubmissionMeta(draftApplication), [draftApplication]);
    
    const isDisabled = isSubmitting || isSavingDraft || isLoading || !!formLoadError;

    useEffect(() => {
        if (!draftApplication || draftApplication.applicationCodeId !== applicationCodeId) return;
        const data = draftApplication.formData || {};
        setFormData({
            title: data.title || '',
            details: data.details || '',
            amount: data.amount || '',
            paymentDate: data.paymentDate || '',
        });
        setApprovalRouteId(draftApplication.approvalRouteId || '');
        // Load attachments from draft
        if (data.attachments) {
            setAttachments(data.attachments);
        }
    }, [draftApplication, applicationCodeId]);

    const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result.split(',')[1]);
                } else {
                    reject(new Error("ファイル読み取りに失敗しました。"));
                }
            };
            reader.onerror = (error) => reject(error);
            // Only read as data URL for image files and PDFs
            const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
            if (imageTypes.includes(file.type)) {
                reader.readAsDataURL(file);
            } else {
                // For non-image files, return empty string since we can't process them with OCR anyway
                resolve('');
            }
        });
    };

    const processFileWithOCR = async (file: File): Promise<string | undefined> => {
        if (isAIOff) return undefined;
        
        // Only process image files and PDFs with OCR
        const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (!imageTypes.includes(file.type)) {
            return `ファイル名: ${file.name}
ファイルタイプ: ${file.type}
サイズ: ${(file.size / 1024 / 1024).toFixed(2)} MB
備考: このファイル形式はOCR処理に対応していません`;
        }
        
        try {
            const base64String = await readFileAsBase64(file);
            // Only process OCR for image files and PDFs
            const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
            if (imageTypes.includes(file.type) && base64String) {
                const ocrData = await extractInvoiceDetails(base64String, file.type);
                
                // Create a summary from OCR data
                const summary = `
ファイル名: ${file.name}
発行元: ${ocrData.vendorName || '不明'}
発行日: ${ocrData.invoiceDate || '不明'}
合計金額: ${ocrData.totalAmount ? `¥${ocrData.totalAmount.toLocaleString()}` : '不明'}
内容: ${ocrData.description || '不明'}
費用種類: ${ocrData.costType === 'V' ? '変動費' : ocrData.costType === 'F' ? '固定費' : '不明'}
                `.trim();
                
                return summary;
            } else {
                // Return basic file info for non-image files
                return `ファイル名: ${file.name}
ファイルタイプ: ${file.type}
サイズ: ${(file.size / 1024 / 1024).toFixed(2)} MB
備考: このファイル形式はOCR処理に対応していません`;
            }
        } catch (error) {
            console.error('OCR処理エラー:', error);
            return `ファイル名: ${file.name}
ファイルタイプ: ${file.type}
備考: OCR処理に失敗しました`;
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        try {
            for (const file of Array.from(files)) {
                // Upload file first
                const { path, publicUrl } = await uploadFile(file as File, 'approval-attachments');
                
                // Process with OCR if not disabled
                const ocrSummary = await processFileWithOCR(file as File);
                
                const newAttachment: ApprovalAttachment = {
                    id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                    name: (file as File).name,
                    type: (file as File).type,
                    url: publicUrl || '',
                    path: path,
                    ocrSummary: ocrSummary,
                    isProcessing: false,
                };
                
                setAttachments(prev => [...prev, newAttachment]);
            }
        } catch (error: any) {
            setError(`ファイルアップロードに失敗しました: ${error.message}`);
        } finally {
            setIsUploading(false);
            e.target.value = ''; // Clear file input
        }
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(att => att.id !== id));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            // Allow numbers, decimals, and negative signs
            const numericValue = value.replace(/[^0-9.-]/g, '');
            setFormData(prev => ({ ...prev, [name]: numericValue }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const buildSubmissionPayload = () => ({
        applicationCodeId,
        formData: attachResubmissionMeta({ ...formData, attachments }, resubmissionMeta),
        approvalRouteId,
    });

    const executeSubmission = async () => {
    if (!currentUser) {
        setError('ユーザー情報が見つかりません。再度ログインしてください。');
        return;
    }

    const payload = buildSubmissionPayload();

    console.log('[ApprovalForm] submit payload:', payload);
    console.log('[ApprovalForm] currentUser.id:', currentUser.id);

    setIsSubmitting(true);
    setError('');

    try {
        await submitApplication(payload, currentUser.id);
        console.log('[ApprovalForm] submitApplication success');

        try {
            await clearApplicationDraft(applicationCodeId, currentUser.id);
            console.log('[ApprovalForm] clearApplicationDraft success');
        } catch (draftErr: any) {
            console.warn('[ApprovalForm] clearApplicationDraft failed:', {
                message: draftErr?.message,
                details: draftErr?.details,
                hint: draftErr?.hint,
                code: draftErr?.code,
                raw: draftErr,
            });
        }

        onSuccess();
    } catch (err: any) {
        console.error('[ApprovalForm] submitApplication failed:', {
            message: err?.message,
            details: err?.details,
            hint: err?.hint,
            code: err?.code,
            raw: err,
        });

        setError(
            err?.message
                ? `申請の提出に失敗しました: ${err.message}`
                : '申請の提出に失敗しました。'
        );
    } finally {
        setIsSubmitting(false);
    }
};

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        if (!approvalRouteId) {
            setError('承認ルートは必須です。');
            return;
        }
        if (!currentUser) {
            setError('ユーザー情報が見つかりません。再度ログインしてください。');
            return;
        }

        requestConfirmation({
            label: '申請を送信する',
            title: 'フォーム送信時に送信しますか？',
            description: 'はいを押すと稟議が承認ルートへ送信されます。入力内容をご確認ください。',
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

        setIsSavingDraft(true);
        setError('');
        try {
            await saveApplicationDraft(buildSubmissionPayload(), currentUser.id);
        } catch (err: any) {
            setError('下書きの保存に失敗しました。');
        } finally {
            setIsSavingDraft(false);
        }
    };
    
    const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";
    const inputClass = "w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

    return (
        <>
            <div className="relative">
                {(isLoading || formLoadError) && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-slate-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl p-8">
                        {isLoading && <Loader className="w-12 h-12 animate-spin text-blue-500" />}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex-1" />
                        <button 
                            type="button" 
                            onClick={() => setIsChatModalOpen(true)} 
                            className="flex items-center gap-2 bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isAIOff || isSubmitting}
                        >
                            <Sparkles className="w-5 h-5" />
                            <span>AIチャットで申請</span>
                        </button>
                    </div>
                    {isAIOff && <p className="text-sm text-red-500 dark:text-red-400">AI機能無効のため、AIチャットは利用できません。</p>}
                    
                    {formLoadError && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                            <p className="font-bold">フォーム読み込みエラー</p>
                            <p>{formLoadError}</p>
                        </div>
                    )}

                    <div>
                        <label htmlFor="title" className={labelClass}>件名 *</label>
                        <input type="text" id="title" name="title" value={formData.title} onChange={handleChange} className={inputClass} required disabled={isDisabled} placeholder="例: 新規取引先との契約締結について" autoComplete="on" />
                    </div>

                    <div>
                        <label htmlFor="details" className={labelClass}>目的・概要 *</label>
                        <textarea id="details" name="details" rows={6} value={formData.details} onChange={handleChange} className={inputClass} required disabled={isDisabled} placeholder="申請する決裁の目的、背景、具体的な内容などを記述してください。" autoComplete="on" />
                    </div>

                    <div>
                        <label htmlFor="amount" className={labelClass}>金額（円）</label>
                        <input 
                            type="text" 
                            id="amount" 
                            name="amount" 
                            value={formData.amount} 
                            onChange={handleChange} 
                            className={inputClass} 
                            disabled={isDisabled} 
                            placeholder="0円でも申請可能です（例: 100000）" 
                            autoComplete="on" 
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">0円での申請も可能です</p>
                    </div>

                    <div>
                        <label htmlFor="paymentDate" className={labelClass}>支払日</label>
                        <input 
                            type="date" 
                            id="paymentDate" 
                            name="paymentDate" 
                            value={formData.paymentDate} 
                            onChange={handleChange} 
                            className={inputClass} 
                            disabled={isDisabled} 
                            autoComplete="on" 
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">支払が決まっている場合に指定してください</p>
                    </div>

                    <div>
                        <label className={labelClass}>添付ファイル</label>
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <label htmlFor="file-upload" className={`relative inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-2.5 px-5 rounded-lg shadow-md hover:bg-blue-700 transition-colors ${isUploading || isDisabled ? 'bg-slate-400 cursor-not-allowed' : ''}`}>
                                    <Upload className="w-5 h-5" />
                                    <span>ファイルを追加</span>
                                    <input 
                                        id="file-upload" 
                                        name="file-upload" 
                                        type="file" 
                                        className="sr-only" 
                                        onChange={handleFileChange} 
                                        accept="*"
                                        multiple 
                                        disabled={isUploading || isDisabled} 
                                    />
                                </label>
                                {isUploading && <Loader className="w-5 h-5 animate-spin text-blue-500" />}
                                {isAIOff && <p className="text-sm text-red-500 dark:text-red-400">AI機能無効のため、OCR機能は利用できません。</p>}
                            </div>
                            
                            {attachments.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">添付されたファイル</h4>
                                    {attachments.map((attachment) => (
                                        <div key={attachment.id} className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <FileText className="w-4 h-4 text-slate-500" />
                                                        <span className="font-medium text-slate-800 dark:text-slate-200">{attachment.name}</span>
                                                    </div>
                                                    
                                                    {attachment.ocrSummary && (
                                                        <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600">
                                                            <h5 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                                                                <CheckCircle className="w-3 h-3 text-green-500" />
                                                                AIによる要約
                                                            </h5>
                                                            <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                                                                {attachment.ocrSummary}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="mt-2">
                                                        <a 
                                                            href={attachment.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                        >
                                                            ファイルをプレビュー
                                                        </a>
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachment(attachment.id)}
                                                    className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                                    disabled={isDisabled}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <ApprovalRouteSelector onChange={setApprovalRouteId} isSubmitting={isDisabled} requiredRouteName="社長決裁ルート" />

                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    
                    <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={handleSaveDraft}
                            className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
                            disabled={isDisabled}
                        >
                            下書き保存
                        </button>
                        <button type="submit" className="w-40 flex justify-center items-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-400" disabled={isDisabled}>
                            {isSubmitting ? <Loader className="w-5 h-5 animate-spin"/> : '申請を送信する'}
                        </button>
                    </div>
                </form>
                {ConfirmationDialog}
            </div>
            {isChatModalOpen && (
                <ChatApplicationModal
                    isOpen={isChatModalOpen}
                    onClose={() => setIsChatModalOpen(false)}
                    onSuccess={() => {
                        setIsChatModalOpen(false);
                        onSuccess();
                    }}
                    currentUser={currentUser}
                    initialMessage="稟議を申請したいです。"
                    isAIOff={isAIOff}
                />
            )}
        </>
    );
};

export default ApprovalForm;
