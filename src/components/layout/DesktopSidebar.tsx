'use client';

import React from 'react';
import { Button } from '../../components/ui/button';

interface DesktopSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedRole: string;
  onLogout: () => void;
}

export default function DesktopSidebar({
  activeTab,
  setActiveTab,
  selectedRole,
  onLogout,
}: DesktopSidebarProps) {
  const isVolunteerOrAdmin = selectedRole === 'volunteer' || selectedRole === 'admin';
  const isIndividualOrAdmin = selectedRole === 'individual' || selectedRole === 'admin';

  return (
    <div className="w-64 bg-gray-800 text-white p-5 space-y-6 flex flex-col justify-between">
      <div>
        <h2 className="text-xl font-bold mb-4">Dashboard</h2>
        <div className="space-y-2">
          <SidebarButton
            label="Profile"
            isActive={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          />
          <SidebarButton
            label="Edit Profile"
            isActive={activeTab === 'edit'}
            onClick={() => setActiveTab('edit')}
          />

          {isVolunteerOrAdmin && (
            <SidebarButton
              label="My Dog Profile"
              isActive={activeTab === 'my-dog-profile'}
              onClick={() => setActiveTab('my-dog-profile')}
            />
          )}

          {isVolunteerOrAdmin && (
            <SidebarButton
              label="Availability"
              isActive={activeTab === 'availability'}
              onClick={() => setActiveTab('availability')}
            />
          )}

          {isIndividualOrAdmin && (
            <SidebarButton
              label="Meet with a Dog"
              isActive={activeTab === 'meet-with-dog'}
              onClick={() => setActiveTab('meet-with-dog')}
            />
          )}

          {(selectedRole === 'individual' || selectedRole === 'volunteer' || selectedRole === 'admin') && (
            <SidebarButton
              label="My Visits"
              isActive={activeTab === 'my-visits'}
              onClick={() => setActiveTab('my-visits')}
            />
          )}
        </div>
      </div>

      <Button onClick={onLogout} variant="destructive" className="w-full">
        Logout
      </Button>
    </div>
  );
}

interface SidebarButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function SidebarButton({ label, isActive, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-2 text-left px-4 rounded-md transition-colors ${
        isActive ? 'bg-gray-600' : 'hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );
}
