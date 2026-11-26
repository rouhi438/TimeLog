-- Run once in the TimeLog Neon SQL editor. Does not modify neon_auth.
BEGIN;
CREATE TABLE IF NOT EXISTS public.timelog_state (
 id integer PRIMARY KEY CHECK (id=1),
 revision integer NOT NULL DEFAULT 0,
 payload jsonb NOT NULL DEFAULT '{"employees":[],"shifts":[],"company":{"name":"Gastronomia Pizza","cvr":"","address":"","phone":"","email":""}}'::jsonb
);
INSERT INTO public.timelog_state(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.timelog_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.timelog_state FROM PUBLIC;
COMMIT;
-- Use a dedicated server-only database role with SELECT and UPDATE on this table.
-- No browser Data API access or public RLS policies are needed.
