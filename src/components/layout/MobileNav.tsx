'use client';

import React from 'react';
import {
  Dog,
  Calendar,
  ClipboardList,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  value: 'dog' | 'availability' | 'visits' | 'messaging';
  onChange: (value: MobileNavProps['value']) => void;
}

const TABS: {
  key: MobileNavProps['value'];
  label: string;
  icon: React.ElementType;
}[] = [
  { key: 'dog', label: 'My Dog', icon: Dog },
  { key: 'availability', label: 'Availability', icon: Calendar },
  { key: 'visits', label: 'Visits', icon: ClipboardList },
  { key: 'messaging', label: 'Messages', icon: MessageCircle },
];

export default function MobileNav({ value, onChange }: MobileNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 w-full border-t bg-background md:hidden z-50">
      <div className="grid grid-cols-4 h-16">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = value === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex flex-col items-center justify-center text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5 mb-1" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
