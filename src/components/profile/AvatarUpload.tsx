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
  const [showSourceModal, setShowSourceModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Detect if user is on Android
  const isAndroid = typeof window !== 'undefined' && /android/i.test(navigator.userAgent);

  const handleClick = () => {
    // On Android, show custom source selection modal
    // On iOS/Desktop, use native file picker
    if (isAndroid) {
      setShowSourceModal(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleSourceSelect = (source: 'camera' | 'gallery') => {
    setShowSourceModal(false);
    if (source === 'camera') {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
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

        {/* Gallery input - used on all platforms */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Camera input - used only on Android for direct camera access */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* Android Source Selection Modal */}
      {showSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Choose Image Source</h3>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleSourceSelect('camera')}
                className="w-full px-4 py-3 bg-[#0e62ae] text-white rounded-md hover:bg-[#094e8b] transition text-center"
              >
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => handleSourceSelect('gallery')}
                className="w-full px-4 py-3 bg-[#0e62ae] text-white rounded-md hover:bg-[#094e8b] transition text-center"
              >
                Choose from Gallery
              </button>
              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
