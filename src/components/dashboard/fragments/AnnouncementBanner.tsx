// src/components/dashboard/fragments/AnnouncementBanner.tsx
'use client';

interface AnnouncementBannerProps {
  message: string;
}

export default function AnnouncementBanner({ message }: AnnouncementBannerProps) {
  return (
    <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded border border-yellow-300 shadow-sm">
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
