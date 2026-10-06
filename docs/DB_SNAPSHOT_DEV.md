# DevDB Schema Snapshot

**Source:** Supabase dev project (`gwuqfhp…`) — the DB behind the beta/preview deployment
**Captured:** 2026-10-02
**Branch / commit at capture:** `org-visits` @ `263f981`
**Method:** `pg_catalog` introspection of schema `public` (columns, constraints, indexes, RLS policies, triggers)

> This file is the **current-state reference**. It is generated, not hand-edited — regenerate it
> rather than patching it. `docs/ORGANIZATION_VISITS_SCHEMA.md` remains the append-only
> migration *history*; where the two disagree, this file is the truth for DevDB.
>
> Legend: `[p]` primary key · `[f]` foreign key · `[u]` unique · `[c]` check · `[idx]` index · `[rls]` policy · `[trg]` trigger

---

## appointment_chats  [RLS enabled]
  id :: uuid NOT NULL DEFAULT gen_random_uuid()
  appointment_id :: integer
  stream_channel_id :: text NOT NULL
  created_at :: timestamp with time zone DEFAULT now()
  closed_at :: timestamp with time zone
  status :: text DEFAULT 'active'::text
  created_by :: text DEFAULT 'system'::text
  unread_count :: integer DEFAULT 0
  last_read_at :: timestamp with time zone DEFAULT now()
  [c] appointment_chats_status_check — CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
  [f] appointment_chats_appointment_id_fkey — FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  [p] appointment_chats_pkey — PRIMARY KEY (id)
  [u] appointment_chats_stream_channel_id_key — UNIQUE (stream_channel_id)
  [idx] CREATE INDEX idx_appointment_chats_appointment_id ON public.appointment_chats USING btree (appointment_id)
  [idx] CREATE INDEX idx_appointment_chats_status ON public.appointment_chats USING btree (status)
  [idx] CREATE INDEX idx_appointment_chats_stream_channel_id ON public.appointment_chats USING btree (stream_channel_id)
  [idx] CREATE INDEX idx_appointment_chats_unread_count ON public.appointment_chats USING btree (unread_count)
  [idx] CREATE UNIQUE INDEX appointment_chats_pkey ON public.appointment_chats USING btree (id)
  [idx] CREATE UNIQUE INDEX appointment_chats_stream_channel_id_key ON public.appointment_chats USING btree (stream_channel_id)
  [rls] Only system can manage appointment chats (ALL, roles=public) USING (created_by = 'system'::text)
  [rls] Service role can access appointment_chats (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [rls] Users can view their appointment chats (SELECT, roles=public) USING (appointment_id IN ( SELECT appointments.id FROM appointments WHERE ((appointments.individual_id = (auth.uid())::text) OR (appointments.volunteer_id = (auth.uid())::text))))

## appointments  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('appointments_id_seq'::regclass)
  individual_id :: text
  volunteer_id :: text
  start_time :: timestamp with time zone NOT NULL
  status :: text DEFAULT 'pending'::text
  created_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  updated_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  availability_id :: integer
  end_time :: timestamp with time zone NOT NULL
  cancellation_reason :: text
  location_type :: text
  location_details :: text
  duration_minutes :: integer DEFAULT 60
  notes :: text
  proposed_by :: text
  proposed_at :: timestamp with time zone
  confirmed_at :: timestamp with time zone
  chat_request_id :: uuid
  [c] appointments_location_type_check — CHECK ((location_type = ANY (ARRAY['individual_address'::text, 'public'::text, 'other'::text])))
  [c] appointments_status_check — CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'canceled'::text])))
  [f] appointments_chat_request_id_fkey — FOREIGN KEY (chat_request_id) REFERENCES chat_requests(id) ON DELETE SET NULL
  [f] appointments_individual_id_fkey — FOREIGN KEY (individual_id) REFERENCES users(id) ON DELETE CASCADE
  [f] appointments_proposed_by_fkey — FOREIGN KEY (proposed_by) REFERENCES users(id) ON DELETE SET NULL
  [f] appointments_volunteer_id_fkey — FOREIGN KEY (volunteer_id) REFERENCES users(id) ON DELETE CASCADE
  [p] appointments_pkey — PRIMARY KEY (id)
  [idx] CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id)
  [idx] CREATE UNIQUE INDEX one_active_appointment_per_chat ON public.appointments USING btree (chat_request_id) WHERE ((status = ANY (ARRAY['pending'::text, 'confirmed'::text])) AND (chat_request_id IS NOT NULL))
  [rls] Allow service role to read appointments (SELECT, roles=service_role) USING true
  [rls] Allow service role to update appointments (UPDATE, roles=service_role) USING true CHECK true
  [rls] Individuals can create their own appointments (INSERT, roles=public) CHECK (individual_id = (auth.jwt() ->> 'sub'::text))
  [rls] Users can update their own appointments (UPDATE, roles=public) USING ((individual_id = (auth.jwt() ->> 'sub'::text)) OR (volunteer_id = (auth.jwt() ->> 'sub'::text)))
  [rls] Users can view their own appointments (SELECT, roles=public) USING ((individual_id = (auth.jwt() ->> 'sub'::text)) OR (volunteer_id = (auth.jwt() ->> 'sub'::text)))

## audience_categories  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('audience_categories_id_seq'::regclass)
  name :: text NOT NULL
  slug :: text NOT NULL
  sort_order :: integer DEFAULT 0
  [p] audience_categories_pkey — PRIMARY KEY (id)
  [u] audience_categories_slug_key — UNIQUE (slug)
  [idx] CREATE UNIQUE INDEX audience_categories_pkey ON public.audience_categories USING btree (id)
  [idx] CREATE UNIQUE INDEX audience_categories_slug_key ON public.audience_categories USING btree (slug)
  [rls] Allow public read access to audience categories (SELECT, roles=public) USING true

## chat_logs  [RLS enabled]
  id :: uuid NOT NULL DEFAULT gen_random_uuid()
  appointment_id :: integer
  stream_message_id :: text NOT NULL
  sender_id :: text
  content :: text NOT NULL
  message_type :: text DEFAULT 'text'::text
  created_at :: timestamp with time zone DEFAULT now()
  is_system_message :: boolean DEFAULT false
  [f] chat_logs_appointment_id_fkey — FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  [f] chat_logs_sender_id_fkey — FOREIGN KEY (sender_id) REFERENCES users(id)
  [p] chat_logs_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX idx_chat_logs_appointment_id ON public.chat_logs USING btree (appointment_id)
  [idx] CREATE INDEX idx_chat_logs_created_at ON public.chat_logs USING btree (created_at)
  [idx] CREATE INDEX idx_chat_logs_sender_id ON public.chat_logs USING btree (sender_id)
  [idx] CREATE UNIQUE INDEX chat_logs_pkey ON public.chat_logs USING btree (id)
  [rls] Only system can create chat logs (INSERT, roles=public) CHECK true
  [rls] Service role can access chat_logs (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [rls] Users can view their appointment chat logs (SELECT, roles=public) USING (appointment_id IN ( SELECT appointments.id FROM appointments WHERE ((appointments.individual_id = (auth.uid())::text) OR (appointments.volunteer_id = (auth.uid())::text))))
  [trg] CREATE TRIGGER trigger_update_chat_unread_count AFTER INSERT ON public.chat_logs FOR EACH ROW EXECUTE FUNCTION update_chat_unread_count()

## chat_requests  [RLS enabled]
  id :: uuid NOT NULL DEFAULT uuid_generate_v4()
  requester_id :: text NOT NULL
  recipient_id :: text NOT NULL
  dog_id :: integer
  status :: text NOT NULL DEFAULT 'pending'::text
  created_at :: timestamp with time zone NOT NULL DEFAULT now()
  responded_at :: timestamp with time zone
  channel_id :: text
  channel_created_at :: timestamp with time zone
  channel_closed_at :: timestamp with time zone
  last_message_at :: timestamp with time zone
  message_count :: integer DEFAULT 0
  unread_count_admin :: integer DEFAULT 0
  snoozed_by :: text
  snoozed_until :: timestamp with time zone
  [c] chat_requests_status_check — CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
  [f] chat_requests_dog_id_fkey — FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE SET NULL
  [f] chat_requests_recipient_id_fkey — FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
  [f] chat_requests_requester_id_fkey — FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE
  [p] chat_requests_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX idx_chat_requests_channel ON public.chat_requests USING btree (channel_id) WHERE (channel_id IS NOT NULL)
  [idx] CREATE INDEX idx_chat_requests_created ON public.chat_requests USING btree (created_at DESC)
  [idx] CREATE INDEX idx_chat_requests_recipient ON public.chat_requests USING btree (recipient_id, status)
  [idx] CREATE INDEX idx_chat_requests_requester ON public.chat_requests USING btree (requester_id, status)
  [idx] CREATE UNIQUE INDEX chat_requests_pkey ON public.chat_requests USING btree (id)
  [idx] CREATE UNIQUE INDEX unique_pending_request ON public.chat_requests USING btree (requester_id, recipient_id) WHERE (status = 'pending'::text)
  [rls] Recipients can update request status (UPDATE, roles=public) USING ((auth.jwt() ->> 'sub'::text) = recipient_id) CHECK ((auth.jwt() ->> 'sub'::text) = recipient_id)
  [rls] Users can create chat requests (INSERT, roles=public) CHECK ((auth.jwt() ->> 'sub'::text) = requester_id)
  [rls] Users can view their own chat requests (SELECT, roles=public) USING (((auth.jwt() ->> 'sub'::text) = requester_id) OR ((auth.jwt() ->> 'sub'::text) = recipient_id))

## device_tokens  [RLS enabled]
  id :: uuid NOT NULL DEFAULT gen_random_uuid()
  user_id :: text NOT NULL
  device_id :: text NOT NULL
  push_token :: text NOT NULL
  platform :: text NOT NULL
  environment :: text NOT NULL DEFAULT 'production'::text
  notifications_enabled :: boolean NOT NULL DEFAULT true
  created_at :: timestamp with time zone DEFAULT now()
  last_seen_at :: timestamp with time zone DEFAULT now()
  [c] device_tokens_environment_check — CHECK ((environment = ANY (ARRAY['development'::text, 'production'::text])))
  [c] device_tokens_platform_check — CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])))
  [f] device_tokens_user_id_fkey — FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  [p] device_tokens_pkey — PRIMARY KEY (id)
  [u] device_tokens_user_id_device_id_key — UNIQUE (user_id, device_id)
  [idx] CREATE INDEX device_tokens_user_id_idx ON public.device_tokens USING btree (user_id)
  [idx] CREATE UNIQUE INDEX device_tokens_pkey ON public.device_tokens USING btree (id)
  [idx] CREATE UNIQUE INDEX device_tokens_user_id_device_id_key ON public.device_tokens USING btree (user_id, device_id)

## dogs  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('dogs_id_seq'::regclass)
  volunteer_id :: text NOT NULL
  dog_name :: text NOT NULL
  dog_breed :: text
  dog_age :: integer
  dog_bio :: text
  dog_picture_url :: text
  created_at :: timestamp without time zone DEFAULT now()
  updated_at :: timestamp without time zone DEFAULT now()
  status :: text DEFAULT 'pending'::text
  vaccine_record_url :: text
  vaccine_expiry_date :: date
  vaccine_cycle_years :: integer
  vaccine_date_issued :: date
  vaccine_verification_status :: text
  vaccine_verified_at :: timestamp with time zone
  vaccine_verified_by :: text
  vaccine_upload_comment :: text
  vaccine_rejection_reason :: text
  vaccine_supporting_urls :: text[] DEFAULT '{}'::text[]
  [c] dogs_status_check — CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])))
  [c] dogs_vaccine_verification_status_check — CHECK ((vaccine_verification_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])))
  [f] dogs_volunteer_id_fkey — FOREIGN KEY (volunteer_id) REFERENCES users(id)
  [p] dogs_pkey — PRIMARY KEY (id)
  [u] dogs_volunteer_id_key — UNIQUE (volunteer_id)
  [idx] CREATE UNIQUE INDEX dogs_pkey ON public.dogs USING btree (id)
  [idx] CREATE UNIQUE INDEX dogs_volunteer_id_key ON public.dogs USING btree (volunteer_id)
  [rls] Allow service role to read dogs (SELECT, roles=service_role) USING true
  [rls] Dogs: service_role can read (SELECT, roles=service_role) USING (auth.role() = 'service_role'::text)
  [rls] Only approved dogs are visible to public (SELECT, roles=public) USING (status = 'approved'::text)
  [rls] Service role can read all dogs (SELECT, roles=service_role) USING true
  [rls] Volunteers can add their own dogs (INSERT, roles=public) CHECK (volunteer_id = (auth.jwt() ->> 'sub'::text))
  [rls] Volunteers can update their own dogs (UPDATE, roles=public) USING (volunteer_id = (auth.jwt() ->> 'sub'::text))
  [rls] Volunteers can view their own dogs (SELECT, roles=public) USING (volunteer_id = (auth.jwt() ->> 'sub'::text))

## individual_audience_tags  [RLS enabled]
  individual_id :: text NOT NULL
  category_id :: integer NOT NULL
  [f] individual_audience_tags_category_id_fkey — FOREIGN KEY (category_id) REFERENCES audience_categories(id)
  [f] individual_audience_tags_individual_id_fkey — FOREIGN KEY (individual_id) REFERENCES users(id) ON DELETE CASCADE
  [rls] Allow public read access to individual audience tags (SELECT, roles=public) USING true
  NOTE: no primary key on this table

## message_read_status  [RLS enabled]
  id :: uuid NOT NULL DEFAULT gen_random_uuid()
  user_id :: text NOT NULL
  appointment_id :: integer NOT NULL
  last_read_message_id :: text
  last_read_at :: timestamp with time zone DEFAULT now()
  created_at :: timestamp with time zone DEFAULT now()
  updated_at :: timestamp with time zone DEFAULT now()
  [f] message_read_status_appointment_id_fkey — FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  [p] message_read_status_pkey — PRIMARY KEY (id)
  [u] message_read_status_user_id_appointment_id_key — UNIQUE (user_id, appointment_id)
  [idx] CREATE INDEX idx_message_read_status_appointment_id ON public.message_read_status USING btree (appointment_id)
  [idx] CREATE INDEX idx_message_read_status_last_read_at ON public.message_read_status USING btree (last_read_at)
  [idx] CREATE INDEX idx_message_read_status_user_id ON public.message_read_status USING btree (user_id)
  [idx] CREATE UNIQUE INDEX message_read_status_pkey ON public.message_read_status USING btree (id)
  [idx] CREATE UNIQUE INDEX message_read_status_user_id_appointment_id_key ON public.message_read_status USING btree (user_id, appointment_id)
  [rls] Service role can access message_read_status (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [rls] Users can insert their own read status (INSERT, roles=public) CHECK (user_id = (auth.uid())::text)
  [rls] Users can update their own read status (UPDATE, roles=public) USING (user_id = (auth.uid())::text)
  [rls] Users can view their own read status (SELECT, roles=public) USING (user_id = (auth.uid())::text)

## pd_region_places  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('pd_region_places_id_seq'::regclass)
  region_id :: integer NOT NULL
  place_id :: text NOT NULL
  place_name :: text NOT NULL
  place_type :: text NOT NULL
  match_value :: text NOT NULL
  lat :: double precision
  lng :: double precision
  viewport_south :: double precision
  viewport_west :: double precision
  viewport_north :: double precision
  viewport_east :: double precision
  created_at :: timestamp with time zone DEFAULT now()
  boundary_json :: jsonb
  boundary_status :: text DEFAULT 'pending'::text
  boundary_osm_id :: text
  boundary_osm_type :: text
  [c] pd_region_places_boundary_status_check — CHECK ((boundary_status = ANY (ARRAY['pending'::text, 'found'::text, 'not_found'::text])))
  [f] pd_region_places_region_id_fkey — FOREIGN KEY (region_id) REFERENCES pd_regions(id) ON DELETE CASCADE
  [p] pd_region_places_pkey — PRIMARY KEY (id)
  [u] pd_region_places_region_id_place_id_key — UNIQUE (region_id, place_id)
  [idx] CREATE INDEX pd_region_places_region_id_idx ON public.pd_region_places USING btree (region_id)
  [idx] CREATE UNIQUE INDEX pd_region_places_pkey ON public.pd_region_places USING btree (id)
  [idx] CREATE UNIQUE INDEX pd_region_places_region_id_place_id_key ON public.pd_region_places USING btree (region_id, place_id)
  [rls] Admins can manage region places (ALL, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Authenticated users can view region places (SELECT, roles=public) USING (auth.role() = 'authenticated'::text)
  [rls] Service role full access to pd_region_places (ALL, roles=public) USING (auth.role() = 'service_role'::text)

## pd_regions  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('pd_regions_id_seq'::regclass)
  name :: text NOT NULL
  owner_pd_id :: text
  is_active :: boolean NOT NULL DEFAULT true
  created_at :: timestamp with time zone DEFAULT now()
  [f] pd_regions_owner_pd_id_fkey — FOREIGN KEY (owner_pd_id) REFERENCES users(id) ON DELETE SET NULL
  [p] pd_regions_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX pd_regions_is_active_idx ON public.pd_regions USING btree (is_active)
  [idx] CREATE INDEX pd_regions_owner_pd_id_idx ON public.pd_regions USING btree (owner_pd_id)
  [idx] CREATE UNIQUE INDEX pd_regions_pkey ON public.pd_regions USING btree (id)
  [rls] Admins can create regions (INSERT, roles=public) CHECK (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Admins can delete regions (DELETE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Admins can update regions (UPDATE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Authenticated users can view regions (SELECT, roles=public) USING (auth.role() = 'authenticated'::text)
  [rls] Service role full access to pd_regions (ALL, roles=public) USING (auth.role() = 'service_role'::text)

## pending_email_notifications  [RLS enabled]
  id :: uuid NOT NULL DEFAULT gen_random_uuid()
  user_id :: text NOT NULL
  appointment_id :: integer
  stream_message_id :: text NOT NULL
  channel_id :: text NOT NULL
  scheduled_for :: timestamp with time zone NOT NULL
  created_at :: timestamp with time zone DEFAULT now()
  status :: text DEFAULT 'pending'::text
  sent_at :: timestamp with time zone
  chat_request_id :: uuid
  [c] pending_email_notifications_status_check — CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'canceled'::text])))
  [f] pending_email_notifications_appointment_id_fkey — FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
  [f] pending_email_notifications_chat_request_id_fkey — FOREIGN KEY (chat_request_id) REFERENCES chat_requests(id) ON DELETE CASCADE
  [p] pending_email_notifications_pkey — PRIMARY KEY (id)
  [u] pending_email_notifications_user_id_stream_message_id_key — UNIQUE (user_id, stream_message_id)
  [idx] CREATE INDEX idx_pending_notifications_appointment_id ON public.pending_email_notifications USING btree (appointment_id)
  [idx] CREATE INDEX idx_pending_notifications_scheduled ON public.pending_email_notifications USING btree (scheduled_for) WHERE (status = 'pending'::text)
  [idx] CREATE INDEX idx_pending_notifications_status ON public.pending_email_notifications USING btree (status)
  [idx] CREATE INDEX idx_pending_notifications_user_id ON public.pending_email_notifications USING btree (user_id)
  [idx] CREATE UNIQUE INDEX pending_email_notifications_pkey ON public.pending_email_notifications USING btree (id)
  [idx] CREATE UNIQUE INDEX pending_email_notifications_user_id_stream_message_id_key ON public.pending_email_notifications USING btree (user_id, stream_message_id)
  [rls] Service role can access pending_email_notifications (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [rls] Users can view their own pending notifications (SELECT, roles=public) USING (user_id = (auth.uid())::text)

## role_change_audit  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('role_change_audit_id_seq'::regclass)
  user_id :: text NOT NULL
  old_role :: text
  new_role :: text NOT NULL
  source :: text NOT NULL
  changed_at :: timestamp with time zone DEFAULT now()
  metadata :: jsonb
  [f] role_change_audit_user_id_fkey — FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  [p] role_change_audit_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX idx_role_change_audit_changed_at ON public.role_change_audit USING btree (changed_at DESC)
  [idx] CREATE INDEX idx_role_change_audit_user_id ON public.role_change_audit USING btree (user_id)
  [idx] CREATE UNIQUE INDEX role_change_audit_pkey ON public.role_change_audit USING btree (id)
  [rls] Only service role can insert audit entries (INSERT, roles=public) CHECK false
  [rls] Only service role can read audit log (SELECT, roles=public) USING false
  [rls] Service role has full access to audit log (ALL, roles=public) USING true CHECK true

## spatial_ref_sys  [RLS OFF]
  srid :: integer NOT NULL
  auth_name :: character varying(256)
  auth_srid :: integer
  srtext :: character varying(2048)
  proj4text :: character varying(2048)
  [c] spatial_ref_sys_srid_check — CHECK (((srid > 0) AND (srid <= 998999)))
  [p] spatial_ref_sys_pkey — PRIMARY KEY (srid)
  [idx] CREATE UNIQUE INDEX spatial_ref_sys_pkey ON public.spatial_ref_sys USING btree (srid)
  NOTE: PostGIS extension table — not application data

## users  [RLS enabled]
  id :: text NOT NULL
  first_name :: text NOT NULL
  last_name :: text NOT NULL
  email :: text NOT NULL
  role :: text NOT NULL
  bio :: text
  created_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  updated_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  profile_image :: text
  phone_number :: text
  postal_code :: text
  location_lat :: double precision
  location_lng :: double precision
  travel_distance_km :: integer
  status :: text DEFAULT 'pending'::text
  city :: text
  profile_complete :: boolean DEFAULT false
  pronouns :: character varying(50)
  physical_address :: text
  other_pets_on_site :: boolean DEFAULT false
  other_pets_description :: text
  third_party_available :: text
  additional_information :: text
  liability_waiver_accepted :: boolean DEFAULT false
  liability_waiver_accepted_at :: timestamp with time zone
  visit_recipient_type :: text
  relationship_to_recipient :: text
  dependant_name :: text
  archived_at :: timestamp with time zone
  general_availability :: text
  is_browsable :: boolean DEFAULT true
  org_name :: text
  org_type :: text
  org_address :: text
  org_contact_name :: text
  org_contact_phone :: text
  vsc_date_issued :: date
  vsc_renewal_due :: date
  vsc_document_url :: text
  org_place_id :: text
  pd_postal_code :: text
  pd_lat :: double precision
  pd_lng :: double precision
  fee_tier :: text
  open_to_individual_visits :: boolean DEFAULT true
  assigned_region_id :: integer
  region_assignment_method :: text
  vsc_verification_status :: text
  vsc_verified_at :: timestamp with time zone
  vsc_verified_by :: text
  is_admin_managed :: boolean DEFAULT false
  default_parking_coverage :: text
  default_parking_instructions :: text
  default_arrival_instructions :: text
  default_event_description :: text
  default_space_sqft :: integer
  default_dogs_needed :: integer
  default_requires_vsc :: boolean
  default_accessibility_notes :: text
  date_of_birth :: date
  vsc_upload_comment :: text
  vsc_rejection_reason :: text
  [c] users_region_assignment_method_check — CHECK ((region_assignment_method = ANY (ARRAY['fsa_auto'::text, 'distance_auto'::text, 'boundary_auto'::text, 'manual'::text])))
  [c] users_role_check — CHECK ((role = ANY (ARRAY['individual'::text, 'volunteer'::text, 'admin'::text, 'organization'::text, 'pd'::text])))
  [c] users_status_check — CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'archived'::text])))
  [c] users_vsc_verification_status_check — CHECK ((vsc_verification_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])))
  [f] users_assigned_region_id_fkey — FOREIGN KEY (assigned_region_id) REFERENCES pd_regions(id) ON DELETE SET NULL
  [p] users_pkey — PRIMARY KEY (id)
  [u] users_email_key — UNIQUE (email)
  [idx] CREATE INDEX users_assigned_region_id_idx ON public.users USING btree (assigned_region_id)
  [idx] CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
  [idx] CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
  [rls] Allow service role to read users (SELECT, roles=service_role) USING true
  [rls] Allow service role to update any user (UPDATE, roles=service_role) USING true
  [rls] Approved users can view other approved browsable users (SELECT, roles=public) USING ((status = 'approved'::text) AND (is_browsable = true) AND (role = ANY (ARRAY['individual'::text, 'volunteer'::text])))
  [rls] Only approved users are visible to public (SELECT, roles=public) USING ((status = 'approved'::text) OR (id = (auth.jwt() ->> 'sub'::text)))
  [rls] Service role can read all users (SELECT, roles=service_role) USING true
  [rls] User can update own profile (UPDATE, roles=public) USING (id = (auth.jwt() ->> 'sub'::text)) CHECK (id = (auth.jwt() ->> 'sub'::text))
  [rls] User can view own full profile (SELECT, roles=public) USING (id = (auth.jwt() ->> 'sub'::text))
  [rls] User can view own profile (SELECT, roles=public) USING (id = (auth.jwt() ->> 'sub'::text))
  [rls] Users can insert their own row (INSERT, roles=authenticated) CHECK (id = (auth.jwt() ->> 'sub'::text))
  [rls] Users can update only if not denied (UPDATE, roles=public) USING ((id = (auth.jwt() ->> 'sub'::text)) AND (status <> 'denied'::text)) CHECK ((id = (auth.jwt() ->> 'sub'::text)) AND (status <> 'denied'::text))
  [rls] Users: service_role can read (SELECT, roles=service_role) USING (auth.role() = 'service_role'::text)
  NOTE: no `assigned_pd_id` column — removed by Migration 22; PD linkage is via `assigned_region_id` → `pd_regions.owner_pd_id`

## visit_notes  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('visit_notes_id_seq'::regclass)
  visit_id :: integer NOT NULL
  author_id :: text NOT NULL
  note_text :: text NOT NULL
  created_at :: timestamp with time zone DEFAULT now()
  [f] visit_notes_author_id_fkey — FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  [f] visit_notes_visit_id_fkey — FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
  [p] visit_notes_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX visit_notes_visit_id_idx ON public.visit_notes USING btree (visit_id)
  [idx] CREATE UNIQUE INDEX visit_notes_pkey ON public.visit_notes USING btree (id)
  [rls] Admins and PDs can create visit notes (INSERT, roles=public) CHECK (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Admins and PDs can view visit notes (SELECT, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Service role full access to visit_notes (ALL, roles=public) USING (auth.role() = 'service_role'::text)

## visit_registrations  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('visit_registrations_id_seq'::regclass)
  visit_id :: integer NOT NULL
  volunteer_id :: text NOT NULL
  status :: text NOT NULL DEFAULT 'confirmed'::text
  waitlist_position :: integer
  contact_shared :: boolean DEFAULT false
  admin_note :: text
  cancellation_reason :: text
  cancelled_at :: timestamp with time zone
  created_at :: timestamp with time zone DEFAULT now()
  updated_at :: timestamp with time zone DEFAULT now()
  reminder_sent_at :: timestamp with time zone
  [c] visit_registrations_status_check — CHECK ((status = ANY (ARRAY['confirmed'::text, 'waitlisted'::text, 'cancelled'::text])))
  [f] visit_registrations_visit_id_fkey — FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE
  [f] visit_registrations_volunteer_id_fkey — FOREIGN KEY (volunteer_id) REFERENCES users(id) ON DELETE CASCADE
  [p] visit_registrations_pkey — PRIMARY KEY (id)
  [u] visit_registrations_visit_id_volunteer_id_key — UNIQUE (visit_id, volunteer_id)
  [idx] CREATE INDEX visit_registrations_status_idx ON public.visit_registrations USING btree (status)
  [idx] CREATE INDEX visit_registrations_visit_id_idx ON public.visit_registrations USING btree (visit_id)
  [idx] CREATE INDEX visit_registrations_volunteer_id_idx ON public.visit_registrations USING btree (volunteer_id)
  [idx] CREATE UNIQUE INDEX visit_registrations_pkey ON public.visit_registrations USING btree (id)
  [idx] CREATE UNIQUE INDEX visit_registrations_visit_id_volunteer_id_key ON public.visit_registrations USING btree (visit_id, volunteer_id)
  [rls] Admins and PDs can delete registrations (DELETE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Admins and PDs can update registrations (UPDATE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Admins and PDs can view all registrations (SELECT, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Organizations can view registrations for their visits (SELECT, roles=public) USING (EXISTS ( SELECT 1 FROM visits WHERE ((visits.id = visit_registrations.visit_id) AND (visits.organization_id = (auth.uid())::text))))
  [rls] Service role full access to visit_registrations (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [rls] Volunteers can cancel own registration (UPDATE, roles=public) USING (volunteer_id = (auth.uid())::text) CHECK (status = 'cancelled'::text)
  [rls] Volunteers can create registrations (INSERT, roles=public) CHECK ((volunteer_id = (auth.uid())::text) AND (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'volunteer'::text) AND (users.status = 'approved'::text)))))
  [rls] Volunteers can view own registrations (SELECT, roles=public) USING (volunteer_id = (auth.uid())::text)
  [trg] CREATE TRIGGER visit_registrations_updated_at BEFORE UPDATE ON public.visit_registrations FOR EACH ROW EXECUTE FUNCTION update_visit_registrations_updated_at()

## visits  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('visits_id_seq'::regclass)
  title :: text
  organization_id :: text
  guest_org_name :: text
  guest_contact_name :: text
  guest_contact_email :: text
  guest_contact_phone :: text
  visit_date :: date NOT NULL
  start_time :: timestamp with time zone NOT NULL
  end_time :: timestamp with time zone NOT NULL
  address :: text NOT NULL
  location_lat :: double precision
  location_lng :: double precision
  audience_age_ranges :: text[]
  visitor_count_expected :: integer
  event_description :: text
  approx_space_sqft :: integer
  fee_tier :: text
  fee_amount :: numeric
  volunteer_slots :: integer NOT NULL DEFAULT 1
  parking_coverage :: text
  parking_instructions :: text
  arrival_instructions :: text
  accessibility_notes :: text
  requires_vsc :: boolean DEFAULT false
  requires_vaccine_record :: boolean DEFAULT true
  status :: text DEFAULT 'pending_review'::text
  admin_note :: text
  google_calendar_event_id :: text
  created_by :: text
  recurrence_rule :: text
  parent_visit_id :: integer
  created_at :: timestamp with time zone DEFAULT now()
  updated_at :: timestamp with time zone DEFAULT now()
  postal_code :: character varying(10)
  location_place_id :: text
  assigned_pd_id :: text
  min_volunteers :: integer NOT NULL
  min_reached_at :: timestamp with time zone
  staffed_notified_at :: timestamp with time zone
  [c] visits_fee_tier_check — CHECK ((fee_tier = ANY (ARRAY['tier_500'::text, 'tier_200'::text, 'tier_0'::text, 'custom'::text])))
  [c] visits_min_volunteers_check — CHECK (((min_volunteers >= 1) AND (min_volunteers <= volunteer_slots)))
  [c] visits_parking_coverage_check — CHECK ((parking_coverage = ANY (ARRAY['free_on_site'::text, 'reimbursed_on_site'::text, 'invoice'::text])))
  [c] visits_status_check — CHECK ((status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'declined'::text, 'cancelled'::text, 'completed'::text])))
  [f] visits_assigned_pd_id_fkey — FOREIGN KEY (assigned_pd_id) REFERENCES users(id) ON DELETE SET NULL
  [f] visits_created_by_fkey — FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  [f] visits_organization_id_fkey — FOREIGN KEY (organization_id) REFERENCES users(id) ON DELETE SET NULL
  [f] visits_parent_visit_id_fkey — FOREIGN KEY (parent_visit_id) REFERENCES visits(id) ON DELETE SET NULL
  [p] visits_pkey — PRIMARY KEY (id)
  [idx] CREATE INDEX idx_visits_pending_staffed_notification ON public.visits USING btree (min_reached_at) WHERE ((staffed_notified_at IS NULL) AND (min_reached_at IS NOT NULL))
  [idx] CREATE INDEX visits_assigned_pd_id_idx ON public.visits USING btree (assigned_pd_id)
  [idx] CREATE INDEX visits_location_idx ON public.visits USING btree (location_lat, location_lng)
  [idx] CREATE INDEX visits_organization_id_idx ON public.visits USING btree (organization_id)
  [idx] CREATE INDEX visits_postal_code_idx ON public.visits USING btree (postal_code)
  [idx] CREATE INDEX visits_status_idx ON public.visits USING btree (status)
  [idx] CREATE UNIQUE INDEX visits_pkey ON public.visits USING btree (id)
  [rls] Admins and PDs can create visits (INSERT, roles=public) CHECK (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Admins and PDs can update visits (UPDATE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Admins and PDs can view all visits (SELECT, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = ANY (ARRAY['admin'::text, 'pd'::text])))))
  [rls] Approved visits are visible to authenticated users (SELECT, roles=public) USING (status = 'approved'::text)
  [rls] Organizations can submit visit requests (INSERT, roles=public) CHECK ((organization_id = (auth.uid())::text) AND (status = 'pending_review'::text) AND (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'organization'::text) AND (users.status = 'approved'::text)))))
  [rls] Organizations can view their own visits (SELECT, roles=public) USING (organization_id = (auth.uid())::text)
  [rls] Service role full access to visits (ALL, roles=public) USING (auth.role() = 'service_role'::text)
  [trg] CREATE TRIGGER trg_visits_normalize_min_volunteers BEFORE INSERT OR UPDATE OF min_volunteers, volunteer_slots ON public.visits FOR EACH ROW EXECUTE FUNCTION visits_normalize_min_volunteers()
  [trg] CREATE TRIGGER visits_updated_at BEFORE UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION update_visits_updated_at()
  NOTE: column is `event_description`, NOT `special_needs_notes` (renamed by Migration 34)
  NOTE: there is no `visits.special_needs_notes`, no `visits.min_volunteers` default — the BEFORE INSERT trigger fills it

## volunteer_audience_preferences  [RLS enabled]
  volunteer_id :: text NOT NULL
  category_id :: integer NOT NULL
  [f] volunteer_audience_preferences_category_id_fkey — FOREIGN KEY (category_id) REFERENCES audience_categories(id)
  [f] volunteer_audience_preferences_volunteer_id_fkey — FOREIGN KEY (volunteer_id) REFERENCES users(id)
  [p] volunteer_audience_preferences_pkey — PRIMARY KEY (volunteer_id, category_id)
  [idx] CREATE UNIQUE INDEX volunteer_audience_preferences_pkey ON public.volunteer_audience_preferences USING btree (volunteer_id, category_id)
  [rls] Allow public read access to volunteer preferences (SELECT, roles=public) USING true
  [rls] Volunteers can delete their own preferences (DELETE, roles=public) USING true
  [rls] Volunteers can insert their own preferences (INSERT, roles=public) CHECK true
  [rls] Volunteers can update their own preferences (UPDATE, roles=public) USING (volunteer_id = (auth.uid())::text)
  [rls] Volunteers can view their own preferences (SELECT, roles=public) USING (volunteer_id = (auth.uid())::text)

## welcome_messages  [RLS enabled]
  id :: integer NOT NULL DEFAULT nextval('welcome_messages_id_seq'::regclass)
  user_type :: text NOT NULL
  message :: text NOT NULL
  is_active :: boolean DEFAULT true
  created_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  updated_at :: timestamp with time zone DEFAULT CURRENT_TIMESTAMP
  [c] welcome_messages_user_type_check — CHECK ((user_type = ANY (ARRAY['individual'::text, 'volunteer'::text])))
  [p] welcome_messages_pkey — PRIMARY KEY (id)
  [idx] CREATE UNIQUE INDEX welcome_messages_pkey ON public.welcome_messages USING btree (id)
  [idx] CREATE UNIQUE INDEX welcome_messages_user_type_active_idx ON public.welcome_messages USING btree (user_type) WHERE (is_active = true)
  [rls] Allow admins to delete welcome messages (DELETE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Allow admins to insert welcome messages (INSERT, roles=public) CHECK (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Allow admins to manage welcome messages (ALL, roles=public) USING true
  [rls] Allow admins to read all welcome messages (SELECT, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Allow admins to update welcome messages (UPDATE, roles=public) USING (EXISTS ( SELECT 1 FROM users WHERE ((users.id = (auth.uid())::text) AND (users.role = 'admin'::text))))
  [rls] Allow public read access to active welcome messages (SELECT, roles=public) USING (is_active = true)
  [trg] CREATE TRIGGER update_welcome_messages_updated_at BEFORE UPDATE ON public.welcome_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()

---

## Functions / RPCs

Extension-owned functions (PostGIS `st_*` etc.) excluded.

```
approve_volunteer_and_dog(p_user_id uuid) -> void
get_dogs_for_individual(individual_user_id text, max_distance_km double precision) -> TABLE(dog_id integer, dog_name text, dog_breed text, dog_age integer, dog_bio text, dog_picture_url text, volunteer_id text, volunteer_first_name text, volunteer_last_initial text, volunteer_city text, general_availability text, distance_km double precision, matching_categories text[])
get_individuals_for_volunteer(volunteer_user_id text, max_distance_km double precision) -> TABLE(id text, first_name text, last_initial text, city text, pronouns text, bio text, profile_picture_url text, distance_km double precision, matching_categories text[])
get_next_confirmed_appointments(user_id text) -> TABLE(start_time timestamp with time zone, volunteer_first_name text, volunteer_last_name text, individual_first_name text, individual_last_name text, dog_name text, dog_picture_url text, dog_breed text, dog_age integer, dog_bio text)
increment_unread_count(appointment_id integer) -> void
mark_chat_as_read(appointment_id_param integer) -> void
update_chat_unread_count() -> trigger
update_updated_at_column() -> trigger
update_visit_registrations_updated_at() -> trigger
update_visits_updated_at() -> trigger
visits_normalize_min_volunteers() -> trigger
```

**Called from app code (`src/`):** `get_dogs_for_individual`, `get_individuals_for_volunteer`,
`get_next_confirmed_appointments`. All three exist in DevDB.

**`approve_volunteer_and_dog(p_user_id uuid)` — dead and un-callable.** It takes `uuid`, but
`users.id` is `text` holding Clerk IDs (`user_31…`), which cannot cast to uuid. No callers in
`src/` or `scripts/`. Candidate for DROP.

**`get_nearby_dogs_with_availability` is NOT in DevDB.** The two scripts that created and patched
it were deleted in the Oct 2026 cleanup, along with the rest of the availability system.

**PostGIS is installed but unused** — every coordinate column is `double precision`; there are no
`geometry`/`geography` columns. Distance logic lives in SQL/TS, not PostGIS.

---

## Tables present (18 app tables + 1 PostGIS)

appointment_chats · appointments · audience_categories · chat_logs · chat_requests ·
device_tokens · dogs · individual_audience_tags · message_read_status · pd_region_places ·
pd_regions · pending_email_notifications · role_change_audit · users · visit_notes ·
visit_registrations · visits · volunteer_audience_preferences · welcome_messages
(+ `spatial_ref_sys` from PostGIS)

**Notably absent:** `appointment_availability` — the availability system described in `CLAUDE.md`
does not exist in DevDB. Scheduling is via `chat_requests` → `appointments`.
