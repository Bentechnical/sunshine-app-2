-- Enable PostGIS for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;
-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Enable pg_trgm for full-text search on volunteer/agency names
CREATE EXTENSION IF NOT EXISTS pg_trgm;
