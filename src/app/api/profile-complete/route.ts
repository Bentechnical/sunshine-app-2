// /src/app/api/profile-complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { supabase } from "@/utils/supabase/client";

// Constants for fallback
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const DEFAULT_DOG_IMAGE = `${BASE_URL}/images/default_dog.png`;

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    console.log("📨 Received Data:", data);

    const userId = data.id || data.data?.id;
    const role = data.role || data.data?.public_metadata?.role;

    if (!userId || !role) {
      console.error("❌ Missing userId or role");
      return NextResponse.json(
        { error: "User ID or Role is missing" },
        { status: 400 }
      );
    }

    // ----------------------------------------
    // 1) Update Clerk public metadata
    // (Using the same syntax you had previously)
    // ----------------------------------------
    const clerk = await clerkClient(); // your custom client function
    const updatedUser = await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role,
        profilePictureUrl: data.profilePictureUrl,
        bio: data.bio,
      },
    });

    console.log("✅ Clerk metadata updated:", {
      userId: updatedUser.id,
      role: updatedUser.publicMetadata?.role,
    });

    // ----------------------------------------
    // 2) Update Supabase `users` table
    // ----------------------------------------
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        profile_image: data.profilePictureUrl,
        bio: data.bio,
        role: role,
      })
      .eq("id", userId);

    if (userUpdateError) {
      console.error("❌ Error updating Supabase user:", userUpdateError);
    } else {
      console.log(`✅ Updated user ${userId} with new profile pic & bio.`);
    }

    // ----------------------------------------
    // 3) Insert (or upsert) dog profile if volunteer
    // ----------------------------------------
    if (role === "volunteer" && data.dog) {
      const { name, age, breed, bio: dogBio, photoUrl } = data.dog;
      const finalPhotoUrl = photoUrl || DEFAULT_DOG_IMAGE;

      // If you want to "upsert" rather than "insert," switch to upsert() and add a unique key on volunteer_id.
      const { data: dogData, error: dogError } = await supabase
        .from("dogs")
        .insert([
          {
            volunteer_id: userId,
            dog_name: name,
            dog_age: age,
            dog_breed: breed,
            dog_bio: dogBio,
            dog_picture_url: finalPhotoUrl,
          },
        ])
        .select();

      if (dogError) {
        console.error("❌ Error inserting dog data:", dogError);
      } else {
        console.log("🐶 Dog data inserted:", dogData);
      }
    }

    return NextResponse.json(
      { message: "Profile completed successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("❌ Error processing request:", error);
      return NextResponse.json(
        { error: `Error processing request: ${error.message}` },
        { status: 500 }
      );
    } else {
      console.error("❌ Unknown error occurred");
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 500 }
      );
    }
  }
}
