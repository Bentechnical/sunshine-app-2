// src/components/ui/ImageCropModal.tsx
'use client';

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '@/utils/imageCrop';
import { X } from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  onCropComplete: (croppedFile: File) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export default function ImageCropModal({
  imageSrc,
  onCropComplete,
  onCancel,
  isOpen,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (location: { x: number; y: number }) => {
    setCrop(location);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropCompleteCallback = useCallback(
    (croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!croppedAreaPixels) {
      console.error('No cropped area pixels available');
      alert('Crop area not set. Please try again.');
      return;
    }

    setIsProcessing(true);
    try {
      console.log('Starting crop with:', { imageSrc, croppedAreaPixels });
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      console.log('Crop successful, file size:', croppedFile.size);
      onCropComplete(croppedFile);
    } catch (error) {
      console.error('Error cropping image:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        alert(`Failed to crop image: ${error.message}`);
      } else {
        console.error('Unknown error type:', typeof error, error);
        alert(`Failed to crop image. Please try again. Error: ${String(error)}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black bg-opacity-75 sm:p-4">
      <div className="bg-white rounded-t-none sm:rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[calc(100vh-120px)] sm:max-h-none sm:h-[600px] mb-[120px] sm:mb-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:p-4 border-b shrink-0">
          <h2 className="text-base sm:text-xl font-semibold text-gray-800">Crop Image</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 transition -mr-1"
            disabled={isProcessing}
          >
            <X size={22} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative flex-1 bg-gray-100 overflow-hidden touch-none">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteCallback}
            style={{
              containerStyle: {
                width: '100%',
                height: '100%',
              },
            }}
          />
        </div>

        {/* Controls */}
        <div className="p-3 sm:p-4 border-t bg-white shrink-0">
          {/* Zoom Slider */}
          <div className="mb-3">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Zoom
            </label>
            <div className="px-4 sm:px-0">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* Instructions - Hidden on mobile for space */}
          <p className="hidden sm:block text-sm text-gray-600 mb-4">
            Drag to reposition, use the slider to zoom, then click Save to crop your image.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3 justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              }}
              className="px-3 sm:px-4 py-2 border border-gray-300 rounded-md text-sm sm:text-base text-gray-700 hover:bg-gray-50 transition"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 sm:px-4 py-2 bg-[#0e62ae] text-white rounded-md text-sm sm:text-base hover:bg-[#094e8b] transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Custom styles for the slider */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #0e62ae;
          cursor: pointer;
          border-radius: 50%;
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #0e62ae;
          cursor: pointer;
          border-radius: 50%;
          border: none;
        }
      `}</style>
    </div>
  );
}
