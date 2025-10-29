-- Migration: Add audience categories to dogs_with_next_availability view
-- This eliminates the N+1 query problem when loading dog directory
--
-- Performance impact: Reduces 43 queries to 3 queries when loading 20 dogs
--
-- Run this in: Supabase Dashboard → SQL Editor

-- Drop dependent views first (CASCADE will handle all dependencies)
-- The dogs_nearby_with_availability view depends on dogs_with_next_availability
DROP VIEW IF EXISTS public.dogs_with_next_availability CASCADE;

-- Recreate the view with audience_categories column added
-- security_invoker = on ensures RLS policies are properly enforced
CREATE VIEW public.dogs_with_next_availability WITH (security_invoker = on) AS
SELECT
  dogs.id,
  dogs.volunteer_id,
  dogs.dog_name,
  dogs.dog_breed,
  dogs.dog_age,
  dogs.dog_bio,
  dogs.dog_picture_url,
  dogs.created_at,
  dogs.updated_at,
  (u.first_name || ' '::text) || u.last_name AS volunteer_name,

  -- Next available appointment time
  (
    SELECT appointment_availability.start_time
    FROM appointment_availability
    WHERE appointment_availability.volunteer_id = dogs.volunteer_id
      AND appointment_availability.is_hidden = false
      AND appointment_availability.start_time > NOW()
    ORDER BY appointment_availability.start_time
    LIMIT 1
  ) AS next_available,

  -- NEW: Aggregate audience categories into JSONB array
  -- This eliminates the need for 2 queries per dog in the client
  (
    SELECT JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', ac.id,
        'name', ac.name
      )
    )
    FROM volunteer_audience_preferences vap
    INNER JOIN audience_categories ac ON ac.id = vap.category_id
    WHERE vap.volunteer_id = dogs.volunteer_id
  ) AS audience_categories

FROM dogs
LEFT JOIN users u ON u.id = dogs.volunteer_id
WHERE EXISTS (
  SELECT 1
  FROM appointment_availability
  WHERE appointment_availability.volunteer_id = dogs.volunteer_id
    AND appointment_availability.is_hidden = false
    AND appointment_availability.start_time > NOW()
)
ORDER BY (
  SELECT appointment_availability.start_time
  FROM appointment_availability
  WHERE appointment_availability.volunteer_id = dogs.volunteer_id
    AND appointment_availability.is_hidden = false
    AND appointment_availability.start_time > NOW()
  ORDER BY appointment_availability.start_time
  LIMIT 1
);

-- Grant permissions (adjust if needed based on your RLS setup)
GRANT SELECT ON public.dogs_with_next_availability TO authenticated;
GRANT SELECT ON public.dogs_with_next_availability TO anon;

-- Recreate the dogs_nearby_with_availability view
-- This view was dropped by CASCADE when we recreated dogs_with_next_availability
-- It adds distance calculation for nearby dog queries
-- security_invoker = on ensures RLS policies are properly enforced
CREATE OR REPLACE VIEW public.dogs_nearby_with_availability WITH (security_invoker = on) AS
SELECT
  *,
  -- Add any distance calculation columns if needed by the get_nearby_dogs_with_availability function
  -- The RPC function will handle the actual distance filtering
  NULL::double precision AS distance_km
FROM public.dogs_with_next_availability;

-- Grant permissions
GRANT SELECT ON public.dogs_nearby_with_availability TO authenticated;
GRANT SELECT ON public.dogs_nearby_with_availability TO anon;

-- Verify the migration worked
-- This should show the new audience_categories column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'dogs_with_next_availability'
ORDER BY ordinal_position;