// src/app/api/admin/appointments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);
    
    const statusFilter = searchParams.get('status') || 'all';
    const section = searchParams.get('section'); // 'nextWeek', 'future', 'past'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    console.log('[Admin Appointments API] Request params:', { statusFilter, section, page, limit, offset });

    // Calculate date ranges
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log('[Admin Appointments API] Date ranges:', { 
      now: now.toISOString(), 
      nextWeek: nextWeek.toISOString() 
    });

    // Use joins to get user data directly
    let query = supabase
      .from('appointments')
      .select(`
        id,
        start_time,
        end_time,
        status,
        cancellation_reason,
        individual:individual_id (
          id,
          first_name,
          last_name,
          email,
          phone_number,
          bio,
          physical_address,
          visit_recipient_type,
          relationship_to_recipient,
          dependant_name
        ),
        volunteer:volunteer_id (
          id,
          first_name,
          last_name,
          email,
          phone_number
        )
      `)
      .range(offset, offset + limit - 1);

    // Apply status filter
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    // Apply date filters based on section
    if (section === 'nextWeek') {
      query = query.gte('start_time', now.toISOString()).lt('start_time', nextWeek.toISOString());
      console.log('[Admin Appointments API] Applied nextWeek filter');
    } else if (section === 'future') {
      query = query.gte('start_time', nextWeek.toISOString());
      console.log('[Admin Appointments API] Applied future filter');
    } else if (section === 'past') {
      query = query.lt('start_time', now.toISOString());
      console.log('[Admin Appointments API] Applied past filter');
    }

    // Order by start_time
    if (section === 'past') {
      query = query.order('start_time', { ascending: false });
    } else {
      query = query.order('start_time', { ascending: true });
    }

    console.log('[Admin Appointments API] About to execute query for section:', section);

    // First, let's check if there are any appointments at all
    const { data: allAppointments, error: countError } = await supabase
      .from('appointments')
      .select('id, start_time, status, individual_id, volunteer_id')
      .limit(5);

    console.log('[Admin Appointments API] All appointments sample:', allAppointments);
    console.log('[Admin Appointments API] Count error:', countError);

    const { data, error } = await query;

    console.log('[Admin Appointments API] Raw data:', data);
    console.log('[Admin Appointments API] Raw data structure:', data ? data.map((apt: any) => ({
      id: apt.id,
      individual: apt.individual,
      volunteer: apt.volunteer,
      individual_id: apt.individual_id,
      volunteer_id: apt.volunteer_id
    })) : 'No data');

    if (error) {
      console.error('[Admin Appointments API] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process the joined data - the individual and volunteer are already objects, not arrays
    const processedData = data || [];

    console.log('[Admin Appointments API] Processed data:', processedData);

    // Get volunteer IDs for fetching dogs
    const volunteerIds = [...new Set(processedData.map((apt: any) => apt.volunteer?.id).filter(Boolean))];
    
    console.log('[Admin Appointments API] Volunteer IDs for dogs:', volunteerIds);

    // Fetch dogs data for volunteers
    let dogsData: any = {};
    if (volunteerIds.length > 0) {
      const { data: dogs, error: dogsError } = await supabase
        .from('dogs')
        .select('id, dog_name, dog_breed, volunteer_id')
        .in('volunteer_id', volunteerIds);

      if (dogsError) {
        console.error('[Admin Appointments API] Error fetching dogs:', dogsError);
      } else {
        console.log('[Admin Appointments API] Dogs fetched:', dogs);
        // Group dogs by volunteer_id
        dogsData = (dogs || []).reduce((acc: any, dog: any) => {
          if (!acc[dog.volunteer_id]) {
            acc[dog.volunteer_id] = [];
          }
          acc[dog.volunteer_id].push(dog);
          return acc;
        }, {});
      }
    }

    // Add dogs data to each appointment
    const finalData = processedData.map((apt: any) => ({
      ...apt,
      volunteer: apt.volunteer ? {
        ...apt.volunteer,
        dogs: dogsData[apt.volunteer.id] || []
      } : null
    }));

    console.log('[Admin Appointments API] Final data with dogs:', finalData);

    return NextResponse.json({
      appointments: finalData,
      hasMore: processedData.length === limit,
      page,
      debug: {
        totalAppointments: allAppointments?.length || 0,
        sampleAppointment: allAppointments?.[0] || null,
        processedCount: processedData.length,
        finalCount: finalData.length
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('[Admin Appointments API] Uncaught error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 