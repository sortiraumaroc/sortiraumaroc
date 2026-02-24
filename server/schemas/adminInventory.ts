/**
 * Zod Schemas for Admin Inventory Routes
 */

import { z } from "zod";

// POST /api/admin/establishments/:establishmentId/inventory/categories
export const CreateCategorySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  parent_id: z.string().optional().nullable(),
  sort_order: z.number().optional(),
});

// POST /api/admin/establishments/:establishmentId/inventory/categories/:categoryId
export const UpdateCategorySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

// POST /api/admin/establishments/:establishmentId/inventory/items
export const CreateItemSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  base_price: z.number().optional(),
  category_id: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

// POST /api/admin/establishments/:establishmentId/inventory/items/:itemId
export const UpdateItemSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  base_price: z.number().optional().nullable(),
  currency: z.string().optional(),
  category_id: z.string().optional().nullable(),
  labels: z.array(z.string()).optional(),
  photos: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  visible_when_unavailable: z.boolean().optional(),
  scheduled_reactivation_at: z.string().optional().nullable(),
  meta: z.any().optional().nullable(),
  variants: z.array(z.object({
    title: z.string().optional().nullable(),
    quantity: z.number().optional().nullable(),
    unit: z.string().optional().nullable(),
    price: z.number(),
    currency: z.string().optional(),
    sort_order: z.number().optional(),
    is_active: z.boolean().optional(),
  })).optional(),
});

// POST /api/admin/establishments/:establishmentId/inventory/reorder
export const ReorderItemsSchema = z.object({
  itemIds: z.array(z.string()).min(1),
});

// DELETE /api/admin/establishments/:establishmentId/inventory/images (body)
export const DeleteInventoryImageSchema = z.object({
  url: z.string(),
});

// PATCH /api/admin/establishments/:establishmentId/gallery
export const UpdateGallerySchema = z.object({
  logo_url: z.string().optional().nullable(),
  cover_url: z.string().optional().nullable(),
  cover_meta: z.any().optional(),
  gallery_urls: z.array(z.string()).optional(),
  gallery_meta: z.array(z.any()).optional(),
});

// PATCH /api/admin/establishments/:establishmentId/contact-info
export const UpdateContactInfoSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  website: z.string().optional(),
  email: z.string().optional(),
  mobile: z.string().optional(),
  social_links: z.any().optional(),
  hours: z.any().optional(),
});

// POST /api/admin/ai/extract-menu-file (multipart — establishmentId is in body)
export const ExtractMenuFileSchema = z.object({
  establishmentId: z.string(),
});

// POST /api/admin/inventory/pending-changes/:changeId/approve
export const ApprovePendingChangeSchema = z.object({
  notes: z.string().optional(),
});

// POST /api/admin/inventory/pending-changes/:changeId/reject
export const RejectPendingChangeSchema = z.object({
  notes: z.string().optional(),
});

// PATCH /api/admin/establishments/:establishmentId/profile
export const UpdateProfileSchema = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  universe: z.string().optional(),
  subcategory: z.string().optional(),
});

// PATCH /api/admin/establishments/:establishmentId/tags-services
export const UpdateTagsServicesSchema = z.object({
  specialties: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  ambiance_tags: z.array(z.string()).optional(),
  highlights: z.array(z.string()).optional(),
  booking_enabled: z.boolean().optional(),
  menu_digital_enabled: z.boolean().optional(),
  verified: z.boolean().optional(),
});
