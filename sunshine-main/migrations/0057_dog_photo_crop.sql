-- Add dog photo crop coordinates for circular badge generation
ALTER TABLE dogs
    ADD COLUMN photo_crop_x INTEGER,      -- Circle center X coordinate (pixels from left)
    ADD COLUMN photo_crop_y INTEGER,      -- Circle center Y coordinate (pixels from top)
    ADD COLUMN photo_crop_radius INTEGER; -- Circle radius (pixels)

-- Add comment explaining the coordinate system
COMMENT ON COLUMN dogs.photo_crop_x IS 'X coordinate of circular crop center (pixels from left of original image)';
COMMENT ON COLUMN dogs.photo_crop_y IS 'Y coordinate of circular crop center (pixels from top of original image)';
COMMENT ON COLUMN dogs.photo_crop_radius IS 'Radius of circular crop area (pixels)';
