# Dharwin Backend (`uat.dharwin.backend`)

Node.js + Express + MongoDB backend for ATS/HRM workflows, auth, documents, notifications, email integrations, and LiveKit/Bolna features.

## Overview

- Runtime: Node.js (ESM, `type: module`)
- API: Express REST endpoints under `/v1`
- DB: MongoDB (Mongoose)
- Auth: JWT + cookie/token flows
- Storage: AWS S3 presigned uploads/downloads
- Realtime/features: Socket.IO, LiveKit, Bolna workflows, OpenAI-assisted features

## Prerequisites

- Node.js `>=18`
- npm
- MongoDB (local or hosted)
- Optional depending on features:
  - AWS S3 credentials + bucket
  - SMTP server
  - Google/Microsoft OAuth credentials
  - LiveKit (local Docker stack or LiveKit Cloud)
  - OpenAI API key

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create environment file:
   - copy `.env.example` to `.env`
3. Set minimum required values in `.env`:
   - `NODE_ENV`
   - `PORT`
   - `MONGODB_URL`
   - `JWT_SECRET` (32+ chars)
4. Start dev server:
   - `npm run dev`

Default local URL is `http://localhost:3000`.

## Scripts

- `npm run dev` — start with nodemon
- `npm start` — start server normally
- `npm test` — run node test suite entry
- `npm run lint` / `npm run lint:fix` — eslint
- `npm run prettier` / `npm run prettier:fix` — prettier checks/fixes
- `npm run docker:dev` / `npm run docker:prod` — compose variants
- `npm run docker:livekit` / `npm run docker:livekit:down` — local LiveKit stack
- `npm run docker:livekit:full` / `npm run docker:livekit:full:down` — full stack from `livekit/`

## Environment Configuration

Use `.env.example` as source of truth. Important groups:

- **Core app:** `NODE_ENV`, `PORT`, `MONGODB_URL`
- **Security/JWT:** `JWT_SECRET`, token expirations
- **Proxy/IP handling:** `TRUST_PROXY_HOPS` (recommended), optional `TRUST_PROXY`
- **CORS/public URLs:** `CORS_ORIGIN`, `FRONTEND_BASE_URL`, `BACKEND_PUBLIC_URL`
- **SMTP:** `SMTP_*`, `EMAIL_FROM`, `EMAIL_REPLY_TO`
- **AWS/S3:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`
- **LiveKit/recordings:** `LIVEKIT_*`, `MINIO_*` (for local)
- **Google/Microsoft integrations:** `GCP_*`, Microsoft app config values
- **AI/voice features:** `OPENAI_API_KEY`, Bolna-related keys

## Project Structure

- `src/` — app source (config, models, services, routes, controllers, utils)
- `docs/` — backend documentation and API guides
- `livekit/` — LiveKit compose assets
- `bin/` — utility bootstrap scripts

## API and Feature Documentation

Start here:

- [`docs/README.md`](./docs/README.md) — full backend docs index
- [`docs/ACTIVITY_LOGS_API.md`](./docs/ACTIVITY_LOGS_API.md)
- [`docs/BOLNA.md`](./docs/BOLNA.md)
- [`docs/LIVEKIT_SETUP.md`](./docs/LIVEKIT_SETUP.md)
- [`docs/FILE_STORAGE_API.md`](./docs/FILE_STORAGE_API.md)

Frontend companion app:

- [`../uat.dharwin.frontend`](../uat.dharwin.frontend)
- [`../uat.dharwin.frontend/README.md`](../uat.dharwin.frontend/README.md)
- [`../uat.dharwin.frontend/docs/README.md`](../uat.dharwin.frontend/docs/README.md)

## Local Development Notes

- Keep backend on `3000` and frontend on `3001` for default local flow.
- If emails/share links show localhost in non-local environments, verify:
  - `FRONTEND_BASE_URL`
  - `BACKEND_PUBLIC_URL`
- For accurate client IP in logs/audit features, set `TRUST_PROXY_HOPS` to match your proxy chain.

## Troubleshooting

- **Server fails at boot with env validation errors**
  - Check required keys and value formats in `.env.example`.
- **CORS errors in frontend**
  - Ensure `CORS_ORIGIN` includes frontend origin(s).
- **Auth links point to wrong domain**
  - Verify `FRONTEND_BASE_URL`.
- **Document upload/download issues**
  - Verify S3 credentials, region, and bucket settings.
- **OAuth callback not reaching backend**
  - Confirm callback URLs and public backend URL configuration.

## Contributing

- Follow coding/linting rules before PR:
  - `npm run lint`
  - `npm run prettier`
- See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for repo contribution guidance.
