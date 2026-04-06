'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, MessageCircle, AlertCircle, RefreshCw, Calendar, Clock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Appointment Chats (legacy) types ───────────────────────────────────────

interface ChatLog {
  id: string;
  appointment_id: number;
  stream_message_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  is_system_message: boolean;
  sender?: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
  };
}

interface AppointmentChat {
  id: string;
  appointment_id: number;
  stream_channel_id: string;
  created_at: string;
  closed_at: string | null;
  status: string;
  appointment: {
    start_time: string;
    end_time: string;
    individual: { id: string; first_name: string; last_name: string };
    volunteer: { id: string; first_name: string; last_name: string };
    dog: { dog_name: string };
  };
  message_count: number;
  last_message_at?: string;
  unread_count?: number;
}

// ─── Chat Requests (new) types ───────────────────────────────────────────────

interface ChatRequestMessage {
  id: string;
  text: string;
  user_id: string;
  user_name: string;
  created_at: string;
  is_system: boolean;
}

interface ChatRequestUser {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface ChatRequest {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
  channel_id: string | null;
  channel_created_at: string | null;
  channel_closed_at: string | null;
  last_message_at: string | null;
  message_count: number;
  unread_count_admin: number;
  requester: ChatRequestUser;
  recipient: ChatRequestUser;
  dog: { id: number; dog_name: string } | null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AdminChatsProps {
  onUnreadCountChange?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminChats({ onUnreadCountChange }: AdminChatsProps) {
  const [source, setSource] = useState<'appointment' | 'chat_request'>('chat_request');

  // ── Appointment Chats state ──
  const [apptChats, setApptChats] = useState<AppointmentChat[]>([]);
  const [selectedApptChat, setSelectedApptChat] = useState<AppointmentChat | null>(null);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [apptLoading, setApptLoading] = useState(false);
  const [apptError, setApptError] = useState<string | null>(null);
  const [apptTab, setApptTab] = useState('active');

  // ── Chat Requests state ──
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
  const [selectedChatRequest, setSelectedChatRequest] = useState<ChatRequest | null>(null);
  const [requestMessages, setRequestMessages] = useState<ChatRequestMessage[]>([]);
  const [requestMessagesLoading, setRequestMessagesLoading] = useState(false);
  const [crLoading, setCrLoading] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);
  const [crTab, setCrTab] = useState('active');

  // ── Shared state ──
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // ─── Appointment Chats data fetching ────────────────────────────────────

  const fetchApptChats = async () => {
    try {
      setApptError(null);
      const response = await fetch('/api/admin/chats');
      if (response.ok) {
        const data = await response.json();
        setApptChats(data.chats || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setApptError(`Failed to fetch chats: ${errorData.error || response.statusText}`);
      }
    } catch {
      setApptError('Network error while fetching chats');
    } finally {
      setApptLoading(false);
    }
  };

  const fetchChatLogs = async (appointmentId: number) => {
    try {
      const response = await fetch(`/api/admin/chats/${appointmentId}/logs`);
      if (response.ok) {
        const data = await response.json();
        setChatLogs(data.logs || []);
      }
    } catch {
      // non-fatal
    }
  };

  const handleViewApptChat = async (chat: AppointmentChat) => {
    setSelectedApptChat(chat);
    await fetchChatLogs(chat.appointment_id);
    if (chat.unread_count && chat.unread_count > 0) {
      try {
        await fetch(`/api/admin/chats/${chat.appointment_id}/mark-read`, { method: 'POST' });
        setApptChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, unread_count: 0 } : c));
        onUnreadCountChange?.();
      } catch { /* non-fatal */ }
    }
  };

  // ─── Chat Requests data fetching ────────────────────────────────────────

  const fetchChatRequests = async () => {
    try {
      setCrError(null);
      const response = await fetch('/api/admin/chat-requests');
      if (response.ok) {
        const data = await response.json();
        setChatRequests(data.requests || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setCrError(`Failed to fetch chat requests: ${errorData.error || response.statusText}`);
      }
    } catch {
      setCrError('Network error while fetching chat requests');
    } finally {
      setCrLoading(false);
    }
  };

  const fetchRequestMessages = async (channelId: string) => {
    setRequestMessagesLoading(true);
    try {
      const response = await fetch(`/api/admin/chat-requests/${channelId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setRequestMessages(data.messages || []);
      } else {
        setRequestMessages([]);
      }
    } catch {
      setRequestMessages([]);
    } finally {
      setRequestMessagesLoading(false);
    }
  };

  const handleViewChatRequest = async (req: ChatRequest) => {
    setSelectedChatRequest(req);
    setRequestMessages([]);
    if (req.channel_id) {
      await fetchRequestMessages(req.channel_id);
      if (req.unread_count_admin > 0) {
        try {
          await fetch(`/api/admin/chat-requests/${req.channel_id}/mark-read`, { method: 'POST' });
          setChatRequests((prev) =>
            prev.map((r) => r.id === req.id ? { ...r, unread_count_admin: 0 } : r)
          );
          onUnreadCountChange?.();
        } catch { /* non-fatal */ }
      }
    }
  };

  // ─── Refresh ────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchApptChats(), fetchChatRequests()]);
    if (selectedApptChat) await fetchChatLogs(selectedApptChat.appointment_id);
    if (selectedChatRequest?.channel_id) await fetchRequestMessages(selectedChatRequest.channel_id);
    setRefreshing(false);
  };

  // ─── Initial load + polling ──────────────────────────────────────────────

  // Only fetch appointment chats when that source is first selected (lazy load)
  const apptChatsLoaded = React.useRef(false);

  useEffect(() => {
    setCrLoading(true);
    fetchChatRequests();

    const interval = setInterval(() => {
      fetchChatRequests();
      if (apptChatsLoaded.current) fetchApptChats();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (source === 'appointment' && !apptChatsLoaded.current) {
      apptChatsLoaded.current = true;
      setApptLoading(true);
      fetchApptChats();
    }
  }, [source]);

  // ─── Derived lists ──────────────────────────────────────────────────────

  const filteredApptChats = apptChats
    .sort((a, b) => {
      const aT = a.last_message_at || a.created_at;
      const bT = b.last_message_at || b.created_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    })
    .filter((chat) => {
      const s = searchTerm.toLowerCase();
      const matchSearch =
        chat.appointment.individual.first_name.toLowerCase().includes(s) ||
        chat.appointment.individual.last_name.toLowerCase().includes(s) ||
        chat.appointment.volunteer.first_name.toLowerCase().includes(s) ||
        chat.appointment.volunteer.last_name.toLowerCase().includes(s) ||
        chat.appointment.dog.dog_name.toLowerCase().includes(s);
      const matchTab = apptTab === 'active' ? chat.status === 'active' : chat.status === 'closed';
      return matchSearch && matchTab;
    });

  // For chat requests: "active" = accepted + channel open, "closed" = accepted + channel closed, "pending" = pending
  const filteredChatRequests = chatRequests
    .sort((a, b) => {
      const aT = a.last_message_at || a.channel_created_at || a.created_at;
      const bT = b.last_message_at || b.channel_created_at || b.created_at;
      return new Date(bT).getTime() - new Date(aT).getTime();
    })
    .filter((req) => {
      const s = searchTerm.toLowerCase();
      const matchSearch =
        req.requester.first_name.toLowerCase().includes(s) ||
        req.requester.last_name.toLowerCase().includes(s) ||
        req.recipient.first_name.toLowerCase().includes(s) ||
        req.recipient.last_name.toLowerCase().includes(s) ||
        (req.dog?.dog_name ?? '').toLowerCase().includes(s);
      const matchTab =
        crTab === 'active'
          ? req.status === 'accepted' && !req.channel_closed_at
          : crTab === 'closed'
          ? req.status === 'accepted' && !!req.channel_closed_at
          : crTab === 'pending'
          ? req.status === 'pending'
          : req.status === 'declined';
      return matchSearch && matchTab;
    });

  const crCounts = {
    active: chatRequests.filter((r) => r.status === 'accepted' && !r.channel_closed_at).length,
    closed: chatRequests.filter((r) => r.status === 'accepted' && !!r.channel_closed_at).length,
    pending: chatRequests.filter((r) => r.status === 'pending').length,
    declined: chatRequests.filter((r) => r.status === 'declined').length,
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

  const renderApptChatItem = (chat: AppointmentChat) => (
    <div
      key={chat.id}
      className={`p-4 cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
        selectedApptChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
      } ${chat.unread_count && chat.unread_count > 0 ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}
      onClick={() => handleViewApptChat(chat)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="font-medium text-gray-900 truncate">{chat.appointment.dog.dog_name}</h4>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              chat.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>{chat.status}</span>
            <div className="flex-1" />
            {chat.unread_count && chat.unread_count > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium animate-pulse">
                {chat.unread_count}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 truncate">
            {chat.appointment.individual.first_name} {chat.appointment.individual.last_name}
            {' ↔ '}
            {chat.appointment.volunteer.first_name} {chat.appointment.volunteer.last_name}
          </p>
          <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
            <div className="flex items-center space-x-1">
              <Calendar className="h-3 w-3" />
              <span>{new Date(chat.appointment.start_time).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <MessageCircle className="h-3 w-3" />
              <span>{chat.message_count} msgs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderChatRequestItem = (req: ChatRequest) => {
    const isActive = req.status === 'accepted' && !req.channel_closed_at;
    const isClosed = req.status === 'accepted' && !!req.channel_closed_at;
    const isPending = req.status === 'pending';
    const hasUnread = req.unread_count_admin > 0;

    return (
      <div
        key={req.id}
        className={`p-4 cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
          selectedChatRequest?.id === req.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
        } ${hasUnread ? 'bg-red-50 border-l-4 border-l-red-500' : ''}`}
        onClick={() => handleViewChatRequest(req)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <h4 className="font-medium text-gray-900 truncate">
              {req.dog?.dog_name ?? 'Unknown Dog'}
            </h4>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              isActive ? 'bg-green-100 text-green-800'
              : isPending ? 'bg-yellow-100 text-yellow-800'
              : isClosed ? 'bg-gray-100 text-gray-800'
              : 'bg-red-100 text-red-800'
            }`}>
              {isPending ? 'pending' : isActive ? 'active' : isClosed ? 'closed' : 'declined'}
            </span>
            <div className="flex-1" />
            {hasUnread && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium animate-pulse">
                {req.unread_count_admin}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 truncate">
            {req.requester.first_name} {req.requester.last_name}
            {' ↔ '}
            {req.recipient.first_name} {req.recipient.last_name}
          </p>
          <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>Requested {new Date(req.created_at).toLocaleDateString()}</span>
            </div>
            {req.channel_id && (
              <div className="flex items-center space-x-1">
                <MessageCircle className="h-3 w-3" />
                <span>{req.message_count} msgs</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Appointment Chats detail panel ─────────────────────────────────────

  const renderApptChatDetail = () => {
    if (!selectedApptChat) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">Select a chat</p>
            <p className="text-sm">Choose a conversation from the list to view messages.</p>
          </div>
        </div>
      );
    }

    const isIndividualMsg = (log: ChatLog) =>
      log.sender?.id === selectedApptChat.appointment.individual.id;
    const isVolunteerMsg = (log: ChatLog) =>
      log.sender?.id === selectedApptChat.appointment.volunteer.id;

    return (
      <>
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedApptChat.appointment.dog.dog_name} — Chat
              </h3>
              <p className="text-sm text-gray-600">
                {selectedApptChat.appointment.individual.first_name} {selectedApptChat.appointment.individual.last_name}
                {' ↔ '}
                {selectedApptChat.appointment.volunteer.first_name} {selectedApptChat.appointment.volunteer.last_name}
              </p>
              <p className="text-xs text-gray-500">
                Appointment: {new Date(selectedApptChat.appointment.start_time).toLocaleDateString()} at{' '}
                {new Date(selectedApptChat.appointment.start_time).toLocaleTimeString()}
              </p>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${
              selectedApptChat.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {selectedApptChat.status}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No messages found</p>
              <p className="text-sm">No chat logs available for this conversation.</p>
            </div>
          ) : (
            chatLogs.map((log) => {
              const isIndividual = isIndividualMsg(log);
              const isVolunteer = isVolunteerMsg(log);
              return (
                <div key={log.id} className={`flex ${isIndividual ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    isIndividual ? 'bg-blue-100 text-blue-900'
                    : isVolunteer ? 'bg-green-100 text-green-900'
                    : 'bg-gray-100 text-gray-900'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {log.sender ? `${log.sender.first_name} ${log.sender.last_name}` : log.sender_id}
                      </span>
                      <span className="text-xs opacity-75">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{log.content}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
    );
  };

  // ─── Chat Request detail panel ───────────────────────────────────────────

  const renderChatRequestDetail = () => {
    if (!selectedChatRequest) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">Select a chat request</p>
            <p className="text-sm">Choose a conversation from the list to view details.</p>
          </div>
        </div>
      );
    }

    const req = selectedChatRequest;
    const isActive = req.status === 'accepted' && !req.channel_closed_at;
    const isPending = req.status === 'pending';

    // Determine which user is individual vs volunteer
    const individualUser = req.requester.role === 'individual' ? req.requester : req.recipient;
    const volunteerUser = req.requester.role === 'volunteer' ? req.requester : req.recipient;

    return (
      <>
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {req.dog?.dog_name ?? 'Unknown Dog'} — Chat Request
              </h3>
              <p className="text-sm text-gray-600">
                {individualUser.first_name} {individualUser.last_name}
                {' ↔ '}
                {volunteerUser.first_name} {volunteerUser.last_name}
              </p>
              <p className="text-xs text-gray-500">
                Requested: {new Date(req.created_at).toLocaleDateString()} at{' '}
                {new Date(req.created_at).toLocaleTimeString()}
                {req.responded_at && (
                  <> · Responded: {new Date(req.responded_at).toLocaleDateString()}</>
                )}
              </p>
              {req.channel_closed_at && (
                <p className="text-xs text-gray-500">
                  Closed: {new Date(req.channel_closed_at).toLocaleDateString()} at{' '}
                  {new Date(req.channel_closed_at).toLocaleTimeString()}
                </p>
              )}
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${
              isActive ? 'bg-green-100 text-green-800'
              : isPending ? 'bg-yellow-100 text-yellow-800'
              : req.status === 'declined' ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-800'
            }`}>
              {isPending ? 'pending' : isActive ? 'active' : req.status === 'declined' ? 'declined' : 'closed'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isPending || !req.channel_id ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">
                {isPending ? 'Request pending' : 'No chat channel'}
              </p>
              <p className="text-sm">
                {isPending
                  ? 'This request has not yet been accepted. No chat channel exists yet.'
                  : 'This request was declined before a chat was opened.'}
              </p>
            </div>
          ) : requestMessagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span className="text-gray-600">Loading messages...</span>
            </div>
          ) : requestMessages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No messages yet</p>
              <p className="text-sm">The chat channel exists but has no messages.</p>
            </div>
          ) : (
            requestMessages.map((msg) => {
              const isIndividual = msg.user_id === individualUser.id;
              const isSystem = msg.is_system;
              return (
                <div key={msg.id} className={`flex ${isSystem ? 'justify-center' : isIndividual ? 'justify-start' : 'justify-end'}`}>
                  {isSystem ? (
                    <div className="max-w-sm px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-full text-center">
                      {msg.text}
                    </div>
                  ) : (
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      isIndividual ? 'bg-blue-100 text-blue-900' : 'bg-green-100 text-green-900'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{msg.user_name}</span>
                        <span className="text-xs opacity-75">{new Date(msg.created_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────

  const isLoading = source === 'appointment' ? apptLoading : crLoading;
  const error = source === 'appointment' ? apptError : crError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading chat data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
          >
            {refreshing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Refreshing...</> : <><RefreshCw className="h-4 w-4 mr-2" />Retry</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">Chat Management</h2>
          {/* Source toggle */}
          <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
            <button
              onClick={() => setSource('chat_request')}
              className={`px-3 py-1.5 ${source === 'chat_request' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Chat Requests
              {crCounts.active + crCounts.pending > 0 && (
                <span className="ml-1.5 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {crCounts.active + crCounts.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setSource('appointment')}
              className={`px-3 py-1.5 border-l border-gray-300 ${source === 'appointment' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Appointment Chats
            </button>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* List panel */}
        <div className="w-1/3 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          {source === 'appointment' ? (
            <Tabs value={apptTab} onValueChange={setApptTab} className="w-full h-full flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-white">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="active">Active ({apptChats.filter(c => c.status === 'active').length})</TabsTrigger>
                  <TabsTrigger value="closed">Closed ({apptChats.filter(c => c.status === 'closed').length})</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 overflow-y-auto">
                <TabsContent value="active" className="mt-0">
                  {filteredApptChats.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>No active chats found.</p>
                    </div>
                  ) : (
                    filteredApptChats.map(renderApptChatItem)
                  )}
                </TabsContent>
                <TabsContent value="closed" className="mt-0">
                  {filteredApptChats.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>No closed chats found.</p>
                    </div>
                  ) : (
                    filteredApptChats.map(renderApptChatItem)
                  )}
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div className="w-full h-full flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 bg-white">
                <select
                  value={crTab}
                  onChange={(e) => setCrTab(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="active">Active ({crCounts.active})</option>
                  <option value="pending">Pending ({crCounts.pending})</option>
                  <option value="closed">Closed ({crCounts.closed})</option>
                  <option value="declined">Declined ({crCounts.declined})</option>
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredChatRequests.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No {crTab} chat requests.</p>
                  </div>
                ) : (
                  filteredChatRequests.map(renderChatRequestItem)
                )}
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="w-2/3 flex flex-col bg-white overflow-hidden">
          {source === 'appointment' ? renderApptChatDetail() : renderChatRequestDetail()}
        </div>
      </div>
    </div>
  );
}
