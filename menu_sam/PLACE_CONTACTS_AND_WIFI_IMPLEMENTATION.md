# Place Contacts, WiFi, and Banner Implementation ✅

## Overview

Added support for:
1. **Place Contacts** - Multiple contact types (mobile, WhatsApp, email, social media, etc.)
2. **WiFi Information** - WiFi network name and code
3. **Banner Images** - Separate banner image field (banniereImg)

## Database Changes

### 1. New Table: `place_contacts`

**Prisma Model:**
```prisma
model PlaceContact {
  id        Int     @id @default(autoincrement())
  placeId   Int     @map("place_id")
  type      String  // 'mobile','whatsapp','fixe','email','site','facebook','instagram','twitter','waze','tiktok','snapchat'
  value     String  // The actual contact value (phone, email, URL, username, etc.)
  priority  Int     @default(0) // Order of display
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  place Place @relation(fields: [placeId], references: [placeId], onDelete: Cascade)

  @@unique([placeId, type])
  @@index([placeId])
  @@map("place_contacts")
}
```

**SQL to Create Table:**
```sql
CREATE TABLE place_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  place_id INT NOT NULL,
  type VARCHAR(255) NOT NULL,
  value VARCHAR(500) NOT NULL,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_place_type (place_id, type),
  FOREIGN KEY (place_id) REFERENCES place(place_id) ON DELETE CASCADE,
  INDEX idx_place_id (place_id)
);
```

### 2. Updated Place Model

**Added Relations:**
```prisma
contacts PlaceContact[]  // New relation to contacts table
```

**Existing Fields:**
```prisma
banniereImg        String?  @map("banniere_img")      // Already exists
nomReseauWifi      String?  @map("nom_reseau_wifi")   // Already exists
codeWifi           String?  @map("code_wifi")         // Already exists
```

## Contact Types

The `PlaceContact.type` field supports 11 contact types:

| Type | Purpose | Example Value |
|------|---------|--------|
| `mobile` | Mobile phone | +212 612 345 678 |
| `whatsapp` | WhatsApp number | +212 612 345 678 |
| `fixe` | Fixed/landline phone | +212 524 123 456 |
| `email` | Email address | contact@restaurant.com |
| `site` | Website URL | https://restaurant.com |
| `facebook` | Facebook page/username | restaurant_name |
| `instagram` | Instagram handle | @restaurant_name |
| `twitter` | Twitter handle | @restaurant_name |
| `waze` | Waze location | 31.6295,-8.0077 |
| `tiktok` | TikTok handle | @restaurant_name |
| `snapchat` | Snapchat username | restaurant_name |

## Frontend Changes

### 1. Updated Hook: `use-establishment-by-slug.ts`

**New Types:**
```typescript
export interface PlaceContact {
  id: number;
  type: "mobile" | "whatsapp" | "fixe" | "email" | "site" | "facebook" | "instagram" | "twitter" | "waze" | "tiktok" | "snapchat";
  value: string;
  priority: number;
}

export interface EstablishmentData {
  // ... existing fields ...
  banniereImg?: string;           // NEW
  nomReseauWifi?: string;         // NEW
  codeWifi?: string;              // NEW
  contacts?: PlaceContact[];      // NEW
}
```

**Updated API Call:**
The endpoint now includes `contacts` in the response, ordered by priority.

### 2. Updated Pages: `Index.tsx` and `Menu.tsx`

**Changes:**
- Now uses `banniereImg` as primary banner image
- Falls back to `img` if `banniereImg` is not set
- `establishment.nomReseauWifi` and `establishment.codeWifi` are available for WiFi info

**Code:**
```typescript
heroImageSrc: getBannerImageUrl(establishment.banniereImg || establishment.img),
```

## Backend API Changes

### Endpoint: `/api/mysql/places/by-slug/:slug`

**Updated Response Includes:**

```json
{
  "placeId": 1,
  "name": "Sur la Table",
  "slug": "sur-la-table",
  "logo": "logo.png",
  "img": "hero.jpg",
  "banniereImg": "banner.jpg",
  "nomReseauWifi": "Restaurant_WiFi",
  "codeWifi": "Welcome123",
  "contacts": [
    {
      "id": 1,
      "type": "mobile",
      "value": "+212 612 345 678",
      "priority": 0
    },
    {
      "id": 2,
      "type": "facebook",
      "value": "restaurant_sur_la_table",
      "priority": 1
    },
    {
      "id": 3,
      "type": "instagram",
      "value": "@sur_la_table",
      "priority": 2
    }
  ],
  "client": { ... }
}
```

**Note:** Contacts are ordered by `priority` (ascending).

## Database Example Data

### Insert Contacts for a Place

```sql
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
```

## Usage Examples

### Frontend: Accessing Contacts

```typescript
const { establishment } = useEstablishmentBySlug(slug);

if (establishment?.contacts) {
  // Display each contact
  establishment.contacts.forEach(contact => {
    console.log(`${contact.type}: ${contact.value}`);
  });
}

// Filter by type
const mobileContacts = establishment?.contacts.filter(c => c.type === 'mobile');
const socialContacts = establishment?.contacts.filter(c => 
  ['facebook', 'instagram', 'twitter', 'tiktok', 'snapchat'].includes(c.type)
);
```

### Frontend: Accessing WiFi

```typescript
const wifiName = establishment?.nomReseauWifi;  // "Restaurant_WiFi"
const wifiCode = establishment?.codeWifi;       // "Welcome123"
```

### Frontend: Accessing Banner Image

```typescript
// Use banniereImg as primary, fall back to img
const bannerUrl = getBannerImageUrl(establishment?.banniereImg || establishment?.img);
```

## Files Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Added PlaceContact model, added contacts relation to Place |
| `client/hooks/use-establishment-by-slug.ts` | Added PlaceContact type, added contacts/banniereImg/WiFi to EstablishmentData |
| `client/pages/Index.tsx` | Updated to use banniereImg for hero image |
| `client/pages/Menu.tsx` | Updated to use banniereImg for hero image |
| `server/routes/mysql-api.ts` | Updated endpoint to include contacts in response |

## Testing

### Test 1: Banner Image Priority
```typescript
// banniereImg takes priority over img
const banner = getBannerImageUrl(establishment?.banniereImg || establishment?.img);
// If banniereImg exists: uses banniereImg
// If banniereImg is null: uses img
```

### Test 2: WiFi Information
```typescript
// Display WiFi credentials
const wifiInfo = {
  network: establishment?.nomReseauWifi,    // "Restaurant_WiFi"
  password: establishment?.codeWifi,        // "Welcome123"
};
```

### Test 3: Contacts Access
```typescript
// All contacts sorted by priority
establishment?.contacts?.forEach(contact => {
  switch (contact.type) {
    case 'mobile':
      // Use as phone number
      break;
    case 'facebook':
      // Use as social media link
      break;
    case 'email':
      // Use as email link
      break;
  }
});
```

## Component Integration (Future)

### Info Pratique Component
Can now display:
- WiFi network name and code
- Social media links from contacts

### Community Block Component  
Can now display:
- Social media icons linked to contacts
- Multiple contact types

### Example Implementation

```typescript
// In a component
const { establishment } = useEstablishmentBySlug(slug);

// Display WiFi
if (establishment?.nomReseauWifi) {
  <div>
    <h3>WiFi: {establishment.nomReseauWifi}</h3>
    <p>Code: {establishment.codeWifi}</p>
  </div>
}

// Display social contacts
const socialContacts = establishment?.contacts?.filter(c =>
  ['facebook', 'instagram', 'twitter'].includes(c.type)
);

{socialContacts?.map(contact => (
  <a key={contact.id} href={`https://${contact.type}.com/${contact.value}`}>
    {contact.type}
  </a>
))}
```

## Best Practices

### Database Maintenance

1. **Unique Contacts per Place:**
   - Only one contact per type per place
   - Use `priority` to order display

2. **Priority Ordering:**
   - Priority 0 = Most important (shown first)
   - Priority 1 = Second important
   - Etc.

3. **Contact Values:**
   - Store raw values (phone, email, username)
   - Let frontend format for display
   - Don't include protocol (https://) in URLs unless necessary

### Frontend Usage

1. **Type Safety:**
   - Use TypeScript enums for contact types
   - Validate types before processing

2. **Display Logic:**
   - Map types to icons/UI components
   - Use priority for ordering
   - Provide fallbacks for missing data

3. **Links:**
   - Build URLs appropriately for each type
   - Example: `tel:+212612345678` for mobile
   - Example: `https://wa.me/212612345678` for WhatsApp

## Migration Notes

If migrating from old system:

```sql
-- Copy old data if it exists in place table
-- Example: if you had facebookIdOuSlug field
INSERT INTO place_contacts (place_id, type, value, priority)
SELECT placeId, 'facebook', facebookIdOuSlug, 0
FROM place
WHERE facebookIdOuSlug IS NOT NULL;
```

## Summary

Your database now supports:
- ✅ Multiple contact types per establishment
- ✅ Ordered display via priority
- ✅ WiFi information
- ✅ Separate banner image field
- ✅ Full API integration
- ✅ Type-safe frontend access

Ready to build contact and WiFi displays in your UI! 🚀
