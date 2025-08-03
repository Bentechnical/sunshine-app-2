'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, Eye, Calendar, MessageCircle, AlertCircle, RefreshCw, Clock, User } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
    individual: {
      id: string;
      first_name: string;
      last_name: string;
    };
    volunteer: {
      id: string;
      first_name: string;
      last_name: string;
    };
    dog: {
      dog_name: string;
    };
  };
  message_count: number;
  last_message_at?: string; // For activity sorting
  unread_count?: number; // For unread indicators
}

interface AdminChatsProps {
  onUnreadCountChange?: () => void;
}

export default function AdminChats({ onUnreadCountChange }: AdminChatsProps) {
  const [chats, setChats] = useState<AppointmentChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<AppointmentChat | null>(null);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [activeTab, setActiveTab] = useState('active');

  const fetchChats = async () => {
    try {
      setError(null);
      console.log('[AdminChats] Fetching chats...');
      
      const response = await fetch('/api/admin/chats');
      console.log('[AdminChats] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[AdminChats] Received data:', data);
        setChats(data.chats || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AdminChats] API error:', errorData);
        setError(`Failed to fetch chats: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('[AdminChats] Network error:', error);
      setError('Network error while fetching chats');
    } finally {
      setLoading(false);
    }
  };

  const fetchChatLogs = async (appointmentId: number) => {
    try {
      console.log('[AdminChats] Fetching logs for appointment:', appointmentId);
      
      const response = await fetch(`/api/admin/chats/${appointmentId}/logs`);
      console.log('[AdminChats] Logs response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[AdminChats] Received logs:', data);
        setChatLogs(data.logs || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AdminChats] Logs API error:', errorData);
        setError(`Failed to fetch chat logs: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('[AdminChats] Network error fetching logs:', error);
      setError('Network error while fetching chat logs');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchChats();
    if (selectedChat) {
      await fetchChatLogs(selectedChat.appointment_id);
    }
    setRefreshing(false);
  };

  const handleViewChat = async (chat: AppointmentChat) => {
    setSelectedChat(chat);
    await fetchChatLogs(chat.appointment_id);
    
    // Mark chat as read when selected
    if (chat.unread_count && chat.unread_count > 0) {
      try {
        await fetch(`/api/admin/chats/${chat.appointment_id}/mark-read`, {
          method: 'POST',
        });
        
        // Update the chat in the list to reflect read status
        setChats(prevChats => 
          prevChats.map(c => 
            c.id === chat.id 
              ? { ...c, unread_count: 0 }
              : c
          )
        );
        
        // Notify parent component to refresh unread count
        onUnreadCountChange?.();
      } catch (error) {
        console.error('Error marking chat as read:', error);
      }
    }
  };

  // Get user name for a chat log
  const getUserName = (log: ChatLog) => {
    if (log.sender) {
      return `${log.sender.first_name} ${log.sender.last_name}`;
    }
    return log.sender_id; // Fallback to sender_id if no user info
  };

  // Check if message is from individual or volunteer
  const isIndividualMessage = (log: ChatLog) => {
    if (!selectedChat || !log.sender) return false;
    return log.sender.id === selectedChat.appointment.individual.id;
  };

  const isVolunteerMessage = (log: ChatLog) => {
    if (!selectedChat || !log.sender) return false;
    return log.sender.id === selectedChat.appointment.volunteer.id;
  };

  // Sort chats by activity (most recent first)
  const sortedChats = chats.sort((a, b) => {
    const aLastMessage = a.last_message_at || a.created_at;
    const bLastMessage = b.last_message_at || b.created_at;
    return new Date(bLastMessage).getTime() - new Date(aLastMessage).getTime();
  });

  // Filter chats by status and search term
  const filteredChats = sortedChats.filter(chat => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      chat.appointment.individual.first_name.toLowerCase().includes(searchLower) ||
      chat.appointment.individual.last_name.toLowerCase().includes(searchLower) ||
      chat.appointment.volunteer.first_name.toLowerCase().includes(searchLower) ||
      chat.appointment.volunteer.last_name.toLowerCase().includes(searchLower) ||
      chat.appointment.dog.dog_name.toLowerCase().includes(searchLower)
    );
    
    // Filter by status based on active tab
    const matchesStatus = activeTab === 'active' ? chat.status === 'active' : chat.status === 'closed';
    
    return matchesSearch && matchesStatus;
  });

  // Separate active and closed chats for tab counts
  const activeChats = sortedChats.filter(chat => chat.status === 'active');
  const closedChats = sortedChats.filter(chat => chat.status === 'closed');

  // Start polling for new messages
  useEffect(() => {
    fetchChats();
    
    // Set up polling every 10 seconds
    const interval = setInterval(() => {
      fetchChats();
    }, 10000); // 10 seconds
    
    setPollingInterval(interval);
    
    // Cleanup on unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  if (loading) {
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
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
        <h2 className="text-2xl font-bold text-gray-900">Chat Management</h2>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content - 1/3 + 2/3 Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat List - 1/3 width */}
        <div className="w-1/3 border-r border-gray-200 bg-gray-50 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-white">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
              <p className="text-sm text-gray-600 mt-2">
                {filteredChats.length} conversation{filteredChats.length !== 1 ? 's' : ''} in {activeTab} chats
              </p>
              {chats.length === 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  No chats found. This could mean:
                  <br />• No appointments have been confirmed yet
                  <br />• No chat channels have been created
                  <br />• Database permissions need to be updated
                </p>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="active" className="mt-0 h-full">
                {activeTab === 'active' && filteredChats.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No active chats found</p>
                    <p className="text-sm">
                      {searchTerm ? 'No active chats match your search.' : 'No active chat conversations.'}
                    </p>
                  </div>
                ) : (
                  activeTab === 'active' && filteredChats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`p-4 cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
                        selectedChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      } ${
                        chat.unread_count && chat.unread_count > 0 ? 'bg-red-50 border-l-4 border-red-500' : ''
                      }`}
                      onClick={() => handleViewChat(chat)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium text-gray-900 truncate">
                              {chat.appointment.dog.dog_name}
                            </h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              chat.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {chat.status}
                            </span>
                            <div className="flex-1"></div>
                            {chat.unread_count && chat.unread_count > 0 && (
                              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium animate-pulse">
                                {chat.unread_count}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 truncate">
                            {chat.appointment.individual.first_name} {chat.appointment.individual.last_name} 
                            {' ↔ '}
                            {chat.appointment.volunteer.first_name} {chat.appointment.volunteer.last_name}
                          </p>
                          
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {new Date(chat.appointment.start_time).toLocaleDateString()} | {new Date(chat.appointment.start_time).toLocaleDateString('en-US', { weekday: 'short' })} at {new Date(chat.appointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <MessageCircle className="h-3 w-3" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
              
              <TabsContent value="closed" className="mt-0 h-full">
                {activeTab === 'closed' && filteredChats.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No closed chats found</p>
                    <p className="text-sm">
                      {searchTerm ? 'No closed chats match your search.' : 'No closed chat conversations.'}
                    </p>
                  </div>
                ) : (
                  activeTab === 'closed' && filteredChats.map((chat) => (
                    <div
                      key={chat.id}
                      className={`p-4 cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${
                        selectedChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      } ${
                        chat.unread_count && chat.unread_count > 0 ? 'bg-red-50 border-l-4 border-red-500' : ''
                      }`}
                      onClick={() => handleViewChat(chat)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium text-gray-900 truncate">
                              {chat.appointment.dog.dog_name}
                            </h4>
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              chat.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {chat.status}
                            </span>
                            <div className="flex-1"></div>
                            {chat.unread_count && chat.unread_count > 0 && (
                              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium animate-pulse">
                                {chat.unread_count}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 truncate">
                            {chat.appointment.individual.first_name} {chat.appointment.individual.last_name} 
                            {' ↔ '}
                            {chat.appointment.volunteer.first_name} {chat.appointment.volunteer.last_name}
                          </p>
                          
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {new Date(chat.appointment.start_time).toLocaleDateString()} | {new Date(chat.appointment.start_time).toLocaleDateString('en-US', { weekday: 'short' })} at {new Date(chat.appointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <MessageCircle className="h-3 w-3" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Chat View - 2/3 width */}
        <div className="w-2/3 flex flex-col bg-white">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedChat.appointment.dog.dog_name} - Chat
                    </h3>
                    <p className="text-sm text-gray-600">
                      {selectedChat.appointment.individual.first_name} {selectedChat.appointment.individual.last_name} 
                      {' ↔ '}
                      {selectedChat.appointment.volunteer.first_name} {selectedChat.appointment.volunteer.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Appointment: {new Date(selectedChat.appointment.start_time).toLocaleDateString()} | {new Date(selectedChat.appointment.start_time).toLocaleDateString('en-US', { weekday: 'long' })} at{' '}
                      {new Date(selectedChat.appointment.start_time).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      selectedChat.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedChat.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatLogs.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No messages found</p>
                    <p className="text-sm">No chat logs available for this conversation.</p>
                  </div>
                ) : (
                  chatLogs.map((log) => {
                    const isIndividual = isIndividualMessage(log);
                    const isVolunteer = isVolunteerMessage(log);
                    
                    return (
                      <div key={log.id} className={`flex ${isIndividual ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          isIndividual 
                            ? 'bg-blue-100 text-blue-900' 
                            : isVolunteer 
                              ? 'bg-green-100 text-green-900'
                              : 'bg-gray-100 text-gray-900'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">
                              {getUserName(log)}
                            </span>
                            <span className="text-xs opacity-75">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{log.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium mb-2">Select a chat</p>
                <p className="text-sm">Choose a conversation from the list to view messages.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 