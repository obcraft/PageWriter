-- Pagewright community and email/password account profiles.
-- Public reads; all sharing/like/counter writes remain server-only.
BEGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shared_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL CHECK (host = '*' OR host ~ '^[a-z0-9.-]{1,253}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  author_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 2000),
  operations jsonb NOT NULL CHECK (
    jsonb_typeof(operations) = 'array' AND jsonb_array_length(operations) BETWEEN 1 AND 30
  ),
  installs integer NOT NULL DEFAULT 0 CHECK (installs >= 0),
  likes integer NOT NULL DEFAULT 0 CHECK (likes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.config_likes (
  config_id uuid NOT NULL REFERENCES public.shared_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (config_id, user_id)
);

CREATE INDEX shared_configs_host_created_idx ON public.shared_configs (host, created_at DESC);
CREATE INDEX shared_configs_likes_idx ON public.shared_configs (likes DESC);
CREATE INDEX shared_configs_user_idx ON public.shared_configs (user_id);
CREATE INDEX config_likes_user_idx ON public.config_likes (user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_likes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles, public.shared_configs, public.config_likes FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles, public.shared_configs TO anon, authenticated;
GRANT ALL ON public.profiles, public.shared_configs, public.config_likes TO service_role;

CREATE POLICY "Pagewright public usernames" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Pagewright public setups" ON public.shared_configs
  FOR SELECT TO anon, authenticated USING (true);
-- No anon/authenticated write policies: the Pagewright server verifies the user
-- and stamps user_id/author_name using its private server credential.

CREATE FUNCTION public.pagewright_create_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requested_username text := lower(NEW.raw_user_meta_data ->> 'username');
BEGIN
  IF requested_username IS NULL OR requested_username !~ '^[a-z0-9_]{3,20}$' THEN
    requested_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 15);
  END IF;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, requested_username);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pagewright_create_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pagewright_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.pagewright_create_profile();

-- Backfill profiles for any accounts created before the application was linked.
INSERT INTO public.profiles (id, username)
SELECT id, 'user_' || substr(replace(id::text, '-', ''), 1, 15) FROM auth.users
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.pagewright_sync_config_likes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_configs SET likes = likes + 1 WHERE id = NEW.config_id;
  ELSE
    UPDATE public.shared_configs SET likes = greatest(likes - 1, 0) WHERE id = OLD.config_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.pagewright_sync_config_likes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pagewright_config_likes_count AFTER INSERT OR DELETE ON public.config_likes
  FOR EACH ROW EXECUTE FUNCTION public.pagewright_sync_config_likes();

CREATE FUNCTION public.increment_installs(config_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.shared_configs SET installs = installs + 1 WHERE id = config_id;
$$;
REVOKE ALL ON FUNCTION public.increment_installs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_installs(uuid) TO service_role;

-- This project's automatic-RLS event trigger is owned by postgres. Application
-- roles never need to execute it directly; keep its owner/event-trigger access.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
