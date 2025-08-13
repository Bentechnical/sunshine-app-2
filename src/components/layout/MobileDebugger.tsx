'use client';

import { useEffect } from 'react';

export default function MobileDebugger() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      import('eruda').then(eruda => eruda.default.init());
    }
  }, []);

  return null;
}