# Deploy to Vercel

Use one Vercel project connected to this repository. Select Node.js 24 and Vite, and leave **Root Directory** unset so Vercel builds from the repository root. The root `vercel.json` builds the Vite frontend and sends `/api` requests to the Express app in the same deployment.

## Prepare MySQL

Use a hosted MySQL database reachable from the Vercel project. Configure a deployment connection with TLS enabled and trusted certificates. Keep Preview and Production on separate databases when both are in use.

- Set `DB_HOST`, `DB_PORT` (defaults to 3306), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL=true`. When the provider requires a CA certificate, set `DB_SSL_CA` to its PEM value.
- Set a random `JWT_SECRET` and a separate `BIOMETRIC_ENCRYPTION_KEY`. Generate each with `openssl rand -hex 32`. Keep the biometric key stable and backed up.
- Set `CORS_ORIGINS` to the exact frontend origin. Use comma-separated origins if testing multiple custom URLs.
- Leave `VITE_API_ROOT` unset or set it to `/api` so the frontend uses the same domain. Add database credentials as server-side variables without a `VITE_` prefix.
- Set `CRON_SECRET` to a random value for the production template cleanup. Optional settings are `ATTENDANCE_TARGET_PERCENT` and `BIOMETRIC_RETENTION_DAYS`.

With those variables set in a trusted shell, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` there and initialize the database once from `backend`:

```sh
npm ci
NODE_ENV=production npm run db:prepare
```

Provisioning creates the schema and initial admin, and migrates existing templates if upgrading a populated database. Run it again before deploying attendance sessions to an existing database. It keeps historical attendance rows and moves duplicate prevention from one check-in per day to one per session. A fresh preview should use test accounts and test data. Keep the admin password in your password manager.

## Deploy and verify

Deploy the project and check `/api/health` on the same domain as the frontend. Sign in as staff at `/login` and start a session from the dashboard. Open the home page in a signed-out browser and use the code to verify face and barcode submissions for test accounts. Close the session and confirm that its code no longer accepts check-ins.
