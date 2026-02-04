# XAMPP Local Setup Guide

## 1. Environment Configuration ✅

Your `.env.local` has been updated with the XAMPP credentials:

```env
DATABASE_URL="mysql://root:@localhost:3306/sam_site"
```

**Configuration Details:**
- **Host**: localhost
- **Port**: 3306
- **User**: root
- **Password**: (empty)
- **Database**: sam_site

## 2. Password Migration (Required)

Since your XAMPP database likely stores passwords in **plaintext**, you need to hash them before the login system will work.

### Migration Endpoints Available

Three endpoints have been created to help with password migration:

#### Option 1: Migrate Only Admin Passwords
```bash
POST http://localhost:5173/api/migrate/migrate-admin-passwords
```

Response:
```json
{
  "success": true,
  "message": "Migrated 3 admin password(s) to bcrypt",
  "totalAdmins": 3,
  "migratedCount": 3,
  "details": [
    {
      "adminId": 1,
      "email": "admin@example.com",
      "status": "migrated"
    }
  ]
}
```

#### Option 2: Migrate Only Client Passwords
```bash
POST http://localhost:5173/api/migrate/migrate-client-passwords
```

Response:
```json
{
  "success": true,
  "message": "Migrated 5 client password(s) to bcrypt",
  "totalClients": 5,
  "migratedCount": 5,
  "details": [...]
}
```

#### Option 3: Migrate All Passwords (Recommended)
```bash
POST http://localhost:5173/api/migrate/migrate-all-passwords
```

Response:
```json
{
  "success": true,
  "message": "Password migration complete",
  "stats": {
    "admins": {
      "total": 3,
      "migrated": 3
    },
    "clients": {
      "total": 5,
      "migrated": 5
    }
  }
}
```

### How to Run Migration

**Using curl (recommended for quick testing):**
```bash
curl -X POST http://localhost:5173/api/migrate/migrate-all-passwords
```

**Using JavaScript (fetch):**
```javascript
fetch('http://localhost:5173/api/migrate/migrate-all-passwords', {
  method: 'POST',
})
.then(res => res.json())
.then(data => console.log(data));
```

**Expected Result:**
- All plaintext passwords are converted to bcrypt hashes
- Already-hashed passwords are skipped
- Response shows which users were migrated

## 3. Testing Login

Once passwords are migrated, test the login system:

### Admin Login Test
```bash
curl -X POST http://localhost:5173/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contact@lepetitbraise.com",
    "password": "Petitbraise2025!"
  }'
```

### Client Login Test
```bash
curl -X POST http://localhost:5173/api/auth/client/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "client@example.com",
    "password": "client_password"
  }'
```

### Expected Success Response
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "contact@lepetitbraise.com",
    "type": "admin",
    "name": "Admin Name"
  }
}
```

### Expected Error Response (Before Migration)
If you get a `401` error, it means:
- Password migration hasn't been run, OR
- The email/password combination is incorrect

```json
{
  "error": "Invalid email or password"
}
```

## 4. Browser Testing

1. Start the dev server: `npm run dev`
2. Navigate to your app in the browser
3. Click "Accéder à l'interface PRO" to access the login page
4. Use credentials from your `admin` or `client` table
5. If login fails, check if you've run the password migration

## 5. Troubleshooting

### Issue: "Can't reach database server"
**Solution:**
- Ensure XAMPP MySQL is running (check XAMPP Control Panel)
- Verify `DATABASE_URL` in `.env.local` is correct
- Check if port 3306 is correct

### Issue: "Password still not working after migration"
**Solution:**
- Run the migration endpoint again: `POST /api/migrate/migrate-all-passwords`
- Check if the password in your database matches what you're using
- Verify the password hasn't been changed/overwritten

### Issue: Can see migration endpoint but can't access it
**Solution:**
- Ensure the server is running (`npm run dev`)
- Check the Network tab in browser DevTools for the actual response
- Look for error logs in the terminal

## 6. Database Verification (Optional)

To verify passwords were hashed, you can check your MySQL database:

```sql
-- Check admin passwords (should start with $2b$ if hashed)
SELECT adminId, email, password FROM admin LIMIT 1;

-- Check client passwords (should start with $2b$ if hashed)
SELECT clientId, email, password FROM client LIMIT 1;
```

If passwords start with `$2b$`, they've been successfully hashed.

---

**Next Steps:**
1. ✅ Update `.env.local` (done)
2. ✅ Create migration endpoint (done)
3. 🔄 Run password migration
4. 🔄 Test login in the browser or via API
5. 📝 Proceed to Plesk deployment once verified locally
