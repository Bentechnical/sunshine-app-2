import { createClient } from '@supabase/supabase-js';

// Ensure environment variables are defined
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

// Supabase client setup
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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