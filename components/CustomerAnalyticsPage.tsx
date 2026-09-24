import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Loader, Search, Trophy } from './Icons';

import {
  getCustomerSalesRankingsV2,
  getUsers,
  type CustomerSalesRankingV2,
} from '../services/dataService';

import type { EmployeeUser, Toast } from '../types';
import { formatJPY } from '../utils';

interface CustomerAnalyticsPageProps {
  addToast?: (message: string, type: Toast['type']) => void;

  /**
   * 顧客カルテ画面へ遷移させる場合に使用。
   * customer_uuid が渡されます。
   */
  onSelectCustomer?: (customerId: string) => void;
}

type PeriodPreset =
  | 'current_fiscal'
  | 'previous_fiscal'
  | 'current_month'
  | 'previous_month'
  | 'all'
  | 'custom';

interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

const PAGE_SIZE = 50;
const ALL_SALES_USER = '__all__';

/**
 * YYYY-MM-DD
 */
const toDateString = (
  year: number,
  monthIndex: number,
  day: number
): string => {
  const month = String(monthIndex + 1).padStart(2, '0');
  const date = String(day).padStart(2, '0');

  return `${year}-${month}-${date}`;
};

const getCurrentFiscalRange = (
  baseDate = new Date(),
  offset = 0
): DateRange => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  // 6月開始 / 翌年5月終了
  const fiscalStartYear =
    (month >= 5 ? year : year - 1) + offset;

  return {
    startDate: `${fiscalStartYear}-06-01`,
    endDate: `${fiscalStartYear + 1}-05-31`,
  };
};

const getCurrentMonthRange = (
  baseDate = new Date(),
  offset = 0
): DateRange => {
  const target = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() + offset,
    1
  );

  const year = target.getFullYear();
  const month = target.getMonth();

  const lastDay = new Date(
    year,
    month + 1,
    0
  ).getDate();

  return {
    startDate: toDateString(year, month, 1),
    endDate: toDateString(year, month, lastDay),
  };
};

const getRangeForPreset = (
  preset: PeriodPreset
): DateRange => {
  switch (preset) {
    case 'current_fiscal':
      return getCurrentFiscalRange(new Date(), 0);

    case 'previous_fiscal':
      return getCurrentFiscalRange(new Date(), -1);

    case 'current_month':
      return getCurrentMonthRange(new Date(), 0);

    case 'previous_month':
      return getCurrentMonthRange(new Date(), -1);

    case 'all':
      return {
        startDate: '2020-01-01',
        endDate: null,
      };

    case 'custom':
    default:
      return getCurrentFiscalRange(new Date(), 0);
  }
};

const formatDate = (
  value?: string | null
): string => {
  if (!value) return '—';

  const match = value
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return `${match[1]}/${match[2]}/${match[3]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('ja-JP');
};

const toNumber = (
  value: number | string | null | undefined
): number => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
};

const formatPercent = (
  value: number | string | null | undefined
): string => {
  if (
    value === null ||
    value === undefined
  ) {
    return '—';
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return '—';
  }

  return `${numberValue.toLocaleString('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
};

const periodButtonClass = (
  active: boolean
): string =>
  [
    'px-4',
    'py-2',
    'rounded-lg',
    'text-sm',
    'font-medium',
    'border',
    'transition-colors',
    active
      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700',
  ].join(' ');

const KpiCard: React.FC<{
  label: string;
  value: string;
  description?: string;
}> = ({
  label,
  value,
  description,
}) => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </div>

      {description && (
        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {description}
        </div>
      )}
    </div>
  );
};

const CustomerAnalyticsPage: React.FC<
  CustomerAnalyticsPageProps
> = ({
  addToast,
  onSelectCustomer,
}) => {
  const initialRange = useMemo(
    () => getCurrentFiscalRange(),
    []
  );

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>('current_fiscal');

  const [startDate, setStartDate] = useState<
    string | null
  >(initialRange.startDate);

  const [endDate, setEndDate] = useState<
    string | null
  >(initialRange.endDate);

  const [selectedSalesUserId, setSelectedSalesUserId] =
    useState<string>(ALL_SALES_USER);

  const [salesUsers, setSalesUsers] = useState<
    EmployeeUser[]
  >([]);

  const [rankings, setRankings] = useState<
    CustomerSalesRankingV2[]
  >([]);

  const [searchTerm, setSearchTerm] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [currentPage, setCurrentPage] =
    useState(1);

  const requestIdRef = useRef(0);

  /**
   * 営業担当一覧
   */
  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        const users = await getUsers();

        if (cancelled) return;

        const filtered = users
          .filter((user) => {
            const active =
              (user as any).isActive !== false &&
              (user as any).is_active !== false;

            return (
              active &&
              user.is_sales_user === true
            );
          })
          .sort((a, b) =>
            (a.name || '').localeCompare(
              b.name || '',
              'ja'
            )
          );

        setSalesUsers(filtered);
      } catch (e) {
        console.warn(
          '[CustomerAnalyticsPage] Failed to load sales users:',
          e
        );

        // ランキング自体は表示できるので、
        // 営業担当取得失敗では画面全体を止めない。
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * ランキング取得
   */
  const loadRankings = useCallback(
    async (
      targetStartDate = startDate,
      targetEndDate = endDate,
      targetSalesUserId = selectedSalesUserId
    ) => {
      if (
        targetStartDate &&
        targetEndDate &&
        targetStartDate > targetEndDate
      ) {
        setError(
          '開始日は終了日以前の日付を指定してください。'
        );
        setRankings([]);
        return;
      }

      const requestId =
        ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const data =
          await getCustomerSalesRankingsV2(
            targetStartDate,
            targetEndDate,
            targetSalesUserId ===
              ALL_SALES_USER
              ? null
              : targetSalesUserId
          );

        if (
          requestId !== requestIdRef.current
        ) {
          return;
        }

        setRankings(data || []);
      } catch (e) {
        if (
          requestId !== requestIdRef.current
        ) {
          return;
        }

        console.error(
          '[CustomerAnalyticsPage] Failed to load rankings:',
          e
        );

        const message =
          e instanceof Error
            ? e.message
            : 'ランキングデータの取得に失敗しました。';

        setError(message);
        setRankings([]);

        addToast?.(
          message,
          'error'
        );
      } finally {
        if (
          requestId === requestIdRef.current
        ) {
          setIsLoading(false);
        }
      }
    },
    [
      startDate,
      endDate,
      selectedSalesUserId,
      addToast,
    ]
  );

  useEffect(() => {
    loadRankings();

    setCurrentPage(1);
  }, [
    startDate,
    endDate,
    selectedSalesUserId,
    loadRankings,
  ]);

  /**
   * 期間ボタン
   */
  const handlePresetChange = (
    preset: PeriodPreset
  ) => {
    setPeriodPreset(preset);
    setCurrentPage(1);

    if (preset === 'custom') {
      return;
    }

    const range =
      getRangeForPreset(preset);

    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  /**
   * MQを表示できる期間か。
   *
   * 2020年より前を含む場合は、
   * 古い基幹データの変動費・margin品質が
   * 不十分なためMQを表示しない。
   */
  const isMqPeriodAvailable =
    startDate !== null &&
    startDate >= '2020-01-01';

  /**
   * 検索
   */
  const filteredRankings = useMemo(() => {
    const keyword = searchTerm
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (!keyword) {
      return rankings;
    }

    return rankings.filter((row) => {
      const name = (
        row.customer_name || ''
      )
        .normalize('NFKC')
        .toLowerCase();

      const code = (
        row.customer_code || ''
      )
        .normalize('NFKC')
        .toLowerCase();

      return (
        name.includes(keyword) ||
        code.includes(keyword)
      );
    });
  }, [rankings, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  /**
   * KPI
   *
   * 検索結果ではなく、
   * 選択期間・営業担当全体の数字。
   */
  const totals = useMemo(() => {
    const salesAmount =
      rankings.reduce(
        (sum, row) =>
          sum +
          toNumber(row.sales_amount),
        0
      );

    const invoiceCount =
      rankings.reduce(
        (sum, row) =>
          sum +
          toNumber(row.invoice_count),
        0
      );

    const mq =
      isMqPeriodAvailable
        ? rankings.reduce(
            (sum, row) =>
              sum +
              toNumber(row.mq),
            0
          )
        : null;

    const mqRate =
      mq !== null &&
      salesAmount !== 0
        ? (mq / salesAmount) * 100
        : null;

    return {
      customerCount: rankings.length,
      salesAmount,
      invoiceCount,
      mq,
      mqRate,
    };
  }, [
    rankings,
    isMqPeriodAvailable,
  ]);

  /**
   * ページング
   */
  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredRankings.length /
        PAGE_SIZE
    )
  );

  const safeCurrentPage = Math.min(
    currentPage,
    totalPages
  );

  const pageRows = useMemo(() => {
    const start =
      (safeCurrentPage - 1) *
      PAGE_SIZE;

    return filteredRankings.slice(
      start,
      start + PAGE_SIZE
    );
  }, [
    filteredRankings,
    safeCurrentPage,
  ]);

  const visibleStart =
    filteredRankings.length === 0
      ? 0
      : (safeCurrentPage - 1) *
          PAGE_SIZE +
        1;

  const visibleEnd = Math.min(
    safeCurrentPage * PAGE_SIZE,
    filteredRankings.length
  );

  const periodLabel = useMemo(() => {
  if (!startDate && !endDate) {
    return '全期間';
  }

  if (startDate && endDate) {
    return `${formatDate(startDate)} ～ ${formatDate(endDate)}`;
  }

  if (startDate && !endDate) {
    return `${formatDate(startDate)} ～`;
  }

  if (!startDate && endDate) {
    return `～ ${formatDate(endDate)}`;
  }

  return '';
}, [startDate, endDate]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
              <Trophy className="h-6 w-6 text-amber-500" />
              顧客カルテ / ランキング分析
            </h1>

            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              請求データを基準に、顧客別のPQ・MQ・構成比を分析します。
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadRankings()
            }
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {isLoading
              ? '読み込み中...'
              : '再読み込み'}
          </button>
        </div>
      </div>

      {/* Period */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={periodButtonClass(
              periodPreset ===
                'current_fiscal'
            )}
            onClick={() =>
              handlePresetChange(
                'current_fiscal'
              )
            }
          >
            当期
          </button>

          <button
            type="button"
            className={periodButtonClass(
              periodPreset ===
                'previous_fiscal'
            )}
            onClick={() =>
              handlePresetChange(
                'previous_fiscal'
              )
            }
          >
            前期
          </button>

          <button
            type="button"
            className={periodButtonClass(
              periodPreset ===
                'current_month'
            )}
            onClick={() =>
              handlePresetChange(
                'current_month'
              )
            }
          >
            当月
          </button>

          <button
            type="button"
            className={periodButtonClass(
              periodPreset ===
                'previous_month'
            )}
            onClick={() =>
              handlePresetChange(
                'previous_month'
              )
            }
          >
            前月
          </button>

          <button
            type="button"
            className={periodButtonClass(
              periodPreset === 'all'
            )}
            onClick={() =>
              handlePresetChange('all')
            }
          >
            全期間
          </button>

          <button
            type="button"
            className={periodButtonClass(
              periodPreset === 'custom'
            )}
            onClick={() =>
              handlePresetChange(
                'custom'
              )
            }
          >
            期間指定
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end">
          {/* Custom date */}
          {periodPreset ===
            'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-1 block text-xs text-slate-500">
                  開始日
                </span>

                <input
                  type="date"
                  value={
                    startDate || ''
                  }
                  onChange={(e) =>
                    setStartDate(
                      e.target.value ||
                        null
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>

              <span className="pb-2 text-slate-400">
                ～
              </span>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                <span className="mb-1 block text-xs text-slate-500">
                  終了日
                </span>

                <input
                  type="date"
                  value={
                    endDate || ''
                  }
                  onChange={(e) =>
                    setEndDate(
                      e.target.value ||
                        null
                    )
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
            </div>
          )}

          <div className="min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              営業担当
            </label>

            <select
              value={
                selectedSalesUserId
              }
              onChange={(e) =>
                setSelectedSalesUserId(
                  e.target.value
                )
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option
                value={ALL_SALES_USER}
              >
                全営業担当
              </option>

              {salesUsers.map(
                (user) => (
                  <option
                    key={user.id}
                    value={user.id}
                  >
                    {user.name}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              顧客検索
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }
                placeholder="顧客名・顧客コードで検索"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            対象期間：
            <strong className="ml-1 font-medium text-slate-700 dark:text-slate-200">
              {periodLabel}
            </strong>
          </span>

          {!isMqPeriodAvailable && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              ※ 2020年以前を含む期間ではMQを表示しません。
            </span>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="売上金額（PQ）"
          value={formatJPY(
            totals.salesAmount
          )}
          description={`${totals.customerCount.toLocaleString(
            'ja-JP'
          )}顧客`}
        />

        <KpiCard
          label="MQ"
          value={
            totals.mq === null
              ? '—'
              : formatJPY(
                  totals.mq
                )
          }
          description={
            isMqPeriodAvailable
              ? '基幹 margin を使用'
              : '2020年以前を含むため非表示'
          }
        />

        <KpiCard
          label="MQ率"
          value={
            totals.mqRate === null
              ? '—'
              : formatPercent(
                  totals.mqRate
                )
          }
          description="MQ ÷ PQ"
        />

        <KpiCard
          label="請求件数"
          value={`${totals.invoiceCount.toLocaleString(
            'ja-JP'
          )}件`}
          description={`${totals.customerCount.toLocaleString(
            'ja-JP'
          )}顧客`}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Ranking */}
      <div className="min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              顧客別売上ランキング
            </h2>

            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              売上金額（PQ）の降順
            </div>
          </div>

          <div className="text-sm text-slate-500 dark:text-slate-400">
            {searchTerm ? (
              <>
                表示{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {filteredRankings.length}
                </strong>{' '}
                / 全{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {rankings.length}
                </strong>{' '}
                顧客
              </>
            ) : (
              <>
                全{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {rankings.length}
                </strong>{' '}
                顧客
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="flex items-center gap-3 text-slate-500">
              <Loader className="h-7 w-7 animate-spin text-blue-500" />
              ランキングデータを読み込み中...
            </div>
          </div>
        ) : filteredRankings.length ===
          0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <Trophy className="mb-3 h-10 w-10 text-slate-300" />

            <div className="font-medium text-slate-700 dark:text-slate-200">
              ランキングデータがありません
            </div>

            <div className="mt-1 text-sm text-slate-500">
              期間・営業担当・検索条件を変更して確認してください。
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <tr>
                    <th className="w-20 px-4 py-3 text-center font-medium">
                      順位
                    </th>

                    <th className="px-4 py-3 text-left font-medium">
                      顧客
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      件数
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      売上金額（PQ）
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      MQ
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      MQ率
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      構成比
                    </th>

                    <th className="px-4 py-3 text-center font-medium">
                      最終売上日
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {pageRows.map(
                    (row) => {
                      const canShowMq =
                        isMqPeriodAvailable &&
                        row.mq_available;

                      return (
                        <tr
                          key={
                            row.customer_uuid
                          }
                          onClick={() =>
                            onSelectCustomer?.(
                              row.customer_uuid
                            )
                          }
                          className={[
                            'transition-colors',
                            onSelectCustomer
                              ? 'cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-700/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/30',
                          ].join(
                            ' '
                          )}
                        >
                          <td className="px-4 py-3 text-center">
                            {row.rank ===
                            1 ? (
                              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-100 font-bold text-amber-700">
                                1
                              </div>
                            ) : row.rank ===
                              2 ? (
                              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-600">
                                2
                              </div>
                            ) : row.rank ===
                              3 ? (
                              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-orange-100 font-bold text-orange-700">
                                3
                              </div>
                            ) : (
                              <span className="font-semibold text-slate-500">
                                {
                                  row.rank
                                }
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {row.customer_name ||
                                '顧客名未設定'}
                            </div>

                            <div className="mt-0.5 text-xs text-slate-400">
                              顧客コード：
                              {row.customer_code ||
                                '—'}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {toNumber(
                              row.invoice_count
                            ).toLocaleString(
                              'ja-JP'
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {formatJPY(
                              toNumber(
                                row.sales_amount
                              )
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {canShowMq
                              ? formatJPY(
                                  toNumber(
                                    row.mq
                                  )
                                )
                              : '—'}
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {canShowMq
                              ? formatPercent(
                                  row.mq_rate
                                )
                              : '—'}
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {formatPercent(
                              row.composition_rate
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                            {formatDate(
                              row.last_sales_date
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {visibleStart.toLocaleString(
                  'ja-JP'
                )}
                -
                {visibleEnd.toLocaleString(
                  'ja-JP'
                )}
                件 / 全
                {filteredRankings.length.toLocaleString(
                  'ja-JP'
                )}
                件
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    safeCurrentPage <= 1
                  }
                  onClick={() =>
                    setCurrentPage(
                      Math.max(
                        1,
                        safeCurrentPage -
                          1
                      )
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  前へ
                </button>

                <span className="min-w-[90px] text-center text-sm text-slate-600 dark:text-slate-300">
                  {safeCurrentPage} /{' '}
                  {totalPages}
                </span>

                <button
                  type="button"
                  disabled={
                    safeCurrentPage >=
                    totalPages
                  }
                  onClick={() =>
                    setCurrentPage(
                      Math.min(
                        totalPages,
                        safeCurrentPage +
                          1
                      )
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  次へ
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CustomerAnalyticsPage;