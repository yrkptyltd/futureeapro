const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'previews', 'web');
const PORT = Number(process.env.PREVIEW_PORT || 3108);
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const serverProcess = spawn(process.execPath, ['src/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  try {
    await waitForServerReady();
    const browser = await chromium.launch({ headless: true });
    try {
      await captureDesktopPreviews(browser);
      await captureMobilePreviews(browser);
    } finally {
      await browser.close();
    }
  } finally {
    serverProcess.kill('SIGTERM');
    await once(serverProcess, 'exit').catch(() => undefined);
  }
}

async function captureDesktopPreviews(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'desktop-01-home.png'),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/platform`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'desktop-02-platform.png'),
    fullPage: true,
  });

  await context.close();
}

async function captureMobilePreviews(browser) {
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'mobile-01-home.png'),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/signin`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'mobile-02-mentor-signin.png'),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/signup`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'mobile-03-mentor-signup.png'),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/platform`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'mobile-04-platform-overview.png'),
    fullPage: true,
  });

  await page.goto(`${BASE_URL}/client`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, 'mobile-05-client-landing.png'),
    fullPage: true,
  });

  await context.close();
}

async function waitForServerReady() {
  const timeoutMs = 30000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Retry until timeout.
    }
    await delay(300);
  }

  throw new Error(`Server did not become ready on ${BASE_URL} within ${timeoutMs}ms.`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
