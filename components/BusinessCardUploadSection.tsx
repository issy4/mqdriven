import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusinessCardContact, CustomerContact, EmployeeUser, Toast } from '../types';
import { extractBusinessCardDetails } from '../services/geminiService';
import { googleDriveService, GoogleDriveFile } from '../services/googleDriveService';
import { Upload, Loader, CheckCircle, AlertTriangle, Trash2, FileText, RefreshCw, X } from './Icons';
import { buildActionActorInfo, logActionEvent } from '../services/actionConsoleService';

interface BusinessCardUploadSectionProps {
  addToast: (message: string, type: Toast['type']) => void;
  isAIOff: boolean;
  currentUser?: EmployeeUser | null;
  allUsers?: EmployeeUser[];
  onAutoCreateCustomerContact: (data: Partial<CustomerContact>) => Promise<CustomerContact>;
}

type OcrStatus = 'processing' | 'ready' | 'error';
type InsertStatus = 'idle' | 'saving' | 'success' | 'error';

type CardDraft = {
  id: string;
  file: File;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  ocrStatus: OcrStatus;
  insertStatus: InsertStatus;
  contact: BusinessCardContact;
  contactPayload?: Partial<CustomerContact>;
  createdContact?: CustomerContact | null;
  ocrError?: string;
  insertError?: string;
  needsManualConfirmation?: boolean;
};

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as base64.'));
      }
    };

    reader.onerror = () => reject(reader.error || new Error('Failed to read file as base64.'));
    reader.readAsDataURL(file);
  });

const normalizeContact = (contact: BusinessCardContact | null | undefined): BusinessCardContact => {
  const normalized: BusinessCardContact = {};

  if (!contact) return normalized;

  Object.entries(contact).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed) {
        (normalized as any)[key] = trimmed;
      }
    } else if (value) {
      (normalized as any)[key] = value;
    }
  });

  return normalized;
};

const looksLikeFileName = (value?: string | null): boolean => {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  return /\.(pdf|png|jpe?g|gif|tif|tiff|bmp|webp)$/i.test(trimmed);
};

const sanitizeCustomerName = (value?: string | null): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  if (!trimmed) return undefined;
  if (/^(null|undefined|n\/a|-)$/.test(trimmed.toLowerCase())) return undefined;
  if (looksLikeFileName(trimmed)) return undefined;

  return trimmed;
};

const sanitizeTextValue = (value?: string | null): string | undefined => {
  if (!value) return undefined;

  const trimmed = value.trim();

  if (!trimmed) return undefined;
  if (/^(null|undefined|n\/a|-)$/.test(trimmed.toLowerCase())) return undefined;

  return trimmed;
};

const buildContactNote = (contact: BusinessCardContact): string | undefined => {
  const lines = [
    contact.department ? `Dept: ${contact.department}` : null,
    contact.personNameKana ? `Kana: ${contact.personNameKana}` : null,
    contact.phoneNumber ? `Phone: ${contact.phoneNumber}` : null,
    contact.mobileNumber ? `Mobile: ${contact.mobileNumber}` : null,
    contact.email ? `Email: ${contact.email}` : null,
  ].filter(Boolean);

  if (!lines.length) return undefined;

  return `-- Contact --\n${lines.join('\n')}`;
};

const contactToCustomerContact = (contact: BusinessCardContact): Partial<CustomerContact> => {
  const companyName =
    sanitizeCustomerName(contact.companyName) ||
    sanitizeCustomerName(contact.personName);

  return {
    companyName: companyName || '',
    companyNameKana: sanitizeTextValue(contact.companyNameKana),

    personName: sanitizeTextValue(contact.personName),
    personNameKana: sanitizeTextValue(contact.personNameKana),
    personTitle: sanitizeTextValue(contact.title),
    department: sanitizeTextValue(contact.department),

    email: sanitizeTextValue(contact.email),
    phoneNumber: sanitizeTextValue(contact.phoneNumber),
    mobileNumber: sanitizeTextValue(contact.mobileNumber),
    faxNumber: sanitizeTextValue(contact.faxNumber),

    postalCode: sanitizeTextValue(contact.postalCode),
    address1: sanitizeTextValue(contact.address),
    websiteUrl: sanitizeTextValue(contact.websiteUrl),

    receivedByEmployeeCode: sanitizeTextValue(contact.recipientEmployeeCode),
    memo: [buildContactNote(contact), contact.notes].filter(Boolean).join('\n\n') || undefined,

    source: 'business_card_ocr',
    allowEmailMarketing: true,
    emailMarketingStatus: '未確認',
  };
};

const hasContactCompanyName = (payload?: Partial<CustomerContact>) => {
  const name = sanitizeCustomerName(payload?.companyName);
  return Boolean(name && name !== '会社名未設定');
};

const guessDriveMimeType = (fileName: string, fallback = 'image/jpeg'): string => {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';

  return fallback;
};

const describeRepresentative = (name?: string | null, title?: string | null | undefined) => {
  const safeName = name?.trim() || 'Unknown';
  const safeTitle = title?.trim();

  return safeTitle ? `${safeName} (${safeTitle})` : safeName;
};

const fieldInputClass =
  'w-full rounded-md border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white shadow-sm';

const fieldLabelClass = 'text-xs font-semibold text-slate-500 dark:text-slate-300';

const OCR_STATUS_STYLES: Record<OcrStatus, { label: string; className: string }> = {
  processing: { label: 'OCR処理中', className: 'bg-blue-100 text-blue-700' },
  ready: { label: 'OCR完了', className: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'OCRエラー', className: 'bg-red-100 text-red-700' },
};

const INSERT_STATUS_STYLES: Record<InsertStatus, { label: string; className: string }> = {
  idle: { label: '未登録', className: 'bg-slate-100 text-slate-600' },
  saving: { label: '登録中', className: 'bg-blue-100 text-blue-700' },
  success: { label: '登録済み', className: 'bg-green-100 text-green-700' },
  error: { label: '登録エラー', className: 'bg-red-100 text-red-700' },
};

const BusinessCardUploadSection: React.FC<BusinessCardUploadSectionProps> = ({
  addToast,
  isAIOff,
  currentUser,
  allUsers = [],
  onAutoCreateCustomerContact,
}) => {
  const [drafts, setDrafts] = useState<CardDraft[]>([]);
  const [eventName, setEventName] = useState('');
  const [recipientCode, setRecipientCode] = useState('');
  const actorInfo = useMemo(() => buildActionActorInfo(currentUser ?? null), [currentUser]);

  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<string[]>([]);
  const [driveImportReport, setDriveImportReport] = useState({
    success: 0,
    failure: 0,
    errors: [] as string[],
  });
  const [driveError, setDriveError] = useState('');
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [isDriveImporting, setIsDriveImporting] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const draftsRef = useRef<CardDraft[]>(drafts);
  const mounted = useRef(true);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    mounted.current = true;

    if (currentUser?.id) {
      setRecipientCode(prev => prev || currentUser.id);
    }

    return () => {
      mounted.current = false;
      draftsRef.current.forEach(draft => URL.revokeObjectURL(draft.fileUrl));
    };
  }, [currentUser?.id]);

  const recipientOptions = useMemo(() => {
    const sorted = [...allUsers].sort((a, b) => {
      const na = a.name?.toLowerCase() || '';
      const nb = b.name?.toLowerCase() || '';

      return na.localeCompare(nb);
    });

    return sorted.map(user => ({
      value: user.id,
      label: user.name || user.email || user.id,
      department: user.department || '',
    }));
  }, [allUsers]);

  const formatRecipientLabel = (code?: string | null) => {
    if (!code) return '-';

    const match = recipientOptions.find(opt => opt.value === code);

    if (match) {
      return match.department ? `${match.label} / ${match.department}` : match.label;
    }

    return code;
  };

  const generateId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleRemoveDraft = useCallback((draftId: string) => {
    setDrafts(prev => {
      const target = prev.find(d => d.id === draftId);

      if (target) {
        URL.revokeObjectURL(target.fileUrl);
      }

      return prev.filter(d => d.id !== draftId);
    });
  }, []);

  const autoCreateCustomerContact = useCallback(
    async (draftId: string, contactPayload: Partial<CustomerContact>) => {
      if (!hasContactCompanyName(contactPayload)) {
        const message = '会社名または氏名を入力してから登録してください。';

        setDrafts(prev =>
          prev.map(draft =>
            draft.id === draftId
              ? { ...draft, insertStatus: 'error', insertError: message }
              : draft
          )
        );

        addToast(message, 'error');
        return;
      }

      setDrafts(prev =>
        prev.map(draft =>
          draft.id === draftId
            ? { ...draft, insertStatus: 'saving', insertError: undefined }
            : draft
        )
      );

      try {
        const created = await onAutoCreateCustomerContact(contactPayload);

        setDrafts(prev =>
          prev.map(draft =>
            draft.id === draftId
              ? {
                  ...draft,
                  insertStatus: 'success',
                  createdContact: created,
                  contactPayload: { ...contactPayload, id: created.id },
                }
              : draft
          )
        );

        addToast(
          `連絡先「${created.companyName || contactPayload.companyName || '名刺'}」を登録しました。`,
          'success'
        );

        logActionEvent({
          module: 'BusinessCard OCR',
          severity: 'info',
          status: 'success',
          summary: `BusinessCard OCR: ${
            created.companyName || contactPayload.companyName || 'Unknown'
          } contact registered`,
          detail: `Contact: ${describeRepresentative(
            created.personName ?? contactPayload.personName,
            created.personTitle ?? contactPayload.personTitle
          )}`,
          ...actorInfo,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '連絡先の登録に失敗しました。';

        setDrafts(prev =>
          prev.map(draft =>
            draft.id === draftId
              ? { ...draft, insertStatus: 'error', insertError: message }
              : draft
          )
        );

        addToast(message, 'error');

        logActionEvent({
          module: 'BusinessCard OCR',
          severity: 'critical',
          status: 'failure',
          summary: `BusinessCard OCR: ${
            contactPayload.companyName || 'Unknown'
          } contact registration failed`,
          detail: message,
          ...actorInfo,
        });
      }
    },
    [onAutoCreateCustomerContact, addToast, actorInfo]
  );

  const runOcr = useCallback(
    async (draftId: string, file: File) => {
      setDrafts(prev =>
        prev.map(draft =>
          draft.id === draftId
            ? { ...draft, ocrStatus: 'processing', ocrError: undefined }
            : draft
        )
      );

      try {
        const base64 = await readFileAsBase64(file);
        const parsed = await extractBusinessCardDetails(
          base64,
          file.type || 'application/octet-stream'
        );

        const contact = normalizeContact(parsed);

        const needsConfirmation =
          !sanitizeCustomerName(contact.companyName) && !sanitizeCustomerName(contact.personName);

        const contactPayload = contactToCustomerContact(contact);

        const contactPayloadWithMeta: Partial<CustomerContact> = {
          ...contactPayload,
          businessEvent: eventName || undefined,
          receivedByEmployeeCode: recipientCode || undefined,
        };

        setDrafts(prev =>
          prev.map(draft =>
            draft.id === draftId
              ? {
                  ...draft,
                  ocrStatus: 'ready',
                  contact,
                  contactPayload: contactPayloadWithMeta,
                  ocrError: undefined,
                  needsManualConfirmation: needsConfirmation,
                }
              : draft
          )
        );

        logActionEvent({
          module: 'BusinessCard OCR',
          severity: 'info',
          status: 'success',
          summary: `BusinessCard OCR: ${file.name} processed`,
          detail: `Company: ${contact.companyName || 'Unknown'} / Contact: ${describeRepresentative(
            contact.personName,
            contact.title
          )}`,
          ...actorInfo,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Business card OCR failed.';

        setDrafts(prev =>
          prev.map(draft =>
            draft.id === draftId
              ? { ...draft, ocrStatus: 'error', ocrError: message }
              : draft
          )
        );

        logActionEvent({
          module: 'BusinessCard OCR',
          severity: 'critical',
          status: 'failure',
          summary: `BusinessCard OCR: ${file.name} failed`,
          detail: message,
          ...actorInfo,
        });
      }
    },
    [actorInfo, eventName, recipientCode]
  );

  const queueBusinessCardFile = useCallback(
    (file: File) => {
      const id = generateId();
      const previewUrl = URL.createObjectURL(file);

      const draft: CardDraft = {
        id,
        file,
        fileName: file.name,
        fileUrl: previewUrl,
        mimeType: file.type || 'application/octet-stream',
        ocrStatus: 'processing',
        insertStatus: 'idle',
        contact: {},
      };

      setDrafts(prev => [...prev, draft]);
      runOcr(id, file);
    },
    [runOcr]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      if (isAIOff) {
        addToast('AIがOFFのため、名刺OCRは利用できません。', 'error');

        logActionEvent({
          module: 'Business Card OCR',
          severity: 'warning',
          status: 'failure',
          summary: 'Business card OCR skipped because AI is off.',
          detail: 'AI is off, so business card OCR could not run.',
          ...actorInfo,
        });

        return;
      }

      Array.from(files).forEach(queueBusinessCardFile);

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [isAIOff, addToast, queueBusinessCardFile, actorInfo]
  );

  const handleDriveModalOpen = async () => {
    if (isAIOff) {
      addToast('AIがOFFのため、Google DriveからのOCR取込は利用できません。', 'info');
      return;
    }

    setShowDriveModal(true);
    setDriveError('');
    setIsDriveLoading(true);

    try {
      const { files } = await googleDriveService.searchFiles('business card');

      setDriveFiles(files || []);
      setSelectedDriveFiles([]);
    } catch (err) {
      console.error('Failed to load business card files from Drive', err);
      setDriveError('Google Driveのファイル取得に失敗しました。もう一度お試しください。');
    } finally {
      setIsDriveLoading(false);
    }
  };

  const closeDriveModal = () => {
    setShowDriveModal(false);
    setDriveError('');
    setSelectedDriveFiles([]);
  };

  const toggleDriveFileSelection = (fileId: string) => {
    setSelectedDriveFiles(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const importDriveFiles = async () => {
    if (selectedDriveFiles.length === 0) {
      setDriveError('取り込むファイルを1つ以上選択してください。');
      return;
    }

    setIsDriveImporting(true);
    setDriveImportReport({ success: 0, failure: 0, errors: [] });

    let successCount = 0;
    const failureMessages: string[] = [];

    for (const fileId of selectedDriveFiles) {
      const fileMeta = driveFiles.find(file => file.id === fileId);

      try {
        const { data, fileName } = await googleDriveService.downloadFile(fileId);
        const mimeType = fileMeta?.mimeType || guessDriveMimeType(fileName);
        const file = new File([data], fileName, { type: mimeType });

        queueBusinessCardFile(file);
        successCount += 1;
      } catch (err: any) {
        const message =
          err instanceof Error ? err.message : 'Google Driveからのファイル取得に失敗しました。';

        failureMessages.push(`${fileMeta?.name || fileId}: ${message}`);
        console.error('Drive file import failed', fileMeta?.name, err);
      }
    }

    setDriveImportReport({
      success: successCount,
      failure: failureMessages.length,
      errors: failureMessages,
    });

    if (successCount > 0) {
      const message =
        failureMessages.length > 0
          ? `${successCount}件を取り込みました。${failureMessages.length}件は失敗しました。`
          : `${successCount}件をGoogle Driveから取り込みました。`;

      addToast(message, failureMessages.length > 0 ? 'warning' : 'success');

      if (failureMessages.length === 0) {
        closeDriveModal();
      }
    } else {
      setDriveError('Google Driveから取り込めたファイルはありませんでした。');
      addToast('Google Driveから取り込めたファイルはありませんでした。', 'error');
    }

    setIsDriveImporting(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const handleRetryInsert = (draft: CardDraft) => {
    if (draft.contactPayload) {
      void autoCreateCustomerContact(draft.id, draft.contactPayload);
    }
  };

  const updateDraftPayloadField = (
    draftId: string,
    field: keyof CustomerContact,
    value: string
  ) => {
    setDrafts(prev =>
      prev.map(draft => {
        if (draft.id !== draftId) return draft;

        const updatedContactPayload: Partial<CustomerContact> = {
          ...(draft.contactPayload ?? {}),
          [field]: value,
        };

        const needsManual = !hasContactCompanyName(updatedContactPayload);

        return {
          ...draft,
          contactPayload: updatedContactPayload,
          needsManualConfirmation: needsManual,
        };
      })
    );
  };

  const confirmDraft = async (draft: CardDraft) => {
    if (!draft.contactPayload || !hasContactCompanyName(draft.contactPayload)) return;

    await autoCreateCustomerContact(draft.id, draft.contactPayload);
  };

  const [isBulkConfirming, setBulkConfirming] = useState(false);

  const confirmReadyDrafts = async () => {
    const readyDrafts = drafts.filter(
      draft =>
        draft.ocrStatus === 'ready' &&
        draft.insertStatus !== 'success' &&
        draft.contactPayload &&
        hasContactCompanyName(draft.contactPayload)
    );

    if (!readyDrafts.length) return;

    setBulkConfirming(true);

    try {
      for (const draft of readyDrafts) {
        await confirmDraft(draft);
      }
    } finally {
      setBulkConfirming(false);
    }
  };

  const draftStats = useMemo(() => {
    const stats = {
      total: drafts.length,
      processing: 0,
      ready: 0,
      unconfirmed: 0,
      success: 0,
      error: 0,
    };

    drafts.forEach(draft => {
      if (draft.ocrStatus === 'processing') stats.processing += 1;
      if (draft.ocrStatus === 'ready' && hasContactCompanyName(draft.contactPayload)) {
        stats.ready += 1;
      }
      if (draft.ocrStatus === 'ready' && !hasContactCompanyName(draft.contactPayload)) {
        stats.unconfirmed += 1;
      }
      if (draft.insertStatus === 'success') stats.success += 1;
      if (draft.insertStatus === 'error' || draft.ocrStatus === 'error') stats.error += 1;
    });

    return stats;
  }, [drafts]);

  return (
    <>
      <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5 flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                名刺の取り込み
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                ローカルファイルのアップロードやGoogle Driveからのインポートを行い、
                OCR処理後に customer_contacts へ連絡先として登録します。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isAIOff}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                ファイルを選択
              </button>

              <button
                type="button"
                onClick={handleDriveModalOpen}
                disabled={isDriveLoading || isDriveImporting || isAIOff}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                Google Drive
              </button>
            </div>
          </div>

          {draftStats.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <p>
                Drafts {draftStats.total} / OCR {draftStats.processing} / Ready{' '}
                {draftStats.ready} / Unconfirmed {draftStats.unconfirmed} / Success{' '}
                {draftStats.success} / Error {draftStats.error}
              </p>

              <button
                type="button"
                onClick={confirmReadyDrafts}
                disabled={draftStats.ready === 0 || isBulkConfirming}
                className={`px-3 py-1.5 rounded-md text-white font-semibold ${
                  draftStats.ready === 0 || isBulkConfirming
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isBulkConfirming ? '登録中...' : `確定 ${draftStats.ready} 件`}
              </button>
            </div>
          )}

          {isAIOff && (
            <p className="text-sm text-red-500 font-semibold">
              AIがOFFのため、OCRは利用できません。
            </p>
          )}

          {driveError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">{driveError}</p>
          )}

          {(driveImportReport.success > 0 || driveImportReport.failure > 0) && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1">
              <p>
                Google Drive import: Success {driveImportReport.success} / Failed{' '}
                {driveImportReport.failure}
              </p>

              {driveImportReport.errors.length > 0 && (
                <ul className="list-disc pl-4 text-orange-500">
                  {driveImportReport.errors.map((error, index) => (
                    <li key={`${error}-${index}`} className="text-justify">
                      {error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <label className="font-semibold text-slate-700 dark:text-slate-200">
                取得イベント
              </label>
              <input
                type="text"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="任意のイベント名またはキャンペーン名"
                className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm">
              <label className="font-semibold text-slate-700 dark:text-slate-200">
                受領者
              </label>

              {recipientOptions.length > 0 ? (
                <select
                  value={recipientCode}
                  onChange={e => setRecipientCode(e.target.value)}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white shadow-sm"
                >
                  <option value="">受領者を選択</option>
                  {recipientOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                      {opt.department ? ` / ${opt.department}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={recipientCode}
                  onChange={e => setRecipientCode(e.target.value)}
                  placeholder="社員番号または氏名を入力"
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white shadow-sm"
                />
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400">
                名刺の受領者を記録するために使用します。
              </p>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="sr-only"
            onChange={e => handleFiles(e.target.files)}
            disabled={isAIOff}
          />
        </div>

        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          className="px-6 py-5 border-b border-dashed border-slate-200 dark:border-slate-700/80 text-center hover:border-blue-400 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto text-slate-400" />
          <p className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100">
            ここにファイルをドラッグ＆ドロップしてください（JPEG / PNG / PDF）
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            「ファイルを選択」をクリックするか、Google Driveからインポートすることもできます。
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[520px] overflow-y-auto w-full">
          {drafts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-600 dark:text-slate-300 text-left">
              <p>まだ名刺がありません。ファイルをアップロードしてOCRを開始してください。</p>
              <p>
                OCRの結果は下書きとして表示されます。内容を確認してから連絡先として登録してください。
              </p>
              <p>未確定の下書きは customer_contacts に登録されません。</p>
            </div>
          ) : (
            drafts.map(draft => {
              const isPdf = draft.mimeType.includes('pdf');
              const ocrStatus = OCR_STATUS_STYLES[draft.ocrStatus];
              const insertStatus = INSERT_STATUS_STYLES[draft.insertStatus];

              const canConfirm =
                draft.ocrStatus === 'ready' &&
                draft.insertStatus !== 'saving' &&
                draft.insertStatus !== 'success' &&
                hasContactCompanyName(draft.contactPayload);

              return (
                <div
                  key={draft.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {isPdf ? (
                        <FileText className="w-10 h-10 text-slate-500" />
                      ) : (
                        <img
                          src={draft.fileUrl}
                          alt={draft.fileName}
                          className="w-20 h-14 object-cover rounded border border-slate-200"
                        />
                      )}

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {draft.fileName}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-2">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${ocrStatus.className}`}
                          >
                            {ocrStatus.label}
                          </span>

                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${insertStatus.className}`}
                          >
                            {insertStatus.label}
                          </span>

                          {draft.needsManualConfirmation && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">
                              要確認
                            </span>
                          )}
                        </div>

                        {draft.ocrStatus === 'error' && draft.ocrError && (
                          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                            <AlertTriangle className="w-4 h-4" />
                            {draft.ocrError}
                          </div>
                        )}

                        {draft.insertStatus === 'error' && draft.insertError && (
                          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">
                            <AlertTriangle className="w-4 h-4" />
                            {draft.insertError}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {draft.ocrStatus === 'error' && (
                        <button
                          type="button"
                          onClick={() => runOcr(draft.id, draft.file)}
                          className="px-3 py-1 text-sm font-semibold text-blue-600 hover:underline"
                        >
                          OCR再実行
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveDraft(draft.id)}
                        className="p-2 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/40 dark:bg-slate-900/30 p-4">
                    <dl className="grid grid-cols-1 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
                      <div>
                        <dt className="text-xs font-semibold text-slate-500">会社名</dt>
                        <dd className="font-medium text-slate-900 dark:text-white">
                          {draft.contactPayload?.companyName || '-'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-semibold text-slate-500">担当者</dt>
                        <dd className="flex flex-wrap items-center gap-1">
                          {draft.contactPayload?.personName || '-'}
                          {draft.contactPayload?.personName &&
                            draft.contactPayload?.personTitle && (
                              <span className="text-xs text-slate-500">
                                ({draft.contactPayload.personTitle})
                              </span>
                            )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-semibold text-slate-500">電話 / メール</dt>
                        <dd className="space-y-0.5">
                          <p>{draft.contactPayload?.phoneNumber || '-'}</p>
                          <p>{draft.contactPayload?.email || '-'}</p>
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-semibold text-slate-500">住所</dt>
                        <dd>{draft.contactPayload?.address1 || '-'}</dd>
                      </div>

                      <div>
                        <dt className="text-xs font-semibold text-slate-500">取得イベント</dt>
                        <dd>{draft.contactPayload?.businessEvent || '-'}</dd>
                      </div>

                      <div>
                        <dt className="text-xs font-semibold text-slate-500">受領者</dt>
                        <dd>
                          {formatRecipientLabel(draft.contactPayload?.receivedByEmployeeCode)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/30 p-4">
                    <div className="grid gap-3">
                      <div>
                        <label className={fieldLabelClass}>会社名</label>
                        <input
                          type="text"
                          value={draft.contactPayload?.companyName || ''}
                          onChange={e =>
                            updateDraftPayloadField(draft.id, 'companyName', e.target.value)
                          }
                          className={fieldInputClass}
                          disabled={draft.insertStatus === 'success'}
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className={fieldLabelClass}>担当者</label>
                          <input
                            type="text"
                            value={draft.contactPayload?.personName || ''}
                            onChange={e =>
                              updateDraftPayloadField(draft.id, 'personName', e.target.value)
                            }
                            className={fieldInputClass}
                            disabled={draft.insertStatus === 'success'}
                          />
                        </div>

                        <div>
                          <label className={fieldLabelClass}>役職</label>
                          <input
                            type="text"
                            value={draft.contactPayload?.personTitle || ''}
                            onChange={e =>
                              updateDraftPayloadField(draft.id, 'personTitle', e.target.value)
                            }
                            className={fieldInputClass}
                            disabled={draft.insertStatus === 'success'}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <label className={fieldLabelClass}>電話番号</label>
                          <input
                            type="text"
                            value={draft.contactPayload?.phoneNumber || ''}
                            onChange={e =>
                              updateDraftPayloadField(draft.id, 'phoneNumber', e.target.value)
                            }
                            className={fieldInputClass}
                            disabled={draft.insertStatus === 'success'}
                          />
                        </div>

                        <div>
                          <label className={fieldLabelClass}>メールアドレス</label>
                          <input
                            type="text"
                            value={draft.contactPayload?.email || ''}
                            onChange={e =>
                              updateDraftPayloadField(draft.id, 'email', e.target.value)
                            }
                            className={fieldInputClass}
                            disabled={draft.insertStatus === 'success'}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={fieldLabelClass}>住所</label>
                        <input
                          type="text"
                          value={draft.contactPayload?.address1 || ''}
                          onChange={e =>
                            updateDraftPayloadField(draft.id, 'address1', e.target.value)
                          }
                          className={fieldInputClass}
                          disabled={draft.insertStatus === 'success'}
                        />
                      </div>
                    </div>

                    {draft.needsManualConfirmation && (
                      <p className="text-xs text-orange-500 mt-3">
                        OCRで企業名や氏名を特定できませんでした。会社名または氏名を入力してから登録してください。
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => confirmDraft(draft)}
                      disabled={!canConfirm}
                      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-semibold text-white ${
                        canConfirm
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      {draft.insertStatus === 'saving' ? '登録中...' : '確認して連絡先を登録'}
                    </button>

                    {draft.insertStatus === 'error' && draft.contactPayload && (
                      <button
                        type="button"
                        onClick={() => handleRetryInsert(draft)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                        再登録
                      </button>
                    )}

                    {draft.insertStatus === 'saving' && (
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-500">
                        <Loader className="w-4 h-4 animate-spin" />
                        登録中...
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {drafts.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {draftStats.processing > 0 && <Loader className="w-4 h-4 text-blue-500 animate-spin" />}
              {draftStats.processing === 0 && <CheckCircle className="w-4 h-4 text-emerald-500" />}
              <span>
                OCR processing {draftStats.processing} / Ready {draftStats.ready} /
                Unconfirmed {draftStats.unconfirmed} / Success {draftStats.success} / Error{' '}
                {draftStats.error}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              内容を確認してから customer_contacts に連絡先として登録してください。
            </p>
          </div>
        )}
      </section>

      {showDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Google Driveから名刺を取り込む
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  OCR処理するファイルを選択してください。
                </p>
              </div>

              <button
                type="button"
                onClick={closeDriveModal}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto px-6 py-4 space-y-2">
              {isDriveLoading && (
                <p className="text-sm text-slate-500">
                  Google Driveのファイルを読み込んでいます...
                </p>
              )}

              {!isDriveLoading && driveFiles.length === 0 && (
                <p className="text-sm text-slate-500">名刺ファイルが見つかりませんでした。</p>
              )}

              {driveFiles.map(file => (
                <label
                  key={file.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400"
                >
                  <div className="flex-grow text-sm text-slate-800 dark:text-slate-100">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(file.createdTime).toLocaleString()}
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={selectedDriveFiles.includes(file.id)}
                    onChange={() => toggleDriveFileSelection(file.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
              <button
                type="button"
                onClick={closeDriveModal}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={importDriveFiles}
                disabled={isDriveImporting || selectedDriveFiles.length === 0}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${
                  isDriveImporting || selectedDriveFiles.length === 0
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isDriveImporting ? '取り込み中...' : `${selectedDriveFiles.length}件を取り込む`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BusinessCardUploadSection;