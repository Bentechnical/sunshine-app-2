import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify the user is an admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'Failed to verify user' }, { status: 500 });
    }

    if (user.role !== 'admin' || user.status !== 'approved') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all availability data with volunteer information
    const { data: availabilities, error: availabilityError } = await supabase
      .from('appointment_availability')
      .select(`
        *,
        volunteer:users!appointment_availability_volunteer_id_fkey (
          id,
          first_name,
          last_name,
          email,
          city,
          postal_code
        )
      `)
      .order('start_time', { ascending: true });

    if (availabilityError) {
      console.error('Error fetching availabilities:', availabilityError);
      return NextResponse.json({ error: 'Failed to fetch availabilities' }, { status: 500 });
    }

    return NextResponse.json({
      data: availabilities || [],
      total: availabilities?.length || 0
    });

  } catch (error) {
    console.error('Error in admin availabilities API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}