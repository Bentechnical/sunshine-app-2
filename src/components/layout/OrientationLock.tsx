"use client";

import { useEffect } from "react";

/**
 * Best-effort portrait lock.
 * - Tries Screen Orientation API where supported (Android Chrome / installed PWA).
 * - Silently ignores failures (iOS Safari does not support locking).
 * - CSS overlay in globals.css blocks landscape as a universal fallback.
 */
export default function OrientationLock(): null {
  useEffect(() => {
    const tryLock = async () => {
      const orientation: any = (window.screen as any)?.orientation;
      if (!orientation || typeof orientation.lock !== "function") return;
      try {
        // Prefer "portrait-primary" but some browsers accept "portrait"
        await orientation.lock("portrait-primary");
      } catch {
        try {
          // Fallback string option
          // @ts-expect-error legacy string
          await orientation.lock("portrait");
        } catch {
          // Ignore; CSS overlay will handle unsupported cases
        }
      }
    };

    // Attempt on mount; also retry after orientation changes
    tryLock();
    window.addEventListener("orientationchange", tryLock);
    return () => window.removeEventListener("orientationchange", tryLock);
  }, []);

  return null;
}


