<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Extension UI uses shared semantic color/control tokens in `extension/popup.css`, with community layout overrides in `extension/hub.css`; update active-tab state without reloading the panel to preserve drafts and focus.
- The Chrome extension source lives in `extension/` (Manifest V3, plain JS, no build step); after any change there, re-zip it to `public/pagewright-extension.zip` — the download page serves that file.
- The extension never runs AI-generated code; the AI returns a small JSON list of DOM operations that `extension/pagewright.js` executes — keeps it CSP-safe on sites like LinkedIn.
- The AI planning endpoint is `src/routes/api/public/reshape.ts` (public, CORS-open, input size-capped) so the extension can call it from any site; logic lives in `src/server/reshape.server.ts`.
- AI planning calls OpenRouter chat completions server-side using `OPENROUTER_API_KEY` and strict JSON schema validation; never fall back to another provider when the key is missing, so provider selection and billing stay predictable.
- `extension/pagewright.js` is a plain script exposing `globalThis.Pagewright`; its sort/date/filter logic is tested in `src/test/pagewright-ops.test.ts`.
- Community sharing: shared setups live in `public.shared_configs` (public read, writes only via `src/routes/api/public/configs*` using the admin client, size/shape validated in `src/server/configs.server.ts`); the extension's full-screen `extension/hub.html` browses/tries/shares them — sharing requires an account: the extension signs in via `src/routes/api/public/auth.$action.ts` (email/password, username in `public.profiles` created by an auth trigger) and sends a bearer token; the server verifies it and stamps `author_name`/`user_id`, staying the only writer.
