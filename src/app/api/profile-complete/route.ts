import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';


const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const DEFAULT_DOG_IMAGE = `${BASE_URL}/images/default_dog.png`;

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const userId = data.id || data.data?.id;
    const role = data.role || data.data?.public_metadata?.role;
    const phoneNumber = data.phone_number || '';

    console.log('[PROFILE-COMPLETE] Incoming data:', JSON.stringify(data));
    console.log('[PROFILE-COMPLETE] Resolved userId:', userId);
    console.log('[PROFILE-COMPLETE] Resolved role:', role);

    if (!userId || !role) {
      console.warn('[PROFILE-COMPLETE] Missing userId or role');
      return NextResponse.json(
        { error: "User ID or Role is missing" },
        { status: 400 }
      );
    }

    const clerk = await clerkClient();
    const updatedUser = await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role,
        profilePictureUrl: data.profilePictureUrl,
        bio: data.bio,
      },
    });

    console.log('[PROFILE-COMPLETE] Clerk user metadata updated for:', updatedUser.id);

    const supabase = createSupabaseAdminClient();
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        profile_image: data.profilePictureUrl,
        bio: data.bio,
        role,
        phone_number: phoneNumber,
      })
      .eq("id", userId);

    if (userUpdateError) {
      console.error("❌ Error updating Supabase user:", userUpdateError);
    } else {
      console.log("[PROFILE-COMPLETE] Supabase user updated.");
    }

    if (role === "volunteer" && data.dog) {
      const { name, age, breed, bio: dogBio, photoUrl } = data.dog;
      const finalPhotoUrl = photoUrl || null;

      const { error: dogError } = await supabase.from("dogs").insert([
        {
          volunteer_id: userId,
          dog_name: name,
          dog_age: age,
          dog_breed: breed,
          dog_bio: dogBio,
          dog_picture_url: finalPhotoUrl,
        },
      ]);

      if (dogError) {
        console.error("❌ Error inserting dog data:", dogError);
      } else {
        console.log("[PROFILE-COMPLETE] Dog record inserted.");
      }
    }

    const toEmail = updatedUser.emailAddresses?.[0]?.emailAddress;
    const firstName = updatedUser.firstName || 'there';

    if (!toEmail) {
      console.error('[PROFILE-COMPLETE] No email address found for user:', userId);
    } else {
      console.log('[EMAIL DEBUG] Sending welcome email to:', toEmail);

      try {
        const dashboardLink = `${getAppUrl()}/dashboard`;

        const emailResponse = await sendTransactionalEmail({
          to: toEmail,
          subject: 'Welcome to Sunshine!',
          templateName: 'welcome',
          data: {
            firstName,
            year: new Date().getFullYear(),
            dashboardLink,
          },
        });

        console.log('[EMAIL DEBUG] Welcome email sent. Response:', emailResponse);
      } catch (emailErr: any) {
        console.error("❌ Error sending welcome email:", emailErr);
      }
    }


    return NextResponse.json(
      { message: "Profile completed successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[PROFILE-COMPLETE] Fatal error:', error.message);
      return NextResponse.json(
        { error: `Error processing request: ${error.message}` },
        { status: 500 }
      );
    } else {
      console.error('[PROFILE-COMPLETE] Unknown fatal error.');
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 500 }
      );
    }
  }
}
