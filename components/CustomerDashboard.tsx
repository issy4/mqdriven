import React, { useEffect, useState } from 'react';
import { Customer, CustomerInfo } from '../types';

import {
  getCustomerInfo,
  getCustomerSalesSummaryV2,
  type CustomerSalesSummaryV2,
} from '../services/dataService';

import CustomerInfoForm from './forms/CustomerInfoForm';

import {
  User,
  Phone,
  Globe,
  MapPin,
  CreditCard,
  TrendingUp,
  BookOpen,
  Clock,
  ChevronLeft,
} from './Icons';

import { formatJPY } from '../utils';

interface CustomerDashboardProps {
  customer: Customer;
  onBack: () => void;
}

type ActiveTab = 'overview' | 'karte';

interface FiscalRange {
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * 当期
 * 6月1日 ～ 翌年5月31日
 */
const getCurrentFiscalRange = (): FiscalRange => {
  const now = new Date();

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // getMonth() は 0始まり
  // 6月 = 5
  const fiscalStartYear =
    currentMonth >= 5
      ? currentYear
      : currentYear - 1;

  return {
    startDate: `${fiscalStartYear}-06-01`,
    endDate: `${fiscalStartYear + 1}-05-31`,
    label: `${fiscalStartYear}/06/01 ～ ${fiscalStartYear + 1}/05/31`,
  };
};

const safeDate = (
  value?: string | null
): string => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('ja-JP');
};

const CustomerDashboard: React.FC<
  CustomerDashboardProps
> = ({
  customer,
  onBack,
}) => {
  const [info, setInfo] =
    useState<CustomerInfo | null>(null);

  const [
    salesSummary,
    setSalesSummary,
  ] =
    useState<CustomerSalesSummaryV2 | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [salesError, setSalesError] =
    useState<string | null>(null);

  const [infoError, setInfoError] =
    useState<string | null>(null);

  const [activeTab, setActiveTab] =
    useState<ActiveTab>('overview');

  const fiscalRange =
    getCurrentFiscalRange();

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);

      setSalesSummary(null);
      setSalesError(null);

      setInfo(null);
      setInfoError(null);

      console.log(
        '[CustomerDashboard] customer:',
        {
          id: customer.id,
          code: customer.customerCode,
          name: customer.customerName,
        }
      );

      console.log(
        '[CustomerDashboard] fiscal range:',
        fiscalRange.startDate,
        fiscalRange.endDate
      );

      const [
        customerInfoResult,
        salesResult,
      ] = await Promise.allSettled([
        getCustomerInfo(
          customer.id
        ),

        getCustomerSalesSummaryV2(
          customer.id,
          fiscalRange.startDate,
          fiscalRange.endDate
        ),
      ]);

      if (cancelled) {
        return;
      }

      /**
       * カルテ情報
       */
      if (
        customerInfoResult.status ===
        'fulfilled'
      ) {
        setInfo(
          customerInfoResult.value
        );
      } else {
        console.error(
          '[CustomerDashboard] customer info error:',
          customerInfoResult.reason
        );

        setInfoError(
          customerInfoResult.reason
            instanceof Error
            ? customerInfoResult.reason
                .message
            : '顧客カルテ情報を取得できませんでした。'
        );
      }

      /**
       * 売上情報
       */
      if (
        salesResult.status ===
        'fulfilled'
      ) {
        console.log(
          '[CustomerDashboard] sales summary:',
          salesResult.value
        );

        setSalesSummary(
          salesResult.value
        );
      } else {
        console.error(
          '[CustomerDashboard] sales summary error:',
          salesResult.reason
        );

        setSalesError(
          salesResult.reason instanceof
            Error
            ? salesResult.reason.message
            : '売上実績を取得できませんでした。'
        );
      }

      setLoading(false);
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [
    customer.id,
  ]);

  /**
   * 顧客マスタを優先し、
   * 空の場合だけ customers_info を使用
   */
  const capital =
    customer.capital ||
    info?.capital ||
    '-';

  const annualSales =
    customer.annualSales ||
    info?.annualSales ||
    '-';

  const closingDate =
    customer.closingDay ||
    info?.closingDate ||
    '-';

  const paymentDate =
    customer.payDay ||
    info?.paymentDate ||
    '-';

  /**
   * PQ / MQ
   */
  const salesAmount =
    Number(
      salesSummary?.sales_amount ??
        0
    );

  const mq =
    Number(
      salesSummary?.mq ?? 0
    );

  const mqRate =
    Number(
      salesSummary?.mq_rate ?? 0
    );

  const invoiceCount =
    Number(
      salesSummary?.invoice_count ??
        0
    );

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* 戻る */}
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />

        顧客一覧に戻る
      </button>

      {/* ======================================================
          Customer Header
      ====================================================== */}
      <div className="relative mb-8">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-8 shadow-lg">
          {/* 装飾 */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-100/70 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                CUSTOMER PROFILE
              </div>

              <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                {customer.customerName}
              </h1>

              <p className="font-medium text-slate-500">
                {customer.customerNameKana ||
                  'カナ名称未設定'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <Clock className="h-4 w-4 text-slate-400" />

                <span className="text-sm font-medium text-slate-700">
                  登録：
                  {safeDate(
                    customer.createdAt
                  )}
                </span>
              </div>

              {customer.customerCode && (
                <div className="flex items-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2">
                  <span className="text-sm font-bold text-blue-600">
                    #
                    {
                      customer.customerCode
                    }
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="relative z-10 mt-8 grid grid-cols-1 gap-6 border-t border-slate-200 pt-7 md:grid-cols-3">
            {/* 電話 */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2">
                <Phone className="h-5 w-5 text-blue-500" />
              </div>

              <div className="text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  電話番号
                </p>

                <p className="font-semibold text-slate-800">
                  {customer.phoneNumber ||
                    '-'}
                </p>
              </div>
            </div>

            {/* 所在地 */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2">
                <MapPin className="h-5 w-5 text-blue-500" />
              </div>

              <div className="min-w-0 text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  所在地
                </p>

                <p className="font-semibold text-slate-800">
                  {[
                    customer.address1,
                    customer.address2,
                  ]
                    .filter(Boolean)
                    .join(' ') || '-'}
                </p>
              </div>
            </div>

            {/* Web */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2">
                <Globe className="h-5 w-5 text-blue-500" />
              </div>

              <div className="min-w-0 overflow-hidden text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  WEBサイト
                </p>

                {customer.websiteUrl ? (
                  <a
                    href={
                      customer.websiteUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-semibold text-blue-600 hover:underline"
                  >
                    {
                      customer.websiteUrl
                    }
                  </a>
                ) : (
                  <p className="font-semibold text-slate-800">
                    -
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================
          Tabs
      ====================================================== */}
      <div className="mb-8 flex w-max gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() =>
            setActiveTab('overview')
          }
          className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all ${
            activeTab ===
            'overview'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="h-4 w-4" />

          概要ダッシュボード
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveTab('karte')
          }
          className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold transition-all ${
            activeTab ===
            'karte'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="h-4 w-4" />

          お客様カルテ
        </button>
      </div>

      {/* ======================================================
          Errors
      ====================================================== */}
      {salesError && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>
            売上実績の取得エラー：
          </strong>{' '}
          {salesError}
        </div>
      )}

      {infoError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <strong>
            カルテ情報の取得エラー：
          </strong>{' '}
          {infoError}
        </div>
      )}

      {/* ======================================================
          Overview
      ====================================================== */}
      {activeTab ===
        'overview' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left */}
          <div className="space-y-8 lg:col-span-2">
            {/* Sales Metrics */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* PQ */}
              <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/60 p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-600">
                    <CreditCard className="h-6 w-6" />
                  </div>

                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    REVENUE (PQ)
                  </span>
                </div>

                <h3 className="mb-1 text-2xl font-black text-slate-900">
                  {loading
                    ? '読込中...'
                    : salesError
                      ? '取得エラー'
                      : formatJPY(
                          salesAmount
                        )}
                </h3>

                <p className="text-sm text-slate-500">
                  当期累計売上高
                </p>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>
                    {
                      fiscalRange.label
                    }
                  </span>

                  {!loading &&
                    !salesError && (
                      <span>
                        {invoiceCount.toLocaleString(
                          'ja-JP'
                        )}
                        件
                      </span>
                    )}
                </div>
              </div>

              {/* MQ */}
              <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/60 p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-600">
                    <TrendingUp className="h-6 w-6" />
                  </div>

                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    PROFIT (MQ)
                  </span>
                </div>

                <h3 className="mb-1 text-2xl font-black text-slate-900">
                  {loading
                    ? '読込中...'
                    : salesError
                      ? '取得エラー'
                      : formatJPY(mq)}
                </h3>

                <p className="text-sm text-slate-500">
                  当期累計粗利
                </p>

                <div className="mt-3 text-xs text-slate-400">
                  M率：
                  {!loading &&
                  !salesError
                    ? `${mqRate.toFixed(
                        2
                      )}%`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Contact / Basic */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-900">
                <User className="h-5 w-5 text-blue-500" />

                キーパーソン・連絡先
              </h3>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {/* Key person */}
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    担当者 / 窓口
                  </h4>

                  <p className="font-medium whitespace-pre-wrap text-slate-800">
                    {info?.keyPerson ||
                      '未設定'}
                  </p>

                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
                    {info?.keyPersonInfo ||
                      '補足情報なし'}
                  </p>
                </div>

                {/* Basic info */}
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    基本情報
                  </h4>

                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-100 py-3 text-sm">
                      <span className="text-slate-500">
                        資本金
                      </span>

                      <span className="font-semibold text-slate-900">
                        {String(
                          capital
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between border-b border-slate-100 py-3 text-sm">
                      <span className="text-slate-500">
                        年商
                      </span>

                      <span className="font-semibold text-slate-900">
                        {String(
                          annualSales
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between border-b border-slate-100 py-3 text-sm">
                      <span className="text-slate-500">
                        締日 / 支払日
                      </span>

                      <span className="font-semibold text-slate-900">
                        {String(
                          closingDate
                        )}
                        {' / '}
                        {String(
                          paymentDate
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between border-b border-slate-100 py-3 text-sm">
                      <span className="text-slate-500">
                        最終売上日
                      </span>

                      <span className="font-semibold text-slate-900">
                        {safeDate(
                          salesSummary?.last_sales_date
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-8">
            {/* Business summary */}
            <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-8 shadow-sm">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-blue-500">
                取引概要
              </h3>

              <div className="space-y-6">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">
                    取引成績
                  </p>

                  <p className="text-lg font-bold leading-relaxed text-slate-900">
                    {info?.businessResult ||
                      '未入力'}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">
                    会社の特徴
                  </p>

                  <p className="text-sm leading-relaxed text-slate-600">
                    {info?.companyFeatures ||
                      '未入力'}
                  </p>
                </div>
              </div>
            </div>

            {/* Activity */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-400">
                活動指標
              </h3>

              <div className="flex items-center gap-6">
                <div className="relative h-20 w-20">
                  <svg className="h-full w-full -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-slate-100"
                    />

                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="226"
                      strokeDashoffset={
                        226 -
                        2.26 *
                          Number(
                            info?.orderRate ||
                              0
                          )
                      }
                      className="text-blue-600"
                    />
                  </svg>

                  <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-900">
                    {info?.orderRate ||
                      0}
                    %
                  </div>
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-800">
                    受注率
                  </p>

                  <p className="text-xs text-slate-500">
                    提案案件の成約割合
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================
          Karte
      ====================================================== */}
      {activeTab === 'karte' && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/70 p-8">
            <h2 className="text-xl font-bold text-slate-900">
              お客様カルテ詳細編集
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              詳細な顧客戦略情報を管理します。
            </p>
          </div>

          <div className="p-8">
            <CustomerInfoForm
              customerId={
                customer.id
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;