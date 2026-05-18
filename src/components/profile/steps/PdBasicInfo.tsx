'use client';

interface Props {
  phone: string;
  setPhone: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  isLoading: boolean;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function PdBasicInfo({ phone, setPhone, postalCode, setPostalCode, isLoading }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Welcome, Program Director</h2>
        <p className="text-sm text-gray-500 mt-1">
          Just a couple of details to get your account set up.
        </p>
      </div>

      <div>
        <label className={labelClass}>Phone Number</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className={inputClass}
          placeholder="e.g. 416-555-0100"
          disabled={isLoading}
        />
      </div>

      <div>
        <label className={labelClass}>Home Postal Code</label>
        <input
          type="text"
          value={postalCode}
          onChange={e => setPostalCode(e.target.value.toUpperCase())}
          className={inputClass}
          placeholder="e.g. M5V 0K4"
          maxLength={7}
          disabled={isLoading}
        />
        <p className="text-xs text-gray-400 mt-1">
          Used to determine which visits are in your area. Not shared publicly.
        </p>
      </div>
    </div>
  );
}
