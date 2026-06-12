import { Page } from '@playwright/test';
import { SEOResult } from '../types';
import { logger } from '../utils/logger';

export class SEOChecker {
  constructor(private page: Page) {}

  async runChecks(): Promise<SEOResult> {
    const checks = {
      titleTag: false,
      metaDescription: false,
      h1Presence: false,
      favicon: false,
      viewportMeta: false,
      openGraphTags: false
    };

    try {
      // Check title tag
      const title = await this.page.title();
      checks.titleTag = title.trim().length > 0 && title.length < 60;

      // Check meta description
      const metaDescription = await this.page.$('meta[name="description"]');
      if (metaDescription) {
        const content = await metaDescription.getAttribute('content');
        checks.metaDescription = content ? content.trim().length > 0 && content.length < 160 : false;
      }

      // Check H1 presence
      const h1Count = await this.page.$$eval('h1', h1s => h1s.length);
      checks.h1Presence = h1Count === 1;

      // Check favicon
      const favicon = await this.page.$('link[rel*="icon"]');
      checks.favicon = favicon !== null;

      // Check viewport meta
      const viewport = await this.page.$('meta[name="viewport"]');
      if (viewport) {
        const content = await viewport.getAttribute('content');
        checks.viewportMeta = content ? content.includes('width=') : false;
      }

      // Check Open Graph tags
      const ogTitle = await this.page.$('meta[property="og:title"]');
      const ogDescription = await this.page.$('meta[property="og:description"]');
      const ogImage = await this.page.$('meta[property="og:image"]');
      checks.openGraphTags = !!(ogTitle || ogDescription || ogImage);

    } catch (error) {
      logger.error(`Error running SEO checks: ${error}`);
    }

    const passed = Object.values(checks).every(check => check === true);

    return { passed, checks };
  }

  formatResults(result: SEOResult): string {
    const failed: string[] = [];
    
    if (!result.checks.titleTag) failed.push('Title tag');
    if (!result.checks.metaDescription) failed.push('Meta description');
    if (!result.checks.h1Presence) failed.push('H1 tag');
    if (!result.checks.favicon) failed.push('Favicon');
    if (!result.checks.viewportMeta) failed.push('Viewport meta');
    if (!result.checks.openGraphTags) failed.push('Open Graph tags');

    if (failed.length === 0) return 'All SEO checks passed';
    return `Failed: ${failed.join(', ')}`;
  }
}
