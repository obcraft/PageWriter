BEGIN;
CREATE TABLE public.user_api_credentials (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openrouter', 'openai', 'anthropic')),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 24 AND 6000),
  nonce text NOT NULL CHECK (length(nonce) = 16),
  encryption_version integer NOT NULL DEFAULT 1 CHECK (encryption_version = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
ALTER TABLE public.user_api_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_api_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_api_credentials TO service_role;
COMMENT ON TABLE public.user_api_credentials IS 'Server-only AES-256-GCM encrypted provider keys; encryption key is stored outside this database. No raw key read endpoint.';
NOTIFY pgrst, 'reload schema';
COMMIT;
