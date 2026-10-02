// src/components/dashboard/DashboardHomeVolunteer.tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import TherapyDogCard from './fragments/TherapyDogCard';
import ProfileCardBlock from './fragments/ProfileCardBlock';
import ComplianceBanner from './fragments/ComplianceBanner';
import ComplianceDocsModal from './fragments/ComplianceDocsModal';
import type { ComplianceInitialData } from './fragments/ComplianceDocsModal';

interface Props {
  userId: string;
  role: 'volunteer';
}

export default function DashboardHomeVolunteer({}: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [complianceData, setComplianceData] = useState<ComplianceInitialData | null>(null);

  const loadComplianceData = async () => {
    if (!user?.id) return;

    const [{ data: userData }, { data: dogData }] = await Promise.all([
      supabase
        .from('users')
        .select('vsc_document_url, vsc_date_issued, vsc_renewal_due, vsc_verification_status, vsc_upload_comment, vsc_rejection_reason')
        .eq('id', user.id)
        .single(),
      supabase
        .from('dogs')
        .select('vaccine_record_url, vaccine_date_issued, vaccine_expiry_date, vaccine_verification_status, vaccine_upload_comment, vaccine_rejection_reason, vaccine_supporting_urls')
        .eq('volunteer_id', user.id)
        .single(),
    ]);

    setComplianceData({
      vsc_document_url: userData?.vsc_document_url ?? null,
      vsc_date_issued: userData?.vsc_date_issued ?? null,
      vsc_renewal_due: userData?.vsc_renewal_due ?? null,
      vsc_verification_status: userData?.vsc_verification_status ?? null,
      vsc_upload_comment: userData?.vsc_upload_comment ?? null,
      vsc_rejection_reason: userData?.vsc_rejection_reason ?? null,
      vaccine_record_url: dogData?.vaccine_record_url ?? null,
      vaccine_date_issued: dogData?.vaccine_date_issued ?? null,
      vaccine_expiry_date: dogData?.vaccine_expiry_date ?? null,
      vaccine_verification_status: dogData?.vaccine_verification_status ?? null,
      vaccine_upload_comment: dogData?.vaccine_upload_comment ?? null,
      vaccine_rejection_reason: dogData?.vaccine_rejection_reason ?? null,
      vaccine_supporting_urls: dogData?.vaccine_supporting_urls ?? null,
    });
  };

  useEffect(() => {
    loadComplianceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const openComplianceModal = async () => {
    await loadComplianceData();
    setShowComplianceModal(true);
  };

  const handleComplianceClose = () => {
    setShowComplianceModal(false);
    setRefreshTrigger(c => c + 1);
    // Reload compliance data so next open is fresh
    loadComplianceData();
  };

  return (
    <div className="flex flex-col gap-2 px-2 md:px-4 h-auto lg:h-[90vh] pb-4">
      <div className="shrink-0">
        <ComplianceBanner onUploadClick={openComplianceModal} refreshTrigger={refreshTrigger} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-y-2 lg:gap-2 flex-1">
        <div className="col-span-2 flex flex-col gap-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <div className="rounded-2xl bg-white shadow p-2">
            <ProfileCardBlock onOpenCompliance={openComplianceModal} />
          </div>
        </div>

        <div className="col-span-1 rounded-2xl bg-white shadow p-2 lg:max-h-[90vh] lg:overflow-y-auto">
          <TherapyDogCard onOpenDocuments={openComplianceModal} refreshTrigger={refreshTrigger} />
        </div>
      </div>

      {showComplianceModal && complianceData && (
        <ComplianceDocsModal
          initialData={complianceData}
          onClose={handleComplianceClose}
          onSaved={handleComplianceClose}
        />
      )}
    </div>
  );
}
