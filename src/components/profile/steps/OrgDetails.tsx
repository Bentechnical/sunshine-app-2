'use client';

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

const ORG_TYPES = [
  'School',
  'Hospital',
  'Long-term Care Home',
  'Mental Health Facility',
  'Library',
  'Community Centre',
  'University / College',
  'Workplace',
  'Other',
];

interface OrgDetailsProps {
  orgName: string;
  setOrgName: (v: string) => void;
  orgType: string;
  setOrgType: (v: string) => void;
  orgAddress: string;
  setOrgAddress: (v: string) => void;
  orgContactPhone: string;
  setOrgContactPhone: (v: string) => void;
  isLoading: boolean;
}

export default function OrgDetails({
  orgName,
  setOrgName,
  orgType,
  setOrgType,
  orgAddress,
  setOrgAddress,
  orgContactPhone,
  setOrgContactPhone,
  isLoading,
}: OrgDetailsProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Tell us about your organization. Once submitted, your account will be reviewed by our team
        before you can request visits.
      </p>

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
        <label htmlFor="orgType" className="block text-sm font-semibold text-gray-700 mb-2">
          Organization Type <span className="text-red-500">*</span>
        </label>
        <select
          id="orgType"
          value={orgType}
          onChange={(e) => setOrgType(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
        >
          <option value="">Select type...</option>
          {ORG_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="orgAddress" className="block text-sm font-semibold text-gray-700 mb-2">
          Address <span className="text-red-500">*</span>
        </label>
        <textarea
          id="orgAddress"
          value={orgAddress}
          onChange={(e) => setOrgAddress(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="Full address of your organization"
          rows={2}
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
    </div>
  );
}
