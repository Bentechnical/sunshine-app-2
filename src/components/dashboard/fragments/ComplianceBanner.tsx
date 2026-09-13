'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { AlertCircle } from 'lucide-react';

interface Props {
  onUploadClick: () => void;
  refreshTrigger?: number;
}

type DocStatus = 'ok' | 'needed';

function getDocStatus(url: string | null, verificationStatus: string | null, expiryDate: string | null): DocStatus {
  if (!url) return 'needed';
  if (verificationStatus === 'rejected') return 'needed';
  if (expiryDate) {
    const daysUntil = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntil < 0) return 'needed';
  }
  return 'ok';
}

export default function ComplianceBanner({ onUploadClick, refreshTrigger = 0 }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [vscStatus, setVscStatus] = useState<DocStatus>('ok');
  const [vaccineStatus, setVaccineStatus] = useState<DocStatus>('ok');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetch = async () => {
      const [{ data: userData }, { data: dogData }] = await Promise.all([
        supabase
          .from('users')
          .select('vsc_document_url, vsc_renewal_due, vsc_verification_status')
          .eq('id', user.id)
          .single(),
        supabase
          .from('dogs')
          .select('vaccine_record_url, vaccine_expiry_date, vaccine_verification_status')
          .eq('volunteer_id', user.id)
          .single(),
      ]);

      setVscStatus(getDocStatus(
        userData?.vsc_document_url ?? null,
        userData?.vsc_verification_status ?? null,
        userData?.vsc_renewal_due ?? null,
      ));
      setVaccineStatus(getDocStatus(
        dogData?.vaccine_record_url ?? null,
        dogData?.vaccine_verification_status ?? null,
        dogData?.vaccine_expiry_date ?? null,
      ));
      setLoading(false);
    };

    fetch();
  }, [user?.id, supabase, refreshTrigger]);

  if (loading) return null;
  if (vscStatus === 'ok' && vaccineStatus === 'ok') return null;

  let heading: string;
  let message: string;

  if (vaccineStatus === 'needed' && vscStatus === 'needed') {
    heading = 'Documents needed';
    message = 'Upload your dog\'s vaccine records to start signing up for visits. A VSC certificate is also required for some visits.';
  } else if (vaccineStatus === 'needed') {
    heading = 'Vaccine records needed';
    message = 'Upload your dog\'s vaccine records to start signing up for visits.';
  } else {
    heading = 'VSC missing';
    message = 'Some visits require a VSC certificate. Upload yours so you\'re ready when the time comes.';
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <AlertCircle size={20} className="text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">{heading}</p>
          <p className="text-sm text-amber-700 mt-0.5">
            {message}
          </p>
        </div>
        <button
          onClick={onUploadClick}
          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          Upload
        </button>
      </div>
    </div>
  );
}
