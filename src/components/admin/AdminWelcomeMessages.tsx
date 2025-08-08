'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface WelcomeMessage {
  id: number;
  user_type: 'individual' | 'volunteer';
  message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminWelcomeMessages() {
  const [messages, setMessages] = useState<WelcomeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [individualMessage, setIndividualMessage] = useState('');
  const [volunteerMessage, setVolunteerMessage] = useState('');
  const [individualActive, setIndividualActive] = useState(true);
  const [volunteerActive, setVolunteerActive] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/admin/welcome-messages');
      const data = await response.json();
      
      if (data.messages) {
        setMessages(data.messages);
        
        // Set form values from existing messages
        const individual = data.messages.find((m: WelcomeMessage) => m.user_type === 'individual');
        const volunteer = data.messages.find((m: WelcomeMessage) => m.user_type === 'volunteer');
        
        if (individual) {
          setIndividualMessage(individual.message);
          setIndividualActive(individual.is_active);
        }
        if (volunteer) {
          setVolunteerMessage(volunteer.message);
          setVolunteerActive(volunteer.is_active);
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveMessage = async (userType: 'individual' | 'volunteer') => {
    setSaving(true);
    try {
      const message = userType === 'individual' ? individualMessage : volunteerMessage;
      const isActive = userType === 'individual' ? individualActive : volunteerActive;

      const response = await fetch('/api/admin/welcome-messages', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userType,
          message,
          isActive,
        }),
      });

      if (response.ok) {
        await fetchMessages(); // Refresh the data
        alert(`${userType} message saved successfully!`);
      } else {
        const error = await response.json();
        alert(`Error saving message: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving message:', error);
      alert('Error saving message');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Welcome Messages</h2>
        <p className="text-gray-600">
          Manage welcome messages displayed to users on their dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Individual Message */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Individual Users
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="individual-active"
                  checked={individualActive}
                  onChange={(e) => setIndividualActive(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="individual-active" className="text-sm font-medium">
                  Active
                </label>
              </div>
            </CardTitle>
            <CardDescription>
              Message shown to individuals seeking therapy dog visits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="individual-message" className="block text-sm font-medium mb-2">
                Welcome Message
              </label>
              <textarea
                id="individual-message"
                value={individualMessage}
                onChange={(e) => setIndividualMessage(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Enter welcome message for individual users..."
              />
            </div>
            <Button
              onClick={() => saveMessage('individual')}
              disabled={saving || !individualMessage.trim()}
              className="w-full"
            >
              {saving ? 'Saving...' : 'Save Individual Message'}
            </Button>
          </CardContent>
        </Card>

        {/* Volunteer Message */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Volunteer Users
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="volunteer-active"
                  checked={volunteerActive}
                  onChange={(e) => setVolunteerActive(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="volunteer-active" className="text-sm font-medium">
                  Active
                </label>
              </div>
            </CardTitle>
            <CardDescription>
              Message shown to volunteers with therapy dogs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="volunteer-message" className="block text-sm font-medium mb-2">
                Welcome Message
              </label>
              <textarea
                id="volunteer-message"
                value={volunteerMessage}
                onChange={(e) => setVolunteerMessage(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Enter welcome message for volunteer users..."
              />
            </div>
            <Button
              onClick={() => saveMessage('volunteer')}
              disabled={saving || !volunteerMessage.trim()}
              className="w-full"
            >
              {saving ? 'Saving...' : 'Save Volunteer Message'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>
            How the messages will appear to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Individual Users will see:</h4>
            <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded border border-yellow-300 shadow-sm">
              <p className="text-sm font-medium">
                {individualActive && individualMessage.trim() 
                  ? individualMessage 
                  : 'No active message set'
                }
              </p>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Volunteer Users will see:</h4>
            <div className="bg-yellow-100 text-yellow-900 px-4 py-2 rounded border border-yellow-300 shadow-sm">
              <p className="text-sm font-medium">
                {volunteerActive && volunteerMessage.trim() 
                  ? volunteerMessage 
                  : 'No active message set'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 