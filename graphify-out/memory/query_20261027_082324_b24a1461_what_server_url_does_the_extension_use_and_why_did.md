---
type: "query"
date: "2026-10-27T08:23:24.017615+00:00"
question: "What server URL does the extension use and why did fetch fail?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Extension account authentication", "auth.server.ts"]
---

# Q: What server URL does the extension use and why did fetch fail?

## Answer

Expanded from original query via vocab: extension config server url fetch. The graph identified the public API and auth modules but omitted the current release configuration. Direct source verification found localhost configured with no listener. The production fix deploys Node/Nitro on Fly at https://pagewright-backend.fly.dev, sets extension/config.js to that address, and publishes extension 1.3.1 with authentication required before the key form appears. Live account login, encrypted save, metadata-only responses, unauthenticated 401s, and key removal passed. Supabase Site URL now points to the HTTPS deployment. Public email signup still needs custom SMTP because the project uses the default restricted sender.

## Outcome

- Signal: useful

## Source Nodes

- Extension account authentication
- auth.server.ts