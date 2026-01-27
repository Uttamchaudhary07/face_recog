# Smart Attendance System (MVP)

Features:
- Signup/login with pending approval
- Admin assigns roles and manages users
- Face attendance via webcam (face-api.js)
- Barcode/ID attendance fallback
- Role-based attendance logs

## Prerequisites
- Node.js 18+
- MongoDB running locally

## Setup

### Backend
```
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend
```
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Default Admin
Set in `.env`:
- `ADMIN_EMAIL` (default `admin@example.com`)
- `ADMIN_PASSWORD` (default `admin123`)

## Face Models
Models live in `frontend/public/models`.

You can download them from the `face-api.js` models repo.
