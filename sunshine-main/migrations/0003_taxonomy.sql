-- ============================================================
-- Hierarchical Taxonomies
-- Both dog breeds and agency types use the same self-referential
-- pattern. ltree gives us efficient ancestor/descendant queries.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS ltree;

-- ─── Agency Types ────────────────────────────────────────────
-- e.g. Healthcare > Care Home
--      Education > Secondary School > Alternative School

CREATE TABLE agency_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    parent_id   UUID REFERENCES agency_types(id) ON DELETE RESTRICT,
    -- ltree path e.g. 'healthcare.care_home'
    path        ltree NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOL NOT NULL DEFAULT true
);

CREATE INDEX agency_types_path_gist_idx ON agency_types USING GIST (path);
CREATE INDEX agency_types_path_idx ON agency_types USING BTREE (path);

-- Seed data inserted by seed binary, not here, so admins can manage via UI.

-- ─── Dog Breed Groups / Types ────────────────────────────────
-- e.g. Working Dogs > Retrievers > Golden Retriever

CREATE TABLE dog_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    parent_id   UUID REFERENCES dog_types(id) ON DELETE RESTRICT,
    path        ltree NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOL NOT NULL DEFAULT true
);

CREATE INDEX dog_types_path_gist_idx ON dog_types USING GIST (path);
CREATE INDEX dog_types_path_idx ON dog_types USING BTREE (path);
