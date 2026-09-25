import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Customer, SortConfig, Toast, EmployeeUser } from '../types';
import { Pencil, Eye, Mail, Lightbulb, Users, PlusCircle, Loader, Save, X, Search, Trophy } from './Icons';
import EmptyState from './ui/EmptyState';
import SortableHeader from './ui/SortableHeader';
import { generateSalesEmail, enrichCustomerData } from '../services/geminiService';
import { createSignature, formatJPY } from '../utils';
import { getCustomerSalesRankings } from '../services/dataService';
import * as XLSX from 'xlsx';

interface CustomerListProps {
  customers: Customer[];
  searchTerm: string;
  onSelectCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customerId: string, customerData: Partial<Customer>) => Promise<void>;
  onAnalyzeCustomer: (customer: Customer) => void;
  addToast: (message: string, type: Toast['type']) => void;
  currentUser: EmployeeUser | null;
  onNewCustomer: () => void;
  isAIOff: boolean;
  onShowBulkOCR?: () => void;
  isChartMode?: boolean;
}

const CustomerList: React.FC<CustomerListProps> = ({ customers, searchTerm, onSelectCustomer, onUpdateCustomer, onAnalyzeCustomer, addToast, currentUser, onNewCustomer, isAIOff, onShowBulkOCR, isChartMode }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'createdAt', direction: 'descending' });
  const [isGeneratingEmail, setIsGeneratingEmail] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Partial<Customer>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  //const [exportResult, setExportResult] = useState<{ url: string; message: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const mounted = useRef(true);

  const [viewMode, setViewMode] = useState<'ranking' | 'list'>(isChartMode ? 'ranking' : 'list');
  const [rankings, setRankings] = useState<any[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState(false);

  useEffect(() => {
    if (isChartMode && viewMode === 'ranking') {
      setIsLoadingRankings(true);
      getCustomerSalesRankings().then((data) => {
        if (mounted.current) setRankings(data);
      }).catch(e => {
        if (mounted.current) addToast(e.message, 'error');
      }).finally(() => {
        if (mounted.current) setIsLoadingRankings(false);
      });
    }
  }, [isChartMode, viewMode]);

  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleEditClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setEditingRowId(customer.id);
    setEditedData(customer);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRowId(null);
    setEditedData({});
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingRowId) return;
    setIsSaving(true);
    try {
      await onUpdateCustomer(editingRowId, editedData);
    } finally {
      if (mounted.current) {
        setIsSaving(false);
        setEditingRowId(null);
      }
    }
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateProposal = async (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    if (isAIOff) {
      addToast('AI機能は現在無効です。', 'error');
      return;
    }
    if (!currentUser) {
      addToast('ログインユーザー情報が見つかりません。', 'error');
      return;
    }
    setIsGeneratingEmail(customer.id);
    try {
      const { subject, body } = await generateSalesEmail(customer, currentUser.name);
      const signature = createSignature();
      const finalBody = `${body}${signature}`;
      const mailto = `mailto:${customer.customerContactInfo || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(finalBody)}`;
      window.open(mailto, '_blank');
      if (mounted.current) {
        addToast(`「${customer.customerName}」向けのメール下書きを作成しました。`, 'success');
      }
    } catch (error) {
      if (mounted.current) {
        addToast(error instanceof Error ? error.message : 'メール作成に失敗しました', 'error');
      }
    } finally {
      if (mounted.current) {
        setIsGeneratingEmail(null);
      }
    }
  };

  const handleEnrich = async (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    if (isAIOff) {
      addToast('AI機能は現在無効です。', 'error');
      return;
    }
    setEnrichingId(customer.id);
    try {
      const enrichedData = await enrichCustomerData(customer.customerName);
      await onUpdateCustomer(customer.id, enrichedData);
      addToast(`「${customer.customerName}」の情報をAIで更新しました。`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? `情報補完エラー: ${error.message}` : '企業情報の補完に失敗しました。', 'error');
    } finally {
      if (mounted.current) {
        setEnrichingId(null);
      }
    }
  };

  const normalize = (value?: string | null) =>
    value?.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim() ?? '';

  const filteredCustomers = useMemo(() => {
    const keyword = normalize(searchTerm);
    if (!keyword) return customers;

    const keys: Array<keyof Customer | string> = [
      'customer_name',
      'customerName',
      'customer_name_kana',
      'customerNameKana',
      'representative_name',
      'representative',
      'representative_title',
      'representativeTitle',
      'customer_contact_info',
      'customerContactInfo',
      'phone_number',
      'phoneNumber',
      'address_1',
      'address1',
      'website_url',
      'websiteUrl',
      'note',
    ];

    return customers.filter(customer =>
      keys.some(key => normalize((customer as any)[key]).includes(keyword))
    );
  }, [customers, searchTerm]);

  const sortedCustomers = useMemo(() => {
    let sortableItems = [...filteredCustomers];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'createdAt') {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const bTime = b.created_at ? new Date(b.created_at).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return sortConfig.direction === 'ascending' ? aTime - bTime : bTime - aTime;
        }

        const aValue = a[sortConfig.key as keyof Customer] || a[`customer_${sortConfig.key}` as keyof Customer] || a[sortConfig.key.replace(/([A-Z])/g, '_$1').toLowerCase() as keyof Customer];
        const bValue = b[sortConfig.key as keyof Customer] || b[`customer_${sortConfig.key}` as keyof Customer] || b[sortConfig.key.replace(/([A-Z])/g, '_$1').toLowerCase() as keyof Customer];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (String(aValue).toLowerCase() < String(bValue).toLowerCase()) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (String(aValue).toLowerCase() > String(bValue).toLowerCase()) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredCustomers, sortConfig]);

  // Pagination calculations
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedCustomers.slice(startIndex, endIndex);
  }, [sortedCustomers, currentPage]);

  const totalPages = Math.ceil(sortedCustomers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, sortedCustomers.length);

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const exportRows = useMemo(() => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return sortedCustomers.map(customer => ({
      customerName: customer.customer_name || customer.customerName,
      phoneNumber: customer.phone_number || customer.phoneNumber,
      address1: customer.address_1 || customer.address1,
      websiteUrl: customer.website_url || customer.websiteUrl,
      createdAt: customer.created_at || customer.createdAt,
      representative: customer.representative_name || customer.representative,
      representativeTitle: customer.representative_title || customer.representativeTitle,
      customerContactInfo: customer.customer_contact_info || customer.customerContactInfo,
      customerCode: customer.customer_code || customer.customerCode,
      detailUrl: customer.id ? `${baseUrl}/?page=sales_customers&customerId=${customer.id}` : '',
    }));
  }, [sortedCustomers]);

  const handleExportToExcel = async () => {
  if (exportRows.length === 0) {
    addToast(
      '出力対象の顧客がありません。',
      'warning'
    );
    return;
  }

  setIsExporting(true);

  try {
    const excelRows = exportRows.map((row) => ({
      顧客コード:
        row.customerCode || '',

      顧客名:
        row.customerName || '',

      電話番号:
        row.phoneNumber || '',

      住所:
        row.address1 || '',

      Webサイト:
        row.websiteUrl || '',

      代表者:
        row.representative || '',

      代表者役職:
        row.representativeTitle || '',

      連絡先情報:
        row.customerContactInfo || '',

      登録日:
        row.createdAt
          ? new Date(
              row.createdAt
            ).toLocaleDateString(
              'ja-JP'
            )
          : '',

      詳細URL:
        row.detailUrl || '',
    }));

    const worksheet =
      XLSX.utils.json_to_sheet(
        excelRows
      );

    worksheet['!cols'] = [
      { wch: 12 }, // 顧客コード
      { wch: 32 }, // 顧客名
      { wch: 18 }, // 電話番号
      { wch: 45 }, // 住所
      { wch: 35 }, // Web
      { wch: 20 }, // 代表者
      { wch: 18 }, // 役職
      { wch: 35 }, // 連絡先
      { wch: 14 }, // 登録日
      { wch: 50 }, // URL
    ];

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      '顧客一覧'
    );

    const now = new Date();

    const y =
      now.getFullYear();

    const m =
      String(
        now.getMonth() + 1
      ).padStart(2, '0');

    const d =
      String(
        now.getDate()
      ).padStart(2, '0');

    const fileName =
      `顧客一覧_${y}${m}${d}.xlsx`;

    XLSX.writeFile(
      workbook,
      fileName
    );

    addToast(
      `${exportRows.length}件をExcelに出力しました。`,
      'success'
    );
  } catch (error) {
    console.error(
      '[CustomerList] Excel export error:',
      error
    );

    addToast(
      error instanceof Error
        ? error.message
        : 'Excel出力に失敗しました。',
      'error'
    );
  } finally {
    setIsExporting(false);
  }
};

  if (customers.length === 0 && !searchTerm) {
    return <EmptyState icon={Users} title="顧客が登録されていません" message="最初の顧客を登録して、取引を開始しましょう。" action={{ label: "新規顧客登録", onClick: onNewCustomer, icon: PlusCircle }} />;
  }

  const InlineEditInput: React.FC<{ name: keyof Customer, value: any, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }> = ({ name, value, onChange }) => (
    <input
      type="text"
      name={String(name)}
      value={value || ''}
      onChange={onChange}
      onClick={e => e.stopPropagation()}
      className="w-full bg-blue-50 dark:bg-slate-700 p-1 rounded-md border border-blue-300 dark:border-blue-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
    />
  );

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString('ja-JP');
    } catch {
      return value;
    }
  };

  return (
    <div className="overflow-hidden flex flex-col h-full bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
      {isChartMode && (
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-6 py-3 flex items-center gap-4">
          <button onClick={() => setViewMode('ranking')} className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 shadow-sm ${viewMode === 'ranking' ? 'bg-blue-600 text-white border border-blue-600' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-600'}`}>ランキングで表示</button>
          <button onClick={() => setViewMode('list')} className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors duration-200 shadow-sm ${viewMode === 'list' ? 'bg-blue-600 text-white border border-blue-600' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-600'}`}>一覧で表示</button>
        </div>
      )}

      {viewMode === 'ranking' ? (
        <div className="p-6 overflow-y-auto flex-1">
          {isLoadingRankings ? (
            <div className="flex justify-center items-center py-20 px-8">
              <Loader className="w-10 h-10 animate-spin text-blue-500 mr-4" />
              <span className="text-slate-500 font-medium">ランキングデータを読み込み中...</span>
            </div>
          ) : rankings.length > 0 ? (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left text-slate-600 dark:text-slate-400">
                <thead className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-6 py-4 text-center border-r border-slate-100 dark:border-slate-700">順位</th>
                    <th className="px-6 py-4 border-r border-slate-100 dark:border-slate-700">顧客名</th>
                    <th className="px-6 py-4 text-right border-r border-slate-100 dark:border-slate-700">当期売上高</th>
                    <th className="px-6 py-4 border-r border-slate-100 dark:border-slate-700">元データ名</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {rankings.map(r => {
                    const customer = customers.find(c => c.id === r.customer_id);
                    return (
                      <tr 
                        key={r.id} 
                        onClick={() => customer && onSelectCustomer(customer)}
                        className={`transition-colors ${customer ? 'cursor-pointer hover:bg-blue-50/50 dark:hover:bg-slate-700/50' : 'opacity-70'}`}
                      >
                        <td className="px-6 py-4 text-center w-20 border-r border-slate-50 dark:border-slate-700/50">
                          {r.rank === 1 ? <div className="mx-auto flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-600 font-bold border border-yellow-200">1</div> : 
                           r.rank === 2 ? <div className="mx-auto flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold border border-slate-200">2</div> : 
                           r.rank === 3 ? <div className="mx-auto flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold border border-orange-200">3</div> : 
                           <span className="font-semibold text-slate-500">{r.rank}</span>}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200 border-r border-slate-50 dark:border-slate-700/50">
                          {r.customer_name_raw}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400 border-r border-slate-50 dark:border-slate-700/50">
                          {r.total ? formatJPY(r.total) : '¥0'}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {r.customer_name_raw}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Trophy} title="ランキングデータがありません" message="データベースにランキング情報が見つかりませんでした。" />
          )}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-800">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {sortedCustomers.length > 0 ? `${startIndex}-${endIndex}件 / 全${sortedCustomers.length}件` : '0件'} {searchTerm ? <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded ml-2">検索: "{searchTerm}"</span> : ''}
            </div>
            <div className="flex items-center gap-3">
          <button
  type="button"
  onClick={handleExportToExcel}
  disabled={isExporting}
  className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold text-white ${
    isExporting
      ? 'bg-slate-400 cursor-not-allowed'
      : 'bg-green-600 hover:bg-green-700'
  }`}
>
  {isExporting
    ? '出力中…'
    : 'Excelへエクスポート'}
</button>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
        <table className="w-full text-sm text-left text-slate-600 dark:text-slate-400 min-w-[1000px]">
          <thead className="text-sm font-medium text-slate-700 dark:text-slate-300 border-b-2 border-slate-200 dark:border-slate-700">
            <tr>
              <SortableHeader sortKey="customerName" label="顧客名" sortConfig={sortConfig} requestSort={requestSort} />
              <SortableHeader sortKey="phoneNumber" label="電話番号" sortConfig={sortConfig} requestSort={requestSort} />
              <SortableHeader sortKey="address1" label="住所" sortConfig={sortConfig} requestSort={requestSort} />
              <SortableHeader sortKey="websiteUrl" label="Webサイト" sortConfig={sortConfig} requestSort={requestSort} />
              <SortableHeader sortKey="createdAt" label="登録日" sortConfig={sortConfig} requestSort={requestSort} />
              <th scope="col" className="px-6 py-4 font-medium text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCustomers.map((customer) => {
              const isEditing = editingRowId === customer.id;
              return (
                <tr key={customer.id} onClick={() => onSelectCustomer(customer)} className="group border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                    {isEditing ? <InlineEditInput name="customerName" value={editedData.customerName} onChange={handleFieldChange} /> : customer.customer_name || customer.customerName}
                  </td>
                  <td className="px-6 py-4">
                    {isEditing ? <InlineEditInput name="phoneNumber" value={editedData.phoneNumber} onChange={handleFieldChange} /> : customer.phone_number || customer.phoneNumber || '-'}
                  </td>
                  <td className="px-6 py-4 truncate max-w-sm">
                    {isEditing ? <InlineEditInput name="address1" value={editedData.address1} onChange={handleFieldChange} /> : customer.address_1 || customer.address1 || '-'}
                  </td>
                  <td className="px-6 py-4 truncate max-w-xs">
                    {isEditing ? <InlineEditInput name="websiteUrl" value={editedData.websiteUrl} onChange={handleFieldChange} /> : (
                      customer.website_url || customer.websiteUrl ? <a href={customer.website_url || customer.websiteUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline">{customer.website_url || customer.websiteUrl}</a> : '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {formatDate(customer.created_at || customer.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <>
                          <button onClick={handleSaveEdit} disabled={isSaving} className="p-2 rounded-full text-slate-500 hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/50" title="保存">
                            {isSaving ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          </button>
                          <button onClick={handleCancelEdit} className="p-2 rounded-full text-slate-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/50" title="キャンセル">
                            <X className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => onSelectCustomer(customer)} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="詳細表示"><Eye className="w-5 h-5" /></button>
                          <button onClick={(e) => handleEditClick(e, customer)} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="インライン編集"><Pencil className="w-5 h-5" /></button>
                          {!isAIOff && <button onClick={(e) => handleEnrich(e, customer)} disabled={enrichingId === customer.id} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="AIで企業情報補完">
                            {enrichingId === customer.id ? <Loader className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                          </button>}
                           <button onClick={(e) => { e.stopPropagation(); onAnalyzeCustomer(customer) }} disabled={isAIOff} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50" title="AI企業分析"><Lightbulb className="w-5 h-5" /></button>
                           <button onClick={(e) => {
                             e.stopPropagation();
                             const name = customer.customer_name || customer.customerName;
                             window.open(`https://www.google.com/search?q=${encodeURIComponent(name + ' 企業情報 調査')}`, '_blank');
                           }} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" title="企業情報をウェブで調査">
                             <Search className="w-5 h-5 text-blue-500" />
                           </button>
                           <button onClick={(e) => handleGenerateProposal(e, customer)} disabled={isGeneratingEmail === customer.id || isAIOff} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50" title="提案メール作成">
                             {isGeneratingEmail === customer.id ? <Loader className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                           </button>
                         </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {paginatedCustomers.length === 0 && sortedCustomers.length > 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="text-center py-8 text-slate-500">
                    該当ページにデータがありません
                  </div>
                </td>
              </tr>
            )}
            {sortedCustomers.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title="検索結果がありません"
                    message="検索条件を変更して、もう一度お試しください。"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {startIndex}-{endIndex}件 / 全{sortedCustomers.length}件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                前へ
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 text-sm border rounded-md ${currentPage === pageNum
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CustomerList);
