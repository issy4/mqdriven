import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Search, Target, TrendingUp, ClipboardList, BarChart3, Plus, Edit2, Check, X } from 'lucide-react';
import {
  EmployeeUser,
  Toast,
  OrderLedgerRow,
  MonthlyOrderDashboardRow,
  MonthlyOrderUserDashboardRow,
  MonthlyOrderCustomerRankingRow,
  SalesTargetUser,
  SalesAnnualTarget,
} from '../../types';
import {
  getOrderLedger,
  getMonthlyOrderDashboard,
  getMonthlyOrderDashboardByUser,
  getMonthlyOrderCustomerRanking,
  getSalesTargetUsers,
  saveSalesTarget,
  getSalesAnnualTargets,
  saveSalesAnnualTarget,
} from '../../services/dataService';
import { formatJPY } from '../../utils';

interface OrderLedgerManagementPageProps {
  currentUser: EmployeeUser | null;
  onToast?: (message: string, type: Toast['type']) => void;
}

type TabKey = 'ledger' | 'monthly' | 'by_user' | 'customer_ranking';

const SALES_ALL = '__all__';
const LEDGER_PAGE_SIZE = 50;
const RANKING_INITIAL = 30;

const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7);

const getFiscalYearFromMonth = (month: string): number => {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);

  return monthNumber >= 6 ? year : year - 1;
};

const formatDateDisplay = (value?: string | null): string => {
  if (!value) return '未設定';
  const text = String(value).trim();
  if (!text) return '未設定';
  const normalized = text.replace(/\//g, '-').slice(0, 10);
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '未設定';
  const y = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${y}/${mm}/${dd}`;
};

const formatMonthLabel = (month: string): string => {
  const [y, m] = month.split('-');
  if (!y || !m) return month;
  return `${y}年${Number(m)}月`;
};

// 当月から過去 n か月分の YYYY-MM を新しい順で返す
const getRecentMonths = (baseMonth: string, count: number): string[] => {
  const [yStr, mStr] = baseMonth.split('-');
  const year = Number(yStr);
  const mon = Number(mStr);
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, mon - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
};

const achievementColorClass = (rate: number | null | undefined): string => {
  if (rate === null || rate === undefined) return 'text-slate-400';
  if (rate >= 100) return 'text-emerald-600';
  if (rate < 70) return 'text-rose-600';
  return 'text-amber-600';
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  icon: React.ElementType;
  accent: string;
  footer?: React.ReactNode;
}> = ({ label, value, icon: Icon, accent, footer }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex flex-col">
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`w-9 h-9 flex items-center justify-center rounded-md ${accent}`}>
        <Icon className="w-5 h-5" />
      </span>
    </div>
    <div className="mt-2 text-2xl font-bold text-slate-800 tabular-nums">{value}</div>
    {footer && <div className="mt-1 text-sm">{footer}</div>}
  </div>
);

const OrderLedgerManagementPage: React.FC<OrderLedgerManagementPageProps> = ({ currentUser, onToast }) => {
  const canEditTargets =
    currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [salesUserId, setSalesUserId] = useState<string>(SALES_ALL);

  const fiscalYear = useMemo(() => getFiscalYearFromMonth(month), [month]);

  const [keywordInput, setKeywordInput] = useState<string>('');
  const [appliedKeyword, setAppliedKeyword] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('ledger');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ledger, setLedger] = useState<OrderLedgerRow[]>([]);
  const [dashboard, setDashboard] = useState<MonthlyOrderDashboardRow | null>(null);
  const [byUser, setByUser] = useState<MonthlyOrderUserDashboardRow[]>([]);
  const [ranking, setRanking] = useState<MonthlyOrderCustomerRankingRow[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyOrderDashboardRow[]>([]);
  const [targetUsers, setTargetUsers] = useState<SalesTargetUser[]>([]);

  const [annualTargets, setAnnualTargets] = useState<SalesAnnualTarget[]>([]);
  const [annualEditUserId, setAnnualEditUserId] = useState<string | null>(null);
  const [annualEditAmount, setAnnualEditAmount] = useState<string>('');
  const [annualEditNote, setAnnualEditNote] = useState<string>('');

  const [ledgerVisible, setLedgerVisible] = useState<number>(LEDGER_PAGE_SIZE);
  const [rankingVisible, setRankingVisible] = useState<number>(RANKING_INITIAL);

  // 営業別実績タブ：編集状態
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 営業担当追加
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [addUserId, setAddUserId] = useState<string>('');
  const [addAmount, setAddAmount] = useState<string>('');
  const [addNote, setAddNote] = useState<string>('');

  const selectedSalesId = salesUserId === SALES_ALL ? undefined : salesUserId;

  const loadData = useCallback(async (keyword: string) => {
    setIsLoading(true);
    try {
      const trendMonths = getRecentMonths(month, 12);
      const [ledgerData, dashboardData, byUserData, rankingData, trendData] = await Promise.all([
        getOrderLedger({ month, salesUserId: selectedSalesId, keyword }),
        getMonthlyOrderDashboard(month),
        getMonthlyOrderDashboardByUser(month),
        getMonthlyOrderCustomerRanking(month, selectedSalesId),
        Promise.all(trendMonths.map(m => getMonthlyOrderDashboard(m))),
      ]);
      setLedger(ledgerData);
      setDashboard(dashboardData);
      setByUser(byUserData);
      setRanking(rankingData);
      setMonthlyTrend(trendData);
      setLedgerVisible(LEDGER_PAGE_SIZE);
      setRankingVisible(RANKING_INITIAL);
    } catch (err) {
      console.error('[OrderLedger] load failed:', err);
      onToast?.('データの取得に失敗しました。', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [month, selectedSalesId, onToast]);

  // 対象月・営業担当変更時に自動再読込
  useEffect(() => {
    loadData(appliedKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, salesUserId]);

  // 営業担当候補の取得
  useEffect(() => {
    getSalesTargetUsers()
      .then(setTargetUsers)
      .catch(err => {
        console.error('[OrderLedger] failed to load target users:', err);
      });
  }, []);

  // 年間目標の取得
useEffect(() => {
  getSalesAnnualTargets(fiscalYear)
    .then(setAnnualTargets)
    .catch(err => {
      console.error('[OrderLedger] failed to load annual targets:', err);
      onToast?.('年間目標の取得に失敗しました。', 'error');
    });
}, [fiscalYear, onToast]);

  const handleSearch = () => {
    setAppliedKeyword(keywordInput);
    loadData(keywordInput);
  };

  const handleRefresh = () => {
    setAppliedKeyword(keywordInput);
    loadData(keywordInput);
  };

  // --- KPI算出 ---
  const kpi = useMemo(() => {
    if (selectedSalesId) {
      const row = byUser.find(u => u.user_id === selectedSalesId);
      const actual = row?.actual_amount ?? 0;
      const count = row?.order_count ?? 0;
      const target = row?.target_amount ?? null;
      const rate = target && target > 0 ? (actual / target) * 100 : null;
      const gap = target !== null ? actual - target : null;
      return { actual, count, target, rate, gap };
    }
    const actual = dashboard?.actual_amount ?? 0;
    const count = dashboard?.order_count ?? 0;
    const targetSum = byUser.reduce((sum, u) => sum + (u.target_amount ?? 0), 0);
    const target = targetSum > 0 ? targetSum : null;
    const rate = target && target > 0 ? (actual / target) * 100 : null;
    const gap = target !== null ? actual - target : null;
    return { actual, count, target, rate, gap };
  }, [selectedSalesId, byUser, dashboard]);

  const ledgerTotal = useMemo(
    () => ledger.reduce((sum, row) => sum + (row.order_amount_ex_tax ?? row.order_amount_for_report ?? 0), 0),
    [ledger],
  );

  // 月別集計（古い順に並べ、前月比を算出）
  const monthlyRows = useMemo(() => {
    const ordered = [...monthlyTrend].reverse(); // 古い→新しい
    return ordered.map((row, idx) => {
      const prev = idx > 0 ? ordered[idx - 1] : null;
      let momText = '—';
      if (prev && prev.actual_amount > 0) {
        const mom = ((row.actual_amount - prev.actual_amount) / prev.actual_amount) * 100;
        momText = `${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%`;
      }
      return { ...row, momText };
    });
  }, [monthlyTrend]);

  const monthlyMax = useMemo(
    () => Math.max(1, ...monthlyRows.map(r => r.actual_amount)),
    [monthlyRows],
  );

  // 営業担当追加候補（現在の一覧に表示されている担当者を除外）
  const addableUsers = useMemo(() => {
    const existing = new Set(byUser.map(u => u.user_id));
    return targetUsers.filter(u => !existing.has(u.user_id));
  }, [targetUsers, byUser]);

  const startEdit = (row: MonthlyOrderUserDashboardRow) => {
    setEditingUserId(row.user_id);
    setEditAmount(row.target_amount !== null && row.target_amount !== undefined ? String(row.target_amount) : '');
    setEditNote(row.target_note ?? '');
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditAmount('');
    setEditNote('');
  };

  const reloadAfterSave = async () => {
    try {
      const [byUserData, dashboardData, rankingData] = await Promise.all([
        getMonthlyOrderDashboardByUser(month),
        getMonthlyOrderDashboard(month),
        getMonthlyOrderCustomerRanking(month, selectedSalesId),
      ]);
      setByUser(byUserData);
      setDashboard(dashboardData);
      setRanking(rankingData);
    } catch (err) {
      console.error('[OrderLedger] reload after save failed:', err);
    }
  };

  const handleSaveTarget = async (userId: string, amountStr: string, note: string) => {
    setIsSaving(true);
    try {
      const numeric = Number(String(amountStr).replace(/[^\d.-]/g, ''));
      const targetAmount = Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
      await saveSalesTarget({
        month,
        userId,
        targetAmount,
        note: note.trim() ? note.trim() : null,
        createdBy: currentUser?.id ?? null,
      });
      await reloadAfterSave();
      onToast?.('営業目標を保存しました。', 'success');
      return true;
    } catch (err) {
      console.error('[OrderLedger] save target failed:', err);
      onToast?.('営業目標の保存に失敗しました。', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const submitEdit = async (userId: string) => {
    const ok = await handleSaveTarget(userId, editAmount, editNote);
    if (ok) cancelEdit();
  };

  const submitAdd = async () => {
    if (!addUserId) {
      onToast?.('営業担当を選択してください。', 'warning');
      return;
    }
    const ok = await handleSaveTarget(addUserId, addAmount, addNote);
    if (ok) {
      setIsAdding(false);
      setAddUserId('');
      setAddAmount('');
      setAddNote('');
    }
  };

  const getAnnualTargetForUser = (userId: string): SalesAnnualTarget | undefined =>
  annualTargets.find(target => target.user_id === userId);

const startAnnualEdit = (userId: string) => {
  const current = getAnnualTargetForUser(userId);

  setAnnualEditUserId(userId);
  setAnnualEditAmount(
    current ? String(current.annual_target_amount) : '',
  );
  setAnnualEditNote(current?.note ?? '');
};

const cancelAnnualEdit = () => {
  setAnnualEditUserId(null);
  setAnnualEditAmount('');
  setAnnualEditNote('');
};

const saveAnnualTarget = async (userId: string) => {
  setIsSaving(true);

  try {
    const numeric = Number(
      String(annualEditAmount).replace(/[^\d.-]/g, ''),
    );

    const annualTargetAmount =
      Number.isFinite(numeric) && numeric > 0
        ? Math.round(numeric)
        : 0;

    await saveSalesAnnualTarget({
      fiscalYear,
      userId,
      annualTargetAmount,
      note: annualEditNote.trim() || null,
      createdBy: currentUser?.id ?? null,
    });

    const refreshedAnnualTargets = await getSalesAnnualTargets(fiscalYear);
    setAnnualTargets(refreshedAnnualTargets);

    await reloadAfterSave();

    onToast?.(
      `${fiscalYear}年度の年間目標を保存しました。`,
      'success',
    );

    cancelAnnualEdit();
  } catch (err) {
    console.error('[OrderLedger] save annual target failed:', err);
    onToast?.('年間目標の保存に失敗しました。', 'error');
  } finally {
    setIsSaving(false);
  }
};

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'ledger', label: '受注台帳', icon: ClipboardList },
    { key: 'monthly', label: '月別集計', icon: BarChart3 },
    { key: 'by_user', label: '営業別実績', icon: Target },
    { key: 'customer_ranking', label: '顧客別ランキング', icon: TrendingUp },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-slate-50 min-h-full">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">受注台帳・目標管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          税抜受注金額を基準に、月次受注実績・営業目標・顧客別受注状況を確認します。
        </p>
      </div>

      {/* フィルター */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-slate-500 mb-1">対象月</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || getCurrentMonth())}
              className="h-9 px-3 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-slate-500 mb-1">営業担当</label>
            <select
              value={salesUserId}
              onChange={(e) => setSalesUserId(e.target.value)}
              className="h-9 px-3 border border-slate-300 rounded-md text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[180px]"
            >
              <option value={SALES_ALL}>全営業担当</option>
              {targetUsers.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500 mb-1">キーワード（受注番号・顧客名・案件名）</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="検索キーワードを入力"
                className="h-9 w-full pl-8 pr-3 border border-slate-300 rounded-md text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-9 px-4 inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            更新
          </button>
        </div>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="受注金額"
          value={formatJPY(kpi.actual)}
          icon={TrendingUp}
          accent="bg-teal-50 text-teal-700"
        />
        <KpiCard
          label="受注件数"
          value={`${kpi.count.toLocaleString('ja-JP')} 件`}
          icon={ClipboardList}
          accent="bg-blue-50 text-blue-700"
        />
        <KpiCard
          label="目標額"
          value={kpi.target !== null ? formatJPY(kpi.target) : '未設定'}
          icon={Target}
          accent="bg-amber-50 text-amber-700"
          footer={
  kpi.target !== null && kpi.gap !== null ? (
    kpi.gap > 0 ? (
      <span className="text-emerald-600 font-medium">
        超過 +{formatJPY(kpi.gap)}
      </span>
    ) : kpi.gap < 0 ? (
      <span className="text-rose-600 font-medium">
        不足 -{formatJPY(Math.abs(kpi.gap))}
      </span>
    ) : (
      <span className="text-slate-600 font-medium">
        目標達成 ¥0
      </span>
    )
  ) : (
    <span className="text-slate-400">差額 —</span>
  )
}
        />
        <KpiCard
          label="達成率"
          value={kpi.rate !== null ? `${kpi.rate.toFixed(1)}%` : '—'}
          icon={BarChart3}
          accent="bg-emerald-50 text-emerald-700"
        />
      </div>

      {/* タブ */}
      <div className="border-b border-slate-200">
        <nav className="flex flex-wrap gap-1" role="tablist">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-teal-700 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        {activeTab === 'ledger' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
  <span className="text-sm text-slate-600">
    全 {ledger.length.toLocaleString('ja-JP')} 件中
    {Math.min(ledgerVisible, ledger.length).toLocaleString('ja-JP')} 件を表示
  </span>
  <span className="text-sm font-semibold text-slate-700">
    税抜合計：{formatJPY(ledgerTotal)}
  </span>
</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-left">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">受注日</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">受注番号</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">顧客名</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">案件名</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">営業担当</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">納期</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">税抜受注額</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        {isLoading ? '読み込み中...' : '該当する受注がありません。'}
                      </td>
                    </tr>
                  )}
                  {ledger.slice(0, ledgerVisible).map((row, idx) => (
                    <tr key={`${row.project_uuid}-${row.order_id ?? idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateDisplay(row.order_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">{row.order_code || '未設定'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.customer_name || '未設定'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.project_name || '未設定'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.sales_user_name || '未設定'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDateDisplay(row.order_delivery_date ?? row.delivery_date ?? row.project_delivery_date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800 font-medium">
                        {formatJPY(row.order_amount_ex_tax ?? row.order_amount_for_report ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ledgerVisible < ledger.length && (
              <div className="px-4 py-3 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setLedgerVisible(v => v + LEDGER_PAGE_SIZE)}
                  className="px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                >
                  さらに表示（残り {ledger.length - ledgerVisible} 件）
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">月</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">受注額</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">受注件数</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">前月比</th>
                  <th className="px-3 py-2 font-medium w-1/3">推移</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      {isLoading ? '読み込み中...' : 'データがありません。'}
                    </td>
                  </tr>
                )}
                {[...monthlyRows].reverse().map((row) => {
                  const widthPct = Math.round((row.actual_amount / monthlyMax) * 100);
                  const isPositive = row.momText.startsWith('+');
                  const isNegative = row.momText.startsWith('-');
                  return (
                    <tr key={row.target_month} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">{formatMonthLabel(row.target_month)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800">{formatJPY(row.actual_amount)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-600">{row.order_count.toLocaleString('ja-JP')}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium ${isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-slate-400'}`}>
                        {row.momText}
                      </td>
                      <td className="px-3 py-2">
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600 rounded-full" style={{ width: `${widthPct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'by_user' && (
          <div>
            {canEditTargets && (
              <div className="flex items-center justify-end px-4 py-3 border-b border-slate-100">
                {!isAdding ? (
                  <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    営業担当を追加
                  </button>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <select
                      value={addUserId}
                      onChange={(e) => setAddUserId(e.target.value)}
                      className="h-9 px-2 border border-slate-300 rounded-md text-sm bg-white min-w-[150px]"
                    >
                      <option value="">担当者を選択</option>
                      {addableUsers.map(u => (
                        <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      placeholder="目標額"
                      className="h-9 px-2 border border-slate-300 rounded-md text-sm w-32 text-right"
                    />
                    <input
                      type="text"
                      value={addNote}
                      onChange={(e) => setAddNote(e.target.value)}
                      placeholder="備考"
                      className="h-9 px-2 border border-slate-300 rounded-md text-sm w-40"
                    />
                    <button
                      type="button"
                      onClick={submitAdd}
                      disabled={isSaving}
                      className="h-9 px-3 inline-flex items-center gap-1 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold rounded-md"
                    >
                      <Check className="w-4 h-4" />保存
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAdding(false); setAddUserId(''); setAddAmount(''); setAddNote(''); }}
                      className="h-9 px-3 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-md"
                    >
                      <X className="w-4 h-4" />キャンセル
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-left">
                    <th className="px-3 py-2 font-medium whitespace-nowrap">営業担当</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">実績</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">受注件数</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">目標</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">差額</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">達成率</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">備考</th>
                    {canEditTargets && <th className="px-3 py-2 font-medium whitespace-nowrap">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {byUser.length === 0 && (
                    <tr>
                      <td colSpan={canEditTargets ? 8 : 7} className="px-3 py-8 text-center text-slate-400">
                        {isLoading ? '読み込み中...' : 'データがありません。'}
                      </td>
                    </tr>
                  )}
                  {byUser.map(row => {
                    const target = row.target_amount ?? null;
                    const rate = target && target > 0 ? (row.actual_amount / target) * 100 : null;
                    const gap = target !== null ? row.actual_amount - target : null;

                    const annualTarget = getAnnualTargetForUser(row.user_id);
                    const isAnnualEditing = annualEditUserId === row.user_id;

                    const annualAmount = annualTarget?.annual_target_amount ?? null;
                    const monthlyAutoTarget =
                      annualAmount !== null
                        ? Math.round(annualAmount / 12)
                        : null;

                    return (
                      <tr key={row.user_id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-medium">{row.user_name || '未設定'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800">{formatJPY(row.actual_amount)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-600">{row.order_count.toLocaleString('ja-JP')}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-700">
  {isAnnualEditing ? (
    <input
      type="number"
      min={0}
      value={annualEditAmount}
      onChange={(e) => setAnnualEditAmount(e.target.value)}
      placeholder="年間目標"
      className="h-8 px-2 border border-slate-300 rounded-md text-sm w-32 text-right"
    />
  ) : (
    <div>
      <div>{target !== null ? formatJPY(target) : '未設定'}</div>
      {annualAmount !== null && (
        <div className="mt-0.5 text-xs text-slate-400">
          年間 {formatJPY(annualAmount)}
        </div>
      )}
    </div>
  )}
</td>
                        <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                          {gap === null ? (
  <span className="text-slate-400">—</span>
) : gap > 0 ? (
  <span className="text-emerald-600 font-medium">
    +{formatJPY(gap)}
  </span>
) : gap < 0 ? (
  <span className="text-rose-600 font-medium">
    -{formatJPY(Math.abs(gap))}
  </span>
) : (
  <span className="text-slate-600 font-medium">
    ¥0
  </span>
)}
                        </td>
                        <td className={`px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium ${achievementColorClass(rate)}`}>
                          {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
  {isAnnualEditing ? (
    <input
      type="text"
      value={annualEditNote}
      onChange={(e) => setAnnualEditNote(e.target.value)}
      placeholder="年間目標の備考"
      className="h-8 px-2 border border-slate-300 rounded-md text-sm w-40"
    />
  ) : (
    annualTarget?.note ||
    row.target_note ||
    '—'
  )}
</td>
                        {canEditTargets && (
                          <td className="px-3 py-2 whitespace-nowrap">
  {isAnnualEditing ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => saveAnnualTarget(row.user_id)}
        disabled={isSaving}
        className="px-2 py-1 inline-flex items-center gap-1 bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold rounded"
      >
        <Check className="w-3.5 h-3.5" />
        保存
      </button>

      <button
        type="button"
        onClick={cancelAnnualEdit}
        className="px-2 py-1 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded"
      >
        <X className="w-3.5 h-3.5" />
        取消
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => startAnnualEdit(row.user_id)}
      className="px-2 py-1 inline-flex items-center gap-1 text-teal-700 hover:bg-teal-50 text-xs font-medium rounded"
    >
      <Edit2 className="w-3.5 h-3.5" />
      年間目標を編集
    </button>
  )}
</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!canEditTargets && (
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">閲覧のみ</div>
            )}
          </div>
        )}

        {activeTab === 'customer_ranking' && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-left">
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">順位</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">顧客コード</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">顧客名</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">営業担当</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">受注額</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">件数</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        {isLoading ? '読み込み中...' : 'データがありません。'}
                      </td>
                    </tr>
                  )}
                  {ranking.slice(0, rankingVisible).map((row, idx) => (
                    <tr key={`${row.customer_id ?? row.customer_code ?? idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-semibold text-slate-700">{row.monthly_rank}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.customer_code || '—'}</td>
                      <td className="px-3 py-2 text-slate-700 font-medium">{row.customer_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.sales_user_name || '未設定'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800">{formatJPY(row.actual_amount)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-600">{row.order_count.toLocaleString('ja-JP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rankingVisible < ranking.length && (
              <div className="px-4 py-3 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setRankingVisible(ranking.length)}
                  className="px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                >
                  もっと見る（残り {ranking.length - rankingVisible} 件）
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderLedgerManagementPage;
