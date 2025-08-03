// src/app/api/admin/update-audience-preferences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    
    // Test the connection and permissions
    console.log('[Audience Prefs API] Testing admin client connection...');
    const { user_id, role, category_labels } = await req.json();

    if (!user_id || !role || !Array.isArray(category_labels)) {
      console.error('[Audience Prefs API] Missing or invalid payload:', {
        user_id,
        role,
        category_labels,
      });
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    // Fetch all available categories from DB
  const { data: categories, error: catError } = await supabase
  .from('audience_categories')
  .select('*');

if (catError || !categories) {
  console.error('[Audience Prefs API] Failed to fetch categories:', catError);
  return NextResponse.json({ error: 'Category fetch failed' }, { status: 500 });
}

// Map label → ID
const categoryMap: Record<string, any> = {};
categories.forEach((cat) => {
  categoryMap[cat.name] = cat.id;
});

console.log('[Audience Prefs API] Available categories:', categories);


    const category_ids = category_labels
      .map((label) => categoryMap[label])
      .filter((id) => id !== undefined);

    if (category_ids.length !== category_labels.length) {
      console.error('[Audience Prefs API] Some labels were not found in DB:', {
        category_labels,
        mapped: category_ids,
        fullMap: categoryMap,
      });
      return NextResponse.json({ error: 'One or more categories not found' }, { status: 400 });
    }

    console.log('[Audience Prefs API] Category IDs to insert:', category_ids);
    console.log('[Audience Prefs API] Category IDs type:', typeof category_ids[0]);

    const joinTable =
      role === 'volunteer'
        ? 'volunteer_audience_preferences'
        : role === 'individual'
        ? 'individual_audience_tags'
        : null;

    if (!joinTable) {
      console.error('[Audience Prefs API] Unknown role:', role);
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Clear existing
    const { error: delError } = await supabase
      .from(joinTable)
      .delete()
      .eq(role === 'volunteer' ? 'volunteer_id' : 'individual_id', user_id);

    if (delError) {
      console.error('[Audience Prefs API] Failed to clear existing preferences:', delError);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }

    // Prepare new rows
    const insertPayload = category_ids.map((id) => ({
      [role === 'volunteer' ? 'volunteer_id' : 'individual_id']: user_id,
      category_id: id,
    }));

    console.log('[Audience Prefs API] Final insert payload:', insertPayload);
    console.log('[Audience Prefs API] Using table:', joinTable);

    // Test if we can read from the table first
    const { data: testRead, error: testError } = await supabase
      .from(joinTable)
      .select('*')
      .limit(1);
    
    console.log('[Audience Prefs API] Test read result:', { testRead, testError });

    const { data: insertData, error: insertError } = await supabase.from(joinTable).insert(insertPayload);

    if (insertError) {
      console.error('[Audience Prefs API] Insert failed:', insertError);
      console.error('[Audience Prefs API] Insert payload was:', insertPayload);
      console.error('[Audience Prefs API] Table was:', joinTable);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    console.log('[Audience Prefs API] Insert successful, data:', insertData);

    console.log('[Audience Prefs API] Successfully inserted preferences');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Audience Prefs API] Server error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
