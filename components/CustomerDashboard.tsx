import React, { useState, useEffect } from 'react';
import { Customer, CustomerInfo } from '../types';
import {
  getCustomerInfo,
  getCustomerSalesSummaryV2,
  type CustomerSalesSummaryV2,
} from '../services/dataService';
import CustomerInfoForm from './forms/CustomerInfoForm';
import { User, Phone, Globe, MapPin, Calendar, CreditCard, TrendingUp, BookOpen, Clock, ChevronLeft } from './Icons';
import { formatJPY } from '../utils';

interface CustomerDashboardProps {
  customer: Customer;
  onBack: () => void;
}

const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ customer, onBack }) => {
  const [info, setInfo] = useState<CustomerInfo | null>(null);

  const [salesSummary, setSalesSummary] =
    useState<CustomerSalesSummaryV2 | null>(null);

  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] =
    useState<'overview' | 'karte' | 'history'>('overview');

  useEffect(() => {
  let cancelled = false;

  const loadData = async () => {
    setLoading(true);

    try {
      const now = new Date();

      const fiscalStartYear =
        now.getMonth() >= 5
          ? now.getFullYear()
          : now.getFullYear() - 1;

      const startDate =
        `${fiscalStartYear}-06-01`;

      const endDate =
        `${fiscalStartYear + 1}-05-31`;

      const [
        customerInfo,
        summary,
      ] = await Promise.all([
        getCustomerInfo(customer.id),
        getCustomerSalesSummaryV2(
          customer.id,
          startDate,
          endDate
        ),
      ]);

      if (cancelled) return;

      setInfo(customerInfo);
      setSalesSummary(summary);

    } catch (error) {
      console.error(
        '[CustomerDashboard] Failed to load customer data:',
        error
      );
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  loadData();

  return () => {
    cancelled = true;
  };
}, [customer.id]);

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="relative mb-8">
        <button 
          onClick={onBack}
          className="mb-4 flex items-center text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          顧客一覧に戻る
        </button>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold mb-4 border border-blue-500/30">
                CUSTOMER PROFILE
              </div>
              <h1 className="text-4xl font-black tracking-tight mb-2">
                {customer.customerName}
              </h1>
              <p className="text-slate-400 font-medium">
                {customer.customerNameKana || 'カナ名称未設定'}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium">登録: {new Date(customer.createdAt).toLocaleDateString()}</span>
              </div>
              {customer.customerCode && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm font-bold text-blue-400">#{customer.customerCode}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10 relative z-10 border-t border-white/10 pt-8">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-blue-400" />
              <div className="text-sm">
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">電話番号</p>
                <p className="font-semibold">{customer.phoneNumber || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-blue-400" />
              <div className="text-sm">
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">所在地</p>
                <p className="font-semibold truncate max-w-[250px]">{customer.address1 || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-blue-400" />
              <div className="text-sm overflow-hidden">
                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">WEBサイト</p>
                {customer.websiteUrl ? (
                  <a href={customer.websiteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-300 hover:underline block truncate">
                    {customer.websiteUrl}
                  </a>
                ) : <p className="font-semibold">-</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-8 w-max">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'overview' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          概要ダッシュボード
        </button>
        <button 
          onClick={() => setActiveTab('karte')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'karte' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          お客様カルテ
        </button>
      </div>

      {/* Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Sales Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm bg-gradient-to-br from-white to-blue-50/50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue (PQ)</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
  {formatJPY(Number(salesSummary?.sales_amount ?? 0))}
</h3>

<p className="text-sm text-slate-500">
  当期累計売上高
  {salesSummary && (
    <span className="ml-2">
      （{Number(salesSummary.invoice_count).toLocaleString('ja-JP')}件）
    </span>
  )}
</p>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm bg-gradient-to-br from-white to-emerald-50/50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Profit (MQ)</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
                    {info?.mq ? formatJPY(Number(info.mq)) : '¥0'}
                  </h3>
                  <p className="text-sm text-slate-500">当期累計粗利 (M率: {info?.mRate || '0'}%)</p>
                </div>
              </div>

              {/* Memo / Notes */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-500" />
                  キーパーソン・連絡先
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">担当者 / 窓口</h4>
                    <p className="text-slate-800 dark:text-slate-200 font-medium whitespace-pre-wrap">
                      {info?.keyPerson || '未設定'}
                    </p>
                    <p className="mt-2 text-sm text-slate-500 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                      {info?.keyPersonInfo || '補足情報なし'}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">基本情報</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50 dark:border-slate-700">
                        <span className="text-slate-500">資本金</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{info?.capital || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50 dark:border-slate-700">
                        <span className="text-slate-500">年商</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{info?.annualSales || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-slate-50 dark:border-slate-700">
                        <span className="text-slate-500">締日/支払日</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{info?.closingDate || '-'}/{info?.paymentDate || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Representative Stats */}
              <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl">
                <h3 className="text-sm font-bold opacity-60 uppercase tracking-widest mb-6">取引概要</h3>
                <div className="space-y-6">
                  <div>
                    <p className="text-xs opacity-60 mb-1">取引成績</p>
                    <p className="text-lg font-bold leading-relaxed">{info?.businessResult || '未入力'}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-60 mb-1">会社の特徴</p>
                    <p className="text-sm leading-relaxed text-blue-100">{info?.companyFeatures || '未入力'}</p>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">活動指標</h3>
                <div className="flex items-center gap-6">
                  <div className="relative w-20 h-20">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-700" />
                      <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="226" strokeDashoffset={226 - (2.26 * Number(info?.orderRate || 0))} className="text-blue-600" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-slate-900 dark:text-white">
                      {info?.orderRate || 0}%
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">受注率</p>
                    <p className="text-xs text-slate-500">提案案件の成約割合</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'karte' && (
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">お客様カルテ詳細編集</h2>
              <p className="text-sm text-slate-500 mt-1">詳細な顧客戦略情報を管理します。</p>
            </div>
            <div className="p-8">
              <CustomerInfoForm customerId={customer.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerDashboard;
