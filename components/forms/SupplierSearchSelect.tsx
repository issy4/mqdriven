import React, { useEffect, useMemo, useState } from 'react';
import { PaymentRecipient } from '../../types';
import { normalizeSearchText } from '../../utils';

const DEFAULT_LIMIT = 20;

type SupplierSearchSelectProps = {
    suppliers: PaymentRecipient[];
    value?: string;
    searchHint?: string;
    onChange: (id: string, supplier?: PaymentRecipient | null) => void;
    onCreateSupplier?: (name: string) => Promise<PaymentRecipient>;
    disabled?: boolean;
    required?: boolean;
    highlightRequired?: boolean;
    name?: string;
    id?: string;
    placeholder?: string;
};

const formatSupplierLabel = (supplier: PaymentRecipient): string => {
    const company = supplier.companyName || supplier.recipientName || '名称未設定';
    const code = supplier.recipientCode ? `（${supplier.recipientCode}）` : '';
    return `${company}${code}`;
};

const SupplierSearchSelect: React.FC<SupplierSearchSelectProps> = ({
    suppliers,
    value,
    onChange,
    onCreateSupplier,
    disabled,
    required,
    highlightRequired = false,
    name = 'paymentRecipientId',
    id = 'paymentRecipientId',
    placeholder = 'サプライヤー名 / コードで検索',
    searchHint,
}) => {
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [limit, setLimit] = useState(DEFAULT_LIMIT);
    const [isCreating, setIsCreating] = useState(false);
    const [createdSuppliers, setCreatedSuppliers] = useState<PaymentRecipient[]>([]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 200);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        setLimit(DEFAULT_LIMIT);
    }, [debouncedQuery]);

    const allSuppliers = useMemo(() => {
        const map = new Map<string, PaymentRecipient>();

        suppliers.forEach(supplier => {
            if (supplier.id) {
                map.set(supplier.id, supplier);
            }
        });

        createdSuppliers.forEach(supplier => {
            if (supplier.id) {
                map.set(supplier.id, supplier);
            }
        });

        return Array.from(map.values());
    }, [suppliers, createdSuppliers]);

    const selectedSupplier = useMemo(
        () => allSuppliers.find(supplier => supplier.id === value) ?? null,
        [allSuppliers, value]
    );

    useEffect(() => {
        if (selectedSupplier) {
            setQuery(formatSupplierLabel(selectedSupplier));
        } else if (!value) {
            setQuery(searchHint || '');
        }
    }, [selectedSupplier, value, searchHint]);

    const normalizedQuery = normalizeSearchText(debouncedQuery);

    const { visibleSuppliers, hasMore, totalMatched } = useMemo(() => {
        if (!normalizedQuery) {
            return {
                visibleSuppliers: allSuppliers.slice(0, limit),
                hasMore: allSuppliers.length > limit,
                totalMatched: allSuppliers.length,
            };
        }

        const prefix: PaymentRecipient[] = [];
        const partial: PaymentRecipient[] = [];

        allSuppliers.forEach(supplier => {
            const target = normalizeSearchText(
                [
                    supplier.companyName,
                    supplier.recipientName,
                    supplier.recipientCode,
                ]
                    .filter(Boolean)
                    .join(' ')
            );

            if (target.startsWith(normalizedQuery)) {
                prefix.push(supplier);
            } else if (target.includes(normalizedQuery)) {
                partial.push(supplier);
            }
        });

        const combined = [...prefix, ...partial];

        return {
            visibleSuppliers: combined.slice(0, limit),
            hasMore: combined.length > limit,
            totalMatched: combined.length,
        };
    }, [allSuppliers, normalizedQuery, limit]);

    const selectClass = [
        'w-full text-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500',
        highlightRequired
            ? 'border-rose-300 bg-rose-50/70 focus:ring-rose-500 focus:border-rose-500 dark:bg-rose-500/10 dark:border-rose-400'
            : '',
    ]
        .filter(Boolean)
        .join(' ');

    const inputClass = [
        'w-full text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500',
        highlightRequired
            ? 'border-rose-300 bg-rose-50/70 focus:ring-rose-500 focus:border-rose-500 dark:bg-rose-500/10 dark:border-rose-400'
            : '',
    ]
        .filter(Boolean)
        .join(' ');

    const handleCreateSupplier = async () => {
        const nameToCreate = query.trim();

        if (!onCreateSupplier || !nameToCreate) return;

        setIsCreating(true);

        try {
            const created = await onCreateSupplier(nameToCreate);

            setCreatedSuppliers(prev => {
                const exists = prev.some(supplier => supplier.id === created.id);
                return exists ? prev : [created, ...prev];
            });

            setQuery(formatSupplierLabel(created));
            setDebouncedQuery(formatSupplierLabel(created));
            onChange(created.id, created);
        } catch (error) {
            console.error('[SupplierSearchSelect] Failed to create supplier:', error);
            alert('支払先の登録に失敗しました。');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="space-y-1">
            <input
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                className={inputClass}
                placeholder={placeholder}
                disabled={disabled || isCreating}
                autoComplete="off"
            />

            <select
                id={id}
                name={name}
                value={value ?? ''}
                required={required}
                onChange={event => {
                    const supplier =
                        allSuppliers.find(s => s.id === event.target.value) ?? null;

                    onChange(event.target.value, supplier);
                }}
                disabled={disabled || isCreating}
                className={selectClass}
            >
                <option value="">支払先を選択</option>

                {selectedSupplier &&
                    !visibleSuppliers.some(supplier => supplier.id === selectedSupplier.id) && (
                        <option value={selectedSupplier.id}>
                            {formatSupplierLabel(selectedSupplier)}
                        </option>
                    )}

                {visibleSuppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                        {formatSupplierLabel(supplier)}
                    </option>
                ))}
            </select>

            {!disabled && !selectedSupplier && normalizedQuery && visibleSuppliers.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    候補が見つかりません。
                </p>
            )}

            {!disabled && normalizedQuery && totalMatched > 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    {totalMatched.toLocaleString('ja-JP')} 件中
                    {visibleSuppliers.length.toLocaleString('ja-JP')} 件を表示
                </p>
            )}

            {hasMore && (
                <button
                    type="button"
                    onClick={() => setLimit(prev => prev + DEFAULT_LIMIT)}
                    className="text-xs text-blue-600 hover:text-blue-700"
                    disabled={disabled || isCreating}
                >
                    さらに表示
                </button>
            )}

            {onCreateSupplier && !selectedSupplier && (
                <button
                    type="button"
                    onClick={handleCreateSupplier}
                    disabled={disabled || isCreating || !query.trim()}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                >
                    {isCreating ? '登録中...' : 'この名前で支払先を登録'}
                </button>
            )}
        </div>
    );
};

export default SupplierSearchSelect;