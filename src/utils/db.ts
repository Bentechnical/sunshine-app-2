// lib/db.ts
import { createClient } from '@supabase/supabase-js';

// Supabase client setup
const supabase = createClient(
  process.env.SUPABASE_URL,  // Your Supabase URL
  process.env.SUPABASE_ANON_KEY  // Your Supabase Anon key
);

// Query function for executing SQL
export const query = async (sql: string, params: any[] = []) => {
  const { data, error } = await supabase.rpc('query', {
    sql,
    params
  });

  if (error) {
    throw error;
  }

  return data;
};
