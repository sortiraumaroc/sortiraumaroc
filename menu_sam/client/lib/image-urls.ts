/**
 * Build image URLs from SortirAuMaroc CDN
 * Base URLs:
 * - Menu items: https://www.sortiraumaroc.ma/assets/uploads/menu/{image}
 * - Logo: https://www.sortiraumaroc.ma/image/round_thumb/{slug}?image={logo}
 * - Banner: https://www.sortiraumaroc.ma/assets/uploads/banners/{image}
 */

const BASE_URL = "https://www.sortiraumaroc.ma";

/**
 * Build menu item image URL
 * @param imageName - Image filename (e.g., "menu-item.jpg")
 * @returns Full URL to menu item image
 */
export function getMenuItemImageUrl(imageName?: string | null): string {
  if (!imageName) return "/placeholder.svg";
  // If it's already a full URL, return as-is
  if (imageName.startsWith("http")) return imageName;
  return `${BASE_URL}/assets/uploads/menu/${imageName}`;
}

/**
 * Build logo URL with slug
 * @param slug - Establishment slug (e.g., "sur-la-table")
 * @param logoName - Logo filename (e.g., "logo.png")
 * @returns Full URL to logo
 */
export function getLogoUrl(slug?: string | null, logoName?: string | null): string {
  if (!slug || !logoName) return "/placeholder.svg";
  // If it's already a full URL, return as-is
  if (logoName.startsWith("http")) return logoName;
  return `${BASE_URL}/image/round_thumb/${slug}?image=${logoName}`;
}

/**
 * Build banner image URL
 * @param imageName - Banner image filename (e.g., "banner.jpg")
 * @returns Full URL to banner image
 */
export function getBannerImageUrl(imageName?: string | null): string {
  if (!imageName) return "/placeholder.svg";
  // If it's already a full URL, return as-is
  if (imageName.startsWith("http")) return imageName;
  return `${BASE_URL}/assets/uploads/banners/${imageName}`;
}
