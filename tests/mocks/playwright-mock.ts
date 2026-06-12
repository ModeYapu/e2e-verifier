/**
 * Mock for @playwright/test and playwright modules
 * These modules have runtime conflicts with Jest, so we provide a lightweight mock
 */

// Mock Page
class MockPage {
  async goto() { return null; }
  async waitForLoadState() { return null; }
  async screenshot() { return Buffer.from('mock-screenshot'); }
  async evaluate() { return null; }
  async $$() { return []; }
  async $() { return null; }
  async content() { return '<html><body>Mock Page</body></html>'; }
  async title() { return 'Mock Page'; }
  close() { return Promise.resolve(); }
  on() { return null; }
  url() { return 'https://example.com'; }
  async waitForSelector() { return null; }
  async waitForTimeout() { return null; }
  context() { return new MockBrowserContext(); }
  async addInitScript() { return null; }
  async setViewportSize() { return null; }
  async evaluateHandle() { return null; }
  async $eval() { return null; }
  async $$eval() { return null; }
  async click() { return null; }
  async fill() { return null; }
  async type() { return null; }
  async press() { return null; }
  async waitForFunction() { return null; }
  async waitForURL() { return null; }
  async goBack() { return null; }
  async goForward() { return null; }
  async reload() { return null; }
  locator() { return { count: async () => 0, first: () => null, all: () => [] }; }
  frame() { return null; }
  frames() { return []; }
  mainFrame() { return this; }
  childFrames() { return []; }
  async setContent() { return null; }
  async waitForNavigation() { return null; }
  isClosed() { return false; }
}

// Mock BrowserContext
class MockBrowserContext {
  async newPage() { return new MockPage(); }
  async close() { return null; }
  pages() { return []; }
  browser() { return new MockBrowser(); }
  async cookies() { return []; }
  async setCookies() { return null; }
  async clearCookies() { return null; }
  async grantPermissions() { return null; }
  async setGeolocation() { return null; }
  async setOffline() { return null; }
  async addInitScript() { return null; }
  route() { return null; }
  unroute() { return null; }
  async request() { return null; }
}

// Mock Browser
class MockBrowser {
  async newContext() { return new MockBrowserContext(); }
  async newPage() { return new MockPage(); }
  contexts() { return []; }
  async close() { return null; }
  isConnected() { return true; }
  version() { return '1.0.0'; }
  on() { return null; }
  removeListener() { return null; }
}

// Export mock objects
export const chromium = {
  launch: async () => new MockBrowser(),
  connect: async () => new MockBrowser(),
  execArgv: () => [],
};

export const firefox = {
  launch: async () => new MockBrowser(),
  connect: async () => new MockBrowser(),
};

export const webkit = {
  launch: async () => new MockBrowser(),
  connect: async () => new MockBrowser(),
};

export const browsers = ['chromium', 'firefox', 'webkit'];

export const devices = {};

export type Browser = MockBrowser;
export type Page = MockPage;
export type BrowserContext = MockBrowserContext;

// Default export
export default {
  chromium,
  firefox,
  webkit,
  browsers,
  devices,
};
