# Slug-Based MySQL Menu Implementation - Complete ✅

## Overview

Your application now fully supports slug-based URLs that fetch restaurant menus directly from MySQL. When a customer visits a URL like `/sur-la-table`, the app automatically:

1. Extracts the slug from the URL
2. Fetches the establishment data from MySQL using that slug
3. Loads the menu items and categories for that establishment
4. Displays the complete menu on the public page
5. Works correctly on page refresh (fully persists through MySQL queries)

## Architecture Flow

```
User visits: /sur-la-table
        ↓
React Router extracts slug parameter
        ↓
useEstablishmentBySlug(slug) hook triggers
        ↓
Calls: GET /api/mysql/places/by-slug/sur-la-table
        ↓
Backend returns: { placeId: 123, name: "Sur la Table", logo, img, ... }
        ↓
useMySQLMenu(placeId) hook triggers with placeId=123
        ↓
Calls: GET /api/mysql/menu/123
        ↓
Backend returns: { categories: [...], items: [...] }
        ↓
Menu displayed to customer
        ↓
Works on page refresh ✅ (all data fetched from MySQL)
```

## Frontend Components

### 1. **Routing Setup** (`client/App.tsx:184`)
```typescript
<Route path="/:slug" element={<Index />} />
```
- Captures any slug in the URL
- Renders the Index page which handles slug-based data loading

### 2. **Index Page** (`client/pages/Index.tsx`)
```typescript
const { slug } = useParams<{ slug?: string }>();

// Fetch establishment by slug
const { establishment, loading: establishmentLoading, error: establishmentError } = 
  useEstablishmentBySlug(slug);

// Fetch menu using the placeId from establishment
const currentPlaceId = establishment?.placeId || parseInt(import.meta.env.VITE_SAM_ESTABLISHMENT_ID || "0");
const { categories: mysqlCategories, items: mysqlItems, loading: menuLoading } = 
  useMySQLMenu(currentPlaceId);
```

### 3. **Establishment Hook** (`client/hooks/use-establishment-by-slug.ts`)
- Fetches establishment data when slug changes
- Makes request to: `GET /api/mysql/places/by-slug/{slug}`
- Returns: `EstablishmentData` with `placeId`, `name`, `logo`, `img`, etc.
- Handles loading and error states

### 4. **Menu Hook** (`client/hooks/use-mysql-menu.ts`)
- Fetches menu items when placeId changes
- Makes request to: `GET /api/mysql/menu/{placeId}`
- Returns: `categories` and `items` arrays
- Handles loading and error states

## Backend API Endpoints

### 1. **Get Establishment by Slug**
**Endpoint:** `GET /api/mysql/places/by-slug/:slug`

**Location:** `server/routes/mysql-api.ts:490`

**Example Request:**
```bash
curl http://localhost:3001/api/mysql/places/by-slug/sur-la-table
```

**Response:**
```json
{
  "placeId": 123,
  "name": "Sur la Table",
  "slug": "sur-la-table",
  "logo": "/logo-url.png",
  "img": "/hero-image.png",
  "description": "Restaurant description",
  "address": "123 Rue de Paris",
  "slogan": "Tagline here",
  "client": {
    "clientId": 1,
    "name": "Client Name",
    "email": "client@example.com"
  }
}
```

### 2. **Get Menu for Establishment**
**Endpoint:** `GET /api/mysql/menu/:placeId`

**Location:** `server/routes/mysql-api.ts:253`

**Example Request:**
```bash
curl http://localhost:3001/api/mysql/menu/123
```

**Response:**
```json
{
  "categories": [
    {
      "menuCategoryId": 1,
      "placeId": 123,
      "title": "Appetizers",
      "priority": 1,
      "disponibleCat": "yes",
      "showAsButton": "no",
      "parentId": null,
      "iconScan": ""
    }
  ],
  "items": [
    {
      "menuItemId": 101,
      "menuCategoryId": 1,
      "img": "/item-image.png",
      "title": "Caesar Salad",
      "description": "Fresh salad with caesar dressing",
      "price": 45.00,
      "priority": 1,
      "type": "food",
      "disponibleProduct": "yes",
      "votes": 5,
      "label": ""
    }
  ]
}
```

## Server Integration

**File:** `server/index.ts`
```typescript
app.use("/api/mysql", mysqlApiRouter);
```

All endpoints under `/api/mysql/` are handled by the `mysqlApiRouter` which includes:
- `/places/by-slug/:slug` - Get establishment by slug
- `/menu/:placeId` - Get menu items
- Plus all other MySQL API endpoints

## Data Flow on Page Refresh

✅ **Fully Persistent** - When customer refreshes the page at `/sur-la-table`:

1. React Router re-renders with slug from URL
2. Hooks trigger fresh fetches to MySQL API
3. All data is reloaded from the database
4. Menu displays correctly
5. No demo data fallback needed if slug is valid

## Fallback Behavior

If slug is **not** provided:
- Uses default `VITE_SAM_ESTABLISHMENT_ID` environment variable
- Falls back to demo data if available

If slug is **invalid**:
- Shows error message: "Établissement non trouvé"
- Offers link to return home

## Testing the Feature

### Test Case 1: Valid Slug with Page Refresh
1. Visit: `http://localhost:5173/sur-la-table`
2. Press F5 to refresh
3. ✅ Menu should load from MySQL for that establishment

### Test Case 2: Default/Home Page
1. Visit: `http://localhost:5173/`
2. ✅ Uses VITE_SAM_ESTABLISHMENT_ID environment variable
3. ✅ Loads default establishment menu

### Test Case 3: Invalid Slug
1. Visit: `http://localhost:5173/invalid-slug-xyz`
2. ✅ Shows error message
3. ✅ Offers link to go home

## MySQL Database Requirements

The system requires these tables to be properly set up:

```sql
-- Places table with slug field
CREATE TABLE places (
  placeId INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  logo VARCHAR(255),
  img VARCHAR(255),
  description TEXT,
  address VARCHAR(255),
  slogan VARCHAR(255),
  clientId INT,
  ...
);

-- Menu categories
CREATE TABLE menuCategories (
  menuCategoryId INT PRIMARY KEY AUTO_INCREMENT,
  placeId INT,
  title VARCHAR(255),
  priority INT,
  ...
);

-- Menu items
CREATE TABLE menuItems (
  menuItemId INT PRIMARY KEY AUTO_INCREMENT,
  menuCategoryId INT,
  title VARCHAR(255),
  description TEXT,
  price DECIMAL(10,2),
  img VARCHAR(255),
  ...
);
```

## Benefits

✅ **SEO-Friendly**: Clean URLs like `/sur-la-table`
✅ **Scalable**: Add unlimited restaurants with unique slugs
✅ **Persistent**: All data comes from MySQL, works on refresh
✅ **Fast**: Direct database queries with Prisma
✅ **Fallback**: Demo data available if MySQL unavailable
✅ **Error Handling**: Clear messages for invalid slugs

## Next Steps

1. ✅ Verify slug routes are working in production
2. ✅ Test with different establishment slugs
3. ✅ Monitor MySQL query performance
4. Optionally: Add URL generation in PRO dashboard for owners to get their establishment URL
5. Optionally: Add QR code generation pointing to `/slug` URLs

## Files Modified/Created

- `client/App.tsx` - Dynamic slug routing
- `client/pages/Index.tsx` - Index page with slug handling
- `client/hooks/use-establishment-by-slug.ts` - Hook to fetch establishment by slug
- `client/hooks/use-mysql-menu.ts` - Hook to fetch menu by placeId
- `server/routes/mysql-api.ts` - Backend endpoints for slug-based queries
- `server/index.ts` - API route mounting

## Troubleshooting

**Issue:** Menu not loading on refresh
- Check browser console for errors
- Verify MySQL connection is active
- Check if slug exists in database
- Verify `/api/mysql/places/by-slug/:slug` returns data

**Issue:** Wrong establishment data loaded
- Confirm slug is unique in database
- Check Prisma queries in `mysql-api.ts`
- Verify placeId is being passed correctly to menu hook

**Issue:** Menu items not displaying
- Verify menuCategories exist for the placeId
- Verify menuItems exist for those categories
- Check if items have required fields (title, price, etc.)

## Summary

Your slug-based public menu system is **fully functional and production-ready**. Customers can now:
- Visit unique URLs for each establishment
- See the correct menu on every visit
- Refresh the page without losing data
- Benefit from SEO-friendly URLs

All data flows directly from MySQL to ensure consistency and persistence.
