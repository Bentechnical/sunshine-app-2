//src/components/profile/AvatarUpload.tsx

'use client';

import React, { useRef, useState, ChangeEvent } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';

interface AvatarUploadProps {
  initialUrl?: string;
  fallbackUrl?: string;
  onUpload: (url: string) => void;
  size?: number;
  altText?: string;
}

export default function AvatarUpload({
  initialUrl,
  fallbackUrl,
  onUpload,
  size = 100,
  altText = 'Avatar',
}: AvatarUploadProps) {
  const supabase = useSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const [previewUrl, setPreviewUrl] = useState<string>(initialUrl || fallbackUrl || '');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Instant preview
    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const filePath = `profile-pictures/${fileName}`;

    const { error } = await supabase.storage
      .from('sunshine-pics')
      .upload(filePath, file);

    if (error) {
      console.error('Upload error:', error.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('sunshine-pics')
      .getPublicUrl(filePath);

    if (publicUrlData?.publicUrl) {
      onUpload(publicUrlData.publicUrl); // This is what will be saved to the DB
    } else {
      console.error('Failed to get public URL after upload.');
    }
  };

  return (
    <div
      className="relative group cursor-pointer"
      style={{ width: size, height: size }}
      onClick={handleClick}
    >
      <img
        src={previewUrl}
        alt={altText}
        className="rounded-full object-cover w-full h-full transition-opacity group-hover:opacity-60 border"
      />
      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-sm rounded-full">
        Change
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
