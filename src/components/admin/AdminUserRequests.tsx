// src/app/(admin)/dashboard/admin/fragments/AdminUserRequests.tsx
'use client';

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PendingUser {
  id: string;
  name: string;
  email: string;
  role: 'volunteer' | 'individual';
  bio: string;
  postal_code: string;
  photo_url?: string;
}

const mockUsers: PendingUser[] = [
  {
    id: '1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'volunteer',
    bio: 'Excited to volunteer with my golden retriever.',
    postal_code: 'M5V 3E7',
    photo_url: '/images/default-user.png',
  },
  {
    id: '2',
    name: 'John Smith',
    email: 'john@example.com',
    role: 'individual',
    bio: 'Looking for weekly sessions for my child.',
    postal_code: 'K2P 1L4',
    photo_url: '/images/default-user.png',
  },
];

export default function AdminUserRequests() {
  const volunteers = mockUsers.filter((u) => u.role === 'volunteer');
  const individuals = mockUsers.filter((u) => u.role === 'individual');

  return (
    <div className="p-4 bg-white rounded-xl shadow">
      <h2 className="text-2xl font-bold mb-4">New User Requests</h2>
      <Tabs defaultValue="volunteers" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="volunteers">Volunteers</TabsTrigger>
          <TabsTrigger value="individuals">Individuals</TabsTrigger>
        </TabsList>

        <TabsContent value="volunteers">
          <UserCardList users={volunteers} />
        </TabsContent>
        <TabsContent value="individuals">
          <UserCardList users={individuals} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserCardList({ users }: { users: PendingUser[] }) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending users in this category.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <Card key={user.id}>
          <CardHeader className="flex flex-row items-center gap-4">
            <img
              src={user.photo_url || '/images/default-user.png'}
              alt={user.name}
              className="w-12 h-12 rounded-full object-cover"
            />
            <div>
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <strong>Location:</strong> {user.postal_code}
            </p>
            <p className="text-sm line-clamp-3">{user.bio}</p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="default">
                Approve
              </Button>
              <Button size="sm" variant="destructive">
                Deny
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
