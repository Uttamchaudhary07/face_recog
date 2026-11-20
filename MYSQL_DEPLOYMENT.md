# Deploy to Vercel

Create two Vercel projects from this repository. Use Node.js 24 and set each project's Root Directory separately.

| Project | Root Directory | Framework | Build |
| --- | --- | --- | --- |
| Backend | `backend` | Express | Vercel detects `src/index.js` |
| Frontend | `frontend` | Vite | `npm run build`, output `dist` |

## Prepare MySQL

Use a hosted MySQL database reachable from the backend project. Configure a deployment connection with TLS enabled and trusted certificates. Keep Preview and Production on separate databases when both are in use.

- Set `DB_HOST`, `DB_PORT` (defaults to 3306), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_SSL=true`. When the provider requires a CA certificate, set `DB_SSL_CA` to its PEM value.
- Set a random `JWT_SECRET` and a separate `BIOMETRIC_ENCRYPTION_KEY`. Generate each with `openssl rand -hex 32`. Keep the biometric key stable and backed up.
- Set `CORS_ORIGINS` to the exact frontend origin. Use comma-separated origins if testing multiple custom URLs.
- Set `CRON_SECRET` to a random value for the production template cleanup. Optional settings are `ATTENDANCE_TARGET_PERCENT` and `BIOMETRIC_RETENTION_DAYS`.

With those variables set in a trusted shell, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` there and initialize the database once from `backend`:

```sh
npm ci
NODE_ENV=production npm run db:prepare
```

Provisioning creates the schema and initial admin, and migrates existing templates if upgrading a populated database. Run it again before deploying attendance sessions to an existing database. It keeps historical attendance rows and moves duplicate prevention from one check-in per day to one per session. A fresh preview should use test accounts and test data. Keep the admin password in your password manager.

## Deploy and verify

Deploy the Express project and check `/api/health`. Set the frontend's `VITE_API_ROOT` to the backend HTTPS URL ending in `/api` before building it. Sign in as staff at `/login` and start a session from the dashboard. Open the home page in a signed-out browser and use the code to verify face and barcode submissions for test accounts. Close the session and confirm that its code no longer accepts check-ins.
