'use client';

interface IndividualLiabilityWaiverProps {
  liabilityWaiverAccepted: boolean;
  setLiabilityWaiverAccepted: (v: boolean) => void;
  isLoading: boolean;
}

export default function IndividualLiabilityWaiver({
  liabilityWaiverAccepted,
  setLiabilityWaiverAccepted,
  isLoading,
}: IndividualLiabilityWaiverProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 leading-relaxed">
        <h3 className="font-semibold text-gray-900 mb-2">Liability Waiver</h3>
        <p>
          I release Sunshine Therapy Dogs from any liability due to any accident, incident, injury or other
          adverse impact that may be incurred on a comfort visit. I understand the risks involved with this
          service and wish to proceed with these comfort visits.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={liabilityWaiverAccepted}
          onChange={(e) => setLiabilityWaiverAccepted(e.target.checked)}
          className="mt-1 shrink-0"
          disabled={isLoading}
        />
        <span className="text-sm font-semibold text-gray-700">
          I agree to the terms above <span className="text-red-500">*</span>
        </span>
      </label>
    </div>
  );
}
