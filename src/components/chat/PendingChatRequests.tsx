'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { optimizeSupabaseImage } from '@/utils/imageOptimization';

interface PendingRequest {
  id: string;
  requester_id: string;
  dog_id: number | null;
  created_at: string;
  requester_first_name: string;
  requester_profile_image: string | null;
  dog_name: string | null;
}

interface PendingChatRequestsProps {
  onGoToChat: () => void;
}

export default function PendingChatRequests({ onGoToChat }: PendingChatRequestsProps) {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null); // tracks request id being acted on

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;

    // Fetch pending requests sent to me
    const { data, error } = await supabase
      .from('chat_requests')
      .select(`
        id,
        requester_id,
        dog_id,
        created_at,
        requester:users!chat_requests_requester_id_fkey(first_name, profile_image),
        dog:dogs!chat_requests_dog_id_fkey(dog_name)
      `)
      .eq('recipient_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PendingChatRequests] Fetch error:', error.message);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((row: any) => ({
      id: row.id,
      requester_id: row.requester_id,
      dog_id: row.dog_id,
      created_at: row.created_at,
      requester_first_name: row.requester?.first_name ?? 'Someone',
      requester_profile_image: row.requester?.profile_image ?? null,
      dog_name: row.dog?.dog_name ?? null,
    }));

    setRequests(mapped);
    setLoading(false);
  }, [user?.id, supabase]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAccept = async (requestId: string) => {
    setSubmitting(requestId);
    try {
      const res = await fetch('/api/chat-request/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        onGoToChat();
      }
    } finally {
      setSubmitting(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setSubmitting(requestId);
    try {
      const res = await fetch('/api/chat-request/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } finally {
      setSubmitting(null);
    }
  };

  if (loading || requests.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">Pending Chat Requests</h3>
      <div className="flex flex-col gap-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="bg-white border border-blue-100 rounded-lg p-4 flex items-center gap-4 shadow-sm"
          >
            {/* Profile picture */}
            <div className="relative w-12 h-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
              {req.requester_profile_image ? (
                <Image
                  src={optimizeSupabaseImage(req.requester_profile_image, { width: 100, quality: 80 })}
                  alt={req.requester_first_name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl text-gray-400">
                  {req.requester_first_name[0]}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{req.requester_first_name}</p>
              {req.dog_name && (
                <p className="text-sm text-gray-500">Re: {req.dog_name}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                onClick={() => handleAccept(req.id)}
                disabled={submitting === req.id}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDecline(req.id)}
                disabled={submitting === req.id}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
