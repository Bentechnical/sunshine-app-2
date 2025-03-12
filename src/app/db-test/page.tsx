"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

const TestDBPage = () => {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase.from<User>('users').select('*');

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setData(data || []);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Users Table</h1>
      <ul>
        {data.map(user => (
          <li key={user.id}>
            {user.first_name} {user.last_name} - {user.email} - {user.role} - {user.bio} - {new Date(user.created_at).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TestDBPage;
