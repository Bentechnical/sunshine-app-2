import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";  // This is the correct import

export async function POST(req: NextRequest) {
  console.log("API route hit");

  // Extract the webhook payload
  const data = await req.json();
  console.log("Webhook Payload:", data);

  // Correctly access the user ID
  const userId = data.id; // Directly access data.id from the payload
  if (!userId) {
    return new NextResponse("User ID is missing", { status: 400 });
  }

  // Assuming the role is coming in the payload as well
  const role = data.role;
  if (!role) {
    return new NextResponse("Role is missing", { status: 400 });
  }

  try {
    // Use clerkClient to interact with Clerk's user management API
    const updatedUser = await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        role: role, // Assign the role to the user's public metadata
      },
    });

    // Log the updated user to verify that the metadata is being updated
    console.log("Updated User:", updatedUser);

    // Check if the public metadata is correctly updated
    if (updatedUser.publicMetadata?.role === role) {
      console.log(`Successfully assigned role: ${role} to user ID: ${userId}`);
    } else {
      console.error(`Failed to assign role to user ID: ${userId}`);
    }

    return new NextResponse("Role assigned successfully", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);

    // Log the error in detail to help diagnose the issue
    return new NextResponse(`Error processing webhook: ${error.message}`, { status: 500 });
  }
}
