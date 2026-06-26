import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../services/supabaseClient';

interface EmailNotificationSettings {
  enableNotifications: boolean;
  notificationTypes: {
    submitted: boolean;
    approved: boolean;
    rejected: boolean;
    step_forward: boolean;
  };
}

const EmailNotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState<EmailNotificationSettings>({
  enableNotifications: true,
  notificationTypes: {
    submitted: true,
    approved: true,
    rejected: true,
    step_forward: true,
  },
});

  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
  try {
    const saved = localStorage.getItem('adminEmailNotificationSettings');

    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved);

    setSettings((prev) => ({
      ...prev,
      enableNotifications:
        typeof parsed.enableNotifications === 'boolean'
          ? parsed.enableNotifications
          : prev.enableNotifications,
      notificationTypes: {
        ...prev.notificationTypes,
        ...(parsed.notificationTypes || {}),
      },
    }));
  } catch (error) {
    console.error('Failed to load email settings:', error);
    setMessage('設定の読み込みに失敗しました。');
    setMessageType('error');
  }
};

  const saveSettings = () => {
  try {
    const safeSettings: EmailNotificationSettings = {
      enableNotifications: settings.enableNotifications,
      notificationTypes: settings.notificationTypes,
    };

    localStorage.setItem(
      'adminEmailNotificationSettings',
      JSON.stringify(safeSettings),
    );

    setMessage('設定を保存しました。');
    setMessageType('success');
  } catch (error) {
    console.error('Failed to save email settings:', error);
    setMessage('設定の保存に失敗しました。');
    setMessageType('error');
  }
};

  const handleNotificationTypeChange = (type: keyof EmailNotificationSettings['notificationTypes'], enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      notificationTypes: {
        ...prev.notificationTypes,
        [type]: enabled
      }
    }));
  };

  const testEmailConfiguration = async () => {
  if (!testEmail || !testEmail.includes('@')) {
    setMessage('テスト用メールアドレスを入力してください。');
    setMessageType('error');
    return;
  }

  setIsTesting(true);
  setMessage('');

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase.functions.invoke(
      'send-test-notification-email',
      {
        body: {
          to: testEmail.trim(),
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

    setMessage(
      data.message || 'テストメールを送信しました。受信をご確認ください。',
    );
    setMessageType('success');
  } catch (error: any) {
    console.error('Test email failed:', error);
    setMessage(
      `テストメールの送信に失敗しました。${error?.message || ''}`,
    );
    setMessageType('error');
  } finally {
    setIsTesting(false);
  }
};

  const inputClass = "w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500";
  const checkboxClass = "h-4 w-4 text-blue-600 bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500";

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">通知メール設定</h2>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
  通知メールは、システムで設定された通知専用メールアドレスから送信されます。
  SMTPサーバーやパスワードの入力は不要です。
</div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          messageType === 'success' ? 'bg-green-100 text-green-700 border border-green-300' :
          messageType === 'error' ? 'bg-red-100 text-red-700 border border-red-300' :
          'bg-blue-100 text-blue-700 border border-blue-300'
        }`}>
          {message}
        </div>
      )}

      {/* 全体設定 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">基本設定</h3>
        
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="enableNotifications"
            checked={settings.enableNotifications}
            onChange={(e) => setSettings(prev => ({ ...prev, enableNotifications: e.target.checked }))}
            className={checkboxClass}
          />
          <label htmlFor="enableNotifications" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            メール通知を有効にする
          </label>
        </div>
      </div>



      {/* 通知タイプ設定 */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">通知タイプ</h3>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="notifySubmitted"
              checked={settings.notificationTypes.submitted}
              onChange={(e) => handleNotificationTypeChange('submitted', e.target.checked)}
              className={checkboxClass}
            />
            <label htmlFor="notifySubmitted" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              申請提出時の通知
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="notifyApproved"
              checked={settings.notificationTypes.approved}
              onChange={(e) => handleNotificationTypeChange('approved', e.target.checked)}
              className={checkboxClass}
            />
            <label htmlFor="notifyApproved" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              承認完了時の通知
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="notifyRejected"
              checked={settings.notificationTypes.rejected}
              onChange={(e) => handleNotificationTypeChange('rejected', e.target.checked)}
              className={checkboxClass}
            />
            <label htmlFor="notifyRejected" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              却下・差戻し時の通知
            </label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="notifyStepForward"
              checked={settings.notificationTypes.step_forward}
              onChange={(e) => handleNotificationTypeChange('step_forward', e.target.checked)}
              className={checkboxClass}
            />
            <label htmlFor="notifyStepForward" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              次の承認ステップへの通知
            </label>
          </div>
        </div>
      </div>

      {/* テスト送信 */}
      <div className="space-y-4 border-t border-slate-200 dark:border-slate-700 pt-6">
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">テスト送信</h3>
        
        <div className="flex gap-4">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className={inputClass}
            placeholder="テスト送信先メールアドレス"
            disabled={!settings.enableNotifications}
          />
          <button
  onClick={testEmailConfiguration}
  disabled={isTesting || !testEmail || !settings.enableNotifications}
  className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
>
  {isTesting ? '送信中...' : 'テストメール送信'}
</button>
        </div>
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end space-x-4 border-t border-slate-200 dark:border-slate-700 pt-6">
        <button
          onClick={saveSettings}
          disabled={isLoading}
          className="bg-green-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          設定を保存
        </button>
      </div>
    </div>
  );
};

export default EmailNotificationSettings;
