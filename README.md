# Remix of PageFlow Assistant

Make a chrome extention that whenever installed, and used on a dfferent piage, i can ask something like change sorting of @connector:linkedin:"LinkedIn"  in chronologisch order, then it cahgnes that dom html localyl offline of fix the question

This project was built with [Lovable](https://lovable.dev).

## First use: bring your own key

Open the extension, sign in or create an account, choose **Anthropic**, **OpenAI**, or **OpenRouter**, and paste your own API key. Pick a model from that provider's dropdown and select **Save and continue**. Setup does not make a paid AI call; the selected provider bills your account when you request a new page change. You can replace or remove the key in Settings.

Keys are encrypted using AES-256-GCM in Supabase `user_api_credentials`, bound to each user and provider. The independent encryption key stays in the server's private environment; the browser receives saved-key metadata only. The browser remembers the account and selected provider/model locally. Older local plaintext keys are migrated after sign-in and removed locally only after the encrypted save succeeds. There is no shared-key or provider fallback.

Enabled saved setups reapply automatically on page reload, late-rendered content, and page navigation, without an AI call. Delayed click targets are retried until present and clicked once per page/route. Disabled setups are not applied.

The public backend is `https://pagewright-backend.fly.dev`. Users install the extension, sign in, then save their own provider key; they do not need a local server. The server address is fixed in `extension/config.js` and shown read-only in Settings. The extension checks `GET /api/public/reshape` for encrypted account-key support before sending page content.

Deploy with `fly deploy --ha=false` using `fly.toml` and `Dockerfile` (Node/Nitro server, Amsterdam). Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as public build arguments for the same Supabase project as the runtime secrets below. Private environment files are excluded from the image; runtime secrets must be configured with Fly secrets. Deploy the updated server together with `public/pagewright-extension.zip`. After changing `extension/`, repackage with `cd extension && zip -r ../public/pagewright-extension.zip . -x '*.DS_Store'`.

Provider request formats: [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Supabase accounts and community

The local app connects to the PageWriter Supabase project `qcjovvehgbomcyglbovu` using the ignored `.env.local` file. Server routes use `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, the server-only `SUPABASE_SERVICE_ROLE_KEY`, and `API_KEY_ENCRYPTION_KEY` (a base64-encoded random 32-byte key). Frontend configuration uses the corresponding `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values. Never prefix either server secret with `VITE_` or `NEXT_PUBLIC_`.

The applied schema is in `supabase/migrations/20261026211757_pagewright_community.sql`: public setup/username reads, server-only writes, account profiles created by an Auth trigger, and like/install counters. Email confirmation is enabled: after signing up, confirm your email before signing in through the extension.

The hosted Auth Site URL is `https://pagewright-backend.fly.dev`, so account email links return to the public site. Public registration also requires custom SMTP in Supabase Authentication → Emails → SMTP Settings: Supabase's default mail service only delivers to project team members. Custom SMTP is not configured yet; existing confirmed accounts can sign in, but email registration for outside users remains blocked until a sender/service is configured. Keep email confirmation enabled.

Migration `20261026213718_encrypted_user_api_keys.sql` adds the private encrypted credential table. No browser role can directly read or write it; the authenticated server API can list metadata, save, or remove the current user's provider key. Preserve and back up the encryption key outside Supabase, and use the same value across server instances and deployments so existing credentials remain decryptable. Local environment files are not deployed automatically.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9e9f7a85-4d83-4522-9e31-420744d88dd9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
