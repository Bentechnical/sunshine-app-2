'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { optimizeSupabaseImage } from '@/utils/imageOptimization';
import { formatCardDate, formatCardTime } from '@/utils/timeZone';
import { CalendarClock } from 'lucide-react';

interface PendingRequest {
  id: string;
  requester_id: string;
  dog_id: number | null;
  created_at: string;
  requester_first_name: string;
  requester_profile_image: string | null;
  dog_name: string | null;
}

interface PendingProposal {
  id: number;
  start_time: string;
  proposer_first_name: string;
}

interface PendingChatRequestsProps {
  onGoToChat: () => void;
  onGoToVisits?: () => void;
}

export default function PendingChatRequests({ onGoToChat, onGoToVisits }: PendingChatRequestsProps) {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;

    const [chatRes, proposalRes] = await Promise.all([
      // Pending chat requests sent TO me
      supabase
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
        .order('created_at', { ascending: false }),

      // Pending appointment proposals NOT proposed by me (i.e., I need to respond)
      supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          proposed_by,
          proposer:users!appointments_proposed_by_fkey(first_name)
        `)
        .or(`individual_id.eq.${user.id},volunteer_id.eq.${user.id}`)
        .eq('status', 'pending')
        .neq('proposed_by', user.id)
        .gt('start_time', new Date().toISOString())
        .order('start_time', { ascending: true }),
    ]);

    if (chatRes.error) {
      console.error('[PendingChatRequests] Chat fetch error:', chatRes.error.message);
    } else {
      setRequests(
        (chatRes.data ?? []).map((row: any) => ({
          id: row.id,
          requester_id: row.requester_id,
          dog_id: row.dog_id,
          created_at: row.created_at,
          requester_first_name: row.requester?.first_name ?? 'Someone',
          requester_profile_image: row.requester?.profile_image ?? null,
          dog_name: row.dog?.dog_name ?? null,
        }))
      );
    }

    if (proposalRes.error) {
      console.error('[PendingChatRequests] Proposal fetch error:', proposalRes.error.message);
    } else {
      setProposals(
        (proposalRes.data ?? []).map((row: any) => ({
          id: row.id,
          start_time: row.start_time,
          proposer_first_name: row.proposer?.first_name ?? 'Someone',
        }))
      );
    }

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

  if (loading || (requests.length === 0 && proposals.length === 0)) return null;

  return (
    <div className="mb-6 flex flex-col gap-4">
      {/* Pending chat requests */}
      {requests.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Pending Chat Requests</h3>
          <div className="flex flex-col gap-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white border border-blue-100 rounded-lg p-4 flex items-center gap-4 shadow-sm"
              >
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

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{req.requester_first_name}</p>
                  {req.dog_name && (
                    <p className="text-sm text-gray-500">Re: {req.dog_name}</p>
                  )}
                </div>

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
      )}

      {/* Pending appointment proposals */}
      {proposals.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Pending Visit Proposals</h3>
          <div className="flex flex-col gap-3">
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-white border border-amber-100 rounded-lg p-4 flex items-center gap-4 shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <CalendarClock className="w-5 h-5 text-amber-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">
                    {proposal.proposer_first_name} proposed a visit
                  </p>
                  <p className="text-sm text-gray-500">
                    {formatCardDate(proposal.start_time)} at {formatCardTime(proposal.start_time)}
                  </p>
                </div>

                <div className="flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onGoToVisits}
                  >
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
