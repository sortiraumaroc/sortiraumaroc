# Immediate Next Steps

## ✅ What's Been Done

1. **Updated `.env.local`** with your XAMPP credentials:
   - Host: `localhost`
   - User: `root`
   - Password: (empty)
   - Database: `sam_site`

2. **Created password migration endpoint** at `/api/migrate/migrate-all-passwords`
   - Automatically detects plaintext vs bcrypt passwords
   - Only hashes plaintext passwords
   - Skips already-hashed passwords

---

## 🔄 What You Need to Do Now

### Step 1: Start Your Dev Server

If not already running:
```bash
npm run dev
```

The app should be available at `http://localhost:8080`

### Step 2: Migrate Passwords (Run Once)

**Option A - Using Browser Console** (Easy)
1. Open your browser console (F12 → Console)
2. Paste this and press Enter:
```javascript
fetch('http://localhost:5173/api/migrate/migrate-all-passwords', {
  method: 'POST'
})
.then(res => res.json())
.then(data => console.log(data))
```

3. Look for a message like: `"Migrated 3 admin password(s) to bcrypt"`

**Option B - Using curl** (Terminal)
```bash
curl -X POST http://localhost:5173/api/migrate/migrate-all-passwords
```

**Option C - Using a tool like Postman**
- Method: `POST`
- URL: `http://localhost:5173/api/migrate/migrate-all-passwords`
- Click "Send"

### Step 3: Test Login

You can test login in two ways:

**Option A - Through the App UI**
1. Go to `http://localhost:8080`
2. Scroll to footer → Click "Accéder à l'interface PRO"
3. Try logging in with credentials from your database
   - Email: `contact@lepetitbraise.com`
   - Password: `Petitbraise2025!`

**Option B - Using the API directly** (Terminal)
```bash
curl -X POST http://localhost:5173/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contact@lepetitbraise.com",
    "password": "Petitbraise2025!"
  }'
```

### Step 4: Check for Success ✅

After Step 2, you should see:
```json
{
  "success": true,
  "message": "Migrated X admin password(s) to bcrypt",
  "stats": {...}
}
```

After Step 3, you should see:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "email": "contact@lepetitbraise.com",
    "type": "admin",
    "name": "Admin Name"
  }
}
```

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Can't reach database server" | Make sure XAMPP MySQL is running |
| Migration endpoint shows 404 | Restart dev server with `npm run dev` |
| Login still fails after migration | Verify your credentials are correct in the database |
| Port 5173 not working | Change to whatever port shows in `npm run dev` output |

---

## 📝 Important Notes

- The migration endpoint only needs to run **once**
- Running it multiple times is safe (already-hashed passwords are skipped)
- After migration, all users will be able to log in with their original passwords
- Your passwords in the database will be securely hashed with bcrypt

---

## ✨ Once Login Works

You'll be ready for:
1. Testing the full app locally with your XAMPP database
2. Preparing for production deployment on Plesk
3. Migrating dynamic routes (`/sur-la-table` etc.)

---

## 📚 Full Documentation

For more details, see:
- `XAMPP_SETUP_GUIDE.md` - Detailed setup and migration info
- `PLESK_DEPLOYMENT_GUIDE.md` - When you're ready for production
- `DYNAMIC_ESTABLISHMENT_GUIDE.md` - How URL slugs work
