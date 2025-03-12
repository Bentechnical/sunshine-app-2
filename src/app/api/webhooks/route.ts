import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  const SIGNING_SECRET = process.env.SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    throw new Error("Error: Please add SIGNING_SECRET from Clerk Dashboard to .env");
  }

  // Create new Svix instance with secret
  const wh = new Webhook(SIGNING_SECRET);

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, return an error response
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error: Missing Svix headers", { status: 400 });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  let evt: WebhookEvent;

  // Verify webhook payload
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error: Could not verify webhook:", err);
    return new Response("Error: Verification error", { status: 400 });
  }

  // Extract event data
  if (evt.type.startsWith("user.")) {
    const userData = evt.data as WebhookEvent["data"] & { 
      first_name?: string;
      last_name?: string;
      email_addresses?: { email_address: string }[];
      image_url?: string;
      public_metadata?: Record<string, any>;
    };
  
    const { id, email_addresses, first_name, last_name, image_url, public_metadata } = userData;
  
    const role = public_metadata?.role || "individual"; // Default to 'individual'
    const eventType = evt.type;

    console.log(`Received webhook with event type: ${eventType}`);

    try {
      if (eventType === "user.created") {
        const email = email_addresses && email_addresses.length > 0 ? email_addresses[0]?.email_address : null;

        console.log('Creating new user:', {
            id,
            email,
            first_name,
            last_name,
            role,
            profile_image: image_url || null,
            created_at: new Date(),
            updated_at: new Date(),
          });
          
        await supabase.from("users").insert([
         {
                id, // Clerk User ID
                email, // Safely accessed email
                first_name: first_name || null,
                last_name: last_name || null,
                role,
                profile_image: image_url || null,
                created_at: new Date(),
                updated_at: new Date(),},
        ]);
        console.log(`User ${id} inserted into Supabase.`);
      } else if (eventType === "user.updated") {
        const email = email_addresses && email_addresses.length > 0 ? email_addresses[0]?.email_address : null;
        await supabase.from("users").update([
            {
                id, // Clerk User ID
                email, // Safely accessed email
                first_name: first_name || null,
                last_name: last_name || null,
                role,
                profile_image: image_url || null,
                created_at: new Date(),
                updated_at: new Date(),},
           ]).eq("id", id);
        console.log(`User ${id} updated in Supabase.`);
      } else if (eventType === "user.deleted") {
        await supabase.from("users").delete().eq("id", id);
        console.log(`User ${id} deleted from Supabase.`);
      }
    } catch (error) {
      console.error("Error handling Supabase update:", error);
      return new Response("Error updating database", { status: 500 });
    }

    return new Response("Webhook received", { status: 200 });
  }

  return new Response("Event type not handled", { status: 400 });
}
