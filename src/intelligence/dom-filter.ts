/**
 * DOM Filter - Filter Playwright DOM snapshots to test-relevant content
 *
 * Removes:
 * - Scripts, styles, hidden elements
 * - Ads, tracking pixels
 * - Navigation, footers (optional)
 *
 * Keeps:
 * - Interactive elements (buttons, inputs, links, forms)
 * - Visible text content
 * - Test-critical elements
 */

import { logger } from '../utils/logger';

/**
 * DOM element structure
 */
interface DOMElement {
  tagName: string;
  attributes: Record<string, string>;
  children: DOMElement[];
  text?: string;
  visible?: boolean;
}

/**
 * Parsed DOM structure with elements wrapper
 */
interface ParsedDOMWithElements {
  elements: DOMElement[];
}

/**
 * Parsed DOM structure (can be object or array)
 */
type ParsedDOM = DOMElement | DOMElement[] | ParsedDOMWithElements;

/**
 * Filter configuration
 */
export interface DOMFilterConfig {
  keepScripts?: boolean;
  keepStyles?: boolean;
  keepNavigation?: boolean;
  keepFooters?: boolean;
  removeAds?: boolean;
  removeTracking?: boolean;
  removeHidden?: boolean;
  customSelectors?: {
    keep?: string[];
    remove?: string[];
  };
}

/**
 * Default filter configuration
 */
const DEFAULT_FILTER_CONFIG: DOMFilterConfig = {
  keepScripts: false,
  keepStyles: false,
  keepNavigation: false,
  keepFooters: false,
  removeAds: true,
  removeTracking: true,
  removeHidden: true,
  customSelectors: undefined,
};

/**
 * DOM Filter class
 */
export class DOMFilter {
  private config: DOMFilterConfig;
  private keyElements: string[] = [];

  constructor(config?: Partial<DOMFilterConfig>) {
    this.config = { ...DEFAULT_FILTER_CONFIG, ...config };
  }

  /**
   * Filter DOM to test-relevant content
   */
  filterDOM(rawDOM: string, task?: string): string {
    try {
      let parsed: ParsedDOM;

      // Try to parse as JSON first (Playwright snapshot format)
      if (rawDOM.trim().startsWith('{') || rawDOM.trim().startsWith('[')) {
        parsed = JSON.parse(rawDOM) as ParsedDOM;
        if (Array.isArray(parsed)) {
          parsed = { elements: parsed };
        }
      } else {
        // Parse as HTML
        parsed = this.parseHTML(rawDOM);
      }

      // Filter based on task
      const filtered = this.filterNode(parsed, task);

      // Convert back to string
      return this.formatFiltered(filtered);
    } catch (error) {
      logger.error(`DOM filter error: ${error}`);
      // Return original if parsing fails
      return this.createMinimalDOM(rawDOM);
    }
  }

  /**
   * Get key elements identified during filtering
   */
  getKeyElements(): string[] {
    return [...this.keyElements];
  }

  /**
   * Filter a single node
   */
  private filterNode(node: ParsedDOM, task?: string): ParsedDOM {
    if (!node || typeof node !== 'object') {
      return node;
    }

    // Handle arrays
    if (Array.isArray(node)) {
      return node.map(child => this.filterNode(child, task)).filter(Boolean) as DOMElement[];
    }

    // Handle different node structures
    if ((node as DOMElement).tagName) {
      return this.filterElement(node as DOMElement, task);
    }

    // Handle generic objects
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (this.shouldKeepKey(key)) {
        filtered[key] = this.filterNode(value as ParsedDOM, task);
      }
    }
    return filtered as unknown as ParsedDOM;
  }

  /**
   * Filter an element
   */
  private filterElement(element: DOMElement, task?: string): DOMElement | null {
    const tagName = (element.tagName || '').toLowerCase();
    const attrs = element.attributes || {};

    // Check if element should be removed
    if (this.shouldRemoveElement(element, task)) {
      return null;
    }

    // Track key elements
    if (this.isKeyElement(element)) {
      const selector = this.generateSelector(element);
      if (selector && !this.keyElements.includes(selector)) {
        this.keyElements.push(selector);
      }
    }

    // Filter children
    const filteredChildren: DOMElement[] = [];
    if (element.children && Array.isArray(element.children)) {
      for (const child of element.children) {
        const filtered = this.filterElement(child, task);
        if (filtered) {
          filteredChildren.push(filtered);
        }
      }
    }

    return {
      tagName,
      attributes: this.filterAttributes(attrs),
      text: element.text || '',
      children: filteredChildren,
    };
  }

  /**
   * Check if element should be removed
   */
  private shouldRemoveElement(element: DOMElement, task?: string): boolean {
    const tagName = (element.tagName || '').toLowerCase();
    const attrs = element.attributes || {};
    const className = attrs.class || attrs.className || '';
    const id = attrs.id || '';

    // Remove scripts and styles
    if (!this.config.keepScripts && tagName === 'script') return true;
    if (!this.config.keepStyles && tagName === 'style') return true;

    // Remove hidden elements
    if (this.config.removeHidden) {
      const style = attrs.style || '';
      if (style.includes('display:none') || style.includes('visibility:hidden')) {
        return true;
      }
      if (attrs.hidden === 'true' || attrs['aria-hidden'] === 'true') {
        return true;
      }
    }

    // Remove ads
    if (this.config.removeAds) {
      const adClasses = ['ad', 'advertisement', 'banner', 'promo', 'sponsored'];
      for (const adClass of adClasses) {
        if (className.toLowerCase().includes(adClass) || id.toLowerCase().includes(adClass)) {
          return true;
        }
      }
    }

    // Remove tracking
    if (this.config.removeTracking) {
      const trackingClasses = ['tracking', 'analytics', 'pixel', 'telemetry'];
      for (const trackClass of trackingClasses) {
        if (className.toLowerCase().includes(trackClass) || id.toLowerCase().includes(trackClass)) {
          return true;
        }
      }
    }

    // Remove navigation (optional)
    if (!this.config.keepNavigation) {
      const navTags = ['nav', 'navigation', 'menu'];
      if (navTags.includes(tagName)) return true;
      if (className.toLowerCase().includes('nav') || id.toLowerCase().includes('nav')) {
        return true;
      }
    }

    // Remove footers (optional)
    if (!this.config.keepFooters) {
      if (tagName === 'footer') return true;
      if (className.toLowerCase().includes('footer') || id.toLowerCase().includes('footer')) {
        return true;
      }
    }

    // Custom selectors
    if (this.config.customSelectors?.remove) {
      for (const selector of this.config.customSelectors.remove) {
        if (this.matchesSelector(element, selector)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if element is a key element
   */
  private isKeyElement(element: DOMElement): boolean {
    const tagName = (element.tagName || '').toLowerCase();
    const attrs = element.attributes || {};

    // Interactive elements
    const interactiveTags = [
      'button', 'input', 'select', 'textarea', 'form',
      'a', 'link', 'checkbox', 'radio'
    ];

    if (interactiveTags.includes(tagName)) {
      return true;
    }

    // Elements with test attributes
    if (attrs['data-testid'] || attrs['data-test'] || attrs['data-testid'] || attrs['test-id']) {
      return true;
    }

    // Elements with action-related attributes
    if (attrs.onclick || attrs.onchange || attrs.onsubmit) {
      return true;
    }

    return false;
  }

  /**
   * Filter attributes to keep only relevant ones
   */
  private filterAttributes(attrs: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};

    // Keep important attributes
    const importantAttrs = [
      'id', 'class', 'name', 'type', 'value', 'href',
      'src', 'alt', 'title', 'placeholder', 'data-testid',
      'data-test', 'role', 'aria-label', 'for'
    ];

    for (const [key, value] of Object.entries(attrs)) {
      if (importantAttrs.includes(key) || key.startsWith('data-')) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Check if key should be kept
   */
  private shouldKeepKey(key: string): boolean {
    const skipKeys = ['script', 'style', 'tracking', 'analytics'];
    return !skipKeys.some(skip => key.toLowerCase().includes(skip));
  }

  /**
   * Generate selector for element
   */
  private generateSelector(element: DOMElement): string {
    const tagName = (element.tagName || '').toLowerCase();
    const attrs = element.attributes || {};

    // Try data-testid first
    if (attrs['data-testid']) {
      return `[data-testid="${attrs['data-testid']}"]`;
    }

    // Try id
    if (attrs.id) {
      return `#${attrs.id}`;
    }

    // Try class
    if (attrs.class) {
      return `${tagName}.${attrs.class.split(' ')[0]}`;
    }

    // Fallback to tag name
    return tagName;
  }

  /**
   * Check if element matches selector
   */
  private matchesSelector(element: DOMElement, selector: string): boolean {
    const tagName = (element.tagName || '').toLowerCase();
    const attrs = element.attributes || {};

    // Simple selector matching
    if (selector.startsWith('#')) {
      return attrs.id === selector.substring(1);
    }

    if (selector.startsWith('.')) {
      const className = selector.substring(1);
      return (attrs.class || '').split(' ').includes(className);
    }

    if (selector.startsWith('[')) {
      const match = selector.match(/\[([^=]+)(?:="([^"]*)")?\]/);
      if (match) {
        const attrName = match[1];
        const attrValue = match[2];
        if (attrValue) {
          return attrs[attrName] === attrValue;
        }
        return attrs[attrName] !== undefined;
      }
    }

    return tagName === selector;
  }

  /**
   * Parse HTML to structured format
   */
  private parseHTML(html: string): ParsedDOM {
    // Simple HTML parser
    const elements: DOMElement[] = [];
    const regex = /<(\w+)([^>]*)>([^<]*)/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const [, tagName, attrsStr, text] = match;
      const attributes = this.parseAttributes(attrsStr);

      elements.push({
        tagName,
        attributes,
        text: text.trim(),
        children: [],
      });
    }

    return { elements };
  }

  /**
   * Parse attributes string
   */
  private parseAttributes(attrsStr: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const regex = /(\w+)=["']([^"']*)["']/g;
    let match;

    while ((match = regex.exec(attrsStr)) !== null) {
      const [, name, value] = match;
      attributes[name] = value;
    }

    return attributes;
  }

  /**
   * Format filtered DOM
   */
  private formatFiltered(filtered: ParsedDOM): string {
    // Convert back to string representation
    if ('elements' in filtered && Array.isArray((filtered as ParsedDOMWithElements).elements)) {
      return (filtered as ParsedDOMWithElements).elements.map((el: DOMElement) => this.formatElement(el, 0)).join('\n');
    }

    if (Array.isArray(filtered)) {
      return filtered.map((el: DOMElement) => this.formatElement(el, 0)).join('\n');
    }

    return this.formatElement(filtered as DOMElement, 0);
  }

  /**
   * Format single element
   */
  private formatElement(element: DOMElement, depth: number): string {
    const indent = '  '.repeat(depth);
    const tagName = element.tagName || '?';
    const attrs = element.attributes || {};
    const text = element.text || '';

    // Format attributes
    const attrsStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');

    let output = `${indent}<${tagName}${attrsStr ? ' ' + attrsStr : ''}>`;

    if (text) {
      output += text;
    }

    if (element.children && element.children.length > 0) {
      output += '\n';
      for (const child of element.children) {
        output += this.formatElement(child, depth + 1);
      }
      output += `${indent}</${tagName}>\n`;
    } else {
      output += `</${tagName}>\n`;
    }

    return output;
  }

  /**
   * Create minimal DOM when parsing fails
   */
  private createMinimalDOM(original: string): string {
    // Extract just the visible text and basic structure
    const textOnly = original
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, match => {
        const tagName = match.match(/<(\w+)/)?.[1]?.toLowerCase();
        if (['button', 'input', 'select', 'textarea', 'form', 'a'].includes(tagName || '')) {
          return match;
        }
        return '';
      });

    return textOnly;
  }
}

/**
 * Default DOM filter instance
 */
export const defaultDOMFilter = new DOMFilter();