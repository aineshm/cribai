import type { Page } from 'playwright';
import type { Log } from 'crawlee';

const MAX_PHOTOS = 5;

/**
 * Extract photo URLs from an Apartments.com detail page.
 * Strategy: JSON-LD > OG meta tag > carousel DOM selectors.
 * Deduplicates and caps at 5 URLs.
 */
export async function extractPhotos(page: Page, log: Log): Promise<string[]> {
  const photos: string[] = [];

  // Strategy 1: JSON-LD (most reliable)
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent({ timeout: 2_000 })
    .catch(() => null);

  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      const images: unknown[] = Array.isArray(data.image)
        ? data.image
        : data.photo?.map((p: { contentUrl?: string }) => p.contentUrl).filter(Boolean)
          ?? (data.image ? [data.image] : []);

      for (const img of images) {
        if (
          typeof img === 'string' &&
          img.startsWith('http') &&
          !photos.includes(img) &&
          photos.length < MAX_PHOTOS
        ) {
          photos.push(img);
        }
      }
    } catch {
      log.debug('Failed to parse JSON-LD for photos');
    }
  }

  // Strategy 2: OG image (hero fallback)
  if (photos.length === 0) {
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute('content', { timeout: 1_000 })
      .catch(() => null);

    if (ogImage && ogImage.startsWith('http') && !photos.includes(ogImage)) {
      photos.push(ogImage);
    }
  }

  // Strategy 3: Carousel DOM elements
  if (photos.length < MAX_PHOTOS) {
    const imgEls = page.locator(
      '.carouselInner img, [data-tag_section="hero"] img, .heroImageContainer img, picture source',
    );
    const count = await imgEls.count();

    for (let i = 0; i < Math.min(count, MAX_PHOTOS * 2); i++) {
      if (photos.length >= MAX_PHOTOS) break;
      const src =
        (await imgEls.nth(i).getAttribute('src').catch(() => null)) ??
        (await imgEls.nth(i).getAttribute('data-src').catch(() => null));

      if (src && src.startsWith('http') && !photos.includes(src)) {
        photos.push(src);
      }
    }
  }

  return photos.slice(0, MAX_PHOTOS);
}
