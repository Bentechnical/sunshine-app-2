'use client';

import dynamic from 'next/dynamic';
import { ExternalLink, MapPin } from 'lucide-react';

const LeafletMap = dynamic(() => import('./VisitMapInner'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-100 animate-pulse" />,
});

interface Props {
  lat: number;
  lng: number;
  address: string;
  placeId?: string | null;
}

function buildMapsUrl(address: string, placeId?: string | null): string {
  const params = new URLSearchParams({ api: '1', query: address });
  if (placeId) params.set('query_place_id', placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export default function VisitMap({ lat, lng, address, placeId }: Props) {
  const mapsUrl = buildMapsUrl(address, placeId);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="h-52 relative">
        <LeafletMap lat={lat} lng={lng} />
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-3 text-sm text-[#0e62ae] font-medium hover:bg-blue-50 transition border-t border-gray-100"
      >
        <MapPin size={14} className="shrink-0 text-[#0e62ae]" />
        <span className="flex-1 truncate">{address}</span>
        <ExternalLink size={13} className="shrink-0 text-gray-400" />
      </a>
    </div>
  );
}
