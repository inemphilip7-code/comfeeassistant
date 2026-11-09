# Deployment Guide

## Current demo setup

The checked-in Render blueprint creates a free web service and free PostgreSQL database for
synthetic-data demonstrations. It uses device transcription, inline processing, Gemini for
clinical extraction, and Supabase for object storage. Redis is not required.

Render prompts for the values marked `sync: false` in `render.yaml`. Set these in Render's
Dashboard and keep them out of source control:

- `OPENROUTER_API_KEY`: an OpenRouter API key for actual report generation. The blueprint
  selects `google/gemini-2.0-flash-001` through use those credindential and test flow
  OpenRouter.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: storage access; the configured bucket must
  already exist.
- `APP_BASE_URL` and `CORS_ORIGIN`: the production Vercel origin, such as
  `https://your-project.vercel.app`.
- `SEED_CLINICIAN_EMAIL`, `SEED_CLINICIAN_PASSWORD`, and `SEED_CLINICIAN_NAME`: a dedicated
  initial test account. Use a password with at least 12 characters.

Render supplies `DATABASE_URL` from the blueprint's database. On the first start, the API
waits for the schema sync and account setup to finish before it accepts requests. Later starts
reuse the same database. The seed creates an organisation and clinician account only; it does
not create a sample patient session.

In Vercel, connect the repository and set `VITE_API_URL` to the deployed Render API URL. The
frontend build now fails if Vercel has no API URL, instead of silently calling an old backend.
The Vercel configuration builds the Vite app from `frontend/` and publishes `frontend/dist`.

## Use with real clinical data

Do not use the free Render blueprint for patient data. Render states that free instances are
for testing and hobby projects; free PostgreSQL expires 30 days after creation and has no
backups. Before a clinical deployment, choose paid Render compute and database plans, add a
tracked Prisma migration workflow, and have the organisation approve the data location,
retention, access, and governance configuration.

## Local checks

```bash
npm run deployment:check
npm run typecheck
npm test
npm --prefix frontend run build
```

For the networked full-flow check, follow [`TESTING.md`](./TESTING.md) and use a dedicated
synthetic-data account.
