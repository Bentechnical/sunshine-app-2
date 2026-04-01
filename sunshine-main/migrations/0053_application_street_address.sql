-- Add full street address field to volunteer applications (for geocoding at approval time)
ALTER TABLE volunteer_applications
    ADD COLUMN street_address TEXT;
