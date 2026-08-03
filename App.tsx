import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Layers,
  Search,
  BookOpen,
  Calendar,
  ClipboardList,
  ChevronDown,
  History,
  TrendingUp,
  FileText,
  Calculator,
  Plus,
  ArrowLeft,
  Shield,
  MessageSquare,
  Lock,
  MessageCircle,
  Clock,
  Layout,
  Star,
  Users,
  Grid,
  CheckCircle,
  Database,
  Printer,
  FileSearch,
  LogOut,
  Mail,
  Zap,
  Globe,
  Bell,
  Home,
  MapPin,
  Filter,
  Trash2,
  Edit2,
  Building,
  CreditCard,
  Target,
  BarChart3,
  PieChart,
  Activity,
  Archive,
  StarOff,
  UserPlus,
  LogIn,
  Check,
  X,
  HelpCircle,
  Info,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  MinusCircle,
  Image,
  Upload,
  Download,
  Share2,
  Save,
  Trash,
  Send,
  Link,
  Phone,
  Paperclip,
  Eye,
  EyeOff,
  Video,
  Mic,
  Headphones,
  Music,
  Tv,
  Camera,
  Heart,
  ShoppingCart,
  Package,
  Truck,
  Box,
  Cpu,
  Smartphone,
  Laptop,
  Monitor,
  HardDrive,
  MousePointer2,
  Folder,
  FolderOpen,
  MailOpen,
  Inbox,
  SendHorizontal,
  Move,
  Maximize2,
  Minimize2,
  Hash,
  AtSign,
  Briefcase
} from 'lucide-react';
import { 
  Page, 
  Job, 
  JobCreationPayload,
  Customer, 
  Application, 
  ApplicationWithDetails,
  AccountItem, 
  InventoryItem, 
  PurchaseOrder, 
  Lead,
  Department,
  AllocationDivision,
  PaymentRecipient,
  JournalEntry,
  ApprovalRoute,
  Employee,
  Toast,
  ConfirmationDialogProps,
  BugReport,
  Estimate,
  Invoice,
  EmployeeUser,
  MasterAccountItem,
  Title,
  ProjectBudgetSummary,
  DailyReportPrefill,
  Project,
  CompanyAnalysis,
  AccountingStatus,
  FixedCost
} from './types';
import { 
  getJobs, 
  getCustomers, 
  saveEstimate, 
  updateJob, 
  getApplications, 
  updateApplication, 
  getAccountItems, 
  getDepartments,
  getAllocationDivisions,
  getJournalEntries,
  getPaymentRecipients,
  createPaymentRecipient,
  getFixedCosts,
  saveFixedCost,
  deleteFixedCost
} from './services/dataService';
import { formatCurrency, formatJPY } from './utils';

import Header from './components/Header';
import Sidebar, { AccountingBadgeCounts } from './components/Sidebar';
import Dashboard from './components/Dashboard';
import JobList from './components/JobList';
import CreateJobModal from './components/CreateJobModal';
import JobDetailModal from './components/JobDetailModal';
import CustomerList from './components/CustomerList';
import CustomerDetailModal from './components/CustomerDetailModal';
import BusinessCardOCR from './components/BusinessCardOCR';
import { CompanyAnalysisModal } from './components/CompanyAnalysisModal';
import LeadManagementPage from './components/sales/LeadManagementPage';
import CreateLeadModal from './components/sales/CreateLeadModal';
import PlaceholderPage from './components/PlaceholderPage';
import MySchedulePage from './components/MySchedulePage';
import UserManagementPage from './components/admin/UserManagementPage';
import ApprovalRouteManagementPage from './components/admin/ApprovalRouteManagementPage';
import BugReportChatModal from './components/BugReportChatModal';
import UpdateModal from './components/UpdateModal';
import EmailNotificationSettingsPage from './components/EmailNotificationSettingsPage';
import AccountingPage from './components/Accounting';
import InventoryManagementPage from './components/inventory/InventoryManagementPage';
import CreateInventoryItemModal from './components/inventory/CreateInventoryItemModal';
import ManufacturingPipelinePage from './components/manufacturing/ManufacturingPipelinePage';
import ManufacturingOrdersPage from './components/manufacturing/ManufacturingOrdersPage';
import PurchasingManagementPage from './components/purchasing/PurchasingManagementPage';
import CreatePurchaseOrderModal from './components/purchasing/CreatePurchaseOrderModal';
import EstimateManagementPage from './components/sales/EstimateManagementPage';
import SalesRanking from './components/accounting/SalesRanking';
import AccountingBusinessPlanPage from './components/accounting/BusinessPlanPage';
import ApprovalWorkflowPage from './components/accounting/ApprovalWorkflowPage';
import AccountingDashboard from './components/accounting/Dashboard';
import JournalReviewPage from './components/accounting/JournalReviewPage';
import BusinessFormsHub from './components/forms/BusinessFormsHub';
import OrderForm from './components/forms/OrderForm';
import ProductionOrderForm from './components/forms/ProductionOrderForm';
import DeliverySlipForm from './components/forms/DeliverySlipForm';
import DetailedEstimateForm from './components/estimate/DetailedEstimateForm';
import CustomerDashboard from './components/CustomerDashboard';
import { ApprovedApplications } from './src/components/accounting/ApprovedApplications';
import UnhandledItemsPage from './components/accounting/UnhandledItemsPage';
import GeneralLedger from './components/accounting/GeneralLedger';
import PayablesPage from './components/accounting/Payables';
import ReceivablesPage from './components/accounting/Receivables';
import CashSchedulePage from './components/accounting/CashSchedule';
import ExpenseAnalysisPage from './components/accounting/ExpenseAnalysisPage';
import ProfitLossPage from './components/accounting/ProfitLossPage';
import BalanceSheetPage from './components/accounting/BalanceSheetPage';
import TaxSummaryPage from './components/accounting/TaxSummaryPage';
import PeriodClosingPage from './components/accounting/PeriodClosingPage';
import DocumentCreationHub from './components/DocumentCreationHub';
import BulletinBoardPage from './components/BulletinBoardPage';
import AIChatPage from './components/AIChatPage';
import MarketResearchPage from './components/MarketResearchPage';
import AITranscriptionPage from './components/AITranscriptionPage';
import MeetingMinutesIframe from './components/MeetingMinutesIframe';
import PDFEditingHub from './components/PDFEditingHub';
import DTPHub from './components/DTPHub';
import PrintEstimateApp from './components/estimate/PrintEstimateApp';
import QuoteCenter from './components/QuoteCenter';
import STRACAnalysisPage from './components/analysis/STRACAnalysisPage';
import { ToastContainer } from './components/Toast';
import ConfirmationDialog from './components/ConfirmationDialog';
import SalesDashboard from './components/sales/SalesDashboard';
import OrderLedgerManagementPage from './components/sales/OrderLedgerManagementPage';
import SalesPersonalDashboardPage from './components/sales/SalesPersonalDashboardPage';
import ManufacturingCostManagement from './components/accounting/ManufacturingCostManagement';
import AuditLogPage from './components/admin/AuditLogPage';
import JournalQueuePage from './components/admin/JournalQueuePage';
import MasterManagementPage from './components/admin/MasterManagementPage';
import ActionConsolePage from './components/admin/ActionConsolePage';
import TurnaroundPlanPage from './components/TurnaroundPlanPage';
import KnowledgeBasePage from './components/KnowledgeBasePage';
import DatabaseSetupInstructionsModal from './components/DatabaseSetupInstructionsModal';
import NewsletterPage from './components/NewsletterPage';
import EmailAutoReplyPage from './components/EmailAutoReplyPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AuthCallbackPage from './components/AuthCallbackPage';
import PromptManagementPage from './components/PromptManagementPage';
import PageShell from './components/ui/PageShell';
import DailyReportProgressPage from './components/DailyReportProgressPage';
import AIEstimateCreation from './components/estimate/AIEstimateCreation';
import FaxOcrIntakePage from './components/sales/FaxOcrIntakePage';
import SalesPipelinePage from './components/sales/SalesPipelinePage';
import ProjectManagementPage from './components/projects/ProjectManagementPage';
import SettingsPage from './components/SettingsPage';
import LegacyInvoiceBillingPage from './components/billing/LegacyInvoiceBillingPage';
import CustomerInvoiceManagementPage from './components/billing/CustomerInvoiceManagementPage';
import PaymentManagement from './components/accounting/PaymentManagement';
import LaborCostManagement from './components/accounting/LaborCostManagement';
import TrialBalancePage from './components/accounting/TrialBalancePage';
import BugReportList from './components/admin/BugReportList';
import InvoiceOCR from './components/InvoiceOCR';

import * as dataService from './services/dataService';
import * as geminiService from './services/geminiService';
import { getSupabase, getSupabaseFunctionHeaders, hasSupabaseCredentials } from './services/supabaseClient';
import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { PlusCircle, Loader, AlertTriangle, RefreshCw, Settings, Menu } from './components/Icons';
import { IS_AI_DISABLED as ENV_SHIM_AI_OFF } from './src/envShim';




const getAllowedGoogleOrigins = (): string[] => {
    const envValue = import.meta.env.VITE_GOOGLE_OAUTH_ALLOWED_ORIGINS || '';
    if (envValue) {
        const parsed = envValue
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        if (parsed.length) return parsed;
    }
    return [
        'https://erp.b-p.co.jp',
        'http://localhost:5174',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://localhost:3000',
        typeof window !== 'undefined' ? window.location.origin : '',
    ];
};

const isGoogleOAuthAllowedOrigin = () => {
    if (typeof window === 'undefined') return false;
    const allowed = getAllowedGoogleOrigins().filter(Boolean);
    const origin = window.location.origin;
    if (allowed.includes('*')) return true;
    if (allowed.includes(origin)) return true;
    // Auto-allow the current origin if not listed to avoid blocking OAuth in new environments
    return false;
};

class TimeoutError extends Error {
    constructor(message = 'Request timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new TimeoutError()), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
};

type PredictiveSuggestion = {
    id: string;
    value: string;
    label: string;
    subLabel?: string;
    type: 'customer' | 'job';
};

const PAGE_TITLES: Record<Page, string> = {
    analysis_dashboard: '起死回生プラン',
    sales_dashboard: '販売ダッシュボード',
    sales_leads: 'リード管理',
    sales_customers: '取引先',
    sales_customers_chart: '顧客/お客様カルテ',
    customer_dashboard: '顧客ダッシュボード',
    sales_pipeline: 'パイプライン',
    sales_estimates: '見積管理',
    quote_center: '見積作成センター',
    sales_orders: '受注台帳・目標管理',
    sales_personal_dashboard: 'マイ営業ダッシュボード',
    project_management: 'プロジェクト管理',
    sales_billing: '請求書発行・送信管理',
    legacy_billing: '請求管理',
    analysis_ranking: 'ランキング分析',
    purchasing_orders: '発注管理',
    purchasing_invoices: '請求書インポート',
    purchasing_payments: '支払管理',
    inventory_management: '在庫管理',
    manufacturing_orders: '製造指図',
    manufacturing_progress: '製造進捗',
    manufacturing_cost: '製造原価',
    hr_attendance: '勤怠',
    hr_man_hours: '工数',
    hr_labor_cost: '労務費',
    approval_list: '承認ワークフロー',
    approval_form_expense: '経費精算',
    approval_form_transport: '交通費精算',
    approval_form_leave: '休暇申請',
    approval_form_approval: '稟議申請',
    approval_form_daily: '日報申請',
    daily_report_progress: '提出状況',
    accounting_journal: '仕訳帳',
    accounting_general_ledger: '総勘定元帳',
    accounting_trial_balance: '合計残高試算表',
    accounting_profit_loss: '損益計算書',
    accounting_balance_sheet: '貸借対照表',
    accounting_tax_summary: '消費税集計',
    accounting_period_closing: '決算処理',
    accounting_business_plan: '経営計画',
    ai_business_consultant: 'AI相談',
    ai_market_research: '市場調査AI',
    ai_transcription: '音声文字起こしAI',
    admin_audit_log: '監査ログ',
    admin_journal_queue: '仕訳キュー',
    admin_user_management: 'ユーザー管理',
    admin_route_management: 'ルート管理',
    admin_master_management: 'マスター管理',
    admin_bug_reports: 'バグレポート',
    admin_action_console: 'アクションコンソール',
    settings: '設定',
    bulletin_board: '掲示板',
    knowledge_base: 'ナレッジベース',
    meeting_minutes: '議事録',
    my_schedule: 'マイスケジュール',
    fax_ocr_intake: 'FAX注文OCR',
    accounting_dashboard: '経理ダッシュボード',
    accounting_journal_review: '仕訳レビュー',
    accounting_payables: '買掛管理',
    accounting_receivables: '売掛管理',
    accounting_cash_schedule: '資金繰り',
    accounting_expense_analysis: '経費分析',
    accounting_approved_applications: '承認済み申請',
    accounting_approved_unhandled: '未処理案件',
    accounting_approved_expense: '承認経費',
    accounting_approved_transport: '承認交通費',
    accounting_approved_leave: '承認休暇',
    accounting_approved_apl: '承認稟議',
    accounting_approved_dly: '承認日報',
    document_creation_tools: '文書作成ツール',
    proposal_ai: '提案書AI',
    pdf_editing_tools: 'PDF編集',
    dtp_tools: 'DTPツール',
    prompt_management: 'プロンプト管理',
    newsletter: 'ニュースレター',
    email_auto_reply: 'メール自動返信',
    simple_estimates: '簡易見積',
    print_estimate_app: '印刷見積アプリ',
    strac_analysis: 'STRAC分析',
    business_forms_hub: '業務プロセス管理',
    business_order: '受注入力',
    business_production: '製造指示入力',
    business_delivery: '納品入力',
    detailed_estimate: '戦略見積作成',
    new_ai_estimate: '生成AI見積',
    turnaround_plan: '起死回生プラン',
};
const APPLICATION_FORM_PAGE_MAP: Partial<Record<string, Page>> = {
    EXP: 'approval_form_expense',
    TRP: 'approval_form_transport',
    LEV: 'approval_form_leave',
    APL: 'approval_form_approval',
    DLY: 'approval_form_daily',
};

const PRIMARY_ACTION_ENABLED_PAGES: Page[] = [
    'sales_leads',
    'sales_customers',
    'sales_customers_chart',
    'purchasing_orders',
    'inventory_management',
    'sales_estimates',
    'simple_estimates',
];

const SEARCH_ENABLED_PAGES: Page[] = [
    'sales_customers',
    'sales_customers_chart',
    'sales_leads',
    'sales_estimates',
    'simple_estimates',
    'approval_list',
];

const PREDICTIVE_SUGGESTION_PAGES: Page[] = [
    'sales_customers',
    'sales_customers_chart',
];

const ESTIMATE_PAGE_SIZE = 50;

const GlobalErrorBanner: React.FC<{ error: string; onRetry: () => void; onShowSetup: () => void; }> = ({ error, onRetry, onShowSetup }) => (
    <div className="bg-red-600 text-white p-3 flex items-center justify-between gap-4 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <div>
                <h3 className="font-bold">データベースエラー</h3>
                <p className="text-sm">{error}</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={onShowSetup} className="bg-red-700 hover:bg-red-800 font-semibold text-sm py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                <Settings className="w-4 h-4" />
                セ���トアップガイド
            </button>
            <button onClick={onRetry} className="bg-red-700 hover:bg-red-800 font-semibold text-sm py-1.5 px-3 rounded-md flex items-center gap-1.5 transition-colors">
                <RefreshCw className="w-4 h-4" />
                再試行
            </button>
        </div>
    </div>
);


const App: React.FC = () => {
    const isSupabaseConfigured = useMemo(() => hasSupabaseCredentials(), []);
    const isAuthBypassEnabled = useMemo(() => import.meta.env.VITE_BYPASS_SUPABASE_AUTH === '1', []);
    const shouldRequireAuth = isSupabaseConfigured && !isAuthBypassEnabled;
    const [authView, setAuthView] = useState<'login' | 'register'>('login');
    const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
    const [supabaseUser, setSupabaseUser] = useState<SupabaseAuthUser | null>(null);
    const [isAuthChecking, setIsAuthChecking] = useState<boolean>(shouldRequireAuth);
    const [authError, setAuthError] = useState<string | null>(null);
    // Update Modal State
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    // Global State
    const [currentPage, setCurrentPage] = useState<Page>('analysis_dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentUser, setCurrentUser] = useState<EmployeeUser | null>(null);
    const [hasSetInitialPage, setHasSetInitialPage] = useState(false);
    const [user, setUser] = useState<any>(null); // TODO: Replace 'any' with proper user type

    const onUserChange = (newUser: any) => {
        setCurrentUser(newUser);
        setUser(newUser);
    };
    const [allUsers, setAllUsers] = useState<EmployeeUser[]>([]);

    // Data State
    const [projects, setProjects] = useState<Project[]>([]);
    const [jobs, setJobs] = useState<ProjectBudgetSummary[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
    const [accountItems, setAccountItems] = useState<AccountItem[]>([]);
    const [paymentRecipients, setPaymentRecipients] = useState<PaymentRecipient[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [orderedCompanyNames, setOrderedCompanyNames] = useState<Set<string>>(new Set());
    const [approvalRoutes, setApprovalRoutes] = useState<ApprovalRoute[]>([]);
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [estimates, setEstimates] = useState<Estimate[]>([]);
    const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);


    // デバッグ用：estimatesの状態を監視
    useEffect(() => {
        console.log('📊 Estimates state changed:', estimates.length);
    }, [estimates]);
    const [estimateTotalCount, setEstimateTotalCount] = useState<number>(0);
    const [estimatePage, setEstimatePage] = useState<number>(1);
    const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
    const [resumedApplication, setResumedApplication] = useState<ApplicationWithDetails | null>(null);
    const [dailyReportPrefill, setDailyReportPrefill] = useState<DailyReportPrefill | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [allocationDivisions, setAllocationDivisions] = useState<AllocationDivision[]>([]);
    const [titles, setTitles] = useState<Title[]>([]);

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [dbError, setDbError] = useState<string | null>(null);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(false); // 緊急対応：ダークモード一時停止につき強制false
    const [toastsEnabled, setToastsEnabled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        const stored = window.localStorage.getItem('toasts_enabled');
        return stored === null ? true : stored === '1';
    });
    const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false);
    const [googleAuthStatus, setGoogleAuthStatus] = useState<{ connected: boolean; expiresAt: string | null; loading: boolean }>({
        connected: false,
        expiresAt: null,
        loading: false,
    });
    const [isCreateJobModalOpen, setCreateJobModalOpen] = useState(false);
    const [isCreateLeadModalOpen, setCreateLeadModalOpen] = useState(false);
    const [isCreatePOModalOpen, setCreatePOModalOpen] = useState(false);
    const [isCreateInventoryItemModalOpen, setIsCreateInventoryItemModalOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isJobDetailModalOpen, setJobDetailModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerModalMode, setCustomerModalMode] = useState<'view' | 'edit' | 'new'>('view');
    const [isCustomerDetailModalOpen, setCustomerDetailModalOpen] = useState(false);
    const [customerInitialValues, setCustomerInitialValues] = useState<Partial<Customer> | null>(null);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
    const [isAnalysisModalOpen, setAnalysisModalOpen] = useState(false);
    const [companyAnalysis, setCompanyAnalysis] = useState<CompanyAnalysis | null>(null);
    const [isAnalysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState('');
    const [isBugReportModalOpen, setIsBugReportModalOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogProps>({ isOpen: false, title: '', message: '', onConfirm: () => { }, onClose: () => () => setConfirmationDialog(prev => ({ ...prev, isOpen: false })) });
    const [aiSuggestion, setAiSuggestion] = useState('');
    const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
    const [isAIOff, setIsAIOff] = useState(() => {
        if (ENV_SHIM_AI_OFF) return true;
        if (typeof window !== 'undefined' && (window as any).__ENV?.VITE_AI_OFF === '1') return true;
        if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_OFF === '1') return true;
        if (typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_AI_OFF === '1') return true;
        if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_AI_OFF === '1') return true;
        return false;
    });
    const [showBulkOCR, setShowBulkOCR] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const estimatePageRef = useRef<number>(1);
    const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
    const [showFeatureUpdateModal, setShowFeatureUpdateModal] = useState(false);

    useEffect(() => {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const root = document.documentElement;
        // 緊急対応: ダークモードが各画面で崩れているため強制オフ
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
        window.localStorage.setItem('mq_theme', 'light');
    }, [isDarkMode]);

    // Show update modal on first visit
    useEffect(() => {
        const hasSeenUpdateModal = window.localStorage.getItem('mq_update_modal_seen');
        if (!hasSeenUpdateModal) {
            setShowUpdateModal(true);
            window.localStorage.setItem('mq_update_modal_seen', 'true');
        }
    }, []);

    const refreshEstimatesPage = useCallback(async (page: number, signal?: AbortSignal) => {
        console.log('🔄 Loading estimates page...', page);
        const { rows, totalCount } = await dataService.getEstimatesPage(page, ESTIMATE_PAGE_SIZE);
        if (signal?.aborted) return;
        console.log('📊 Estimates loaded:', rows.length, 'Total:', totalCount);
        setEstimates(rows);
        setEstimateTotalCount(totalCount);
        setEstimatePage(page);
        estimatePageRef.current = page;
    }, []);

    const isAuthenticated = shouldRequireAuth ? !!supabaseSession : true;
    const isAuthCallbackRoute = shouldRequireAuth && typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback');

    const predictiveSuggestions = useMemo<PredictiveSuggestion[]>(() => {
        const predictiveSuggestionPages: Page[] = ['sales_customers', 'sales_estimates'];
        if (!predictiveSuggestionPages.includes(currentPage)) return [];
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return [];

        const matchesQuery = (value?: string | number | null) => {
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(keyword);
        };

        const customerSuggestions: PredictiveSuggestion[] = [];
        for (const customer of customers) {
            if (customerSuggestions.length >= 5) break;
            if (!customer.customerName) continue;
            const isMatch =
                matchesQuery(customer.customerName) ||
                matchesQuery(customer.customerNameKana) ||
                matchesQuery(customer.customerCode);
            if (!isMatch) continue;
            customerSuggestions.push({
                id: `customer-${customer.id}`,
                value: customer.customerName,
                label: customer.customerName,
                subLabel: customer.customerNameKana || customer.customerCode || undefined,
                type: 'customer',
            });
        }

        const jobSuggestions: PredictiveSuggestion[] = [];
        for (const job of jobs) {
            if (jobSuggestions.length >= 5) break;
            const jobNumberLabel = job.jobNumber ? `案件番号: ${job.jobNumber}` : '';
            const isMatch =
                matchesQuery(job.title) ||
                matchesQuery(job.clientName) ||
                matchesQuery(job.jobNumber) ||
                matchesQuery(job.projectCode);
            if (!isMatch) continue;
            const label = job.title?.trim() || job.clientName?.trim() || jobNumberLabel;
            if (!label) continue;
            const subParts: string[] = [];
            if (job.clientName && job.clientName.trim() && job.clientName.trim() !== label) {
                subParts.push(job.clientName.trim());
            }
            if (jobNumberLabel) subParts.push(jobNumberLabel);

            jobSuggestions.push({
                id: `job-${job.id ?? job.jobNumber ?? label}`,
                value: label,
                label,
                subLabel: subParts.join(' / ') || undefined,
                type: 'job',
            });
        }

        return [...customerSuggestions, ...jobSuggestions];
    }, [currentPage, searchTerm, customers, jobs]);

    // Navigation and Modals
    const handleNavigate = (page: Page) => {
        if (page === 'accounting_business_plan' && currentUser?.role !== 'admin') {
            addToast('経営計画は管理者のみ閲覧できます。', 'error');
            return;
        }
        setCurrentPage(page);
        setSearchTerm('');
        // OCR状態はリセットしない - ページ離脱時も状態を維持
    };

    useEffect(() => {
    if (!currentUser || hasSetInitialPage) return;

    if (currentUser.is_sales_user === true) {
        setCurrentPage('sales_personal_dashboard');
    } else {
        setCurrentPage('analysis_dashboard');
    }

    setHasSetInitialPage(true);
}, [currentUser, hasSetInitialPage]);

    const handleDailyReportPrefillApplied = () => {
        setDailyReportPrefill(null);
    };

    const handleCreateDailyReport = (prefill: DailyReportPrefill) => {
        setDailyReportPrefill(prefill);
        handleNavigate('approval_form_daily');
    };

    const addToast = useCallback((message: string, type: Toast['type']) => {
        if (!toastsEnabled) return;
        const newToast: Toast = { id: Date.now(), message, type };
        setToasts(prev => [...prev, newToast]);
    }, [toastsEnabled]);

    const dismissToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const requestConfirmation = (dialog: Omit<ConfirmationDialogProps, 'isOpen' | 'onClose'>) => {
        setConfirmationDialog({ ...dialog, isOpen: true, onClose: () => setConfirmationDialog(prev => ({ ...prev, isOpen: false })) });
    };
    const clearResumedApplication = useCallback(() => {
        setResumedApplication(null);
    }, []);

    useEffect(() => {
        const todayKey = `feature_modal_seen_${new Date().toISOString().slice(0, 10)}`;
        const seen = typeof window !== 'undefined' ? window.localStorage.getItem(todayKey) : null;
        const shouldShow =
            currentUser &&
            !seen &&
            currentPage === 'my_schedule' &&
            !googleAuthStatus.loading &&
            !googleAuthStatus.connected;
        setShowFeatureUpdateModal(Boolean(shouldShow));
    }, [currentUser, currentPage, googleAuthStatus.connected, googleAuthStatus.loading]);

    const handleDismissFeatureModal = () => {
        const todayKey = `feature_modal_seen_${new Date().toISOString().slice(0, 10)}`;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(todayKey, '1');
        }
        setShowFeatureUpdateModal(false);
    };

    const toggleToasts = () => {
        setToastsEnabled(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('toasts_enabled', next ? '1' : '0');
            }
            return next;
        });
    };

    const fetchGoogleAuthStatus = useCallback(async (options?: { interactive?: boolean }) => {
        if (!currentUser) {
            setGoogleAuthStatus({ connected: false, expiresAt: null, loading: false });
            return;
        }
        if (!isGoogleOAuthAllowedOrigin()) {
            setGoogleAuthStatus({ connected: false, expiresAt: null, loading: false });
            return;
        }
        setGoogleAuthStatus(prev => ({ ...prev, loading: true }));
        try {
            const supabaseClient = getSupabase();
            const headers = await getSupabaseFunctionHeaders(supabaseClient);
            const { data, error } = await withTimeout(
                supabaseClient.functions.invoke<{ connected?: boolean; expires_at?: string | null }>('google-oauth-status', {
                    body: { user_id: currentUser.id },
                    headers,
                }),
                8000,
            );
            if (error) {
                console.warn('Google OAuth status fetch failed (function may not be deployed):', error);
                setGoogleAuthStatus({
                    connected: false,
                    expiresAt: null,
                    loading: false,
                });
                if (options?.interactive) {
                    addToast('Google連携ステータスの取得に失敗しました（Supabase Functionsの状態をご確認ください）。', 'error');
                }
                return;
            }
            setGoogleAuthStatus({
                connected: !!data?.connected,
                expiresAt: data?.expires_at ?? null,
                loading: false,
            });
        } catch (err) {
            console.warn('Failed to fetch Google OAuth status (function may not be deployed):', err);
            setGoogleAuthStatus(prev => ({ ...prev, loading: false }));
            if (options?.interactive) {
                const isTimeout = err instanceof TimeoutError;
                addToast(
                    isTimeout
                        ? 'Google連携ステータスの取得がタイムアウトしました（Supabase Functionsの応答をご確認ください）。'
                        : 'Google連携ステータスの取得でエラーが発生しました。',
                    'error',
                );
            }
        }
    }, [addToast, currentUser]);

    useEffect(() => {
        fetchGoogleAuthStatus();
    }, [fetchGoogleAuthStatus]);

    useEffect(() => {
        const handleFocus = () => fetchGoogleAuthStatus();
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', handleFocus);
        }
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('focus', handleFocus);
            }
        };
    }, [fetchGoogleAuthStatus]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const googleCalendarStatus = url.searchParams.get('google_calendar');
        if (!googleCalendarStatus) return;
        const reason = url.searchParams.get('reason');

        console.info('[GoogleAuth] return to app', { googleCalendarStatus, reason });
        if (googleCalendarStatus === 'ok') {
            addToast('Googleカレンダー連携が完了しました。', 'success');
        } else {
            const reasonMessage = (() => {
                switch (reason) {
                    case 'missing_refresh_token':
                        return 'Googleからrefresh_tokenが返却されませんでした。Googleのアクセス権を一度削除して再認可してください。';
                    case 'store_failed':
                        return 'トークン保存に失敗しました。管理者に連絡してください。';
                    case 'token_exchange_failed':
                        return 'Googleとのトークン交換に失敗しました。再度お試しください。';
                    case 'server_not_configured':
                        return '環境変数が不足しているためGoogle連携を完了できません。管理者に連絡してください。';
                    default:
                        return 'Googleカレンダー連携に失敗しました。再度お試しください。';
                }
            })();
            addToast(reasonMessage, 'error');
        }
        fetchGoogleAuthStatus();

        url.searchParams.delete('google_calendar');
        url.searchParams.delete('reason');
        const newSearch = url.searchParams.toString();
        const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash ?? ''}`;
        window.history.replaceState({}, document.title, newUrl);
    }, [addToast, fetchGoogleAuthStatus]);

    const handleStartGoogleCalendarAuth = async () => {
        if (!currentUser) {
            addToast('ログイン状態を確認してください。', 'error');
            return;
        }
        if (!isGoogleOAuthAllowedOrigin()) {
            addToast('ローカル環境ではGoogle連携を呼び出しません（CORS制限）。', 'info');
            return;
        }
        setIsGoogleAuthLoading(true);
        try {
            const supabaseClient = getSupabase();
            const headers = await getSupabaseFunctionHeaders(supabaseClient);
            const { data, error } = await withTimeout(
                supabaseClient.functions.invoke<{ authUrl?: string }>('google-oauth-start', {
                    body: { user_id: currentUser.id },
                    headers,
                }),
                8000,
            );
            if (error) throw error;
            if (data?.authUrl) window.open(data.authUrl, '_blank', 'noopener');
            else addToast('認可URLを取得できませんでした。', 'error');
        } catch (err) {
            console.error('Failed to start Google OAuth', err);
            addToast('Googleカレンダー連携でエラーが発生しました。', 'error');
        } finally {
            setIsGoogleAuthLoading(false);
            fetchGoogleAuthStatus();
        }
    };

    const handleDisconnectGoogleCalendar = async () => {
        if (!currentUser) {
            addToast('ログイン状態を確認してください。', 'error');
            return;
        }
        if (!isGoogleOAuthAllowedOrigin()) {
            addToast('ローカル環境ではGoogle連携を呼び出しません（CORS制限）。', 'info');
            setGoogleAuthStatus({ connected: false, expiresAt: null, loading: false });
            return;
        }
        setIsGoogleAuthLoading(true);
        try {
            const supabaseClient = getSupabase();
            const headers = await getSupabaseFunctionHeaders(supabaseClient);
            const { error } = await withTimeout(
                supabaseClient.functions.invoke('google-oauth-disconnect', {
                    body: { user_id: currentUser.id },
                    headers,
                }),
                8000,
            );
            if (error) throw error;
            addToast('Googleカレンダー連携を解除しました。', 'success');
            setGoogleAuthStatus({ connected: false, expiresAt: null, loading: false });
        } catch (err) {
            console.error('Failed to disconnect Google OAuth', err);
            addToast('Googleカレンダー連携の解除に失敗しました。', 'error');
            setGoogleAuthStatus(prev => ({ ...prev, loading: false }));
        } finally {
            setIsGoogleAuthLoading(false);
        }
    };

    const handleRefreshGoogleAuthStatus = useCallback(() => {
        fetchGoogleAuthStatus({ interactive: true });
    }, [fetchGoogleAuthStatus]);

    const handleResumeApplicationDraft = useCallback((application: ApplicationWithDetails) => {
        if (!currentUser || application.applicantId !== currentUser.id) {
            addToast('自分が作成した申請のみ再開できます。', 'error');
            return;
        }

        if (application.status !== 'draft' && application.status !== 'rejected') {
            addToast('下書きまたは差戻し済みの申請のみ再申請できます。', 'error');
            return;
        }

        const applicationCode = application.applicationCode?.code;
        if (!applicationCode) {
            addToast('申請種別を特定できず、申請を再開できません。', 'error');
            return;
        }

        const targetPage = APPLICATION_FORM_PAGE_MAP[applicationCode];
        if (!targetPage) {
            addToast(`申請種別「${application.applicationCode?.name || applicationCode}」のフォームにはまだ対応していません。`, 'error');
            return;
        }

        if (application.status === 'rejected') {
            addToast('差し戻し内容をフォームに読み込みました。必要事項を修正して再申請してください。', 'info');
        }

        setResumedApplication(application);
        setSearchTerm('');
        setCurrentPage(targetPage);
    }, [addToast, currentUser]);

    const resetAppData = useCallback(() => {
        setProjects([]);
        setJobs([]);
        setCustomers([]);
        setJournalEntries([]);
        setAccountItems([]);
        setPaymentRecipients([]);
        setLeads([]);
        setApprovalRoutes([]);
        setPurchaseOrders([]);
        setInventoryItems([]);
        setEmployees([]);
        setEstimates([]);
        setFixedCosts([]);

        setApplications([]);
        setResumedApplication(null);
        setDepartments([]);
        setAllocationDivisions([]);
        setTitles([]);
        setCurrentUser(null);
        setAllUsers([]);
        setDbError(null);
    }, []);

    const handleSignOut = useCallback(async () => {
        if (!isSupabaseConfigured) {
            return;
        }
        try {
            const supabaseClient = getSupabase();
            await supabaseClient.auth.signOut();
            resetAppData();
            setSupabaseSession(null);
            setSupabaseUser(null);
            setAuthView('login');
        } catch (error) {
            console.error('Failed to sign out:', error);
            addToast('ログアウトに失敗しました。', 'error');
        }
    }, [isSupabaseConfigured, resetAppData, addToast]);

    useEffect(() => {
        if (!shouldRequireAuth) {
            setSupabaseSession(null);
            setSupabaseUser(null);
            setIsAuthChecking(false);
            return;
        }

        if (!isSupabaseConfigured) {
            setIsAuthChecking(false);
            setSupabaseSession(null);
            setSupabaseUser(null);
            return;
        }

        const supabaseClient = getSupabase();
        let isMounted = true;

        const resolveSession = async () => {
            try {
                const { data, error } = await supabaseClient.auth.getSession();
                if (!isMounted) return;
                if (error) {
                    console.error('Failed to fetch auth session:', error.message);
                    setAuthError(error.message);
                    setSupabaseSession(null);
                    setSupabaseUser(null);
                } else {
                    setAuthError(null);
                    setSupabaseSession(data.session ?? null);
                    setSupabaseUser(data.session?.user ?? null);
                }
            } catch (error: any) {
                if (!isMounted) return;
                console.error('Unexpected auth session error:', error);
                setAuthError(error?.message ?? 'ログイン状態の取得に失敗しました。');
                setSupabaseSession(null);
                setSupabaseUser(null);
            } finally {
                if (isMounted) {
                    setIsAuthChecking(false);
                }
            }
        };

        setIsAuthChecking(true);
        resolveSession();

        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            setAuthError(null);
            setSupabaseSession(session);
            setSupabaseUser(session?.user ?? null);
            if (!session) {
                resetAppData();
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [isSupabaseConfigured, shouldRequireAuth, resetAppData]);

    const loadAllData = useCallback(async (options?: { estimatesPage?: number }) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;
        const targetEstimatesPage = options?.estimatesPage ?? estimatePageRef.current;

        try {
            setIsLoading(true);
            setDbError(null);

            if (!hasSupabaseCredentials()) {
                throw new Error("Supabaseの接続情報が設定されていません。supabaseCredentials.tsファイルを確認してください。");
            }

            const usersData = await dataService.getUsers();
            if (signal.aborted) return;
            setAllUsers(usersData);

            let effectiveUser: EmployeeUser | null = currentUser ?? null;
            if (!effectiveUser && supabaseUser) {
                effectiveUser = usersData.find(user => user.id === supabaseUser.id) ?? null;
                if (!effectiveUser && supabaseUser.email) {
                    const normalizedEmail = supabaseUser.email.toLowerCase();
                    effectiveUser = usersData.find(user => user.email?.toLowerCase() === normalizedEmail) ?? null;
                }
            }
            if (!effectiveUser && usersData.length > 0) {
                effectiveUser = usersData[0];
            }
            if (effectiveUser && (!currentUser || currentUser.id !== effectiveUser.id)) {
                setCurrentUser(effectiveUser as EmployeeUser);
            }

            const employeesFromUsers: Employee[] = usersData.map(user => ({
                id: user.id,
                name: user.name,
                department: user.department || '未設定',
                title: user.title || (user.role === 'admin' ? '管理者' : 'スタッフ'),
                hireDate: user.createdAt,
                salary: 0,
                createdAt: user.createdAt,
            }));

            const results = await Promise.allSettled([
                dataService.getProjects(),
                dataService.getProjectBudgetSummaries(),
                dataService.getCustomers(),
                dataService.getJournalEntries(),
                dataService.getAccountItems(),
                dataService.getLeads(),
                dataService.getApprovalRoutes(),
                dataService.getPurchaseOrders(),
                dataService.getInventoryItems(),
                dataService.getDepartments(),
                dataService.getPaymentRecipients(),
                dataService.getAllocationDivisions(),
                dataService.getTitles(),
                dataService.getEstimatesPage(targetEstimatesPage, ESTIMATE_PAGE_SIZE),
                dataService.getFixedCosts(),
            ]);

            if (signal.aborted) return;

            const [
                projectsResult,
                jobsResult,
                customersResult,
                journalResult,
                accountItemsResult,
                leadsResult,
                routesResult,
                poResult,
                inventoryResult,
                departmentsResult,
                paymentRecipientsResult,
                allocationDivisionsResult,
                titlesResult,
                estimatesResult,
                fixedCostsResult,
            ] = results;

            const sortCustomersDesc = (items: Customer[]) =>
                [...items].sort((a, b) => {
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return bTime - aTime;
                });

            if (projectsResult.status === 'fulfilled') setProjects(projectsResult.value); else console.error('Failed to load projects:', projectsResult.reason);
            if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value); else console.error('Failed to load jobs:', jobsResult.reason);
            if (customersResult.status === 'fulfilled') {
                const sorted = sortCustomersDesc(customersResult.value);
                console.log('[loadAllData] customers sorted', { count: sorted.length, newest: sorted[0]?.createdAt });
                setCustomers(sorted);
            } else {
                console.error('Failed to load customers:', customersResult.reason);
            }
            if (journalResult.status === 'fulfilled') setJournalEntries(journalResult.value); else console.error('Failed to load journal entries:', journalResult.reason);
            if (accountItemsResult.status === 'fulfilled') setAccountItems(accountItemsResult.value); else console.error('Failed to load account items:', accountItemsResult.reason);
            if (leadsResult.status === 'fulfilled') {
                setLeads(leadsResult.value);
                dataService.getOrderedCompanyNames().then(setOrderedCompanyNames).catch(() => {});
            } else console.error('Failed to load leads:', leadsResult.reason);
            if (routesResult.status === 'fulfilled') setApprovalRoutes(routesResult.value); else console.error('Failed to load approval routes:', routesResult.reason);
            if (poResult.status === 'fulfilled') setPurchaseOrders(poResult.value); else console.error('Failed to load purchase orders:', poResult.reason);
            if (inventoryResult.status === 'fulfilled') setInventoryItems(inventoryResult.value); else console.error('Failed to load inventory items:', inventoryResult.reason);
            setEmployees(employeesFromUsers);
            if (estimatesResult.status === 'fulfilled') {
                setEstimates(estimatesResult.value.rows);
                setEstimateTotalCount(estimatesResult.value.totalCount);
                setEstimatePage(targetEstimatesPage);
            } else {
                console.error('Failed to load estimates:', estimatesResult.reason);
            }
            if (departmentsResult.status === 'fulfilled') setDepartments(departmentsResult.value); else console.error('Failed to load departments:', departmentsResult.reason);
            if (paymentRecipientsResult.status === 'fulfilled') setPaymentRecipients(paymentRecipientsResult.value); else console.error('Failed to load payment recipients:', paymentRecipientsResult.reason);
            if (allocationDivisionsResult.status === 'fulfilled') setAllocationDivisions(allocationDivisionsResult.value); else console.error('Failed to load allocation divisions:', allocationDivisionsResult.reason);
            if (titlesResult.status === 'fulfilled') setTitles(titlesResult.value); else console.error('Failed to load titles:', titlesResult.reason);
            if (fixedCostsResult.status === 'fulfilled') setFixedCosts(fixedCostsResult.value); else console.error('Failed to load fixed costs:', fixedCostsResult.reason);


            if (effectiveUser) {
                const applicationsData = await dataService.getApplications(effectiveUser);
                if (!signal.aborted) setApplications(applicationsData);
            } else {
                if (!signal.aborted) setApplications([]);
            }

        } catch (error: any) {
            if (signal.aborted) {
                console.log('Data loading aborted.');
                return;
            }
            console.error("Failed to load data:", error);
            const errorMessage = error.message || "データの読み込みに失敗しました。";
            setDbError(errorMessage);
            addToast(`データベースエラー: ${errorMessage}`, 'error');

        } finally {
            if (!signal.aborted) {
                setIsLoading(false);
            }
        }
    }, [currentUser, supabaseUser, addToast, refreshEstimatesPage]);


    useEffect(() => {
        if (!isSupabaseConfigured) {
            setIsLoading(false);
            return;
        }
        if (!isAuthenticated) {
            setIsLoading(false);
            return;
        }
        loadAllData();
    }, [isSupabaseConfigured, isAuthenticated, loadAllData]);

    useEffect(() => {
        if (!isSupabaseConfigured) return;
        const supabase = getSupabase();
        const channel = supabase
            .channel('customers-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'customers' },
                () => {
                    loadAllData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isSupabaseConfigured, loadAllData]);

    useEffect(() => {
    }, [currentPage, jobs, isAIOff]);

    const pendingApprovalCount = useMemo(() => {
        if (!currentUser || !applications) return 0;
        return applications.filter(app => app.approverId === currentUser.id && app.status === 'pending_approval').length;
    }, [currentUser, applications]);

    const accountingCounts = useMemo<AccountingBadgeCounts>(() => {
        if (!applications) return {};
        const approved = applications.filter(app => app.status === 'approved');
        const journalReview = approved.filter(app => {
            const st = app.accounting_status ?? app.accountingStatus;
            return !st || st === AccountingStatus.NONE || st === AccountingStatus.DRAFT;
        }).length;
        const approvedApplications = approved.filter(app => {
            const st = app.accounting_status ?? app.accountingStatus;
            return st !== AccountingStatus.POSTED;
        }).length;
        return {
            journalReview: journalReview || undefined,
            approvedApplications: approvedApplications || undefined,
        };
    }, [applications]);

    // Data Handlers
    const handleAddJob = async (jobData: JobCreationPayload) => {
        await dataService.addJob(jobData);
        addToast('案件が正常に追加されました。', 'success');
        await loadAllData();
    };
    const handleCreateCustomerInline = async (customerData: Partial<Customer>): Promise<Customer> => {
        const payload: Partial<Customer> = {
            userId: customerData.userId ?? currentUser?.id ?? undefined,
            ...customerData,
        };
        const created = await dataService.addCustomer(payload);
        // まず即座に追加し、続けて全体リロードで整合性を保つ
        setCustomers(prev => {
            const next = [created, ...prev];
            return next.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });
        });
        console.log('[inline customer] created', created.customerName || created.id);
        await loadAllData();
        addToast('顧客を登録しました。', 'success');
        return created;
    };
    const handleCreatePaymentRecipientInline = async (recipientData: Partial<PaymentRecipient>): Promise<PaymentRecipient> => {
        const created = await dataService.createPaymentRecipient(recipientData);
        setPaymentRecipients(prev => [created, ...prev]);
        addToast('支払先を登録しました。', 'success');
        return created;
    };
    const handleUpdateJob = async (jobId: string, updatedData: Partial<Job>) => {
        await dataService.updateJob(jobId, updatedData);
        addToast('案件が更新されました。', 'success');
        await loadAllData();
    };
    const handleDeleteJob = async (jobId: string) => {
        await dataService.deleteJob(jobId);
        addToast('案件が削除されました。', 'success');
        setJobDetailModalOpen(false);
        await loadAllData();
    };
    const handleAddLead = async (leadData: Partial<Lead>) => {
        await dataService.addLead(leadData);
        addToast('リードが追加されました。', 'success');
        setCreateLeadModalOpen(false);
        await loadAllData();
    };
    const handleUpdateLead = async (leadId: string, updatedData: Partial<Lead>) => {
        await dataService.updateLead(leadId, updatedData);
        addToast('リードが更新されました。', 'success');
        await loadAllData();
    };
    const handleDeleteLead = async (leadId: string) => {
        await dataService.deleteLead(leadId);
        addToast('リードが削除されました。', 'success');
        await loadAllData();
    };
    const handleSaveCustomer = async (customerData: Partial<Customer>) => {
        if (customerData.id) {
            await dataService.updateCustomer(customerData.id, customerData);
            addToast('顧客情報が更新されました。', 'success');
            await loadAllData();
        } else {
            await handleCreateCustomerInline(customerData);
        }
        setCustomerDetailModalOpen(false);
        setCustomerInitialValues(null);
    };

    const handleUpdateCustomer = async (customerId: string, customerData: Partial<Customer>) => {
        await dataService.updateCustomer(customerId, customerData);
        addToast('顧客情報が更新されました。', 'success');
        await loadAllData();
    };

    const handleAddPurchaseOrder = async (orderData: Omit<PurchaseOrder, 'id'>) => {
        await dataService.addPurchaseOrder(orderData);
        addToast('発注が追加されました。', 'success');
        setCreatePOModalOpen(false);
        await loadAllData();
    };

    const handleSaveInventoryItem = async (itemData: Partial<InventoryItem>) => {
        if (itemData.id) {
            await dataService.updateInventoryItem(itemData.id, itemData);
            addToast('在庫品目が更新されました。', 'success');
        } else {
            await dataService.addInventoryItem(itemData as Omit<InventoryItem, 'id'>);
            addToast('在庫品目が追加されました。', 'success');
        }
        setIsCreateInventoryItemModalOpen(false);
        await loadAllData();
    };


    const handleAnalyzeCustomer = async (customer: Customer) => {
        setAnalysisError('');
        if (customer.aiAnalysis) {
            setCompanyAnalysis(customer.aiAnalysis);
            setAnalysisModalOpen(true);
            return;
        }
        setCompanyAnalysis(null);
        setAnalysisLoading(true);
        setAnalysisModalOpen(true);
        try {
            const analysis = await geminiService.analyzeCompany(customer);
            await handleUpdateCustomer(customer.id, { aiAnalysis: analysis });
            setCompanyAnalysis(analysis);
        } catch (e: any) {
            if (e.name === 'AbortError') return;
            setAnalysisError(e.message);
        } finally {
            setAnalysisLoading(false);
        }
    };

    const handleSaveBugReport = async (report: Omit<BugReport, 'id' | 'createdAt' | 'status' | 'reporterName'>) => {
        if (!currentUser) {
            addToast('ユーザー情報が見つかりません。', 'error');
            return;
        }
        await dataService.addBugReport({ ...report, reporterName: currentUser.name });
        addToast('ご報告ありがとうございます。内容を受け付けました。', 'success');
    };

    const handleAddEstimate = async (estimateData: Partial<Estimate>) => {
        if (estimateData.id) {
            await dataService.updateEstimate(estimateData.id, estimateData);
        } else {
            await dataService.addEstimate(estimateData);
        }
        await loadAllData({ estimatesPage: 1 });
    };

    const handleEstimatePageChange = async (page: number) => {
        await refreshEstimatesPage(page);
    };

    const onPrimaryAction = () => {
        if (dbError) {
            addToast('データベース接続エラーのため、この操作は実行できません。', 'error');
            return;
        }
        switch (currentPage) {
            case 'sales_orders': setCreateJobModalOpen(true); break;
            case 'sales_leads': setCreateLeadModalOpen(true); break;
            case 'sales_customers':
            case 'sales_customers_chart':
                setSelectedCustomer(null);
                setCustomerModalMode('new');
                setCustomerInitialValues(currentPage === 'sales_customers_chart' ? { is_customer_chart: true } : { is_customer_chart: false });
                setCustomerDetailModalOpen(true);
                break;
            case 'purchasing_orders': setCreatePOModalOpen(true); break;
            case 'inventory_management':
                setSelectedInventoryItem(null);
                setIsCreateInventoryItemModalOpen(true);
                break;
            case 'sales_estimates':
                handleNavigate('simple_estimates');
                break;
            default:
                break;
        }
    };

    // Render Logic
    const renderContent = () => {
        switch (currentPage) {
            case 'analysis_dashboard':
                return <TurnaroundPlanPage />;
            case 'sales_dashboard':
                return <SalesDashboard jobs={jobs} leads={leads} />;
            case 'sales_orders':
                return (
                    <OrderLedgerManagementPage
                        currentUser={currentUser}
                        onToast={addToast}
                    />
                );
            case 'sales_personal_dashboard':
    return (
        <SalesPersonalDashboardPage
            currentUser={currentUser}
        />
    );
            case 'sales_customers':
            case 'sales_customers_chart':
                if (showBulkOCR) {
                    return <BusinessCardOCR
                        addToast={addToast}
                        requestConfirmation={requestConfirmation}
                        isAIOff={isAIOff}
                        onCustomerAdded={(customer) => {
                            loadAllData();
                        }}
                    />;
                }
                const isChartMode = currentPage === 'sales_customers_chart';
                const filteredCustomersList = (customers || []).filter(c => isChartMode ? c.is_customer_chart === true : !c.is_customer_chart);

                return <CustomerList
                    customers={filteredCustomersList}
                    searchTerm={searchTerm}
                    isChartMode={isChartMode}
                    onSelectCustomer={(customer) => {
                        setSelectedCustomer(customer);
                        handleNavigate('customer_dashboard');
                    }}
                    onUpdateCustomer={handleUpdateCustomer}
                    onAnalyzeCustomer={handleAnalyzeCustomer}
                    addToast={addToast}
                    currentUser={currentUser}
                    onNewCustomer={() => {
                        setCustomerInitialValues(isChartMode ? { is_customer_chart: true } : { is_customer_chart: false });
                        setSelectedCustomer(null);
                        setCustomerModalMode('new');
                        setCustomerDetailModalOpen(true);
                    }}
                    isAIOff={isAIOff}
                    onShowBulkOCR={() => setShowBulkOCR(true)}
                />;
            case 'newsletter':
                return <NewsletterPage customers={customers} addToast={addToast} />;
            case 'email_auto_reply':
                return <EmailAutoReplyPage currentUser={currentUser} isAIOff={isAIOff} />;
            case 'sales_leads':
                return <LeadManagementPage
                    leads={leads}
                    searchTerm={searchTerm}
                    onRefresh={loadAllData}
                    onUpdateLead={handleUpdateLead}
                    onDeleteLead={handleDeleteLead}
                    addToast={addToast}
                    requestConfirmation={requestConfirmation}
                    currentUser={currentUser}
                    isAIOff={isAIOff}
                    onAddEstimate={handleAddEstimate}
                    customers={customers}
                    onNavigate={handleNavigate}
                    orderedCompanyNames={orderedCompanyNames}
                    onCreateExistingCustomerLead={async (leadData) => {
                        await dataService.addLead(leadData);
                        await loadAllData();
                        addToast('既存顧客のリードを追加しました。', 'success');
                    }}
                />;
            case 'admin_user_management':
                return <UserManagementPage addToast={addToast} requestConfirmation={requestConfirmation} currentUser={currentUser} onUserChange={onUserChange} />;
            case 'admin_route_management':
                return <ApprovalRouteManagementPage addToast={addToast} requestConfirmation={requestConfirmation} />;
            case 'admin_master_management':
                return <MasterManagementPage
                    accountItems={accountItems}
                    paymentRecipients={paymentRecipients}
                    allocationDivisions={allocationDivisions}
                    departments={departments}
                    titles={titles}
                    fixedCosts={fixedCosts}
                    onSaveAccountItem={async (item: Partial<AccountItem>) => { await dataService.saveAccountItem(item); await loadAllData(); addToast('勘定科目を保存しました。', 'success'); }}
                    onDeleteAccountItem={async (id: string) => { await dataService.deactivateAccountItem(id); await loadAllData(); addToast('勘定科目を無効化しました。', 'success'); }}
                    onSavePaymentRecipient={async (item: Partial<PaymentRecipient>) => { await dataService.savePaymentRecipient(item); await loadAllData(); addToast('支払先を保存しました。', 'success'); }}
                    onDeletePaymentRecipient={async (id: string) => { await dataService.deletePaymentRecipient(id); await loadAllData(); addToast('支払先を削除しました。', 'success'); }}
                    onSaveAllocationDivision={async (item: Partial<AllocationDivision>) => { await dataService.saveAllocationDivision(item); await loadAllData(); addToast('振分区分を保存しました。', 'success'); }}
                    onDeleteAllocationDivision={async (id: string) => { await dataService.deleteAllocationDivision(id); await loadAllData(); addToast('振分区分を削除しました。', 'success'); }}
                    onSaveDepartment={async (item: Partial<Department>) => { await dataService.saveDepartment(item); await loadAllData(); addToast('部署を保存しました。', 'success'); }}
                    onDeleteDepartment={async (id: string) => { await dataService.deleteDepartment(id); await loadAllData(); addToast('部署を削除しました。', 'success'); }}
                    onSaveTitle={async (item: Partial<Title>) => { await dataService.saveTitle(item); await loadAllData(); addToast('役職を保存しました。', 'success'); }}
                    onDeleteTitle={async (id: string) => { await dataService.deleteTitle(id); await loadAllData(); addToast('役職を削除しました。', 'success'); }}
                    onSaveFixedCost={async (item: Partial<FixedCost>) => { await dataService.saveFixedCost(item); await loadAllData(); addToast('固定費設定を保存しました。', 'success'); }}
                    onDeleteFixedCost={async (id: string) => { await dataService.deleteFixedCost(id); await loadAllData(); addToast('固定費設定を削除しました。', 'success'); }}
                    addToast={addToast}
                    requestConfirmation={requestConfirmation}
                />;
            case 'settings':
                return <EmailNotificationSettingsPage
                    addToast={addToast}
                    currentUser={currentUser}
                />;
            case 'accounting_journal':
                return <AccountingPage page={currentPage} journalEntries={journalEntries || []} accountItems={accountItems || []} onAddEntry={async (entry: any) => { await dataService.addJournalEntry(entry); loadAllData(); }} addToast={addToast} requestConfirmation={requestConfirmation} jobs={jobs || []} applications={applications || []} onNavigate={handleNavigate} isAIOff={isAIOff} customers={customers || []} employees={employees || []} onRefreshData={loadAllData} currentUser={currentUser} />;
            case 'inventory_management':
                return <InventoryManagementPage inventoryItems={inventoryItems || []} onSelectItem={(item) => { setSelectedInventoryItem(item); setIsCreateInventoryItemModalOpen(true); }} />;
            case 'manufacturing_progress':
                return <ManufacturingPipelinePage jobs={jobs || []} onUpdateJob={handleUpdateJob} onCardClick={(job) => { setSelectedJob(job); setJobDetailModalOpen(true); }} />;
            case 'manufacturing_orders':
                return <ManufacturingOrdersPage jobs={jobs || []} onSelectJob={(job) => { setSelectedJob(job); setJobDetailModalOpen(true); }} />;
            case 'manufacturing_cost':
                return <ManufacturingCostManagement jobs={jobs || []} />;
            case 'purchasing_orders':
                return <PurchasingManagementPage purchaseOrders={purchaseOrders || []} jobs={jobs || []} />;
            case 'purchasing_invoices':
                return (
                    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">請求書インポート (OCR)</h1>
                            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                                写真やPDF、CSVから請求書の内容を読み取り、仕入/経費データの入力を自動化します。
                            </p>
                        </div>
                        <InvoiceOCR
                            onSaveExpenses={(data) => {
                                addToast(`「${data.vendorName || data.documentType}」のデータを取得しました。`, 'success');
                            }}
                            addToast={addToast}
                            requestConfirmation={requestConfirmation}
                            isAIOff={isAIOff}
                        />
                    </div>
                );
            case 'simple_estimates':
                return <AIEstimateCreation />;
            case 'new_ai_estimate':
                return <AIEstimateCreation />;
            case 'quote_center':
                return <QuoteCenter />;
            case 'print_estimate_app':
                return <PrintEstimateApp />;
            case 'strac_analysis':
                return <STRACAnalysisPage />;
            case 'sales_estimates':
                return <EstimateManagementPage
                    estimates={estimates || []}
                    estimateTotalCount={estimateTotalCount}
                    estimatePage={estimatePage}
                    estimatePageSize={ESTIMATE_PAGE_SIZE}
                    onEstimatePageChange={handleEstimatePageChange}
                    customers={customers || []}
                    allUsers={allUsers || []}
                    onAddEstimate={handleAddEstimate}
                    addToast={addToast}
                    currentUser={currentUser}
                    searchTerm={searchTerm}
                    isAIOff={isAIOff}
                    onNavigate={handleNavigate}
                />;
            case 'detailed_estimate':
                return <DetailedEstimateForm
                    onBack={() => handleNavigate('sales_estimates')}
                    onSaveSuccess={() => {
                        addToast('見積を保存しました', 'success');
                        handleNavigate('sales_estimates');
                    }}
                    addToast={addToast}
                />;
            case 'analysis_ranking':
                return <SalesRanking initialSummaries={jobs || []} customers={customers || []} />;
            case 'accounting_business_plan':
                if (currentUser?.role !== 'admin') {
                    return (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-8">
                            <h2 className="text-xl font-semibold text-slate-800 dark:text-white">経営計画は管理者専用です</h2>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                閲覧権限が必要です。管理者に相談してください。
                            </p>
                        </div>
                    );
                }
                return <AccountingBusinessPlanPage allUsers={allUsers} />;
            case 'accounting_dashboard':
                return <AccountingDashboard setCurrentView={handleNavigate} />;
            case 'accounting_journal_review':
                return <JournalReviewPage notify={addToast} onNavigate={handleNavigate} />;
            case 'accounting_general_ledger':
                return <GeneralLedger />;
            case 'accounting_payables':
                return <PayablesPage />;
            case 'accounting_receivables':
                return <ReceivablesPage />;
            case 'accounting_cash_schedule':
                return <CashSchedulePage />;
            case 'accounting_expense_analysis':
                return <ExpenseAnalysisPage />;
            case 'accounting_profit_loss':
                return <ProfitLossPage />;
            case 'accounting_balance_sheet':
                return <BalanceSheetPage />;
            case 'accounting_tax_summary':
                return <TaxSummaryPage />;
            case 'accounting_period_closing':
                return <PeriodClosingPage addToast={addToast} jobs={jobs || []} applications={applications || []} journalEntries={journalEntries || []} onNavigate={handleNavigate} />;
            case 'accounting_approved_applications':
                return <ApprovedApplications notify={addToast} currentUserId={currentUser?.id} onNavigate={handleNavigate} />;
            case 'accounting_approved_unhandled':
                return (
                    <UnhandledItemsPage
                        leads={leads}
                        onUpdateLead={handleUpdateLead}
                        onNavigate={handleNavigate}
                        notify={addToast}
                        currentUserId={currentUser?.id ?? null}
                    />
                );
            case 'bulletin_board':
                return <BulletinBoardPage currentUser={currentUser} addToast={addToast} allUsers={allUsers} />;
            case 'knowledge_base':
                return <KnowledgeBasePage currentUser={currentUser} addToast={addToast} allUsers={allUsers} />;
            case 'approval_list':
                return <ApprovalWorkflowPage currentUser={currentUser} view="list" addToast={addToast} searchTerm={searchTerm} onResumeDraft={handleResumeApplicationDraft} />;
            case 'approval_form_expense': return <ApprovalWorkflowPage currentUser={currentUser} view="form" formCode="EXP" addToast={addToast} customers={customers} accountItems={accountItems} jobs={jobs} purchaseOrders={purchaseOrders} departments={departments} isAIOff={isAIOff} allocationDivisions={allocationDivisions} paymentRecipients={paymentRecipients} onCreatePaymentRecipient={handleCreatePaymentRecipientInline} resumedApplication={resumedApplication} onResumeDraftClear={clearResumedApplication} />;
            case 'approval_form_transport': return <ApprovalWorkflowPage currentUser={currentUser} view="form" formCode="TRP" addToast={addToast} isAIOff={isAIOff} resumedApplication={resumedApplication} onResumeDraftClear={clearResumedApplication} />;
            case 'approval_form_leave': return <ApprovalWorkflowPage currentUser={currentUser} view="form" formCode="LEV" addToast={addToast} isAIOff={isAIOff} resumedApplication={resumedApplication} onResumeDraftClear={clearResumedApplication} />;
            case 'approval_form_approval': return <ApprovalWorkflowPage currentUser={currentUser} view="form" formCode="APL" addToast={addToast} isAIOff={isAIOff} resumedApplication={resumedApplication} onResumeDraftClear={clearResumedApplication} />;
            case 'approval_form_daily':
                return <ApprovalWorkflowPage currentUser={currentUser} view="form" formCode="DLY" addToast={addToast} isAIOff={isAIOff} resumedApplication={resumedApplication} onResumeDraftClear={clearResumedApplication} customers={customers} />;
            case 'business_forms_hub':
                return <BusinessFormsHub onNavigate={handleNavigate} />;
            case 'business_order':
                return <OrderForm onBack={() => handleNavigate('business_forms_hub')} />;
            case 'business_production':
                return <ProductionOrderForm onBack={() => handleNavigate('business_forms_hub')} />;
            case 'detailed_estimate':
                return (
                    <DetailedEstimateForm
                        onBack={() => handleNavigate('business_forms_hub')}
                        onSaveSuccess={() => {
                            handleNavigate('business_forms_hub');
                        }}
                    />
                );
            case 'customer_dashboard':
                return selectedCustomer ? (
                    <CustomerDashboard
                        customer={selectedCustomer}
                        onBack={() => handleNavigate('sales_customers')}
                    />
                ) : null;
            case 'daily_report_progress':
                return <DailyReportProgressPage currentUser={currentUser} addToast={addToast} />;
            case 'proposal_ai':
                return <DocumentCreationHub />;
            case 'document_creation_tools':
                return <DocumentCreationHub />;
            case 'pdf_editing_tools':
                return <PDFEditingHub />;
            case 'dtp_tools':
                return <DTPHub />;
            case 'prompt_management':
                return <PromptManagementPage currentUser={currentUser} addToast={addToast} />;
            case 'ai_business_consultant':
                return <AIChatPage currentUser={currentUser} jobs={jobs} customers={customers} journalEntries={journalEntries} />;
            case 'ai_market_research':
                return <MarketResearchPage addToast={addToast} isAIOff={isAIOff} />;
            case 'ai_transcription':
                return <AITranscriptionPage addToast={addToast} isAIOff={isAIOff} />;
            case 'meeting_minutes':
                return <MeetingMinutesIframe />;
            case 'my_schedule':
                return (
                    <MySchedulePage
                        jobs={jobs}
                        purchaseOrders={purchaseOrders}
                        applications={applications}
                        currentUser={currentUser}
                        allUsers={allUsers}
                        addToast={addToast}
                        onCreateDailyReport={handleCreateDailyReport}
                        onRefreshGoogleAuthStatus={handleRefreshGoogleAuthStatus}
                        onStartGoogleCalendarAuth={handleStartGoogleCalendarAuth}
                        onDisconnectGoogleCalendar={handleDisconnectGoogleCalendar}
                        googleAuthConnected={googleAuthStatus.connected}
                        googleAuthExpiresAt={googleAuthStatus.expiresAt}
                        isGoogleAuthLoading={isGoogleAuthLoading}
                        googleAuthStatusLoading={googleAuthStatus.loading}
                    />
                );
            case 'accounting_approved_expense':
                return (
                    <ApprovedApplications
                        notify={addToast}
                        codes={['EXP']}
                        title="承認済み（経費精算）"
                        description="経費精算（EXP）の承認済み申請です。"
                        showLeaveSync={false}
                        currentUserId={currentUser?.id}
                        onNavigate={handleNavigate}
                    />
                );
            case 'accounting_approved_transport':
                return (
                    <ApprovedApplications
                        notify={addToast}
                        codes={['TRP']}
                        title="承認済み（交通費）"
                        description="交通費申請（TRP）の承認済みデータです。"
                        showLeaveSync={false}
                        currentUserId={currentUser?.id}
                        onNavigate={handleNavigate}
                    />
                );
            case 'accounting_approved_leave':
                return (
                    <ApprovedApplications
                        notify={addToast}
                        codes={['LEV']}
                        title="承認済み（休暇）"
                        description="休暇申請（LEV）の承認済みデータです。全員カレンダー同期ボタンを使えます。"
                        showLeaveSync
                        currentUserId={currentUser?.id}
                        onNavigate={handleNavigate}
                    />
                );
            case 'accounting_approved_apl':
                return (
                    <ApprovedApplications
                        notify={addToast}
                        codes={['APL']}
                        title="承認済み（稟議）"
                        description="稟議申請（APL）の承認済みデータです。"
                        showLeaveSync={false}
                        currentUserId={currentUser?.id}
                        onNavigate={handleNavigate}
                    />
                );
            case 'accounting_approved_dly':
                return (
                    <ApprovedApplications
                        notify={addToast}
                        codes={['DLY']}
                        title="承認済み（日報）"
                        description="日報（DLY）の承認済みデータです。"
                        showLeaveSync={false}
                        currentUserId={currentUser?.id}
                        onNavigate={handleNavigate}
                    />
                );
            case 'admin_audit_log':
                return <AuditLogPage />;
            case 'admin_journal_queue':
                return <JournalQueuePage />;
            case 'admin_action_console':
                // @ts-ignore - TODO: Add 'admin_action_console' to Page type if needed
                return <ActionConsolePage />;
            case 'turnaround_plan':
                return <TurnaroundPlanPage />;
            case 'sales_pipeline':
                return <SalesPipelinePage jobs={jobs || []} onUpdateJob={handleUpdateJob} onCardClick={(job) => { setSelectedJob(job); setJobDetailModalOpen(true); }} />;
            case 'sales_billing':
                return <LegacyInvoiceBillingPage />;
            case 'legacy_billing':
                return <CustomerInvoiceManagementPage />;
            case 'project_management':
                return <ProjectManagementPage projects={projects || []} onRefresh={loadAllData} isLoading={isLoading} />;
            case 'purchasing_payments':
                return <PaymentManagement journalEntries={journalEntries || []} onExecutePayment={async (supplier, amount) => { addToast(`${supplier} への ¥${amount.toLocaleString()} の支払処理を実行しました。`, 'success'); loadAllData(); }} />;
            case 'hr_labor_cost':
                return <LaborCostManagement employees={employees || []} />;
            case 'fax_ocr_intake':
                return <FaxOcrIntakePage currentUser={currentUser} addToast={addToast} onNavigateToOrders={() => handleNavigate('sales_orders')} onNavigateToEstimates={() => handleNavigate('sales_estimates')} customers={customers || []} paymentRecipients={paymentRecipients || []} />;
            case 'accounting_trial_balance':
                return <TrialBalancePage />;
            default:
                return <PlaceholderPage title={PAGE_TITLES[currentPage] || currentPage} />;
        }
    };

    if (shouldRequireAuth && isAuthCallbackRoute) {
        return <AuthCallbackPage />;
    }

    if (!isSupabaseConfigured) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-6">
                <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 space-y-4 text-center">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Supabase接続設定が必要です</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        データベースと認証を利用するには、プロジェクトルートの <code className="font-mono px-1 py-0.5 bg-slate-100 dark:bg-slate-900 rounded">supabaseCredentials.ts</code> に
                        SupabaseのURLとAnon Keyを設定してください。
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Supabaseダッシュボードの「Project Settings &gt; API」で確認できます。
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        設定後に再読み込み
                    </button>
                </div>
            </div>
        );
    }

    if (shouldRequireAuth && isAuthChecking) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-sm">ログイン状態を確認しています...</p>
            </div>
        );
    }

    if (shouldRequireAuth && !isAuthenticated) {
        return (
            <>
                {authError && (
                    <div className="w-full bg-red-600 text-white text-center text-sm font-semibold py-3 px-4">
                        {authError}
                    </div>
                )}
                {authView === 'login' ? (
                    <LoginPage onSwitchToRegister={() => setAuthView('register')} />
                ) : (
                    <RegisterPage onBackToLogin={() => setAuthView('login')} />
                )}
            </>
        );
    }

    const headerConfig = {
        title: PAGE_TITLES[currentPage],
        primaryAction: PRIMARY_ACTION_ENABLED_PAGES.includes(currentPage)
            ? { label: `新規${PAGE_TITLES[currentPage].replace('管理', '')}作成`, onClick: onPrimaryAction, icon: PlusCircle, disabled: !!dbError, tooltip: dbError ? 'データベース接続エラーのため利用できません。' : undefined }
            : undefined,
        secondaryActions: undefined,
        darkMode: {
            isDark: isDarkMode,
            onToggle: () => setIsDarkMode(prev => !prev),
        },
        search: SEARCH_ENABLED_PAGES.includes(currentPage)
            ? { value: searchTerm, onChange: setSearchTerm, placeholder: `${PAGE_TITLES[currentPage]}を検索...`, suggestions: predictiveSuggestions }
            : undefined,
    };

    return (
        <div className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans flex mq-theme">
            <Sidebar
                currentPage={currentPage}
                onNavigate={handleNavigate}
                currentUser={currentUser}
                supabaseUserEmail={user?.email}
                onSignOut={handleSignOut}
                approvalsCount={pendingApprovalCount}
                accountingCounts={accountingCounts}
            />
            <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 relative min-h-0">
                {dbError && <GlobalErrorBanner error={dbError} onRetry={loadAllData} onShowSetup={() => setIsSetupModalOpen(true)} />}
                {/* Mobile header */}
                <div className="sm:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 p-4 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                // 直接サイドバーの状態を変更
                                const sidebarElement = document.querySelector('[data-sidebar-mobile-toggle]') as HTMLElement;
                                if (sidebarElement) {
                                    // サイドバーを開くためにモバイル状態を変更
                                    const event = new CustomEvent('open-mobile-sidebar', { bubbles: true });
                                    sidebarElement.dispatchEvent(event);
                                }
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-200">文唱堂印刷 業務管理</h1>
                        <div className="w-8"></div>
                    </div>
                </div>
                <div className={`flex-1 overflow-y-auto pt-20 sm:pt-0 bg-slate-50 dark:bg-slate-900 transition-opacity duration-150 ${isLoading && !dbError ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Header {...headerConfig} />
                    <PageShell padding="none">
                        {renderContent()}
                    </PageShell>
                </div>
                {isLoading && !dbError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 z-20">
                        <Loader className="w-12 h-12 animate-spin text-blue-500" />
                    </div>
                )}
            </main>

            {/* Modals */}
            {isCreateJobModalOpen && <CreateJobModal isOpen={isCreateJobModalOpen} onClose={() => setCreateJobModalOpen(false)} onAddJob={handleAddJob} customers={customers} onCreateCustomer={handleCreateCustomerInline} />}
            {isCreateLeadModalOpen && <CreateLeadModal isOpen={isCreateLeadModalOpen} onClose={() => setCreateLeadModalOpen(false)} onAddLead={handleAddLead} />}
            {isCreatePOModalOpen && (
                <CreatePurchaseOrderModal
                    isOpen={isCreatePOModalOpen}
                    onClose={() => setCreatePOModalOpen(false)}
                    onAddPurchaseOrder={handleAddPurchaseOrder}
                    paymentRecipients={paymentRecipients}
                    onCreatePaymentRecipient={handleCreatePaymentRecipientInline}
                />
            )}
            {isCreateInventoryItemModalOpen && <CreateInventoryItemModal isOpen={isCreateInventoryItemModalOpen} onClose={() => setIsCreateInventoryItemModalOpen(false)} onSave={handleSaveInventoryItem} item={selectedInventoryItem} />}
            {isJobDetailModalOpen && <JobDetailModal isOpen={isJobDetailModalOpen} job={selectedJob} onClose={() => setJobDetailModalOpen(false)} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} requestConfirmation={requestConfirmation} onNavigate={handleNavigate} addToast={addToast} />}
            {isCustomerDetailModalOpen && (
                <CustomerDetailModal
                    customer={selectedCustomer}
                    mode={customerModalMode}
                    onClose={() => { setCustomerDetailModalOpen(false); setCustomerInitialValues(null); }}
                    onSave={handleSaveCustomer}
                    onSetMode={setCustomerModalMode}
                    onAnalyzeCustomer={handleAnalyzeCustomer}
                    isAIOff={isAIOff}
                    initialValues={customerInitialValues}
                    addToast={addToast}
                    currentUser={currentUser}
                    allUsers={allUsers}
                    onAutoCreateCustomer={handleCreateCustomerInline}
                />
            )}
            {isAnalysisModalOpen && <CompanyAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setAnalysisModalOpen(false)} analysis={companyAnalysis} customer={selectedCustomer} isLoading={isAnalysisLoading} error={analysisError} currentUser={currentUser} isAIOff={isAIOff} onReanalyze={handleAnalyzeCustomer} />}
            {isBugReportModalOpen && <BugReportChatModal isOpen={isBugReportModalOpen} onClose={() => setIsBugReportModalOpen(false)} onReportSubmit={handleSaveBugReport} isAIOff={isAIOff} />}
            {isSetupModalOpen && <DatabaseSetupInstructionsModal onRetry={() => { setIsSetupModalOpen(false); loadAllData(); }} />}
            {showFeatureUpdateModal && currentUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">本日の追加機能</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                    連携と入力を少しだけ楽にしました。
                                </p>
                            </div>
                            <button onClick={handleDismissFeatureModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">×</button>
                        </div>
                        <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-100 list-disc list-inside">
                            <li>日報フォームに顧客マスタのオートコンプリートを追加しました。</li>
                            <li>名刺取り込みで「取得イベント」「受領者（社員番号/氏名）」を入力し、赤ペンの社員番号と突合できるようになりました。</li>
                            <li>Googleカレンダー連携をここから開始できます。</li>
                        </ul>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleDismissFeatureModal}
                                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200"
                            >
                                閉じる
                            </button>
                            <button
                                type="button"
                                onClick={handleStartGoogleCalendarAuth}
                                disabled={isGoogleAuthLoading}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${isGoogleAuthLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {isGoogleAuthLoading ? '開始中...' : 'Google連携を開始'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global UI */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <ConfirmationDialog {...confirmationDialog} />
            <UpdateModal isOpen={showUpdateModal} onClose={() => setShowUpdateModal(false)} />
        </div>
    );
};

export default App;
