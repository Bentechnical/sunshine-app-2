'use client';

import { useState, useRef } from 'react';

interface VolunteerComplianceProps {
  userId: string;
  vscDocumentUrl: string;
  setVscDocumentUrl: (v: string) => void;
  vscDate: string;
  setVscDate: (v: string) => void;
  vaccineDocumentUrl: string;
  setVaccineDocumentUrl: (v: string) => void;
  vaccineExpiryDate: string;
  setVaccineExpiryDate: (v: string) => void;
  isLoading: boolean;
}

function FileUploadField({
  label,
  hint,
  documentType,
  currentPath,
  onUpload,
  isLoading,
}: {
  label: string;
  hint: string;
  documentType: 'vsc' | 'vaccine';
  currentPath: string;
  onUpload: (path: string) => void;
  isLoading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', documentType);

      const res = await fetch('/api/compliance/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed. Please try again.');
        return;
      }

      onUpload(data.path);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading || uploading}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : currentPath ? 'Replace file' : 'Choose file'}
        </button>
        {currentPath && (
          <span className="text-sm text-green-600 font-medium">Uploaded</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={isLoading || uploading}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function VolunteerCompliance({
  vscDocumentUrl,
  setVscDocumentUrl,
  vscDate,
  setVscDate,
  vaccineDocumentUrl,
  setVaccineDocumentUrl,
  vaccineExpiryDate,
  setVaccineExpiryDate,
  isLoading,
}: VolunteerComplianceProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        These documents are optional at registration and can be uploaded later. However, they may be
        required before your first visit.
      </p>

      <div className="p-4 border border-gray-200 rounded-lg space-y-4">
        <h3 className="text-sm font-bold text-gray-800">Volunteer Screening Check (VSC)</h3>

        <FileUploadField
          label="VSC Document"
          hint="Upload your completed VSC (PDF or image)"
          documentType="vsc"
          currentPath={vscDocumentUrl}
          onUpload={setVscDocumentUrl}
          isLoading={isLoading}
        />

        <div>
          <label htmlFor="vscDate" className="block text-sm font-semibold text-gray-700 mb-2">
            VSC Issue Date
          </label>
          <input
            id="vscDate"
            type="date"
            value={vscDate}
            onChange={(e) => setVscDate(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={isLoading}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="p-4 border border-gray-200 rounded-lg space-y-4">
        <h3 className="text-sm font-bold text-gray-800">Dog Vaccine Records</h3>

        <FileUploadField
          label="Vaccine Record Document"
          hint="Upload your dog's current vaccine record (PDF or image)"
          documentType="vaccine"
          currentPath={vaccineDocumentUrl}
          onUpload={setVaccineDocumentUrl}
          isLoading={isLoading}
        />

        <div>
          <label htmlFor="vaccineExpiryDate" className="block text-sm font-semibold text-gray-700 mb-2">
            Vaccine Expiry Date
          </label>
          <input
            id="vaccineExpiryDate"
            type="date"
            value={vaccineExpiryDate}
            onChange={(e) => setVaccineExpiryDate(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
