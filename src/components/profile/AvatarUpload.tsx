'use client';

import React, { useRef, useState, ChangeEvent } from 'react';
import { supabase } from '@/utils/supabase/client';

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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const getAbsoluteUrl = (url: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${baseUrl}${url}`;
  };

  // Determine default image
  const defaultUrl = initialUrl || fallbackUrl || '';
  const [avatarUrl, setAvatarUrl] = useState<string>(getAbsoluteUrl(defaultUrl));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Click the hidden file input
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  // Handle file input changes
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `profile-pictures/${fileName}`;

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from('sunshine-pics')
        .upload(filePath, file);

      if (error) {
        console.error('Upload error:', error);
        return;
      }

      // Retrieve the public URL
      const { data: publicUrlData } = supabase.storage
        .from('sunshine-pics')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        // Update local state & notify parent
        setAvatarUrl(publicUrlData.publicUrl);
        onUpload(publicUrlData.publicUrl);
      }
    } catch (err) {
      console.error('Unexpected upload error:', err);
    }
  };

  return (
    <div
      className="relative group cursor-pointer"
      style={{ width: size, height: size }}
      onClick={handleClick}
    >
      <img
        src={avatarUrl}
        alt={altText}
        className="rounded-full object-cover w-full h-full transition-opacity
                   group-hover:opacity-60 border"
      />
      {/* Hover overlay */}
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity
             absolute inset-0 flex items-center justify-center
             bg-black bg-opacity-50 text-white text-sm
             rounded-full"
      >
        Change
      </div>

      {/* Hidden file input */}
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
