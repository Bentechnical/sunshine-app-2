'use client';

import { useEffect, useRef, useState } from 'react';

export interface PlaceResult {
  formatted_address: string;
  place_id: string;
  lat: number;
  lng: number;
  postal_code: string;
}

interface Props {
  // Controlled mode: pass value + onChange
  value?: string;
  onChange?: (value: string) => void;
  // Uncontrolled mode: seed the input with an initial value
  initialValue?: string;
  onSelect: (result: PlaceResult) => void;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

declare global {
  interface Window {
    google: any;
    __mapsApiCallback: () => void;
  }
}

// Module-level singleton to avoid loading the script multiple times
let mapsReady = false;
let mapsLoading = false;
const pendingCallbacks: Array<() => void> = [];

function loadMapsScript(onReady: () => void) {
  if (mapsReady) { onReady(); return; }
  pendingCallbacks.push(onReady);
  if (mapsLoading) return;
  mapsLoading = true;

  window.__mapsApiCallback = () => {
    mapsReady = true;
    pendingCallbacks.forEach(fn => fn());
    pendingCallbacks.length = 0;
  };

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=__mapsApiCallback`;
  script.async = true;
  document.head.appendChild(script);
}

export default function PlacesAutocomplete({
  value: controlledValue,
  onChange,
  initialValue,
  onSelect,
  disabled,
  placeholder,
  required,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [internalValue, setInternalValue] = useState(initialValue ?? '');

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  useEffect(() => {
    loadMapsScript(() => setReady(true));
  }, []);

  // Suppress browser native autofill — Chrome ignores autoComplete="off" on
  // address-like inputs; setting it directly on the DOM node is more reliable.
  useEffect(() => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    // Random name ensures Chrome doesn't recognise this as a known address field
    const randomName = `pac-${Math.random().toString(36).slice(2)}`;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('name', randomName);
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'ca' },
      fields: ['formatted_address', 'place_id', 'geometry', 'address_components'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;

      const postalComponent = place.address_components?.find(
        (c: any) => c.types.includes('postal_code')
      );

      const result: PlaceResult = {
        formatted_address: place.formatted_address ?? '',
        place_id: place.place_id ?? '',
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        postal_code: postalComponent?.long_name ?? '',
      };
      if (!isControlled) setInternalValue(result.formatted_address);
      onSelect(result);
    });

    acRef.current = ac;

    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
      }
      acRef.current = null;
    };
  }, [ready]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => {
        const v = e.target.value;
        if (isControlled) onChange?.(v);
        else setInternalValue(v);
      }}
      disabled={disabled}
      placeholder={placeholder ?? 'Start typing an address…'}
      required={required}
      className={className}
      autoComplete="off"
    />
  );
}
