'use client';

import Image from 'next/image';

interface RoleSelectionProps {
  onSelect: (role: 'individual' | 'volunteer' | 'organization') => void;
}

function ChevronRight() {
  return (
    <svg className="w-5 h-5 text-gray-300 group-hover:text-[#0e62ae] transition-colors shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function RoleSelection({ onSelect }: RoleSelectionProps) {
  return (
    <div>
<div className="grid grid-cols-1 gap-2">

        <button
          type="button"
          onClick={() => onSelect('individual')}
          className="group p-3 rounded-xl border-2 border-gray-100 bg-white hover:border-[#0e62ae] hover:bg-blue-50/30 transition-all duration-200 flex items-center gap-4 text-left shadow-sm hover:shadow-md"
        >
          <div className="relative w-1/3 aspect-square shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/images/book-a-visit-dog.png"
              alt="Visit with a therapy dog"
              fill
              sizes="33vw"
              className="object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">I want to visit with a therapy dog</p>
            <p className="text-sm text-gray-500 mt-0.5">Book personal therapy dog visits</p>
          </div>
          <ChevronRight />
        </button>

        <button
          type="button"
          onClick={() => onSelect('volunteer')}
          className="group p-3 rounded-xl border-2 border-gray-100 bg-white hover:border-[#0e62ae] hover:bg-blue-50/30 transition-all duration-200 flex items-center gap-4 text-left shadow-sm hover:shadow-md"
        >
          <div className="relative w-1/3 aspect-square shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/images/Volunteer-btn.png"
              alt="Volunteer with my dog"
              fill
              sizes="33vw"
              className="object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">I want to volunteer with my dog</p>
            <p className="text-sm text-gray-500 mt-0.5">Bring joy as a therapy dog handler</p>
          </div>
          <ChevronRight />
        </button>

        <button
          type="button"
          onClick={() => onSelect('organization')}
          className="group p-3 rounded-xl border-2 border-gray-100 bg-white hover:border-[#0e62ae] hover:bg-blue-50/30 transition-all duration-200 flex items-center gap-4 text-left shadow-sm hover:shadow-md"
        >
          <div className="relative w-1/3 aspect-square shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/images/org-visit-btn.webp"
              alt="Represent an organization"
              fill
              sizes="33vw"
              className="object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">I represent an organization</p>
            <p className="text-sm text-gray-500 mt-0.5">Request group therapy dog visits for schools, hospitals, care homes, and more</p>
          </div>
          <ChevronRight />
        </button>

      </div>
    </div>
  );
}
