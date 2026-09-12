-- Fix chat sending error:
-- "Could not find the 'is_read' column of 'messages' in the schema cache"
--
-- Run this once in Supabase Dashboard > SQL Editor for the Vercel project DB.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

UPDATE public.messages
SET is_read = false
WHERE is_read IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_is_read
  ON public.messages(is_read);

-- Ask PostgREST/Supabase API to refresh its schema cache.
NOTIFY pgrst, 'reload schema';
