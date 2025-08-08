import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    
    const { data: messages, error } = await supabase
      .from('welcome_messages')
      .select('*')
      .order('user_type', { ascending: true });

    if (error) {
      console.error('Error fetching welcome messages:', error);
      return NextResponse.json({ error: 'Failed to fetch welcome messages' }, { status: 500 });
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error in welcome messages GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { userType, message, isActive } = await request.json();

    if (!userType || !message) {
      return NextResponse.json({ error: 'userType and message are required' }, { status: 400 });
    }

    // If setting this message as active, deactivate all other messages for this user type
    if (isActive) {
      const { error: deactivateError } = await supabase
        .from('welcome_messages')
        .update({ is_active: false })
        .eq('user_type', userType);

      if (deactivateError) {
        console.error('Error deactivating other messages:', deactivateError);
        return NextResponse.json({ error: 'Failed to update messages' }, { status: 500 });
      }
    }

    // Check if a message already exists for this user type
    const { data: existingMessage } = await supabase
      .from('welcome_messages')
      .select('id')
      .eq('user_type', userType)
      .single();

    let result;
    if (existingMessage) {
      // Update existing message
      const { data, error } = await supabase
        .from('welcome_messages')
        .update({ message, is_active: isActive })
        .eq('id', existingMessage.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating welcome message:', error);
        return NextResponse.json({ error: 'Failed to update welcome message' }, { status: 500 });
      }
      result = data;
    } else {
      // Create new message
      const { data, error } = await supabase
        .from('welcome_messages')
        .insert({ user_type: userType, message, is_active: isActive })
        .select()
        .single();

      if (error) {
        console.error('Error creating welcome message:', error);
        return NextResponse.json({ error: 'Failed to create welcome message' }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({ message: result });
  } catch (error) {
    console.error('Error in welcome messages PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 