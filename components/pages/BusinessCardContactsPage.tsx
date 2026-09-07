import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CustomerContact, EmployeeUser, Toast } from '../../types';
import {
  createCustomerContact,
  getCustomerContacts,
} from '../../services/dataService';
import BusinessCardUploadSection from '../BusinessCardUploadSection';
import {
  RefreshCw,
  Search,
  Mail,
  Phone,
  CheckCircle,
  AlertTriangle,
} from '../Icons';

type BusinessCardContactsPageProps = {
  currentUser: EmployeeUser | null;
  allUsers: EmployeeUser[];
  addToast: (message: string, type: Toast['type']) => void;
  isAIOff: boolean;
};

type MailFilter = 'all' | 'has_email' | 'no_email';
type LinkFilter = 'all' | 'linked' | 'unlinked';

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

  const followStatusOptions = useMemo(() => {
    const values = contacts
      .map(contact => contact.followStatus)
      .filter((value): value is string => Boolean(value && value.trim()));

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'ja'));
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

        if (!target.includes(q)) {
          return false;
        }
      }

      if (mailFilter === 'has_email' && !contact.email) {
        return false;
      }

      if (mailFilter === 'no_email' && contact.email) {
        return false;
      }

      if (linkFilter === 'linked' && !contact.customerId) {
        return false;
      }

      if (linkFilter === 'unlinked' && contact.customerId) {
        return false;
      }

      if (
        followStatusFilter !== 'all' &&
        contact.followStatus !== followStatusFilter
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
    const needsFollow = contacts.filter(
      contact =>
        !contact.followStatus ||
        contact.followStatus === '未対応' ||
        contact.followStatus === '要対応'
    ).length;

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
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">登録件数</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {stats.total.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">メールあり</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {stats.hasEmail.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">顧客紐づけ済み</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {stats.linked.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">未紐づけ</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {stats.unlinked.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">未対応・要対応</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {stats.needsFollow.toLocaleString()}
            </p>
          </div>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessCardContactsPage;