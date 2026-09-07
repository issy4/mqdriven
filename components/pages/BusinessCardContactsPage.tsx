import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CustomerContact, EmployeeUser, Toast } from '../../types';
import {
  createCustomerContact,
  getCustomerContacts,
  updateCustomerContact,
} from '../../services/dataService';
import BusinessCardUploadSection from '../BusinessCardUploadSection';
import {
  RefreshCw,
  Search,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle,
  X,
} from '../Icons';

type BusinessCardContactsPageProps = {
  currentUser: EmployeeUser | null;
  allUsers: EmployeeUser[];
  addToast: (message: string, type: Toast['type']) => void;
  isAIOff: boolean;
};

type MailFilter = 'all' | 'has_email' | 'no_email';
type LinkFilter = 'all' | 'linked' | 'unlinked';

const FOLLOW_STATUS_OPTIONS = [
  '未対応',
  '要対応',
  'メール済み',
  '電話済み',
  '商談化',
  '案件化',
  '対象外',
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeText = (value?: string | null) =>
  (value ?? '').toString().trim().toLowerCase();

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const BusinessCardContactsPage: React.FC<BusinessCardContactsPageProps> = ({
  currentUser,
  allUsers,
  addToast,
  isAIOff,
}) => {
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [keyword, setKeyword] = useState('');
  const [mailFilter, setMailFilter] = useState<MailFilter>('all');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [followStatusFilter, setFollowStatusFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');

  const [editingContact, setEditingContact] = useState<CustomerContact | null>(
    null
  );
  const [editForm, setEditForm] = useState<Partial<CustomerContact>>({});
  const [isSaving, setIsSaving] = useState(false);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const rows = await getCustomerContacts();
      setContacts(rows);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '名刺連絡先の取得に失敗しました。';

      setLoadError(message);
      addToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const handleCreateContact = async (
    data: Partial<CustomerContact>
  ): Promise<CustomerContact> => {
    const created = await createCustomerContact(data);
    setContacts(prev => [created, ...prev]);
    return created;
  };

  const openEditModal = (contact: CustomerContact) => {
    setEditingContact(contact);
    setEditForm({
      companyName: contact.companyName ?? '',
      personName: contact.personName ?? '',
      personTitle: contact.personTitle ?? '',
      department: contact.department ?? '',
      email: contact.email ?? '',
      phoneNumber: contact.phoneNumber ?? '',
      mobileNumber: contact.mobileNumber ?? '',
      faxNumber: contact.faxNumber ?? '',
      postalCode: contact.postalCode ?? '',
      address1: contact.address1 ?? '',
      websiteUrl: contact.websiteUrl ?? '',
      businessEvent: contact.businessEvent ?? '',
      receivedByEmployeeCode: contact.receivedByEmployeeCode ?? '',
      followStatus: contact.followStatus ?? '未対応',
      lastContactedAt: contact.lastContactedAt ?? null,
      nextActionDate: contact.nextActionDate ?? '',
      nextActionNote: contact.nextActionNote ?? '',
      memo: contact.memo ?? '',
      allowEmailMarketing: contact.allowEmailMarketing ?? true,
      emailMarketingStatus: contact.emailMarketingStatus ?? '未確認',
    });
  };

  const closeEditModal = () => {
    if (isSaving) return;
    setEditingContact(null);
    setEditForm({});
  };

  const handleEditChange = (
    key: keyof CustomerContact,
    value: string | boolean | null
  ) => {
    setEditForm(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingContact) return;

    const companyName = String(editForm.companyName ?? '').trim();
    if (!companyName) {
      addToast('会社名は必須です。', 'error');
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateCustomerContact(editingContact.id, {
        companyName,
        personName: emptyToNull(String(editForm.personName ?? '')),
        personTitle: emptyToNull(String(editForm.personTitle ?? '')),
        department: emptyToNull(String(editForm.department ?? '')),

        email: emptyToNull(String(editForm.email ?? '')),
        phoneNumber: emptyToNull(String(editForm.phoneNumber ?? '')),
        mobileNumber: emptyToNull(String(editForm.mobileNumber ?? '')),
        faxNumber: emptyToNull(String(editForm.faxNumber ?? '')),

        postalCode: emptyToNull(String(editForm.postalCode ?? '')),
        address1: emptyToNull(String(editForm.address1 ?? '')),
        websiteUrl: emptyToNull(String(editForm.websiteUrl ?? '')),

        businessEvent: emptyToNull(String(editForm.businessEvent ?? '')),
        receivedByEmployeeCode: emptyToNull(
          String(editForm.receivedByEmployeeCode ?? '')
        ),

        followStatus:
          emptyToNull(String(editForm.followStatus ?? '')) ?? '未対応',
        nextActionDate: emptyToNull(String(editForm.nextActionDate ?? '')),
        nextActionNote: emptyToNull(String(editForm.nextActionNote ?? '')),

        memo: emptyToNull(String(editForm.memo ?? '')),
        allowEmailMarketing: editForm.allowEmailMarketing ?? true,
        emailMarketingStatus:
          emptyToNull(String(editForm.emailMarketingStatus ?? '')) ?? '未確認',
      });

      setContacts(prev =>
        prev.map(contact => (contact.id === updated.id ? updated : contact))
      );

      addToast('名刺連絡先を更新しました。', 'success');
      setEditingContact(null);
      setEditForm({});
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '名刺連絡先の更新に失敗しました。';

      addToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const followStatusOptions = useMemo(() => {
    const values = contacts
      .map(contact => contact.followStatus)
      .filter((value): value is string => Boolean(value && value.trim()));

    return Array.from(new Set([...FOLLOW_STATUS_OPTIONS, ...values]));
  }, [contacts]);

  const eventOptions = useMemo(() => {
    const values = contacts
      .map(contact => contact.businessEvent)
      .filter((value): value is string => Boolean(value && value.trim()));

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const q = normalizeText(keyword);

    return contacts.filter(contact => {
      if (q) {
        const target = [
          contact.companyName,
          contact.personName,
          contact.personTitle,
          contact.department,
          contact.email,
          contact.phoneNumber,
          contact.mobileNumber,
          contact.faxNumber,
          contact.address1,
          contact.businessEvent,
          contact.memo,
        ]
          .map(normalizeText)
          .join(' ');

        if (!target.includes(q)) return false;
      }

      if (mailFilter === 'has_email' && !contact.email) return false;
      if (mailFilter === 'no_email' && contact.email) return false;

      if (linkFilter === 'linked' && !contact.customerId) return false;
      if (linkFilter === 'unlinked' && contact.customerId) return false;

      if (
        followStatusFilter !== 'all' &&
        (contact.followStatus || '未対応') !== followStatusFilter
      ) {
        return false;
      }

      if (eventFilter !== 'all' && contact.businessEvent !== eventFilter) {
        return false;
      }

      return true;
    });
  }, [
    contacts,
    keyword,
    mailFilter,
    linkFilter,
    followStatusFilter,
    eventFilter,
  ]);

  const stats = useMemo(() => {
    const total = contacts.length;
    const hasEmail = contacts.filter(contact => Boolean(contact.email)).length;
    const linked = contacts.filter(contact => Boolean(contact.customerId)).length;
    const unlinked = total - linked;
    const needsFollow = contacts.filter(contact => {
      const status = contact.followStatus || '未対応';
      return status === '未対応' || status === '要対応';
    }).length;

    return {
      total,
      hasEmail,
      linked,
      unlinked,
      needsFollow,
    };
  }, [contacts]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              名刺OCR・連絡先管理
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              名刺画像やPDFを読み取り、正式な顧客マスターではなく
              customer_contacts に営業接点として登録します。
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadContacts()}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            一覧を更新
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="登録件数" value={stats.total} />
          <StatCard label="メールあり" value={stats.hasEmail} />
          <StatCard label="顧客紐づけ済み" value={stats.linked} />
          <StatCard label="未紐づけ" value={stats.unlinked} />
          <StatCard label="未対応・要対応" value={stats.needsFollow} />
        </div>
      </div>

      <BusinessCardUploadSection
        addToast={addToast}
        isAIOff={isAIOff}
        currentUser={currentUser}
        allUsers={allUsers}
        onAutoCreateCustomerContact={handleCreateContact}
      />

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-700">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                登録済み連絡先
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                名刺OCRや移行データから登録された営業接点一覧です。
              </p>
            </div>

            <div className="text-sm text-slate-500 dark:text-slate-400">
              表示 {filteredContacts.length.toLocaleString()} / 全{' '}
              {contacts.length.toLocaleString()} 件
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="会社名・担当者・メール・電話・イベントで検索"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>

            <select
              value={mailFilter}
              onChange={e => setMailFilter(e.target.value as MailFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="all">メール：すべて</option>
              <option value="has_email">メールあり</option>
              <option value="no_email">メールなし</option>
            </select>

            <select
              value={linkFilter}
              onChange={e => setLinkFilter(e.target.value as LinkFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="all">顧客紐づけ：すべて</option>
              <option value="linked">紐づけ済み</option>
              <option value="unlinked">未紐づけ</option>
            </select>

            <select
              value={followStatusFilter}
              onChange={e => setFollowStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="all">フォロー状況：すべて</option>
              {followStatusOptions.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <select
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="all">イベント：すべて</option>
              {eventOptions.map(event => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadError && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {loadError}
          </div>
        )}

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" />
              名刺連絡先を読み込んでいます...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              条件に一致する連絡先はありません。
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    会社・担当者
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    連絡先
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    イベント
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    フォロー
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    紐づけ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                    登録日
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">
                    操作
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {filteredContacts.map(contact => (
                  <tr
                    key={contact.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="max-w-[280px]">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {contact.companyName || '-'}
                        </p>

                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                          {contact.personName || '-'}
                          {contact.personTitle && (
                            <span className="ml-1 text-xs text-slate-500">
                              / {contact.personTitle}
                            </span>
                          )}
                        </p>

                        {contact.department && (
                          <p className="mt-1 text-xs text-slate-500">
                            {contact.department}
                          </p>
                        )}

                        {contact.address1 && (
                          <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                            {contact.address1}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <div className="space-y-1">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {contact.email}
                          </a>
                        ) : (
                          <p className="text-sm text-slate-400">メールなし</p>
                        )}

                        {contact.phoneNumber ? (
                          <p className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                            <Phone className="h-3.5 w-3.5" />
                            {contact.phoneNumber}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400">電話なし</p>
                        )}

                        {contact.faxNumber && (
                          <p className="text-xs text-slate-500">
                            FAX: {contact.faxNumber}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        {contact.businessEvent || '-'}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        source: {contact.source || '-'}
                      </p>
                    </td>

                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {contact.followStatus || '未対応'}
                      </span>

                      {contact.nextActionDate && (
                        <p className="mt-2 text-xs text-slate-500">
                          次回: {contact.nextActionDate}
                        </p>
                      )}

                      {contact.nextActionNote && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {contact.nextActionNote}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top">
                      {contact.customerId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" />
                          紐づけ済み
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                          未紐づけ
                        </span>
                      )}

                      {contact.customerCode && (
                        <p className="mt-2 text-xs text-slate-500">
                          code: {contact.customerCode}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-4 align-top text-xs text-slate-500">
                      {formatDateTime(contact.createdAt)}
                    </td>

                    <td className="px-4 py-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(contact)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  名刺連絡先を編集
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  customer_contacts の営業接点情報を更新します。
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-5">
              <section>
                <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                  基本情報
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormInput
                    label="会社名"
                    required
                    value={String(editForm.companyName ?? '')}
                    onChange={value => handleEditChange('companyName', value)}
                  />

                  <FormInput
                    label="部署"
                    value={String(editForm.department ?? '')}
                    onChange={value => handleEditChange('department', value)}
                  />

                  <FormInput
                    label="担当者名"
                    value={String(editForm.personName ?? '')}
                    onChange={value => handleEditChange('personName', value)}
                  />

                  <FormInput
                    label="役職"
                    value={String(editForm.personTitle ?? '')}
                    onChange={value => handleEditChange('personTitle', value)}
                  />
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                  連絡先
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormInput
                    label="メールアドレス"
                    value={String(editForm.email ?? '')}
                    onChange={value => handleEditChange('email', value)}
                  />

                  <FormInput
                    label="電話番号"
                    value={String(editForm.phoneNumber ?? '')}
                    onChange={value => handleEditChange('phoneNumber', value)}
                  />

                  <FormInput
                    label="携帯番号"
                    value={String(editForm.mobileNumber ?? '')}
                    onChange={value => handleEditChange('mobileNumber', value)}
                  />

                  <FormInput
                    label="FAX番号"
                    value={String(editForm.faxNumber ?? '')}
                    onChange={value => handleEditChange('faxNumber', value)}
                  />

                  <FormInput
                    label="郵便番号"
                    value={String(editForm.postalCode ?? '')}
                    onChange={value => handleEditChange('postalCode', value)}
                  />

                  <FormInput
                    label="Webサイト"
                    value={String(editForm.websiteUrl ?? '')}
                    onChange={value => handleEditChange('websiteUrl', value)}
                  />

                  <div className="md:col-span-2">
                    <FormInput
                      label="住所"
                      value={String(editForm.address1 ?? '')}
                      onChange={value => handleEditChange('address1', value)}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                  営業フォロー
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormInput
                    label="取得イベント"
                    placeholder="例：産業交流展、紹介、会社訪問"
                    value={String(editForm.businessEvent ?? '')}
                    onChange={value => handleEditChange('businessEvent', value)}
                  />

                  <FormInput
                    label="受領者コード"
                    value={String(editForm.receivedByEmployeeCode ?? '')}
                    onChange={value =>
                      handleEditChange('receivedByEmployeeCode', value)
                    }
                  />

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      フォロー状況
                    </label>
                    <select
                      value={String(editForm.followStatus ?? '未対応')}
                      onChange={e =>
                        handleEditChange('followStatus', e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    >
                      {FOLLOW_STATUS_OPTIONS.map(status => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <FormInput
                    label="次回アクション日"
                    type="date"
                    value={String(editForm.nextActionDate ?? '')}
                    onChange={value => handleEditChange('nextActionDate', value)}
                  />

                  <div className="md:col-span-2">
                    <FormTextarea
                      label="次回アクション内容"
                      placeholder="例：展示会後のお礼メールを送る、Web制作の提案をする"
                      value={String(editForm.nextActionNote ?? '')}
                      onChange={value =>
                        handleEditChange('nextActionNote', value)
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FormTextarea
                      label="メモ"
                      value={String(editForm.memo ?? '')}
                      onChange={value => handleEditChange('memo', value)}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                  メール配信
                </h4>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={editForm.allowEmailMarketing ?? true}
                      onChange={e =>
                        handleEditChange(
                          'allowEmailMarketing',
                          e.target.checked
                        )
                      }
                    />
                    メール配信対象にする
                  </label>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      メール配信ステータス
                    </label>
                    <select
                      value={String(editForm.emailMarketingStatus ?? '未確認')}
                      onChange={e =>
                        handleEditChange('emailMarketingStatus', e.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    >
                      <option value="未確認">未確認</option>
                      <option value="配信可">配信可</option>
                      <option value="配信停止">配信停止</option>
                      <option value="対象外">対象外</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
      {value.toLocaleString()}
    </p>
  </div>
);

const FormInput = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) => (
  <div>
    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
    />
  </div>
);

const FormTextarea = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div>
    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
      {label}
    </label>
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
    />
  </div>
);

export default BusinessCardContactsPage;