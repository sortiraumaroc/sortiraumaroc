/**
 * Update the page favicon with the establishment's logo
 * @param logoUrl - Full URL to the establishment's logo image
 */
export function updateFavicon(logoUrl: string): void {
  // Remove existing favicon links
  const existingLinks = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
  existingLinks.forEach(link => {
    if (link.getAttribute('href') !== '/placeholder.svg' || logoUrl !== '/placeholder.svg') {
      link.remove();
    }
  });

  // Create new favicon link
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = logoUrl;
  document.head.appendChild(link);

  // Create Apple touch icon link for mobile browsers
  const appleTouchLink = document.createElement('link');
  appleTouchLink.rel = 'apple-touch-icon';
  appleTouchLink.href = logoUrl;
  document.head.appendChild(appleTouchLink);
}
