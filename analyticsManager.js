import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EVENTS_DB_FILE = path.join(__dirname, 'database_events.json');

let mongoDb = null;
let mongoEventsCollection = null;
const eventLogsCache = [];

// Load local events fallback
function loadLocalEvents() {
  try {
    if (fs.existsSync(EVENTS_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_DB_FILE, 'utf8'));
      if (Array.isArray(data)) {
        eventLogsCache.push(...data);
      }
    }
  } catch (e) {
    console.error('Local events load error:', e.message);
  }
}

function saveLocalEvents() {
  try {
    // Keep last 1000 events locally
    const recent = eventLogsCache.slice(-1000);
    fs.writeFileSync(EVENTS_DB_FILE, JSON.stringify(recent, null, 2), 'utf8');
  } catch (e) {
    console.error('Local events save error:', e.message);
  }
}

loadLocalEvents();

export async function initAnalyticsMongo(db) {
  if (!db) return;
  try {
    mongoDb = db;
    mongoEventsCollection = db.collection('member_events');
    const docs = await mongoEventsCollection.find({}).sort({ timestamp: -1 }).limit(1000).toArray();
    if (docs.length > 0) {
      eventLogsCache.length = 0;
      eventLogsCache.push(...docs.reverse());
    }
    console.log(`📊 Analytics MongoDB koleksiyonu aktif! (${eventLogsCache.length} üye hareketi yüklendi)`);
  } catch (err) {
    console.error('Analytics MongoDB init error:', err.message);
  }
}

// Record Member Join Event
export async function recordMemberJoin(member) {
  if (!member || !member.guild) return;
  const event = {
    guildId: member.guild.id,
    userId: member.id,
    username: member.user?.displayName || member.user?.username || 'Bilinmeyen Üye',
    tag: member.user?.tag || member.id,
    avatar: member.user?.displayAvatarURL({ size: 128 }) || 'https://cdn.discordapp.com/embed/avatars/0.png',
    type: 'join',
    timestamp: new Date()
  };

  eventLogsCache.push(event);
  saveLocalEvents();

  if (mongoEventsCollection) {
    try {
      await mongoEventsCollection.insertOne(event);
    } catch (e) {
      console.warn('MongoDB record join error:', e.message);
    }
  }
}

// Record Member Leave Event
export async function recordMemberLeave(member) {
  if (!member || !member.guild) return;
  const user = member.user || {};
  const event = {
    guildId: member.guild.id,
    userId: member.id,
    username: user.displayName || user.username || 'Ayrılan Üye',
    tag: user.tag || member.id,
    avatar: (user.displayAvatarURL ? user.displayAvatarURL({ size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png'),
    type: 'leave',
    timestamp: new Date()
  };

  eventLogsCache.push(event);
  saveLocalEvents();

  if (mongoEventsCollection) {
    try {
      await mongoEventsCollection.insertOne(event);
    } catch (e) {
      console.warn('MongoDB record leave error:', e.message);
    }
  }
}

// Channel message counters
const channelMessageCounts = new Map(); // channelId -> count

export function recordChannelMessage(channelId, channelName) {
  if (!channelId) return;
  const current = channelMessageCounts.get(channelId) || { id: channelId, name: channelName, count: 0 };
  current.count++;
  channelMessageCounts.set(channelId, current);
}

// Compute Full Server Analytics
export async function computeServerAnalytics(guild, levelCache, period = 'week') {
  if (!guild) return null;

  // Make sure guild members are fetched
  await guild.members.fetch().catch(() => {});

  const now = new Date();
  let startTime = new Date(0); // all time

  if (period === 'today') {
    // Start of today (UTC / local)
    startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    // Last 7 days
    startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  } else if (period === 'month') {
    // Last 30 days
    startTime = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  }

  // 1. Filter Events in Timeframe
  const eventsInPeriod = eventLogsCache.filter(e => {
    if (e.guildId !== guild.id) return false;
    const t = new Date(e.timestamp);
    return t >= startTime && t <= now;
  });

  const joinsInPeriod = eventsInPeriod.filter(e => e.type === 'join');
  const leavesInPeriod = eventsInPeriod.filter(e => e.type === 'leave');

  const joinsCount = joinsInPeriod.length;
  const leavesCount = leavesInPeriod.length;
  const netGrowth = joinsCount - leavesCount;

  // 2. Active Members Analysis (Text & Voice)
  const allUsersData = Array.from(levelCache.values()).filter(d => d.guildId === guild.id);

  let textActiveUsersCount = 0;
  let voiceActiveUsersCount = 0;
  let totalActiveUsersCount = 0;
  let totalVoiceMinutes = 0;
  let totalXpEarnedInPeriod = 0;

  for (const u of allUsersData) {
    let userTextXp = 0;
    let userVoiceXp = 0;

    if (period === 'today') {
      userTextXp = (u.dailyXp || 0) > 0 ? (u.dailyXp || 0) : 0;
      userVoiceXp = (u.dailyXp || 0) > 0 ? (u.dailyXp || 0) : 0;
    } else if (period === 'week') {
      userTextXp = u.weeklyXp || 0;
      userVoiceXp = u.weeklyXp || 0;
    } else if (period === 'month') {
      userTextXp = u.monthlyXp || 0;
      userVoiceXp = u.monthlyXp || 0;
    } else {
      userTextXp = u.textXp || 0;
      userVoiceXp = u.voiceXp || 0;
    }

    const hasTextActivity = userTextXp > 0;
    const hasVoiceActivity = userVoiceXp > 0;

    if (hasTextActivity) textActiveUsersCount++;
    if (hasVoiceActivity) voiceActiveUsersCount++;
    if (hasTextActivity || hasVoiceActivity) {
      totalActiveUsersCount++;
      totalXpEarnedInPeriod += (userTextXp + userVoiceXp);
    }
  }

  // Calculate voice minutes
  totalVoiceMinutes = Math.floor(allUsersData.reduce((acc, u) => {
    let xp = (period === 'all' ? (u.voiceXp || 0) : (period === 'month' ? (u.monthlyXp || 0) : (period === 'week' ? (u.weeklyXp || 0) : (u.dailyXp || 0))));
    return acc + (xp / 25);
  }, 0));

  const totalServerMembers = guild.memberCount || guild.members.cache.filter(m => !m.user.bot).size;
  const activeRatePercent = totalServerMembers > 0 ? Math.min(100, Math.round((totalActiveUsersCount / totalServerMembers) * 100)) : 0;

  // 3. User Retention & Cohort Behavior Analysis (Gelen Kullanıcı Tutundurma & Davranış)
  // Check members who joined in this timeframe (or all non-bot members joined recently)
  const nonBotMembers = Array.from(guild.members.cache.values()).filter(m => !m.user.bot);
  
  const cohortMembers = nonBotMembers.filter(m => {
    if (!m.joinedTimestamp) return false;
    if (period === 'all') return true;
    return m.joinedTimestamp >= startTime.getTime();
  });

  let retainedActiveCount = 0;  // > 50 XP (düzenli mesaj / ses)
  let casualDroppersCount = 0;  // 1 - 50 XP (1-2 mesaj atıp kalan/bırakan)
  let ghostInactiveCount = 0;   // 0 XP (hiç mesaj yazmayan / sese girmeyen)

  cohortMembers.forEach(m => {
    const u = levelCache.get(`${guild.id}_${m.id}`) || { totalXp: 0, textXp: 0, voiceXp: 0 };
    const xp = u.totalXp || 0;

    if (xp >= 50) {
      retainedActiveCount++;
    } else if (xp > 0) {
      casualDroppersCount++;
    } else {
      ghostInactiveCount++;
    }
  });

  // Calculate cohort percentages
  const totalCohortSize = cohortMembers.length + leavesCount;
  const retainedActivePercent = totalCohortSize > 0 ? Math.round((retainedActiveCount / totalCohortSize) * 100) : 0;
  const casualDroppersPercent = totalCohortSize > 0 ? Math.round((casualDroppersCount / totalCohortSize) * 100) : 0;
  const ghostInactivePercent = totalCohortSize > 0 ? Math.round((ghostInactiveCount / totalCohortSize) * 100) : 0;
  const leftPercent = totalCohortSize > 0 ? Math.round((leavesCount / totalCohortSize) * 100) : 0;

  // 4. Recent Member Events List (Combined recent joins & leaves)
  const recentEvents = eventsInPeriod.slice(-25).reverse().map(e => {
    const u = levelCache.get(`${guild.id}_${e.userId}`);
    const xp = u ? (u.totalXp || 0) : 0;
    let activityStatus = '0 Mesaj (Hayalet) 👻';
    if (xp >= 50) activityStatus = 'Aktif Katılımcı 🟢';
    else if (xp > 0) activityStatus = '1-2 Mesaj Attı 🟡';

    return {
      ...e,
      activityStatus: e.type === 'leave' ? 'Ayrıldı 🔴' : activityStatus,
      totalXp: xp
    };
  });

  // 5. Channel message activity ranking
  const topChannels = Array.from(channelMessageCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    period,
    totalServerMembers,
    // Activity Overview
    activity: {
      totalActiveUsersCount,
      textActiveUsersCount,
      voiceActiveUsersCount,
      totalVoiceMinutes,
      totalVoiceHours: (totalVoiceMinutes / 60).toFixed(1),
      totalXpEarnedInPeriod,
      activeRatePercent
    },
    // Growth & Churn Overview
    growth: {
      joinsCount,
      leavesCount,
      netGrowth,
      isPositive: netGrowth >= 0
    },
    // Cohort & Retention Behavior
    cohort: {
      totalCohortSize,
      joinedInPeriodCount: cohortMembers.length,
      retainedActive: {
        count: retainedActiveCount,
        percent: retainedActivePercent
      },
      casualDroppers: {
        count: casualDroppersCount,
        percent: casualDroppersPercent
      },
      ghostInactive: {
        count: ghostInactiveCount,
        percent: ghostInactivePercent
      },
      left: {
        count: leavesCount,
        percent: leftPercent
      }
    },
    // Recent logs & Channels
    recentEvents,
    topChannels
  };
}
