# Smart Attendance System

The app supports a staff-operated face and barcode kiosk, admin-managed accounts, student CSV imports, teacher assignments, role-based reports, and encrypted biometric templates.

## Local setup

Use Node.js 24 and MySQL. Create a local attendance database and an application user, then set the MySQL credentials and a dedicated biometric key in `backend/.env`. Generate the key with `openssl rand -hex 32`.

```sh
cd backend
npm ci
cp .env.example .env
# Edit .env with your local settings.
npm start
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000` and sign in with the configured admin account. To create students, enter their USN, department, and semester. Section is optional. Student CSV imports use the same fields.

## Reports and biometric storage

The attendance target defaults to 75%. Reports use up to 90 days and infer attendance days from check-ins in the student's current department, semester, and section. Forecasts require five observed days. Teachers see assigned students.

Biometric templates expire after 180 days by default. Set `BIOMETRIC_RETENTION_DAYS` and `ATTENDANCE_TARGET_PERCENT` in the backend environment. Keep the biometric key backed up securely. Use the admin dashboard to review the biometric audit log.

See the [Vercel deployment guide](./MYSQL_DEPLOYMENT.md) for hosted MySQL, project settings, and deployment checks.
