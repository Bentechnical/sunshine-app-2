// /src/app/api/profile-complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { supabase } from "@/utils/supabase/client";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    console.log("Received Data:", data);

    const userId = data.id || data.data?.id;
    const role = data.role || data.data?.public_metadata?.role;

    console.log("Extracted userId:", userId);
    console.log("Extracted role:", role);

    if (!userId || !role) {
      console.error("Missing userId or role");
      return NextResponse.json(
        { error: "User ID or Role is missing" },
        { status: 400 }
      );
    }

    // ✅ Step 1: Update Clerk public metadata
    const clerk = await clerkClient();
    const updatedUser = await clerk.users.updateUserMetadata(userId, {
      publicMetadata: {
        role,
        profilePictureUrl: data.profilePictureUrl,
        bio: data.bio,
      },
    });

    console.log({
      event: "user_profile_completed",
      userId: updatedUser.id,
      role: updatedUser.publicMetadata?.role,
      profilePictureUrl: updatedUser.publicMetadata?.profilePictureUrl,
      bio: updatedUser.publicMetadata?.bio,
      timestamp: new Date().toISOString(),
    });

    // ✅ Step 2: Update Supabase `users` table with profilePictureUrl and bio
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        profile_image: data.profilePictureUrl,
        bio: data.bio,
        role: role, // optional: if you're storing role in Supabase too
      })
      .eq("id", userId);

    if (userUpdateError) {
      console.error("Error updating Supabase user:", userUpdateError);
    }

    // ✅ Step 3: Insert dog profile if volunteer
    if (role === "volunteer" && data.dog) {
      const { name, age, breed, bio: dogBio, photoUrl } = data.dog;
      const { data: dogData, error: dogError } = await supabase
        .from("dogs")
        .insert([
          {
            volunteer_id: userId,
            dog_name: name,
            dog_age: age,
            dog_breed: breed,
            dog_bio: dogBio,
            dog_picture_url: photoUrl,
          },
        ])
        .select();

      if (dogError) {
        console.error("Error inserting dog data:", dogError);
      } else {
        console.log("Dog data inserted:", dogData);
      }
    }

    return NextResponse.json(
      { message: "Profile completed successfully" },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error processing request:", error);
      return NextResponse.json(
        { error: `Error processing request: ${error.message}` },
        { status: 500 }
      );
    } else {
      console.error("Unknown error occurred");
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 500 }
      );
    }
  }
}
