// /app/api/webhooks/route.ts

export const dynamic = 'force-dynamic';

import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!, // ✅ Use the non-public backend variable!
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const SIGNING_SECRET = process.env.SIGNING_SECRET;
    if (!SIGNING_SECRET) {
      console.error("Missing SIGNING_SECRET");
      return new Response("Internal configuration error", { status: 500 });
    }

    // 1️⃣ Read and verify Svix headers
    const svixHeaders = await headers();
    const id = svixHeaders.get("svix-id");
    const ts = svixHeaders.get("svix-timestamp");
    const sig = svixHeaders.get("svix-signature");
    if (!id || !ts || !sig) {
      console.warn("Missing Svix headers:", { id, ts, sig });
      return new Response("Missing Svix headers", { status: 400 });
    }

    // 2️⃣ Parse body and verify signature
    const payload = await req.json();
    let evt: WebhookEvent;
    try {
      evt = new Webhook(SIGNING_SECRET).verify(JSON.stringify(payload), {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": sig,
      }) as WebhookEvent;
    } catch (verifErr) {
      console.error("Signature verification failed:", verifErr);
      return new Response("Invalid signature", { status: 400 });
    }

    // 3️⃣ Handle only user.* events
    if (!evt.type.startsWith("user.")) {
      return new Response("Event type not handled", { status: 400 });
    }
    const data = evt.data as WebhookEvent["data"] & {
      first_name?: string;
      last_name?: string;
      email_addresses?: { email_address: string }[];
      image_url?: string;
      public_metadata?: Record<string, any>;
      unsafe_metadata?: Record<string, any>;
      phone_number?: string;
    };
    const { id: userId, email_addresses, first_name, last_name, image_url, public_metadata, unsafe_metadata, phone_number } = data;
    const email = email_addresses?.[0]?.email_address ?? null;
    const role = public_metadata?.user_type ?? "individual"; // Clerk's user_type in public_metadata

    console.log(`🟢 Processing ${evt.type} for user ${userId}`);

    try {
      if (evt.type === "user.created") {
        const { error } = await supabase.from("users").insert([{
          id: userId,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          email,
          role,
          bio: unsafe_metadata?.bio ?? null,
          created_at: new Date(),
          updated_at: new Date(),
          profile_image: image_url ?? null,
          phone_number: phone_number ?? null,
        }]);
        if (error) throw error;
        console.log(`Inserted user ${userId}`);
      } else if (evt.type === "user.updated") {
        const { error } = await supabase.from("users")
          .update({
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            email,
            role,
            bio: unsafe_metadata?.bio ?? null,
            updated_at: new Date(),
            profile_image: image_url ?? null,
            phone_number: phone_number ?? null,
          })
          .eq("id", userId);
        if (error) throw error;
        console.log(`Updated user ${userId}`);
      } else if (evt.type === "user.deleted") {
        const { error } = await supabase.from("users").delete().eq("id", userId);
        if (error) throw error;
        console.log(`Deleted user ${userId}`);
      }
    } catch (dbErr) {
      console.error("Supabase error:", dbErr);
      return new Response("Database error", { status: 500 });
    }

    // 5️⃣ Success!
    return new Response("Webhook processed", { status: 200 });
  } catch (err) {
    console.error("🔥 Unhandled error in /api/webhooks:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
