//src/components/profile/AvatarUpload.tsx

'use client';

import React, { useRef, useState, ChangeEvent, useImperativeHandle, forwardRef } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import ImageCropModal from '@/components/ui/ImageCropModal';
import { validateImageFile } from '@/utils/imageCrop';

interface AvatarUploadProps {
  initialUrl?: string;
  fallbackUrl?: string;
  onUpload: (url: string) => void;
  size?: number;
  altText?: string;
}

export interface AvatarUploadHandle {
  triggerClick: () => void;
}

const AvatarUpload = forwardRef<AvatarUploadHandle, AvatarUploadProps>(({
  initialUrl,
  fallbackUrl,
  onUpload,
  size = 100,
  altText = 'Avatar',
}, ref) => {
  const supabase = useSupabaseClient();

  const [previewUrl, setPreviewUrl] = useState<string>(initialUrl || fallbackUrl || '');
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    // Always open file picker directly (works on all platforms)
    fileInputRef.current?.click();
  };

  // Expose handleClick to parent component via ref
  useImperativeHandle(ref, () => ({
    triggerClick: handleClick
  }));

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show loading state
    setIsUploading(true);

    // Validate the file
    const validationError = validateImageFile(file, 10);
    if (validationError) {
      alert(validationError);
      setIsUploading(false);
      return;
    }

    // Small delay to show loading state before modal opens
    await new Promise(resolve => setTimeout(resolve, 300));

    // Create a preview URL and open the crop modal
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageSrc(imageUrl);

    // Keep uploading state until modal is fully opened
    await new Promise(resolve => setTimeout(resolve, 100));
    setIsUploading(false);

    // Reset the file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    setIsUploading(true);

    try {
      // Create a local preview immediately
      const localPreviewUrl = URL.createObjectURL(croppedFile);
      setPreviewUrl(localPreviewUrl);

      // Upload the cropped file to Supabase
      const ext = 'jpg'; // We always save as JPEG from the cropper
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `profile-pictures/${fileName}`;

      const { error } = await supabase.storage
        .from('sunshine-pics')
        .upload(filePath, croppedFile);

      if (error) {
        console.error('Upload error:', error.message);
        alert('Failed to upload image. Please try again.');
        // Revoke the blob URL on error
        URL.revokeObjectURL(localPreviewUrl);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('sunshine-pics')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        // Revoke the blob URL now that we have the real URL
        URL.revokeObjectURL(localPreviewUrl);
        onUpload(publicUrlData.publicUrl);
      } else {
        console.error('Failed to get public URL after upload.');
        alert('Failed to get image URL. Please try again.');
        // Revoke the blob URL on error
        URL.revokeObjectURL(localPreviewUrl);
      }
    } catch (error) {
      console.error('Error uploading cropped image:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsUploading(false);
      setSelectedImageSrc(null);
    }
  };

  const handleCropCancel = () => {
    // Clean up blob URL before closing
    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
    }
    setSelectedImageSrc(null);
  };

  return (
    <>
      <div
        className="relative group cursor-pointer"
        style={{ width: size, height: size }}
        onClick={isUploading ? undefined : handleClick}
      >
        <img
          src={previewUrl}
          alt={altText}
          className="object-cover w-full h-full transition-opacity group-hover:opacity-60 border"
        />
        <div className={`absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-sm transition-opacity ${
          isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {isUploading ? 'Processing...' : 'Change'}
        </div>

        {/* Hidden file input - allows both camera and gallery on mobile */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* Image Crop Modal */}
      {selectedImageSrc && (
        <ImageCropModal
          imageSrc={selectedImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          isOpen={!!selectedImageSrc}
        />
      )}
    </>
  );
});

AvatarUpload.displayName = 'AvatarUpload';

export default AvatarUpload;
