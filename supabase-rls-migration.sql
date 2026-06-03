-- ============================================================
-- Packly — Production RLS Migration
-- Run this in your Supabase project SQL editor:
--   https://supabase.com/dashboard/project/ldxvvqrxqcewygdnotpz/sql
-- ============================================================

-- ── 1. user_data ────────────────────────────────────────────
-- One row per user; user can only read/write their own row.

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_data_select_own"  ON public.user_data;
DROP POLICY IF EXISTS "user_data_insert_own"  ON public.user_data;
DROP POLICY IF EXISTS "user_data_update_own"  ON public.user_data;
DROP POLICY IF EXISTS "user_data_delete_own"  ON public.user_data;

CREATE POLICY "user_data_select_own" ON public.user_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_data_insert_own" ON public.user_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data_update_own" ON public.user_data
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_data_delete_own" ON public.user_data
  FOR DELETE USING (auth.uid() = user_id);


-- ── 2. shared_trips ─────────────────────────────────────────
-- Readable/writable by any user who has a row in trip_access.
-- Only the owner (owner_id) can delete the trip.

ALTER TABLE public.shared_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_trips_select_member"  ON public.shared_trips;
DROP POLICY IF EXISTS "shared_trips_insert_owner"   ON public.shared_trips;
DROP POLICY IF EXISTS "shared_trips_update_member"  ON public.shared_trips;
DROP POLICY IF EXISTS "shared_trips_delete_owner"   ON public.shared_trips;

-- Any collaborator (has a trip_access row) can read the trip
CREATE POLICY "shared_trips_select_member" ON public.shared_trips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.trip_access
      WHERE trip_id = shared_trips.id
        AND user_id = auth.uid()
    )
  );

-- Only the authenticated user who owns the trip can insert
CREATE POLICY "shared_trips_insert_owner" ON public.shared_trips
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Any collaborator can update (all can edit shared trips)
CREATE POLICY "shared_trips_update_member" ON public.shared_trips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.trip_access
      WHERE trip_id = shared_trips.id
        AND user_id = auth.uid()
    )
  );

-- Only the owner can delete
CREATE POLICY "shared_trips_delete_owner" ON public.shared_trips
  FOR DELETE USING (auth.uid() = owner_id);


-- ── 3. trip_access ──────────────────────────────────────────
-- Join table linking users to shared trips.
-- Users can only see their own access rows.
-- Only the trip owner can add/remove access rows.

ALTER TABLE public.trip_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_access_select_own"          ON public.trip_access;
DROP POLICY IF EXISTS "trip_access_insert_owner"        ON public.trip_access;
DROP POLICY IF EXISTS "trip_access_delete_owner_or_self" ON public.trip_access;

-- A user can see access rows where they are the user, OR they own the trip
CREATE POLICY "trip_access_select_own" ON public.trip_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shared_trips
      WHERE id = trip_access.trip_id
        AND owner_id = auth.uid()
    )
  );

-- Only the trip owner (or the user themselves via join_shared_trip RPC)
-- can insert access rows — enforced through the RPC function
CREATE POLICY "trip_access_insert_owner" ON public.trip_access
  FOR INSERT WITH CHECK (
    -- The joining user inserts their own row (join flow)
    user_id = auth.uid()
    -- OR the owner adds a collaborator directly
    OR EXISTS (
      SELECT 1 FROM public.shared_trips
      WHERE id = trip_access.trip_id
        AND owner_id = auth.uid()
    )
  );

-- Owner can remove anyone; user can remove themselves (leave trip)
CREATE POLICY "trip_access_delete_owner_or_self" ON public.trip_access
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shared_trips
      WHERE id = trip_access.trip_id
        AND owner_id = auth.uid()
    )
  );


-- ── 4. Performance indexes ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_data_user_id
  ON public.user_data(user_id);

CREATE INDEX IF NOT EXISTS idx_shared_trips_owner_id
  ON public.shared_trips(owner_id);

CREATE INDEX IF NOT EXISTS idx_shared_trips_updated_at
  ON public.shared_trips(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_access_trip_id
  ON public.trip_access(trip_id);

CREATE INDEX IF NOT EXISTS idx_trip_access_user_id
  ON public.trip_access(user_id);


-- ── 5. Realtime — enable for shared_trips ────────────────────
-- Required for postgres_changes subscriptions to work.

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_data;
