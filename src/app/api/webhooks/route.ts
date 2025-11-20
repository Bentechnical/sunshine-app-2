// src/app/api/webhooks/route.ts
export const dynamic = 'force-dynamic';

import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from '../../utils/mailer'; // ✅ Add this

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const SIGNING_SECRET = process.env.SIGNING_SECRET;
    if (!SIGNING_SECRET) {
      console.error("Missing SIGNING_SECRET");
      return new Response("Internal configuration error", { status: 500 });
    }

    const svixHeaders = await headers();
    const id = svixHeaders.get("svix-id");
    const ts = svixHeaders.get("svix-timestamp");
    const sig = svixHeaders.get("svix-signature");
    if (!id || !ts || !sig) {
      console.warn("Missing Svix headers:", { id, ts, sig });
      return new Response("Missing Svix headers", { status: 400 });
    }

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
    const role = unsafe_metadata?.role ?? "individual";

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
          // New individual user fields will be null initially
          pronouns: null,
          birthday: null,
          physical_address: null,
          other_pets_on_site: null,
          other_pets_description: null,
          third_party_available: null,
          additional_information: null,
          liability_waiver_accepted: null,
          liability_waiver_accepted_at: null,
          // Visit recipient fields will be null initially
          visit_recipient_type: null,
          relationship_to_recipient: null,
          dependant_name: null,
        }]);
        if (error) throw error;

        // Log role change to audit table
        await supabase.from("role_change_audit").insert({
          user_id: userId,
          old_role: null,
          new_role: role,
          source: 'clerk_webhook_created',
          metadata: {
            email,
            clerk_metadata_role: unsafe_metadata?.role || null,
            defaulted: !unsafe_metadata?.role,
            event_type: evt.type
          }
        });

        console.log(`Inserted user ${userId}`);

        // Send complete profile email
        if (email) {
          await sendTransactionalEmail({
            to: email,
            subject: 'Complete Your Profile - Sunshine Therapy Dogs',
            templateName: 'completeProfile',
            data: {
              firstName: first_name ?? 'there',
              year: new Date().getFullYear(),
            },
          });
          console.log(`[Resend] Complete profile email sent to ${email}`);
        }

      } else if (evt.type === "user.updated") {
        const { error } = await supabase.from("users")
          .update({
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            email,
            // NOTE: Role is NOT updated here to prevent overwrites from Clerk metadata
            // Role is managed exclusively through ProfileCompleteForm in Supabase
            bio: unsafe_metadata?.bio ?? null,
            updated_at: new Date(),
            profile_image: image_url ?? null,
            phone_number: phone_number ?? null,
            // Note: We don't update individual fields here as they're managed by ProfileCompleteForm
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

    return new Response("Webhook processed", { status: 200 });
  } catch (err) {
    console.error("🔥 Unhandled error in /api/webhooks:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
