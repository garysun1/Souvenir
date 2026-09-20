DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'place_sources', 'place_images', 'place_notes', 'place_tags',
    'place_suggestions', 'coverage_cells', 'place_stats', 'user_stats',
    'activity_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.revoke_friend_activity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.status = 'accepted' AND NEW.status <> 'accepted') THEN
    DELETE FROM public.activity_events
    WHERE kind = 'friend' AND (
      (user_id = OLD.user_id AND friend_id = OLD.friend_id)
      OR (user_id = OLD.friend_id AND friend_id = OLD.user_id)
    );
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.revoke_friend_activity() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER friendships_revoke_activity
AFTER DELETE OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.revoke_friend_activity();