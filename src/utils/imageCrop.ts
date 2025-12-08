/**
 * Image cropping utilities for react-easy-crop
 */

export interface CroppedArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Creates a cropped image from the original image and crop data
 * @param imageSrc - The source image URL
 * @param pixelCrop - The crop area in pixels from react-easy-crop
 * @param maxWidth - Maximum width for the output image (default: 1000px)
 * @returns A promise that resolves to a File object
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CroppedArea,
  maxWidth: number = 1000
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Calculate dimensions maintaining aspect ratio
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Set canvas size to the cropped area
  const cropWidth = pixelCrop.width * scaleX;
  const cropHeight = pixelCrop.height * scaleY;

  // Scale down if needed
  const scale = Math.min(maxWidth / cropWidth, 1);
  canvas.width = cropWidth * scale;
  canvas.height = cropHeight * scale;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // Convert canvas to blob then to File
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }

        // Create a File object from the blob
        const file = new File([blob], `cropped-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        resolve(file);
      },
      'image/jpeg',
      0.92 // Quality
    );
  });
}

/**
 * Helper function to create an image element from a URL
 */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

/**
 * Validates an image file before upload
 * @param file - The file to validate
 * @param maxSizeMB - Maximum file size in megabytes (default: 10MB)
 * @returns Error message if invalid, null if valid
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 10
): string | null {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return 'Please upload a valid image file (JPG, PNG, or WebP)';
  }

  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `Image size must be less than ${maxSizeMB}MB`;
  }

  return null;
}
