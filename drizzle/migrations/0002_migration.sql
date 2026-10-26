ALTER TABLE public.shared_configs ADD COLUMN likes integer NOT NULL DEFAULT 0;

CREATE TABLE public.config_likes (
  config_id uuid NOT NULL REFERENCES public.shared_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (config_id, user_id)
);
GRANT ALL ON public.config_likes TO service_role;
ALTER TABLE public.config_likes ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.sync_config_likes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.shared_configs SET likes = likes + 1 WHERE id = NEW.config_id;
  ELSE
    UPDATE public.shared_configs SET likes = greatest(likes - 1, 0) WHERE id = OLD.config_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER config_likes_count AFTER INSERT OR DELETE ON public.config_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_config_likes();
CREATE INDEX shared_configs_likes_idx ON public.shared_configs (likes DESC);