-- Fix get_nearby_dogs_with_availability function to include audience_categories
-- This fixes the "return type mismatch" error after adding the audience_categories column
--
-- The function body is unchanged, but we need to recreate it so PostgreSQL
-- recognizes the new column structure from dogs_with_next_availability view

-- Drop and recreate the function
DROP FUNCTION IF EXISTS get_nearby_dogs_with_availability(double precision, double precision);

CREATE OR REPLACE FUNCTION get_nearby_dogs_with_availability(
  user_lat double precision,
  user_lng double precision
)
RETURNS SETOF dogs_with_next_availability AS $$
  SELECT
    d.*
  FROM dogs_with_next_availability d
  JOIN users u ON u.id = d.volunteer_id
  WHERE (
    111.045 * DEGREES(ACOS(
      LEAST(1.0, COS(RADIANS(user_lat)) * COS(RADIANS(u.location_lat)) *
      COS(RADIANS(u.location_lng) - RADIANS(user_lng)) +
      SIN(RADIANS(user_lat)) * SIN(RADIANS(u.location_lat)))
    ))
  ) <= u.travel_distance_km;
$$ LANGUAGE sql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_nearby_dogs_with_availability(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_dogs_with_availability(double precision, double precision) TO anon;