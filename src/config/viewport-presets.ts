/**
 * Viewport Presets Configuration
 * Provides pre-configured viewport settings for common device types
 */

import type { ViewportConfig } from '../types';

/**
 * Viewport preset with optional user agent
 */
export interface ViewportPreset extends ViewportConfig {
  userAgent?: string;
}

/**
 * Predefined viewport configurations for common devices
 */
export const VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  desktop: {
    name: 'desktop',
    width: 1920,
    height: 1080,
    userAgent: undefined, // Use default desktop user agent
  },
  tablet: {
    name: 'tablet',
    width: 768,
    height: 1024,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  'tablet-landscape': {
    name: 'tablet-landscape',
    width: 1024,
    height: 768,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  mobile: {
    name: 'mobile',
    width: 375,
    height: 812,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  'mobile-small': {
    name: 'mobile-small',
    width: 320,
    height: 568,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  laptop: {
    name: 'laptop',
    width: 1366,
    height: 768,
    userAgent: undefined,
  },
};

/**
 * Get viewport configuration by preset name
 * @param name - The preset name (e.g., 'desktop', 'tablet', 'mobile')
 * @returns The viewport preset configuration
 * @throws Error if preset name is not found
 */
export function getViewportConfig(name: string): ViewportPreset {
  const preset = VIEWPORT_PRESETS[name];
  if (!preset) {
    const available = getAllPresets().join(', ');
    throw new Error(`Unknown viewport preset: "${name}". Available presets: ${available}`);
  }
  return preset;
}

/**
 * Get all available preset names
 * @returns Array of preset names
 */
export function getAllPresets(): string[] {
  return Object.keys(VIEWPORT_PRESETS);
}

/**
 * Check if a given name is a valid preset
 * @param name - The preset name to check
 * @returns True if the preset exists
 */
export function isPreset(name: string): boolean {
  return name in VIEWPORT_PRESETS;
}

/**
 * Resolve viewport configuration
 * If input is a string, treats it as a preset name and returns the preset config
 * If input is an object, returns it as-is (with validation)
 * @param viewport - Viewport preset name or custom config
 * @returns Resolved viewport configuration
 */
export function resolveViewport(viewport: string | ViewportPreset): ViewportPreset {
  if (typeof viewport === 'string') {
    return getViewportConfig(viewport);
  }
  // Validate custom viewport config
  if (!viewport.width || !viewport.height) {
    throw new Error('Custom viewport must have width and height');
  }
  return viewport;
}
