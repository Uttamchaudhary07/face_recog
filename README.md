# Smart Attendance System

A web app for recording student attendance with a webcam, a barcode, or a university seat number (USN). Administrators manage accounts, teachers monitor assigned students, and students can view their attendance and download a personal report.

## What the app does

| Role | What you can do |
| --- | --- |
| Admin | Create accounts individually or by CSV, assign students to teachers, manage face enrollments, review below-target attendance, export check-in logs, and review biometric audit events. |
| Teacher | View below-target attendance and export check-in logs for assigned students. Enroll or reset their face templates. |
| Student | Sign in with an account created by an admin, view your own attendance, and download your report. |

Students can mark attendance from the home page without signing in. Enter the session code shared by staff, then use face recognition, barcode, or USN. Face recognition guides the student through a short head turn, checks lighting, blur, face size, and angle, and rejects uncertain matches. MySQL stores one check-in per student per session, so students can attend multiple subjects on the same day. Reports count sessions individually and display dates in India Standard Time.

Teachers start and close sessions for their assigned subjects from **Attendance Sessions**. Admins can start sessions for any subject, close any session, and assign subjects using **Edit Subjects** on a teacher's account. A session starts immediately and closes at the end of its chosen duration unless staff close it early.

## Run locally

You need **Node.js 24**, npm, and a running MySQL server. Allow webcam access in your browser to test face capture.

### 1. Set up the database and backend

Create a database such as `face_recog` and a MySQL application user with access to it. Then clone the repository and install the backend dependencies.

```sh
git clone https://github.com/Uttamchaudhary07/face_recog.git
cd face_recog/backend
npm ci
cp .env.example .env
```

Edit `backend/.env` with your settings. Generate separate values for `JWT_SECRET` and `BIOMETRIC_ENCRYPTION_KEY` using `openssl rand -hex 32` for each.

| Setting | What to enter |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Local MySQL address, port, and database name. The example uses `127.0.0.1:3306` and `face_recog`. |
| `DB_USER`, `DB_PASSWORD` | Credentials for the MySQL application user. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credentials for the first admin account. Set these before the first start. |
| `JWT_SECRET` | Secret used to sign login tokens. |
| `BIOMETRIC_ENCRYPTION_KEY` | A dedicated 64-character hexadecimal key. Keep it backed up so existing templates remain readable. |

From `backend`, start the API. It prepares the schema and creates the configured admin account on first startup.

```sh
npm start
```

In a second terminal, confirm the API returns a healthy status.

```sh
curl http://localhost:5001/api/health
```

### 2. Start the frontend

From the repository root, run:

```sh
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) and sign in as the configured admin. To build the frontend for production, run `npm run build` from `frontend`.

## Create and assign students

For one account, open **Admin Dashboard → Create User** and select the role. For a student, enter their USN, department, and semester. Section is optional.

For multiple accounts, use **Admin Dashboard → CSV Bulk Import**. The importer updates existing accounts by email, including their password and role. Use batches of up to 500 rows. Here is the format for a student row with test values.

```csv
name,email,password,userid,role,department,semester,section
Example Student,example.student@example.invalid,REPLACE_WITH_TEMP_PASSWORD,TEST001,student,Computer Science,3,A
```

Use the teacher's **Assign Students** action to upload a CSV with a `userid` column containing student USNs. This appends to existing assignments. To enroll a face, an admin opens **Enroll Face** for the student. Teachers can do the same for their assigned students.

## Reports and biometric privacy

- **Reports and alerts.** Students see a full report for the last 90 calendar days, including today. Check-ins count immediately. A missed session counts after it closes, for all students who had accounts when an admin opened it or for students currently assigned to the teacher who opened it. Check-ins from before sessions were introduced are available in the logs. Staff see which students are below the attendance target (75% by default). Student forecasts appear after five counted sessions.
- **Biometric templates.** Face templates are encrypted with AES-256-GCM and used by the backend for matching. The admin dashboard shows enrollment, verification, reset, migration, and expiry events.
- **Retention.** The default is 180 days. Change `BIOMETRIC_RETENTION_DAYS` and `ATTENDANCE_TARGET_PERCENT` in the backend environment. Keep local environment files, student CSVs, exports, and database backups out of Git.

## Deploy to Vercel

One Vercel project serves the Vite frontend and the Express API on the same domain. The API connects to hosted MySQL. Follow the [Vercel deployment guide](./MYSQL_DEPLOYMENT.md) for project setup, TLS, environment variables, database provisioning, and the retention job.
