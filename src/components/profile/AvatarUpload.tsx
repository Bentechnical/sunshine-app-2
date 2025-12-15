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

  // Detect if user is on mobile (iOS or Android)
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleClick = () => {
    // On mobile (iOS/Android), show custom source selection modal
    // On desktop, use native file picker
    if (isMobile) {
      setShowSourceModal(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleSourceSelect = (e: React.MouseEvent, source: 'camera' | 'gallery') => {
    e.preventDefault();
    e.stopPropagation();
    setShowSourceModal(false);
    if (source === 'camera') {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleSourceCancel = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowSourceModal(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself, not the modal content
    if (e.target === e.currentTarget) {
      handleSourceCancel();
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

    // Reset both file inputs so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedFile: File) => {
    setIsUploading(true);
    setShowSourceModal(false); // Close source modal on Android

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

      {/* Mobile Source Selection Modal */}
      {showSourceModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up">
            {/* Header with Close Button */}
            <div className="relative px-6 pt-6 pb-4 border-b border-gray-100">
              <button
                type="button"
                onClick={handleSourceCancel}
                className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 transition"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-xl font-semibold text-gray-900 text-center">Upload Photo</h3>
              <p className="text-sm text-gray-500 text-center mt-1">Choose a source for your image</p>
            </div>

            {/* Options */}
            <div className="p-6 space-y-3">
              <button
                type="button"
                onClick={(e) => handleSourceSelect(e, 'camera')}
                className="w-full flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-[#0e62ae] to-[#0a4d8a] text-white rounded-xl hover:from-[#094e8b] hover:to-[#073a6a] active:scale-[0.98] transition-all shadow-lg shadow-blue-500/30"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-base">Take Photo</div>
                  <div className="text-xs text-blue-100 mt-0.5">Use your camera</div>
                </div>
                <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={(e) => handleSourceSelect(e, 'gallery')}
                className="w-full flex items-center gap-4 px-5 py-4 bg-white border-2 border-gray-200 text-gray-800 rounded-xl hover:border-[#0e62ae] hover:bg-blue-50 active:scale-[0.98] transition-all"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-base">Choose from Gallery</div>
                  <div className="text-xs text-gray-500 mt-0.5">Select existing photo</div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Cancel Button */}
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={handleSourceCancel}
                className="w-full px-4 py-3 text-gray-600 font-medium hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

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
