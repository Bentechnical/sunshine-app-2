// src/components/dashboard/fragments/TherapyDogCard.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Loader2, CheckCircle, AlertCircle, Clock, Pencil } from 'lucide-react';
import DogEditModal from './DogEditModal';
import { optimizeSupabaseImage, getImageSizes } from '@/utils/imageOptimization';

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

interface Dog {
  dog_name: string;
  dog_breed: string;
  dog_bio: string;
  dog_age: number | null;
  dog_picture_url: string | null;
  vaccine_record_url: string | null;
  vaccine_date_issued: string | null;
  vaccine_expiry_date: string | null;
  vaccine_verification_status: string | null;
}

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null, verificationStatus: string | null): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  // approved
  if (!expiryDate) return 'approved';
  const expiry = new Date(expiryDate);
  const daysUntil = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 30) return 'expiring';
  return 'approved';
}

const statusConfig: Record<ComplianceStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  missing:        { label: 'Vaccine Missing',       icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-700' },
  pending_review: { label: 'Vaccine Needs Review',  icon: <Clock size={12} />,       classes: 'bg-amber-100 text-amber-800' },
  approved:       { label: 'Vaccine Valid',         icon: <CheckCircle size={12} />, classes: 'bg-green-100 text-green-700' },
  expiring:       { label: 'Vaccine Expiring Soon', icon: <Clock size={12} />,       classes: 'bg-amber-100 text-amber-700' },
  expired:        { label: 'Vaccine Expired',       icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-800' },
  rejected:       { label: 'Vaccine Rejected',      icon: <AlertCircle size={12} />, classes: 'bg-red-100 text-red-700' },
};

export default function TherapyDogCard() {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [dog, setDog] = useState<Dog | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchDog = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('dogs')
        .select('dog_name, dog_breed, dog_bio, dog_age, dog_picture_url, vaccine_record_url, vaccine_date_issued, vaccine_expiry_date, vaccine_verification_status')
        .eq('volunteer_id', user.id)
        .single();

      if (error) console.error('[TherapyDogCard] Fetch error:', error);
      setDog(data ?? null);
    } catch (err) {
      console.error('[TherapyDogCard] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-37.5">
        <Loader2 className="animate-spin text-gray-500" />
      </div>
    );
  }

  const vaccineStatus = getComplianceStatus(
    dog?.vaccine_record_url ?? null,
    dog?.vaccine_expiry_date ?? null,
    dog?.vaccine_verification_status ?? null
  );
  const vaccineConfig = statusConfig[vaccineStatus];

  return (
    <>
      <div className="space-y-4 pt-1 px-2 flex flex-col lg:flex-1 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">My Dog</h2>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>

        <div className="flex flex-col bg-white rounded-xl">
          <div className="relative rounded-xl overflow-hidden shadow-md aspect-4/3 md:aspect-video lg:aspect-square">
            <Image
              src={optimizeSupabaseImage(dog?.dog_picture_url, { width: 600, quality: 80 })}
              alt={dog?.dog_name || 'Therapy Dog'}
              fill
              sizes={getImageSizes('card')}
              className="object-cover"
              priority={false}
            />
          </div>

          <div className="pt-3 px-4 pb-4 flex flex-col gap-3">
            <div>
              <h3 className="text-lg font-bold">{dog?.dog_name}</h3>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  {dog?.dog_breed || 'Unknown breed'}
                </span>
                {typeof dog?.dog_age === 'number' && (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                    {dog.dog_age} yr{dog.dog_age === 1 ? '' : 's'} old
                  </span>
                )}
              </div>
            </div>

            {dog?.dog_bio && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">About</h4>
                <p className="text-gray-600 text-sm leading-relaxed">{dog.dog_bio}</p>
              </div>
            )}

            {/* Vaccine compliance badge */}
            <span
              className={`self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${vaccineConfig.classes}`}
              title="Manage vaccine records in Edit Profile → Documents"
            >
              {vaccineConfig.icon}
              {vaccineConfig.label}
            </span>
          </div>
        </div>
      </div>

      {showEditModal && dog && (
        <DogEditModal
          initialDog={{
            dog_name: dog.dog_name,
            dog_breed: dog.dog_breed,
            dog_bio: dog.dog_bio,
            dog_age: dog.dog_age,
            dog_picture_url: dog.dog_picture_url,
          }}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchDog();
          }}
        />
      )}
    </>
  );
}
