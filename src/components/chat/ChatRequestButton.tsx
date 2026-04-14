'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';

type RequestStatus =
  | 'loading'
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'accepted';

interface ChatRequestButtonProps {
  recipientId: string;
  dogId: number;
  onGoToChat: () => void;
}

export default function ChatRequestButton({
  recipientId,
  dogId,
  onGoToChat,
}: ChatRequestButtonProps) {
  const { user } = useUser();
  const supabase = useSupabaseClient();

  const [status, setStatus] = useState<RequestStatus>('loading');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!user?.id) return;

    // Check both directions for any pending or accepted request
    const [fwd, rev] = await Promise.all([
      supabase
        .from('chat_requests')
        .select('id, status, channel_closed_at')
        .eq('requester_id', user.id)
        .eq('recipient_id', recipientId)
        .in('status', ['pending', 'accepted']),
      supabase
        .from('chat_requests')
        .select('id, status, channel_closed_at')
        .eq('requester_id', recipientId)
        .eq('recipient_id', user.id)
        .in('status', ['pending', 'accepted']),
    ]);

    const all = [...(fwd.data ?? []), ...(rev.data ?? [])];

    // Active chat (accepted + not closed) takes priority
    const activeChat = all.find((r) => r.status === 'accepted' && !r.channel_closed_at);
    if (activeChat) {
      setStatus('accepted');
      setRequestId(activeChat.id);
      return;
    }

    // Pending request sent by me
    const sentPending = fwd.data?.find((r) => r.status === 'pending');
    if (sentPending) {
      setStatus('pending_sent');
      setRequestId(sentPending.id);
      return;
    }

    // Pending request sent to me
    const receivedPending = rev.data?.find((r) => r.status === 'pending');
    if (receivedPending) {
      setStatus('pending_received');
      setRequestId(receivedPending.id);
      return;
    }

    setStatus('none');
    setRequestId(null);
  }, [user?.id, recipientId, supabase]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleRequest = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/chat-request/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, dog_id: dogId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to send request');
      } else {
        setStatus('pending_sent');
        setRequestId(data.request?.id ?? null);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    if (!requestId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/chat-request/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to accept request');
      } else {
        setStatus('accepted');
        onGoToChat();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!requestId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/chat-request/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to decline request');
      } else {
        setStatus('none');
        setRequestId(null);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <Button className="w-full mt-4" disabled>Checking...</Button>;
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {status === 'none' && (
        <Button className="w-full" onClick={handleRequest} disabled={submitting}>
          {submitting ? 'Sending...' : 'Request to Chat'}
        </Button>
      )}

      {status === 'pending_sent' && (
        <Button className="w-full" disabled variant="outline">
          Request Sent — Awaiting Response
        </Button>
      )}

      {status === 'pending_received' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-blue-700 font-medium text-center">
            They&apos;ve requested to chat with you!
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleAccept} disabled={submitting}>
              {submitting ? 'Accepting...' : 'Accept'}
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={handleDecline}
              disabled={submitting}
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      {status === 'accepted' && (
        <Button className="w-full bg-green-600 hover:bg-green-700" onClick={onGoToChat}>
          Go to Chat
        </Button>
      )}
    </div>
  );
}
