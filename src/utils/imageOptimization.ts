/**
 * Image optimization utilities for Supabase storage and Next.js Image
 */

/**
 * Optimizes a Supabase storage URL by adding transformation parameters
 *
 * @param url - Original image URL from Supabase storage
 * @param options - Transformation options
 * @returns Optimized URL with transformation parameters
 *
 * @example
 * optimizeSupabaseImage('https://...supabase.co/storage/v1/object/public/dogs/image.jpg', { width: 400 })
 * // Returns: 'https://...supabase.co/storage/v1/object/public/dogs/image.jpg?width=400&quality=80'
 */
export function optimizeSupabaseImage(
  url: string | null | undefined,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
  } = {}
): string {
  // Return default placeholder if no URL
  if (!url) {
    return '/images/default_dog.png';
  }

  // Don't transform local images or already optimized URLs
  if (url.startsWith('/') || url.includes('?')) {
    return url;
  }

  // Only transform Supabase storage URLs
  if (!url.includes('supabase.co/storage')) {
    return url;
  }

  const params = new URLSearchParams();

  if (options.width) params.set('width', options.width.toString());
  if (options.height) params.set('height', options.height.toString());
  if (options.quality) params.set('quality', options.quality.toString());
  if (options.format) params.set('format', options.format);

  // Default quality if not specified
  if (!options.quality && !params.has('quality')) {
    params.set('quality', '80');
  }

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * Get the appropriate image sizes attribute for Next.js Image component
 * based on the component's layout
 *
 * @param layout - Where the image appears in the UI
 * @returns sizes string for Next.js Image component
 */
export function getImageSizes(layout: 'card' | 'profile' | 'thumbnail' | 'full'): string {
  switch (layout) {
    case 'thumbnail':
      return '100px';
    case 'profile':
      return '(max-width: 768px) 200px, 300px';
    case 'card':
      return '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw';
    case 'full':
      return '100vw';
    default:
      return '100vw';
  }
}
