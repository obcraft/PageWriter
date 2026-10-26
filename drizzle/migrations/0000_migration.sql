CREATE TABLE public.shared_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT 'Anonymous',
  instruction text NOT NULL,
  operations jsonb NOT NULL,
  installs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shared_configs TO anon, authenticated;
GRANT ALL ON public.shared_configs TO service_role;
ALTER TABLE public.shared_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared configs are public" ON public.shared_configs FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX shared_configs_host_idx ON public.shared_configs (host, created_at DESC);

CREATE FUNCTION public.increment_installs(config_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS
$$ UPDATE public.shared_configs SET installs = installs + 1 WHERE id = config_id; $$;
REVOKE ALL ON FUNCTION public.increment_installs(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_installs(uuid) TO service_role;