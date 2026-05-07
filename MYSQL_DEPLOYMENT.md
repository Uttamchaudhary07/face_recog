# MySQL Deployment Guide

## Step 1: Create MySQL Database in aaPanel

1. Go to **Databases** → **MySQL** tab
2. Click **Add Database**
3. Fill in:
   - **Database name**: `face_recog`
   - **Username**: `face_recog`
   - **Password**: `FaceRecog@MySQL2026`
   - **Access**: Localhost
4. Click **Submit**

## Step 2: Upload Files to Server

Upload the entire updated backend folder to:
`/www/wwwroot/sagarjaiswal.dev/facerecognition/backend/`

## Step 3: Install Dependencies

```bash
cd /www/wwwroot/sagarjaiswal.dev/facerecognition/backend
npm install
```

## Step 4: Restart Backend

```bash
pm2 restart face-recog-backend
pm2 logs face-recog-backend --lines 20
```

## Step 5: Verify

Test the API:
```bash
curl https://facerecognition.sagarjaiswal.dev/api/health
```

## Database Will Auto-Create Tables

Sequelize will automatically create the tables when the backend starts:
- `users` table
- `attendances` table

The admin user will be created automatically on first run.

## View Database

Use phpMyAdmin or Adminer (MySQL mode) to view your data:
- Database: `face_recog`
- Tables: `users`, `attendances`
