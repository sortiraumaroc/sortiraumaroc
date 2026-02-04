# Implementation Guide: Place Contacts, WiFi & Banner ✅

## What Has Been Implemented

### 1. **Database Schema Updates** ✅
- Added `PlaceContact` model to Prisma schema
- Added relation from `Place` to `PlaceContact`
- Existing fields verified: `banniereImg`, `nomReseauWifi`, `codeWifi`

### 2. **Frontend Hooks** ✅
- Updated `use-establishment-by-slug.ts` to fetch contacts
- Added new types: `PlaceContact`, updated `EstablishmentData`
- New fields available: `banniereImg`, `nomReseauWifi`, `codeWifi`, `contacts`

### 3. **Backend API** ✅
- Updated `/api/mysql/places/by-slug/:slug` endpoint
- Now includes contacts in response (ordered by priority)

### 4. **Pages** ✅
- `Index.tsx`: Uses `banniereImg` with fallback to `img`
- `Menu.tsx`: Uses `banniereImg` with fallback to `img`

## What Still Needs to Be Done

### Step 1: Create Database Migration

Run the migration to create the `place_contacts` table:

```bash
# Option A: Manual SQL (if you have direct MySQL access)
mysql -u root -p sam_site < prisma/migrations/add_place_contacts_and_banner.sql

# Option B: Using Prisma (recommended)
npx prisma migrate deploy
```

### Step 2: Populate Contact Data

Add contact data for your establishments:

```sql
-- For example, for place_id = 1 (Sur la Table)

-- Mobile phone
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'mobile', '+212 612 345 678', 0);

-- WhatsApp
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'whatsapp', '+212 612 345 678', 1);

-- Email
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'email', 'contact@sur-la-table.ma', 2);

-- Facebook
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'facebook', 'sur_la_table_marrakech', 3);

-- Instagram
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'instagram', '@sur_la_table', 4);

-- Website
INSERT INTO place_contacts (place_id, type, value, priority) 
VALUES (1, 'site', 'https://sur-la-table.ma', 5);

-- WiFi info (in place table, not place_contacts)
UPDATE place SET nomReseauWifi = 'Restaurant_WiFi', codeWifi = 'Welcome123' WHERE placeId = 1;

-- Banner image (in place table)
UPDATE place SET banniereImg = 'banner-sur-la-table.jpg' WHERE placeId = 1;
```

### Step 3: Verify Data Access

Check that data is accessible via API:

```bash
# Visit this URL in your browser:
http://localhost:5173/api/mysql/places/by-slug/sur-la-table

# Should return JSON with:
# {
#   "placeId": 1,
#   "contacts": [
#     { "id": 1, "type": "mobile", "value": "+212 612 345 678", "priority": 0 },
#     ...
#   ],
#   "nomReseauWifi": "Restaurant_WiFi",
#   "codeWifi": "Welcome123",
#   "banniereImg": "banner-sur-la-table.jpg"
# }
```

### Step 4: Frontend Components (Optional - for displaying contacts)

Create or update components to display:

**Example 1: WiFi Info Component**
```typescript
// In Info Pratique component
const { establishment } = useEstablishmentBySlug(slug);

if (establishment?.nomReseauWifi) {
  return (
    <div className="wifi-section">
      <h3>WiFi disponible</h3>
      <p>Réseau: {establishment.nomReseauWifi}</p>
      <p>Code: {establishment.codeWifi}</p>
    </div>
  );
}
```

**Example 2: Social Contacts Component**
```typescript
// Display social media links
const socialContacts = establishment?.contacts?.filter(c =>
  ['facebook', 'instagram', 'twitter', 'tiktok', 'snapchat'].includes(c.type)
);

{socialContacts?.map(contact => {
  const getUrl = () => {
    switch (contact.type) {
      case 'facebook':
        return `https://facebook.com/${contact.value}`;
      case 'instagram':
        return `https://instagram.com/${contact.value}`;
      // etc.
    }
  };

  return (
    <a key={contact.id} href={getUrl()} target="_blank">
      {contact.type}
    </a>
  );
})}
```

**Example 3: All Contacts Display**
```typescript
// Display all contacts with appropriate formatting
{establishment?.contacts?.map(contact => {
  const getDisplay = () => {
    switch (contact.type) {
      case 'mobile':
      case 'whatsapp':
      case 'fixe':
        return <a href={`tel:${contact.value}`}>{contact.value}</a>;
      case 'email':
        return <a href={`mailto:${contact.value}`}>{contact.value}</a>;
      case 'site':
        return <a href={contact.value} target="_blank">{contact.value}</a>;
      case 'waze':
        return <a href={`https://waze.com/ul?ll=${contact.value}`}>Waze</a>;
      default:
        return <span>{contact.value}</span>;
    }
  };

  return (
    <div key={contact.id} className="contact-item">
      <span className="type">{contact.type}:</span>
      {getDisplay()}
    </div>
  );
})}
```

## Contact Type Reference

### Phone/Messaging Types
- **`mobile`** - Mobile/cellular phone number
  - Format: +212 612 345 678 or 0612 345 678
  - Action: `tel:+212612345678`

- **`whatsapp`** - WhatsApp number
  - Format: +212 612 345 678
  - Action: `https://wa.me/212612345678`

- **`fixe`** - Fixed/landline phone
  - Format: +212 524 123 456
  - Action: `tel:+212524123456`

### Digital Contact Types
- **`email`** - Email address
  - Format: contact@restaurant.ma
  - Action: `mailto:contact@restaurant.ma`

- **`site`** - Website URL
  - Format: https://restaurant.ma
  - Action: Open in browser

### Social Media Types
- **`facebook`** - Facebook page name
  - Format: restaurant_page or restaurant_id
  - Action: `https://facebook.com/{value}`

- **`instagram`** - Instagram handle
  - Format: @restaurant or restaurant_handle
  - Action: `https://instagram.com/{value}`

- **`twitter`** - Twitter handle
  - Format: @restaurant or restaurant_handle
  - Action: `https://twitter.com/{value}`

- **`tiktok`** - TikTok handle
  - Format: @restaurant or restaurant_handle
  - Action: `https://tiktok.com/@{value}`

- **`snapchat`** - Snapchat username
  - Format: restaurant_username
  - Action: `https://snapchat.com/add/{value}`

### Location Types
- **`waze`** - Waze coordinates
  - Format: 31.6295,-8.0077
  - Action: `https://waze.com/ul?ll=31.6295,-8.0077`

## Testing Checklist

- [ ] Database migration successful
- [ ] place_contacts table created
- [ ] Contact data inserted for at least one place
- [ ] WiFi info updated in place table
- [ ] Banner image field updated
- [ ] API endpoint returns contacts data
- [ ] Frontend can access establishment.contacts
- [ ] Frontend can access establishment.nomReseauWifi
- [ ] Frontend can access establishment.codeWifi
- [ ] Frontend can access establishment.banniereImg

## SQL Scripts

### Insert Multiple Contacts at Once

```sql
-- Bulk insert contacts for place_id = 1
INSERT INTO place_contacts (place_id, type, value, priority) VALUES
(1, 'mobile', '+212 612 345 678', 0),
(1, 'whatsapp', '+212 612 345 678', 1),
(1, 'email', 'contact@restaurant.ma', 2),
(1, 'facebook', 'restaurant_page', 3),
(1, 'instagram', '@restaurant_handle', 4),
(1, 'twitter', '@restaurant', 5),
(1, 'site', 'https://restaurant.ma', 6);
```

### Update WiFi Info

```sql
UPDATE place 
SET nomReseauWifi = 'Restaurant_WiFi',
    codeWifi = 'Welcome2024',
    banniereImg = 'banner.jpg'
WHERE slug = 'sur-la-table';
```

### View All Contacts for a Place

```sql
SELECT id, type, value, priority 
FROM place_contacts 
WHERE placeId = 1 
ORDER BY priority ASC;
```

### Update Contact Priority

```sql
-- Change order of contacts
UPDATE place_contacts 
SET priority = 0 
WHERE placeId = 1 AND type = 'mobile';
```

## Files Reference

| File | Status | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | ✅ Updated | PlaceContact model added |
| `client/hooks/use-establishment-by-slug.ts` | ✅ Updated | Types and contact fetching |
| `client/pages/Index.tsx` | ✅ Updated | Uses banniereImg |
| `client/pages/Menu.tsx` | ✅ Updated | Uses banniereImg |
| `server/routes/mysql-api.ts` | ✅ Updated | Includes contacts in response |
| `prisma/migrations/add_place_contacts_and_banner.sql` | ✅ Created | Database migration |

## Next Steps

1. **Run the migration** to create the table
2. **Add contact data** for your establishments
3. **Verify API** returns the data correctly
4. **Create UI components** to display contacts and WiFi info
5. **Test thoroughly** with real data

## Support

If you encounter issues:
1. Check the migration ran successfully
2. Verify data exists in place_contacts table
3. Check API response includes contacts
4. Verify hook is being called correctly

## Summary

Your system now supports:
- ✅ Multiple contact types per establishment
- ✅ Ordered contact display via priority
- ✅ WiFi network and password info
- ✅ Separate banner image field
- ✅ Full API integration with contacts

Ready to build amazing UI for displaying this information! 🚀
