import { Application, ApplicationWithDetails, ApprovalRoute } from '../types';
import { getSupabase } from './supabaseClient';
import { formatDateTime } from '../utils';

export type ApprovalNotificationType = 'submitted' | 'approved' | 'rejected' | 'step_forward';

export interface ApprovalNotificationPayload {
    type: ApprovalNotificationType;
    application: Application | ApplicationWithDetails;
    recipientEmail?: string | null;
    recipientUserId?: string | null;
    metadata?: Record<string, any>;
}

type SupabaseClient = ReturnType<typeof getSupabase>;

interface UserSummary {
  id: string;
  name: string | null;
  email: string | null;
  notification_enabled: boolean | null;
}

const userCache = new Map<string, UserSummary>();
const applicationCodeCache = new Map<string, string>();

const SUBJECT_TEMPLATES: Record<ApprovalNotificationType, string> = {
    submitted: '【承認依頼】{code} の申請が提出されました',
    step_forward: '【承認依頼】{code} の承認ステップが割り当てられました',
    approved: '【承認完了】{code} の申請が承認されました',
    rejected: '【差し戻し】{code} の申請が差し戻されました',
};

const BODY_INTRO: Record<ApprovalNotificationType, string> = {
    submitted: '以下の申請が提出されました。承認一覧より内容を確認し、対応をお願いします。',
    step_forward: 'あなたの承認ステップが割り当てられました。内容を確認のうえ承認/差戻しを行ってください。',
    approved: '申請が最終承認されました。完了内容をご確認ください。',
    rejected: '申請が差し戻されました。理由をご確認のうえ再申請をお願いいたします。',
};

type NotificationTemplateOverrides = Partial<Record<ApprovalNotificationType, { subject?: string; body?: string }>>;

const TEMPLATE_STORAGE_KEY = 'notificationTemplates';

const loadNotificationTemplateOverrides = (): NotificationTemplateOverrides | null => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('[notification] Failed to parse custom templates', error);
        return null;
    }
};

const replaceTokens = (template: string, values: Record<string, string>): string => {
    return Object.entries(values).reduce((acc, [key, value]) => {
        const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        return acc.replace(pattern, value ?? '');
    }, template);
};

const applyTemplateOverrides = (
    type: ApprovalNotificationType,
    fallbackSubject: string,
    fallbackBody: string,
    tokens: Record<string, string>
): { subject: string; body: string } => {
    const overrides = loadNotificationTemplateOverrides();
    const selectedSubject = overrides?.[type]?.subject?.trim() ? overrides[type]!.subject! : fallbackSubject;
    const selectedBody = overrides?.[type]?.body?.trim() ? overrides[type]!.body! : fallbackBody;

    return {
        subject: replaceTokens(selectedSubject, tokens),
        body: replaceTokens(selectedBody, tokens),
    };
};

const resolveUserById = async (supabase: SupabaseClient, userId?: string | null): Promise<UserSummary | null> => {
    if (!userId) return null;
    if (userCache.has(userId)) {
        return userCache.get(userId)!;
    }
    const { data, error } = await supabase
        .from('users')
        .select('id, name, email, notification_enabled')
        .eq('id', userId)
        .limit(1)
        .single();

    if (error) {
        console.warn('[notification] ユーザー情報の取得に失敗しました', userId, error);
        return null;
    }
    if (!data) {
        return null;
    }
    userCache.set(userId, data as UserSummary);
    return data as UserSummary;
};

const resolveApplicationCodeName = async (
    supabase: SupabaseClient,
    applicationCodeId?: string | null
): Promise<string | null> => {
    if (!applicationCodeId) return null;
    if (applicationCodeCache.has(applicationCodeId)) {
        return applicationCodeCache.get(applicationCodeId)!;
    }
    const { data, error } = await supabase
        .from('application_codes')
        .select('id, name')
        .eq('id', applicationCodeId)
        .limit(1)
        .single();

    if (error) {
        console.warn('[notification] 申請コード情報の取得に失敗しました', applicationCodeId, error);
        return null;
    }
    if (!data) {
        return null;
    }
    const name = (data as { name?: string | null })?.name ?? null;
    if (name) {
        applicationCodeCache.set(applicationCodeId, name);
    }
    return name;
};

const resolveRecipients = async (
  supabase: SupabaseClient,
  payload: ApprovalNotificationPayload,
): Promise<string[]> => {
  const recipients = new Set<string>();

  if (payload.recipientUserId) {
    const summary = await resolveUserById(supabase, payload.recipientUserId);

    if (summary?.notification_enabled !== false && summary?.email?.includes('@')) {
      recipients.add(summary.email.trim());
    }

    return Array.from(recipients);
  }

  if (payload.recipientEmail?.includes('@')) {
    recipients.add(payload.recipientEmail.trim());
  }

  return Array.from(recipients);
};

const buildApplicantLabel = (application: Application | ApplicationWithDetails, applicant?: UserSummary | null) => {
    if (application && 'applicant' in application && application.applicant?.name) {
        const email = application.applicant?.email ? ` (${application.applicant.email})` : '';
        return `${application.applicant.name}${email}`;
    }
    if (applicant) {
        const email = applicant.email ? ` (${applicant.email})` : '';
        return `${applicant.name ?? '氏名未設定'}${email}`;
    }
    return application.applicantId ?? '不明な申請者';
};

const buildEmailContent = async (
    supabase: SupabaseClient,
    payload: ApprovalNotificationPayload
): Promise<{ subject: string; body: string }> => {
    const application = payload.application;
    const [applicantSummary, applicationCodeName] = await Promise.all([
        resolveUserById(supabase, application.applicantId),
        resolveApplicationCodeName(supabase, application.applicationCodeId),
    ]);

    const codeLabel =
        (application && 'applicationCode' in application && application.applicationCode?.name) ||
        applicationCodeName ||
        application.applicationCodeId ||
        '申請';
    const applicantLabel = buildApplicantLabel(application, applicantSummary);
    const intro = BODY_INTRO[payload.type];

    const details: string[] = [
        `申請ID: ${application.id}`,
        `申請種別: ${codeLabel}`,
        `申請者: ${applicantLabel}`,
        `ステータス: ${application.status}`,
        `承認ルートID: ${application.approvalRouteId ?? '-'}`,
        `現在の承認レベル: ${application.currentLevel ?? '-'}`,
    ];

    const formData: any = (application as any).formData || null;
    const mq = formData?.mqAccounting || null;
    if (mq) {
        const mqLines: string[] = [];
        const costTypeLabel = mq.costType === 'V' ? '変動費 (V)' : mq.costType === 'F' ? '固定費 (F)' : '-';
        mqLines.push('--- MQ会計情報 ---');
        mqLines.push(`経費の種類 (V/F): ${costTypeLabel}`);
        if (mq.purpose) {
            mqLines.push(`支出の目的・期待効果: ${mq.purpose}`);
        }
        if (mq.expectedSalesPQ != null) {
            mqLines.push(`期待売上 (PQ): ${mq.expectedSalesPQ}`);
        }
        if (mq.expectedMarginMQ != null) {
            mqLines.push(`期待限界利益 (MQ): ${mq.expectedMarginMQ}`);
        }
        if (mq.expectedSalesPQ && mq.expectedMarginMQ &&
            Number.isFinite(Number(mq.expectedSalesPQ)) &&
            Number.isFinite(Number(mq.expectedMarginMQ)) &&
            Number(mq.expectedSalesPQ) !== 0) {
            const rate = (Number(mq.expectedMarginMQ) / Number(mq.expectedSalesPQ)) * 100;
            mqLines.push(`m率 (MQ ÷ PQ): ${rate.toFixed(1)}%`);
        }
        if (mqLines.length > 1) {
            details.push('', ...mqLines);
        }
    }

    if (application.submittedAt) {
        details.push(`申請日時: ${formatDateTime(application.submittedAt)}`);
    }
    if (payload.metadata?.currentLevel) {
        details.push(`次の承認レベル: ${payload.metadata.currentLevel}`);
    }
    if (payload.metadata?.reason) {
        details.push(`差戻し理由: ${payload.metadata.reason}`);
    }
    if (payload.metadata?.approvedAt) {
        details.push(`承認日時: ${formatDateTime(payload.metadata.approvedAt)}`);
    }

    const subjectTemplate = SUBJECT_TEMPLATES[payload.type] ?? '申請通知';
    const subject = subjectTemplate.replace('{code}', codeLabel);

    const detailBlock = details.join('\n');
    const linkHint = '詳細は承認一覧画面で確認できます。';
    const defaultBody = [intro, '', detailBlock, '', linkHint].join('\n');

    const placeholderValues: Record<string, string> = {
        intro,
        application_id: application.id,
        application_code: codeLabel,
        applicant: applicantLabel,
        applicant_name: application && 'applicant' in application && application.applicant?.name
            ? application.applicant.name
            : applicantSummary?.name ?? '',
        applicant_email: application && 'applicant' in application && application.applicant?.email
            ? application.applicant.email ?? ''
            : applicantSummary?.email ?? '',
        status: application.status,
        approval_route_id: application.approvalRouteId ?? '-',
        current_level: application.currentLevel ? String(application.currentLevel) : '-',
        next_level: payload.metadata?.currentLevel ? String(payload.metadata.currentLevel) : '',
        submitted_at: application.submittedAt ? formatDateTime(application.submittedAt) : '',
        approved_at: payload.metadata?.approvedAt ? formatDateTime(payload.metadata.approvedAt) : '',
        rejection_reason: payload.metadata?.reason ?? application.rejectionReason ?? '',
        detail_table: detailBlock,
        link_hint: linkHint,
        timestamp: new Date().toISOString(),
    };

    return applyTemplateOverrides(payload.type, subject, defaultBody, placeholderValues);
};

const loadNotificationSettings = (): { enableNotifications: boolean; notificationTypes: Record<ApprovalNotificationType, boolean> } => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        return { enableNotifications: true, notificationTypes: { submitted: true, approved: true, rejected: true, step_forward: true } };
    }
    try {
        const raw = window.localStorage.getItem('adminEmailNotificationSettings');
        const settings = raw ? JSON.parse(raw) : null;
        return {
            enableNotifications: settings?.enableNotifications ?? true,
            notificationTypes: settings?.notificationTypes ?? { submitted: true, approved: true, rejected: true, step_forward: true }
        };
    } catch (error) {
        console.warn('[notification] Failed to parse notification settings', error);
        return { enableNotifications: true, notificationTypes: { submitted: true, approved: true, rejected: true, step_forward: true } };
    }
};

export async function sendApprovalNotification(payload: ApprovalNotificationPayload): Promise<void> {
    try {
        const settings = loadNotificationSettings();
        
        // Check if notifications are enabled
        if (!settings.enableNotifications) {
            console.log('[notification] Email notifications are disabled, skipping');
            return;
        }
        
        // Check if this specific notification type is enabled
        if (!settings.notificationTypes[payload.type]) {
            console.log(`[notification] ${payload.type} notifications are disabled, skipping`);
            return;
        }

        const supabase = getSupabase();
        const recipients = await resolveRecipients(supabase, payload);
        if (recipients.length === 0) {
            console.warn('[notification] 送信先メールアドレスが見つからないため通知をスキップしました', payload);
            return;
        }

        const { subject, body } = await buildEmailContent(supabase, payload);

const { data, error } = await supabase.functions.invoke(
  'send-approval-notification',
  {
    body: {
      to: recipients,
      subject,
      body,
    },
  },
);

if (error) {
  throw error;
}

if (!data?.ok) {
  throw new Error(
    data?.error || '承認通知メールの送信に失敗しました。',
  );
}
    } catch (error) {
        console.error('[notification] 承認通知メールの送信に失敗しました', error);
    }
}

export const sendApprovalRouteCreatedNotification = async (route: ApprovalRoute): Promise<void> => {
    const supabase = getSupabase();
    const steps = route.routeData?.steps ?? [];
    const uniqueApproverIds = Array.from(
        new Set(
            steps
                .map(step => step.approverId)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
    );

    if (uniqueApproverIds.length === 0) {
        return;
    }

    const recipients = await Promise.all(
        uniqueApproverIds.map(async approverId => {
            const summary = await resolveUserById(supabase, String(approverId));
            return summary?.email ?? null;
        })
    );

    const filteredRecipients = Array.from(new Set(recipients.filter((email): email is string => Boolean(email))));
    if (filteredRecipients.length === 0) {
        console.warn('[notification] 承認ルート通知の宛先が見つかりませんでした', route.id);
        return;
    }

    const stepLines = await Promise.all(
        steps.map(async (step, index) => {
            if (!step.approverId) {
                return `ステップ${index + 1}: (承認者未設定)`;
            }
            const summary = await resolveUserById(supabase, step.approverId);
            return `ステップ${index + 1}: ${summary?.name ?? step.approverId}`;
        })
    );

    const body = [
        `新しい承認ルート「${route.name}」が追加され、あなたが承認者として設定されました。`,
        '',
        ...stepLines,
        '',
        '承認ルート管理ページから詳細を確認し、必要に応じて関係者に共有してください。',
    ].join('\n');

    try {
        const { data, error } = await supabase.functions.invoke(
  'send-approval-notification',
  {
    body: {
      to: filteredRecipients,
      subject: `【承認ルート追加】${route.name}`,
      body,
    },
  },
);

if (error) {
  throw error;
}

if (!data?.ok) {
  throw new Error(
    data?.error || '承認ルート通知メールの送信に失敗しました。',
  );
}
    } catch (error) {
        console.error('[notification] 承認ルート追加通知の送信に失敗しました', error);
    }
};
