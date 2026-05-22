'use client';

import AvatarUpload from '@/components/profile/AvatarUpload';
import PlacesAutocomplete, { PlaceResult } from '@/components/ui/PlacesAutocomplete';

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return `(${parts[0]}`;
    if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
  }
  return value;
};

const FEE_TIERS = [
  {
    value: 'tier_500',
    label: '$500',
    description: 'Corporate, private, for-profit organizations, conferences, festivals, and large-scale events',
  },
  {
    value: 'tier_200',
    label: '$200',
    description: 'Post-secondary institutions, private and independent schools, private seniors and care facilities, private/for-profit therapy services, and wellness visits to non-profit agency staff',
  },
  {
    value: 'tier_0',
    label: '$0',
    description: 'Public schools, service recipients of non-profit organizations, first responders, and patients of inpatient settings',
  },
];

interface OrgDetailsProps {
  orgName: string;
  setOrgName: (v: string) => void;
  orgAddress: string;
  setOrgAddress: (v: string) => void;
  onOrgPlaceSelect: (result: PlaceResult) => void;
  orgContactName: string;
  setOrgContactName: (v: string) => void;
  orgContactPhone: string;
  setOrgContactPhone: (v: string) => void;
  profilePictureUrl: string;
  setProfilePictureUrl: (url: string) => void;
  orgFeeTier: string;
  setOrgFeeTier: (v: string) => void;
  isLoading: boolean;
}

export default function OrgDetails({
  orgName,
  setOrgName,
  orgAddress,
  setOrgAddress,
  onOrgPlaceSelect,
  orgContactName,
  setOrgContactName,
  orgContactPhone,
  setOrgContactPhone,
  profilePictureUrl,
  setProfilePictureUrl,
  orgFeeTier,
  setOrgFeeTier,
  isLoading,
}: OrgDetailsProps) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Tell us about your organization. Once submitted, your account will be reviewed by our team
        before you can request visits.
      </p>

      {/* Logo Upload */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-gray-700 self-start">Organization Logo</p>
        <div className="flex flex-col items-center gap-1">
          <AvatarUpload
            initialUrl={profilePictureUrl && !profilePictureUrl.includes('clerk.com') ? profilePictureUrl : ''}
            onUpload={setProfilePictureUrl}
            size={96}
            altText="Organization logo"
            variant="org"
          />
          <p className="text-xs text-gray-400">Click to upload logo</p>
        </div>
      </div>

      <div>
        <label htmlFor="orgName" className="block text-sm font-semibold text-gray-700 mb-2">
          Organization Name <span className="text-red-500">*</span>
        </label>
        <input
          id="orgName"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="e.g., Sunnybrook Hospital"
        />
      </div>

      <div>
        <label htmlFor="orgContactName" className="block text-sm font-semibold text-gray-700 mb-2">
          Primary Contact Name <span className="text-red-500">*</span>
        </label>
        <input
          id="orgContactName"
          type="text"
          value={orgContactName}
          onChange={(e) => setOrgContactName(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="e.g., Jane Smith"
        />
      </div>

      <div>
        <label htmlFor="orgContactPhone" className="block text-sm font-semibold text-gray-700 mb-2">
          Contact Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          id="orgContactPhone"
          type="tel"
          value={orgContactPhone}
          onChange={(e) => setOrgContactPhone(formatPhoneNumber(e.target.value))}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="(123) 456-7890"
        />
      </div>

      <div>
        <label htmlFor="orgAddress" className="block text-sm font-semibold text-gray-700 mb-2">
          Organization Address <span className="text-red-500">*</span>
        </label>
        <PlacesAutocomplete
          value={orgAddress}
          onSelect={onOrgPlaceSelect}
          onChange={setOrgAddress}
          disabled={isLoading}
          placeholder="Start typing your address…"
          className="w-full px-4 py-2 border rounded-lg"
        />
        <p className="text-xs text-gray-400 mt-1">Select your address from the dropdown to confirm it.</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Fee Tier <span className="text-red-500">*</span>
        </label>
        <p className="text-sm text-gray-500 mb-3">
          We operate on a tiered fee-for-service model. Which of these categories best describes your organization?
        </p>
        <div className="space-y-3">
          {FEE_TIERS.map(tier => (
            <label
              key={tier.value}
              className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                orgFeeTier === tier.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="fee_tier"
                value={tier.value}
                checked={orgFeeTier === tier.value}
                onChange={() => setOrgFeeTier(tier.value)}
                disabled={isLoading}
                className="mt-0.5 shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">{tier.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{tier.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
