# Extension interface polish
- [x] Simplify shared panel and community styling with responsive controls.
- [x] Stabilize panel updates and community loading feedback.
- [x] Verify interactions with simulated extension services and repackage the extension download; native Chrome installation remains unverified.

# OpenRouter switch
- [x] Replace the AI provider with OpenRouter and select a capable coding model.
- [x] Superseded shared server credentials with first-use bring-your-own-key setup for Anthropic, OpenAI, and OpenRouter.
- [x] Verify provider request formatting, plan validation, first-use setup, tab drafts, local key removal, saved-rule reapplication, and rejection of older servers with simulated extension/provider services. TypeScript and production build pass.
- [ ] Verify a real provider request with a user-supplied key; no paid provider call has been made during implementation.

# Supabase community connection
- [x] Connect the local server to the supplied PageWriter project; keep its server key in ignored local environment configuration.
- [x] Apply and record the community/profile/likes schema with public reads, server-only writes, and an Auth profile trigger.
- [x] Verify live login, refresh, sharing, public search, likes, installs, author stamping, and denied direct user writes using a disposable confirmed account; remove all test data afterward.
- [x] Fix underscore searches for usernames and pass the Supabase security advisors.
- Email confirmation remains enabled for real sign-ups; no confirmation email was sent during the integration check.

# Extension 1.3.0
- [x] Reapply enabled saved setups on reload, delayed content, style resets, and page navigation without another AI call; retry delayed click targets once per operation.
- [x] Replace model text entry with provider-specific model dropdowns and preserve the user's saved selection.
- [x] Fix the release backend in `extension/config.js`, show it read-only, and ignore old user-entered server overrides.
- [x] Add authenticated AES-256-GCM key storage in Supabase with an independent private server encryption key and no raw-key read API.
- [x] Remember only provider/model/user metadata locally; migrate existing plaintext keys after a successful encrypted account save.
- [x] Verify live encryption/decryption, replacement, removal, cross-user isolation, and denied direct browser access with disposable accounts and dummy keys; remove all fixtures without calling an AI provider.
- Supabase's Auth advisor currently flags disabled leaked-password protection; the credential table has no anonymous/authenticated access grants or policies.
