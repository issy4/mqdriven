import React, { useEffect, useMemo, useState } from 'react';
import {
  getMonthlyOrderDashboardByUser,
  getOrderLedger,
  getSalesPersonalFollowupCandidates,
  SalesPersonalFollowupCandidate,
} from '../../services/dataService';
import { EmployeeUser, MonthlyOrderUserDashboardRow, OrderLedgerRow } from '../../types';
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle, Calendar, Target } from '../Icons';

type Props = {
  currentUser: EmployeeUser | null;
};

const formatCurrency = (value: number | null | undefined) =>
  `¥${Math.round(Number(value || 0)).toLocaleString('ja-JP')}`;

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthStartDate = (month: string) => {
  return new Date(`${month}-01T00:00:00`);
};

const isCurrentMonth = (month: string) => {
  const now = new Date();
  const target = getMonthStartDate(month);

  return now.getFullYear() === target.getFullYear()
    && now.getMonth() === target.getMonth();
};

const isPastMonth = (month: string) => {
  const now = new Date();
  const target = getMonthStartDate(month);

  return target.getFullYear() < now.getFullYear()
    || (
      target.getFullYear() === now.getFullYear()
      && target.getMonth() < now.getMonth()
    );
};

const getDaysInMonth = (month: string) => {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(year, monthNum, 0).getDate();
};

const getElapsedDaysInMonth = (month: string) => {
  const now = new Date();
  const target = getMonthStartDate(month);

  if (now.getFullYear() !== target.getFullYear() || now.getMonth() !== target.getMonth()) {
    return getDaysInMonth(month);
  }

  return Math.max(1, now.getDate());
};

const getRemainingBusinessDays = (month: string) => {
  const now = new Date();
  const target = getMonthStartDate(month);
  const daysInMonth = getDaysInMonth(month);

  let startDay = 1;

  if (now.getFullYear() === target.getFullYear() && now.getMonth() === target.getMonth()) {
    startDay = now.getDate();
  }

  let count = 0;

  for (let day = startDay; day <= daysInMonth; day += 1) {
    const d = new Date(target.getFullYear(), target.getMonth(), day);
    const week = d.getDay();
    if (week !== 0 && week !== 6) {
      count += 1;
    }
  }

  return Math.max(1, count);
};

const reasonLabelClass = (reason: string) => {
  if (reason === '今月未受注') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (reason === '前月比減少') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (reason === 'しばらく動きなし') return 'bg-slate-50 text-slate-600 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: 'normal' | 'good' | 'warning' | 'danger';
}> = ({ label, value, sub, icon, tone = 'normal' }) => {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : 'text-slate-900';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-2xl font-black ${toneClass}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && (
          <div className="rounded-lg bg-slate-50 p-2 text-slate-500">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

const SalesPersonalDashboardPage: React.FC<Props> = ({ currentUser }) => {
  const [month, setMonth] = useState(getCurrentMonth());
  const [dashboard, setDashboard] = useState<MonthlyOrderUserDashboardRow | null>(null);
  const [followups, setFollowups] = useState<SalesPersonalFollowupCandidate[]>([]);
  const [orders, setOrders] = useState<OrderLedgerRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    setError('');

    try {
      const [byUserRows, followupRows, orderRows] = await Promise.all([
        getMonthlyOrderDashboardByUser(month),
        getSalesPersonalFollowupCandidates(currentUser.id, month),
        getOrderLedger({
          month,
          salesUserId: currentUser.id,
          keyword: '',
        }),
      ]);

      const selfDashboard =
        byUserRows.find(row => row.user_id === currentUser.id) ?? null;

      setDashboard(selfDashboard);
      setFollowups(
        followupRows
          .filter(row => row.followup_reason !== '通常')
          .filter(row => row.priority_amount > 0 || row.followup_reason === '前月比減少')
          .slice(0, 10),
      );
      setOrders(orderRows.slice(0, 5));
    } catch (err: any) {
      console.error('[SalesPersonalDashboardPage] load failed:', err);
      setError(err?.message || 'マイ営業ダッシュボードの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, month]);

  const actualAmount = Number(dashboard?.actual_amount || 0);
  const targetAmount = Number(dashboard?.target_amount || 0);
  const orderCount = Number(dashboard?.order_count || 0);

  const elapsedDays = getElapsedDaysInMonth(month);
  const daysInMonth = getDaysInMonth(month);
  const remainingBusinessDays = getRemainingBusinessDays(month);

  const forecastAmount =
    actualAmount > 0 ? Math.round((actualAmount / elapsedDays) * daysInMonth) : 0;

  const shortage = Math.max(0, targetAmount - actualAmount);
  const requiredPerBusinessDay =
    shortage > 0 ? Math.ceil(shortage / remainingBusinessDays) : 0;

  const forecastRate =
    targetAmount > 0 ? Math.round((forecastAmount / targetAmount) * 1000) / 10 : null;

  const achievementRate =
    targetAmount > 0 ? Math.round((actualAmount / targetAmount) * 1000) / 10 : null;

  const outlookMessage = useMemo(() => {
    if (!targetAmount) {
      return '目標額が未設定です。年間目標または月別目標を設定すると、着地予測と必要受注額を表示できます。';
    }

    if (forecastAmount >= targetAmount) {
      return `現在のペースなら、月末着地は ${formatCurrency(forecastAmount)}、目標比 ${forecastRate}% の見込みです。`;
    }

    return `現在のペースでは、月末時点で約 ${formatCurrency(targetAmount - forecastAmount)} 不足する見込みです。`;
  }, [targetAmount, forecastAmount, forecastRate]);

  if (!currentUser) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">ユーザー情報を取得できません。</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">マイ営業ダッシュボード</h1>
          <p className="mt-1 text-sm text-slate-500">
            {currentUser.name} さんの今月の見通しと、次に動くべき顧客を表示します。
          </p>
        </div>

        <div className="flex items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">対象月</span>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            更新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="現在受注額"
          value={formatCurrency(actualAmount)}
          sub={`${orderCount.toLocaleString('ja-JP')}件`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone={achievementRate !== null && achievementRate >= 100 ? 'good' : 'normal'}
        />
        <KpiCard
          label="月末着地予測"
          value={formatCurrency(forecastAmount)}
          sub={forecastRate === null ? '目標未設定' : `目標比 ${forecastRate}%`}
          icon={<Calendar className="h-5 w-5" />}
          tone={forecastAmount >= targetAmount && targetAmount > 0 ? 'good' : 'warning'}
        />
        <KpiCard
          label="目標まであと"
          value={targetAmount ? formatCurrency(shortage) : '未設定'}
          sub={targetAmount ? `目標 ${formatCurrency(targetAmount)}` : '目標を設定してください'}
          icon={<Target className="h-5 w-5" />}
          tone={shortage === 0 && targetAmount > 0 ? 'good' : 'danger'}
        />
        <KpiCard
  label={isCurrentMonth(month) ? '1営業日あたり必要額' : '営業日あたり実績'}
  value={
    isCurrentMonth(month)
      ? targetAmount
        ? formatCurrency(requiredPerBusinessDay)
        : '—'
      : formatCurrency(
          remainingBusinessDays > 0
            ? Math.round(actualAmount / remainingBusinessDays)
            : 0
        )
  }
  sub={
    isCurrentMonth(month)
      ? `残り営業日 ${remainingBusinessDays}日`
      : `営業日数 ${remainingBusinessDays}日`
  }
  icon={<AlertTriangle className="h-5 w-5" />}
  tone={
    isCurrentMonth(month)
      ? requiredPerBusinessDay === 0 && targetAmount > 0
        ? 'good'
        : 'warning'
      : 'normal'
  }
/>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          {forecastAmount >= targetAmount && targetAmount > 0 ? (
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          )}
          <div>
            <h2 className="text-base font-bold text-slate-900">今月の見通し</h2>
            <p className="mt-1 text-sm text-slate-600">{outlookMessage}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900">フォロー候補</h2>
            <p className="mt-1 text-sm text-slate-500">
              過去実績や前月比から、今月確認した方がよい顧客を表示します。
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {followups.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                現時点で優先表示するフォロー候補はありません。
              </div>
            ) : (
              followups.map(item => (
                <div key={`${item.customer_id}-${item.followup_reason}`} className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{item.customer_name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${reasonLabelClass(item.followup_reason)}`}>
                          {item.followup_reason}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        顧客コード：{item.customer_code || '未設定'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">優先度金額</p>
                      <p className="font-black text-slate-900">{formatCurrency(item.priority_amount)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500">今月</p>
                      <p className="font-bold">{formatCurrency(item.current_month_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">前月</p>
                      <p className="font-bold">{formatCurrency(item.previous_month_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">6か月平均</p>
                      <p className="font-bold">{formatCurrency(item.last_6_month_avg_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">最終受注</p>
                      <p className="font-bold">
                        {item.last_order_date || '—'}
                        {item.days_since_last_order !== null ? `（${item.days_since_last_order}日前）` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900">最近の受注</h2>
            <p className="mt-1 text-sm text-slate-500">本人担当分の直近5件です。</p>
          </div>

          <div className="divide-y divide-slate-100">
            {orders.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">対象月の受注はありません。</div>
            ) : (
              orders.map(order => (
                <div key={order.project_uuid || order.order_code || order.project_id || Math.random()} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">{order.order_date || '日付未設定'} / {order.order_code || '受注番号未設定'}</p>
                      <h3 className="mt-1 text-sm font-bold text-slate-900">{order.project_name || '案件名未設定'}</h3>
                      <p className="mt-1 text-xs text-slate-500">{order.customer_name || order.customer_code || '顧客未設定'}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-black text-slate-900">
                      {formatCurrency(order.order_amount_for_report)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesPersonalDashboardPage;