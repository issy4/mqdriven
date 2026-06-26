import React, { useState, useEffect } from 'react';
import { Mail, Settings, Send, Save, X } from '../Icons';
import { getSupabase } from '../../services/supabaseClient';

interface EmailSettings {
  enabled: boolean;
  notificationTypes: {
    onSubmit: boolean;
    onApprove: boolean;
    onReject: boolean;
    onNextStep: boolean;
  };
  testEmail: string;
}

const EmailNotificationSettings: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: EmailSettings) => void;
}> = ({ isOpen, onClose, onSave }) => {
  const [settings, setSettings] = useState<EmailSettings>({
  enabled: false,
  notificationTypes: {
    onSubmit: true,
    onApprove: true,
    onReject: true,
    onNextStep: true,
  },
  testEmail: '',
});

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    // Load saved settings from localStorage
    const savedSettings = localStorage.getItem('emailNotificationSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to load email settings:', e);
      }
    }
  }, []);

  const handleSave = () => {
  const safeSettings: EmailSettings = {
    enabled: settings.enabled,
    notificationTypes: settings.notificationTypes,
    testEmail: settings.testEmail,
  };

  localStorage.setItem(
    'emailNotificationSettings',
    JSON.stringify(safeSettings),
  );

  onSave(safeSettings);
  onClose();
};

  const handleTestEmail = async () => {
  if (!settings.testEmail.trim()) {
    setTestResult('テスト送信先メールアドレスを入力してください。');
    return;
  }

  setIsTesting(true);
  setTestResult('');

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase.functions.invoke(
      'send-test-notification-email',
      {
        body: {
          to: settings.testEmail.trim(),
        },
      },
    );

    if (error) {
      throw error;
    }

    if (!data?.ok) {
      throw new Error(
        data?.error || 'テストメール送信に失敗しました。',
      );
    }

    setTestResult(
      data.message || 'テストメールを送信しました。受信をご確認ください。',
    );
  } catch (error: any) {
    setTestResult(
      `送信失敗: ${error?.message || '原因不明のエラーです。'}`,
    );
  } finally {
    setIsTesting(false);
  }
};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            通知メール設定
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 基本設定 */}
<div className="space-y-4">
  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">
    基本設定
  </h3>

  <div className="flex items-center gap-3">
    <input
      type="checkbox"
      id="email-enabled"
      checked={settings.enabled}
      onChange={(e) =>
        setSettings((prev) => ({
          ...prev,
          enabled: e.target.checked,
        }))
      }
      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
    />
    <label
      htmlFor="email-enabled"
      className="text-sm font-medium text-slate-700 dark:text-slate-300"
    >
      メール通知を有効にする
    </label>
  </div>

  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
    通知メールは、システムで設定された通知専用メールアドレスから送信されます。
    SMTPサーバーやパスワードの入力は不要です。
  </div>
</div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            閉じる
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailNotificationSettings;
