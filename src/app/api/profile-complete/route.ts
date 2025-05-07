import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../utils/mailer';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const DEFAULT_DOG_IMAGE = `${BASE_URL}/images/default_dog.png`;

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const userId = data.id || data.data?.id;
    const role = data.role || data.data?.public_metadata?.role;
    const phoneNumber = data.phone_number || '';

    if (!userId || !role) {
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
    }

    if (role === "volunteer" && data.dog) {
      const { name, age, breed, bio: dogBio, photoUrl } = data.dog;
      const finalPhotoUrl = photoUrl || DEFAULT_DOG_IMAGE;

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
      }
    }

    try {
      await sendTransactionalEmail({
        to: updatedUser.emailAddresses[0].emailAddress,
        subject: 'Welcome to Sunshine!',
        templateName: 'welcome',
        data: {
          firstName: updatedUser.firstName || 'there',
          year: new Date().getFullYear(),
        },
      });
    } catch (emailErr: any) {
      console.error("Error sending welcome email:", emailErr);
    }

    return NextResponse.json(
      { message: "Profile completed successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Error processing request: ${error.message}` },
        { status: 500 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 500 }
      );
    }
  }
}
