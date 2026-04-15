const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');
const {
  ensureDataFile,
  ensureMentorPortalIds,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  createRobot,
  listRobotsByMentor,
  updateRobot,
  createLicenseKey,
  listLicenseKeysByMentor,
  updatePortalTheme,
} = require('../src/lib/store');
const { createPasswordHash, normalizeEmail } = require('../src/lib/auth');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'previews', 'mobile');
const PORT = Number(process.env.PREVIEW_PORT || 3107);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RED_THEME = {
  primary: '#ff5f6d',
  secondary: '#ff9f43',
  tertiary: '#9cff57',
  accentPink: '#ff4f7b',
  bgStart: '#0c0609',
  bgEnd: '#1d0c11',
  glow: '#ff7a7a',
};
const PREVIEW_ROBOT_IMAGE_URL = '/assets/robot-preview-user.jpg';
const PREVIEW_ROBOT_NAME = 'Algo Nova EA V6';

const SCENARIOS = [
  {
    prefix: 'ios',
    deviceName: 'iPhone 14',
    clientEmail: 'ios.preview@futureeapro.com',
  },
  {
    prefix: 'android',
    deviceName: 'Pixel 7',
    clientEmail: 'android.preview@futureeapro.com',
  },
];

const STYLE_VARIANTS = [
  {
    slug: 'red-square',
    theme: 'red',
    faceStyle: 'square',
    bgStyle: 'robot',
    bottomShade: 'red',
  },
  {
    slug: 'pink-pill',
    theme: 'pink',
    faceStyle: 'pill',
    bgStyle: 'v2',
    bottomShade: 'pink',
  },
  {
    slug: 'cyan-frame',
    theme: 'cyan',
    faceStyle: 'frame',
    bgStyle: 'v4',
    bottomShade: 'blue',
  },
  {
    slug: 'custom-superpill',
    theme: 'red',
    faceStyle: 'super-pill',
    bgStyle: 'off',
    bottomShade: 'custom',
    customShade: {
      hue: 338,
      sat: 0.73,
      val: 0.98,
    },
  },
  {
    slug: 'violet-capsule',
    theme: 'purple',
    faceStyle: 'capsule',
    bgStyle: 'v3',
    bottomShade: 'purple',
  },
  {
    slug: 'acid-lime-frame',
    theme: 'green',
    faceStyle: 'frame',
    bgStyle: 'off',
    bottomShade: 'custom',
    customShade: {
      hue: 104,
      sat: 0.92,
      val: 1,
    },
  },
  {
    slug: 'laser-orange-rounded',
    theme: 'orange',
    faceStyle: 'rounded',
    bgStyle: 'v1',
    bottomShade: 'custom',
    customShade: {
      hue: 24,
      sat: 0.92,
      val: 1,
    },
  },
  {
    slug: 'cyber-pink-frame',
    theme: 'pink',
    faceStyle: 'frame',
    bgStyle: 'v4',
    bottomShade: 'custom',
    customShade: {
      hue: 322,
      sat: 0.88,
      val: 1,
    },
  },
  {
    slug: 'ice-cyan-pill',
    theme: 'cyan',
    faceStyle: 'pill',
    bgStyle: 'v2',
    bottomShade: 'custom',
    customShade: {
      hue: 190,
      sat: 0.86,
      val: 0.98,
    },
  },
  {
    slug: 'electric-blue-superpill',
    theme: 'blue',
    faceStyle: 'super-pill',
    bgStyle: 'off',
    bottomShade: 'custom',
    customShade: {
      hue: 218,
      sat: 0.9,
      val: 1,
    },
  },
];

async function main() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const mentor = ensurePreviewMentor();
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
      for (const scenario of SCENARIOS) {
        const key = ensureUsableKey(mentor.id, scenario.clientEmail);
        await captureClientFlow(browser, mentor.mentorPortalId, key.key, scenario);
      }
    } finally {
      await browser.close();
    }
  } finally {
    serverProcess.kill('SIGTERM');
    await once(serverProcess, 'exit').catch(() => undefined);
  }
}

function ensurePreviewMentor() {
  ensureDataFile();
  ensureMentorPortalIds();
  updatePortalTheme(RED_THEME);

  const mentorEmail = normalizeEmail('mentor.preview@futureeapro.com');
  let mentor = getUserByEmail(mentorEmail);

  if (!mentor) {
    const passwordData = createPasswordHash('MentorPreview123!');
    mentor = createUser({
      name: 'Neon Mentor',
      email: mentorEmail,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      role: 'mentor',
    });
  }

  updateUser(mentor.id, {
    name: 'Neon Mentor',
    approved: true,
    subscriptionActive: true,
    profileHeadline: 'AI Robot Mentor',
    profileBio: 'Premium bot strategies and automation support.',
  });

  mentor = getUserById(mentor.id);
  const robots = listRobotsByMentor(mentor.id);
  if (!robots.length) {
    createRobot({
      mentorId: mentor.id,
      name: PREVIEW_ROBOT_NAME,
      description: 'Adaptive trading robot with advanced signal scanning.',
      category: 'Forex',
      version: 'v2.4.1',
      status: 'live',
      imageUrl: PREVIEW_ROBOT_IMAGE_URL,
      keyStats: {
        uptimeHours: 923,
        tasksCompleted: 12489,
        successRate: 92.4,
        lastSync: new Date().toISOString(),
      },
    });
  } else {
    for (const robot of robots) {
      if (robot.imageUrl !== PREVIEW_ROBOT_IMAGE_URL || robot.name !== PREVIEW_ROBOT_NAME) {
        updateRobot(robot.id, {
          imageUrl: PREVIEW_ROBOT_IMAGE_URL,
          name: PREVIEW_ROBOT_NAME,
        });
      }
    }
  }

  return getUserById(mentor.id);
}

function ensureUsableKey(mentorId, clientEmail) {
  const normalizedClientEmail = normalizeEmail(clientEmail);
  const keys = listLicenseKeysByMentor(mentorId);
  const reusable = keys.find((item) => {
    const reserved = normalizeEmail(item.reservedClientEmail);
    const redeemed =
      item.status === 'redeemed' || Boolean(item.redeemedAt) || Boolean(item.subscriptionId);
    return !redeemed && (!reserved || reserved === normalizedClientEmail);
  });

  if (reusable) {
    return reusable;
  }

  return createLicenseKey({
    mentorId,
    status: 'available',
    reservedClientEmail: normalizedClientEmail,
  });
}

async function captureClientFlow(browser, mentorPortalId, licenseKey, scenario) {
  const context = await browser.newContext({
    ...devices[scenario.deviceName],
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/client`, { waitUntil: 'networkidle' });
  await page.fill('input[name="mentorPortalId"]', String(mentorPortalId));
  await page.fill('input[name="clientEmail"]', scenario.clientEmail);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-01-landing.png`),
    fullPage: true,
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('form[action="/client/start"] button[type="submit"]'),
  ]);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-02-subscription.png`),
    fullPage: true,
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.locator('form[action="/client/subscribe"] button[type="submit"]').first().click(),
  ]);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-03-unlock.png`),
    fullPage: true,
  });

  await page.fill('input[name="licenseKey"]', String(licenseKey));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('form[action="/client/unlock"] button[type="submit"]'),
  ]);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-04-success.png`),
    fullPage: true,
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click(`a[href^="/client/robot/"]`),
  ]);
  const robotBaseUrl = page.url().split('?')[0];

  await page.goto(`${robotBaseUrl}?section=home`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-05-robot-interface.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=trade`, { waitUntil: 'networkidle' });
  await page.click('button[data-action="start-robot"]');
  await page.waitForSelector('#robot-floating-launcher:not(.is-hidden)', { timeout: 5000 });
  await page.locator('#robot-floating-launcher').click({ force: true });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-06-trade-layout.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=details`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-07-details-layout.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=metrader`, { waitUntil: 'networkidle' });
  await page.selectOption('select[name="brokerName"]', 'Razor Markets');
  await page.fill('input[name="accountNumber"]', '900001');
  await page.fill('input[name="serverName"]', 'RazorMarkets-Live01');
  await page.fill('input[name="notes"]', 'Preview connection');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('form[action$="/metrader/connect"] button[type="submit"]'),
  ]);

  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-08-metrader-layout.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=quotes`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-09-quotes-layout.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=settings`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-10-settings-layout.png`),
    fullPage: true,
  });

  await page.goto(`${robotBaseUrl}?section=metrader`, { waitUntil: 'networkidle' });
  await page.click('[data-platform-choice="MT4"]');
  await page.waitForTimeout(180);
  await page.screenshot({
    path: path.join(PREVIEW_DIR, `${scenario.prefix}-11-mt4-layout.png`),
    fullPage: true,
  });

  await captureStyleVariantPreviews(page, robotBaseUrl, scenario.prefix);

  await context.close();
}

async function captureStyleVariantPreviews(page, robotBaseUrl, prefix) {
  let index = 12;
  for (const variant of STYLE_VARIANTS) {
    await page.goto(`${robotBaseUrl}?section=settings`, { waitUntil: 'networkidle' });
    await applyClientVariantSettings(page, variant);
    await page.goto(`${robotBaseUrl}?section=home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(150);
    await page.screenshot({
      path: path.join(PREVIEW_DIR, `${prefix}-${String(index).padStart(2, '0')}-style-${variant.slug}.png`),
      fullPage: true,
    });
    index += 1;
  }
}

async function applyClientVariantSettings(page, variant) {
  await page.evaluate((settings) => {
    const entries = [
      ['futureeapro.client.theme', settings.theme || 'red'],
      ['futureeapro.client.faceStyle', settings.faceStyle || 'square'],
      ['futureeapro.client.backgroundMode', settings.bgStyle || 'robot'],
      ['futureeapro.client.bottomShade', settings.bottomShade || 'red'],
    ];

    for (const [key, value] of entries) {
      localStorage.setItem(key, String(value));
    }

    if (settings.customShade && settings.bottomShade === 'custom') {
      localStorage.setItem('futureeapro.client.customShadeHue', String(settings.customShade.hue));
      localStorage.setItem('futureeapro.client.customShadeSat', String(settings.customShade.sat));
      localStorage.setItem('futureeapro.client.customShadeVal', String(settings.customShade.val));
    }
  }, variant);

  await page.reload({ waitUntil: 'networkidle' });
}

async function waitForServerReady() {
  const timeoutMs = 30000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/client`);
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
