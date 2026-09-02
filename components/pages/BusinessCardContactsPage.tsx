import React from 'react';
import { CustomerContact, EmployeeUser, Toast } from '../../types';
import { createCustomerContact } from '../../services/dataService';
import BusinessCardUploadSection from '../BusinessCardUploadSection';

type BusinessCardContactsPageProps = {
  currentUser: EmployeeUser | null;
  allUsers: EmployeeUser[];
  addToast: (message: string, type: Toast['type']) => void;
  isAIOff: boolean;
};

const BusinessCardContactsPage: React.FC<BusinessCardContactsPageProps> = ({
  currentUser,
  allUsers,
  addToast,
  isAIOff,
}) => {
  const handleCreateContact = async (
    data: Partial<CustomerContact>
  ): Promise<CustomerContact> => {
    return await createCustomerContact(data);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          名刺OCR・連絡先管理
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          名刺画像やPDFを読み取り、連絡先データとして登録します。
          正式な顧客マスターには登録せず、customer_contacts に保存します。
        </p>
      </div>

      <BusinessCardUploadSection
        addToast={addToast}
        isAIOff={isAIOff}
        currentUser={currentUser}
        allUsers={allUsers}
        onAutoCreateCustomerContact={handleCreateContact}
      />
    </div>
  );
};

export default BusinessCardContactsPage;