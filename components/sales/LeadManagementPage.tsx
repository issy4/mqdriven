import React, { useState, useMemo } from 'react';
import { Lead, LeadStatus, Toast, ConfirmationDialogProps, EmployeeUser, Customer } from '../../types';
import { Loader, Pencil, Trash2, Mail, Eye, CheckCircle, Lightbulb, List, KanbanSquare, Plus, Users, Upload } from '../Icons';

type SortConfig = {
  key: string;
  direction: 'ascending' | 'descending';
} | null;
import { LeadDetailModal } from './LeadDetailModal';
import LeadStatusBadge from './LeadStatusBadge';
import LeadKanbanView from './LeadKanbanView';
import { generateLeadReplyEmail } from '../../services/geminiService';
import { formatDateTime } from '../../utils';
import EmptyState from '../ui/EmptyState';
import SortableHeader from '../ui/SortableHeader';
import { DropdownMenu, DropdownMenuItem } from '../ui/DropdownMenu';
import LeadPdfImportModal, { ExtractedLead } from '../LeadPdfImportModal';

const INQUIRY_TYPE_LABELS: Record<string, string> = {
  'print-estimate': '印刷に関するお見積り',
  'logistics-estimate': '物流に関するお見積り',
  'eco-print-estimate': '環境印刷に関するお見積り',
  'sdgs-support': 'SDGs支援について',
  'sustainability-report': 'サステナビリティレポート作成',
  'planning-editing': '企画編集について',
  'office-support': '事務局作業のお手伝い',
  'secretariat': '事務局',
  'web-production': 'Web制作について',
  'system-development': 'システム開発について',
  'goods-production': 'オリジナルグッズ制作',
};

interface LeadManagementPageProps {
  leads: Lead[];
  searchTerm: string;
  onRefresh: () => void;
  onUpdateLead: (leadId: string, updatedData: Partial<Lead>) => Promise<void>;
  onDeleteLead: (leadId: string) => Promise<void>;
  addToast: (message: string, type: Toast['type']) => void;
  requestConfirmation: (dialog: Omit<ConfirmationDialogProps, 'isOpen' | 'onClose'>) => void;
  currentUser: EmployeeUser | null;
  isAIOff: boolean;
  onAddEstimate: (estimate: any) => Promise<void>;
  customers: Customer[]; // 既存顧客リスト
  onCreateExistingCustomerLead: (leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onNavigate?: (page: string) => void; // ナビゲーション用
  orderedCompanyNames?: Set<string>; // 受注済み顧客名セット（estimates/ordersテーブルから取得）
}

const LeadManagementPage: React.FC<LeadManagementPageProps> = ({ leads, searchTerm, onRefresh, onUpdateLead, onDeleteLead, addToast, requestConfirmation, currentUser, isAIOff, onAddEstimate, customers, onCreateExistingCustomerLead, onNavigate, orderedCompanyNames }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'updatedAt', direction: 'descending' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [initialAiTab, setInitialAiTab] = useState<'investigation' | 'proposal' | 'email' | undefined>(undefined);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
    const [responseFilter, setResponseFilter] = useState<'all' | 'handled' | 'unhandled'>('all');
    const [editingStatusLeadId, setEditingStatusLeadId] = useState<string | null>(null);
    const [isReplyingTo, setIsReplyingTo] = useState<string | null>(null);
    const [isMarkingContacted, setIsMarkingContacted] = useState<string | null>(null);
    const [togglingHandledId, setTogglingHandledId] = useState<string | null>(null);
    const [isAddingExistingCustomerLead, setIsAddingExistingCustomerLead] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isPdfImportOpen, setIsPdfImportOpen] = useState(false);

    const handleRowClick = (lead: Lead) => {
        setInitialAiTab(undefined);
        setSelectedLead(lead);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedLead(null);
    };

    const handleSaveLead = async (leadId: string, updatedData: Partial<Lead>) => {
        await onUpdateLead(leadId, updatedData);
        if (selectedLead && selectedLead.id === leadId) {
            setSelectedLead(prev => prev ? { ...prev, ...updatedData } as Lead : null);
        }
    };
    
    const handleDeleteClick = (e: React.MouseEvent, lead: Lead) => {
        e.stopPropagation();
        requestConfirmation({
            title: 'リードの削除',
            message: `本当にリード「${lead.company} / ${lead.name}」を削除しますか？この操作は元に戻せません。`,
            onConfirm: async () => {
                await onDeleteLead(lead.id);
                if (selectedLead && selectedLead.id === lead.id) {
                    handleCloseModal();
                }
            }
        });
    };
    
    const handleGenerateReply = async (lead: Lead) => {
        if (!lead.email) {
            addToast('返信先のメールアドレスが登録されていません。', 'error');
            return;
        }
        if (!currentUser) {
            addToast('ログインユーザー情報が見つかりません。', 'error');
            return;
        }
        setIsReplyingTo(lead.id);
        try {
            const { subject, body } = await generateLeadReplyEmail(lead, currentUser.name);
            const departmentLine = currentUser.department || '本社';
            const signature = [
                '---',
                '',
                '文唱堂印刷株式会社',
                departmentLine,
                currentUser.name,
                '〒101-0025 東京都千代田区神田佐久間町3-37',
                'TEL：03-3851-0111　FAX：03-3861-1979',
                `Mail: ${currentUser.email}`,
                'Web: http://b-p.co.jp',
            ].join('\n');
            const bodyWithSignature = `${body}\n\n${signature}`;
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${lead.email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyWithSignature)}`;
            window.open(gmailUrl, '_blank');
            
            const timestamp = new Date().toLocaleString('ja-JP');
            const logMessage = `[${timestamp}] AI返信メールを作成しました。`;
            const updatedInfo = `${logMessage}\n${lead.infoSalesActivity || ''}`.trim();
            
            const statusTimestamp = new Date().toISOString();
            await onUpdateLead(lead.id, { 
                infoSalesActivity: updatedInfo, 
                status: LeadStatus.Contacted,
                updatedAt: statusTimestamp,
                statusUpdatedAt: statusTimestamp,
                assignedTo: currentUser?.name || null,
            });
            addToast('Gmailの下書きを作成しました。', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'AIによるメール作成に失敗しました。', 'error');
        } finally {
            setIsReplyingTo(null);
        }
    };

    const handleMarkContacted = async (e: React.MouseEvent, lead: Lead) => {
        e.stopPropagation();
        setIsMarkingContacted(lead.id);
        try {
            const timestamp = new Date().toLocaleString('ja-JP');
            const statusTimestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] ステータスを「${lead.status}」から「${LeadStatus.Contacted}」に変更しました。`;
            const updatedInfo = `${logMessage}\n${lead.infoSalesActivity || ''}`.trim();

            await onUpdateLead(lead.id, {
                status: LeadStatus.Contacted,
                infoSalesActivity: updatedInfo,
                updatedAt: statusTimestamp,
                statusUpdatedAt: statusTimestamp,
                assignedTo: currentUser?.name || null,
            });
            addToast('ステータスを「コンタクト済」に更新しました。', 'success');
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'ステータスの更新に失敗しました。', 'error');
        } finally {
            setIsMarkingContacted(null);
        }
    };

    // 既存顧客案件を追加するハンドラー
    const handleAddExistingCustomerLead = async (customer: Customer, projectType: 'repeat' | 'upsell' | 'retention') => {
        if (!currentUser) return;
        
        setIsAddingExistingCustomerLead(true);
        try {
            const now = new Date().toISOString();
            const newLead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> = {
                status: LeadStatus.New,
                name: customer.representative || '担当者',
                email: customer.customerContactInfo || null,
                phone: customer.phoneNumber || null,
                company: customer.customerName,
                source: 'existing_customer',
                tags: ['既存顧客'],
                message: `${projectType === 'repeat' ? 'リピート' : projectType === 'upsell' ? 'アップセル' : 'リテンション'}案件の問い合わせ`,
                referrer: null,
                referrerUrl: null,
                landingPageUrl: null,
                searchKeywords: null,
                utmSource: null,
                utmMedium: null,
                utmCampaign: null,
                utmTerm: null,
                utmContent: null,
                userAgent: null,
                ipAddress: null,
                deviceType: null,
                browserName: null,
                osName: null,
                country: null,
                city: null,
                region: null,
                employees: customer.employeesCount || null,
                budget: null,
                timeline: null,
                inquiryType: projectType,
                inquiryTypes: [projectType],
                infoSalesActivity: null,
                score: projectType === 'upsell' ? 80 : projectType === 'repeat' ? 70 : 60,
                aiAnalysisReport: null,
                aiDraftProposal: null,
                aiInvestigation: null,
                assignedTo: currentUser.name,
                statusUpdatedAt: now,
                estimateSentAt: null,
                estimateSentBy: null,
                // 既存顧客案件用のフィールド
                isExistingCustomer: true,
                customerId: customer.id,
                projectType: projectType,
                lastOrderDate: null, // 顧客マスタから取得するか別途設定
                totalOrderAmount: null, // 顧客マスタから取得するか別途設定
                preferredContactMethod: 'email'
            };

            await onCreateExistingCustomerLead(newLead);
            addToast(`${customer.customerName}の${projectType === 'repeat' ? 'リピート' : projectType === 'upsell' ? 'アップセル' : 'リテンション'}案件を追加しました。`, 'success');
            setSelectedCustomer(null);
            onRefresh();
        } catch (error) {
            addToast(error instanceof Error ? error.message : '既存顧客案件の追加に失敗しました。', 'error');
        } finally {
            setIsAddingExistingCustomerLead(false);
        }
    };

    const handlePdfLeadImport = async (extractedLeads: ExtractedLead[]) => {
        for (const d of extractedLeads) {
            const now = new Date().toISOString();
            const newLead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> = {
                status: LeadStatus.New,
                name: d.name || '名前不明',
                email: d.email || null,
                phone: d.phone || null,
                company: d.company || '会社名不明',
                source: 'pdf_import',
                tags: ['PDFインポート'],
                message: [d.department, d.title].filter(Boolean).join(' / ') || null,
                address: d.address || null,
                assignedTo: currentUser?.name || null,
                statusUpdatedAt: now,
            } as any;
            await onCreateExistingCustomerLead(newLead);
        }
        addToast(`${extractedLeads.length}件のリードをインポートしました。`, 'success');
        onRefresh();
    };

    const isHandled = (lead: Lead) => lead.status !== LeadStatus.Untouched;

    const filteredLeads = useMemo(() => {
        let filtered = leads;
        if (responseFilter === 'handled') {
            filtered = filtered.filter(isHandled);
        } else if (responseFilter === 'unhandled') {
            filtered = filtered.filter(lead => !isHandled(lead));
        }
        if (!searchTerm) return filtered;
        const lower = searchTerm.toLowerCase();
        return filtered.filter(l => 
            l.name.toLowerCase().includes(lower) ||
            l.company.toLowerCase().includes(lower) ||
            l.status.toLowerCase().includes(lower) ||
            (l.source && l.source.toLowerCase().includes(lower))
        );
    }, [leads, searchTerm, responseFilter]);

    const sortedLeads = useMemo(() => {
        let sortableItems = [...filteredLeads];
        if (sortConfig) {
            sortableItems.sort((a, b) => {
                let aVal: any = a[sortConfig.key as keyof Lead];
                let bVal: any = b[sortConfig.key as keyof Lead];

                if (sortConfig.key === 'inquiryTypes') {
                    aVal = a.inquiryTypes ? a.inquiryTypes.join(', ') : (a.inquiryType || '');
                    bVal = b.inquiryTypes ? b.inquiryTypes.join(', ') : (b.inquiryType || '');
                }
                
                if (sortConfig.key === 'updatedAt') {
                    aVal = a.updatedAt || a.createdAt;
                    bVal = b.updatedAt || b.createdAt;
                }

                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;
                
                if (String(aVal).toLowerCase() < String(bVal).toLowerCase()) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (String(aVal).toLowerCase() > String(bVal).toLowerCase()) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredLeads, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleToggleHandled = async (e: React.MouseEvent, lead: Lead) => {
        e.stopPropagation();
        const currentlyHandled = isHandled(lead);
        const nextStatus = currentlyHandled ? LeadStatus.Untouched : LeadStatus.Contacted;
        setTogglingHandledId(lead.id);
        try {
            const timestamp = new Date().toISOString();
            const updates: Partial<Lead> = { status: nextStatus, updatedAt: timestamp };
            if (nextStatus === LeadStatus.Untouched) {
                updates.assignedTo = null;
                updates.statusUpdatedAt = null;
            } else {
                updates.statusUpdatedAt = timestamp;
                updates.assignedTo = currentUser?.name || lead.assignedTo || null;
            }
            await onUpdateLead(lead.id, updates);
            addToast(currentlyHandled ? '未対応に戻しました。' : '対応済みに設定しました。', 'success');
        } catch (error) {
            console.error('Failed to toggle handled flag', error);
            addToast('対応フラグの更新に失敗しました。', 'error');
        } finally {
            setTogglingHandledId(null);
        }
    };

    const renderInvestigationBadge = (lead: Lead) => (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                lead.aiInvestigation?.summary
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}
        >
            {lead.aiInvestigation?.summary ? '調査済' : '未'}
        </span>
    );

    const renderEstimateBadge = (lead: Lead) => {
        const hasDraft = Boolean(lead.aiDraftProposal && String(lead.aiDraftProposal).trim());
        const isSent = Boolean(lead.estimateSentAt);
        const label = isSent ? '送信済' : hasDraft ? '作成済' : '未';
        const style = isSent
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
            : hasDraft
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
        return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>{label}</span>;
    };

    const renderOrderBadge = (lead: Lead) => {
        const isOrdered = orderedCompanyNames?.has(lead.company || '') ?? false;
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                isOrdered
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}>
                {isOrdered ? '受注済' : '未受注'}
            </span>
        );
    };

    const extractEstimateSentTimestampFromLog = (lead: Lead): string | null => {
        const raw = lead.infoSalesActivity || '';
        const match = raw.match(/\[([^\]]+)\]\s*見積メールを送信しました。?/);
        return match?.[1] ?? null;
    };

    const extractReplyTimestampFromLog = (lead: Lead): string | null => {
        const raw = lead.infoSalesActivity || '';
        const match = raw.match(/\[([^\]]+)\]\s*AI返信メールを作成しました。?/);
        return match?.[1] ?? null;
    };

    const getNextAction = (lead: Lead): { label: string; disabled?: boolean; onClick?: () => void } => {
        const estimateSentAtLabel = lead.estimateSentAt ? formatDateTime(lead.estimateSentAt) : extractEstimateSentTimestampFromLog(lead);
        const hasEstimateDraft = Boolean(lead.aiDraftProposal && String(lead.aiDraftProposal).trim());
        const hasReply = lead.status !== LeadStatus.Untouched || Boolean(extractReplyTimestampFromLog(lead));

        if (estimateSentAtLabel) {
            return {
                label: '見積一覧',
                onClick: () => {
                    window.location.hash = '#/sales/estimates';
                }
            };
        }
        if (hasEstimateDraft || hasReply) {
            return {
                label: hasEstimateDraft ? '見積送信' : '見積作成',
                onClick: () => {
                    setInitialAiTab('proposal');
                    setSelectedLead(lead);
                    setIsModalOpen(true);
                },
            };
        }
        return {
            label: '返信作成',
            onClick: () => handleGenerateReply(lead),
        };
    };

    return (
        <>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setResponseFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${responseFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'}`}
                    >
                        全て
                    </button>
                    <button
                        onClick={() => setResponseFilter('unhandled')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${responseFilter === 'unhandled' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'}`}
                    >
                        未対応
                    </button>
                    <button
                        onClick={() => setResponseFilter('handled')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${responseFilter === 'handled' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'}`}
                    >
                        対応済
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setSelectedCustomer(customers[0] || null)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 flex items-center gap-2"
                            disabled={customers.length === 0}
                        >
                            <Users className="w-4 h-4" />
                            既存顧客案件
                        </button>
                        {selectedCustomer && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50">
                                <div className="p-3 border-b border-slate-200 dark:border-slate-600">
                                    <h3 className="font-semibold text-sm">{selectedCustomer.customerName}</h3>
                                    <p className="text-xs text-slate-500">{selectedCustomer.representative}</p>
                                </div>
                                <div className="p-2">
                                    <button
                                        onClick={() => handleAddExistingCustomerLead(selectedCustomer, 'repeat')}
                                        disabled={isAddingExistingCustomerLead}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        リピート案件
                                    </button>
                                    <button
                                        onClick={() => handleAddExistingCustomerLead(selectedCustomer, 'upsell')}
                                        disabled={isAddingExistingCustomerLead}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        アップセル案件
                                    </button>
                                    <button
                                        onClick={() => handleAddExistingCustomerLead(selectedCustomer, 'retention')}
                                        disabled={isAddingExistingCustomerLead}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        リテンション案件
                                    </button>
                                </div>
                                <div className="p-2 border-t border-slate-200 dark:border-slate-600">
                                    <button
                                        onClick={() => setSelectedCustomer(null)}
                                        className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                                    >
                                        キャンセル
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setIsPdfImportOpen(true)}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-amber-500 text-white border-amber-500 hover:bg-amber-600 flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        PDFインポート
                    </button>
                </div>
                <div className="flex items-center p-1 bg-slate-200 dark:bg-slate-700 rounded-lg self-end md:self-auto">
                    <button onClick={() => setViewMode('list')} className={`px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-2 ${viewMode === 'list' ? 'bg-white dark:bg-slate-800 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>
                        <List className="w-4 h-4" /> リスト
                    </button>
                    <button onClick={() => setViewMode('kanban')} className={`px-3 py-1 rounded-md text-sm font-semibold flex items-center gap-2 ${viewMode === 'kanban' ? 'bg-white dark:bg-slate-800 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>
                        <KanbanSquare className="w-4 h-4" /> カンバン
                    </button>
                </div>
            </div>

            {viewMode === 'list' ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-sm text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                <tr>
                                    <SortableHeader sortKey="updatedAt" label="最終更新日時" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader sortKey="company" label="会社名 / 担当者" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader sortKey="assignedTo" label="対応者" sortConfig={sortConfig} requestSort={requestSort} />
                                    <th scope="col" className="px-3 py-2 font-medium text-left">対応フラグ</th>
                                    <th scope="col" className="px-3 py-2 font-medium text-center whitespace-nowrap">企業調査</th>
                                    <th scope="col" className="px-3 py-2 font-medium text-center whitespace-nowrap">見積</th>
                                    <th scope="col" className="px-3 py-2 font-medium text-center whitespace-nowrap">受注</th>
                                    <th scope="col" className="px-3 py-2 font-medium text-center whitespace-nowrap">顧客種別</th>
                                    <SortableHeader sortKey="status" label="ステータス" sortConfig={sortConfig} requestSort={requestSort} />
                                    <SortableHeader sortKey="inquiryTypes" label="問い合わせ種別" sortConfig={sortConfig} requestSort={requestSort} />
                                    <th scope="col" className="px-3 py-2 font-medium text-center whitespace-nowrap">次のアクション</th>
                                    <th scope="col" className="px-3 py-2 font-medium text-center">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedLeads.map((lead) => (
                                    <tr 
                                      key={lead.id} 
                                      className="group bg-white dark:bg-slate-800 border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer odd:bg-slate-50 dark:odd:bg-slate-800/50"
                                      onClick={() => handleRowClick(lead)}
                                    >
                                        <td className="px-3 py-2.5 whitespace-nowrap text-sm">{formatDateTime(lead.updatedAt || lead.createdAt)}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                                                {lead.company} <span className="font-normal text-slate-500">/ {lead.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-700 dark:text-slate-300">{lead.assignedTo || '-'}</span>
                                                {lead.statusUpdatedAt && (
                                                    <span className="text-xs text-slate-400 whitespace-nowrap">({formatDateTime(lead.statusUpdatedAt)})</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => handleToggleHandled(e, lead)}
                                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                                                    isHandled(lead)
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100'
                                                        : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100'
                                                }`}
                                                disabled={togglingHandledId === lead.id}
                                            >
                                                {togglingHandledId === lead.id ? (
                                                    <Loader className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="w-4 h-4" />
                                                )}
                                                {isHandled(lead) ? '対応済' : '未対応'}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                            {renderInvestigationBadge(lead)}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {renderEstimateBadge(lead)}
                                                {(() => {
                                                    const sentAtLabel = lead.estimateSentAt ? formatDateTime(lead.estimateSentAt) : extractEstimateSentTimestampFromLog(lead);
                                                    if (!sentAtLabel) return null;
                                                    return (
                                                        <span className="text-xs text-slate-400 whitespace-nowrap">
                                                            {sentAtLabel}{lead.estimateSentBy ? ` (${lead.estimateSentBy})` : ''}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                            {renderOrderBadge(lead)}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center">
                                            {lead.isExistingCustomer ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                                                        既存顧客
                                                    </span>
                                                    {lead.projectType && (
                                                        <span className="text-xs text-slate-500">
                                                            {lead.projectType === 'repeat' ? 'リピート' : 
                                                             lead.projectType === 'upsell' ? 'アップセル' : 'リテンション'}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                    新規
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            {editingStatusLeadId === lead.id ? (
                                                <select
                                                    value={lead.status}
                                                    onChange={(e) => {
                                                        const newStatus = e.target.value as LeadStatus;
                                                        const statusTimestamp = new Date().toISOString();
                                                        const updateData: Partial<Lead> = { status: newStatus, updatedAt: statusTimestamp };
                                                        if (newStatus === LeadStatus.Untouched) {
                                                            updateData.assignedTo = null;
                                                            updateData.statusUpdatedAt = null;
                                                        } else {
                                                            updateData.statusUpdatedAt = statusTimestamp;
                                                            if (!lead.assignedTo && currentUser?.name) updateData.assignedTo = currentUser.name;
                                                        }
                                                        onUpdateLead(lead.id, updateData);
                                                        setEditingStatusLeadId(null);
                                                    }}
                                                    onBlur={() => setEditingStatusLeadId(null)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    autoFocus
                                                    className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg p-1 text-xs focus:ring-blue-500 focus:border-blue-500"
                                                >
                                                    {Object.values(LeadStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            ) : (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingStatusLeadId(lead.id) }}
                                                    className="w-full text-left relative group/status p-1 flex items-center gap-2"
                                                >
                                                    <LeadStatusBadge status={lead.status} />
                                                    <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover/status:opacity-100 transition-opacity" />
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            {lead.inquiryTypes && lead.inquiryTypes.length > 0
  ? (
      <div className="flex flex-wrap gap-1">
        {lead.inquiryTypes.slice(0, 2).map(type => (
          <span
            key={type}
            className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-600"
          >
            {INQUIRY_TYPE_LABELS[type] || type}
          </span>
        ))}
      </div>
    )
  : (
      lead.inquiryType
        ? INQUIRY_TYPE_LABELS[lead.inquiryType] || lead.inquiryType
        : '-'
    )
}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                                            {(() => {
                                                const action = getNextAction(lead);
                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(action.disabled) || isReplyingTo === lead.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            action.onClick?.();
                                                        }}
                                                        className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
                                                    >
                                                        {isReplyingTo === lead.id ? <Loader className="w-4 h-4 animate-spin" /> : null}
                                                        {action.label}
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <div className="flex justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100" onClick={e => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuItem onClick={() => handleRowClick(lead)}>
                                                        <Eye className="w-4 h-4" /> 詳細表示
                                                    </DropdownMenuItem>
                                                     {lead.status === LeadStatus.Untouched && (
                                                        <DropdownMenuItem onClick={(e) => handleMarkContacted(e, lead)}>
                                                            {isMarkingContacted === lead.id ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} コンタクト済にする
                                                        </DropdownMenuItem>
                                                     )}
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleGenerateReply(lead); }} disabled={isAIOff}>
                                                        {isReplyingTo === lead.id ? <Loader className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} AIで返信作成
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={(e) => handleDeleteClick(e, lead)} className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50">
                                                        <Trash2 className="w-4 h-4" /> 削除
                                                    </DropdownMenuItem>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                 {sortedLeads.length === 0 && (
                                    <tr>
                                        <td colSpan={10}>
                                            <EmptyState 
                                                icon={Lightbulb}
                                                title={searchTerm ? '検索結果がありません' : 'リードがありません'}
                                                message={searchTerm ? '検索条件を変更してください。' : '「新規作成」から最初のリードを登録してください。'}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <LeadKanbanView leads={filteredLeads} onUpdateLead={onUpdateLead} onCardClick={handleRowClick} orderedCompanyNames={orderedCompanyNames} />
            )}
            <LeadDetailModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                lead={selectedLead}
                onSave={handleSaveLead}
                onDelete={onDeleteLead}
                addToast={addToast}
                requestConfirmation={requestConfirmation}
                currentUser={currentUser}
                onGenerateReply={handleGenerateReply}
                isAIOff={isAIOff}
                // FIX: Pass the onAddEstimate prop to satisfy the LeadDetailModalProps interface.
                onAddEstimate={onAddEstimate}
                onEstimateCreated={() => {
                    // 見積もり作成後にリード一覧を更新
                    console.log('Estimate created callback triggered, refreshing leads...');
                    onRefresh();
                }}
                onShowAiEstimate={() => {
                    // AI見積作成ページへ遷移
                    if (onNavigate) {
                        onNavigate('simple_estimates');
                    } else {
                        window.location.href = '#/simple_estimates';
                    }
                }}
                initialAiTab={initialAiTab}
            />

            <LeadPdfImportModal
                isOpen={isPdfImportOpen}
                onClose={() => setIsPdfImportOpen(false)}
                onImport={handlePdfLeadImport}
                addToast={addToast}
            />
        </>
    );
};

export default LeadManagementPage;
