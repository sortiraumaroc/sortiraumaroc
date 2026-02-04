# Image URLs Configuration ✅

## Overview

The application now uses the SortirAuMaroc CDN for all images:
- **Menu items**: Menu item photos
- **Logos**: Establishment logos (round thumbnails with slug)
- **Banners**: Large establishment banners

## Base URLs

```
Menu Items:  https://www.sortiraumaroc.ma/assets/uploads/menu/{image}
Logos:       https://www.sortiraumaroc.ma/image/round_thumb/{slug}?image={logo}
Banners:     https://www.sortiraumaroc.ma/assets/uploads/banners/{image}
```

## Implementation

### File: `client/lib/image-urls.ts` (NEW)

Created a utility module with three functions:

```typescript
// Build menu item image URL
getMenuItemImageUrl(imageName?: string | null): string

// Build logo URL with slug
getLogoUrl(slug?: string | null, logoName?: string | null): string

// Build banner image URL
getBannerImageUrl(imageName?: string | null): string
```

#### Features:
- ✅ Safe handling of null/undefined values (returns `/placeholder.svg`)
- ✅ Supports already-formed URLs (returns as-is)
- ✅ Constructs full URLs from filenames
- ✅ Uses SortirAuMaroc CDN base URLs

### Example Usage

```typescript
import { getMenuItemImageUrl, getLogoUrl, getBannerImageUrl } from "@/lib/image-urls";

// Menu item image (from database: "pizza.jpg")
getMenuItemImageUrl("pizza.jpg")
// Returns: https://www.sortiraumaroc.ma/assets/uploads/menu/pizza.jpg

// Logo (from database: slug="sur-la-table", logo="logo.png")
getLogoUrl("sur-la-table", "logo.png")
// Returns: https://www.sortiraumaroc.ma/image/round_thumb/sur-la-table?image=logo.png

// Banner (from database: "banner.jpg")
getBannerImageUrl("banner.jpg")
// Returns: https://www.sortiraumaroc.ma/assets/uploads/banners/banner.jpg

// Null/undefined handling
getMenuItemImageUrl(null)
// Returns: /placeholder.svg

// Already-formed URLs
getMenuItemImageUrl("https://example.com/image.jpg")
// Returns: https://example.com/image.jpg (unchanged)
```

## Files Modified

### 1. `client/pages/Index.tsx`

**Changes:**
- ✅ Imported image URL functions
- ✅ Updated MySQL menu item transformation to use `getMenuItemImageUrl()`
- ✅ Updated establishment logo to use `getLogoUrl(slug, logo)`
- ✅ Updated establishment banner to use `getBannerImageUrl(img)`

**Before:**
```typescript
products: mysqlItems.map((item) => ({
  imageSrc: item.img || "/placeholder.svg",  // Raw value
  ...
}));

logoImageSrc: establishment.logo,  // Raw value
heroImageSrc: establishment.img,   // Raw value
```

**After:**
```typescript
products: mysqlItems.map((item) => ({
  imageSrc: getMenuItemImageUrl(item.img),  // Built URL
  ...
}));

logoImageSrc: getLogoUrl(establishment.slug, establishment.logo),  // Built URL
heroImageSrc: getBannerImageUrl(establishment.img),               // Built URL
```

### 2. `client/pages/Menu.tsx`

**Changes:**
- ✅ Imported image URL functions
- ✅ Updated MySQL menu item transformation to use `getMenuItemImageUrl()`
- ✅ Updated establishment logo to use `getLogoUrl(slug, logo)`
- ✅ Updated establishment banner to use `getBannerImageUrl(img)`

**Same changes as Index.tsx**

## Data Flow Example

### Scenario: Menu item with database image

**Database:**
```sql
SELECT menuItemId, title, img, price FROM menu_item;
-- Returns: (101, "Pizza Braisée", "pizza-braisee.jpg", 45.50)
```

**Application Transformation:**
```typescript
const item = {
  menuItemId: 101,
  title: "Pizza Braisée",
  img: "pizza-braisee.jpg",    // ← Raw from DB
  price: 45.50
};

const product = {
  id: "101",
  title: "Pizza Braisée",
  imageSrc: getMenuItemImageUrl("pizza-braisee.jpg"),
  // imageSrc becomes: https://www.sortiraumaroc.ma/assets/uploads/menu/pizza-braisee.jpg
  priceDh: 45.50
};
```

**HTML Output:**
```html
<img src="https://www.sortiraumaroc.ma/assets/uploads/menu/pizza-braisee.jpg" 
     alt="Pizza Braisée" />
```

### Scenario: Establishment with logo and banner

**Database:**
```sql
SELECT placeId, slug, name, logo, img FROM place WHERE slug = 'sur-la-table';
-- Returns: (1, 'sur-la-table', 'Sur la Table', 'logo.png', 'banner.jpg')
```

**Application Transformation:**
```typescript
const establishment = {
  placeId: 1,
  slug: 'sur-la-table',
  name: 'Sur la Table',
  logo: 'logo.png',        // ← Raw from DB
  img: 'banner.jpg'        // ← Raw from DB
};

const venue = {
  name: 'Sur la Table',
  logoImageSrc: getLogoUrl('sur-la-table', 'logo.png'),
  // logoImageSrc becomes: https://www.sortiraumaroc.ma/image/round_thumb/sur-la-table?image=logo.png
  heroImageSrc: getBannerImageUrl('banner.jpg'),
  // heroImageSrc becomes: https://www.sortiraumaroc.ma/assets/uploads/banners/banner.jpg
};
```

**HTML Output:**
```html
<img src="https://www.sortiraumaroc.ma/image/round_thumb/sur-la-table?image=logo.png" 
     alt="Sur la Table" class="logo" />

<img src="https://www.sortiraumaroc.ma/assets/uploads/banners/banner.jpg" 
     alt="Sur la Table" class="banner" />
```

## Testing

### Test 1: Menu Item Images
1. Visit: `/sur-la-table/menu`
2. ✅ Menu item images should load from SortirAuMaroc CDN
3. ✅ Image URLs should be: `https://www.sortiraumaroc.ma/assets/uploads/menu/{image}`

### Test 2: Logo Images
1. Visit: `/sur-la-table`
2. ✅ Logo should load from CDN
3. ✅ Logo URL should be: `https://www.sortiraumaroc.ma/image/round_thumb/sur-la-table?image={logo}`

### Test 3: Banner Images
1. Visit: `/sur-la-table`
2. ✅ Hero banner should load from CDN
3. ✅ Banner URL should be: `https://www.sortiraumaroc.ma/assets/uploads/banners/{image}`

### Test 4: Placeholder Handling
1. If database has NULL logo: `logoImageSrc` = `/placeholder.svg`
2. ✅ Fallback image displays instead of broken image

### Test 5: Already-Formed URLs
1. If database has full URL: `https://example.com/custom.jpg`
2. ✅ URL is used as-is (not wrapped)

## Database Requirements

Ensure database columns contain only **filenames**, not full URLs:

```sql
-- ✅ CORRECT - Just filenames
INSERT INTO place (logo, img) VALUES ('logo.png', 'banner.jpg');
INSERT INTO menu_item (img) VALUES ('pizza.jpg');

-- ❌ INCORRECT - Full URLs should be avoided
INSERT INTO place (logo, img) VALUES ('https://...', 'https://...');
```

The URL building happens in the application, not the database.

## Fallback Behavior

All functions handle missing data gracefully:

```typescript
getMenuItemImageUrl(undefined)  // → /placeholder.svg
getMenuItemImageUrl(null)       // → /placeholder.svg
getMenuItemImageUrl("")         // → /placeholder.svg

getLogoUrl(null, "logo.png")    // → /placeholder.svg
getLogoUrl("slug", null)        // → /placeholder.svg

getBannerImageUrl("")           // → /placeholder.svg
```

## Benefits

✅ **Centralized URL Building** - All image URLs built in one place
✅ **Easy to Update** - Change base URLs in one file
✅ **Type Safe** - TypeScript ensures correct usage
✅ **Fallback Support** - Placeholder images for missing data
✅ **Flexible** - Supports both built URLs and raw URLs
✅ **CDN Integration** - Uses SortirAuMaroc CDN for all assets

## Next Steps (Optional)

1. **Image Optimization:**
   - Implement image lazy loading
   - Add responsive image variants
   - Use WebP format for modern browsers

2. **Performance:**
   - Add CDN caching headers
   - Monitor image load times
   - Optimize image dimensions

3. **SEO:**
   - Ensure alt text is descriptive
   - Implement schema.org image markup

## Reference

- Image URL builder: `client/lib/image-urls.ts`
- Pages using images: `client/pages/Index.tsx`, `client/pages/Menu.tsx`
- Database: Images stored as filenames, not URLs
- CDN: https://www.sortiraumaroc.ma/

## Summary

Your application now properly loads all images from the SortirAuMaroc CDN:
- Menu items use `/assets/uploads/menu/` path
- Logos use `/image/round_thumb/` with slug parameter
- Banners use `/assets/uploads/banners/` path

All image building is centralized and easy to maintain! 🚀
