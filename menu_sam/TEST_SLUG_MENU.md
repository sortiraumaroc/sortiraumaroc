# Quick Test Guide: Slug-Based Menu Loading

## Prerequisites

1. ✅ Dev server running (`npm run dev`)
2. ✅ XAMPP MySQL running with `sam_site` database
3. ✅ Database has a `place` record with:
   - A `slug` value (e.g., `"sur-la-table"`)
   - Corresponding menu categories in `menu_category` table
   - Menu items in `menu_item` table

## Step 1: Check Your Database

Open MySQL and verify your data:

```sql
-- Check available places and their slugs
SELECT placeId, name, slug FROM place LIMIT 5;

-- Example output:
-- | placeId | name | slug |
-- | 1 | Le Petit Braisé | sur-la-table |

-- Check menu categories for place ID 1
SELECT menuCategoryId, title FROM menu_category WHERE placeId = 1 LIMIT 5;

-- Check menu items
SELECT menuItemId, title, price FROM menu_item 
WHERE menuCategoryId IN (SELECT menuCategoryId FROM menu_category WHERE placeId = 1)
LIMIT 5;
```

**Note:** If the `slug` column is NULL or missing entries, you'll need to populate it first. See section "Adding Slugs to Database" below.

## Step 2: Test via URL

### Test 1: Direct URL Access
```
http://localhost:8080/sur-la-table
```

**Expected Result:**
- Page loads without "Établissement non trouvé" error
- Establishment name displays in header
- Menu items appear (NOT the demo menu)
- Products have correct prices and descriptions from MySQL

### Test 2: Check Browser Console
Open DevTools (F12) → Console tab:

```javascript
// You should see the establishment data being loaded
// Check Network tab for these requests:
// GET /api/mysql/places/by-slug/sur-la-table → 200
// GET /api/mysql/menu/{placeId} → 200
```

### Test 3: Verify Menu Data
In browser console, check the menu data:

```javascript
// Should show MySQL data with categories and products
const categories = document.querySelectorAll('[data-category]');
categories.forEach(cat => console.log(cat.textContent));

// Should show items from MySQL, not demo items
const products = document.querySelectorAll('[data-product]');
products.forEach(prod => console.log(prod.querySelector('h3').textContent));
```

## Step 3: Test API Endpoints Directly

### Test Establishment Endpoint
```bash
curl http://localhost:5173/api/mysql/places/by-slug/sur-la-table
```

**Expected Response:**
```json
{
  "placeId": 1,
  "name": "Le Petit Braisé",
  "slug": "sur-la-table",
  "logo": "logo-url.png",
  "img": "hero-image.png",
  "slogan": "Spécialité poulet braisé",
  "description": "...",
  "address": "...",
  "client": { "clientId": ..., "name": "..." }
}
```

### Test Menu Endpoint
```bash
curl http://localhost:5173/api/mysql/menu/1
```

**Expected Response:**
```json
{
  "categories": [
    { "menuCategoryId": 1, "title": "Nos menus", "priority": 0, ... },
    { "menuCategoryId": 2, "title": "Poulets", "priority": 1, ... }
  ],
  "items": [
    { "menuItemId": 1, "menuCategoryId": 1, "title": "Menu enfant", "price": 40, ... },
    { "menuItemId": 2, "menuCategoryId": 1, "title": "Menu family", "price": 170, ... }
  ]
}
```

If this returns the wrong format or 404, the fix isn't working correctly.

## Step 4: Test with Different Slugs

If you have multiple establishments with different slugs, test each:

```
http://localhost:8080/slug-1
http://localhost:8080/slug-2
http://localhost:8080/slug-3
```

Each should show:
- ✅ Correct establishment name
- ✅ Correct menu items (not demo)
- ✅ Correct prices and descriptions

## Step 5: Test Error Handling

### Test Invalid Slug
```
http://localhost:8080/nonexistent-slug
```

**Expected Result:**
- ❌ Show error message: "Établissement non trouvé"
- ❌ Show "Retour à l'accueil →" link
- ❌ NOT crash or show demo menu

### Test Missing Menu Data
If a place has no menu categories:
```
http://localhost:8080/slug-without-menu
```

**Expected Result:**
- ✅ Establishment loads
- ✅ Falls back to demo menu (safe fallback)

## Adding Slugs to Database

If your `place` table doesn't have slug values, add them:

```sql
-- Update place records with slug values
UPDATE place SET slug = 'sur-la-table' WHERE placeId = 1;
UPDATE place SET slug = 'le-petit-braise' WHERE placeId = 2;

-- Or generate slugs from names (simple version)
UPDATE place SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), 'é', 'e'));
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Établissement non trouvé" | Slug not in database or typo | Check database: `SELECT * FROM place WHERE slug = 'sur-la-table'` |
| Shows demo menu instead of MySQL | MySQL data not being used | Check API response: `curl http://localhost:5173/api/mysql/menu/1` |
| Menu loads but no items shown | Items query failing | Check: are there menu items in the database for this place? |
| Prices show as 0 or missing | Data mapping issue | Check menu items have `price` column with values |
| Images don't load | Missing `img` field | Verify `menu_item.img` or `place.img` have values |

## Success Checklist

When everything works:
- ✅ Can access `/sur-la-table` without error
- ✅ Establishment name displays correctly
- ✅ Menu categories show (not demo categories)
- ✅ Menu items have MySQL data (correct prices, descriptions)
- ✅ API endpoints return proper JSON structures
- ✅ Invalid slugs show error message

---

Once all tests pass, you're ready to proceed with production deployment! 🚀

For more details, see `SLUG_MENU_FIX_SUMMARY.md`
