import * as React from 'react';
import { Page, EmployeeUser } from '../types';
import { Calendar, ClipboardList, Settings, Briefcase, DollarSign, Inbox, PieChart, BookOpen, CheckCircle, ChevronLeft, ChevronRight, ChevronDown, Mail, X, Upload, Calculator } from './Icons';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  currentUser: EmployeeUser | null;
  supabaseUserEmail?: string | null;
  onSignOut?: () => void;
}

type NavItemType = {
  page: Page;
  name: string;
  badge?: number;
  badgeColor?: 'blue' | 'green' | 'red';
  icon?: React.ElementType;
  adminOnly?: boolean;
  children?: NavItemType[];
  externalUrl?: string;
};

type NavCategoryType = {
  id: string;
  name: string;
  icon?: React.ElementType;
  items: NavItemType[];
  adminOnly?: boolean;
};

const BASE_NAV_CATEGORIES: NavCategoryType[] = [
  {
    id: 'sales',
    name: '営業',
    icon: Briefcase,
    items: [
      { page: 'business_forms_hub', name: '業務プロセス管理', icon: ClipboardList },
      { page: 'sales_leads', name: 'リード管理' },
      { page: 'sales_customers', name: '取引先Master' },
      { page: 'sales_customers_chart', name: '顧客カルテ/ランキング分析' },
      { page: 'sales_estimates', name: '見積管理' },
      { page: 'sales_orders', name: '受注台帳・目標管理' },
      { page: 'sales_billing', name: '請求書発行・送信管理' },
      { page: 'legacy_billing', name: '請求管理' },
    ],
  },
  {
    id: 'calendar',
    name: 'カレンダー',
    icon: Calendar,
    items: [
      { page: 'my_schedule', name: '日報タスクカレンダー', icon: Calendar, externalUrl: 'https://task.b-p.co.jp' },
    ],
  },
  {
    id: 'approval',
    name: '承認一覧',
    icon: CheckCircle,
    items: [
      { page: 'approval_list', name: '承認一覧', icon: CheckCircle },
      { page: 'approval_form_daily', name: '日報' },
      { page: 'approval_form_expense', name: '経費精算' },
      { page: 'approval_form_transport', name: '交通費精算' },
      { page: 'approval_form_leave', name: '休暇申請' },
      { page: 'approval_form_approval', name: '稟議申請' },
    ],
  },
  {
    id: 'accounting',
    name: '会計',
    icon: DollarSign,
    items: [
      { page: 'purchasing_invoices', name: '請求書インポート', badge: 0, icon: Upload },
      { page: 'accounting_approved_applications', name: '承認済一覧' },
      { page: 'accounting_journal', name: '仕訳帳' },
      { page: 'accounting_general_ledger', name: '総勘定元帳' },
      { page: 'accounting_payables', name: '買掛管理' },
      { page: 'accounting_receivables', name: '売掛管理' },
      { page: 'accounting_cash_schedule', name: '資金繰り表' },
      { page: 'accounting_trial_balance', name: '試算表' },
      { page: 'accounting_profit_loss', name: '損益計算書' },
      { page: 'accounting_balance_sheet', name: '貸借対照表' },
      { page: 'accounting_tax_summary', name: '消費税集計' },
      { page: 'accounting_expense_analysis', name: '経費分析' },
      { page: 'accounting_period_closing', name: '締処理' },
    ],
  },
  {
    id: 'analysis',
    name: '分析',
    icon: PieChart,
    items: [
      { page: 'analysis_dashboard', name: '🔥 起死回生プラン' },
      { page: 'analysis_ranking', name: '売上ランキング' },
      { page: 'strac_analysis', name: 'STRAC分析' },
    ],
  },
  {
    id: 'management',
    name: '管理',
    icon: Settings,
    items: [
      { page: 'inventory_management', name: '在庫管理' },
      { page: 'manufacturing_orders', name: '製造管理' },
      { page: 'purchasing_orders', name: '購買管理' },
      { page: 'hr_attendance', name: '勤怠管理' },
      { page: 'hr_labor_cost', name: '人件費管理' },
    ],
  },
  {
    id: 'tools',
    name: 'ツール',
    icon: BookOpen,
    items: [
      { page: 'admin_user_management', name: 'ユーザー管理', adminOnly: true },
      { page: 'admin_route_management', name: '承認ルート管理', adminOnly: true },
      { page: 'admin_master_management', name: 'マスタ管理', adminOnly: true },
      { page: 'admin_action_console', name: 'アクションコンソール', adminOnly: true },
      { page: 'settings', name: '通知メール設定', adminOnly: true },
    ],
  },
];

const ACCOUNTING_BADGE_MAP: Record<string, keyof AccountingBadgeCounts> = {
  accounting_journal_review: 'journalReview',
  accounting_approved_applications: 'approvedApplications',
  accounting_payables: 'payables',
  accounting_receivables: 'receivables',
};

const decorateCategories = (
  categories: NavCategoryType[],
  pendingApprovalCount?: number,
  accountingCounts?: AccountingBadgeCounts,
): NavCategoryType[] =>
  categories.map(category => {
    if (category.id === 'approval') {
      return {
        ...category,
        items: category.items.map(item =>
          item.page === 'approval_list'
            ? { ...item, badge: pendingApprovalCount, badgeColor: 'blue' as const }
            : item
        ),
      };
    }
    if (category.id === 'accounting' && accountingCounts) {
      return {
        ...category,
        items: category.items.map(item => {
          const countKey = ACCOUNTING_BADGE_MAP[item.page];
          if (!countKey) return item;
          const count = accountingCounts[countKey];
          return count && count > 0
            ? { ...item, badge: count, badgeColor: 'blue' as const }
            : item;
        }),
      };
    }
    return category;
  });

export const buildNavCategories = (
  user: EmployeeUser | null,
  pendingApprovalCount?: number,
  accountingCounts?: AccountingBadgeCounts,
): NavCategoryType[] => {
  const baseCategories = decorateCategories(BASE_NAV_CATEGORIES, pendingApprovalCount, accountingCounts);

  const isAdmin = user?.role === 'admin';

  return baseCategories
    .filter((category) => isAdmin || !category.adminOnly)
    .map(category => {
      const items = isAdmin ? category.items : category.items.filter(item => !item.adminOnly);
      return { ...category, items };
    })
    .filter(category => category.items.length > 0);
};

export interface AccountingBadgeCounts {
  journalReview?: number;
  approvedApplications?: number;
  payables?: number;
  receivables?: number;
}

interface SidebarWithCountsProps extends SidebarProps {
  approvalsCount?: number;
  accountingCounts?: AccountingBadgeCounts;
}

const Sidebar: React.FC<SidebarWithCountsProps> = ({
  currentPage,
  onNavigate,
  currentUser,
  supabaseUserEmail,
  onSignOut,
  approvalsCount,
  accountingCounts,
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [expandedItems, setExpandedItems] = React.useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = React.useState<Record<string, boolean>>({});

  const toggleSidebar = () => {
    // Mobile: toggle mobile menu, Desktop: toggle collapse
    if (window.innerWidth < 640) {
      setIsMobileOpen(prev => !prev);
    } else {
      setIsCollapsed(prev => !prev);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !(prev[categoryId] ?? false) }));
  };
  const visibleCategories = React.useMemo(
    () => buildNavCategories(currentUser, approvalsCount, accountingCounts),
    [currentUser, approvalsCount, accountingCounts]
  );

  // Mobile: full width when open, Desktop: toggleable
  const sidebarWidth = isCollapsed ? 'w-14' : 'w-full sm:w-64';
  const sidebarTransition = 'transition-all duration-300 ease-in-out';

  // Mobile visibility logic
  const shouldShowMobile = isMobileOpen;
  const shouldShowDesktop = !isCollapsed;

  // カスタムイベントリスナー
  React.useEffect(() => {
    const handleOpenMobileSidebar = () => {
      setIsMobileOpen(true);
    };

    const sidebarElement = document.querySelector('[data-sidebar-mobile-toggle]');
    if (sidebarElement) {
      sidebarElement.addEventListener('open-mobile-sidebar', handleOpenMobileSidebar);
    }

    return () => {
      if (sidebarElement) {
        sidebarElement.removeEventListener('open-mobile-sidebar', handleOpenMobileSidebar);
      }
    };
  }, []);

  return (
    <>
      {/* Mobile sidebar overlay */}
      <div className={`sm:hidden fixed inset-0 z-40 ${!shouldShowMobile ? 'pointer-events-none' : ''}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${!shouldShowMobile ? 'opacity-0' : 'opacity-100'}`}
          onClick={() => setIsMobileOpen(false)}
        />
      </div>

      <aside
        data-sidebar-mobile-toggle
        className={`${sidebarWidth} ${sidebarTransition} flex-shrink-0 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 flex flex-col p-3 sm:p-4 h-screen sm:h-screen min-h-0 fixed sm:relative z-50 sm:z-40 ${shouldShowMobile ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0`}
      >
        {/* Mobile header */}
        <div className="sm:hidden flex items-center justify-between px-3 py-4 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-200">文唱堂印刷 業務管理</h1>
          <button
            type="button"
            onClick={() => {
              setIsMobileOpen(false);
            }}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`px-3 py-4 border-b border-slate-200 dark:border-slate-800 overflow-hidden ${isCollapsed ? 'text-center' : ''} hidden sm:block`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2'}`}>
            {/* Replace logo with a simple text matching FXGT branding style */}
            <div className={`text-2xl font-black tracking-tighter text-teal-700 dark:text-teal-400 whitespace-nowrap ${isCollapsed ? 'hidden' : 'block'}`}>MQ ERP</div>
            {!isCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label="サイドバーを折りたたむ"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className={`mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-slate-400 ${isCollapsed ? 'justify-center' : ''}`}>
          {isCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="block w-6 h-6 text-center leading-6 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="サイドバーを展開"
            >
              <ChevronRight className="w-3 h-3 text-slate-500 mx-auto" />
            </button>
          )}
          <a href="https://erp.b-p.co.jp" target="_blank" rel="noopener noreferrer" className={`px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors ${isCollapsed ? 'block w-6 h-6 text-center leading-6' : ''}`} title="業務">業</a>
          <a href="https://mq.b-p.co.jp" target="_blank" rel="noopener noreferrer" className={`px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors ${isCollapsed ? 'block w-6 h-6 text-center leading-6' : ''}`} title="MQ">MQ</a>
          <a href="https://dtp.b-p.co.jp" target="_blank" rel="noopener noreferrer" className={`px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors ${isCollapsed ? 'block w-6 h-6 text-center leading-6' : ''}`} title="DTP">D</a>
          <a href="https://co2.b-p.co.jp/" target="_blank" rel="noopener noreferrer" className={`px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors ${isCollapsed ? 'block w-6 h-6 text-center leading-6' : ''}`} title="エコ">E</a>
        </div>
        <nav className={`flex-1 mt-2 sm:mt-6 space-y-2 overflow-y-auto min-h-0 ${isCollapsed ? 'px-1' : 'px-2'}`}>
          <ul>
            {visibleCategories.map(category => {
              const isCategoryExpanded = !isCollapsed && (expandedCategories[category.id] ?? true);

              return (
                <React.Fragment key={category.id}>
                  <li className={`mt-6 px-3 text-[11px] font-bold text-slate-400 tracking-wider mb-1 ${shouldShowDesktop ? '' : 'sr-only'} ${!shouldShowMobile ? 'hidden sm:block' : ''}`}>
                    {!isCollapsed && (
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className="flex items-center w-full hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        aria-label={isCategoryExpanded ? `${category.name}カテゴリを折りたたむ` : `${category.name}カテゴリを展開する`}
                      >
                        {category.icon && <category.icon className="w-4 h-4 mr-2" />}
                        <span className="flex-1 text-left">{category.name}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isCategoryExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </li>
                  {isCategoryExpanded && category.items.map(item => {
                    const ItemIcon = item.icon ?? category.icon;
                    const isChildActive = item.children?.some(child => child.page === currentPage) ?? false;
                    const isActive = currentPage === item.page || isChildActive;
                    const isExpanded = !isCollapsed && ((expandedItems[item.page] ?? false) || isChildActive);
                    return (
                      <li key={item.page}>
                        <a
                          href={item.externalUrl || '#'}
                          target={item.externalUrl ? '_blank' : undefined}
                          rel={item.externalUrl ? 'noopener noreferrer' : undefined}
                          onClick={(e) => {
                            if (item.externalUrl) return; // 外部リンクはデフォルト動作
                            e.preventDefault();
                            if (item.children) {
                              e.stopPropagation();
                              setExpandedItems(prev => ({ ...prev, [item.page]: !(prev[item.page] ?? false) }));
                            } else {
                              onNavigate(item.page);
                              // モバイルでナビゲーション後にサイドバーを閉じる
                              if (window.innerWidth < 640) {
                                setIsMobileOpen(false);
                              }
                            }
                          }}
                          className={`flex items-center p-2.5 sm:px-3 sm:py-2.5 rounded-md transition-colors duration-200 ${isActive ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 font-bold border-l-4 border-teal-700 dark:border-teal-500' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                            } ${isCollapsed ? 'justify-center border-l-0' : 'gap-3'} text-[13px] min-h-[40px] mb-0.5 -ml-2 pl-4 rounded-none border-t border-b border-transparent`}
                        >
                          {ItemIcon && <ItemIcon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'}`} />}
                          <span className={`${shouldShowMobile ? 'block' : 'hidden sm:block'} ${isCollapsed ? 'sm:hidden' : ''}`}>{item.name}</span>
                          {item.children && !isCollapsed && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setExpandedItems(prev => ({ ...prev, [item.page]: !(prev[item.page] ?? false) }));
                              }}
                              className="ml-auto p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label={isExpanded ? '折りたたむ' : '展開する'}
                            >
                              <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          {item.badge !== undefined && item.badge > 0 && !item.children && (
                            <span
                              className={`ml-auto inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${item.badgeColor === 'green'
                                ? 'bg-emerald-500 text-white'
                                : item.badgeColor === 'red'
                                  ? 'bg-rose-500 text-white'
                                  : 'bg-blue-500 text-white'
                                } ${isCollapsed ? 'ml-0' : ''}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </a>
                        {item.children && isExpanded && (
                          <ul className="mt-1 space-y-1">
                            {item.children.map(child => {
                              const isChildPageActive = currentPage === child.page;
                              return (
                                <li key={child.page}>
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      onNavigate(child.page);
                                      // モバイルでナビゲーション後にサイドバーを閉じる
                                      if (window.innerWidth < 640) {
                                        setIsMobileOpen(false);
                                      }
                                    }}
                                    className={`flex items-center rounded-md px-3 py-2 text-[12.5px] transition-colors duration-200 ${isChildPageActive ? 'text-primary-400 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                                      } ml-8 my-0.5`}
                                  >
                                    <span className={`font-medium ${shouldShowMobile ? 'block' : 'hidden sm:block'}`}>{child.name}</span>
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          {supabaseUserEmail && (
            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">ログイン中のユーザー</p>
              <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 break-all">{supabaseUserEmail}</p>
            </div>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="w-full px-3 py-2 text-[13px] font-semibold text-center text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 rounded-md transition-colors"
            >
              ログアウト
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
