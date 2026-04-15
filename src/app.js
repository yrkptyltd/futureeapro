const path = require('path');
const express = require('express');
const session = require('express-session');
const {
  ensureDataFile,
  ensureMentorPortalIds,
  getPortalTheme,
  updatePortalTheme,
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
  updateLicenseKey,
  createClientSubscription,
  getClientSubscriptionById,
  updateClientSubscription,
  listClientSubscriptionsByMentor,
  getMentorDetails,
} = require('./lib/store');
const {
  createPasswordHash,
  verifyPassword,
  normalizeEmail,
} = require('./lib/auth');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_NAME = 'Future EA Pro';
const APP_SLUG = 'futureeapro';
const SUPERHOST_EMAIL = normalizeEmail(process.env.SUPERHOST_EMAIL || 'superhost@futureeapro.com');
const SUPERHOST_PASSWORD = process.env.SUPERHOST_PASSWORD || 'ChangeMe123!';
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
const CLIENT_ROBOT_SECTIONS = ['home', 'quotes', 'trade', 'metrader', 'details', 'settings'];
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
const THEME_PRESETS = {
  dope_red: {
    label: 'Dope Red (Default)',
    colors: {
      primary: '#ff5f6d',
      secondary: '#ff9f43',
      tertiary: '#9cff57',
      accentPink: '#ff4f7b',
      bgStart: '#0c0609',
      bgEnd: '#1d0c11',
      glow: '#ff7a7a',
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
const LEGACY_INITIAL_THEME = {
  primary: '#ff3df5',
  secondary: '#39ff14',
  tertiary: '#ffe600',
  accentPink: '#ff3df5',
  bgStart: '#13001f',
  bgEnd: '#2a0038',
  glow: '#ff5eea',
};

ensureDataFile();
ensureMentorPortalIds();
ensureDefaultThemePalette();
bootstrapSuperhost();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
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
  res.render('home', { title: APP_NAME });
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
    setFlash(req, 'error', 'That email is already registered.');
    return res.redirect('/signup');
  }

  const role = email === SUPERHOST_EMAIL ? 'superhost' : 'mentor';
  const passwordData = createPasswordHash(password);

  createUser({
    name,
    email,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    role,
  });

  if (role === 'superhost') {
    setFlash(req, 'success', 'Superhost account created. You can sign in now.');
  } else {
    setFlash(
      req,
      'success',
      'Account registration pending. Please check again after 5-15 minutes.'
    );
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
    setFlash(req, 'error', 'Account registration pending. Please check again after 5-15 minutes.');
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

app.get('/download/android', (_req, res) => {
  return res.render('download-android', {
    title: 'Download Android App',
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
    setFlash(
      req,
      'success',
      'Subscription fee bypass enabled for this email. Continue with your mentor license key.'
    );
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
  const featuredRobot = pickFeaturedRobot(mentorRobots);

  return res.render('client-subscription', {
    title: 'Choose Subscription',
    flow,
    plans: CLIENT_PLAN_LIST,
    featuredRobot,
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
  const featuredRobot = pickFeaturedRobot(mentorRobots);
  const plan = getClientPlan(flow.planCode);

  return res.render('client-unlock', {
    title: 'Unlock Robot Access',
    flow,
    plan,
    featuredRobot,
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

  const enteredLicenseKey = String(body.licenseKey || '').trim();
  if (!enteredLicenseKey) {
    setFlash(req, 'error', 'Please enter your unique license key from your mentor.');
    return res.redirect('/client/unlock');
  }

  const licenseRecord = getLicenseKeyByMentorAndKey(mentor.id, enteredLicenseKey);
  if (!licenseRecord) {
    setFlash(req, 'error', 'Invalid license key for this mentor.');
    return res.redirect('/client/unlock');
  }

  if (isLicenseKeyRedeemed(licenseRecord)) {
    setFlash(req, 'error', 'This license key has already been used.');
    return res.redirect('/client/unlock');
  }

  const reservedEmail = normalizeEmail(licenseRecord.reservedClientEmail);
  if (reservedEmail && reservedEmail !== flow.clientEmail) {
    setFlash(req, 'error', 'This key is reserved for a different client email.');
    return res.redirect('/client/unlock');
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
    licenseKey: licenseRecord.key,
    licenseNumber: licenseRecord.licenseNumber,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'active',
  });

  updateLicenseKey(licenseRecord.id, {
    status: 'redeemed',
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
  const featuredRobot = pickFeaturedRobot(mentorRobots);
  return res.render('client-success', {
    title: 'Subscription Complete',
    subscription,
    mentor,
    plan,
    featuredRobot,
  });
});

app.get('/client/robot/:subscriptionId', (req, res) => {
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
  const featuredRobot = pickFeaturedRobot(mentorRobots);
  const plan = getClientPlan(subscription.planCode);
  const requestedSection = String(req.query.section || 'home').trim().toLowerCase();
  const activeSection = CLIENT_ROBOT_SECTIONS.includes(requestedSection) ? requestedSection : 'home';
  const brokerConnections = Array.isArray(subscription.brokerConnections)
    ? subscription.brokerConnections
    : [];
  const symbols = getMentorAvailableSymbols(featuredRobot);
  const allowedSymbols = getClientAllowedSymbols(subscription, symbols);
  const selectedSymbolsLookup = {};
  for (const symbol of allowedSymbols) {
    selectedSymbolsLookup[symbol] = true;
  }

  return res.render('client-robot-interface', {
    title: 'Robot Interface',
    subscription,
    mentor,
    featuredRobot,
    plan,
    activeSection,
    brokerOptions: METRADER_BROKERS,
    brokerConnections,
    quoteRows: buildQuoteRows(symbols),
    allowedQuoteRows: buildQuoteRows(allowedSymbols),
    selectedSymbolsLookup,
  });
});

app.post('/client/robot/:subscriptionId/symbols/allowed', (req, res) => {
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
  const featuredRobot = pickFeaturedRobot(mentorRobots);
  const symbols = getMentorAvailableSymbols(featuredRobot);
  const validSymbolSet = new Set(symbols);
  const rawSymbols = req.body && req.body.symbols;
  const selectedSymbols = parseSymbolsInput(rawSymbols).filter((symbol) =>
    validSymbolSet.has(symbol)
  );

  updateClientSubscription(subscription.id, {
    selectedSymbols,
  });

  if (selectedSymbols.length) {
    setFlash(
      req,
      'success',
      `${selectedSymbols.length} allowed symbol${selectedSymbols.length === 1 ? '' : 's'} saved.`
    );
  } else {
    setFlash(req, 'success', 'Allowed symbols cleared. You can pick any from Symbols again.');
  }

  return res.redirect(`/client/robot/${subscription.id}?section=quotes`);
});

app.post('/client/robot/:subscriptionId/metrader/connect', (req, res) => {
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
  const platform = String(body.platform || '').trim().toUpperCase();
  const selectedBroker = String(body.brokerName || '').trim();
  const customBrokerName = String(body.customBrokerName || '').trim();
  const accountNumber = String(body.accountNumber || '').trim();
  const serverName = String(body.serverName || '').trim();
  const notes = String(body.notes || '').trim();

  if (platform !== 'MT4' && platform !== 'MT5') {
    setFlash(req, 'error', 'Please select MT4 or MT5.');
    return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
  }

  if (!selectedBroker) {
    setFlash(req, 'error', 'Please choose a broker.');
    return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
  }

  let brokerName = selectedBroker;
  if (selectedBroker === 'Other / Custom Broker') {
    if (!customBrokerName) {
      setFlash(req, 'error', 'Please enter your custom broker name.');
      return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
    }
    brokerName = customBrokerName;
  }

  if (!accountNumber) {
    setFlash(req, 'error', 'Account number is required.');
    return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
  }

  if (!serverName) {
    setFlash(req, 'error', 'Broker server is required.');
    return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
  }

  const existingConnections = Array.isArray(subscription.brokerConnections)
    ? subscription.brokerConnections
    : [];
  const newConnection = {
    id: `brk_${Date.now()}`,
    platform,
    brokerName,
    accountNumber,
    serverName,
    notes,
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
  return res.redirect(`/client/robot/${subscription.id}?section=metrader`);
});

app.get('/mentor/dashboard', requireAuth, requireRole('mentor'), (req, res) => {
  const mentor = getUserById(req.currentUser.id);
  const robots = listRobotsByMentor(req.currentUser.id).map((robot) => ({
    ...robot,
    allowedSymbols: getMentorAvailableSymbols(robot),
  }));
  const licenseKeys = listLicenseKeysByMentor(req.currentUser.id);
  const clientSubscriptions = listClientSubscriptionsByMentor(req.currentUser.id);
  const now = new Date();
  const activeKeysUsed = licenseKeys.filter((item) => isLicenseKeyRedeemed(item)).length;
  const activeSubscribers = clientSubscriptions.filter((item) =>
    isSubscriptionActiveNow(item, now)
  ).length;
  const keysSoldThisMonth = clientSubscriptions.filter((item) =>
    isInSameMonth(item.startedAt, now)
  ).length;
  const robotPricePerKey = toNonNegativeNumber(mentor.robotPricePerKey);
  const monthlyKeyTarget = toNonNegativeInteger(mentor.monthlyKeyTarget, 10);
  const monthlyRevenue = toCurrencyNumber(
    sumAmount(clientSubscriptions.filter((item) => isInSameMonth(item.startedAt, now)).map((item) => item.amountZar))
  );
  const estimatedTotalRevenue = toCurrencyNumber(
    sumAmount(clientSubscriptions.map((item) => item.amountZar))
  );
  const projectedRevenueByMentorPrice = toCurrencyNumber(keysSoldThisMonth * robotPricePerKey);
  const targetRemaining = Math.max(monthlyKeyTarget - keysSoldThisMonth, 0);
  const targetProgressPercent =
    monthlyKeyTarget > 0 ? Math.min(100, Math.round((keysSoldThisMonth / monthlyKeyTarget) * 100)) : 0;

  const dashboardTotals = {
    totalKeys: mentor.licenseKeyLimit,
    totalGenerated: licenseKeys.length,
    activeSubscribers,
  };
  const businessMetrics = {
    robotPricePerKey,
    monthlyKeyTarget,
    keysSoldThisMonth,
    monthlyRevenue,
    estimatedTotalRevenue,
    projectedRevenueByMentorPrice,
    targetRemaining,
    targetProgressPercent,
    targetReached: monthlyKeyTarget > 0 && keysSoldThisMonth >= monthlyKeyTarget,
    monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  };

  res.render('mentor-dashboard', {
    title: 'Mentor Dashboard',
    mentor,
    robots,
    licenseKeys,
    activeKeysUsed,
    dashboardTotals,
    businessMetrics,
    defaultSymbolsText: QUOTE_SYMBOLS.join(', '),
  });
});

app.post('/mentor/business-settings', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const robotPricePerKey = Number(body.robotPricePerKey);
  const monthlyKeyTarget = Number(body.monthlyKeyTarget);

  if (!Number.isFinite(robotPricePerKey) || robotPricePerKey < 0) {
    setFlash(req, 'error', 'Robot price must be a non-negative number.');
    return res.redirect('/mentor/dashboard#track-business');
  }

  if (!Number.isInteger(monthlyKeyTarget) || monthlyKeyTarget < 0) {
    setFlash(req, 'error', 'Monthly key target must be a non-negative whole number.');
    return res.redirect('/mentor/dashboard#track-business');
  }

  updateUser(req.currentUser.id, {
    robotPricePerKey: toCurrencyNumber(robotPricePerKey),
    monthlyKeyTarget,
  });

  setFlash(req, 'success', 'Business settings updated.');
  return res.redirect('/mentor/dashboard#track-business');
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
  return res.redirect('/mentor/dashboard#my-profile');
});

app.post('/mentor/robots', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard');
  }

  const name = String(body.name || '').trim();
  if (!name) {
    setFlash(req, 'error', 'Robot name is required.');
    return res.redirect('/mentor/dashboard');
  }

  const parseNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const allowedSymbols = parseSymbolsInput(body.allowedSymbols);

  createRobot({
    mentorId: req.currentUser.id,
    name,
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    version: String(body.version || '').trim() || 'v1.0.0',
    status: String(body.status || '').trim() || 'draft',
    imageUrl: String(body.imageUrl || '').trim(),
    allowedSymbols: allowedSymbols.length ? allowedSymbols : QUOTE_SYMBOLS.slice(),
    keyStats: {
      uptimeHours: parseNumber(body.uptimeHours),
      tasksCompleted: parseNumber(body.tasksCompleted),
      successRate: parseNumber(body.successRate),
      lastSync: String(body.lastSync || '').trim() || 'Not provided',
    },
  });

  setFlash(req, 'success', 'Robot profile created successfully.');
  return res.redirect('/mentor/dashboard');
});

app.post('/mentor/robots/:robotId/symbols', requireAuth, requireRole('mentor'), (req, res) => {
  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard');
  }

  const allowedSymbols = parseSymbolsInput(req.body && req.body.allowedSymbols);
  if (!allowedSymbols.length) {
    setFlash(req, 'error', 'Add at least one symbol for this robot.');
    return res.redirect('/mentor/dashboard#my-robots');
  }

  updateRobot(robot.id, {
    allowedSymbols,
  });

  setFlash(req, 'success', `Allowed symbols updated for ${robot.name}.`);
  return res.redirect('/mentor/dashboard#my-robots');
});

app.post('/mentor/license-keys/generate', requireAuth, requireRole('mentor'), (req, res) => {
  const body = req.body || {};
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard');
  }

  const licenseKeys = listLicenseKeysByMentor(req.currentUser.id);
  const totalGenerated = licenseKeys.length;
  const reservedClientEmail = normalizeEmail(body.clientEmail);

  if (reservedClientEmail && !reservedClientEmail.includes('@')) {
    setFlash(req, 'error', 'Reserved client email must be valid.');
    return res.redirect('/mentor/dashboard#client-keys');
  }

  if (totalGenerated >= mentor.licenseKeyLimit) {
    setFlash(req, 'error', 'License limit reached. Ask the superhost to increase your limit.');
    return res.redirect('/mentor/dashboard');
  }

  const createdKey = createLicenseKey({
    mentorId: req.currentUser.id,
    status: 'available',
    reservedClientEmail: reservedClientEmail || null,
  });
  if (!createdKey) {
    setFlash(req, 'error', 'Could not generate a license key right now.');
    return res.redirect('/mentor/dashboard');
  }

  if (reservedClientEmail) {
    setFlash(
      req,
      'success',
      `New client key generated: ${createdKey.key} (reserved for ${reservedClientEmail}).`
    );
  } else {
    setFlash(req, 'success', `New client key generated: ${createdKey.key}`);
  }
  return res.redirect('/mentor/dashboard#client-keys');
});

app.post('/mentor/robots/:robotId/convert-mobile', requireAuth, requireRole('mentor'), (req, res) => {
  const mentor = getUserById(req.currentUser.id);
  if (!mentor.subscriptionActive) {
    setFlash(req, 'error', 'Subscription is inactive. Ask the superhost to reactivate your access.');
    return res.redirect('/mentor/dashboard');
  }

  const robot = getRobotById(req.params.robotId);
  if (!robot || robot.mentorId !== req.currentUser.id) {
    setFlash(req, 'error', 'Robot not found.');
    return res.redirect('/mentor/dashboard');
  }

  updateRobot(robot.id, {
    mobileBuild: {
      status: 'ready',
      platforms: ['android', 'ios'],
      convertedAt: new Date().toISOString(),
    },
  });

  setFlash(req, 'success', `${robot.name} converted for mobile delivery (Android + iOS).`);
  return res.redirect('/mentor/dashboard');
});

app.get('/superhost/dashboard', requireAuth, requireRole('superhost'), (_req, res) => {
  const now = new Date();
  const mentors = listMentors().map((mentor) => {
    const robots = listRobotsByMentor(mentor.id);
    const keys = listLicenseKeysByMentor(mentor.id);
    const clientSubscriptions = listClientSubscriptionsByMentor(mentor.id);
    const activeKeysUsed = keys.filter((item) => isLicenseKeyRedeemed(item)).length;
    const activeSubscribers = clientSubscriptions.filter((item) =>
      isSubscriptionActiveNow(item, now)
    ).length;

    return {
      ...mentor,
      robotsCount: robots.length,
      activeKeysUsed,
      totalKeys: keys.length,
      activeSubscribers,
    };
  });

  res.render('superhost-dashboard', {
    title: 'Superhost Dashboard',
    mentors,
  });
});

app.post('/superhost/theme', requireAuth, requireRole('superhost'), (req, res) => {
  const body = req.body || {};
  const preset = String(body.preset || '').trim();

  if (preset && THEME_PRESETS[preset]) {
    updatePortalTheme(THEME_PRESETS[preset].colors);
    setFlash(req, 'success', `${THEME_PRESETS[preset].label} theme applied.`);
    return res.redirect('/superhost/dashboard');
  }

  const themeUpdates = {
    primary: normalizeHexColor(body.primary, '#ff5f6d'),
    secondary: normalizeHexColor(body.secondary, '#ff9f43'),
    tertiary: normalizeHexColor(body.tertiary, '#9cff57'),
    accentPink: normalizeHexColor(body.accentPink, '#ff4f7b'),
    bgStart: normalizeHexColor(body.bgStart, '#0c0609'),
    bgEnd: normalizeHexColor(body.bgEnd, '#1d0c11'),
    glow: normalizeHexColor(body.glow, '#ff7a7a'),
  };

  updatePortalTheme(themeUpdates);
  setFlash(req, 'success', 'Portal theme updated.');
  return res.redirect('/superhost/dashboard');
});

app.get('/superhost/mentors/:mentorId', requireAuth, requireRole('superhost'), (req, res) => {
  const details = getMentorDetails(req.params.mentorId);

  if (!details) {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard');
  }

  return res.render('superhost-mentor-details', {
    title: 'Mentor Details',
    details,
  });
});

app.post('/superhost/mentors/:mentorId/approval', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard');
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const approved = action === 'approve';
  updateUser(mentor.id, { approved });

  setFlash(req, 'success', approved ? `${mentor.email} approved.` : `${mentor.email} approval revoked.`);
  return res.redirect('/superhost/dashboard');
});

app.post('/superhost/mentors/:mentorId/subscription', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard');
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
  return res.redirect('/superhost/dashboard');
});

app.post('/superhost/mentors/:mentorId/license-limit', requireAuth, requireRole('superhost'), (req, res) => {
  const mentor = getUserById(req.params.mentorId);
  if (!mentor || mentor.role !== 'mentor') {
    setFlash(req, 'error', 'Mentor not found.');
    return res.redirect('/superhost/dashboard');
  }

  const body = req.body || {};
  const limit = Number(body.limit);
  if (!Number.isInteger(limit) || limit < 0) {
    setFlash(req, 'error', 'License key limit must be a non-negative integer.');
    return res.redirect('/superhost/dashboard');
  }

  updateUser(mentor.id, { licenseKeyLimit: limit });
  setFlash(req, 'success', `License key limit updated for ${mentor.email}.`);
  return res.redirect('/superhost/dashboard');
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

function bootstrapSuperhost() {
  const existing = getUserByEmail(SUPERHOST_EMAIL);
  if (existing) {
    if (existing.role !== 'superhost') {
      updateUser(existing.id, {
        role: 'superhost',
        approved: true,
        subscriptionActive: true,
        licenseKeyLimit: 9999,
      });
    }
    return;
  }

  const passwordData = createPasswordHash(SUPERHOST_PASSWORD);
  createUser({
    name: 'Platform Superhost',
    email: SUPERHOST_EMAIL,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
    role: 'superhost',
  });
}

function ensureDefaultThemePalette() {
  const currentTheme = getPortalTheme();
  if (!currentTheme) {
    updatePortalTheme(THEME_PRESETS.dope_red.colors);
    return;
  }

  if (isThemeMatch(currentTheme, LEGACY_INITIAL_THEME)) {
    updatePortalTheme(THEME_PRESETS.dope_red.colors);
  }
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

function isClientSubscriptionBypassed(clientEmail) {
  return CLIENT_SUBSCRIPTION_BYPASS_EMAILS.includes(normalizeEmail(clientEmail));
}

function getClientPlan(planCode) {
  const code = String(planCode || '').trim();
  if (code === CLIENT_BYPASS_PLAN.code) {
    return CLIENT_BYPASS_PLAN;
  }
  return CLIENT_PLANS[code] || null;
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

function pickFeaturedRobot(robots) {
  if (!Array.isArray(robots) || !robots.length) {
    return null;
  }

  const withImage = robots.find((robot) => robot.imageUrl);
  if (withImage) {
    return withImage;
  }

  return robots[0];
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

function getClientAllowedSymbols(subscription, mentorSymbols) {
  const symbols = parseSymbolsInput(subscription && subscription.selectedSymbols);
  if (!symbols.length) {
    return mentorSymbols.slice();
  }

  const mentorSymbolSet = new Set(mentorSymbols);
  const filtered = symbols.filter((symbol) => mentorSymbolSet.has(symbol));
  if (!filtered.length) {
    return mentorSymbols.slice();
  }
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
