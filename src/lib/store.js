const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_THEME = {
  primary: '#ff5f6d',
  secondary: '#ff9f43',
  tertiary: '#9cff57',
  accentPink: '#ff4f7b',
  bgStart: '#0c0609',
  bgEnd: '#1d0c11',
  glow: '#ff7a7a',
};

const EMPTY_DATA = {
  users: [],
  robots: [],
  licenseKeys: [],
  clientSubscriptions: [],
  settings: {
    theme: { ...DEFAULT_THEME },
  },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DATA, null, 2));
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    users: parsed.users || [],
    robots: parsed.robots || [],
    licenseKeys: parsed.licenseKeys || [],
    clientSubscriptions: parsed.clientSubscriptions || [],
    settings: {
      theme: {
        ...DEFAULT_THEME,
        ...((parsed.settings && parsed.settings.theme) || {}),
      },
    },
  };
}

function writeData(data) {
  ensureDataFile();
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getUserById(id) {
  return readData().users.find((user) => user.id === id);
}

function getUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return readData().users.find((user) => user.email === normalized);
}

function getMentorByPortalId(mentorPortalId) {
  const portalIdNumber = Number(mentorPortalId);
  if (!Number.isInteger(portalIdNumber)) {
    return null;
  }

  return readData().users.find(
    (user) => user.role === 'mentor' && Number(user.mentorPortalId) === portalIdNumber
  );
}

function createUser(userInput) {
  const data = readData();
  const existing = data.users.find(
    (user) => String(user.email || '').trim().toLowerCase() === String(userInput.email || '').trim().toLowerCase()
  );
  if (existing) {
    return null;
  }

  const isMentor = userInput.role === 'mentor';
  const autoApproved = userInput.role === 'superhost' || userInput.role === 'mentor';
  const defaultLicenseLimit = userInput.role === 'superhost' ? 9999 : isMentor ? 1000 : 3;
  const createdUser = {
    id: createId('usr'),
    name: userInput.name,
    email: userInput.email,
    passwordHash: userInput.passwordHash,
    passwordSalt: userInput.passwordSalt,
    role: userInput.role,
    mentorPortalId: isMentor ? getNextMentorPortalIdFromData(data) : null,
    approved: autoApproved,
    subscriptionActive: autoApproved,
    licenseKeyLimit: defaultLicenseLimit,
    robotPricePerKey: 0,
    monthlyKeyTarget: 0,
    businessCurrency: 'ZAR',
    profileHeadline: '',
    profileBio: '',
    profilePhone: '',
    profileImageUrl: '',
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  data.users.push(createdUser);
  writeData(data);
  return createdUser;
}

function updateUser(id, updates) {
  const data = readData();
  const index = data.users.findIndex((user) => user.id === id);
  if (index === -1) {
    return null;
  }

  data.users[index] = {
    ...data.users[index],
    ...updates,
  };

  writeData(data);
  return data.users[index];
}

function listMentors() {
  return readData().users.filter((user) => user.role === 'mentor');
}

function createRobot(robotInput) {
  const data = readData();
  const robot = {
    id: createId('rbt'),
    mentorId: robotInput.mentorId,
    name: robotInput.name,
    description: robotInput.description,
    category: robotInput.category,
    version: robotInput.version,
    status: robotInput.status,
    imageUrl: robotInput.imageUrl || '',
    keyStats: robotInput.keyStats,
    createdAt: new Date().toISOString(),
  };

  data.robots.push(robot);
  writeData(data);
  return robot;
}

function listRobotsByMentor(mentorId) {
  return readData().robots.filter((robot) => robot.mentorId === mentorId);
}

function getRobotById(robotId) {
  return readData().robots.find((robot) => robot.id === robotId);
}

function updateRobot(robotId, updates) {
  const data = readData();
  const index = data.robots.findIndex((robot) => robot.id === robotId);
  if (index === -1) {
    return null;
  }

  data.robots[index] = {
    ...data.robots[index],
    ...updates,
  };

  writeData(data);
  return data.robots[index];
}

function createLicenseKey(input) {
  const data = readData();
  const mentor = data.users.find(
    (user) => user.id === input.mentorId && (user.role === 'mentor' || user.role === 'superhost')
  );
  if (!mentor) {
    return null;
  }

  const licenseNumber = getNextLicenseNumberFromData(data);
  const key = {
    id: createId('key'),
    mentorId: input.mentorId,
    mentorPortalId: mentor.mentorPortalId,
    key: String(licenseNumber),
    licenseNumber,
    robotId: input.robotId || null,
    robotName: input.robotName || '',
    durationCode: input.durationCode || '',
    durationLabel: input.durationLabel || '',
    expiresAt: input.expiresAt || null,
    emailSentAt: input.emailSentAt || null,
    status: input.status || 'available',
    reservedClientEmail: input.reservedClientEmail || null,
    redeemedByClientEmail: null,
    redeemedAt: null,
    subscriptionId: null,
    createdAt: new Date().toISOString(),
  };

  data.licenseKeys.push(key);
  writeData(data);
  return key;
}

function listLicenseKeysByMentor(mentorId) {
  return readData().licenseKeys.filter((item) => item.mentorId === mentorId);
}

function getLicenseKeyByMentorAndKey(mentorId, keyValue) {
  const normalized = String(keyValue || '').trim();
  if (!normalized) {
    return null;
  }

  return readData().licenseKeys.find(
    (item) => item.mentorId === mentorId && String(item.key) === normalized
  );
}

function updateLicenseKey(licenseKeyId, updates) {
  const data = readData();
  const index = data.licenseKeys.findIndex((item) => item.id === licenseKeyId);
  if (index === -1) {
    return null;
  }

  data.licenseKeys[index] = {
    ...data.licenseKeys[index],
    ...updates,
  };

  writeData(data);
  return data.licenseKeys[index];
}

function createClientSubscription(input) {
  const data = readData();
  const subscription = {
    id: createId('sub'),
    mentorId: input.mentorId,
    mentorPortalId: input.mentorPortalId,
    clientEmail: input.clientEmail,
    planCode: input.planCode,
    durationMonths: input.durationMonths,
    amountZar: input.amountZar,
    robotId: input.robotId || null,
    robotName: input.robotName || '',
    licenseDurationCode: input.licenseDurationCode || '',
    licenseDurationLabel: input.licenseDurationLabel || '',
    licenseKeyExpiresAt: input.licenseKeyExpiresAt || null,
    licenseKey: input.licenseKey,
    licenseNumber: input.licenseNumber,
    startedAt: input.startedAt,
    endsAt: input.endsAt,
    status: input.status || 'active',
    createdAt: new Date().toISOString(),
  };

  data.clientSubscriptions.push(subscription);
  writeData(data);
  return subscription;
}

function getClientSubscriptionById(subscriptionId) {
  return readData().clientSubscriptions.find((sub) => sub.id === subscriptionId);
}

function updateClientSubscription(subscriptionId, updates) {
  const data = readData();
  const index = data.clientSubscriptions.findIndex((sub) => sub.id === subscriptionId);
  if (index === -1) {
    return null;
  }

  data.clientSubscriptions[index] = {
    ...data.clientSubscriptions[index],
    ...updates,
  };

  writeData(data);
  return data.clientSubscriptions[index];
}

function listClientSubscriptionsByMentor(mentorId) {
  return readData().clientSubscriptions.filter((item) => item.mentorId === mentorId);
}

function getMentorDetails(mentorId) {
  const user = getUserById(mentorId);
  if (!user || user.role !== 'mentor') {
    return null;
  }

  const robots = listRobotsByMentor(mentorId);
  const licenseKeys = listLicenseKeysByMentor(mentorId);
  const clientSubscriptions = listClientSubscriptionsByMentor(mentorId);

  return {
    user,
    robots,
    licenseKeys,
    clientSubscriptions,
  };
}

function getPortalTheme() {
  return readData().settings.theme;
}

function updatePortalTheme(themeUpdates) {
  const data = readData();
  data.settings = data.settings || {};
  data.settings.theme = {
    ...DEFAULT_THEME,
    ...((data.settings && data.settings.theme) || {}),
    ...themeUpdates,
  };
  writeData(data);
  return data.settings.theme;
}

function ensureMentorPortalIds() {
  const data = readData();
  let changed = false;
  let currentMax = getCurrentMaxMentorPortalId(data);

  for (const user of data.users) {
    if (user.role !== 'mentor') {
      continue;
    }

    if (!Number.isInteger(Number(user.mentorPortalId))) {
      currentMax += 1;
      user.mentorPortalId = currentMax;
      changed = true;
    }
  }

  if (changed) {
    writeData(data);
  }
}

function getNextMentorPortalIdFromData(data) {
  return getCurrentMaxMentorPortalId(data) + 1;
}

function getCurrentMaxMentorPortalId(data) {
  let max = 99;
  for (const user of data.users) {
    if (user.role !== 'mentor') {
      continue;
    }

    const idValue = Number(user.mentorPortalId);
    if (Number.isInteger(idValue) && idValue > max) {
      max = idValue;
    }
  }

  return max;
}

function getNextLicenseNumberFromData(data) {
  let max = 99;

  for (const item of data.licenseKeys) {
    const licenseNumber = Number.isInteger(item.licenseNumber)
      ? item.licenseNumber
      : Number.parseInt(item.key, 10);

    if (Number.isInteger(licenseNumber) && licenseNumber > max) {
      max = licenseNumber;
    }
  }

  return max + 1;
}

module.exports = {
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
};
