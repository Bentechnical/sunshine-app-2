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

interface IndividualBasicInfoProps {
  phone: string;
  setPhone: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  visitRecipientType: string;
  setVisitRecipientType: (v: string) => void;
  dependantName: string;
  setDependantName: (v: string) => void;
  relationshipToRecipient: string;
  setRelationshipToRecipient: (v: string) => void;
  isLoading: boolean;
}

export default function IndividualBasicInfo({
  phone,
  setPhone,
  postalCode,
  setPostalCode,
  visitRecipientType,
  setVisitRecipientType,
  dependantName,
  setDependantName,
  relationshipToRecipient,
  setRelationshipToRecipient,
  isLoading,
}: IndividualBasicInfoProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="phoneNumber" className="block text-sm font-semibold text-gray-700 mb-2">
          Phone Number <span className="text-red-500">*</span>
        </label>
        <input
          id="phoneNumber"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
          className="w-full px-4 py-2 border rounded-lg"
          disabled={isLoading}
          placeholder="(123) 456-7890"
        />
      </div>

      <div>
        <label htmlFor="postalCode" className="block text-sm font-semibold text-gray-700 mb-2">
          Postal Code <span className="text-red-500">*</span>
        </label>
        <input
          id="postalCode"
          type="text"
          value={postalCode}
          onChange={(e) => {
            const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            setPostalCode(raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw);
          }}
          className="w-full px-4 py-2 border rounded-lg uppercase"
          disabled={isLoading}
          placeholder="A1A 1A1"
          maxLength={7}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          I'm setting up a visit for: <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-6">
          <label className="flex items-center">
            <input
              type="radio"
              name="visitRecipientType"
              value="self"
              checked={visitRecipientType === 'self'}
              onChange={(e) => setVisitRecipientType(e.target.value)}
              className="mr-2"
              disabled={isLoading}
            />
            Myself
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="visitRecipientType"
              value="other"
              checked={visitRecipientType === 'other'}
              onChange={(e) => setVisitRecipientType(e.target.value)}
              className="mr-2"
              disabled={isLoading}
            />
            Someone else
          </label>
        </div>
      </div>

      {visitRecipientType === 'other' && (
        <>
          <div>
            <label htmlFor="dependantName" className="block text-sm font-semibold text-gray-700 mb-2">
              Name of person receiving visits <span className="text-red-500">*</span>
            </label>
            <input
              id="dependantName"
              type="text"
              value={dependantName}
              onChange={(e) => setDependantName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              disabled={isLoading}
              placeholder="Name of the person who will receive therapy dog visits"
            />
          </div>

          <div>
            <label htmlFor="relationshipToRecipient" className="block text-sm font-semibold text-gray-700 mb-2">
              Your relationship to this person <span className="text-red-500">*</span>
            </label>
            <input
              id="relationshipToRecipient"
              type="text"
              value={relationshipToRecipient}
              onChange={(e) => setRelationshipToRecipient(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg"
              disabled={isLoading}
              placeholder="e.g., parent, guardian, caregiver, spouse"
            />
          </div>
        </>
      )}
    </div>
  );
}
