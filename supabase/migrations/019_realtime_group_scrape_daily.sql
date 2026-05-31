-- Enable Realtime on daily scrape table (master rebuild is triggered after scrape).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'resource_management_group_scrape_daily'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.resource_management_group_scrape_daily;
  END IF;
END $$;
