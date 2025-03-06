import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";  // Correct import for Clerk in Next.js API routes

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    console.log("Received Data:", data);  // Debug log to ensure data is received properly

    const userId = data.id;
    const role = data.role;

    if (!userId || !role) {
      console.error("Missing userId or role");
      return new NextResponse("User ID or Role is missing", { status: 400 });
    }

    // Use clerkClient to update user metadata
    const updatedUser = await clerkClient.users.updateUser(userId, {
      publicMetadata: { role },
    });

    console.log("Updated User:", updatedUser);  // Debug log for the updated user

    // Check if the role was successfully updated
    return updatedUser.publicMetadata?.role === role
      ? new NextResponse("Role assigned successfully", { status: 200 })
      : new NextResponse("Failed to assign role", { status: 400 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new NextResponse(`Error processing webhook: ${error.message}`, { status: 500 });
  }
}
