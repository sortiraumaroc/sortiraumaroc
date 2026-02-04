# Fix: Dynamic Menu Loading by Slug

## Problem
When accessing a URL like `http://localhost:8080/sur-la-table`, the app was still showing the **demo menu** instead of loading the **MySQL menu** for that specific establishment.

## Root Causes Identified

### 1. **Menu Data Not Being Used** (Index.tsx:44)
```typescript
// ❌ BEFORE: Always used demo data regardless of slug
const menu = useLiveMenuData();
```

**Fix:** Created a `useMemo` that:
- Uses MySQL menu data when available (mysqlCategories and mysqlItems)
- Falls back to demo menu only if MySQL data is empty
- Transforms MySQL format to expected MenuProduct/MenuCategory format

```typescript
// ✅ AFTER: Uses MySQL data with proper transformation
const menu = React.useMemo(() => {
  if (mysqlCategories.length > 0 && mysqlItems.length > 0) {
    return {
      status: menuLoading ? "loading" : "ready",
      categories: mysqlCategories.map((cat) => ({
        id: String(cat.menuCategoryId),
        label: cat.title,
      })),
      products: mysqlItems.map((item) => ({
        id: String(item.menuItemId),
        categoryId: String(item.menuCategoryId),
        title: item.title,
        description: item.description || item.note || "",
        priceDh: item.price,
        imageSrc: item.img || "/placeholder.svg",
        badges: [],
        likes: item.votes || 0,
      })),
    };
  }
  return { ...liveMenu, status: liveMenu.status };
}, [mysqlCategories, mysqlItems, menuLoading, liveMenu]);
```

### 2. **API Endpoint Returning Wrong Format** (server/routes/mysql-api.ts:253)
```typescript
// ❌ BEFORE: Only returned categories array
mysqlApiRouter.get("/menu/:placeId", async (req: Request, res: Response) => {
  const categories = await prisma.menuCategory.findMany({...});
  res.json(categories); // Wrong format
});
```

**Fix:** Updated endpoint to return structured response with both categories and items:
```typescript
// ✅ AFTER: Returns { categories, items } structure
mysqlApiRouter.get("/menu/:placeId", async (req: Request, res: Response) => {
  const categories = await prisma.menuCategory.findMany({...});
  const items = await prisma.menuItem.findMany({...});
  res.json({ categories, items }); // Correct format
});
```

### 3. **Establishment Field Mapping** (use-establishment-by-slug.ts)
```typescript
// ❌ BEFORE: Passed raw data without mapping
const data = await response.json();
setEstablishment(data);
```

**Fix:** Properly map database fields to expected structure:
```typescript
// ✅ AFTER: Map fields correctly
const establishment: EstablishmentData = {
  placeId: data.placeId,
  name: data.name,
  slug: data.slug,
  logo: data.logo,
  img: data.img,
  description: data.description,
  address: data.address,
  tagline: data.slogan, // Map slogan → tagline
  client: data.client,
};
setEstablishment(establishment);
```

### 4. **Venue Data Not Mapping Correctly** (Index.tsx:59)
```typescript
// ❌ BEFORE: Didn't properly map establishment fields
const currentVenue = establishment || { ...venueProfile, placeId: currentPlaceId };
```

**Fix:** Transform establishment fields to match venue header expectations:
```typescript
// ✅ AFTER: Proper field mapping for venue header
const currentVenue = establishment
  ? {
      name: establishment.name,
      tagline: establishment.tagline || establishment.name,
      logoImageSrc: establishment.logo,
      logoAlt: establishment.name,
      heroImageSrc: establishment.img,
      heroAlt: establishment.name,
      geoFence: venueProfile.geoFence,
      placeId: establishment.placeId,
    }
  : { ...venueProfile, placeId: currentPlaceId };
```

## How It Works Now

### Data Flow for `/sur-la-table`:

1. **URL Parsing**
   - User visits: `http://localhost:8080/sur-la-table`
   - React Router extracts: `slug = "sur-la-table"`

2. **Establishment Lookup**
   - `useEstablishmentBySlug` fetches: `GET /api/mysql/places/by-slug/sur-la-table`
   - Returns place data with `placeId` and other info

3. **Menu Fetching**
   - `useMySQLMenu` uses the `placeId` to fetch: `GET /api/mysql/menu/{placeId}`
   - Returns: `{ categories: [...], items: [...] }`

4. **Data Transformation**
   - useMemo converts MySQL format → MenuProduct/MenuCategory format
   - Includes handling for missing fields (img → /placeholder.svg)

5. **Display**
   - VenueHeader shows establishment name, logo, hero image
   - Menu displays categories and products from MySQL
   - ChatDrawer has correct context with MySQL data

## Testing

### Test 1: Verify Establishment Load
Open browser console and check:
```javascript
// Should show establishment data
console.log(establishment);
// Output: { placeId: 1, name: "sur-la-table", slug: "sur-la-table", ... }
```

### Test 2: Verify Menu Load
Check Network tab:
- `GET /api/mysql/places/by-slug/sur-la-table` → 200 with establishment data
- `GET /api/mysql/menu/1` → 200 with `{ categories: [...], items: [...] }`

### Test 3: Visual Verification
- Establishment name displays (from MySQL)
- Menu items display (from MySQL, not demo)
- Category names match MySQL data
- Product descriptions show (from MySQL)

## Files Modified

1. **client/pages/Index.tsx**
   - Lines 39-68: Menu data transformation logic
   - Lines 84-95: Establishment to venue mapping

2. **server/routes/mysql-api.ts**
   - Lines 252-267: Menu endpoint returning proper structure

3. **client/hooks/use-establishment-by-slug.ts**
   - Lines 45-60: Proper field mapping for establishment data

## Fallback Behavior

If slug is invalid or MySQL data is unavailable:
- Establishment error is shown with 404 message
- Or falls back to demo menu (VITE_SAM_ESTABLISHMENT_ID environment variable)

---

**Status:** ✅ All fixes implemented and ready for testing
