// src/components/profile/ProfileCompleteForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import { useSupabaseClient } from '@/utils/supabase/client';
import { geocodePostalCode } from '@/utils/geocode';
import { PlaceResult } from '@/components/ui/PlacesAutocomplete';

import RoleSelection from './steps/RoleSelection';
import IndividualBasicInfo from './steps/IndividualBasicInfo';
import IndividualVisitDetails from './steps/IndividualVisitDetails';
import IndividualLiabilityWaiver from './steps/IndividualLiabilityWaiver';
import VolunteerBasicInfo from './steps/VolunteerBasicInfo';
import VolunteerDogProfile from './steps/VolunteerDogProfile';
import VolunteerAudiencePrefs from './steps/VolunteerAudiencePrefs';
import VolunteerCompliance from './steps/VolunteerCompliance';
import OrgDetails from './steps/OrgDetails';

// ─── Progress bar ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full flex-1 transition-colors duration-300 ${
            i + 1 <= current ? 'bg-[#0e62ae]' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Step metadata ─────────────────────────────────────────────────────────────

type Role = 'individual' | 'volunteer' | 'organization';

function getTotalSteps(role: Role | '') {
  if (role === 'individual') return 4;
  if (role === 'volunteer') return 5;
  if (role === 'organization') return 2;
  return 1;
}

function getStepTitle(role: Role | '', step: number): string {
  if (step === 1) return '';
  if (role === 'individual') {
    return ['', '', 'Basic Information', 'Visit Details', 'Terms & Conditions'][step] ?? '';
  }
  if (role === 'volunteer') {
    return ['', '', 'About You', 'Your Dog', 'Preferences', 'Compliance Documents'][step] ?? '';
  }
  if (role === 'organization') {
    return ['', '', 'Organization Details'][step] ?? '';
  }
  return '';
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const normalizePostalCode = (code: string) => {
  const cleaned = code.toUpperCase().replace(/\s+/g, '');
  return cleaned.length === 6 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
};

const validatePostalCode = (code: string) =>
  /^[A-Za-z]\d[A-Za-z]\d[A-Za-z]\d$/.test(code.replace(/\s+/g, ''));

// ─── Main component ────────────────────────────────────────────────────────────

export default function ProfileCompleteForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [fadeIn, setFadeIn] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');

  // Shared fields
  const [phone, setPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');

  // Individual fields
  const [visitRecipientType, setVisitRecipientType] = useState('');
  const [dependantName, setDependantName] = useState('');
  const [relationshipToRecipient, setRelationshipToRecipient] = useState('');
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [birthday, setBirthday] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [otherPetsOnSite, setOtherPetsOnSite] = useState(false);
  const [otherPetsDescription, setOtherPetsDescription] = useState('');
  const [thirdPartyAvailable, setThirdPartyAvailable] = useState('');
  const [additionalInformation, setAdditionalInformation] = useState('');
  const [liabilityWaiverAccepted, setLiabilityWaiverAccepted] = useState(false);

  // Volunteer fields
  const [travelDistance, setTravelDistance] = useState('10');
  const [dogName, setDogName] = useState('');
  const [dogBreed, setDogBreed] = useState('');
  const [dogAge, setDogAge] = useState('');
  const [dogBio, setDogBio] = useState('');
  const [dogPhotoUrl, setDogPhotoUrl] = useState('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [vscDocumentUrl, setVscDocumentUrl] = useState('');
  const [vscDate, setVscDate] = useState('');
  const [vaccineDocumentUrl, setVaccineDocumentUrl] = useState('');
  const [vaccineIssuedDate, setVaccineIssuedDate] = useState('');
  const [vaccineExpiryDate, setVaccineExpiryDate] = useState('');

  // Organization fields
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [orgPlaceId, setOrgPlaceId] = useState('');
  const [orgLat, setOrgLat] = useState<number | null>(null);
  const [orgLng, setOrgLng] = useState<number | null>(null);
  const [orgPostalCode, setOrgPostalCode] = useState('');
  const [orgContactName, setOrgContactName] = useState('');
  const [orgContactPhone, setOrgContactPhone] = useState('');
  const [orgFeeTier, setOrgFeeTier] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const DEFAULT_DOG_IMAGE = '/images/default_dog.png';

  // ── Prefill existing profile data ──────────────────────────────────────────

  useEffect(() => {
    if (!isLoaded || !user || hasPrefilled) return;
    setTimeout(() => setFadeIn(true), 100);
    setProfilePictureUrl(user.imageUrl || '');

    const fetchUserProfile = async () => {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userData) {
        const role = userData.role as Role | '';
        setSelectedRole(role || '');
        if (role) setCurrentStep(2);

        setBio(userData.bio || '');
        setPhone(userData.phone_number || '');
        setPostalCode(userData.postal_code || '');
        setProfilePictureUrl(userData.profile_image || '');
        if (userData.travel_distance_km) setTravelDistance(userData.travel_distance_km.toString());

        setVisitRecipientType(userData.visit_recipient_type || '');
        setRelationshipToRecipient(userData.relationship_to_recipient || '');
        setDependantName(userData.dependant_name || '');
        setPronouns(userData.pronouns || '');
        setBirthday(userData.birthday ? userData.birthday.toString() : '');
        setPhysicalAddress(userData.physical_address || '');
        setOtherPetsOnSite(userData.other_pets_on_site || false);
        setOtherPetsDescription(userData.other_pets_description || '');
        setThirdPartyAvailable(userData.third_party_available || '');
        setAdditionalInformation(userData.additional_information || '');
        setLiabilityWaiverAccepted(userData.liability_waiver_accepted || false);

        setOrgName(userData.org_name || '');
        setOrgType(userData.org_type || '');
        setOrgAddress(userData.org_address || '');
        setOrgPlaceId(userData.org_place_id || '');
        setOrgLat(userData.location_lat ?? null);
        setOrgLng(userData.location_lng ?? null);
        setOrgPostalCode(userData.postal_code || '');
        setOrgContactName(userData.org_contact_name || '');
        setOrgContactPhone(userData.org_contact_phone || '');
        setOrgFeeTier(userData.fee_tier || '');

        setVscDocumentUrl(userData.vsc_document_url || '');
        setVscDate(userData.vsc_date_issued || '');

        if (role === 'volunteer') {
          const { data: audienceData } = await supabase
            .from('volunteer_audience_preferences')
            .select('category_id, audience_categories (name)')
            .eq('volunteer_id', user.id);

          if (audienceData) {
            setSelectedCategories(
              audienceData.map((item: any) => item.audience_categories?.name).filter(Boolean)
            );
          }

          const { data: dogData } = await supabase
            .from('dogs')
            .select('*')
            .eq('volunteer_id', user.id)
            .single();

          if (dogData) {
            setDogName(dogData.dog_name || '');
            setDogAge(dogData.dog_age ? dogData.dog_age.toString() : '');
            setDogBreed(dogData.dog_breed || '');
            setDogBio(dogData.dog_bio || '');
            setDogPhotoUrl(dogData.dog_picture_url || '');
            setVaccineDocumentUrl(dogData.vaccine_record_url || '');
            setVaccineIssuedDate(dogData.vaccine_date_issued || '');
            setVaccineExpiryDate(dogData.vaccine_expiry_date || '');
          }
        }

        setHasPrefilled(true);
      }
    };

    fetchUserProfile();
  }, [user, isLoaded, hasPrefilled, supabase]);

  // Fetch audience categories whenever role becomes volunteer (covers both manual selection and prefill)
  useEffect(() => {
    if (selectedRole !== 'volunteer' || availableCategories.length > 0) return;
    fetch('/api/audience-categories')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.categories) setAvailableCategories(data.categories.map((cat: any) => cat.name));
      })
      .catch(() => {});
  }, [selectedRole, availableCategories.length]);

  const handleOrgPlaceSelect = (result: PlaceResult) => {
    setOrgAddress(result.formatted_address);
    setOrgPlaceId(result.place_id);
    setOrgLat(result.lat);
    setOrgLng(result.lng);
    setOrgPostalCode(result.postal_code);
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setCurrentStep(2);
    setSubmitError(null);
  };

  const handleBack = () => {
    setSubmitError(null);
    if (currentStep === 2) {
      setSelectedRole('');
      setCurrentStep(1);
    } else {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleNext = () => {
    setSubmitError(null);
    if (!validateCurrentStep()) return;
    setCurrentStep((s) => s + 1);
  };

  const isLastStep = currentStep === getTotalSteps(selectedRole);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateCurrentStep = (): boolean => {
    if (selectedRole === 'individual') {
      if (currentStep === 2) {
        if (!phone.trim()) { setSubmitError('Please enter your phone number.'); return false; }
        if (!validatePostalCode(postalCode)) { setSubmitError('Postal code must be in the format A1A 1A1.'); return false; }
        if (!visitRecipientType) { setSubmitError('Please select who the visit is for.'); return false; }
        if (visitRecipientType === 'other') {
          if (!dependantName.trim()) { setSubmitError('Please enter the name of the person receiving visits.'); return false; }
          if (!relationshipToRecipient.trim()) { setSubmitError('Please describe your relationship to them.'); return false; }
        }
      }
      if (currentStep === 3) {
        if (!bio.trim()) { setSubmitError("Please tell us why you're interested in meeting with a therapy dog."); return false; }
        if (!birthday.trim()) { setSubmitError('Please enter a birth year.'); return false; }
        if (!physicalAddress.trim()) { setSubmitError("Please enter where you'd like to meet."); return false; }
      }
      if (currentStep === 4) {
        if (!liabilityWaiverAccepted) { setSubmitError('You must accept the liability waiver to proceed.'); return false; }
      }
    }

    if (selectedRole === 'volunteer') {
      if (currentStep === 2) {
        if (!phone.trim()) { setSubmitError('Please enter your phone number.'); return false; }
        if (!validatePostalCode(postalCode)) { setSubmitError('Postal code must be in the format A1A 1A1.'); return false; }
        if (!bio.trim()) { setSubmitError('Please tell us about yourself.'); return false; }
      }
      if (currentStep === 3) {
        if (!dogName.trim() || !dogBreed.trim() || !dogAge.trim() || !dogBio.trim()) {
          setSubmitError("Please complete all fields for your dog's profile.");
          return false;
        }
      }
      // Steps 4 (audience) and 5 (compliance) are optional
    }

    if (selectedRole === 'organization') {
      if (currentStep === 2) {
        if (!orgName.trim()) { setSubmitError('Please enter your organization name.'); return false; }
        if (!orgType) { setSubmitError('Please select your organization type.'); return false; }
        if (!orgContactName.trim()) { setSubmitError('Please enter your primary contact name.'); return false; }
        if (!orgContactPhone.trim()) { setSubmitError('Please enter a contact phone number.'); return false; }
        if (!orgAddress.trim()) { setSubmitError("Please select your organization's address."); return false; }
        if (!orgPlaceId) { setSubmitError("Please select your address from the dropdown to confirm it."); return false; }
        if (!orgFeeTier) { setSubmitError("Please select the fee tier that best describes your organization."); return false; }
      }
    }

    return true;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!validateCurrentStep() || !user) return;

    setIsLoading(true);

    try {
      const { data: currentUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const oldRole = currentUser?.role || null;

      let updatePayload: any = {
        role: selectedRole,
        profile_complete: true,
      };

      if (selectedRole === 'individual') {
        updatePayload = {
          ...updatePayload,
          bio,
          phone_number: phone,
          postal_code: normalizePostalCode(postalCode),
          profile_image: profilePictureUrl,
          pronouns,
          birthday,
          physical_address: physicalAddress,
          other_pets_on_site: otherPetsOnSite,
          other_pets_description: otherPetsDescription,
          third_party_available: thirdPartyAvailable,
          additional_information: additionalInformation,
          liability_waiver_accepted: liabilityWaiverAccepted,
          liability_waiver_accepted_at: liabilityWaiverAccepted ? new Date().toISOString() : null,
          visit_recipient_type: visitRecipientType,
          relationship_to_recipient: relationshipToRecipient,
          dependant_name: dependantName,
        };
      }

      if (selectedRole === 'volunteer') {
        updatePayload = {
          ...updatePayload,
          bio,
          phone_number: phone,
          postal_code: normalizePostalCode(postalCode),
          profile_image: profilePictureUrl,
          pronouns,
          travel_distance_km: Number(travelDistance),
          vsc_document_url: vscDocumentUrl || null,
          vsc_date_issued: vscDate || null,
        };
      }

      if (selectedRole === 'organization') {
        updatePayload = {
          ...updatePayload,
          org_name: orgName,
          org_type: orgType,
          org_address: orgAddress,
          org_place_id: orgPlaceId || null,
          location_lat: orgLat,
          location_lng: orgLng,
          org_contact_name: orgContactName,
          org_contact_phone: orgContactPhone,
          postal_code: orgPostalCode || null,
          profile_image: profilePictureUrl || null,
          fee_tier: orgFeeTier || null,
        };
      }

      // Upsert instead of update — handles the edge case where the Clerk
      // user.created webhook hasn't fired yet or previously failed.
      const { error: updateError } = await supabase.from('users').upsert(
        {
          id: user.id,
          first_name: user.firstName ?? null,
          last_name: user.lastName ?? null,
          email: user.primaryEmailAddress?.emailAddress ?? null,
          ...updatePayload,
        },
        { onConflict: 'id' }
      );
      if (updateError) throw new Error(updateError.message);

      // Log role change
      if (oldRole !== selectedRole) {
        await supabase.from('role_change_audit').insert({
          user_id: user.id,
          old_role: oldRole,
          new_role: selectedRole,
          source: 'profile_complete_form',
          metadata: {
            email: user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName,
            last_name: user.lastName,
          },
        });
      }

      // Volunteer-specific: dog + audience preferences
      if (selectedRole === 'volunteer') {
        const { data: existingDog } = await supabase
          .from('dogs')
          .select('*')
          .eq('volunteer_id', user.id)
          .single();

        const dogPayload = {
          volunteer_id: user.id,
          dog_name: dogName,
          dog_age: dogAge,
          dog_breed: dogBreed,
          dog_bio: dogBio,
          dog_picture_url: dogPhotoUrl || DEFAULT_DOG_IMAGE,
          status: 'pending',
          vaccine_record_url: vaccineDocumentUrl || null,
          vaccine_date_issued: vaccineIssuedDate || null,
          vaccine_expiry_date: vaccineExpiryDate || null,
        };

        if (existingDog) {
          await supabase.from('dogs').update(dogPayload).eq('volunteer_id', user.id);
        } else {
          await supabase.from('dogs').insert(dogPayload);
        }

        // If no categories selected, treat as "open to all" by saving all available categories
        const categoriesToSave = selectedCategories.length > 0 ? selectedCategories : availableCategories;

        if (categoriesToSave.length > 0) {
          await supabase.from('volunteer_audience_preferences').delete().eq('volunteer_id', user.id);

          const { data: categories } = await supabase
            .from('audience_categories')
            .select('id, name')
            .in('name', categoriesToSave);

          if (categories && categories.length > 0) {
            const { error: audienceError } = await supabase
              .from('volunteer_audience_preferences')
              .insert(categories.map((cat) => ({ volunteer_id: user.id, category_id: cat.id })));

            if (audienceError) throw new Error(audienceError.message);
          }
        }

        await geocodePostalCode(normalizePostalCode(postalCode), user.id);
      }

      if (selectedRole === 'individual') {
        await geocodePostalCode(normalizePostalCode(postalCode), user.id);
      }

      // Organization lat/lng is populated directly from Google Places selection — no geocoding needed.

      // Welcome email
      try {
        await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.primaryEmailAddress?.emailAddress,
            firstName: user.firstName,
          }),
        });
      } catch (e) {
        console.error('[ProfileComplete] Failed to send welcome email:', e);
      }

      // Admin notification
      try {
        await fetch('/api/admin/notify-new-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: `${user.firstName} ${user.lastName}`,
            userType: selectedRole,
          }),
        });
      } catch (e) {
        console.error('[ProfileComplete] Failed to send admin notification:', e);
      }

      router.push('/dashboard');
    } catch (error: any) {
      setSubmitError(error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render current step ────────────────────────────────────────────────────

  const renderStep = () => {
    if (currentStep === 1) {
      return <RoleSelection onSelect={handleRoleSelect} />;
    }

    if (selectedRole === 'individual') {
      if (currentStep === 2) return (
        <IndividualBasicInfo
          phone={phone} setPhone={setPhone}
          postalCode={postalCode} setPostalCode={setPostalCode}
          visitRecipientType={visitRecipientType} setVisitRecipientType={setVisitRecipientType}
          dependantName={dependantName} setDependantName={setDependantName}
          relationshipToRecipient={relationshipToRecipient} setRelationshipToRecipient={setRelationshipToRecipient}
          isLoading={isLoading}
        />
      );
      if (currentStep === 3) return (
        <IndividualVisitDetails
          visitRecipientType={visitRecipientType}
          bio={bio} setBio={setBio}
          pronouns={pronouns} setPronouns={setPronouns}
          birthday={birthday} setBirthday={setBirthday}
          physicalAddress={physicalAddress} setPhysicalAddress={setPhysicalAddress}
          otherPetsOnSite={otherPetsOnSite} setOtherPetsOnSite={setOtherPetsOnSite}
          otherPetsDescription={otherPetsDescription} setOtherPetsDescription={setOtherPetsDescription}
          thirdPartyAvailable={thirdPartyAvailable} setThirdPartyAvailable={setThirdPartyAvailable}
          additionalInformation={additionalInformation} setAdditionalInformation={setAdditionalInformation}
          profilePictureUrl={profilePictureUrl} setProfilePictureUrl={setProfilePictureUrl}
          user={user!}
          isLoading={isLoading}
        />
      );
      if (currentStep === 4) return (
        <IndividualLiabilityWaiver
          liabilityWaiverAccepted={liabilityWaiverAccepted}
          setLiabilityWaiverAccepted={setLiabilityWaiverAccepted}
          isLoading={isLoading}
        />
      );
    }

    if (selectedRole === 'volunteer') {
      if (currentStep === 2) return (
        <VolunteerBasicInfo
          phone={phone} setPhone={setPhone}
          postalCode={postalCode} setPostalCode={setPostalCode}
          bio={bio} setBio={setBio}
          pronouns={pronouns} setPronouns={setPronouns}
          travelDistance={travelDistance} setTravelDistance={setTravelDistance}
          profilePictureUrl={profilePictureUrl} setProfilePictureUrl={setProfilePictureUrl}
          user={user!}
          isLoading={isLoading}
        />
      );
      if (currentStep === 3) return (
        <VolunteerDogProfile
          dogName={dogName} setDogName={setDogName}
          dogBreed={dogBreed} setDogBreed={setDogBreed}
          dogAge={dogAge} setDogAge={setDogAge}
          dogBio={dogBio} setDogBio={setDogBio}
          dogPhotoUrl={dogPhotoUrl} setDogPhotoUrl={setDogPhotoUrl}
          isLoading={isLoading}
        />
      );
      if (currentStep === 4) return (
        <VolunteerAudiencePrefs
          availableCategories={availableCategories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          isLoading={isLoading}
        />
      );
      if (currentStep === 5) return (
        <VolunteerCompliance
          userId={user!.id}
          vscDocumentUrl={vscDocumentUrl} setVscDocumentUrl={setVscDocumentUrl}
          vscDate={vscDate} setVscDate={setVscDate}
          vaccineDocumentUrl={vaccineDocumentUrl} setVaccineDocumentUrl={setVaccineDocumentUrl}
          vaccineIssuedDate={vaccineIssuedDate} setVaccineIssuedDate={setVaccineIssuedDate}
          vaccineExpiryDate={vaccineExpiryDate} setVaccineExpiryDate={setVaccineExpiryDate}
          isLoading={isLoading}
        />
      );
    }

    if (selectedRole === 'organization') {
      if (currentStep === 2) return (
        <OrgDetails
          orgName={orgName} setOrgName={setOrgName}
          orgType={orgType} setOrgType={setOrgType}
          orgAddress={orgAddress} setOrgAddress={setOrgAddress}
          onOrgPlaceSelect={handleOrgPlaceSelect}
          orgContactName={orgContactName} setOrgContactName={setOrgContactName}
          orgContactPhone={orgContactPhone} setOrgContactPhone={setOrgContactPhone}
          profilePictureUrl={profilePictureUrl} setProfilePictureUrl={setProfilePictureUrl}
          orgFeeTier={orgFeeTier} setOrgFeeTier={setOrgFeeTier}
          isLoading={isLoading}
        />
      );
    }

    return null;
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = getTotalSteps(selectedRole);
  const stepTitle = getStepTitle(selectedRole, currentStep);

  return (
    <div className="min-h-dvh bg-gray-50 overflow-y-auto flex items-start justify-center py-8 px-4">
      <div
        className={`w-full max-w-lg bg-white rounded-2xl shadow-lg overflow-hidden transition-opacity duration-500 ${
          fadeIn ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Blue logo header — matches app dashboard style */}
        <div className="bg-[#0e62ae] px-6 py-4 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sunshine-logo-white.png"
            alt="Sunshine Therapy Dogs"
            className="h-8 object-contain"
          />
        </div>

        {/* Form body */}
        <div className="p-6">
          {/* Progress bar (shown from step 2 onward) */}
          {currentStep > 1 && selectedRole && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#0e62ae]">{stepTitle}</span>
                <span className="text-xs text-gray-400">Step {currentStep - 1} of {totalSteps - 1}</span>
              </div>
              <StepIndicator current={currentStep - 1} total={totalSteps - 1} />
            </div>
          )}

          {/* Step content */}
          {renderStep()}

          {/* Error */}
          {submitError && (
            <p className="text-red-500 text-sm mt-4">{submitError}</p>
          )}

          {/* Navigation */}
          {currentStep > 1 && (
            <div className="flex mt-6 justify-between items-center">
              <button
                type="button"
                onClick={handleBack}
                disabled={isLoading}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#0e62ae] transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-[#0e62ae] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {isLoading ? 'Submitting...' : 'Submit Profile'}
                </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                disabled={isLoading}
                className="px-6 py-2.5 bg-[#0e62ae] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                Next
              </button>
            )}
          </div>
        )}
        </div> {/* end form body */}
      </div> {/* end card */}
    </div>
  );
}
