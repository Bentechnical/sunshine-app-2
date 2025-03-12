"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Database } from '@/types/supabase';

// Use the generated types from your Database type definition
type User = Database['public']['Tables']['users']['Row'];

const TestDBPage = () => {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // Use the properly typed query
      const { data, error } = await supabase
        .from('users')
        .select('*');

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
            {user.first_name} {user.last_name} - {user.email} - {user.role} - {user.bio} - {new Date(user.created_at || '').toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TestDBPage;