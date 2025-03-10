import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";


// Define the types for the incoming data
interface UserData {
  id?: string;
  role?: string;
  data?: {
    id?: string;
    public_metadata?: {
      role?: string;
    };
  };
}
export async function POST(req: NextRequest) {
  try {
    // Parse the incoming JSON request
    const data = await req.json();
    console.log("Received Data:", data);

    // Extract the user ID and role from the request
    const userId = data.id || data.data?.id;
    const role = data.role || data.data?.public_metadata?.role;
    console.log("Extracted userId:", userId);
    console.log("Extracted role:", role);

    // Validate that both userId and role are provided
    if (!userId || !role) {
      console.error("Missing userId or role");
      return NextResponse.json(
        { error: "User ID or Role is missing" },
        { status: 400 }
      );
    }

    // Update the user's public metadata with the new role
    const updatedUser = await (await clerkClient()).users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });

    // logging updated user
    console.log({
        event: "user_role_updated",
        userId: updatedUser.id,
        role: updatedUser.publicMetadata?.role,
        timestamp: new Date().toISOString()
      });

    // Return a success response if the role was updated correctly
    if (updatedUser.publicMetadata?.role === role) {
      return NextResponse.json(
        { message: "Role assigned successfully" },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: "Failed to assign role" },
        { status: 400 }
      );
    }
  } catch (error) {
    // Log and return any errors that occur
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: `Error processing request: ${error.message}` },
      { status: 500 }
    );
  }
}
