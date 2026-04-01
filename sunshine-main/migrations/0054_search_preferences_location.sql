-- Extend search_preferences with location-based filter fields
ALTER TABLE search_preferences
    ADD COLUMN preferred_location_id UUID
        REFERENCES volunteer_locations(id) ON DELETE SET NULL,
    ADD COLUMN preferred_distance_km NUMERIC(6,2);
