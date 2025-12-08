//src/components/profile/AvatarUpload.tsx

'use client';

import React, { useRef, useState, ChangeEvent } from 'react';
import { useSupabaseClient } from '@/utils/supabase/client';
import ImageCropModal from '@/components/ui/ImageCropModal';
import { validateImageFile } from '@/utils/imageCrop';
import { Camera, Image as ImageIcon } from 'lucide-react';

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

  const [previewUrl, setPreviewUrl] = useState<string>(initialUrl || fallbackUrl || '');
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    // On mobile, show modal to choose between camera and photo library
    if (isMobileDevice()) {
      setShowSourceModal(true);
    } else {
      // On desktop, just open file picker
      fileInputRef.current?.click();
    }
  };

  const handleCameraClick = () => {
    setShowSourceModal(false);
    cameraInputRef.current?.click();
  };

  const handleGalleryClick = () => {
    setShowSourceModal(false);
    fileInputRef.current?.click();
  };

  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate the file
    const validationError = validateImageFile(file, 10);
    if (validationError) {
      alert(validationError);
      return;
    }

    // Create a preview URL and open the crop modal
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageSrc(imageUrl);

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
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('sunshine-pics')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        onUpload(publicUrlData.publicUrl);
      } else {
        console.error('Failed to get public URL after upload.');
        alert('Failed to get image URL. Please try again.');
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
    setSelectedImageSrc(null);
  };

  return (
    <>
      <div
        className="relative group cursor-pointer"
        style={{ width: size, height: size }}
        onClick={handleClick}
      >
        <img
          src={previewUrl}
          alt={altText}
          className="object-cover w-full h-full transition-opacity group-hover:opacity-60 border"
        />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-sm">
          {isUploading ? 'Uploading...' : 'Change'}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {/* Source Selection Modal (Mobile Only) */}
      {showSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Choose Image Source
              </h3>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleCameraClick}
                  className="w-full flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Camera size={24} className="text-gray-600" />
                  <span className="text-gray-800 font-medium">Take Photo</span>
                </button>

                <button
                  type="button"
                  onClick={handleGalleryClick}
                  className="w-full flex items-center gap-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <ImageIcon size={24} className="text-gray-600" />
                  <span className="text-gray-800 font-medium">Choose from Gallery</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                className="w-full mt-4 py-2 text-gray-600 hover:text-gray-800 transition"
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
}
