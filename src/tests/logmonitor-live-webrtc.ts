/**
 * E2E test for LogMonitor Live CoBrowse with WebRTC
 * Tests: SDK init → session creation → viewer connect → intervene flow
 */
import { chromium, Browser, BrowserContext, Page } from '@playwright/test';

const BASE_URL = 'https://sanfacheng.cyou';
const VAULT_URL = `${BASE_URL}/vault/`;
const LOGIN_URL = `${BASE_URL}/logmon/login`;
const LIVE_URL = `${BASE_URL}/logmon/live`;
const CREDENTIALS = { username: 'admin', password: 'admin123' };
const TIMEOUT = 60000;

interface TestStep {
  name: string;
  status: 'pending' | 'pass' | 'fail';
  details?: string;
  duration?: number;
}

const results: TestStep[] = [];

function logStep(name: string, status: 'pass' | 'fail', details?: string, duration?: number) {
  const step: TestStep = { name, status, details, duration };
  results.push(step);
  const icon = status === 'pass' ? '✅' : '❌';
  console.log(`${icon} ${name}${duration ? ` (${duration}ms)` : ''}${details ? ` — ${details}` : ''}`);
}

async function runTest() {
  console.log('\n🧪 LogMonitor Live CoBrowse E2E Test\n');
  const startTime = Date.now();

  let browser: Browser | null = null;
  let ctx: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ['camera', 'microphone'],
    });

    // =============================================
    // Step 1: Open Vault page and verify SDK loads
    // =============================================
    const t1 = Date.now();
    const vaultPage = await ctx.newPage();
    const vaultLogs: string[] = [];
    vaultPage.on('console', msg => {
      const text = msg.text();
      if (text.includes('[LogMonitor]') || text.includes('[CoBrowse]') || text.includes('webrtc') || msg.type() === 'error') {
        vaultLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    await vaultPage.goto(VAULT_URL, { waitUntil: 'load', timeout: TIMEOUT });
    await vaultPage.waitForTimeout(5000);

    const sdkStatus = await vaultPage.evaluate(() => ({
      hasLogMonitor: typeof (window as any).LogMonitor !== 'undefined',
      hasRrweb: typeof (window as any).rrweb !== 'undefined',
      hasCobrowse: typeof (window as any).LogMonitor?.cobrowse !== 'undefined',
    }));

    if (sdkStatus.hasLogMonitor && sdkStatus.hasCobrowse) {
      logStep('SDK initialization', 'pass', `LogMonitor=${sdkStatus.hasLogMonitor}, rrweb=${sdkStatus.hasRrweb}, cobrowse=${sdkStatus.hasCobrowse}`, Date.now() - t1);
    } else {
      logStep('SDK initialization', 'fail', JSON.stringify(sdkStatus), Date.now() - t1);
      throw new Error('SDK not initialized');
    }

    // =============================================
    // Step 2: Login to LogMonitor Dashboard
    // =============================================
    const t2 = Date.now();
    const livePage = await ctx.newPage();
    await livePage.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await livePage.fill('input[placeholder*="用户"]', CREDENTIALS.username);
    await livePage.fill('input[type="password"]', CREDENTIALS.password);
    await Promise.all([
      livePage.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      livePage.click('button:has-text("登录")'),
    ]);
    await livePage.waitForTimeout(2000);

    const currentUrl = livePage.url();
    if (!currentUrl.includes('login')) {
      logStep('Dashboard login', 'pass', `Redirected to: ${currentUrl}`, Date.now() - t2);
    } else {
      logStep('Dashboard login', 'fail', 'Still on login page', Date.now() - t2);
      throw new Error('Login failed');
    }

    // =============================================
    // Step 3: Navigate to Live page
    // =============================================
    const t3 = Date.now();
    await livePage.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
    await livePage.waitForTimeout(3000);

    const livePageContent = await livePage.evaluate(() => document.body.innerText);
    const hasLiveContent = livePageContent.includes('实时会话') || livePageContent.includes('在线用户');
    logStep('Live page loads', hasLiveContent ? 'pass' : 'fail', hasLiveContent ? 'Page content correct' : 'Missing expected content', Date.now() - t3);

    // =============================================
    // Step 4: Check sessions appear
    // =============================================
    const t4 = Date.now();
    await livePage.waitForTimeout(5000); // Wait for session to appear

    const sessionCount = await livePage.evaluate(() => document.querySelectorAll('.session-item').length);
    const onlineBadge = await livePage.evaluate(() => {
      const badge = document.querySelector('.online-badge');
      return badge?.textContent || '';
    });

    if (sessionCount > 0) {
      logStep('Live session appears', 'pass', `Sessions: ${sessionCount}, Badge: "${onlineBadge}"`, Date.now() - t4);
    } else {
      logStep('Live session appears', 'fail', `No sessions found. Badge: "${onlineBadge}". Vault logs: ${vaultLogs.slice(-5).join('; ')}`, Date.now() - t4);
      throw new Error('No live sessions');
    }

    // =============================================
    // Step 5: Select session and connect viewer WS
    // =============================================
    const t5 = Date.now();
    const liveLogs: string[] = [];
    livePage.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Live]') || text.includes('webrtc') || msg.type() === 'error') {
        liveLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    await livePage.click('.session-item');
    await livePage.waitForTimeout(5000);

    const wsStatus = await livePage.evaluate(() => {
      const statusEl = document.querySelector('.ws-status');
      return statusEl?.textContent?.trim() || '';
    });

    const isConnected = wsStatus.includes('观看') || wsStatus.includes('实时');
    logStep('Viewer WS connects', isConnected ? 'pass' : 'fail', `Status: "${wsStatus}"`, Date.now() - t5);

    // =============================================
    // Step 6: Verify toolbar buttons
    // =============================================
    const t6 = Date.now();
    const toolbarCheck = await livePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, .btn'));
      return {
        hasIntervene: btns.some(b => b.textContent?.includes('介入')),
        hasFullscreen: btns.some(b => b.textContent?.includes('⛶')),
        hasDisconnect: btns.some(b => b.textContent?.includes('断开')),
      };
    });
    logStep('Toolbar buttons', toolbarCheck.hasIntervene && toolbarCheck.hasFullscreen ? 'pass' : 'fail', JSON.stringify(toolbarCheck), Date.now() - t6);

    // =============================================
    // Step 7: Test intervene flow
    // =============================================
    const t7 = Date.now();

    // Set up dialog handler on vault page to auto-accept screen sharing
    const dialogPromise = vaultPage.evaluate(() => {
      return new Promise<string>((resolve) => {
        // Watch for intervention dialog
        const check = setInterval(() => {
          const dialog = document.getElementById('logmonitor-intervention-dialog');
          if (dialog) {
            clearInterval(check);
            const acceptBtn = document.getElementById('lm-accept');
            if (acceptBtn) {
              acceptBtn.click();
              resolve('accepted');
            } else {
              resolve('dialog-no-accept-btn');
            }
          }
        }, 500);
        // Timeout after 15s
        setTimeout(() => { clearInterval(check); resolve('timeout'); }, 15000);
      });
    });

    // Click intervene button on admin side
    const interveneBtn = await livePage.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button, .btn'));
      return btns.find(b => b.textContent?.includes('介入'));
    });
    if (interveneBtn) {
      await (interveneBtn as any).click();
    }

    // Wait for dialog + user acceptance
    const dialogResult = await dialogPromise;

    if (dialogResult === 'accepted') {
      logStep('Intervention dialog accepted', 'pass', `User clicked accept`, Date.now() - t7);

      // Wait for WebRTC signaling
      await livePage.waitForTimeout(8000);

      // Check Live page state after signaling
      const afterSignaling = await livePage.evaluate(() => {
        const statusEl = document.querySelector('.ws-status');
        const video = document.querySelector('.webrtc-video') as HTMLVideoElement;
        return {
          statusText: statusEl?.textContent?.trim() || '',
          hasVideo: !!video,
          videoSrc: video?.srcObject ? 'has-stream' : 'no-stream',
          webrtcActive: document.querySelector('.webrtc-wrapper')?.querySelector('video') !== null,
        };
      });

      logStep('WebRTC signaling', afterSignaling.hasVideo ? 'pass' : 'fail',
        `Status: "${afterSignaling.statusText}", Video: ${afterSignaling.hasVideo}, Stream: ${afterSignaling.videoSrc}`,
        Date.now() - t7
      );

      // Print relevant logs for debugging
      console.log('\n📋 Vault SDK logs:');
      vaultLogs.filter(l => l.includes('webrtc') || l.includes('offer') || l.includes('SDP')).forEach(l => console.log(`  ${l}`));
      console.log('\n📋 Live dashboard logs:');
      liveLogs.filter(l => l.includes('webrtc') || l.includes('offer') || l.includes('SDP')).forEach(l => console.log(`  ${l}`));

    } else {
      logStep('Intervention dialog', 'fail', `Dialog result: ${dialogResult}`, Date.now() - t7);
      console.log('\n📋 Vault logs (last 10):');
      vaultLogs.slice(-10).forEach(l => console.log(`  ${l}`));
      console.log('\n📋 Live logs (last 10):');
      liveLogs.slice(-10).forEach(l => console.log(`  ${l}`));
    }

    // =============================================
    // Step 8: Take screenshots
    // =============================================
    const t8 = Date.now();
    await vaultPage.screenshot({ path: 'artifacts/logmon-vault-during-intervene.png', fullPage: true }).catch(() => {});
    await livePage.screenshot({ path: 'artifacts/logmon-live-after-intervene.png', fullPage: true });
    logStep('Screenshots captured', 'pass', 'artifacts/logmon-live-after-intervene.png', Date.now() - t8);

    // =============================================
    // Step 9: Verify JWT persistence
    // =============================================
    const t9 = Date.now();
    const token = await livePage.evaluate(() => localStorage.getItem('logmon_token'));
    const tokenValid = !!token && token.length > 20;
    logStep('JWT token in localStorage', tokenValid ? 'pass' : 'fail', token ? `Token length: ${token.length}` : 'No token found', Date.now() - t9);

  } catch (err) {
    console.error('\n💥 Test failed:', (err as Error).message);
  } finally {
    if (browser) await browser.close();
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Test Summary: ${passed}/${results.length} passed, ${failed} failed (${(totalDuration / 1000).toFixed(1)}s)`);
  console.log('='.repeat(60));
  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}${r.details ? ` — ${r.details}` : ''}`);
  });

  return failed === 0;
}

// Run
runTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
