-- Add profile picture crop coordinates for circular badge generation
ALTER TABLE volunteer_profiles
    ADD COLUMN profile_pic_crop_x INTEGER,      -- Circle center X coordinate (pixels from left)
    ADD COLUMN profile_pic_crop_y INTEGER,      -- Circle center Y coordinate (pixels from top)
    ADD COLUMN profile_pic_crop_radius INTEGER; -- Circle radius (pixels)

-- Add comment explaining the coordinate system
COMMENT ON COLUMN volunteer_profiles.profile_pic_crop_x IS 'X coordinate of circular crop center (pixels from left of original image)';
COMMENT ON COLUMN volunteer_profiles.profile_pic_crop_y IS 'Y coordinate of circular crop center (pixels from top of original image)';
COMMENT ON COLUMN volunteer_profiles.profile_pic_crop_radius IS 'Radius of circular crop area (pixels)';
