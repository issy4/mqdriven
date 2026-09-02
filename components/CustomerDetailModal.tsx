import React, { useState, useEffect, useRef } from 'react';
import { Customer, EmployeeUser, Toast } from '../types';
import { X, Pencil, Loader, Lightbulb, AlertTriangle, Save } from './Icons';
import CustomerInfoForm from './forms/CustomerInfoForm';
import BusinessCardUploadSection from './BusinessCardUploadSection';

// カタカナ変換関数
const convertToKatakana = (text: string): string => {
    if (!text) return '';

    // 簡易的なカタカナ変換（ひらがなをカタカナに）
    const katakanaMap: Record<string, string> = {
        'あ': 'ア', 'い': 'イ', 'う': 'ウ', 'え': 'エ', 'お': 'オ',
        'か': 'カ', 'き': 'キ', 'く': 'ク', 'け': 'ケ', 'こ': 'コ',
        'が': 'ガ', 'ぎ': 'ギ', 'ぐ': 'グ', 'げ': 'ゲ', 'ご': 'ゴ',
        'さ': 'サ', 'し': 'シ', 'す': 'ス', 'せ': 'セ', 'そ': 'ソ',
        'ざ': 'ザ', 'じ': 'ジ', 'ず': 'ズ', 'ぜ': 'ゼ', 'ぞ': 'ゾ',
        'た': 'タ', 'ち': 'チ', 'つ': 'ツ', 'て': 'テ', 'と': 'ト',
        'だ': 'ダ', 'ぢ': 'ヂ', 'づ': 'ヅ', 'で': 'デ', 'ど': 'ド',
        'な': 'ナ', 'に': 'ニ', 'ぬ': 'ヌ', 'ね': 'ネ', 'の': 'ノ',
        'は': 'ハ', 'ひ': 'ヒ', 'ふ': 'フ', 'へ': 'ヘ', 'ほ': 'ホ',
        'ば': 'バ', 'び': 'ビ', 'ぶ': 'ブ', 'べ': 'ベ', 'ぼ': 'ボ',
        'ぱ': 'パ', 'ぴ': 'ピ', 'ぷ': 'プ', 'ぺ': 'ペ', 'ぽ': 'ポ',
        'ま': 'マ', 'み': 'ミ', 'む': 'ム', 'め': 'メ', 'も': 'モ',
        'や': 'ヤ', 'ゆ': 'ユ', 'よ': 'ヨ',
        'ら': 'ラ', 'り': 'リ', 'る': 'ル', 'れ': 'レ', 'ろ': 'ロ',
        'わ': 'ワ', 'を': 'ヲ', 'ん': 'ン',
        'ぁ': 'ァ', 'ぃ': 'ィ', 'ぅ': 'ゥ', 'ぇ': 'ェ', 'ぉ': 'ォ',
        'ゃ': 'ャ', 'ゅ': 'ュ', 'ょ': 'ョ',
        'っ': 'ッ'
    };

    return text.split('').map(char => katakanaMap[char] || char).join('');
};

interface CustomerDetailModalProps {
    customer: Customer | null;
    mode: 'view' | 'edit' | 'new';
    onClose: () => void;
    onSave: (customerData: Partial<Customer>) => Promise<void>;
    onSetMode: (mode: 'view' | 'edit' | 'new') => void;
    onAnalyzeCustomer: (customer: Customer) => void;
    isAIOff: boolean;
    initialValues?: Partial<Customer> | null;
    addToast: (message: string, type: Toast['type']) => void;
    currentUser?: EmployeeUser | null;
    onAutoCreateCustomer?: (data: Partial<Customer>) => Promise<Customer>;
    allUsers?: EmployeeUser[];
}

const TABS = [
    { id: 'basic', label: '基本情報' },
    { id: 'financial', label: '取引・財務情報' },
    { id: 'sales', label: '営業情報' },
    { id: 'notes', label: '備考・履歴' },
    { id: 'karte', label: 'お客様カルテ' },
];

const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({ customer, mode, onClose, onSave, onSetMode, onAnalyzeCustomer, isAIOff, initialValues, addToast, currentUser, onAutoCreateCustomer, allUsers = [] }) => {
    const [formData, setFormData] = useState<Partial<Customer>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState(TABS[0].id);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            mounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const formatDateForInput = (dateString: string | null | undefined) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toISOString().split('T')[0];
        } catch (e) {
            return '';
        }
    }

    useEffect(() => {
        if (mode === 'new') {
            setFormData(initialValues ? { ...initialValues } : {});
        } else if (customer) {
            const initialData = { ...customer };
            // Format date fields for input[type=date]
            initialData.foundationDate = formatDateForInput(initialData.foundationDate);
            initialData.startDate = formatDateForInput(initialData.startDate);
            initialData.endDate = formatDateForInput(initialData.endDate);
            initialData.drawingDate = formatDateForInput(initialData.drawingDate);
            setFormData(initialData);
        }
    }, [customer, mode, initialValues]);

    if (mode === 'view' && !customer) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        // 顧客名が変更されたらカタカナを自動生成
        if (name === 'customerName') {
            const katakanaValue = convertToKatakana(value);
            setFormData(prev => ({
                ...prev,
                [name]: value,
                customerNameKana: katakanaValue
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleApplyBusinessCard = (data: Partial<Customer>) => {
        setFormData(prev => ({ ...prev, ...data }));
        setActiveTab('basic');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.customerName) {
            setError('顧客名は必須項目です。');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await onSave(formData);
        } catch (err) {
            console.error(err);
            if (mounted.current) {
                setError('顧客情報の保存に失敗しました。入力内容とデータベース接続を確認してください。');
            }
        } finally {
            if (mounted.current) {
                setIsSubmitting(false);
            }
        }
    };

    const handleAnalyzeClick = () => {
        if (customer && mode === 'view') {
            onAnalyzeCustomer(customer);
        }
    }

    const isEditing = mode === 'edit' || mode === 'new';
    const title = mode === 'new' ? '新規顧客登録' : (mode === 'edit' ? '顧客情報の編集' : '顧客詳細');

    const formattedCurrency = (val: string | number | null | undefined) => {
        if (val === null || val === undefined) return '-';
        const num = typeof val === 'string' ? parseInt(val, 10) : val;
        return isNaN(num) ? '-' : `¥${num.toLocaleString()}`;
    };

    const userLookup = React.useMemo(() => {
        const map = new Map<string, EmployeeUser>();
        (allUsers || []).forEach(user => map.set(user.id, user));
        return map;
    }, [allUsers]);

    const resolveReceivedByLabel = (code?: string | null) => {
        if (!code) return '';
        const match = userLookup.get(code);
        if (match) {
            const dept = match.department ? ` / ${match.department}` : '';
            return `${match.name}${dept}`;
        }
        return code;
    };

    const renderField = (label: string, value: any, key: keyof Customer, type = 'text', options: { rows?: number, className?: string, autoComplete?: string } = {}) => {
        let displayValue = value;
        if (type === 'date' && value) {
            try {
                displayValue = new Date(value).toLocaleDateString('ja-JP');
            } catch (e) {
                displayValue = value; // Show original value if date is invalid
            }
        }

        const isReceivedByField = key === 'receivedByEmployeeCode';
        if (!isEditing && isReceivedByField) {
            const resolved = resolveReceivedByLabel(value);
            displayValue = resolved || value;
        }

        const inputClass = "block w-full rounded-md border-0 py-1.5 px-2.5 text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-base sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed";

        return (
            <div className={options.className || ''}>
                <label htmlFor={String(key)} className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">{label}</label>
                <div className="mt-1">
                    {isEditing ? (
                        type === 'textarea' ? (
                            <textarea
                                name={String(key)}
                                id={String(key)}
                                rows={options.rows || 3}
                                value={String(formData[key] ?? '')}
                                onChange={handleChange}
                                className={inputClass}
                                disabled={isSubmitting}
                                autoComplete={options.autoComplete || 'on'}
                            />
                        ) : isReceivedByField ? (
                            <>
                                <input
                                    type="text"
                                    name={String(key)}
                                    id={String(key)}
                                    list="received-by-users"
                                    value={String(formData[key] ?? '')}
                                    onChange={handleChange}
                                    className={inputClass}
                                    disabled={isSubmitting}
                                    autoComplete={options.autoComplete || 'on'}
                                    placeholder="社員ID (または選択)"
                                />
                                <datalist id="received-by-users">
                                    {(allUsers || []).map(user => (
                                        <option key={user.id} value={user.id} label={`${user.name}${user.department ? ` / ${user.department}` : ''}`} />
                                    ))}
                                </datalist>
                                {resolveReceivedByLabel(formData[key] as string) && (
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        表示名: {resolveReceivedByLabel(formData[key] as string)}
                                    </p>
                                )}
                            </>
                        ) : (
                            <input
                                type={type}
                                name={String(key)}
                                id={String(key)}
                                value={String(formData[key] ?? '')}
                                onChange={handleChange}
                                className={inputClass}
                                disabled={isSubmitting}
                                autoComplete={options.autoComplete || 'on'}
                            />
                        )
                    ) : (
                        <div className="text-base leading-6 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words min-h-[40px] flex items-center py-1.5">
                            {displayValue || '-'}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const Divider = () => <hr className="my-6 border-slate-200 dark:border-slate-700 md:col-span-2" />;

    const renderTabContent = () => {
        const gridClass = "grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4";

        switch (activeTab) {
            case 'basic': return (
                <div className={gridClass}>
                    {renderField('顧客名', customer?.customerName, 'customerName', 'text', { className: 'md:col-span-2', autoComplete: 'organization' })}
                    {renderField('顧客名 (カナ)', customer?.customerNameKana, 'customerNameKana', 'text', { className: 'md:col-span-2', autoComplete: 'organization' })}
                    <div className="md:col-span-2 flex items-center gap-2 py-2">
                        {isEditing ? (
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="is_customer_chart"
                                    checked={!!formData.is_customer_chart}
                                    onChange={(e) => setFormData(prev => ({ ...prev, is_customer_chart: e.target.checked }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                <span className="ml-3 text-sm font-medium text-slate-900 dark:text-slate-300">顧客カルテとして登録</span>
                            </label>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${customer?.is_customer_chart ? 'bg-purple-50 text-purple-700 ring-purple-700/10 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-50 text-blue-700 ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                                    {customer?.is_customer_chart ? '顧客カルテ' : '取引先'}
                                </span>
                            </div>
                        )}
                    </div>
                    {renderField('顧客コード', customer?.customerCode, 'customerCode', 'text', { autoComplete: 'off' })}
                    {renderField('顧客名2', customer?.name2, 'name2', 'text', { autoComplete: 'organization-title' })}
                    {renderField('取得イベント', customer?.businessEvent, 'businessEvent', 'text', { autoComplete: 'off' })}
                    {renderField('受領者（社員番号/氏名）', customer?.receivedByEmployeeCode, 'receivedByEmployeeCode', 'text', { autoComplete: 'off' })}

                    <Divider />

                    {renderField('代表者', customer?.representative, 'representative', 'text', { autoComplete: 'name' })}
                    {renderField('役職', customer?.representativeTitle, 'representativeTitle', 'text', { autoComplete: 'organization-title' })}
                    {renderField('電話番号', customer?.phoneNumber, 'phoneNumber', 'text', { autoComplete: 'tel' })}
                    {renderField('FAX', customer?.fax, 'fax', 'text', { autoComplete: 'fax' })}
                    {renderField('Webサイト', customer?.websiteUrl, 'websiteUrl', 'text', { autoComplete: 'url' })}
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">住所</label>
                        <div className="mt-1">
                            {isEditing ? (
                                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-700">
                                    <input type="text" name="zipCode" id="zipCode" placeholder="郵便番号" value={formData.zipCode || ''} onChange={handleChange} disabled={isSubmitting} className="block w-1/2 rounded-md border-0 py-1.5 px-2.5 text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-base disabled:opacity-50" autoComplete="postal-code" />
                                    <input type="text" name="address1" id="address1" placeholder="住所1" value={formData.address1 || ''} onChange={handleChange} disabled={isSubmitting} className="block w-full rounded-md border-0 py-1.5 px-2.5 text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-base disabled:opacity-50" autoComplete="address-line1" />
                                    <input type="text" name="address2" id="address2" placeholder="住所2" value={formData.address2 || ''} onChange={handleChange} disabled={isSubmitting} className="block w-full rounded-md border-0 py-1.5 px-2.5 text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-base disabled:opacity-50" autoComplete="address-line2" />
                                </div>
                            ) : (
                                <div className="text-base leading-6 text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words min-h-[40px] flex items-center py-1.5">
                                    {customer?.zipCode || customer?.address1 || customer?.address2 ? (
                                        <>
                                            {customer?.zipCode && `〒${customer.zipCode}`}
                                            <br />
                                            {`${customer?.address1 || ''}${customer?.address2 || ''}`}
                                        </>
                                    ) : '-'}
                                </div>
                            )}
                        </div>
                    </div>

                    <Divider />

                    {renderField('設立年月日', customer?.foundationDate, 'foundationDate', 'date')}
                    {renderField('資本金', customer?.capital, 'capital')}
                    {renderField('年商', isEditing ? customer?.annualSales : formattedCurrency(customer?.annualSales), 'annualSales')}
                    {renderField('従業員数', customer?.employeesCount, 'employeesCount')}
                    {renderField('事業内容', customer?.companyContent, 'companyContent', 'textarea', { className: 'md:col-span-2' })}
                </div>
            );
            case 'financial': return (
                <div className={gridClass}>
                    {renderField('顧客ランク', customer?.customerRank, 'customerRank')}
                    {renderField('顧客区分', customer?.customerDivision, 'customerDivision')}
                    {renderField('販売種別', customer?.salesType, 'salesType')}
                    {renderField('与信限度額', isEditing ? customer?.creditLimit : formattedCurrency(customer?.creditLimit), 'creditLimit')}
                    <Divider />
                    {renderField('締日', customer?.closingDay, 'closingDay')}
                    {renderField('支払日', customer?.payDay, 'payDay')}
                    {renderField('回収方法', customer?.recoveryMethod, 'recoveryMethod')}
                    {renderField('支払方法', customer?.payMoney, 'payMoney')}
                    <Divider />
                    {renderField('銀行名', customer?.bankName, 'bankName', 'text', { className: 'md:col-span-2' })}
                    {renderField('支店名', customer?.branchName, 'branchName')}
                    {renderField('口座番号', customer?.accountNo, 'accountNo')}
                </div>
            );
            case 'sales': return (
                <div className={gridClass}>
                    {renderField('営業担当者コード', customer?.salesUserCode, 'salesUserCode')}
                    {renderField('取引開始日', customer?.startDate, 'startDate', 'date')}
                    <Divider />
                    {renderField('営業目標', customer?.salesGoal, 'salesGoal', 'textarea', { className: 'md:col-span-2' })}
                    {renderField('営業アイデア', customer?.infoSalesIdeas, 'infoSalesIdeas', 'textarea', { rows: 5, className: 'md:col-span-2' })}
                    {renderField('要求事項', customer?.infoRequirements, 'infoRequirements', 'textarea', { rows: 5, className: 'md:col-span-2' })}
                </div>
            );
            case 'notes': return (
                <div className={gridClass}>
                    {renderField('備考', customer?.note, 'note', 'textarea', { rows: 5, className: 'md:col-span-2' })}
                    {renderField('営業活動', customer?.infoSalesActivity, 'infoSalesActivity', 'textarea', { rows: 5, className: 'md:col-span-2' })}
                    {renderField('情報履歴', customer?.infoHistory, 'infoHistory', 'textarea', { rows: 5, className: 'md:col-span-2' })}
                </div>
            );
            case 'karte':
                return (
                    <CustomerInfoForm customerId={customer?.id ?? null} onSaved={onClose} />
                );
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-[90vw] max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-700 dark:text-red-200">
                            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    <div className={`${mode === 'new' ? 'grid gap-6 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)] items-start' : ''}`}>
                        {mode === 'new' && (
                            <div className="order-2 lg:order-1 lg:sticky lg:top-6 lg:w-2/3">
                                
                            </div>
                        )}

                        <div className={`${mode === 'new' ? 'order-1 lg:order-2 lg:w-1/3' : ''}`}>
                            <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
                                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                                    {TABS.map(tab => (
                                        <button
                                            type="button"
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`${activeTab === tab.id
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'
                                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base`}
                                            aria-current={activeTab === tab.id ? 'page' : undefined}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </nav>
                            </div>
                            {renderTabContent()}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center gap-4 p-6 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <div className="flex gap-2">
                        {mode === 'view' && customer && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onSetMode('edit')}
                                    className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                                >
                                    <Pencil className="w-4 h-4" />
                                    編集
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAnalyzeClick}
                                    disabled={isAIOff}
                                    className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/50 disabled:opacity-50"
                                >
                                    <Lightbulb className="w-4 h-4" />
                                    AI企業分析
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex gap-4">
                        {isEditing ? (
                            <>
                                <button type="button" onClick={onClose} disabled={isSubmitting} className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold py-2 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50">キャンセル</button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-32 flex items-center justify-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-400"
                                >
                                    {isSubmitting ? <Loader className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" />保存</>}
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={onClose} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700">閉じる</button>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CustomerDetailModal;
