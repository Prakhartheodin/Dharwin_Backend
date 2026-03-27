# Dharwin backend (Node / Express)

## Documentation

All guides and API references live under **[`docs/`](./docs/)**. Start with **[`docs/README.md`](./docs/README.md)** for a full index. The Next.js UI app is **[`../uat.dharwin.frontend`](../uat.dharwin.frontend)** — **[`../uat.dharwin.frontend/docs/README.md`](../uat.dharwin.frontend/docs/README.md)**.

Quick links:

- [Bolna voice agents](./docs/BOLNA.md)
- [Activity logs API](./docs/ACTIVITY_LOGS_API.md)
- [LiveKit setup](./docs/LIVEKIT_SETUP.md)

### Platform audit (IP and location)

Activity logs store `ip` and `geo` from the incoming HTTP request. **`TRUST_PROXY_HOPS`** in `.env` must match how many trusted reverse proxies sit in front of Node (see `src/config/config.js` and `src/app.js`). Use **`0`** when the browser hits Node directly (local dev). On **AWS**, use **`1`** for a single ALB, or **`2`** when CloudFront (or similar) is in front of the ALB—verify with one real request so `req.ip` is the client’s public address, not a private load-balancer IP.

## Run

See `.env.example` and project scripts in `package.json` (`npm run dev`, `npm run lint`, etc.).
