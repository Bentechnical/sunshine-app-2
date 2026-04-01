-- Add 'unverified' to asset_visibility enum
ALTER TYPE asset_visibility ADD VALUE IF NOT EXISTS 'unverified';
