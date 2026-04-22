const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const {
  ensureDataFile,
  ensureMentorPortalIds,
  listUsers,
  getPortalTheme,
  updatePortalTheme,
  getStorageStatus,
  getUserById,
  getUserByEmail,
  getMentorByPortalId,
  createUser,
  updateUser,
  listMentors,
  createRobot,
  listRobotsByMentor,
  getRobotById,
  updateRobot,
  createLicenseKey,
  listLicenseKeysByMentor,
  getLicenseKeyByMentorAndKey,
  normalizeLicenseKey,
  formatLicenseKeyForDisplay,
  getLicenseKeyById,
  listLicenseKeys,
  updateLicenseKey,
  createClientSubscription,
  getClientSubscriptionById,
  updateClientSubscription,
  listClientSubscriptionsByMentor,
  getMentorDetails,
  createSignalRecord,
  listSignalRecordsByMentor,
  findRecentSignalByFingerprint,
  updateSignalRecord,
  createSignalJobsBulk,
  listSignalJobsByMentor,
  listSignalJobsBySubscription,
  createAuditLog,
} = require('./lib/store');
const {
  createPasswordHash,
  verifyPassword,
  normalizeEmail,
} = require('./lib/auth');
const {
  executeSignal,
  normalizeDirection,
  normalizePlatform,
  getActiveBrokerConnection,
  sanitizeConnection,
} = require('./lib/metatrader-executor');
const {
  SIGNAL_ACTIONS,
  normalizeSignalAction,
  requiresSymbolForAction,
  normalizeBridgeSymbol,
  buildSignalFingerprint,
  registerBridgeAgentSession,
  recordBridgeHeartbeat,
  dispatchSignalJobQueue,
  getDispatchableJobsForBridge,
  submitBridgeJobResult,
  cleanupStaleBridgeSessions,
} = require('./lib/bridge-orchestrator');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_NAME = 'Future EA Pro';
const APP_SLUG = 'futureeapro';
const SUPERHOST_EMAIL = normalizeEmail(process.env.SUPERHOST_EMAIL || 'superhost@futureeapro.com');
const SUPERHOST_PASSWORD = process.env.SUPERHOST_PASSWORD || 'ChangeMe123!';
const DEFAULT_TEST_MENTOR_PORTAL_ID = Number(process.env.DEFAULT_TEST_MENTOR_PORTAL_ID || 100);
const DEFAULT_TEST_MENTOR_EMAIL = normalizeEmail(
  process.env.DEFAULT_TEST_MENTOR_EMAIL || 'mentor.preview@futureeapro.com'
);
const DEFAULT_TEST_MENTOR_NAME = String(
  process.env.DEFAULT_TEST_MENTOR_NAME || 'Future EA Pro Mentor'
).trim();
const DEFAULT_TEST_MENTOR_PASSWORD = process.env.DEFAULT_TEST_MENTOR_PASSWORD || 'Mentor100@Future';
const DEFAULT_TEST_MENTOR_LICENSE_LIMIT = 1000;
const DEFAULT_TEST_CLIENT_EMAIL = normalizeEmail(
  process.env.DEFAULT_TEST_CLIENT_EMAIL || 'nhlanhlamashapa11@gmail.com'
);
const DEFAULT_TEST_LICENSE_KEY = normalizeLicenseInput(
  process.env.DEFAULT_TEST_LICENSE_KEY || 'FUTR3EA1'
);
const DEFAULT_TEST_ROBOT_NAME = 'Future EA Test Bot';
const parsedUsdExchangeRate = Number(process.env.USD_EXCHANGE_RATE || 18.5);
const USD_EXCHANGE_RATE =
  Number.isFinite(parsedUsdExchangeRate) && parsedUsdExchangeRate > 0
    ? parsedUsdExchangeRate
    : 18.5;
const CLIENT_BYPASS_PLAN = {
  code: 'bypass_free',
  label: 'Bypass Access',
  durationMonths: 12,
  amountZar: 0,
};
const DEFAULT_CLIENT_BYPASS_EMAILS = [
  'nhlanhlamashapa11@gmail',
  'nhlanhlamashapa11@gmail.com',
];
const CLIENT_SUBSCRIPTION_BYPASS_EMAILS = parseEmailSet(
  process.env.CLIENT_BYPASS_EMAILS,
  DEFAULT_CLIENT_BYPASS_EMAILS
);
const CLIENT_PLANS = {
  month_1: { code: 'month_1', label: '1 Month', durationMonths: 1, amountZar: 599 },
  month_3: { code: 'month_3', label: '3 Months', durationMonths: 3, amountZar: 1499 },
  year_1: { code: 'year_1', label: '1 Year', durationMonths: 12, amountZar: 4599 },
};
const CLIENT_PLAN_LIST = Object.values(CLIENT_PLANS);
const LICENSE_KEY_DURATIONS = {
  days_3: { code: 'days_3', label: '3 Days', mode: 'days', value: 3 },
  days_5: { code: 'days_5', label: '5 Days', mode: 'days', value: 5 },
  days_30: { code: 'days_30', label: '30 Days', mode: 'days', value: 30 },
  month_1: { code: 'month_1', label: '1 Month', mode: 'months', value: 1 },
  month_3: { code: 'month_3', label: '3 Months', mode: 'months', value: 3 },
  month_6: { code: 'month_6', label: '6 Months', mode: 'months', value: 6 },
  year_1: { code: 'year_1', label: '1 Year', mode: 'months', value: 12 },
  lifetime: { code: 'lifetime', label: 'Lifetime (∞)', mode: 'lifetime', value: 0 },
};
const LICENSE_KEY_DURATION_LIST = Object.values(LICENSE_KEY_DURATIONS);
const CLIENT_ROBOT_SECTIONS = [
  'home',
  'add-robot',
  'quotes',
  'trade',
  'activity',
  'scanner',
  'metatrader',
  'details',
  'settings',
];
const QUOTE_SYMBOLS = [
  '.DER30.',
  '.UK100.',
  '.US30.',
  '.USTECH.',
  'AUDUSD',
  'BTCUSD',
  'GBPUSD',
  'LITECOIN',
  'USDCHF',
  'USDJPY',
  'USDZAR',
  'VIX',
];
const METRADER_BROKERS = [
  'Razor Markets',
  'IC Markets',
  'Exness',
  'XM',
  'Pepperstone',
  'HFM',
  'FBS',
  'Tickmill',
  'FP Markets',
  'Deriv',
  'OANDA',
  'AvaTrade',
  'Other / Custom Broker',
];
const METATRADER_SERVER_SUGGESTIONS = [
  'Razor Markets Live',
  'Razor Markets Demo',
  'IC Markets Live',
  'IC Markets Demo',
  'Exness Live',
  'Exness Demo',
  'XM Live',
  'XM Demo',
  'Pepperstone Live',
  'Pepperstone Demo',
  'HFM Live',
  'OANDA Live',
  'OANDA Demo',
];
const METATRADER_ASSET_CLASSES = ['Forex', 'CFD', 'Commodities', 'Synthetic indices'];
const TRADE_DIRECTIONS = ['BUY', 'SELL', 'BOTH'];
const TRADE_DIRECTION_SET = new Set(TRADE_DIRECTIONS);
const DEFAULT_SYMBOL_CONFIG = {
  lotSize: 0.01,
  maxTrades: 1,
  direction: 'BUY',
};
const TRADE_EXECUTION_FIELD_LABELS = {
  count: 'count',
  lastExecutedAt: 'lastExecutedAt',
  lastOrderId: 'lastOrderId',
  lastDirection: 'lastDirection',
  lastSymbol: 'lastSymbol',
  lastStatus: 'lastStatus',
};
const NEUTRAL_ROBOT_PLACEHOLDER_IMAGE_URL = '/assets/robot-preview-astra.svg';
const DEFAULT_ROBOT_IMAGE_URLS = [NEUTRAL_ROBOT_PLACEHOLDER_IMAGE_URL];
const TEST_LADY_ROBOT_IMAGE_URL = '/assets/robots/futureeapro-test-lady-cyber.jpg';
const FUTURE_EA_TEST_BOT_NAME = 'Future EA Test Bot';
const DEFAULT_ROBOT_NAME = 'Future EA Pro Core';
const LEGACY_RED_ROBOT_IMAGE_URL = '/assets/robot-preview-user.jpg';
const LEGACY_ROBOT_NAME_PATTERN = /algo\s*nova\s*ea\s*v?6/i;
const LEGACY_TEST_REPLACEMENT_IMAGE_PATTERNS = [
  /futureeapro-test-cyber-red/i,
  /futureeapro-blue-mortal-kombat/i,
  /futureeapro-red-master/i,
];
const FORBIDDEN_ROBOT_IMAGE_PATTERNS = [
  /robot-preview-user/i,
  /futureeapro-red-master/i,
  /robot-(cobalt|orion|aurora|ember)/i,
  /futureeapro-blue-mortal-kombat/i,
  /img_4755/i,
  /img_8085/i,
  /img_8084/i,
  /img_8083/i,
  /algo[\s_-]*nova/i,
  /trade[\s_-]*port/i,
];
const CLIENT_BACKGROUND_MEDIA_LIBRARY = [
  {
    id: 'blue-mortal-motion',
    label: 'Blue Mortal Motion',
    type: 'video',
    src: '/assets/background-videos/blue-mortal-motion.mp4',
    poster: '/assets/future-ea-pro-logo.png',
    themeHint: 'blue',
  },
  {
    id: 'blue-mortal-motion-alt',
    label: 'Blue Mortal Motion Alt',
    type: 'video',
    src: '/assets/background-videos/blue-mortal-motion-alt.mp4',
    poster: '/assets/future-ea-pro-logo.png',
    themeHint: 'blue',
  },
  {
    id: 'uploaded-video-01',
    label: 'Neon Flux Motion',
    type: 'video',
    src: '/assets/background-videos/future-theme-01.mp4',
    poster: '/assets/backgrounds/future-theme-smoke-dual-neon.jpg',
    themeHint: 'red',
  },
  {
    id: 'uploaded-video-02',
    label: 'Cyber Pulse Motion',
    type: 'video',
    src: '/assets/background-videos/future-theme-02.mp4',
    poster: '/assets/backgrounds/future-theme-upload-01.jpg',
    themeHint: 'purple',
  },
  {
    id: 'uploaded-video-03',
    label: 'Custom Mentor Motion',
    type: 'video',
    src: '/assets/background-videos/future-theme-upload-03.mov',
    poster: '/assets/backgrounds/future-theme-smoke-dual-neon.jpg',
    themeHint: 'red',
  },
  {
    id: 'uploaded-image-01',
    label: 'Red Matrix Motion',
    type: 'image',
    src: '/assets/backgrounds/future-theme-upload-01.jpg',
    poster: '/assets/backgrounds/future-theme-upload-01.jpg',
    themeHint: 'red',
  },
  {
    id: 'uploaded-image-03',
    label: 'Dual Neon Smoke',
    type: 'image',
    src: '/assets/backgrounds/future-theme-smoke-dual-neon.jpg',
    poster: '/assets/backgrounds/future-theme-smoke-dual-neon.jpg',
    themeHint: 'blue',
  },
  {
    id: 'uploaded-image-04',
    label: 'Moon Samurai Drift',
    type: 'image',
    src: '/assets/backgrounds/future-theme-moon-samurai.jpg',
    poster: '/assets/backgrounds/future-theme-moon-samurai.jpg',
    themeHint: 'red',
    motionHint: 'cloud-drift',
  },
  {
    id: 'uploaded-image-05',
    label: 'Blue Fluid Wallpaper',
    type: 'image',
    src: '/assets/backgrounds/future-theme-blue-fluid-wallpaper.jpg',
    poster: '/assets/backgrounds/future-theme-blue-fluid-wallpaper.jpg',
    themeHint: 'blue',
  },
  {
    id: 'uploaded-image-06',
    label: 'Green Crystal',
    type: 'image',
    src: '/assets/backgrounds/future-theme-green-crystal.jpg',
    poster: '/assets/backgrounds/future-theme-green-crystal.jpg',
    themeHint: 'green',
  },
];
const CLIENT_DEFAULT_BACKGROUND_MEDIA_ID = 'uploaded-video-01';
const THEME_PRESETS = {
  dope_red: {
    label: 'Dope Red (Default)',
    colors: {
      primary: '#ff445b',
      secondary: '#ffc1c9',
      tertiary: '#f7f8ff',
      accentPink: '#ff6f85',
      bgStart: '#09080c',
      bgEnd: '#1a1117',
      glow: '#ffe7eb',
    },
  },
  neon_rose: {
    label: 'Neon Rose',
    colors: {
      primary: '#ff4f7b',
      secondary: '#ff8ca8',
      tertiary: '#ffd166',
      accentPink: '#ff6fa7',
      bgStart: '#1a0812',
      bgEnd: '#290a16',
      glow: '#ff85ad',
    },
  },
  acid_lime: {
    label: 'Acid Lime',
    colors: {
      primary: '#39ff14',
      secondary: '#c7ff00',
      tertiary: '#ff3df5',
      accentPink: '#ff2ea3',
      bgStart: '#0d1200',
      bgEnd: '#1f2a00',
      glow: '#8dff33',
    },
  },
  ember_flux: {
    label: 'Ember Flux',
    colors: {
      primary: '#ff4b5c',
      secondary: '#ff7f50',
      tertiary: '#b8ff5d',
      accentPink: '#ff5f8d',
      bgStart: '#13080a',
      bgEnd: '#2a0e13',
      glow: '#ff8f78',
    },
  },
  cyber_sunset: {
    label: 'Cyber Sunset',
    colors: {
      primary: '#ff7a00',
      secondary: '#ff2ea3',
      tertiary: '#39ff14',
      accentPink: '#ff66da',
      bgStart: '#180808',
      bgEnd: '#2d001f',
      glow: '#ffd60a',
    },
  },
};
const LEGACY_DOPE_RED_THEME = {
  primary: '#ff5f6d',
  secondary: '#ff9f43',
  tertiary: '#9cff57',
  accentPink: '#ff4f7b',
  bgStart: '#0c0609',
  bgEnd: '#1d0c11',
  glow: '#ff7a7a',
};
const LEGACY_INITIAL_THEME = {
  primary: '#ff3df5',
  secondary: '#39ff14',
  tertiary: '#ffe600',
  accentPink: '#ff3df5',
  bgStart: '#13001f',
  bgEnd: '#2a0038',
  glow: '#ff5eea',
};
const ANDROID_TEST_APK_PATH = path.join(
  __dirname,
  'public',
  'downloads',
  'future-ea-pro-android-beta.apk'
);
let cachedLicenseEmailTransporter = null;
const FOREX_EVENTS_FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FOREX_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const FOREX_KEY_EVENT_KEYWORDS = [
  'cpi',
  'nfp',
  'non-farm',
  'ppi',
  'fomc',
  'interest rate',
  'fed',
  'ecb',
  'boe',
  'gdp',
  'unemployment',
  'payrolls',
];
const FOREX_FILTER_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This Week' },
];
const FOREX_CURRENCY_OPTIONS = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const NEWS_PROTECTION_MODES = {
  conservative: {
    key: 'conservative',
    label: 'Conservative',
    pauseBeforeMinutes: 60,
    pauseAfterMinutes: 60,
    behavior: 'block',
  },
  moderate: {
    key: 'moderate',
    label: 'Moderate',
    pauseBeforeMinutes: 30,
    pauseAfterMinutes: 30,
    behavior: 'delay',
  },
  aggressive: {
    key: 'aggressive',
    label: 'Aggressive',
    pauseBeforeMinutes: 10,
    pauseAfterMinutes: 10,
    behavior: 'allow',
  },
};
const DEFAULT_NEWS_PROTECTION_MODE = 'moderate';
const BRIDGE_AGENT_SHARED_TOKEN = String(
  process.env.BRIDGE_AGENT_TOKEN || process.env.BRIDGE_SHARED_TOKEN || 'futureeapro-bridge-token'
).trim();
const BRIDGE_MAX_RETRIES = Number(process.env.BRIDGE_MAX_RETRIES || 3);
let forexEventsCache = {
  fetchedAtMs: 0,
  items: [],
};

ensureDataFile();
ensureMentorPortalIds();
ensureDefaultThemePalette();
bootstrapSuperhost();
bootstrapDefaultMentorAccount();
bootstrapDefaultBypassLicenseKey();
migrateLegacyRobotImages();
migrateLegacyRobotNames();
startBridgeOrchestratorLoops();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false }));
app.use((error, req, _res, next) => {
  if (!error || error.type !== 'entity.parse.failed') {
    return next(error);
  }

  const rawBody = typeof error.body === 'string' ? error.body.trim() : '';
  const fallbackBody = {};

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(fallbackBody, parsed);
      }
    } catch (_jsonError) {
      const params = new URLSearchParams(rawBody);
      for (const [key, value] of params.entries()) {
        if (!(key in fallbackBody)) {
          fallbackBody[key] = value;
        }
      }
    }
  }

  req.body = fallbackBody;
  return next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/previews', express.static(path.join(__dirname, '..', 'previews')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace-this-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use((req, res, next) => {
  const userId = req.session.userId;
  const user = userId ? getUserById(userId) : null;
  req.currentUser = user || null;
  res.locals.currentUser = req.currentUser;
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.superhostEmail = SUPERHOST_EMAIL;
  res.locals.appName = APP_NAME;
  res.locals.appSlug = APP_SLUG;
  res.locals.portalTheme = getPortalTheme();
  next();
});

app.get('/', (_req, res) => {
  res.render('home', {
    title: APP_NAME,
    dashboardDateLabel: formatDashboardDate(new Date()),
  });
});

app.get('/platform', (_req, res) => {
  res.render('platform', { title: 'Platform Overview' });
});

app.get('/signup', (req, res) => {
  if (req.currentUser) {
    return res.redirect('/dashboard');
  }
  return res.render('signup', { title: 'Mentor Sign Up' });
});

app.post('/signup', (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');

  if (!name || !email || !password) {
    setFlash(req, 'error', 'Name, email, and password are required.');
    return res.redirect('/signup');
  }

  if (password.length < 8) {
    setFlash(req, 'error', 'Password must be at least 8 characters long.');
    return res.redirect('/signup');
  }

  if (getUserByEmail(email)) {
    setFlash(req, 'error', 'That email is already registered. Please sign in with that email.');
    return res.redirect('/signup');
  }

  const role = email === SUPERHOST_EMAIL ? 'superhost' : 'mentor';
  const passwordData = createPasswordHash(password);

  const createdUser = createUser({
    name,
    email,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    role,
  });

  if (!createdUser) {
    setFlash(req, 'error', 'That email is already registered. Please sign in with that email.');
    return res.redirect('/signup');
  }

  if (role === 'superhost') {
    setFlash(req, 'success', 'Superhost account created. You can sign in now.');
  } else {
    setFlash(req, 'success', 'Account created successfully. You can sign in now.');
  }

  return res.redirect('/signin');
});

app.get('/signin', (req, res) => {
  if (req.currentUser) {
    return res.redirect('/dashboard');
  }
  return res.render('signin', { title: 'Sign In' });
});

app.post('/signin', (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const user = getUserByEmail(email);

  if (!user) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.redirect('/signin');
  }

  const isValid = verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!isValid) {
    setFlash(req, 'error', 'Invalid email or password.');
    return res.redirect('/signin');
  }

  if (user.role === 'mentor' && !user.approved) {
    setFlash(req, 'error', 'Your account is currently not approved. Contact support.');
    return res.redirect('/signin');
  }

  req.session.userId = user.id;
  updateUser(user.id, { lastLoginAt: new Date().toISOString() });

  if (user.role === 'superhost') {
    return res.redirect('/superhost/dashboard');
  }

  return res.redirect('/mentor/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/signin');
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  if (req.currentUser.role === 'superhost') {
    return res.redirect('/superhost/dashboard');
  }
  return res.redirect('/mentor/dashboard');
});

app.get('/client', (_req, res) => {
  res.render('client-landing', {
    title: 'Client App',
  });
});

app.get('/download/android', (req, res) => {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const legacyRequested = String(query.legacy || '').trim() === '1';
  const directDownloadRequested = ['1', 'true', 'yes'].includes(
    String(query.download || query.apk || query.direct || '')
      .trim()
      .toLowerCase()
  );
  const legacyApkAvailable = fs.existsSync(ANDROID_TEST_APK_PATH);

  if ((legacyRequested || directDownloadRequested) && legacyApkAvailable) {
    return res.download(ANDROID_TEST_APK_PATH, 'future-ea-pro-android-beta.apk');
  }

  return res.render('download-android', {
    title: 'Install Android App',
    legacyApkAvailable,
  });
});

app.get('/download/ios', (_req, res) => {
  return res.render('download-ios', {
    title: 'Install iOS App',
  });
});

app.get(['/download/android.apk', '/download/future-ea-pro.apk'], (_req, res) => {
  const legacyApkAvailable = fs.existsSync(ANDROID_TEST_APK_PATH);
  if (!legacyApkAvailable) {
    return res.redirect('/download/android');
  }
  return res.download(ANDROID_TEST_APK_PATH, 'future-ea-pro-android-beta.apk');
});

app.get(['/download/app-android', '/download/app-android/'], (_req, res) => {
  return res.redirect('/download/android?download=1');
});

app.get(['/download/app-ios', '/download/app-ios/'], (_req, res) => {
  return res.redirect('/download/ios');
});

app.get(['/app', '/app/'], (_req, res) => {
  return res.redirect('/client');
});

app.get(['/app/android', '/app/android/'], (_req, res) => {
  return res.redirect('/download/android?download=1');
});

app.get(['/app/ios', '/app/ios/'], (_req, res) => {
  return res.redirect('/download/ios');
});

app.get(['/app/client', '/app/client/'], (_req, res) => {
  return res.redirect('/client');
});

function handleApiMentorLookup(req, res) {
  const payload = readApiPayload(req);
  const mentorPortalId = parseMentorPortalIdInput(
    req.params.mentorPortalId ||
      payload.mentorPortalId ||
      payload.mentorId ||
      payload.mentorNumber ||
      payload.mentor_id ||
      payload.number
  );

  if (!mentorPortalId) {
    return res.status(200).json({
      ok: false,
      canAccess: false,
      message: 'Mentor ID not found.',
    });
  }

  const mentor = getMentorByPortalId(mentorPortalId);
  if (!mentor || mentor.role !== 'mentor') {
    return res.status(200).json({
      ok: false,
      canAccess: false,
      message: 'Mentor ID not found.',
    });
  }

  if (!mentor.approved || !mentor.subscriptionActive) {
    return res.status(200).json({
      ok: false,
      canAccess: false,
      message: 'Mentor account is not active.',
    });
  }

  const clientEmail = normalizeEmail(payload.clientEmail || payload.email || payload.client_email);
  const mentorRobots = listRobotsByMentor(mentor.id);
  const featuredRobot = pickFeaturedRobot(mentorRobots, mentor.id);

  return res.status(200).json({
    ok: true,
    canAccess: true,
    mentor: {
      id: mentor.id,
      mentorId: mentor.mentorPortalId,
      name: mentor.name,
      email: mentor.email,
      approved: true,
      subscriptionActive: true,
    },
    clientEmail,
    subscriptionBypassed: clientEmail ? isClientSubscriptionBypassed(clientEmail) : false,
    plans: CLIENT_PLAN_LIST,
    robot: featuredRobot
      ? {
          id: featuredRobot.id,
          name: sanitizeRobotName(featuredRobot.name),
          imageUrl: featuredRobot.imageUrl || '/assets/future-ea-pro-logo.png',
          priceZar: Number(mentor.robotPricePerKey || 0),
        }
      : null,
  });
}

app.all('/api/mentors/by-number', handleApiMentorLookup);
app.all('/api/mentors/by-number/:mentorPortalId', handleApiMentorLookup);

app.post('/api/payments/start', (req, res) => {
  const payload = readApiPayload(req);
  const mentorPortalId = parseMentorPortalIdInput(
    payload.mentorPortalId || payload.mentorId || payload.mentorNumber || payload.mentor_id
  );
  const mentor = mentorPortalId ? getMentorByPortalId(mentorPortalId) : null;
  if (!mentor || mentor.role !== 'mentor' || !mentor.approved || !mentor.subscriptionActive) {
    return res.status(200).json({
      ok: false,
      paid: false,
      message: 'Mentor ID not found.',
    });
  }

  const clientEmail = normalizeEmail(payload.clientEmail || payload.email || payload.client_email);
  const planCode = String(payload.planCode || payload.plan || '').trim();
  const plan = getClientPlan(planCode) || CLIENT_PLANS.month_1;
  const bypassed = isClientSubscriptionBypassed(clientEmail);

  return res.status(200).json({
    ok: true,
    paid: true,
    bypassed,
    paymentMode: 'test',
    planCode: bypassed ? CLIENT_BYPASS_PLAN.code : plan.code,
    amountZar: bypassed ? 0 : plan.amountZar,
    message: bypassed ? 'Bypass access granted.' : 'Payment confirmed (test mode).',
  });
});

app.post('/api/licenses/validate', (req, res) => {
  const payload = readApiPayload(req);
  const mentorPortalId = parseMentorPortalIdInput(
    payload.mentorPortalId || payload.mentorId || payload.mentorNumber || payload.mentor_id
  );
  const mentor = mentorPortalId ? getMentorByPortalId(mentorPortalId) : null;
  if (!mentor || mentor.role !== 'mentor' || !mentor.approved || !mentor.subscriptionActive) {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'Mentor ID not found.',
    });
  }

  const clientEmail = normalizeEmail(payload.clientEmail || payload.email || payload.client_email);
  const enteredLicenseKey = normalizeLicenseInput(
    payload.licenseKey || payload.key || payload.license || payload.code
  );
  const mentorRobots = listRobotsByMentor(mentor.id);
  const featuredRobot = pickFeaturedRobot(mentorRobots, mentor.id);

  if (!enteredLicenseKey) {
    return res.status(200).json({
      ok: true,
      valid: true,
      stage: 'identity',
      mentor: {
        id: mentor.id,
        mentorId: mentor.mentorPortalId,
        name: mentor.name,
      },
      clientEmail,
      subscriptionBypassed: clientEmail ? isClientSubscriptionBypassed(clientEmail) : false,
      plans: CLIENT_PLAN_LIST,
      robot: featuredRobot
        ? {
            id: featuredRobot.id,
            name: sanitizeRobotName(featuredRobot.name),
            imageUrl: featuredRobot.imageUrl || '/assets/future-ea-pro-logo.png',
          }
        : null,
    });
  }

  const licenseRecord = getLicenseKeyByMentorAndKey(mentor.id, enteredLicenseKey);
  if (!licenseRecord) {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'Invalid license key for this mentor.',
    });
  }

  const incomingDeviceId = getRequestDeviceId(req, payload.deviceId || payload.device || '');
  const rawStatus = String(licenseRecord.status || 'available').trim().toLowerCase();
  if (rawStatus !== 'available' && rawStatus !== 'active') {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'This license key cannot be used right now.',
    });
  }

  if (isLicenseKeyRedeemed(licenseRecord)) {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'This license key has already been used.',
    });
  }

  if (licenseRecord.deviceId && incomingDeviceId && licenseRecord.deviceId !== incomingDeviceId) {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'This license key is already linked to another device.',
    });
  }

  const reservedEmail = normalizeEmail(licenseRecord.reservedClientEmail);
  if (reservedEmail && clientEmail && reservedEmail !== clientEmail) {
    return res.status(200).json({
      ok: false,
      valid: false,
      message: 'This key is reserved for a different client email.',
    });
  }

  if (licenseRecord.expiresAt) {
    const expiresAt = new Date(licenseRecord.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return res.status(200).json({
        ok: false,
        valid: false,
        message: 'This license key has expired.',
      });
    }
  }

  return res.status(200).json({
    ok: true,
    valid: true,
    mentor: {
      id: mentor.id,
      mentorId: mentor.mentorPortalId,
      name: mentor.name,
    },
    license: {
      id: licenseRecord.id,
      key: formatLicenseKeyForDisplay(licenseRecord.key),
      keyRaw: normalizeLicenseInput(licenseRecord.key),
      durationCode: licenseRecord.durationCode || '',
      durationLabel: licenseRecord.durationLabel || '',
      expiresAt: licenseRecord.expiresAt || null,
      robotId: licenseRecord.robotId || null,
      robotName: sanitizeRobotName(licenseRecord.robotName || ''),
    },
  });
});

app.post('/api/licenses/unlock-client', (req, res) => {
  const payload = readApiPayload(req);
  const mentorPortalId = parseMentorPortalIdInput(
    payload.mentorPortalId || payload.mentorId || payload.mentorNumber || payload.mentor_id
  );
  const mentor = mentorPortalId ? getMentorByPortalId(mentorPortalId) : null;
  if (!mentor || mentor.role !== 'mentor' || !mentor.approved || !mentor.subscriptionActive) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'Mentor ID not found.',
    });
  }

  const clientEmail = normalizeEmail(payload.clientEmail || payload.email || payload.client_email);
  if (!clientEmail || !clientEmail.includes('@')) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'Client email is required.',
    });
  }

  const enteredLicenseKey = normalizeLicenseInput(
    payload.licenseKey || payload.key || payload.license || payload.code
  );
  if (!enteredLicenseKey) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'License key is required.',
    });
  }

  const licenseRecord = getLicenseKeyByMentorAndKey(mentor.id, enteredLicenseKey);
  if (!licenseRecord) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'Invalid license key for this mentor.',
    });
  }

  const incomingDeviceId = getRequestDeviceId(req, payload.deviceId || payload.device || '');
  const rawStatus = String(licenseRecord.status || 'available').trim().toLowerCase();
  if (rawStatus !== 'available' && rawStatus !== 'active') {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'This license key cannot be used right now.',
    });
  }

  if (isLicenseKeyRedeemed(licenseRecord)) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'This license key has already been used.',
    });
  }

  if (licenseRecord.deviceId && incomingDeviceId && licenseRecord.deviceId !== incomingDeviceId) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'This license key is already linked to another device.',
    });
  }

  const reservedEmail = normalizeEmail(licenseRecord.reservedClientEmail);
  if (reservedEmail && reservedEmail !== clientEmail) {
    return res.status(200).json({
      ok: false,
      unlocked: false,
      message: 'This key is reserved for a different client email.',
    });
  }

  if (licenseRecord.expiresAt) {
    const expiresAt = new Date(licenseRecord.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return res.status(200).json({
        ok: false,
        unlocked: false,
        message: 'This license key has expired.',
      });
    }
  }

  const bypassed = isClientSubscriptionBypassed(clientEmail);
  const requestedPlanCode = String(payload.planCode || payload.plan || '').trim();
  const plan = bypassed
    ? CLIENT_BYPASS_PLAN
    : getClientPlan(requestedPlanCode) || CLIENT_PLANS.month_1;

  const startedAt = new Date();
  const endsAt = addMonths(startedAt, plan.durationMonths);
  const subscription = createClientSubscription({
    mentorId: mentor.id,
    mentorPortalId: mentor.mentorPortalId,
    clientEmail,
    planCode: plan.code,
    durationMonths: plan.durationMonths,
    amountZar: plan.amountZar,
    robotId: licenseRecord.robotId || null,
    robotName: licenseRecord.robotName || '',
    licenseDurationCode: licenseRecord.durationCode || '',
    licenseDurationLabel: licenseRecord.durationLabel || '',
    licenseKeyExpiresAt: licenseRecord.expiresAt || null,
    licenseKey: normalizeLicenseInput(licenseRecord.key),
    licenseNumber: licenseRecord.licenseNumber,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'active',
  });

  updateLicenseKey(licenseRecord.id, {
    status: 'redeemed',
    deviceId: incomingDeviceId,
    activatedAt: new Date().toISOString(),
    usageCount: Number(licenseRecord.usageCount || 0) + 1,
    redeemedByClientEmail: clientEmail,
    redeemedAt: new Date().toISOString(),
    subscriptionId: subscription.id,
  });

  return res.status(200).json({
    ok: true,
    unlocked: true,
    subscriptionId: subscription.id,
    mentorId: mentor.mentorPortalId,
    redirect: `/client/robot/${subscription.id}`,
  });
});

app.get('/api/economic-events', async (req, res) => {
  const payload = readApiPayload(req);
  const filter = normalizeForexFilter(payload.filter || payload.range || 'today');
  const currency = normalizeForexCurrencyFilter(payload.currency || payload.ccy || '');
  const data = await getUpcomingForexEvents(new Date(), {
    filter,
    currency,
    includeLowImpact: true,
    limit: 120,
  });
  return res.status(200).json({
    ok: true,
    filter: data.filter,
    currencyFilter: data.currencyFilter,
    fromLabel: data.fromLabel,
    toLabel: data.toLabel,
    summary: data.summary,
    banner: data.banner,
    volatility: data.volatility,
    count: data.items.length,
    events: data.items,
  });
});

app.get('/api/client/:subscriptionId/copy-trading-feedback', (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    return res.status(404).json({ ok: false, message: 'Subscription not found.' });
  }

  const mentor = getUserById(subscription.mentorId);
  const feedback = listSignalJobsBySubscription(subscription.id)
    .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.createdAt || 0) || 0))
    .slice(0, 20)
    .map((job) => ({
      id: job.id,
      signalId: job.signalId,
      action: job.action,
      symbol: job.symbol || 'ALL',
      platform: job.platform,
      status: job.executionStatus,
      orderId: job.resultOrderId || '',
      errorCode: job.errorCode || '',
      errorMessage: job.errorMessage || '',
      updatedAt: job.updatedAt || job.createdAt,
    }));

  return res.status(200).json({
    ok: true,
    mentorId: subscription.mentorPortalId,
    copyTradingEnabled: subscription.copyTradingEnabled !== false,
    newsProtection: getMentorNewsProtectionSettings(mentor || {}),
    feedback,
  });
});

app.post('/api/trade-event', async (req, res) => {
  const payload = readApiPayload(req);
  return res.status(200).json({
    ok: true,
    queued: true,
    direction: normalizeDirection(payload.direction || payload.side || ''),
    symbol: String(payload.symbol || payload.pair || '').trim().toUpperCase(),
    message: 'Trade event accepted for processing.',
  });
});

app.post('/api/bridge/session/register', (req, res) => {
  const payload = readApiPayload(req);
  const authToken = String(payload.authToken || payload.token || '').trim();
  if (!isValidBridgeAgentToken(authToken)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized bridge token.' });
  }

  const agentId = String(payload.agentId || payload.bridgeAgentId || '').trim();
  const platform = normalizePlatform(payload.platform || 'MT5');
  const accountNumber = String(payload.accountNumber || '').trim();
  const serverName = String(payload.serverName || '').trim();

  if (!agentId || !accountNumber || !serverName) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_REGISTER_MISSING_FIELDS',
      message: 'agentId, accountNumber and serverName are required.',
    });
  }

  const session = registerBridgeAgentSession({
    agentId,
    mentorId: payload.mentorId || null,
    userId: payload.userId || null,
    platform,
    brokerName: String(payload.brokerName || '').trim(),
    accountNumber,
    serverName,
    heartbeatIntervalMs: Number(payload.heartbeatIntervalMs || 15000),
    capabilities: Array.isArray(payload.capabilities) ? payload.capabilities : ['market_order'],
    authHash: crypto.createHash('sha256').update(authToken).digest('hex'),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  });

  return res.status(200).json({
    ok: true,
    session: {
      id: session.id,
      agentId: session.agentId,
      platform: session.platform,
      brokerName: session.brokerName,
      accountNumber: session.accountNumber,
      serverName: session.serverName,
      heartbeatIntervalMs: session.heartbeatIntervalMs,
      status: session.status,
    },
  });
});

app.post('/api/bridge/session/heartbeat', (req, res) => {
  const payload = readApiPayload(req);
  const authToken = String(payload.authToken || payload.token || '').trim();
  if (!isValidBridgeAgentToken(authToken)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized bridge token.' });
  }

  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_HEARTBEAT_MISSING_SESSION',
      message: 'sessionId is required.',
    });
  }

  const session = recordBridgeHeartbeat({
    sessionId,
    status: payload.status || 'connected',
    latencyMs: payload.latencyMs,
    terminalVersion: payload.terminalVersion || '',
    bridgeVersion: payload.bridgeVersion || '',
    detail: payload.detail || 'heartbeat',
  });

  if (!session) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_SESSION_NOT_FOUND',
      message: 'Bridge session not found.',
    });
  }

  cleanupStaleBridgeSessions(new Date());
  return res.status(200).json({
    ok: true,
    status: session.status,
    lastHeartbeatAt: session.lastHeartbeatAt,
  });
});

app.post('/api/bridge/jobs/pull', async (req, res) => {
  const payload = readApiPayload(req);
  const authToken = String(payload.authToken || payload.token || '').trim();
  if (!isValidBridgeAgentToken(authToken)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized bridge token.' });
  }

  const sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_PULL_MISSING_SESSION',
      message: 'sessionId is required.',
    });
  }

  await dispatchSignalJobQueue({ limit: 80 });
  const jobs = getDispatchableJobsForBridge({
    sessionId,
    limit: Number(payload.limit || 20),
  });

  return res.status(200).json({
    ok: true,
    count: jobs.length,
    jobs,
  });
});

app.post('/api/bridge/jobs/:jobId/result', (req, res) => {
  const payload = readApiPayload(req);
  const authToken = String(payload.authToken || payload.token || '').trim();
  if (!isValidBridgeAgentToken(authToken)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized bridge token.' });
  }

  const jobId = String(req.params.jobId || '').trim();
  const sessionId = String(payload.sessionId || '').trim();
  const ok = payload.ok === true || String(payload.ok || '').trim().toLowerCase() === 'true';
  if (!jobId || !sessionId) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_RESULT_MISSING_IDENTIFIERS',
      message: 'jobId and sessionId are required.',
    });
  }

  const result = submitBridgeJobResult({
    sessionId,
    jobId,
    ok,
    orderId: payload.orderId || payload.ticket || '',
    errorCode: payload.errorCode || '',
    errorMessage: payload.errorMessage || '',
    result: payload.result && typeof payload.result === 'object' ? payload.result : {},
  });

  if (!result.ok) {
    return res.status(200).json({
      ok: false,
      code: 'BRIDGE_RESULT_REJECTED',
      message: result.reason || 'Could not process bridge result.',
    });
  }

  return res.status(200).json({
    ok: true,
    job: {
      id: result.job.id,
      executionStatus: result.job.executionStatus,
      resultOrderId: result.job.resultOrderId || '',
    },
  });
});

app.post('/client/start', (req, res) => {
  const body = req.body || {};
  const mentorPortalId = Number(body.mentorPortalId);
  const clientEmail = normalizeEmail(body.clientEmail);

  if (!Number.isInteger(mentorPortalId) || mentorPortalId < 100) {
    setFlash(req, 'error', 'Mentor ID must be a valid number (100 or higher).');
    return res.redirect('/client');
  }

  if (!clientEmail) {
    setFlash(req, 'error', 'Client email is required.');
    return res.redirect('/client');
  }

  if (!clientEmail.includes('@')) {
    setFlash(req, 'error', 'Please enter a valid client email.');
    return res.redirect('/client');
  }

  const mentor = getMentorByPortalId(mentorPortalId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor ID not found.');
    return res.redirect('/client');
  }

  if (!mentor.approved || !mentor.subscriptionActive) {
    setFlash(req, 'error', 'This mentor account is not active for subscriptions right now.');
    return res.redirect('/client');
  }

  const isBypassClient = isClientSubscriptionBypassed(clientEmail);
  req.session.clientFlow = {
    mentorId: mentor.id,
    mentorPortalId: mentor.mentorPortalId,
    mentorName: mentor.name,
    mentorEmail: mentor.email,
    clientEmail,
    planCode: isBypassClient ? CLIENT_BYPASS_PLAN.code : null,
    subscriptionBypassed: isBypassClient,
  };

  if (isBypassClient) {
    setFlash(req, 'success', 'Continue with your mentor license key.');
    return res.redirect('/client/unlock');
  }

  return res.redirect('/client/subscription');
});

app.get('/client/subscription', (req, res) => {
  const flow = req.session.clientFlow;
  if (!flow) {
    setFlash(req, 'error', 'Start from the client landing page first.');
    return res.redirect('/client');
  }

  if (flow.subscriptionBypassed && flow.planCode === CLIENT_BYPASS_PLAN.code) {
    return res.redirect('/client/unlock');
  }

  const mentor = getUserById(flow.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickFeaturedRobot(mentorRobots, mentor ? mentor.id : flow.mentorId);

  return res.render('client-subscription', {
    title: 'Choose Subscription',
    flow,
    plans: CLIENT_PLAN_LIST,
    featuredRobot,
    funnelBackgroundImage:
      (featuredRobot && featuredRobot.imageUrl) || '/assets/future-ea-pro-logo.png',
  });
});

app.post('/client/subscribe', (req, res) => {
  const flow = req.session.clientFlow;
  const body = req.body || {};

  if (!flow) {
    setFlash(req, 'error', 'Session expired. Start again from the client landing page.');
    return res.redirect('/client');
  }

  const mentor = getUserById(flow.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor account no longer exists.');
    return res.redirect('/client');
  }

  if (!mentor.approved || !mentor.subscriptionActive) {
    setFlash(req, 'error', 'Mentor is not active for subscriptions right now.');
    return res.redirect('/client');
  }

  if (flow.subscriptionBypassed && flow.planCode === CLIENT_BYPASS_PLAN.code) {
    return res.redirect('/client/unlock');
  }

  const plan = getClientPlan(String(body.planCode || '').trim());
  if (plan && plan.code === CLIENT_BYPASS_PLAN.code) {
    setFlash(req, 'error', 'This plan is reserved for bypass emails only.');
    return res.redirect('/client/subscription');
  }

  if (!plan) {
    setFlash(req, 'error', 'Please choose a valid subscription plan.');
    return res.redirect('/client/subscription');
  }

  req.session.clientFlow = {
    ...flow,
    planCode: plan.code,
  };
  return res.redirect('/client/unlock');
});

app.get('/client/unlock', (req, res) => {
  const flow = req.session.clientFlow;
  if (!flow || !flow.planCode) {
    setFlash(req, 'error', 'Choose a subscription plan first.');
    return res.redirect('/client/subscription');
  }

  const mentor = getUserById(flow.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickFeaturedRobot(mentorRobots, mentor ? mentor.id : flow.mentorId);
  const plan = getClientPlan(flow.planCode);

  return res.render('client-unlock', {
    title: 'Unlock Robot Access',
    flow,
    plan,
    featuredRobot,
    funnelBackgroundImage:
      (featuredRobot && featuredRobot.imageUrl) || '/assets/future-ea-pro-logo.png',
    deviceId: getRequestDeviceId(req, req.session.clientDeviceId || ''),
  });
});

app.post('/client/unlock', (req, res) => {
  const flow = req.session.clientFlow;
  const body = req.body || {};

  if (!flow || !flow.planCode) {
    setFlash(req, 'error', 'Session expired. Start from the client landing page again.');
    return res.redirect('/client');
  }

  const mentor = getUserById(flow.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor account no longer exists.');
    return res.redirect('/client');
  }

  if (!mentor.approved || !mentor.subscriptionActive) {
    setFlash(req, 'error', 'Mentor is not active for subscriptions right now.');
    return res.redirect('/client');
  }

  const plan = getClientPlan(flow.planCode);
  if (!plan) {
    setFlash(req, 'error', 'Invalid subscription plan state. Please start again.');
    return res.redirect('/client/subscription');
  }

  const enteredLicenseKey = normalizeLicenseInput(body.licenseKey);
  if (!enteredLicenseKey) {
    setFlash(req, 'error', 'Please enter your unique license key from your mentor.');
    return res.redirect('/client/unlock');
  }

  const licenseRecord = getLicenseKeyByMentorAndKey(mentor.id, enteredLicenseKey);
  if (!licenseRecord) {
    setFlash(req, 'error', 'Invalid license key for this mentor.');
    return res.redirect('/client/unlock');
  }

  const incomingDeviceId = getRequestDeviceId(req, body.deviceId || req.session.clientDeviceId || '');
  req.session.clientDeviceId = incomingDeviceId;
  const rawStatus = String(licenseRecord.status || 'available').trim().toLowerCase();
  if (
    rawStatus !== 'available' &&
    rawStatus !== 'active'
  ) {
    setFlash(req, 'error', 'This license key cannot be used right now.');
    return res.redirect('/client/unlock');
  }

  if (isLicenseKeyRedeemed(licenseRecord)) {
    setFlash(req, 'error', 'This license key has already been used.');
    return res.redirect('/client/unlock');
  }

  if (licenseRecord.deviceId && licenseRecord.deviceId !== incomingDeviceId) {
    setFlash(req, 'error', 'This license key is already linked to another device.');
    return res.redirect('/client/unlock');
  }

  const reservedEmail = normalizeEmail(licenseRecord.reservedClientEmail);
  if (reservedEmail && reservedEmail !== flow.clientEmail) {
    setFlash(req, 'error', 'This key is reserved for a different client email.');
    return res.redirect('/client/unlock');
  }

  if (licenseRecord.expiresAt) {
    const expiresAt = new Date(licenseRecord.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      setFlash(req, 'error', 'This license key has expired. Ask your mentor for a new one.');
      return res.redirect('/client/unlock');
    }
  }

  const startedAt = new Date();
  const endsAt = addMonths(startedAt, plan.durationMonths);
  const subscription = createClientSubscription({
    mentorId: mentor.id,
    mentorPortalId: mentor.mentorPortalId,
    clientEmail: flow.clientEmail,
    planCode: plan.code,
    durationMonths: plan.durationMonths,
    amountZar: plan.amountZar,
    robotId: licenseRecord.robotId || null,
    robotName: licenseRecord.robotName || '',
    licenseDurationCode: licenseRecord.durationCode || '',
    licenseDurationLabel: licenseRecord.durationLabel || '',
    licenseKeyExpiresAt: licenseRecord.expiresAt || null,
    licenseKey: normalizeLicenseInput(licenseRecord.key),
    licenseNumber: licenseRecord.licenseNumber,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'active',
  });

  updateLicenseKey(licenseRecord.id, {
    status: 'redeemed',
    deviceId: incomingDeviceId,
    activatedAt: new Date().toISOString(),
    usageCount: Number(licenseRecord.usageCount || 0) + 1,
    redeemedByClientEmail: flow.clientEmail,
    redeemedAt: new Date().toISOString(),
    subscriptionId: subscription.id,
  });

  delete req.session.clientFlow;
  req.session.lastClientSubscriptionId = subscription.id;
  return res.redirect(`/client/success/${subscription.id}`);
});

app.get('/client/success/:subscriptionId', (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Subscription record not found.');
    return res.redirect('/client');
  }

  const mentor = getUserById(subscription.mentorId);
  const plan = getClientPlan(subscription.planCode);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  return res.render('client-success', {
    title: 'Subscription Complete',
    subscription,
    mentor,
    plan,
    featuredRobot,
  });
});

app.get('/client/robot/:subscriptionId', async (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    setFlash(req, 'error', 'Subscription expired. Please renew your plan.');
    return res.redirect('/client');
  }

  const mentor = getUserById(subscription.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  const plan = getClientPlan(subscription.planCode);
  const requestedSection = normalizeClientRobotSection(req.query.section);
  const activeSection = requestedSection;
  const brokerConnections = Array.isArray(subscription.brokerConnections)
    ? subscription.brokerConnections
    : [];
  const symbols = getMentorAvailableSymbols(featuredRobot);
  const symbolConfigs = getClientSymbolConfigMap(subscription, symbols);
  const availableSymbolMap = getMentorAvailableSymbolsMap(symbols);
  const configuredSymbolRows = Object.keys(symbolConfigs)
    .map((symbol) => symbolConfigs[symbol])
    .sort((a, b) => String(a.symbol || '').localeCompare(String(b.symbol || '')));
  const quoteRows = symbols.map((symbol) => {
    const safeToken = makeSymbolFieldToken(symbol);
    const config = symbolConfigs[symbol] || null;
    const normalized = config || {
      lotSize: DEFAULT_SYMBOL_CONFIG.lotSize,
      maxTrades: DEFAULT_SYMBOL_CONFIG.maxTrades,
      direction: DEFAULT_SYMBOL_CONFIG.direction,
    };
    return {
      symbol,
      lotSize: Number(normalized.lotSize),
      maxTrades: Number(normalized.maxTrades),
      direction: normalized.direction,
      safeToken,
      config,
      selected: Boolean(config),
    };
  });
  const allowedQuoteRows = configuredSymbolRows.map((item) => ({
    symbol: item.symbol,
    lotSize: Number(item.lotSize),
    direction: item.direction,
    maxTrades: Number(item.maxTrades),
    safeToken: makeSymbolFieldToken(item.symbol),
    selected: true,
  }));
  const executionState = normalizeTradeExecutionState(subscription.tradeExecution);
  const chartScannerState = normalizeChartScannerState(subscription.chartScanner);
  const activeBrokerConnection = getActiveBrokerConnection(brokerConnections, 'MT5');
  const copyTradingFeedback = listSignalJobsBySubscription(subscription.id)
    .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.createdAt || 0) || 0))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      action: item.action,
      symbol: item.symbol || 'ALL',
      status: item.executionStatus,
      platform: item.platform,
      orderId: item.resultOrderId || '',
      errorCode: item.errorCode || '',
      errorMessage: item.errorMessage || '',
      updatedAt: item.updatedAt || item.createdAt,
    }));
  const mentorProtection = mentor ? getMentorNewsProtectionSettings(mentor) : getMentorNewsProtectionSettings({});
  const mobileEvents = await getUpcomingForexEvents(new Date(), {
    filter: 'today',
    includeLowImpact: false,
    limit: 10,
  });
  const mobileHighImpactEvents = (mobileEvents.items || [])
    .filter((item) => normalizeForexImpact(item.impactLevel || item.impact) === 'high')
    .slice(0, 5);
  const selectedSymbolLookup = Object.create(null);
  for (const symbol of Object.keys(symbolConfigs)) {
    selectedSymbolLookup[symbol] = true;
  }

  return res.render('client-robot-interface', {
    title: 'Robot Interface',
    subscription,
    mentor,
    featuredRobot,
    defaultRobotName: DEFAULT_ROBOT_NAME,
    plan,
    activeSection,
    backgroundMediaLibrary: CLIENT_BACKGROUND_MEDIA_LIBRARY,
    defaultBackgroundMediaId: CLIENT_DEFAULT_BACKGROUND_MEDIA_ID,
    sectionLabel: activeSection === 'metatrader' ? 'MetaTrader' : '',
    brokerOptions: METRADER_BROKERS,
    brokerAssetClasses: METATRADER_ASSET_CLASSES,
    serverSuggestions: METATRADER_SERVER_SUGGESTIONS,
    metatraderConnectionStatus: activeBrokerConnection
      ? sanitizeConnection(activeBrokerConnection)
      : null,
    activeBrokerConnection,
    brokerConnections,
    quoteRows: quoteRows,
    allowedQuoteRows,
    configuredSymbolRows,
    selectedSymbolLookup,
    symbolConfigs,
    defaultSymbolConfigs: DEFAULT_SYMBOL_CONFIG,
    executionState,
    chartScannerState,
    copyTradingFeedback,
    mentorProtection,
    mobileHighImpactEvents,
    mobileEventBanner: mobileEvents.banner,
    mobileVolatility: mobileEvents.volatility,
    executionSymbolRows: buildExecutionSymbolRows(availableSymbolMap, symbolConfigs, executionState),
    tradeExecutionMessage: '',
  });
});

app.post('/client/robot/:subscriptionId/settings', (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  const body = req.body || {};
  const copyTradingEnabled = String(body.copyTradingEnabled || '').trim().toLowerCase();
  const notificationsEnabled = String(body.notificationsEnabled || '').trim().toLowerCase();
  const nextCopyTradingEnabled =
    copyTradingEnabled === 'on' || copyTradingEnabled === 'true' || copyTradingEnabled === 'yes';
  const nextNotificationsEnabled =
    notificationsEnabled === 'on' || notificationsEnabled === 'true' || notificationsEnabled === 'yes';

  updateClientSubscription(subscription.id, {
    copyTradingEnabled: nextCopyTradingEnabled,
    notificationsEnabled: nextNotificationsEnabled,
    copyTradingStatus: nextCopyTradingEnabled ? 'ready' : 'disabled',
  });

  setFlash(req, 'success', 'App settings updated.');
  return res.redirect(`/client/robot/${subscription.id}?section=settings`);
});

app.post('/client/robot/:subscriptionId/add-robot-license', (req, res) => {
  const currentSubscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!currentSubscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  const body = req.body || {};
  const enteredLicenseKey = normalizeLicenseInput(body.licenseKey || body.key || '');
  if (!enteredLicenseKey) {
    setFlash(req, 'error', 'Enter a valid license key.');
    return res.redirect(`/client/robot/${currentSubscription.id}?section=add-robot`);
  }

  const mentor = getUserById(currentSubscription.mentorId);
  if (!mentor) {
    setFlash(req, 'error', 'Mentor account not found.');
    return res.redirect('/client');
  }

  const licenseRecord = getLicenseKeyByMentorAndKey(mentor.id, enteredLicenseKey);
  if (!licenseRecord) {
    setFlash(req, 'error', 'Invalid license key for this mentor.');
    return res.redirect(`/client/robot/${currentSubscription.id}?section=add-robot`);
  }

  if (isLicenseKeyRedeemed(licenseRecord)) {
    setFlash(req, 'error', 'This license key has already been used.');
    return res.redirect(`/client/robot/${currentSubscription.id}?section=add-robot`);
  }

  const reservedEmail = normalizeEmail(licenseRecord.reservedClientEmail);
  if (reservedEmail && reservedEmail !== normalizeEmail(currentSubscription.clientEmail)) {
    setFlash(req, 'error', 'This key is reserved for another email.');
    return res.redirect(`/client/robot/${currentSubscription.id}?section=add-robot`);
  }

  if (licenseRecord.expiresAt) {
    const expiresAtMs = Date.parse(licenseRecord.expiresAt || 0) || 0;
    if (expiresAtMs && expiresAtMs < Date.now()) {
      setFlash(req, 'error', 'This license key has expired.');
      return res.redirect(`/client/robot/${currentSubscription.id}?section=add-robot`);
    }
  }

  const now = new Date();
  const plan = getClientPlan(currentSubscription.planCode) || CLIENT_PLANS.month_1;
  const newSubscription = createClientSubscription({
    mentorId: currentSubscription.mentorId,
    mentorPortalId: currentSubscription.mentorPortalId,
    clientEmail: currentSubscription.clientEmail,
    planCode: plan.code,
    durationMonths: plan.durationMonths,
    amountZar: 0,
    robotId: licenseRecord.robotId || null,
    robotName: licenseRecord.robotName || '',
    licenseDurationCode: licenseRecord.durationCode || '',
    licenseDurationLabel: licenseRecord.durationLabel || '',
    licenseKeyExpiresAt: licenseRecord.expiresAt || null,
    licenseKey: normalizeLicenseInput(licenseRecord.key),
    licenseNumber: licenseRecord.licenseNumber,
    startedAt: now.toISOString(),
    endsAt: addMonths(now, plan.durationMonths).toISOString(),
    status: 'active',
    copyTradingEnabled: currentSubscription.copyTradingEnabled !== false,
    notificationsEnabled: currentSubscription.notificationsEnabled !== false,
  });

  updateLicenseKey(licenseRecord.id, {
    status: 'redeemed',
    redeemedByClientEmail: normalizeEmail(currentSubscription.clientEmail),
    redeemedAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    usageCount: Number(licenseRecord.usageCount || 0) + 1,
    subscriptionId: newSubscription.id,
  });

  setFlash(req, 'success', 'New robot unlocked successfully.');
  return res.redirect(`/client/robot/${newSubscription.id}?section=home`);
});

function handleClientSymbolConfigRequest(req, res) {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    setFlash(req, 'error', 'Subscription expired. Please renew your plan.');
    return res.redirect('/client');
  }

  const mentor = getUserById(subscription.mentorId);
  if (!mentor) {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/client');
  }

  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  const symbols = getMentorAvailableSymbols(featuredRobot);
  const savedSymbols = upsertClientSymbolConfigs(subscription, symbols, req.body);

  if (savedSymbols.length) {
    setFlash(
      req,
      'success',
      `${savedSymbols.length} allowed symbol${savedSymbols.length === 1 ? '' : 's'} configured.`
    );
  } else {
    setFlash(req, 'success', 'Allowed symbols cleared. Add symbols when you are ready.');
  }

  return res.redirect(`/client/robot/${subscription.id}?section=quotes`);
}

app.post('/client/robot/:subscriptionId/symbols/configure', handleClientSymbolConfigRequest);
app.post('/client/robot/:subscriptionId/symbols/allowed', handleClientSymbolConfigRequest);

function handleClientMetaTraderConnect(req, res) {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    setFlash(req, 'error', 'Subscription expired. Please renew your plan.');
    return res.redirect('/client');
  }

  const body = req.body || {};
  const platform = normalizePlatform(String(body.platform || '').trim());
  const selectedBroker = String(body.brokerName || '').trim();
  const customBrokerName = String(body.customBrokerName || '').trim();
  const accountNumber = String(body.accountNumber || '').trim();
  const serverName = String(body.serverName || '').trim();
  const password = String(body.password || '').trim();
  const assetClass = String(body.assetClass || '').trim();
  const brokerName = resolveBrokerName(selectedBroker, customBrokerName);

  if (platform !== 'MT4' && platform !== 'MT5') {
    setFlash(req, 'error', 'Please select MT4 or MT5.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  if (!brokerName) {
    setFlash(req, 'error', 'Please provide a broker name.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  if (!accountNumber) {
    setFlash(req, 'error', 'Account number is required.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  if (!serverName) {
    setFlash(req, 'error', 'Broker server is required.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  if (!password) {
    setFlash(req, 'error', 'Password is required.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  if (!isAllowedBrokerAssetClass(assetClass)) {
    setFlash(req, 'error', 'Please select a valid asset class.');
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  const existingConnections = Array.isArray(subscription.brokerConnections)
    ? subscription.brokerConnections
    : [];
  const passwordParts = createPasswordHash(password);
  const newConnection = {
    id: `brk_${Date.now()}`,
    platform,
    brokerName,
    accountNumber,
    serverName,
    assetClass,
    passwordSalt: passwordParts.salt,
    passwordHash: passwordParts.hash,
    status: 'connected',
    connectedAt: new Date().toISOString(),
  };

  updateClientSubscription(subscription.id, {
    brokerConnections: [newConnection, ...existingConnections],
  });

  setFlash(
    req,
    'success',
    `${platform} broker connected: ${brokerName}. Razor Markets and other brokers are supported.`
  );
  return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
}

app.post('/client/robot/:subscriptionId/metatrader/connect', handleClientMetaTraderConnect);
app.post('/client/robot/:subscriptionId/metrader/connect', handleClientMetaTraderConnect);

app.post('/client/robot/:subscriptionId/scanner/analyze', (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    return res.status(404).json({ ok: false, message: 'Robot session not found.' });
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    return res.status(403).json({ ok: false, message: 'Subscription expired. Please renew your plan.' });
  }

  const body = req.body || {};
  const imageData = String(body.imageData || '').trim();
  if (!imageData) {
    return res.status(400).json({ ok: false, message: 'Upload a chart screenshot first.' });
  }

  const mentor = getUserById(subscription.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  const robotName = sanitizeRobotName(featuredRobot ? featuredRobot.name : DEFAULT_ROBOT_NAME);
  const mentorSymbols = getMentorAvailableSymbols(featuredRobot);
  const symbolConfigs = getClientSymbolConfigMap(subscription, mentorSymbols);
  const allowedSymbols = Object.keys(symbolConfigs);
  const requestedSymbol = normalizeSymbolToken(body.symbol || '');
  const symbol =
    (requestedSymbol && symbolConfigs[requestedSymbol] && requestedSymbol) ||
    allowedSymbols[0] ||
    mentorSymbols[0] ||
    'EURUSD';
  const trimmedImageData = imageData.length > 280000 ? imageData.slice(0, 280000) : imageData;
  const analysis = buildChartScannerAnalysis({
    imageData: trimmedImageData,
    symbol,
    robotName,
  });

  updateClientSubscription(subscription.id, {
    chartScanner: {
      analysis,
      analyzedAt: analysis.analyzedAt,
      status: 'ready',
    },
  });

  return res.json({ ok: true, analysis });
});

app.post('/client/robot/:subscriptionId/scanner/execute', async (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    return res.status(404).json({ ok: false, message: 'Robot session not found.' });
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    return res.status(403).json({ ok: false, message: 'Subscription expired. Please renew your plan.' });
  }

  const body = req.body || {};
  const scannerState = normalizeChartScannerState(subscription.chartScanner);
  const mentor = getUserById(subscription.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  const robotName = sanitizeRobotName(featuredRobot ? featuredRobot.name : DEFAULT_ROBOT_NAME);
  const mentorSymbols = getMentorAvailableSymbols(featuredRobot);
  const symbolConfigs = getClientSymbolConfigMap(subscription, mentorSymbols);
  const requestedSymbol = normalizeSymbolToken(
    body.symbol || (scannerState && scannerState.symbol) || ''
  );
  const configuredSymbols = Object.keys(symbolConfigs);
  const symbol =
    (requestedSymbol && symbolConfigs[requestedSymbol] && requestedSymbol) ||
    configuredSymbols[0] ||
    '';
  if (!symbol) {
    return res.status(400).json({ ok: false, message: 'No configured symbol found. Configure Allowed Symbols first.' });
  }

  const symbolConfig = symbolConfigs[symbol];
  if (!symbolConfig) {
    return res.status(400).json({ ok: false, message: 'Symbol is not allowed for this robot.' });
  }

  const platform = normalizePlatform(body.platform || 'MT5');
  const requestedDirection = normalizeDirection(
    body.direction || (scannerState && scannerState.direction) || ''
  );
  if (!requestedDirection) {
    return res.status(400).json({ ok: false, message: 'Scanner direction is missing. Analyze chart first.' });
  }

  const maxTrades = toNonNegativeInteger(symbolConfig.maxTrades, 0);
  const normalizedDirection =
    symbolConfig.direction === 'BOTH' ? requestedDirection : symbolConfig.direction;
  if (symbolConfig.direction !== 'BOTH' && normalizedDirection !== requestedDirection) {
    return res.status(400).json({
      ok: false,
      message: `Direction not allowed for ${symbol}. Allowed: ${symbolConfig.direction}.`,
    });
  }

  const connection = getActiveBrokerConnection(subscription.brokerConnections, platform);
  if (!connection || !connection.platform || !connection.brokerName || !connection.accountNumber) {
    return res.status(400).json({
      ok: false,
      message: `No active ${platform} connection found. Connect in MetaTrader first.`,
    });
  }

  const executionState = normalizeTradeExecutionState(subscription.tradeExecution);
  const currentSymbolState = executionState.bySymbol[symbol] || {
    count: 0,
    lastExecutedAt: null,
    lastOrderId: null,
    lastDirection: null,
    lastSymbol: null,
    lastStatus: null,
  };
  if (maxTrades > 0 && Number(currentSymbolState.count || 0) >= maxTrades) {
    return res.status(400).json({ ok: false, message: `Max trades reached for ${symbol}.` });
  }

  const lotSize = parseDecimalInput(body.lotSize || symbolConfig.lotSize, symbolConfig.lotSize);
  const stopLoss = parseTradeLevelInput(body.stopLoss || (scannerState && scannerState.stopLoss) || '');
  const takeProfit = parseTradeLevelInput(body.takeProfit || (scannerState && scannerState.takeProfit) || '');
  const executeResult = await executeSignal({
    platform,
    symbol,
    direction: normalizedDirection,
    lotSize,
    maxTrades,
    stopLoss,
    takeProfit,
    connection,
    comment: `${robotName} scanner`,
    platformComment: robotName,
  });

  if (!executeResult || !executeResult.ok) {
    const reason = executeResult && executeResult.reason ? executeResult.reason : 'signal execution failed.';
    return res.status(400).json({ ok: false, message: `Trade execution blocked: ${reason}` });
  }

  const nextSymbolState = {
    ...currentSymbolState,
    count: Number(currentSymbolState.count || 0) + 1,
    lastExecutedAt: new Date().toISOString(),
    lastOrderId: executeResult.result ? executeResult.result.orderId : null,
    lastDirection: normalizedDirection,
    lastSymbol: symbol,
    lastStatus: 'sent',
  };
  executionState.total = Number(executionState.total || 0) + 1;
  executionState.bySymbol[symbol] = nextSymbolState;

  updateClientSubscription(subscription.id, {
    tradeExecution: executionState,
    chartScanner: {
      analysis: {
        ...(scannerState || {}),
        symbol,
        direction: normalizedDirection,
        stopLoss,
        takeProfit,
      },
      analyzedAt: scannerState && scannerState.analyzedAt ? scannerState.analyzedAt : new Date().toISOString(),
      lastExecution: {
        orderId: nextSymbolState.lastOrderId || '',
        executedAt: nextSymbolState.lastExecutedAt,
      },
      status: 'executed',
    },
  });

  return res.json({
    ok: true,
    message: `Trade executed for ${symbol}. Order ${nextSymbolState.lastOrderId || 'queued'} sent to ${platform}.`,
    orderId: nextSymbolState.lastOrderId || '',
    symbol,
    direction: normalizedDirection,
  });
});

app.post('/client/robot/:subscriptionId/trade/execute', async (req, res) => {
  const subscription = getClientSubscriptionById(req.params.subscriptionId);
  if (!subscription) {
    setFlash(req, 'error', 'Robot session not found.');
    return res.redirect('/client');
  }

  if (!isSubscriptionActiveNow(subscription, new Date())) {
    setFlash(req, 'error', 'Subscription expired. Please renew your plan.');
    return res.redirect('/client');
  }

  const body = req.body || {};
  const symbol = normalizeSymbolToken(body.symbol || '');
  if (!symbol) {
    setFlash(req, 'error', 'Select a symbol to execute.');
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const platform = normalizePlatform(body.platform || 'MT5');
  const requestedDirection = normalizeDirection(body.direction || '');
  if (!requestedDirection) {
    setFlash(req, 'error', 'Choose a valid execution direction.');
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const mentor = getUserById(subscription.mentorId);
  const mentorRobots = mentor ? listRobotsByMentor(mentor.id) : [];
  const featuredRobot = pickSubscriptionRobot(
    subscription,
    mentorRobots,
    mentor ? mentor.id : subscription.mentorId
  );
  const robotName = sanitizeRobotName(featuredRobot ? featuredRobot.name : DEFAULT_ROBOT_NAME);
  const mentorSymbols = getMentorAvailableSymbols(featuredRobot);
  const symbolConfigs = getClientSymbolConfigMap(subscription, mentorSymbols);
  const symbolConfig = symbolConfigs[symbol];
  if (!symbolConfig) {
    setFlash(req, 'error', 'Symbol is not allowed for this robot.');
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const maxTrades = toNonNegativeInteger(symbolConfig.maxTrades, 0);
  const normalizedDirection =
    symbolConfig.direction === 'BOTH' ? requestedDirection : symbolConfig.direction;
  if (symbolConfig.direction !== 'BOTH' && normalizedDirection !== requestedDirection) {
    setFlash(
      req,
      'error',
      `Direction not allowed for ${symbol}. Allowed: ${symbolConfig.direction}.`
    );
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const connection = getActiveBrokerConnection(subscription.brokerConnections, platform);
  if (!connection || !connection.platform || !connection.brokerName || !connection.accountNumber) {
    setFlash(req, 'error', `No active ${platform} connection found. Connect in MetaTrader first.`);
    return res.redirect(`/client/robot/${subscription.id}?section=metatrader`);
  }

  const executionState = normalizeTradeExecutionState(subscription.tradeExecution);
  const currentSymbolState = executionState.bySymbol[symbol] || {
    count: 0,
    lastExecutedAt: null,
    lastOrderId: null,
    lastDirection: null,
    lastSymbol: null,
    lastStatus: null,
  };
  if (maxTrades > 0 && Number(currentSymbolState.count || 0) >= maxTrades) {
    setFlash(req, 'error', `Max trades reached for ${symbol}.`);
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const lotSize = parseDecimalInput(body.lotSize || symbolConfig.lotSize, symbolConfig.lotSize);
  const stopLoss = parseTradeLevelInput(body.stopLoss);
  const takeProfit = parseTradeLevelInput(body.takeProfit);
  const executeResult = await executeSignal({
    platform,
    symbol,
    direction: normalizedDirection,
    lotSize,
    maxTrades,
    stopLoss,
    takeProfit,
    connection,
    comment: `${robotName} signal`,
    platformComment: robotName,
  });

  if (!executeResult || !executeResult.ok) {
    const reason = executeResult && executeResult.reason ? executeResult.reason : 'signal execution failed.';
    setFlash(req, 'error', `Trade execution blocked: ${reason}`);
    return res.redirect(`/client/robot/${subscription.id}?section=trade`);
  }

  const nextSymbolState = {
    ...currentSymbolState,
    count: Number(currentSymbolState.count || 0) + 1,
    lastExecutedAt: new Date().toISOString(),
    lastOrderId: executeResult.result ? executeResult.result.orderId : null,
    lastDirection: normalizedDirection,
    lastSymbol: symbol,
    lastStatus: 'sent',
  };
  executionState.total = Number(executionState.total || 0) + 1;
  executionState.bySymbol[symbol] = nextSymbolState;

  updateClientSubscription(subscription.id, {
    tradeExecution: executionState,
  });

  setFlash(
    req,
    'success',
    `Trade executed for ${symbol}. Order ${nextSymbolState.lastOrderId || 'queued'} sent to ${platform}.`
  );
  return res.redirect(`/client/robot/${subscription.id}?section=trade`);
});

app.get('/mentor/dashboard', requireAuth, requireRole('mentor'), async (req, res) => {
  const now = new Date();
  const query = req.query || {};
  const currentSection = normalizeMentorDashboardSection(req.query && req.query.section);
  const dashboard = buildOperatorDashboard(req.currentUser.id, now);
  if (!dashboard) {
    setFlash(req, 'error', 'Account not found.');
    return res.redirect('/signin');
  }

  const forexFilter = normalizeForexFilter(query.forexFilter || query.eventsFilter || 'today');
  const forexCurrency = normalizeForexCurrencyFilter(query.forexCurrency || query.currency || '');
  const forexEvents = await getUpcomingForexEvents(now, {
    filter: forexFilter,
    currency: forexCurrency,
    includeLowImpact: true,
    limit: 120,
  });
  const copyTradingSignals = listSignalRecordsByMentor(req.currentUser.id)
    .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
  const copyTradingJobs = listSignalJobsByMentor(req.currentUser.id)
    .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
  const copyTradingSummary = {
    totalSignals: copyTradingSignals.length,
    queuedJobs: copyTradingJobs.filter((item) =>
      ['queued', 'retry_wait', 'dispatched', 'processing'].includes(
        String(item.executionStatus || '').trim().toLowerCase()
      )
    ).length,
    executedJobs: copyTradingJobs.filter((item) => String(item.executionStatus || '').trim().toLowerCase() === 'executed').length,
    failedJobs: copyTradingJobs.filter((item) => String(item.executionStatus || '').trim().toLowerCase() === 'failed').length,
  };
  const mentorProtection = getMentorNewsProtectionSettings(dashboard.account);

  res.render('mentor-dashboard', {
    title: 'Mentor Dashboard',
    mentor: dashboard.account,
    robots: dashboard.robots,
    licenseKeys: dashboard.licenseKeys.map(attachLicenseKeyDisplay),
    activeKeysUsed: dashboard.activeKeysUsed,
    dashboardTotals: dashboard.dashboardTotals,
    businessMetrics: dashboard.businessMetrics,
    defaultSymbolsText: QUOTE_SYMBOLS.join(', '),
    licenseDurationOptions: LICENSE_KEY_DURATION_LIST,
    dashboardDateLabel: formatDashboardDate(now),
    forexEvents,
    forexFilter,
    forexCurrency,
    forexFilterOptions: FOREX_FILTER_OPTIONS,
    forexCurrencyOptions: FOREX_CURRENCY_OPTIONS,
    mentorProtection,
    signalActionOptions: SIGNAL_ACTIONS,
    copyTradingSummary,
    copyTradingSignals: copyTradingSignals.slice(0, 25),
    copyTradingJobs: copyTradingJobs.slice(0, 60),
    currentSection,
    mobilePreviews: getMobilePreviewCatalog(),
  });
});

app.post('/mentor/business-settings', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const robotPricePerKey = Number(body.robotPricePerKey);
  const monthlyKeyTarget = Number(body.monthlyKeyTarget);
  const businessCurrency = normalizeBusinessCurrency(body.businessCurrency);

  if (!Number.isFinite(robotPricePerKey) || robotPricePerKey < 0) {
    setFlash(req, 'error', 'Robot price must be a non-negative number.');
    return res.redirect('/mentor/dashboard?section=track-business#track-business');
  }

  if (!Number.isInteger(monthlyKeyTarget) || monthlyKeyTarget < 0) {
    setFlash(req, 'error', 'Monthly key target must be a non-negative whole number.');
    return res.redirect('/mentor/dashboard?section=track-business#track-business');
  }

  updateUser(req.currentUser.id, {
    robotPricePerKey: toCurrencyNumber(robotPricePerKey),
    monthlyKeyTarget,
    businessCurrency,
  });

  setFlash(req, 'success', 'Business settings updated.');
  return res.redirect('/mentor/dashboard?section=track-business#track-business');
});

app.post('/mentor/profile', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  updateUser(req.currentUser.id, {
    name: String(body.name || '').trim() || req.currentUser.name,
    profileHeadline: String(body.profileHeadline || '').trim(),
    profileBio: String(body.profileBio || '').trim(),
    profilePhone: String(body.profilePhone || '').trim(),
    profileImageUrl: String(body.profileImageUrl || '').trim(),
  });

  setFlash(req, 'success', 'My profile updated for portal view.');
  return res.redirect('/mentor/dashboard?section=my-profile#my-profile');
});

app.post('/mentor/robots', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const rawName = String(body.name || '').trim();
  if (!rawName) {
    setFlash(req, 'error', 'EA name is required (include version).');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }
  const name = sanitizeRobotName(rawName);

  const confirmAdmin = String(body.confirmAdmin || '').trim().toLowerCase();
  if (confirmAdmin !== 'yes') {
    setFlash(req, 'error', 'Please confirm that you are an admin before adding a new EA.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const parseNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const allowedSymbols = parseSymbolsInput(body.allowedSymbols);
  const requestedImageUrl = String(body.imageUrl || '').trim();
  const imageUrl = resolveRobotImageUrl(requestedImageUrl, `${req.currentUser.id}:${name}`, name);

  createRobot({
    mentorId: req.currentUser.id,
    name,
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    commentTag: String(body.commentTag || '').trim() || name,
    tradingMode: String(body.tradingMode || '').trim() || 'automated',
    riskProfile: String(body.riskProfile || '').trim() || 'balanced',
    licenseRequired: true,
    version: String(body.version || '').trim() || 'v1.0.0',
    status: String(body.status || '').trim() || 'draft',
    imageUrl,
    allowedSymbols: allowedSymbols.length ? allowedSymbols : QUOTE_SYMBOLS.slice(),
    keyStats: {
      uptimeHours: parseNumber(body.uptimeHours),
      tasksCompleted: parseNumber(body.tasksCompleted),
      successRate: parseNumber(body.successRate),
      lastSync: String(body.lastSync || '').trim() || 'Not provided',
    },
  });

  setFlash(req, 'success', 'Robot profile created successfully.');
  return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
});

app.post('/mentor/robots/:robotId/symbols', requireAuth, requireRole('mentor'), (req, res) => {
  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const allowedSymbols = parseSymbolsInput(req.body && req.body.allowedSymbols);
  if (!allowedSymbols.length) {
    setFlash(req, 'error', 'Add at least one symbol for this robot.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  updateRobot(robot.id, {
    allowedSymbols,
  });

  setFlash(req, 'success', `Allowed symbols updated for ${robot.name}.`);
  return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
});

app.post('/mentor/robots/:robotId/image', requireAuth, requireRole('mentor'), (req, res) => {
  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const requestedImageUrl = String(req.body && req.body.imageUrl || '').trim();
  const imageSeed = `${req.currentUser.id}:${robot.id}:${robot.name || ''}`;
  const imageUrl = resolveRobotImageUrl(requestedImageUrl, imageSeed, robot.name);

  updateRobot(robot.id, {
    imageUrl,
  });

  setFlash(req, 'success', `Hero image updated for ${robot.name}.`);
  return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
});

app.post('/mentor/license-keys/generate', requireAuth, requireRole('mentor'), async (req, res) => {
  const body = req.body || {};
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  const licenseKeys = listLicenseKeysByMentor(req.currentUser.id);
  const totalGenerated = licenseKeys.length;
  const clientName = String(body.clientName || '').trim();
  const reservedClientEmail = normalizeEmail(body.clientEmail);
  const robotId = String(body.robotId || '').trim();
  const durationOption = getLicenseDurationOption(body.durationCode);
  const robot = getRobotById(robotId);
  const confirmGenerate = String(body.confirmGenerate || '').trim().toLowerCase();

  if (!reservedClientEmail || !reservedClientEmail.includes('@')) {
    setFlash(req, 'error', 'Client email is required and must be valid.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Choose a valid expert advisor (robot) first.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  if (!durationOption) {
    setFlash(req, 'error', 'Choose a valid key duration.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  const robotDisplayName = sanitizeRobotName(robot.name);

  if (confirmGenerate !== 'yes') {
    setFlash(req, 'error', 'Please confirm that you want to generate this license key.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  if (totalGenerated >= mentor.licenseKeyLimit) {
    setFlash(req, 'error', 'License limit reached. Ask the superhost to increase your limit.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  const createdAt = new Date();
  const expiresAt = calculateLicenseKeyExpiresAt(createdAt, durationOption);
  const createdKey = createLicenseKey({
    mentorId: req.currentUser.id,
    status: 'available',
    reservedClientEmail,
    robotId: robot.id,
    robotName: robotDisplayName,
    durationCode: durationOption.code,
    durationLabel: durationOption.label,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  });
  if (!createdKey) {
    setFlash(req, 'error', 'Could not generate a license key right now.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  const emailResult = await sendLicenseKeyEmail({
    mentorName: mentor.name,
    mentorEmail: mentor.email,
    mentorPortalId: mentor.mentorPortalId,
    clientName,
    clientEmail: reservedClientEmail,
    key: formatLicenseKeyForDisplay(createdKey.key),
    robotName: robotDisplayName,
    durationLabel: durationOption.label,
    expiresAt: createdKey.expiresAt,
  });

  if (emailResult.sent) {
    updateLicenseKey(createdKey.id, {
      emailSentAt: new Date().toISOString(),
    });
    setFlash(
      req,
      'success',
      `Key ${formatLicenseKeyForDisplay(createdKey.key)} generated for ${reservedClientEmail}, emailed automatically, and ready to copy from dashboard.`
    );
  } else {
    setFlash(
      req,
      'success',
      `Key ${formatLicenseKeyForDisplay(createdKey.key)} generated for ${reservedClientEmail}. Email not sent (${emailResult.reason}).`
    );
  }
  return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
});

app.post('/mentor/license-keys/:licenseKeyId/reactivate', requireAuth, requireRole('mentor'), (req, res) => {
  const licenseKey = getLicenseKeyById(req.params.licenseKeyId);
  if (!licenseKey || licenseKey.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'License key not found.');
    return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
  }

  updateLicenseKey(licenseKey.id, {
    status: 'available',
    deviceId: null,
    activatedAt: null,
    usageCount: 0,
    redeemedByClientEmail: null,
    redeemedAt: null,
    subscriptionId: null,
  });

  setFlash(req, 'success', `License key ${formatLicenseKeyForDisplay(licenseKey.key)} has been reactivated.`);
  return res.redirect('/mentor/dashboard?section=generate-key#generate-key');
});

app.post('/mentor/copy-trading/settings', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const mode = String(body.newsProtectionMode || '').trim().toLowerCase();
  const config = getNewsProtectionModeConfig(mode);
  const newsProtectionEnabled = String(body.newsProtectionEnabled || '').trim().toLowerCase();
  const enabled = newsProtectionEnabled === 'on' || newsProtectionEnabled === 'true' || newsProtectionEnabled === 'yes';

  updateUser(req.currentUser.id, {
    newsProtectionMode: config.key,
    newsProtectionEnabled: enabled,
  });

  setFlash(req, 'success', `Copy trading protection updated (${config.label}).`);
  return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
});

app.post('/mentor/copy-trading/signals', requireAuth, requireRole('mentor'), async (req, res) => {
  const body = req.body || {};
  const now = new Date();
  const mentor = getUserById(req.currentUser.id);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor account not found.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  const action = normalizeSignalAction(body.action || body.signalType || '');
  const robotId = String(body.robotId || '').trim();
  const platform = normalizePlatform(body.platform || 'MT5');
  const symbol = normalizeSymbolToken(body.symbol || '');
  const direction = normalizeDirection(body.direction || action);
  const stopLoss = parseTradeLevelInput(body.stopLoss || '');
  const takeProfit = parseTradeLevelInput(body.takeProfit || '');
  const lotSize = parseDecimalInput(body.lotSize || '', DEFAULT_SYMBOL_CONFIG.lotSize);

  if (!action) {
    setFlash(req, 'error', 'Choose a valid signal action.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  const robot = getRobotById(robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Choose one of your robots before sending a signal.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  if (requiresSymbolForAction(action) && !symbol) {
    setFlash(req, 'error', 'A symbol is required for this signal action.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  const allowedSymbols = getMentorAvailableSymbols(robot);
  if (requiresSymbolForAction(action) && !allowedSymbols.includes(symbol)) {
    setFlash(req, 'error', 'This symbol is not allowed for the selected robot.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  const fingerprint = buildSignalFingerprint({
    mentorId: mentor.id,
    robotId: robot.id,
    action,
    symbol,
    direction,
    platform,
    lotSize,
    stopLoss,
    takeProfit,
  });
  const duplicate = findRecentSignalByFingerprint(mentor.id, fingerprint, 45 * 1000);
  if (duplicate && ['queued', 'processing', 'completed'].includes(String(duplicate.status || '').toLowerCase())) {
    setFlash(req, 'error', 'Duplicate signal blocked. Wait a moment before resending.');
    return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
  }

  const protection = getMentorNewsProtectionSettings(mentor);
  const protectionEvents = await getUpcomingForexEvents(now, {
    filter: 'today',
    includeLowImpact: false,
    limit: 120,
  });
  const gate = evaluateNewsProtectionGate({
    events: protectionEvents.items,
    symbol,
    modeConfig: protection,
    nowDate: now,
  });

  const robotComment = String(body.robotComment || robot.commentTag || robot.name || DEFAULT_ROBOT_NAME).trim();
  const signalRecord = createSignalRecord({
    mentorId: mentor.id,
    mentorPortalId: mentor.mentorPortalId,
    robotId: robot.id,
    robotName: sanitizeRobotName(robot.name),
    action,
    direction,
    symbol,
    lotSize,
    stopLoss,
    takeProfit,
    platform,
    comment: robotComment,
    fingerprint,
    status: 'queued',
    source: 'mentor_portal',
  });

  createAuditLog({
    mentorId: mentor.id,
    signalId: signalRecord.id,
    actor: 'mentor_portal',
    eventType: 'signal_created',
    detail: `${action} ${symbol || 'ALL'} on ${platform}`,
    meta: {
      robotId: robot.id,
      robotName: robot.name,
      protectionMode: protection.mode,
      protectionGate: gate,
    },
  });

  const subscriptions = listClientSubscriptionsByMentor(mentor.id).filter((item) => {
    if (!item || !isSubscriptionActiveNow(item, now)) {
      return false;
    }
    return String(item.robotId || '').trim() === robot.id;
  });

  const jobsToCreate = [];
  let blockedByRules = 0;
  for (const subscription of subscriptions) {
    if (subscription.copyTradingEnabled === false) {
      blockedByRules += 1;
      createAuditLog({
        mentorId: mentor.id,
        signalId: signalRecord.id,
        actor: 'signal_filter',
        eventType: 'user_skipped',
        detail: `${subscription.clientEmail}: copy trading disabled`,
      });
      continue;
    }

    const activeConnection = getActiveBrokerConnection(subscription.brokerConnections, platform);
    if (!activeConnection) {
      blockedByRules += 1;
      createAuditLog({
        mentorId: mentor.id,
        signalId: signalRecord.id,
        actor: 'signal_filter',
        eventType: 'user_skipped',
        detail: `${subscription.clientEmail}: broker not connected (${platform})`,
      });
      continue;
    }

    const symbolConfigs = getClientSymbolConfigMap(subscription, allowedSymbols);
    const symbolConfig = requiresSymbolForAction(action) ? symbolConfigs[symbol] : null;
    if (requiresSymbolForAction(action) && !symbolConfig) {
      blockedByRules += 1;
      createAuditLog({
        mentorId: mentor.id,
        signalId: signalRecord.id,
        actor: 'signal_filter',
        eventType: 'user_skipped',
        detail: `${subscription.clientEmail}: symbol not configured (${symbol})`,
      });
      continue;
    }

    if (action === 'BUY' || action === 'SELL') {
      const allowedDirection = symbolConfig && symbolConfig.direction ? symbolConfig.direction : 'BOTH';
      if (allowedDirection !== 'BOTH' && allowedDirection !== direction) {
        blockedByRules += 1;
        createAuditLog({
          mentorId: mentor.id,
          signalId: signalRecord.id,
          actor: 'signal_filter',
          eventType: 'user_skipped',
          detail: `${subscription.clientEmail}: direction not allowed (${allowedDirection})`,
        });
        continue;
      }

      const executionState = normalizeTradeExecutionState(subscription.tradeExecution);
      const symbolState = executionState.bySymbol[symbol] || { count: 0 };
      const maxTrades = toNonNegativeInteger(symbolConfig.maxTrades, 1);
      if (maxTrades > 0 && Number(symbolState.count || 0) >= maxTrades) {
        blockedByRules += 1;
        createAuditLog({
          mentorId: mentor.id,
          signalId: signalRecord.id,
          actor: 'signal_filter',
          eventType: 'user_skipped',
          detail: `${subscription.clientEmail}: max trades reached (${symbol})`,
        });
        continue;
      }
    }

    if (isSignalActionOrderLike(action) && gate.active && gate.blocked) {
      blockedByRules += 1;
      createAuditLog({
        mentorId: mentor.id,
        signalId: signalRecord.id,
        actor: 'news_protection',
        eventType: 'user_blocked',
        detail: `${subscription.clientEmail}: blocked by news protection.`,
        meta: { symbol, gate },
      });
      continue;
    }

    const symbolForJob = requiresSymbolForAction(action)
      ? normalizeBridgeSymbol(symbol, activeConnection && activeConnection.brokerName)
      : '';
    const defaultLotSize = symbolConfig ? Number(symbolConfig.lotSize || lotSize) : lotSize;
    const jobStatus = isSignalActionOrderLike(action) && gate.active && gate.delayMinutes > 0
      ? 'retry_wait'
      : 'queued';
    const nextRetryAt = jobStatus === 'retry_wait'
      ? new Date(now.getTime() + gate.delayMinutes * 60 * 1000).toISOString()
      : null;

    jobsToCreate.push({
      signalId: signalRecord.id,
      userId: subscription.id,
      mentorId: mentor.id,
      mentorPortalId: mentor.mentorPortalId,
      robotId: robot.id,
      subscriptionId: subscription.id,
      symbol: symbolForJob,
      action,
      direction: action === 'BUY' || action === 'SELL' ? direction : '',
      lotSize: defaultLotSize,
      stopLoss,
      takeProfit,
      robotComment,
      platform,
      executionStatus: jobStatus,
      errorCode: jobStatus === 'retry_wait' ? 'NEWS_PROTECTION_DELAY' : '',
      errorMessage: jobStatus === 'retry_wait' ? gate.reason : '',
      retryCount: 0,
      maxRetries: BRIDGE_MAX_RETRIES,
      nextRetryAt,
    });
  }

  createSignalJobsBulk(jobsToCreate);
  updateSignalRecord(signalRecord.id, {
    targetCount: subscriptions.length,
    queuedCount: jobsToCreate.filter((item) => item.executionStatus === 'queued').length,
    blockedCount: blockedByRules,
    status: jobsToCreate.length ? 'processing' : 'failed',
  });

  await dispatchSignalJobQueue({ limit: 80 });

  const immediateQueuedCount = jobsToCreate.filter((item) => item.executionStatus === 'queued').length;
  const delayedCount = jobsToCreate.filter((item) => item.executionStatus === 'retry_wait').length;
  setFlash(
    req,
    'success',
    `Signal queued. ${immediateQueuedCount} immediate, ${delayedCount} delayed, ${blockedByRules} blocked by rules.`
  );
  return res.redirect('/mentor/dashboard?section=copy-trading#copy-trading');
});

app.post('/mentor/robots/:robotId/convert-mobile', requireAuth, requireRole('mentor'), (req, res) => {
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  updateRobot(robot.id, {
    mobileBuild: {
      status: 'ready',
      platforms: ['android', 'ios'],
      convertedAt: new Date().toISOString(),
    },
  });

  setFlash(req, 'success', `${robot.name} converted for mobile delivery (Android + iOS).`);
  return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
});

app.post('/mentor/robots/:robotId/test', requireAuth, requireRole('mentor'), (req, res) => {
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
  }

  setFlash(req, 'success', `Test started for ${robot.name}.`);
  return res.redirect('/mentor/dashboard?section=manage-eas#manage-eas');
});

app.get('/superhost/dashboard', requireAuth, requireRole('superhost'), async (req, res) => {
  const now = new Date();
  const query = req.query || {};
  const currentSection = normalizeSuperhostDashboardSection(query.section);
  const mentorSearchQueryRaw = String(query.userSearch || '').trim();
  const mentorSearchQuery = mentorSearchQueryRaw.toLowerCase();
  const superhostLab = buildOperatorDashboard(req.currentUser.id, now);
  const forexEvents = await getUpcomingForexEvents(now);

  const mentorRows = listMentors().map((mentor) => {
    const robots = listRobotsByMentor(mentor.id);
    const keys = listLicenseKeysByMentor(mentor.id);
    const clientSubscriptions = listClientSubscriptionsByMentor(mentor.id);
    const activeKeysUsed = keys.filter((item) => isLicenseKeyRedeemed(item)).length;
    const activeSubscribers = clientSubscriptions.filter((item) =>
      isSubscriptionActiveNow(item, now)
    ).length;
    const pendingEmailsCount = keys.filter(
      (item) => item.reservedClientEmail && !item.emailSentAt
    ).length;
    const isPending = !mentor.approved;
    const isBlocked = mentor.approved && !mentor.subscriptionActive;
    const accountState = isPending ? 'pending' : isBlocked ? 'blocked' : 'active';

    return {
      ...mentor,
      robotsCount: robots.length,
      activeKeysUsed,
      totalKeys: keys.length,
      activeSubscribers,
      pendingEmailsCount,
      licenseKeys: keys.map(attachLicenseKeyDisplay),
      clientSubscriptions,
      accountState,
    };
  });

  const mentors = mentorSearchQuery
    ? mentorRows.filter((mentor) =>
        [
          mentor.name,
          mentor.email,
          mentor.profilePhone,
          String(mentor.mentorPortalId || ''),
        ].some((value) => String(value || '').toLowerCase().includes(mentorSearchQuery))
      )
    : mentorRows;

  const userMetrics = {
    totalUsers: mentorRows.length,
    activeUsers: mentorRows.filter((mentor) => mentor.accountState === 'active').length,
    pendingUsers: mentorRows.filter((mentor) => mentor.accountState === 'pending').length,
    blockedUsers: mentorRows.filter((mentor) => mentor.accountState === 'blocked').length,
  };

  const pendingEmails = mentorRows
    .flatMap((mentor) =>
      mentor.licenseKeys
        .filter((item) => item.reservedClientEmail && !item.emailSentAt)
        .map((item) => ({
          id: item.id,
          key: formatLicenseKeyForDisplay(item.key),
          clientEmail: item.reservedClientEmail,
          robotName: item.robotName || 'Not set',
          durationLabel: item.durationLabel || 'Not set',
          mentorName: mentor.name,
          mentorPortalId: mentor.mentorPortalId,
          createdAt: item.createdAt,
          createdLabel: formatDashboardDate(item.createdAt),
        }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentUsers = [...mentorRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((mentor) => ({
      ...mentor,
      createdLabel: formatDashboardDate(mentor.createdAt),
    }));

  const paidSubscriptions = mentorRows
    .flatMap((mentor) =>
      mentor.clientSubscriptions.map((subscription) => ({
        ...subscription,
        mentorName: mentor.name,
        mentorPortalId: mentor.mentorPortalId,
      }))
    )
    .filter((subscription) => Number(subscription.amountZar) > 0)
    .sort((a, b) => {
      const aTime = new Date(a.startedAt || a.createdAt).getTime();
      const bTime = new Date(b.startedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

  const totalRevenueZar = sumAmount(paidSubscriptions.map((subscription) => subscription.amountZar));
  const monthlyRevenueZar = sumAmount(
    paidSubscriptions
      .filter((subscription) => isInSameMonth(subscription.startedAt || subscription.createdAt, now))
      .map((subscription) => subscription.amountZar)
  );

  const packageBreakdownMap = new Map();
  for (const subscription of paidSubscriptions) {
    const plan = getClientPlan(subscription.planCode);
    const amountZar = toCurrencyNumber(subscription.amountZar);
    const planCode = plan ? plan.code : String(subscription.planCode || 'other');
    const planLabel = plan ? plan.label : String(subscription.planCode || 'Unknown Plan');
    if (!packageBreakdownMap.has(planCode)) {
      packageBreakdownMap.set(planCode, {
        planCode,
        planLabel,
        count: 0,
        totalZar: 0,
      });
    }
    const existing = packageBreakdownMap.get(planCode);
    existing.count += 1;
    existing.totalZar += amountZar;
  }

  const packageBreakdownRows = [...packageBreakdownMap.values()]
    .map((item) => ({
      ...item,
      totalZar: toCurrencyNumber(item.totalZar),
      totalUsd: convertZarToUsd(item.totalZar),
    }))
    .sort((a, b) => b.totalZar - a.totalZar);

  const revenueRows = paidSubscriptions.slice(0, 40).map((subscription) => {
    const plan = getClientPlan(subscription.planCode);
    const amountZar = toCurrencyNumber(subscription.amountZar);
    return {
      id: subscription.id,
      dateLabel: formatDashboardDate(subscription.startedAt || subscription.createdAt),
      planLabel: plan ? plan.label : String(subscription.planCode || 'Unknown Plan'),
      mentorName: subscription.mentorName,
      mentorPortalId: subscription.mentorPortalId,
      clientEmail: subscription.clientEmail,
      amountZar,
      amountUsd: convertZarToUsd(amountZar),
      endsAtLabel: formatDashboardDate(subscription.endsAt),
    };
  });

  const revenueMetrics = {
    totalPaidSubscriptions: paidSubscriptions.length,
    monthlyPaidSubscriptions: paidSubscriptions.filter((subscription) =>
      isInSameMonth(subscription.startedAt || subscription.createdAt, now)
    ).length,
    totalRevenueZar: toCurrencyNumber(totalRevenueZar),
    monthlyRevenueZar: toCurrencyNumber(monthlyRevenueZar),
    totalRevenueUsd: convertZarToUsd(totalRevenueZar),
    monthlyRevenueUsd: convertZarToUsd(monthlyRevenueZar),
    exchangeRateUsdZar: USD_EXCHANGE_RATE,
  };

  const platformTotals = {
    totalMentors: mentorRows.length,
    totalKeys: mentorRows.reduce((sum, mentor) => sum + Number(mentor.licenseKeyLimit || 0), 0),
    totalGenerated: mentorRows.reduce((sum, mentor) => sum + Number(mentor.totalKeys || 0), 0),
    activeSubscribers: mentorRows.reduce((sum, mentor) => sum + Number(mentor.activeSubscribers || 0), 0),
  };
  const storageStatusRaw = getStorageStatus();
  const storageStatus = {
    dataFilePath: storageStatusRaw.dataFilePath,
    dataDirPath: storageStatusRaw.dataDirPath,
    exists: storageStatusRaw.exists,
    sizeBytes: storageStatusRaw.sizeBytes,
    sizeKb: toCurrencyNumber(Number(storageStatusRaw.sizeBytes || 0) / 1024),
    lastUpdatedAt: storageStatusRaw.lastUpdatedAt,
    lastUpdatedLabel: formatDashboardDateTime(storageStatusRaw.lastUpdatedAt),
  };

  res.render('superhost-dashboard', {
    title: 'Superhost Dashboard',
    mentors,
    superhostLab,
    platformTotals,
    userMetrics,
    recentUsers,
    pendingEmails,
    revenueMetrics,
    revenueRows,
    packageBreakdownRows,
    mentorSearchQueryRaw,
    storageStatus,
    defaultSymbolsText: QUOTE_SYMBOLS.join(', '),
    currentSection,
    licenseDurationOptions: LICENSE_KEY_DURATION_LIST,
    dashboardDateLabel: formatDashboardDate(now),
    forexEvents,
    mobilePreviews: getMobilePreviewCatalog(),
  });
});

app.post('/superhost/business-settings', requireAuth, requireRole('superhost'), (req, res) => {
  const body = req.body || {};
  const robotPricePerKey = Number(body.robotPricePerKey);
  const monthlyKeyTarget = Number(body.monthlyKeyTarget);
  const businessCurrency = normalizeBusinessCurrency(body.businessCurrency);

  if (!Number.isFinite(robotPricePerKey) || robotPricePerKey < 0) {
    setFlash(req, 'error', 'Robot price must be a non-negative number.');
    return res.redirect('/superhost/dashboard?section=track-business#track-business');
  }

  if (!Number.isInteger(monthlyKeyTarget) || monthlyKeyTarget < 0) {
    setFlash(req, 'error', 'Monthly key target must be a non-negative whole number.');
    return res.redirect('/superhost/dashboard?section=track-business#track-business');
  }

  updateUser(req.currentUser.id, {
    robotPricePerKey: toCurrencyNumber(robotPricePerKey),
    monthlyKeyTarget,
    businessCurrency,
  });

  setFlash(req, 'success', 'Superhost lab business settings updated.');
  return res.redirect('/superhost/dashboard?section=track-business#track-business');
});

app.post('/superhost/profile', requireAuth, requireRole('superhost'), (req, res) => {
  const body = req.body || {};
  updateUser(req.currentUser.id, {
    name: String(body.name || '').trim() || req.currentUser.name,
    profileHeadline: String(body.profileHeadline || '').trim(),
    profileBio: String(body.profileBio || '').trim(),
    profilePhone: String(body.profilePhone || '').trim(),
    profileImageUrl: String(body.profileImageUrl || '').trim(),
  });

  setFlash(req, 'success', 'Superhost lab profile updated.');
  return res.redirect('/superhost/dashboard?section=my-profile#my-profile');
});

app.post('/superhost/robots', requireAuth, requireRole('superhost'), (req, res) => {
  const body = req.body || {};
  const superhost = getUserById(req.currentUser.id);
  if (!superhost.subscriptionActive) {
    setFlash(req, 'error', 'Superhost lab subscription is inactive.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const rawName = String(body.name || '').trim();
  if (!rawName) {
    setFlash(req, 'error', 'EA name is required (include version).');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }
  const name = sanitizeRobotName(rawName);

  const confirmAdmin = String(body.confirmAdmin || '').trim().toLowerCase();
  if (confirmAdmin !== 'yes') {
    setFlash(req, 'error', 'Please confirm that you are an admin before adding a new EA.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const parseNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const requestedImageUrl = String(body.imageUrl || '').trim();
  const imageUrl = resolveRobotImageUrl(requestedImageUrl, `${req.currentUser.id}:${name}`, name);

  createRobot({
    mentorId: req.currentUser.id,
    name,
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    commentTag: String(body.commentTag || '').trim() || name,
    tradingMode: String(body.tradingMode || '').trim() || 'automated',
    riskProfile: String(body.riskProfile || '').trim() || 'balanced',
    licenseRequired: true,
    version: String(body.version || '').trim() || 'v1.0.0',
    status: String(body.status || '').trim() || 'draft',
    imageUrl,
    allowedSymbols: parseSymbolsInput(body.allowedSymbols),
    keyStats: {
      uptimeHours: parseNumber(body.uptimeHours),
      tasksCompleted: parseNumber(body.tasksCompleted),
      successRate: parseNumber(body.successRate),
      lastSync: String(body.lastSync || '').trim() || new Date().toISOString(),
    },
  });

  setFlash(req, 'success', 'Superhost test robot profile created.');
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/robots/:robotId/symbols', requireAuth, requireRole('superhost'), (req, res) => {
  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const symbols = parseSymbolsInput(req.body && req.body.allowedSymbols);
  if (!symbols.length) {
    setFlash(req, 'error', 'Please provide at least one valid symbol.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  updateRobot(robot.id, {
    allowedSymbols: symbols,
  });

  setFlash(req, 'success', `Allowed symbols updated for ${robot.name}.`);
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/robots/:robotId/image', requireAuth, requireRole('superhost'), (req, res) => {
  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const requestedImageUrl = String(req.body && req.body.imageUrl || '').trim();
  const imageSeed = `${req.currentUser.id}:${robot.id}:${robot.name || ''}`;
  const imageUrl = resolveRobotImageUrl(requestedImageUrl, imageSeed, robot.name);

  updateRobot(robot.id, {
    imageUrl,
  });

  setFlash(req, 'success', `Hero image updated for ${robot.name}.`);
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/license-keys/generate', requireAuth, requireRole('superhost'), async (req, res) => {
  const superhost = getUserById(req.currentUser.id);
  if (!superhost.subscriptionActive) {
    setFlash(req, 'error', 'Superhost lab subscription is inactive.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const body = req.body || {};
  const reservedClientEmail = normalizeEmail(body.clientEmail);
  const robotId = String(body.robotId || '').trim();
  const durationOption = getLicenseDurationOption(body.durationCode);
  const robot = getRobotById(robotId);
  const totalGenerated = listLicenseKeysByMentor(req.currentUser.id).length;
  if (!reservedClientEmail || !reservedClientEmail.includes('@')) {
    setFlash(req, 'error', 'Client email is required and must be valid.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Choose a valid expert advisor (robot).');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  if (!durationOption) {
    setFlash(req, 'error', 'Choose a valid key duration.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const robotDisplayName = sanitizeRobotName(robot.name);

  if (totalGenerated >= superhost.licenseKeyLimit) {
    setFlash(req, 'error', 'You reached your current superhost test key limit.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const createdAt = new Date();
  const expiresAt = calculateLicenseKeyExpiresAt(createdAt, durationOption);
  const createdKey = createLicenseKey({
    mentorId: req.currentUser.id,
    status: 'available',
    reservedClientEmail,
    robotId: robot.id,
    robotName: robotDisplayName,
    durationCode: durationOption.code,
    durationLabel: durationOption.label,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  });

  if (!createdKey) {
    setFlash(req, 'error', 'Could not generate a license key right now.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const emailResult = await sendLicenseKeyEmail({
    mentorName: superhost.name,
    mentorEmail: superhost.email,
    mentorPortalId: superhost.mentorPortalId || 'SUPERHOST',
    clientEmail: reservedClientEmail,
    key: formatLicenseKeyForDisplay(createdKey.key),
    robotName: robotDisplayName,
    durationLabel: durationOption.label,
    expiresAt: createdKey.expiresAt,
  });

  if (emailResult.sent) {
    updateLicenseKey(createdKey.id, {
      emailSentAt: new Date().toISOString(),
    });
    setFlash(
      req,
      'success',
      `Key ${formatLicenseKeyForDisplay(createdKey.key)} generated, emailed to ${reservedClientEmail}, and ready to copy from dashboard.`
    );
  } else {
    setFlash(
      req,
      'success',
      `Key ${formatLicenseKeyForDisplay(createdKey.key)} generated for ${reservedClientEmail}. Email not sent (${emailResult.reason}).`
    );
  }
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/license-keys/:licenseKeyId/reactivate', requireAuth, requireRole('superhost'), (req, res) => {
  const licenseKey = getLicenseKeyById(req.params.licenseKeyId);
  if (!licenseKey) {
    setFlash(req, 'error', 'License key not found.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  updateLicenseKey(licenseKey.id, {
    status: 'available',
    deviceId: null,
    activatedAt: null,
    usageCount: 0,
    redeemedByClientEmail: null,
    redeemedAt: null,
    subscriptionId: null,
  });

  setFlash(req, 'success', `License key ${formatLicenseKeyForDisplay(licenseKey.key)} has been reactivated.`);
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/robots/:robotId/convert-mobile', requireAuth, requireRole('superhost'), (req, res) => {
  const superhost = getUserById(req.currentUser.id);
  if (!superhost.subscriptionActive) {
    setFlash(req, 'error', 'Superhost lab subscription is inactive.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
  }

  updateRobot(robot.id, {
    mobileBuild: {
      status: 'ready',
      platforms: ['android', 'ios'],
      convertedAt: new Date().toISOString(),
    },
  });

  setFlash(req, 'success', `${robot.name} converted for mobile delivery (Android + iOS).`);
  return res.redirect('/superhost/dashboard?section=my-robots#my-robots');
});

app.post('/superhost/theme', requireAuth, requireRole('superhost'), (req, res) => {
  const body = req.body || {};
  const preset = String(body.preset || '').trim();

  if (preset && THEME_PRESETS[preset]) {
    updatePortalTheme(THEME_PRESETS[preset].colors);
    setFlash(req, 'success', `${THEME_PRESETS[preset].label} theme applied.`);
    return res.redirect('/superhost/dashboard?section=portal-theme#portal-theme');
  }

  const themeUpdates = {
    primary: normalizeHexColor(body.primary, '#ff445b'),
    secondary: normalizeHexColor(body.secondary, '#ffc1c9'),
    tertiary: normalizeHexColor(body.tertiary, '#f7f8ff'),
    accentPink: normalizeHexColor(body.accentPink, '#ff6f85'),
    bgStart: normalizeHexColor(body.bgStart, '#09080c'),
    bgEnd: normalizeHexColor(body.bgEnd, '#1a1117'),
    glow: normalizeHexColor(body.glow, '#ffe7eb'),
  };

  updatePortalTheme(themeUpdates);
  setFlash(req, 'success', 'Portal theme updated.');
  return res.redirect('/superhost/dashboard?section=portal-theme#portal-theme');
});

app.get('/superhost/mentors/:mentorId', requireAuth, requireRole('superhost'), (req, res) => {
  const details = getMentorDetails(req.params.mentorId);

  if (!details) {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard?section=users#users');
  }

  const mentorDetails = {
    ...details,
    licenseKeys: (details.licenseKeys || []).map(attachLicenseKeyDisplay),
  };

  return res.render('superhost-mentor-details', {
    title: 'Mentor Details',
    details: mentorDetails,
  });
});

app.post('/superhost/mentors/:mentorId/approval', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard?section=users#users');
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const approved = action === 'approve';
  updateUser(mentor.id, { approved });

  setFlash(req, 'success', approved ? `${mentor.email} approved.` : `${mentor.email} approval revoked.`);
  return res.redirect('/superhost/dashboard?section=users#users');
});

app.post('/superhost/mentors/:mentorId/subscription', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard?section=users#users');
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const subscriptionActive = action === 'activate';
  updateUser(mentor.id, { subscriptionActive });

  setFlash(
    req,
    'success',
    subscriptionActive
      ? `${mentor.email} subscription reactivated/bypassed.`
      : `${mentor.email} subscription deactivated.`
  );
  return res.redirect('/superhost/dashboard?section=users#users');
});

app.post('/superhost/mentors/:mentorId/license-limit', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard?section=users#users');
  }

  const body = req.body || {};
  const limit = Number(body.limit);
  if (!Number.isInteger(limit) || limit < 0) {
    setFlash(req, 'error', 'License key limit must be a non-negative integer.');
    return res.redirect('/superhost/dashboard?section=users#users');
  }

  updateUser(mentor.id, { licenseKeyLimit: limit });
  setFlash(req, 'success', `License key limit updated for ${mentor.email}.`);
  return res.redirect('/superhost/dashboard?section=users#users');
});

app.post('/superhost/mentors/bulk-activate', requireAuth, requireRole('superhost'), (_req, res) => {
  const mentors = listMentors();
  let updatedCount = 0;
  for (const mentor of mentors) {
    const shouldUpdate = !mentor.approved || !mentor.subscriptionActive;
    if (!shouldUpdate) {
      continue;
    }
    updateUser(mentor.id, {
      approved: true,
      subscriptionActive: true,
    });
    updatedCount += 1;
  }

  setFlash(
    _req,
    'success',
    `Bulk activate complete. ${updatedCount} mentor account${updatedCount === 1 ? '' : 's'} updated.`
  );
  return res.redirect('/superhost/dashboard?section=users#users');
});

app.get('/superhost/exports/mentor-emails.csv', requireAuth, requireRole('superhost'), (_req, res) => {
  const mentors = listMentors();
  const csvRows = [
    [
      'Name',
      'Email',
      'Mentor ID',
      'Approved',
      'Subscription Active',
      'Phone',
      'Created At',
    ],
  ];

  for (const mentor of mentors) {
    csvRows.push([
      mentor.name || '',
      mentor.email || '',
      mentor.mentorPortalId || '',
      mentor.approved ? 'Yes' : 'No',
      mentor.subscriptionActive ? 'Yes' : 'No',
      mentor.profilePhone || '',
      mentor.createdAt || '',
    ]);
  }

  const csvContent = csvRows
    .map((row) => row.map(toCsvCell).join(','))
    .join('\n');
  const dateLabel = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="future-ea-pro-mentor-emails-${dateLabel}.csv"`
  );
  return res.send(csvContent);
});

app.use((_req, res) => {
  res.status(404).render('not-found', { title: 'Not Found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`${APP_NAME} (${APP_SLUG}) running on http://localhost:${PORT}`);
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function startBridgeOrchestratorLoops() {
  const queueIntervalMs = Number(process.env.BRIDGE_QUEUE_INTERVAL_MS || 2500);
  const healthIntervalMs = Number(process.env.BRIDGE_HEALTH_INTERVAL_MS || 10000);

  setInterval(async () => {
    try {
      await dispatchSignalJobQueue({ limit: 120 });
    } catch (_error) {
      // Ignore queue loop errors and continue on next cycle.
    }
  }, Math.max(1000, queueIntervalMs));

  setInterval(() => {
    try {
      cleanupStaleBridgeSessions(new Date());
    } catch (_error) {
      // Ignore health cleanup errors and continue on next cycle.
    }
  }, Math.max(5000, healthIntervalMs));
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    setFlash(req, 'error', 'Please sign in first.');
    return res.redirect('/signin');
  }
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.currentUser || req.currentUser.role !== role) {
      setFlash(req, 'error', 'Access denied for this page.');
      return res.redirect('/dashboard');
    }
    return next();
  };
}

function normalizeMentorDashboardSection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'generate-keys') {
    return 'generate-key';
  }
  const allowed = new Set([
    'overview',
    'my-profile',
    'track-business',
    'manage-eas',
    'generate-key',
    'copy-trading',
    'forex-events',
    'app-previews',
  ]);

  if (!allowed.has(normalized)) {
    return 'overview';
  }

  return normalized;
}

function normalizeSuperhostDashboardSection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'client-keys' || normalized === 'create-robot') {
    return 'my-robots';
  }
  const allowed = new Set([
    'overview',
    'users',
    'pending-emails',
    'revenue',
    'my-profile',
    'track-business',
    'my-robots',
    'forex-events',
    'portal-theme',
    'app-previews',
  ]);

  if (!allowed.has(normalized)) {
    return 'overview';
  }

  return normalized;
}

async function getUpcomingForexEvents(nowDate = new Date(), options = {}) {
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const filter = normalizeForexFilter(options.filter);
  const currencyFilter = normalizeForexCurrencyFilter(options.currency);
  const limit = Number.isInteger(Number(options.limit))
    ? Math.max(1, Math.min(200, Number(options.limit)))
    : 80;
  const includeLowImpact = options.includeLowImpact !== false;
  const { windowStart, windowEnd } = getForexWindowRange(now, filter);

  const feedItems = await fetchForexEventsFeedItems();
  const mapped = feedItems
    .map(normalizeForexEventItem)
    .filter(Boolean)
    .filter((item) => item.date.getTime() >= windowStart.getTime())
    .filter((item) => item.date.getTime() <= windowEnd.getTime())
    .filter((item) => item.date.getTime() >= now.getTime())
    .filter((item) => isRelevantForexEvent(item, includeLowImpact))
    .filter((item) => !currencyFilter || item.currency === currencyFilter)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
    .map((item) => {
      const countdownMs = item.date.getTime() - now.getTime();
      const dayLabel = new Intl.DateTimeFormat('en-ZA', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        timeZone: 'Africa/Johannesburg',
      }).format(item.date);
      const timeLabel = new Intl.DateTimeFormat('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Johannesburg',
      }).format(item.date);

      return {
        id: `${item.date.getTime()}_${item.currency}_${item.title}`
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_'),
        title: item.title,
        country: item.country,
        currency: item.currency,
        impact: item.impact,
        impactLevel: normalizeForexImpact(item.impact),
        forecast: item.forecast || '-',
        previous: item.previous || '-',
        actual: item.actual || '-',
        affectedSymbols: mapCurrencyToSymbols(item.currency),
        dayLabel,
        timeLabel,
        timestamp: item.date.toISOString(),
        countdownMs,
        countdownLabel: formatEventCountdown(countdownMs),
      };
    });

  const summary = buildForexImpactSummary(mapped);
  const nextHighImpact = mapped.find((item) => item.impactLevel === 'high') || null;
  const banner = buildForexImpactBanner(filter, summary, nextHighImpact);

  return {
    filter,
    currencyFilter: currencyFilter || '',
    generatedAt: now.toISOString(),
    fromLabel: formatDashboardDate(windowStart),
    toLabel: formatDashboardDate(windowEnd),
    items: mapped,
    summary,
    nextHighImpact,
    banner,
    volatility: inferForexVolatilityLevel(summary, mapped),
  };
}

function normalizeForexFilter(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'tomorrow') {
    return 'tomorrow';
  }
  if (normalized === 'week' || normalized === 'this-week') {
    return 'week';
  }
  if (normalized === 'two_weeks' || normalized === '2weeks') {
    return 'two_weeks';
  }
  return 'today';
}

function normalizeForexCurrencyFilter(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized || normalized === 'ALL') {
    return '';
  }
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function getForexWindowRange(nowDate, filter) {
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const start = new Date(now.getTime());
  const end = new Date(now.getTime());

  if (filter === 'tomorrow') {
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(23, 59, 59, 999);
    return { windowStart: start, windowEnd: end };
  }

  if (filter === 'week') {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { windowStart: start, windowEnd: end };
  }

  if (filter === 'two_weeks') {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 13);
    end.setHours(23, 59, 59, 999);
    return { windowStart: start, windowEnd: end };
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { windowStart: start, windowEnd: end };
}

function normalizeForexImpact(value) {
  const impact = String(value || '').trim().toLowerCase();
  if (impact.startsWith('high')) {
    return 'high';
  }
  if (impact.startsWith('med')) {
    return 'medium';
  }
  return 'low';
}

function formatEventCountdown(countdownMs) {
  if (!Number.isFinite(Number(countdownMs))) {
    return '-';
  }
  const ms = Math.max(0, Number(countdownMs));
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}m`;
}

function buildForexImpactSummary(items) {
  const summary = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const item of Array.isArray(items) ? items : []) {
    const level = normalizeForexImpact(item && item.impactLevel ? item.impactLevel : item && item.impact);
    summary.total += 1;
    if (level === 'high') {
      summary.high += 1;
      continue;
    }
    if (level === 'medium') {
      summary.medium += 1;
      continue;
    }
    summary.low += 1;
  }

  return summary;
}

function buildForexImpactBanner(filter, summary, nextHighImpact) {
  const label = filter === 'tomorrow' ? 'Tomorrow' : filter === 'week' ? 'This Week' : 'Today';
  const high = Number(summary && summary.high ? summary.high : 0);
  const medium = Number(summary && summary.medium ? summary.medium : 0);
  const low = Number(summary && summary.low ? summary.low : 0);
  const nextText = nextHighImpact
    ? ` Next high impact: ${nextHighImpact.currency} ${nextHighImpact.title} in ${nextHighImpact.countdownLabel}.`
    : '';
  return `${label}: ${high} high, ${medium} medium, ${low} low impact events.${nextText}`.trim();
}

function inferForexVolatilityLevel(summary, items) {
  const high = Number(summary && summary.high ? summary.high : 0);
  const medium = Number(summary && summary.medium ? summary.medium : 0);
  const nextFewHoursCount = (Array.isArray(items) ? items : []).filter((item) => {
    const countdown = Number(item && item.countdownMs);
    return Number.isFinite(countdown) && countdown <= 6 * 60 * 60 * 1000;
  }).length;

  if (high >= 3 || nextFewHoursCount >= 5) {
    return 'high';
  }
  if (high >= 1 || medium >= 3 || nextFewHoursCount >= 2) {
    return 'medium';
  }
  return 'normal';
}

function mapCurrencyToSymbols(currencyValue) {
  const currency = String(currencyValue || '').trim().toUpperCase();
  const baseMap = {
    USD: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'XAUUSD', 'US30', 'USTECH'],
    EUR: ['EURUSD', 'EURGBP', 'EURJPY', 'EURAUD'],
    GBP: ['GBPUSD', 'EURGBP', 'GBPJPY', 'GBPAUD'],
    JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY'],
    AUD: ['AUDUSD', 'AUDJPY', 'EURAUD', 'GBPAUD'],
    CAD: ['USDCAD', 'CADJPY', 'EURCAD'],
    CHF: ['USDCHF', 'EURCHF', 'CHFJPY'],
    NZD: ['NZDUSD', 'EURNZD', 'GBPNZD'],
    XAU: ['XAUUSD'],
  };

  return baseMap[currency] || [];
}

function getNewsProtectionModeConfig(modeValue) {
  const normalized = String(modeValue || '').trim().toLowerCase();
  return NEWS_PROTECTION_MODES[normalized] || NEWS_PROTECTION_MODES[DEFAULT_NEWS_PROTECTION_MODE];
}

function getMentorNewsProtectionSettings(mentor) {
  const mode = getNewsProtectionModeConfig(mentor && mentor.newsProtectionMode);
  const enabled = mentor && mentor.newsProtectionEnabled !== false;
  return {
    enabled,
    mode: mode.key,
    modeLabel: mode.label,
    pauseBeforeMinutes: mode.pauseBeforeMinutes,
    pauseAfterMinutes: mode.pauseAfterMinutes,
    behavior: mode.behavior,
  };
}

function isSignalActionOrderLike(actionValue) {
  const action = normalizeSignalAction(actionValue);
  return action === 'BUY' || action === 'SELL' || action === 'PARTIAL_CLOSE';
}

function evaluateNewsProtectionGate({ events, symbol, modeConfig, nowDate }) {
  if (!modeConfig || !modeConfig.enabled) {
    return {
      active: false,
      blocked: false,
      delayMinutes: 0,
      reason: '',
      relatedEvents: [],
    };
  }

  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const normalizedSymbol = normalizeSymbolToken(symbol);
  const beforeMs = Number(modeConfig.pauseBeforeMinutes || 0) * 60 * 1000;
  const afterMs = Number(modeConfig.pauseAfterMinutes || 0) * 60 * 1000;

  const relatedEvents = (Array.isArray(events) ? events : []).filter((eventItem) => {
    if (normalizeForexImpact(eventItem && eventItem.impactLevel ? eventItem.impactLevel : eventItem.impact) !== 'high') {
      return false;
    }
    const eventSymbols = Array.isArray(eventItem && eventItem.affectedSymbols)
      ? eventItem.affectedSymbols.map((item) => normalizeSymbolToken(item))
      : [];
    if (!eventSymbols.length || !normalizedSymbol) {
      return true;
    }
    return eventSymbols.includes(normalizedSymbol);
  }).filter((eventItem) => {
    const eventTime = Date.parse(eventItem.timestamp || eventItem.date || 0) || 0;
    const diff = eventTime - now.getTime();
    return diff >= -afterMs && diff <= beforeMs;
  });

  if (!relatedEvents.length) {
    return {
      active: false,
      blocked: false,
      delayMinutes: 0,
      reason: '',
      relatedEvents: [],
    };
  }

  const nextEvent = relatedEvents
    .slice()
    .sort((a, b) => (Date.parse(a.timestamp || 0) || 0) - (Date.parse(b.timestamp || 0) || 0))[0];
  const nextEventMs = Date.parse(nextEvent.timestamp || 0) || 0;
  const delayMinutes = Math.max(1, Math.ceil((nextEventMs + afterMs - now.getTime()) / (60 * 1000)));

  if (modeConfig.behavior === 'block') {
    return {
      active: true,
      blocked: true,
      delayMinutes,
      reason: `News protection blocked execution near ${nextEvent.currency} ${nextEvent.title}.`,
      relatedEvents,
    };
  }

  if (modeConfig.behavior === 'delay') {
    return {
      active: true,
      blocked: false,
      delayMinutes,
      reason: `News protection delay suggested for ${delayMinutes} minute(s).`,
      relatedEvents,
    };
  }

  return {
    active: true,
    blocked: false,
    delayMinutes: 0,
    reason: '',
    relatedEvents,
  };
}

async function fetchForexEventsFeedItems() {
  const nowMs = Date.now();
  if (
    forexEventsCache &&
    Array.isArray(forexEventsCache.items) &&
    nowMs - Number(forexEventsCache.fetchedAtMs || 0) < FOREX_EVENTS_CACHE_TTL_MS
  ) {
    return forexEventsCache.items;
  }

  try {
    const response = await fetch(FOREX_EVENTS_FEED_URL);
    if (!response.ok) {
      return Array.isArray(forexEventsCache.items) ? forexEventsCache.items : [];
    }

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : [];
    forexEventsCache = {
      fetchedAtMs: nowMs,
      items,
    };
    return items;
  } catch (_error) {
    return Array.isArray(forexEventsCache.items) ? forexEventsCache.items : [];
  }
}

function normalizeForexEventItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const title = String(item.title || '').trim();
  const country = String(item.country || '').trim() || 'FX';
  const currency = String(item.currency || '').trim().toUpperCase() || country.toUpperCase();
  const impact = String(item.impact || '').trim() || 'Low';
  const forecast = String(item.forecast || '').trim();
  const previous = String(item.previous || '').trim();
  const actual = String(item.actual || '').trim();
  const dateRaw = String(item.date || '').trim();
  if (!title || !dateRaw) {
    return null;
  }

  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    title,
    country,
    currency,
    impact,
    forecast,
    previous,
    actual,
    date,
  };
}

function isRelevantForexEvent(eventItem, includeLowImpact = true) {
  const impact = String(eventItem.impact || '').trim().toLowerCase();
  if (impact === 'high' || impact === 'medium') {
    return true;
  }

  if (includeLowImpact && impact === 'low') {
    return true;
  }

  const title = String(eventItem.title || '').trim().toLowerCase();
  return FOREX_KEY_EVENT_KEYWORDS.some((keyword) => title.includes(keyword));
}

function formatDashboardDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  }).format(date);
}

function formatDashboardDateTime(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Johannesburg',
  }).format(date);
}

function formatTableDateTime(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date
    .toLocaleString('sv-SE', {
      hour12: false,
      timeZone: 'Africa/Johannesburg',
    })
    .replace('T', ' ')
    .replace(',', '');
}

function bootstrapSuperhost() {
  const users = listUsers();
  const existingByEmail = getUserByEmail(SUPERHOST_EMAIL);
  let superhostTarget = existingByEmail || users.find((user) => user.role === 'superhost') || null;

  const passwordData = createPasswordHash(SUPERHOST_PASSWORD);
  if (!superhostTarget) {
    createUser({
      name: 'Platform Superhost',
      email: SUPERHOST_EMAIL,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      role: 'superhost',
    });
    return;
  }

  const updates = {
    role: 'superhost',
    approved: true,
    subscriptionActive: true,
    licenseKeyLimit: 9999,
  };

  const emailTakenByAnother = users.some(
    (user) => user.id !== superhostTarget.id && String(user.email || '').trim().toLowerCase() === SUPERHOST_EMAIL
  );
  if (!emailTakenByAnother && superhostTarget.email !== SUPERHOST_EMAIL) {
    updates.email = SUPERHOST_EMAIL;
  }

  const passwordMatches = verifyPassword(
    SUPERHOST_PASSWORD,
    superhostTarget.passwordSalt,
    superhostTarget.passwordHash
  );
  if (!passwordMatches) {
    updates.passwordHash = passwordData.hash;
    updates.passwordSalt = passwordData.salt;
  }

  updateUser(superhostTarget.id, updates);
}

function bootstrapDefaultMentorAccount() {
  const targetPortalId =
    Number.isInteger(DEFAULT_TEST_MENTOR_PORTAL_ID) && DEFAULT_TEST_MENTOR_PORTAL_ID >= 100
      ? DEFAULT_TEST_MENTOR_PORTAL_ID
      : 100;

  const users = listUsers();
  const mentors = users.filter((user) => user.role === 'mentor');

  let mentorTarget =
    mentors.find((user) => Number(user.mentorPortalId) === targetPortalId) ||
    mentors.find((user) => normalizeEmail(user.email) === DEFAULT_TEST_MENTOR_EMAIL) ||
    null;

  if (!mentorTarget) {
    const passwordData = createPasswordHash(DEFAULT_TEST_MENTOR_PASSWORD);
    mentorTarget = createUser({
      name: DEFAULT_TEST_MENTOR_NAME || 'Future EA Pro Mentor',
      email: DEFAULT_TEST_MENTOR_EMAIL,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      role: 'mentor',
    });
  }

  if (!mentorTarget) {
    return;
  }

  const mentorRows = listUsers().filter((user) => user.role === 'mentor');
  const portalIdTakenByAnother = mentorRows.some(
    (user) => user.id !== mentorTarget.id && Number(user.mentorPortalId) === targetPortalId
  );

  const updates = {
    approved: true,
    subscriptionActive: true,
  };

  if (Number(mentorTarget.licenseKeyLimit || 0) < DEFAULT_TEST_MENTOR_LICENSE_LIMIT) {
    updates.licenseKeyLimit = DEFAULT_TEST_MENTOR_LICENSE_LIMIT;
  }

  if (!portalIdTakenByAnother && Number(mentorTarget.mentorPortalId) !== targetPortalId) {
    updates.mentorPortalId = targetPortalId;
  }

  mentorTarget = updateUser(mentorTarget.id, updates) || mentorTarget;

  const robots = listRobotsByMentor(mentorTarget.id);
  if (!robots.length) {
    createRobot({
      mentorId: mentorTarget.id,
      name: DEFAULT_TEST_ROBOT_NAME,
      description: 'Default onboarding robot profile for mobile identity tests.',
      category: 'Forex',
      commentTag: DEFAULT_TEST_ROBOT_NAME,
      tradingMode: 'automated',
      riskProfile: 'balanced',
      licenseRequired: true,
      version: 'v1.0.0',
      status: 'live',
      imageUrl: TEST_LADY_ROBOT_IMAGE_URL,
      allowedSymbols: QUOTE_SYMBOLS.slice(),
      keyStats: {
        uptimeHours: 0,
        tasksCompleted: 0,
        successRate: 0,
        lastSync: 'Not provided',
      },
    });
  }
}

function bootstrapDefaultBypassLicenseKey() {
  const mentorTarget = getMentorByPortalId(DEFAULT_TEST_MENTOR_PORTAL_ID);
  if (!mentorTarget) {
    return;
  }

  const targetClientEmail = normalizeEmail(DEFAULT_TEST_CLIENT_EMAIL);
  if (!targetClientEmail) {
    return;
  }

  const preferredLicenseKey = normalizeLicenseInput(DEFAULT_TEST_LICENSE_KEY);
  const isPreferredKeyValid = /^[A-Z0-9]{8}$/.test(preferredLicenseKey);
  const nowMs = Date.now();
  const mentorLicenseKeys = listLicenseKeysByMentor(mentorTarget.id);
  const isReusableReservedKey = (item) => {
    const reservedClientEmail = normalizeEmail(item && item.reservedClientEmail);
    if (!reservedClientEmail || reservedClientEmail !== targetClientEmail) {
      return false;
    }

    const status = String(item.status || 'available')
      .trim()
      .toLowerCase();
    if (status !== 'available' && status !== 'active') {
      return false;
    }

    if (isLicenseKeyRedeemed(item)) {
      return false;
    }

    if (!item.expiresAt) {
      return true;
    }

    const expiresAt = new Date(item.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > nowMs;
  };
  if (isPreferredKeyValid) {
    const preferredRecord = mentorLicenseKeys.find(
      (item) => normalizeLicenseInput(item && item.key) === preferredLicenseKey
    );
    if (preferredRecord) {
      const nextExpiresAt = new Date();
      nextExpiresAt.setMonth(nextExpiresAt.getMonth() + 12);
      updateLicenseKey(preferredRecord.id, {
        status: 'available',
        reservedClientEmail: targetClientEmail,
        redeemedByClientEmail: null,
        redeemedAt: null,
        subscriptionId: null,
        deviceId: null,
        activatedAt: null,
        usageCount: 0,
        durationCode: 'year_1',
        durationLabel: '1 Year',
        expiresAt: nextExpiresAt.toISOString(),
      });
      return;
    }

    const hasPreferredCollision = listLicenseKeys().some(
      (item) => normalizeLicenseInput(item.key) === preferredLicenseKey
    );
    if (!hasPreferredCollision) {
      const mentorRobots = listRobotsByMentor(mentorTarget.id);
      const featuredRobot = pickFeaturedRobot(mentorRobots, mentorTarget.id);
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 12);
      const createdPreferredKey = createLicenseKey({
        mentorId: mentorTarget.id,
        robotId: featuredRobot ? featuredRobot.id : null,
        robotName: featuredRobot ? featuredRobot.name : DEFAULT_TEST_ROBOT_NAME,
        durationCode: 'year_1',
        durationLabel: '1 Year',
        expiresAt: expiresAt.toISOString(),
        status: 'available',
        reservedClientEmail: targetClientEmail,
      });

      if (createdPreferredKey) {
        updateLicenseKey(createdPreferredKey.id, {
          key: preferredLicenseKey,
        });
      }
      return;
    }
  }

  const hasReusableKey = mentorLicenseKeys.some((item) => isReusableReservedKey(item));
  if (hasReusableKey) {
    return;
  }

  const mentorRobots = listRobotsByMentor(mentorTarget.id);
  const featuredRobot = pickFeaturedRobot(mentorRobots, mentorTarget.id);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 12);

  const createdKey = createLicenseKey({
    mentorId: mentorTarget.id,
    robotId: featuredRobot ? featuredRobot.id : null,
    robotName: featuredRobot ? featuredRobot.name : DEFAULT_TEST_ROBOT_NAME,
    durationCode: 'year_1',
    durationLabel: '1 Year',
    expiresAt: expiresAt.toISOString(),
    status: 'available',
    reservedClientEmail: targetClientEmail,
  });
}

function ensureDefaultThemePalette() {
  const currentTheme = getPortalTheme();
  if (!currentTheme) {
    updatePortalTheme(THEME_PRESETS.dope_red.colors);
    return;
  }

  if (
    isThemeMatch(currentTheme, LEGACY_INITIAL_THEME) ||
    isThemeMatch(currentTheme, LEGACY_DOPE_RED_THEME)
  ) {
    updatePortalTheme(THEME_PRESETS.dope_red.colors);
  }
}

function migrateLegacyRobotImages() {
  const users = listUsers().filter(
    (user) => user && (user.role === 'mentor' || user.role === 'superhost')
  );

  for (const user of users) {
    const robots = listRobotsByMentor(user.id);
    for (const robot of robots) {
      const imageUrl = String(robot.imageUrl || '').trim();
      const hasLegacyName = LEGACY_ROBOT_NAME_PATTERN.test(String(robot.name || '').trim());
      if (
        imageUrl &&
        !isLegacyTestReplacementImage(imageUrl) &&
        !shouldReplaceLegacyRobotImage(imageUrl) &&
        !hasLegacyName
      ) {
        continue;
      }

      updateRobot(robot.id, {
        imageUrl: resolveRobotImageUrl(imageUrl, robot.id || robot.name || user.id, robot.name),
      });
    }
  }
}

function migrateLegacyRobotNames() {
  const users = listUsers().filter((user) => user && (user.role === 'mentor' || user.role === 'superhost'));

  for (const user of users) {
    const robots = listRobotsByMentor(user.id);
    for (const robot of robots) {
      const sanitizedName = sanitizeRobotName(robot.name);
      if (sanitizedName === robot.name) {
        continue;
      }

      updateRobot(robot.id, {
        name: sanitizedName,
      });
    }

    const licenseKeys = listLicenseKeysByMentor(user.id);
    for (const keyItem of licenseKeys) {
      const sanitizedName = sanitizeRobotName(keyItem.robotName);
      if (sanitizedName === keyItem.robotName) {
        continue;
      }

      updateLicenseKey(keyItem.id, {
        robotName: sanitizedName,
      });
    }

    const subscriptions = listClientSubscriptionsByMentor(user.id);
    for (const subscription of subscriptions) {
      const sanitizedName = sanitizeRobotName(subscription.robotName);
      if (sanitizedName === subscription.robotName) {
        continue;
      }

      updateClientSubscription(subscription.id, {
        robotName: sanitizedName,
      });
    }
  }
}

function sanitizeRobotName(inputName) {
  const normalizedName = String(inputName || '').trim();
  if (!normalizedName) {
    return DEFAULT_ROBOT_NAME;
  }

  if (LEGACY_ROBOT_NAME_PATTERN.test(normalizedName)) {
    return DEFAULT_ROBOT_NAME;
  }

  return normalizedName;
}

function pickDefaultRobotImage(seedValue) {
  const pool = DEFAULT_ROBOT_IMAGE_URLS;
  if (!pool.length) {
    return NEUTRAL_ROBOT_PLACEHOLDER_IMAGE_URL;
  }

  const seedText = String(seedValue || '');
  let hash = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    hash = (hash * 31 + seedText.charCodeAt(i)) % 2147483647;
  }

  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

function normalizeBotName(botNameValue) {
  return String(botNameValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isFutureEaTestBotName(botNameValue) {
  return normalizeBotName(botNameValue) === normalizeBotName(FUTURE_EA_TEST_BOT_NAME);
}

function isLegacyTestReplacementImage(imageUrlValue) {
  const normalized = String(imageUrlValue || '').trim();
  if (!normalized) {
    return false;
  }

  return LEGACY_TEST_REPLACEMENT_IMAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldReplaceLegacyRobotImage(imageUrlValue) {
  const normalized = String(imageUrlValue || '').trim();
  if (!normalized) {
    return true;
  }

  if (normalized === LEGACY_RED_ROBOT_IMAGE_URL) {
    return true;
  }

  return FORBIDDEN_ROBOT_IMAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function resolveRobotImageUrl(imageUrlValue, imageSeed = '', botName = '') {
  const normalized = String(imageUrlValue || '').trim();
  if (isFutureEaTestBotName(botName)) {
    return TEST_LADY_ROBOT_IMAGE_URL;
  }

  if (normalized === TEST_LADY_ROBOT_IMAGE_URL || isLegacyTestReplacementImage(normalized)) {
    return NEUTRAL_ROBOT_PLACEHOLDER_IMAGE_URL;
  }

  if (shouldReplaceLegacyRobotImage(normalized)) {
    return NEUTRAL_ROBOT_PLACEHOLDER_IMAGE_URL;
  }
  return normalized || pickDefaultRobotImage(imageSeed || botName);
}

function isThemeMatch(theme, referenceTheme) {
  const referenceKeys = Object.keys(referenceTheme);
  for (const key of referenceKeys) {
    if (String(theme[key] || '').toLowerCase() !== String(referenceTheme[key] || '').toLowerCase()) {
      return false;
    }
  }

  return true;
}

function isInSameMonth(dateValue, referenceDate) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth()
  );
}

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toCurrencyNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Number(parsed.toFixed(2));
}

function convertZarToUsd(value) {
  const amountZar = Number(value);
  if (!Number.isFinite(amountZar) || amountZar <= 0) {
    return 0;
  }
  return toCurrencyNumber(amountZar / USD_EXCHANGE_RATE);
}

function toCsvCell(value) {
  const cell = String(value == null ? '' : value);
  if (!/[",\n]/.test(cell)) {
    return cell;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

function normalizeBusinessCurrency(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized === 'USD' ? 'USD' : 'ZAR';
}

function sumAmount(values) {
  let total = 0;
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      total += parsed;
    }
  }

  return total;
}

function buildOperatorDashboard(userId, now) {
  const account = getUserById(userId);
  if (!account) {
    return null;
  }

  const licenseKeys = listLicenseKeysByMentor(userId).map(attachLicenseKeyDisplay);
  const clientSubscriptions = listClientSubscriptionsByMentor(userId);
  const robots = listRobotsByMentor(userId)
    .map((robot) => ({
      ...robot,
      allowedSymbols: getMentorAvailableSymbols(robot),
      totalUsers: licenseKeys.filter((item) => item.robotId === robot.id).length,
      activeUsers: clientSubscriptions.filter(
        (item) => item.robotId === robot.id && isSubscriptionActiveNow(item, now)
      ).length,
      createdLabel: formatTableDateTime(robot.createdAt),
    }))
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  const activeKeysUsed = licenseKeys.filter((item) => isLicenseKeyRedeemed(item)).length;
  const activeSubscribers = clientSubscriptions.filter((item) =>
    isSubscriptionActiveNow(item, now)
  ).length;
  const keysSoldThisMonth = clientSubscriptions.filter((item) =>
    isInSameMonth(item.startedAt, now)
  ).length;
  const robotPricePerKey = toNonNegativeNumber(account.robotPricePerKey);
  const monthlyKeyTarget = toNonNegativeInteger(account.monthlyKeyTarget, 10);
  const businessCurrency = normalizeBusinessCurrency(account.businessCurrency);
  const currencySymbol = businessCurrency === 'USD' ? '$' : 'R';
  const monthlyRevenue = toCurrencyNumber(
    sumAmount(
      clientSubscriptions
        .filter((item) => isInSameMonth(item.startedAt, now))
        .map((item) => item.amountZar)
    )
  );
  const estimatedTotalRevenue = toCurrencyNumber(
    sumAmount(clientSubscriptions.map((item) => item.amountZar))
  );
  const projectedRevenueByMentorPrice = toCurrencyNumber(keysSoldThisMonth * robotPricePerKey);
  const goalRevenueAtTarget = toCurrencyNumber(monthlyKeyTarget * robotPricePerKey);
  const targetRemaining = Math.max(monthlyKeyTarget - keysSoldThisMonth, 0);
  const targetProgressPercent =
    monthlyKeyTarget > 0 ? Math.min(100, Math.round((keysSoldThisMonth / monthlyKeyTarget) * 100)) : 0;

  return {
    account,
    robots,
    licenseKeys,
    clientSubscriptions,
    activeKeysUsed,
    dashboardTotals: {
      totalKeys: account.licenseKeyLimit,
      totalGenerated: licenseKeys.length,
      activeSubscribers,
    },
    businessMetrics: {
      businessCurrency,
      currencySymbol,
      robotPricePerKey,
      monthlyKeyTarget,
      keysSoldThisMonth,
      monthlyRevenue,
      estimatedTotalRevenue,
      projectedRevenueByMentorPrice,
      goalRevenueAtTarget,
      targetRemaining,
      targetProgressPercent,
      targetReached: monthlyKeyTarget > 0 && keysSoldThisMonth >= monthlyKeyTarget,
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    },
  };
}

function parseEmailSet(rawValue, fallbackEmails) {
  const list = [];
  const add = (value) => {
    const normalized = normalizeEmail(value);
    if (!normalized || list.includes(normalized)) {
      return;
    }
    list.push(normalized);
  };

  for (const email of Array.isArray(fallbackEmails) ? fallbackEmails : []) {
    add(email);
  }

  for (const token of String(rawValue || '').split(/[,\n;]+/)) {
    add(token);
  }

  return list;
}

function getMobilePreviewCatalog() {
  const previewDir = path.join(__dirname, '..', 'previews', 'mobile');
  let fileNames = [];

  try {
    fileNames = fs.readdirSync(previewDir);
  } catch (_error) {
    return {
      all: [],
      android: [],
      ios: [],
      other: [],
    };
  }

  const records = fileNames
    .filter((fileName) => /\.(png|jpg|jpeg|webp)$/i.test(fileName))
    .map((fileName) => {
      const extension = path.extname(fileName);
      const id = path.basename(fileName, extension);
      const lowerId = id.toLowerCase();
      const parts = id.split('-');
      const orderNumber = Number(parts[1]);
      const order = Number.isFinite(orderNumber) ? orderNumber : 999;
      const platform = lowerId.startsWith('android-')
        ? 'android'
        : lowerId.startsWith('ios-')
          ? 'ios'
          : 'other';
      const titleSource = parts.length >= 3 ? parts.slice(2).join('-') : parts.slice(1).join('-');

      return {
        id,
        fileName,
        order,
        platform,
        title: formatPreviewTitle(titleSource || id),
        url: `/previews/mobile/${encodeURIComponent(fileName)}`,
      };
    })
    .sort((a, b) => {
      if (a.platform !== b.platform) {
        return a.platform.localeCompare(b.platform);
      }
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.id.localeCompare(b.id);
    });

  return {
    all: records,
    android: records.filter((item) => item.platform === 'android'),
    ios: records.filter((item) => item.platform === 'ios'),
    other: records.filter((item) => item.platform === 'other'),
  };
}

function formatPreviewTitle(value) {
  const words = String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'Preview';
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function readApiPayload(req) {
  const queryData =
    req && req.query && typeof req.query === 'object' && !Array.isArray(req.query)
      ? req.query
      : {};
  const bodyData =
    req && req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
  return {
    ...queryData,
    ...bodyData,
  };
}

function isValidBridgeAgentToken(rawToken) {
  const provided = Buffer.from(String(rawToken || '').trim());
  const expected = Buffer.from(String(BRIDGE_AGENT_SHARED_TOKEN || '').trim());
  if (!provided.length || !expected.length || provided.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(provided, expected);
  } catch (_error) {
    return false;
  }
}

function parseMentorPortalIdInput(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 100) {
    return null;
  }
  return parsed;
}

function isClientSubscriptionBypassed(clientEmail) {
  return CLIENT_SUBSCRIPTION_BYPASS_EMAILS.includes(normalizeEmail(clientEmail));
}

function normalizeLicenseInput(rawValue) {
  return String(rawValue || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeDeviceId(rawValue) {
  return String(rawValue || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, '')
    .slice(0, 64);
}

function getRequestDeviceId(req, fallbackValue = '') {
  const fingerprint = `${req.ip || ''}|${req.get('user-agent') || ''}|${req.get('accept-language') || ''}`;
  return (
    normalizeDeviceId(fallbackValue) ||
    crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase()
  );
}

function attachLicenseKeyDisplay(item) {
  if (!item) {
    return item;
  }
  return {
    ...item,
    displayKey: formatLicenseKeyForDisplay(item.key),
  };
}

function getClientPlan(planCode) {
  const code = String(planCode || '').trim();
  if (code === CLIENT_BYPASS_PLAN.code) {
    return CLIENT_BYPASS_PLAN;
  }
  return CLIENT_PLANS[code] || null;
}

function getLicenseDurationOption(durationCode) {
  const code = String(durationCode || '').trim();
  return LICENSE_KEY_DURATIONS[code] || null;
}

function addDays(dateValue, dayCount) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  const result = new Date(date);
  result.setDate(result.getDate() + Number(dayCount || 0));
  return result;
}

function calculateLicenseKeyExpiresAt(createdAt, durationOption) {
  if (!durationOption || durationOption.mode === 'lifetime') {
    return null;
  }

  if (durationOption.mode === 'days') {
    return addDays(createdAt, durationOption.value);
  }

  if (durationOption.mode === 'months') {
    return addMonths(createdAt, durationOption.value);
  }

  return null;
}

function addMonths(dateValue, monthCount) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  const result = new Date(date);
  result.setMonth(result.getMonth() + Number(monthCount || 0));
  return result;
}

function isSubscriptionActiveNow(subscription, now) {
  if (!subscription || subscription.status !== 'active') {
    return false;
  }

  const endDate = new Date(subscription.endsAt);
  if (Number.isNaN(endDate.getTime())) {
    return true;
  }

  return endDate >= now;
}

function pickFeaturedRobot(robots, fallbackSeed = '') {
  if (!Array.isArray(robots) || !robots.length) {
    return null;
  }

  const preferred = robots.find((robot) => {
    if (!robot) {
      return false;
    }
    const imageUrl = String(robot.imageUrl || '').trim();
    return imageUrl && !isLegacyTestReplacementImage(imageUrl) && !shouldReplaceLegacyRobotImage(imageUrl);
  });

  return sanitizeRobotForClientDisplay(preferred || robots[0], fallbackSeed);
}

function pickSubscriptionRobot(subscription, robots, fallbackSeed = '') {
  if (!Array.isArray(robots) || !robots.length) {
    return null;
  }

  const preferredId = String(subscription && subscription.robotId ? subscription.robotId : '').trim();
  if (preferredId) {
    const preferredRobot = robots.find((item) => item.id === preferredId);
    if (preferredRobot) {
      return sanitizeRobotForClientDisplay(preferredRobot, subscription && subscription.mentorId);
    }
  }

  return pickFeaturedRobot(robots, fallbackSeed || (subscription && subscription.mentorId));
}

function sanitizeRobotForClientDisplay(robot, fallbackSeed = '') {
  if (!robot) {
    return null;
  }

  const safeName = sanitizeRobotName(robot.name);
  const requestedImageUrl = String(robot.imageUrl || '').trim();
  const imageSeed = robot.id || safeName || fallbackSeed || 'future-ea-pro';
  const safeImageUrl = resolveRobotImageUrl(requestedImageUrl, imageSeed, safeName);

  return {
    ...robot,
    name: safeName,
    imageUrl: safeImageUrl,
  };
}

function getLicenseEmailTransporter() {
  if (cachedLicenseEmailTransporter) {
    return cachedLicenseEmailTransporter;
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  const config = {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
  };

  if (user && pass) {
    config.auth = { user, pass };
  }

  cachedLicenseEmailTransporter = nodemailer.createTransport(config);
  return cachedLicenseEmailTransporter;
}

async function sendLicenseKeyEmail(payload) {
  const transporter = getLicenseEmailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'email service not configured' };
  }

  const fromAddress =
    String(process.env.SMTP_FROM || '').trim() ||
    String(process.env.SMTP_USER || '').trim() ||
    'no-reply@futureeapro.com';

  const keyText = formatLicenseKeyForDisplay(payload.key);
  const clientName = String(payload.clientName || '').trim();
  const robotName = String(payload.robotName || 'Your Expert Advisor').trim();
  const subject = `${APP_NAME} License Key - ${robotName}`;
  const expiryText = payload.expiresAt
    ? new Date(payload.expiresAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
    : 'No expiry (Lifetime)';

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0b0c12;color:#f4f5f8;padding:24px;">
      <div style="max-width:640px;margin:0 auto;border:1px solid #2b2f40;border-radius:14px;background:#11141d;padding:22px;">
        <h1 style="margin:0 0 12px;font-size:22px;color:#ff6b76;">Future EA Pro License Key</h1>
        <p style="margin:0 0 16px;color:#c8cedf;">Hello${clientName ? ` ${escapeHtml(clientName)}` : ''}, your mentor has issued your Expert Advisor license key.</p>
        <p style="margin:0 0 8px;"><strong>Mentor:</strong> ${escapeHtml(payload.mentorName || '')}</p>
        <p style="margin:0 0 8px;"><strong>Mentor ID:</strong> ${escapeHtml(String(payload.mentorPortalId || ''))}</p>
        <p style="margin:0 0 8px;"><strong>Expert Advisor:</strong> ${escapeHtml(robotName)}</p>
        <p style="margin:0 0 8px;"><strong>Duration:</strong> ${escapeHtml(payload.durationLabel || '')}</p>
        <p style="margin:0 0 18px;"><strong>Expires:</strong> ${escapeHtml(expiryText)}</p>
        <div style="border:2px solid #ff7f88;border-radius:12px;background:#1a1e29;padding:16px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:1px;color:#9aa3bb;">YOUR LICENSE KEY</p>
          <p style="margin:0;font-size:42px;line-height:1;font-weight:800;letter-spacing:2px;color:#ffffff;">${escapeHtml(keyText)}</p>
        </div>
        <p style="margin:16px 0 0;color:#c8cedf;">Open <a href=\"https://futureeapro.com/client\" style=\"color:#ff9aa3;\">futureeapro.com/client</a>, enter your mentor ID + email, then paste this key to unlock.</p>
      </div>
    </div>
  `;

  const text = [
    `Future EA Pro License Key`,
    ``,
    clientName ? `Client: ${clientName}` : null,
    `Mentor: ${payload.mentorName || ''}`,
    `Mentor ID: ${payload.mentorPortalId || ''}`,
    `Expert Advisor: ${robotName}`,
    `Duration: ${payload.durationLabel || ''}`,
    `Expires: ${expiryText}`,
    ``,
    `LICENSE KEY: ${keyText}`,
    ``,
    `Unlock at: https://futureeapro.com/client`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: payload.clientEmail,
      replyTo: payload.mentorEmail || undefined,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (_error) {
    return { sent: false, reason: 'email delivery failed' };
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isLicenseKeyRedeemed(licenseKey) {
  if (!licenseKey) {
    return false;
  }

  if (licenseKey.status === 'redeemed') {
    return true;
  }

  return Boolean(licenseKey.redeemedAt || licenseKey.subscriptionId);
}

function normalizeHexColor(value, fallback) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function normalizeSymbolToken(value) {
  const cleaned = String(value || '').trim().toUpperCase();
  if (!cleaned) {
    return '';
  }
  const normalized = cleaned.replace(/[^A-Z0-9._/-]/g, '');
  if (!normalized) {
    return '';
  }
  if (!/[A-Z0-9]/.test(normalized)) {
    return '';
  }
  return normalized;
}

function parseSymbolsInput(inputValue) {
  const chunks = Array.isArray(inputValue)
    ? inputValue
    : String(inputValue || '').split(/[\n,]+/);
  const symbols = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const symbol = normalizeSymbolToken(chunk);
    if (!symbol || seen.has(symbol)) {
      continue;
    }
    symbols.push(symbol);
    seen.add(symbol);
    if (symbols.length >= 80) {
      break;
    }
  }

  return symbols;
}

function makeSymbolFieldToken(symbolValue) {
  return normalizeSymbolToken(symbolValue).replace(/[^A-Z0-9]/g, '_') || '';
}

function getMentorAvailableSymbols(robot) {
  if (!robot) {
    return QUOTE_SYMBOLS.slice();
  }
  const symbols = parseSymbolsInput(robot.allowedSymbols);
  if (symbols.length) {
    return symbols;
  }
  return QUOTE_SYMBOLS.slice();
}

function getMentorAvailableSymbolsMap(symbols) {
  const result = {};
  for (const symbol of Array.isArray(symbols) ? symbols : []) {
    const normalized = normalizeSymbolToken(symbol);
    if (!normalized) {
      continue;
    }
    result[normalized] = true;
  }
  return result;
}

function sanitizeSymbolConfigEntry(symbol, value) {
  const lotSize = parseDecimalInput(
    value && value.lotSize !== undefined ? value.lotSize : '',
    DEFAULT_SYMBOL_CONFIG.lotSize
  );
  const maxTrades = toNonNegativeInteger(
    value && value.maxTrades !== undefined ? value.maxTrades : DEFAULT_SYMBOL_CONFIG.maxTrades,
    DEFAULT_SYMBOL_CONFIG.maxTrades
  );
  const direction = normalizeDirection(value && value.direction);
  return {
    symbol,
    lotSize,
    maxTrades,
    direction: TRADE_DIRECTION_SET.has(direction) ? direction : DEFAULT_SYMBOL_CONFIG.direction,
    createdAt: String(value && value.createdAt ? value.createdAt : new Date().toISOString()),
  };
}

function getClientSymbolConfigMap(subscription, mentorSymbols = []) {
  const mentorSymbolSet = new Set(
    getMentorAvailableSymbolsFromList(mentorSymbols)
  );
  const rawConfig = subscription && typeof subscription.symbolConfigs === 'object'
    ? subscription.symbolConfigs
    : null;
  const normalized = {};

  if (rawConfig) {
    for (const key of Object.keys(rawConfig)) {
      const symbol = normalizeSymbolToken(key);
      if (!symbol || !mentorSymbolSet.has(symbol)) {
        continue;
      }
      normalized[symbol] = sanitizeSymbolConfigEntry(symbol, rawConfig[key]);
    }
  }

  const legacySelectedSymbols = parseSymbolsInput(subscription && subscription.selectedSymbols);
  for (const symbol of legacySelectedSymbols) {
    if (!mentorSymbolSet.has(symbol) || normalized[symbol]) {
      continue;
    }
    normalized[symbol] = sanitizeSymbolConfigEntry(symbol, {
      lotSize: DEFAULT_SYMBOL_CONFIG.lotSize,
      maxTrades: DEFAULT_SYMBOL_CONFIG.maxTrades,
      direction: DEFAULT_SYMBOL_CONFIG.direction,
    });
  }

  return normalized;
}

function getMentorAvailableSymbolsFromList(symbols) {
  return parseSymbolsInput(Array.isArray(symbols) ? symbols : []);
}

function upsertClientSymbolConfigs(subscription, mentorSymbols, bodyInput) {
  const mentorSymbolSet = new Set(getMentorAvailableSymbolsFromList(mentorSymbols));
  const selectedSymbols = parseSymbolsInput(bodyInput && bodyInput.symbols).filter((symbol) =>
    mentorSymbolSet.has(symbol)
  );

  const symbolConfigs = {};
  for (const symbol of selectedSymbols) {
    const fieldToken = makeSymbolFieldToken(symbol);
    const lotSize = parseDecimalInput(bodyInput && bodyInput[`lotSize_${fieldToken}`], DEFAULT_SYMBOL_CONFIG.lotSize);
    const maxTrades = toNonNegativeInteger(
      bodyInput && bodyInput[`maxTrades_${fieldToken}`],
      DEFAULT_SYMBOL_CONFIG.maxTrades
    );
    const normalizedMaxTrades = Math.max(1, maxTrades || DEFAULT_SYMBOL_CONFIG.maxTrades);
    const direction = normalizeDirection(bodyInput && bodyInput[`direction_${fieldToken}`])
      || DEFAULT_SYMBOL_CONFIG.direction;

    symbolConfigs[symbol] = sanitizeSymbolConfigEntry(symbol, {
      lotSize,
      maxTrades: normalizedMaxTrades,
      direction,
      createdAt: new Date().toISOString(),
    });
  }

  updateClientSubscription(subscription.id, {
    selectedSymbols,
    symbolConfigs,
  });

  return selectedSymbols;
}

function buildExecutionSymbolRows(mentorSymbolMap, symbolConfigs, executionState = {}) {
  const executionMap = executionState && executionState.bySymbol && typeof executionState.bySymbol === 'object'
    ? executionState.bySymbol
    : {};
  const rows = [];
  for (const [symbol, config] of Object.entries(symbolConfigs || {})) {
    if (!mentorSymbolMap || !mentorSymbolMap[symbol]) {
      continue;
    }
    const symbolExecution = executionMap[symbol] || {};
    rows.push({
      ...config,
      symbol,
      symbolConfigured: true,
      safeToken: makeSymbolFieldToken(symbol),
      tradeCount: Number(symbolExecution.count || 0),
      lastExecutedAt: symbolExecution.lastExecutedAt || null,
      lastOrderId: symbolExecution.lastOrderId || null,
      lastDirection: symbolExecution.lastDirection || null,
      lastStatus: symbolExecution.lastStatus || null,
    });
  }
  rows.sort((a, b) => String(a.symbol || '').localeCompare(String(b.symbol || '')));
  return rows;
}

function normalizeTradeExecutionState(rawState) {
  const bySymbolInput = rawState && rawState.bySymbol && typeof rawState.bySymbol === 'object'
    ? rawState.bySymbol
    : {};
  const bySymbol = {};

  for (const symbol of Object.keys(bySymbolInput)) {
    const normalizedSymbol = normalizeSymbolToken(symbol);
    const value = bySymbolInput[symbol] || {};
    if (!normalizedSymbol) {
      continue;
    }
    bySymbol[normalizedSymbol] = {
      count: Number.isFinite(Number(value.count)) ? Number(value.count) : 0,
      lastExecutedAt: value.lastExecutedAt || null,
      lastOrderId: value.lastOrderId || null,
      lastDirection: value.lastDirection || null,
      lastSymbol: normalizeSymbolToken(value.lastSymbol || normalizedSymbol),
      lastStatus: value.lastStatus || null,
    };
  }

  return {
    total: Number.isFinite(Number(rawState && rawState.total)) ? Number(rawState.total) : 0,
    bySymbol,
  };
}

function isAllowedBrokerAssetClass(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return METATRADER_ASSET_CLASSES
    .map((item) => String(item).trim().toLowerCase())
    .includes(normalized);
}

function resolveBrokerName(selectedBroker, customBrokerName) {
  if (!selectedBroker) {
    return '';
  }
  const trimmed = String(selectedBroker).trim();
  if (trimmed.toLowerCase() !== 'other / custom broker') {
    return trimmed;
  }
  return String(customBrokerName || '').trim();
}

function parseDecimalInput(rawValue, fallback = DEFAULT_SYMBOL_CONFIG.lotSize) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  const normalized = Number(parsed.toFixed(4));
  return normalized;
}

function parseTradeLevelInput(rawValue) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return '';
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return String(parsed);
}

function normalizeScannerConfidence(rawValue, fallback = 72) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(99, Math.max(40, Math.round(parsed)));
}

function getScannerPriceDecimals(symbolValue) {
  const symbol = String(symbolValue || '').trim().toUpperCase();
  if (/JPY/.test(symbol)) {
    return 3;
  }
  if (/BTC|ETH|LTC|LITECOIN|US30|USTECH|UK100|DER|VIX|XAU|XAG/.test(symbol)) {
    return 2;
  }
  return 5;
}

function getScannerBasePrice(symbolValue, hashValue) {
  const symbol = String(symbolValue || '').trim().toUpperCase();
  const hash = String(hashValue || '').trim();
  const noise = (Number.parseInt(hash.slice(8, 14), 16) || 0) % 1000;

  if (/JPY/.test(symbol)) {
    return 140 + noise / 100;
  }
  if (/BTC|ETH|LTC|LITECOIN/.test(symbol)) {
    return 50000 + noise * 2;
  }
  if (/US30|USTECH|UK100|DER|VIX/.test(symbol)) {
    return 10000 + noise * 0.8;
  }
  if (/XAU/.test(symbol)) {
    return 2000 + noise / 10;
  }
  return 1.05 + noise / 10000;
}

function formatScannerPrice(value, decimals) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return numeric.toFixed(decimals);
}

function buildChartScannerAnalysis({ imageData, symbol, robotName }) {
  const normalizedSymbol = normalizeSymbolToken(symbol || 'EURUSD') || 'EURUSD';
  const normalizedRobotName = sanitizeRobotName(robotName || DEFAULT_ROBOT_NAME);
  const payloadHash = crypto
    .createHash('sha256')
    .update(String(imageData || ''))
    .update('|')
    .update(normalizedSymbol)
    .update('|')
    .update(normalizedRobotName)
    .digest('hex');

  const direction = (Number.parseInt(payloadHash.slice(0, 2), 16) || 0) % 2 === 0 ? 'BUY' : 'SELL';
  const confidence = normalizeScannerConfidence((Number.parseInt(payloadHash.slice(2, 4), 16) || 0) % 100);
  const decimals = getScannerPriceDecimals(normalizedSymbol);
  const basePrice = getScannerBasePrice(normalizedSymbol, payloadHash);
  const stopDistanceSeed = (Number.parseInt(payloadHash.slice(4, 8), 16) || 0) % 95;
  const tpRatioSeed = (Number.parseInt(payloadHash.slice(14, 16), 16) || 0) % 70;
  const unit = decimals >= 4 ? 0.0001 : 0.01;
  const stopDistance = (18 + stopDistanceSeed) * unit;
  const tpDistance = stopDistance * (1.25 + tpRatioSeed / 100);

  const stopLossValue = direction === 'BUY' ? basePrice - stopDistance : basePrice + stopDistance;
  const takeProfitValue = direction === 'BUY' ? basePrice + tpDistance : basePrice - tpDistance;

  return {
    symbol: normalizedSymbol,
    direction,
    stopLoss: formatScannerPrice(stopLossValue, decimals),
    takeProfit: formatScannerPrice(takeProfitValue, decimals),
    confidence,
    fingerprint: payloadHash.slice(0, 12).toUpperCase(),
    analyzedAt: new Date().toISOString(),
  };
}

function normalizeChartScannerState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return null;
  }

  const source = rawState.analysis && typeof rawState.analysis === 'object'
    ? rawState.analysis
    : rawState;
  const symbol = normalizeSymbolToken(source.symbol || '');
  const direction = normalizeDirection(source.direction || '');
  const stopLoss = parseTradeLevelInput(source.stopLoss);
  const takeProfit = parseTradeLevelInput(source.takeProfit);
  const analyzedAt = source.analyzedAt || rawState.analyzedAt || null;

  if (!symbol || !direction || !stopLoss || !takeProfit) {
    return null;
  }

  return {
    symbol,
    direction,
    stopLoss,
    takeProfit,
    confidence: normalizeScannerConfidence(source.confidence),
    fingerprint: String(source.fingerprint || '').trim().toUpperCase(),
    analyzedAt,
  };
}

function normalizeClientRobotSection(value) {
  const normalized = String(value || 'home')
    .trim()
    .toLowerCase();
  if (normalized === 'metrader') {
    return 'metatrader';
  }
  if (normalized === 'robots') {
    return 'home';
  }
  if (normalized === 'allowed-symbols' || normalized === 'symbols') {
    return 'quotes';
  }
  if (normalized === 'theme-layout') {
    return 'settings';
  }
  if (CLIENT_ROBOT_SECTIONS.includes(normalized)) {
    return normalized;
  }
  return 'home';
}

function getClientAllowedSymbols(subscription, mentorSymbols) {
  const symbols = parseSymbolsInput(subscription && subscription.selectedSymbols);
  if (!symbols.length) {
    return [];
  }

  const mentorSymbolSet = new Set(mentorSymbols);
  const filtered = symbols.filter((symbol) => mentorSymbolSet.has(symbol));
  return filtered;
}

function buildQuoteRows(symbols) {
  return symbols.map((symbol) => ({
    symbol,
    lotSize: '0.01',
    platform: 'MT5',
    direction: 'BUY',
  }));
}
