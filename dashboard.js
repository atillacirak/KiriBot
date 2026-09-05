import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  levelCache, 
  getXpForLevel, 
  getLevelForXp, 
  checkAndResetTimeBuckets, 
  getGuildSettings, 
  updateGuildSettings, 
  checkRoleRewards, 
  getUserData 
} from './levelSystem.js';
import { computeServerAnalytics } from './analyticsManager.js';
import { 
  getConversationsList, 
  getUserThread, 
  markThreadAsRead, 
  recordDirectMessage 
} from './messagesManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboard(client, port = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Disable aggressive caching so client updates load immediately
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yesilgolet2026';

  // Helper: Get user's prominent display role (Chio > Admin > Moderatör > Yetkili > Animatör > İçerik Üreticisi > Teknik Destek > V.I.P > Booster > Frog Roles)
  function getUserDisplayRole(member, user, level, roleRewards = {}) {
    const userId = (member ? member.id : (user ? user.id : '')) || '';
    const username = (member ? member.displayName : (user ? (user.globalName || user.username) : '')) || '';
    const tag = (user ? user.tag : '') || '';

    // 1. Chio (Special Title / Founder)
    if (userId === '612643930819002369' || username.toLowerCase() === 'chio' || tag.toLowerCase().startsWith('chio.')) {
      return {
        name: 'Chio',
        color: '#FF7A00',
        bg: 'rgba(255, 122, 0, 0.25)',
        border: 'rgba(255, 122, 0, 0.6)',
        badge: '👑',
        isChio: true
      };
    }

    // 1.1 Stache (Special Title / Founder)
    if (username.toLowerCase().includes('stache') || tag.toLowerCase().includes('stache') || userId === 'stache1') {
      return {
        name: 'Stache',
        color: '#A855F7',
        bg: 'rgba(168, 85, 247, 0.25)',
        border: 'rgba(168, 85, 247, 0.6)',
        badge: '👑',
        isStache: true
      };
    }

    // Role Matchers
    const roles = member?.roles?.cache ? Array.from(member.roles.cache.values()) : [];
    const hasRole = (id, namePattern) => roles.some(r => r.id === id || (namePattern && namePattern.test(r.name)));
    const getRoleObj = (id, namePattern) => roles.find(r => r.id === id || (namePattern && namePattern.test(r.name)));

    // 2. ADMIN (Role: 1315029510672089129 or Administrator permission) -> Kırmızı Çekiç 🔨
    if (member?.permissions?.has?.('Administrator') || hasRole('1315029510672089129', /^admin/i)) {
      const r = getRoleObj('1315029510672089129', /^admin/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#F3004A';
      return {
        name: 'Admin',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🔨'
      };
    }

    // 3. Moderatör (Role: 1315047438267973652) -> Kalkan 🛡️
    if (hasRole('1315047438267973652', /mod/i)) {
      const r = getRoleObj('1315047438267973652', /mod/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#58F5FF';
      return {
        name: 'Moderatör',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🛡️'
      };
    }

    // 4. Yetkili (Role: 1439002771557974139) -> Yeşil Balta 🪓 / Yeşil Renk
    if (hasRole('1439002771557974139', /yetkili/i)) {
      const r = getRoleObj('1439002771557974139', /yetkili/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#00FF93';
      return {
        name: 'Yetkili',
        color: '#00FF93',
        bg: 'rgba(0, 255, 147, 0.25)',
        border: 'rgba(0, 255, 147, 0.6)',
        badge: '🪓'
      };
    }

    // 5. Animatör (Role: 1459305221896409203) -> Resim Paleti 🎨
    if (hasRole('1459305221896409203', /animatör/i)) {
      const r = getRoleObj('1459305221896409203', /animatör/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#FF0D0D';
      return {
        name: 'Animatör',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🎨'
      };
    }

    // 6. İçerik Üreticisi (Role: 1439005238517432532) -> Recording Kırmızı Daire 🔴
    if (hasRole('1439005238517432532', /içerik/i)) {
      const r = getRoleObj('1439005238517432532', /içerik/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#FF3366';
      return {
        name: 'İçerik Üreticisi',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🔴'
      };
    }

    // 7. Teknik Destek (Role: 1439009602506326108)
    if (hasRole('1439009602506326108', /teknik/i)) {
      const r = getRoleObj('1439009602506326108', /teknik/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#3674E7';
      return {
        name: 'Teknik Destek',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🔧'
      };
    }

    // 8. V.I.P (Role: 1439010384215408733)
    if (hasRole('1439010384215408733', /v\.?i\.?p/i)) {
      const r = getRoleObj('1439010384215408733', /v\.?i\.?p/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#FFD502';
      return {
        name: 'V.I.P',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '⭐'
      };
    }

    // 9. Server Booster (Role: 1330653028050534402)
    if (hasRole('1330653028050534402', /booster/i)) {
      const r = getRoleObj('1330653028050534402', /booster/i);
      const color = (r && r.hexColor && r.hexColor !== '#000000') ? r.hexColor : '#F47FFF';
      return {
        name: 'Server Booster',
        color: color,
        bg: `${color}25`,
        border: `${color}45`,
        badge: '🚀'
      };
    }

    // 10. Default Level Frog Roles
    const lvl = parseInt(level || 0, 10);
    if (lvl >= 80) return { name: 'Bu Direkt Göl Olmuş', color: '#1B5E20', bg: 'rgba(27, 94, 32, 0.25)', border: 'rgba(27, 94, 32, 0.45)', badge: '👑', minLevel: 80 };
    if (lvl >= 50) return { name: 'Göl Müdavimi Kurbağa', color: '#2E7D32', bg: 'rgba(46, 125, 50, 0.25)', border: 'rgba(46, 125, 50, 0.45)', badge: '🌿', minLevel: 50 };
    if (lvl >= 25) return { name: 'Kurbağa', color: '#4CAF50', bg: 'rgba(76, 175, 80, 0.25)', border: 'rgba(76, 175, 80, 0.45)', badge: '🐸', minLevel: 25 };
    return { name: 'Gölet Sakini', color: '#8BC34A', bg: 'rgba(139, 195, 74, 0.2)', border: 'rgba(139, 195, 74, 0.35)', badge: '🌱', minLevel: 0 };
  }

  // API: Global & Guild Stats
  app.get('/api/stats', async (req, res) => {
    try {
      const defaultGuildId = '1315029372519846039'; // Yeşil Gölet
      const guildId = req.query.guildId || defaultGuildId;
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      const guildUsers = Array.from(levelCache.values()).filter(u => u.guildId === (guild ? guild.id : guildId));
      const totalXp = guildUsers.reduce((sum, u) => sum + (u.totalXp || 0), 0);
      const totalVoiceXp = guildUsers.reduce((sum, u) => sum + (u.voiceXp || 0), 0);
      const totalTextXp = guildUsers.reduce((sum, u) => sum + (u.textXp || 0), 0);
      const totalVoiceHours = ((totalVoiceXp / 25) / 60).toFixed(1);

      // Role distribution
      const roleCounts = {
        tier80: guildUsers.filter(u => u.level >= 80).length,
        tier50: guildUsers.filter(u => u.level >= 50 && u.level < 80).length,
        tier25: guildUsers.filter(u => u.level >= 25 && u.level < 50).length,
        tier0: guildUsers.filter(u => u.level < 25).length
      };

      res.json({
        success: true,
        bot: {
          tag: client.user ? client.user.tag : 'KurBot#2895',
          avatar: client.user ? client.user.displayAvatarURL() : null,
          uptime: process.uptime()
        },
        guild: {
          id: guild ? guild.id : defaultGuildId,
          name: guild ? guild.name : 'Yeşil Gölet',
          icon: guild ? guild.iconURL() : null,
          memberCount: guild ? guild.memberCount : 0
        },
        stats: {
          trackedUsers: guildUsers.length,
          totalXp,
          totalVoiceXp,
          totalTextXp,
          totalVoiceHours,
          roleCounts
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Helper to calculate user's XP for any (type, period) combination
  function computeUserFilteredXp(u, type = 'all', period = 'all') {
    if (type === 'voice') {
      if (period === 'daily') return u.dailyVoiceXp || (u.textXp === 0 ? (u.dailyXp || 0) : Math.max(0, (u.dailyXp || 0) - (u.dailyTextXp || 0)));
      if (period === 'weekly') return u.weeklyVoiceXp || (u.textXp === 0 ? (u.weeklyXp || 0) : Math.max(0, (u.weeklyXp || 0) - (u.weeklyTextXp || 0)));
      if (period === 'monthly') return u.monthlyVoiceXp || (u.textXp === 0 ? (u.monthlyXp || 0) : Math.max(0, (u.monthlyXp || 0) - (u.monthlyTextXp || 0)));
      return u.voiceXp || 0;
    }
    if (type === 'text') {
      if (period === 'daily') return u.dailyTextXp || (u.voiceXp === 0 ? (u.dailyXp || 0) : Math.max(0, (u.dailyXp || 0) - (u.dailyVoiceXp || 0)));
      if (period === 'weekly') return u.weeklyTextXp || (u.voiceXp === 0 ? (u.weeklyXp || 0) : Math.max(0, (u.weeklyXp || 0) - (u.weeklyVoiceXp || 0)));
      if (period === 'monthly') return u.monthlyTextXp || (u.voiceXp === 0 ? (u.monthlyXp || 0) : Math.max(0, (u.monthlyXp || 0) - (u.monthlyVoiceXp || 0)));
      return u.textXp || 0;
    }
    // type === 'all'
    if (period === 'daily') return u.dailyXp || 0;
    if (period === 'weekly') return u.weeklyXp || 0;
    if (period === 'monthly') return u.monthlyXp || 0;
    return u.totalXp || 0;
  }

  // API: Leaderboard with Member Resolution & Dual Category Filtering
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const defaultGuildId = '1315029372519846039'; // Yeşil Gölet
      const guildId = req.query.guildId || defaultGuildId;
      let type = (req.query.type || '').trim().toLowerCase(); // all | voice | text
      let period = (req.query.period || '').trim().toLowerCase(); // all | daily | weekly | monthly
      const sortBy = req.query.sortBy; // Legacy support
      const search = (req.query.search || '').trim().toLowerCase();
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

      // Handle legacy sortBy fallback
      if (!type && !period && sortBy) {
        if (sortBy === 'voiceXp') { type = 'voice'; period = 'all'; }
        else if (sortBy === 'textXp') { type = 'text'; period = 'all'; }
        else if (sortBy === 'dailyXp') { type = 'all'; period = 'daily'; }
        else if (sortBy === 'weeklyXp') { type = 'all'; period = 'weekly'; }
        else if (sortBy === 'monthlyXp') { type = 'all'; period = 'monthly'; }
        else { type = 'all'; period = 'all'; }
      } else {
        if (!type || !['all', 'voice', 'text'].includes(type)) type = 'all';
        if (!period || !['all', 'daily', 'weekly', 'monthly'].includes(period)) period = 'all';
      }

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      const settings = getGuildSettings(guild ? guild.id : defaultGuildId);

      let users = Array.from(levelCache.values())
        .filter(u => !guild || u.guildId === guild.id)
        .map(u => {
          checkAndResetTimeBuckets(u);
          return u;
        });

      // Sort by active dual filter XP
      users.sort((a, b) => {
        const xpA = computeUserFilteredXp(a, type, period);
        const xpB = computeUserFilteredXp(b, type, period);
        if (xpB !== xpA) return xpB - xpA;
        return (b.totalXp || 0) - (a.totalXp || 0);
      });

      // Build rich user models
      const richUsers = users.map((u, index) => {
        const userObj = client.users ? client.users.cache.get(u.userId) : null;
        const memberObj = guild ? guild.members.cache.get(u.userId) : null;

        const username = memberObj ? memberObj.displayName : (userObj ? (userObj.globalName || userObj.username) : `Üye (${u.userId ? u.userId.slice(-4) : '...' })`);
        const avatar = userObj ? userObj.displayAvatarURL({ size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
        const tag = userObj ? userObj.tag : `user#${u.userId ? u.userId.slice(-4) : '0000'}`;

        const currentLevel = u.level || 0;
        const currentLevelBaseXp = getXpForLevel(currentLevel);
        const nextLevelXp = getXpForLevel(currentLevel + 1);
        const progressInLevel = Math.max(0, (u.totalXp || 0) - currentLevelBaseXp);
        const neededInLevel = Math.max(1, nextLevelXp - currentLevelBaseXp);
        const progressPercent = Math.min(100, Math.floor((progressInLevel / neededInLevel) * 100));

        const displayRole = getUserDisplayRole(memberObj, userObj, currentLevel, settings.roleRewards);
        const filteredXp = computeUserFilteredXp(u, type, period);

        return {
          rank: index + 1,
          userId: u.userId,
          username,
          tag,
          avatar,
          level: currentLevel,
          totalXp: u.totalXp || 0,
          voiceXp: u.voiceXp || 0,
          textXp: u.textXp || 0,
          dailyXp: u.dailyXp || 0,
          dailyVoiceXp: u.dailyVoiceXp || 0,
          dailyTextXp: u.dailyTextXp || 0,
          weeklyXp: u.weeklyXp || 0,
          weeklyVoiceXp: u.weeklyVoiceXp || 0,
          weeklyTextXp: u.weeklyTextXp || 0,
          monthlyXp: u.monthlyXp || 0,
          monthlyVoiceXp: u.monthlyVoiceXp || 0,
          monthlyTextXp: u.monthlyTextXp || 0,
          filteredXp,
          voiceHours: (((u.voiceXp || 0) / 25) / 60).toFixed(1),
          progressInLevel,
          neededInLevel,
          progressPercent,
          frogRole: displayRole
        };
      });

      // Search filter if provided
      let filtered = richUsers;
      if (search) {
        filtered = richUsers.filter(u => 
          u.username.toLowerCase().includes(search) || 
          u.tag.toLowerCase().includes(search) || 
          u.userId.includes(search)
        );
      }

      res.json({
        success: true,
        type,
        period,
        total: filtered.length,
        users: filtered.slice(0, limit)
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // API: Single User Profile & Role Milestone Details
  app.get('/api/user/:userId', async (req, res) => {
    try {
      const defaultGuildId = '1315029372519846039';
      const guildId = req.query.guildId || defaultGuildId;
      const { userId } = req.params;

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      const settings = getGuildSettings(guild ? guild.id : defaultGuildId);

      const u = getUserData(guild ? guild.id : defaultGuildId, userId);
      checkAndResetTimeBuckets(u);

      // Resolve Discord user
      let userObj = client.users.cache.get(userId);
      if (!userObj && client.users) {
        try {
          userObj = await client.users.fetch(userId).catch(() => null);
        } catch {}
      }

      let memberObj = null;
      if (guild) {
        try {
          memberObj = await guild.members.fetch(userId).catch(() => null);
        } catch {}
      }

      const username = memberObj ? memberObj.displayName : (userObj ? (userObj.globalName || userObj.username) : `Üye (${userId.slice(-4)})`);
      const tag = userObj ? userObj.tag : `user#${userId.slice(-4)}`;
      const avatar = userObj ? userObj.displayAvatarURL({ size: 256 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

      // Rank calculation
      const allGuildUsers = Array.from(levelCache.values())
        .filter(user => !guild || user.guildId === guild.id)
        .sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));

      const rank = allGuildUsers.findIndex(user => user.userId === userId) + 1 || (allGuildUsers.length + 1);

      const currentLevel = u.level || 0;
      const currentLevelBaseXp = getXpForLevel(currentLevel);
      const nextLevelXp = getXpForLevel(currentLevel + 1);
      const progressInLevel = Math.max(0, (u.totalXp || 0) - currentLevelBaseXp);
      const neededInLevel = Math.max(1, nextLevelXp - currentLevelBaseXp);
      const progressPercent = Math.min(100, Math.floor((progressInLevel / neededInLevel) * 100));

      // Role milestone calculation
      const milestones = [
        { level: 25, name: 'Kurbağa', badge: '🐸' },
        { level: 50, name: 'Göl Müdavimi Kurbağa', badge: '🌿' },
        { level: 80, name: 'Bu Direkt Göl Olmuş', badge: '👑' }
      ];

      const currentFrogRole = getUserDisplayRole(memberObj, userObj, currentLevel, settings.roleRewards);
      const nextMilestone = milestones.find(m => m.level > currentLevel);

      let nextRoleInfo = null;
      if (nextMilestone) {
        const targetXp = getXpForLevel(nextMilestone.level);
        const xpRemaining = Math.max(0, targetXp - (u.totalXp || 0));
        const levelsRemaining = nextMilestone.level - currentLevel;
        
        // Progress towards next role
        const prevLevel = milestones.filter(m => m.level <= currentLevel).pop()?.level || 0;
        const prevXp = getXpForLevel(prevLevel);
        const roleProgressPercent = Math.min(100, Math.floor(((u.totalXp - prevXp) / Math.max(1, targetXp - prevXp)) * 100));

        nextRoleInfo = {
          targetLevel: nextMilestone.level,
          name: nextMilestone.name,
          badge: nextMilestone.badge,
          levelsRemaining,
          xpRemaining,
          targetXp,
          roleProgressPercent: Math.max(0, roleProgressPercent)
        };
      }

      res.json({
        success: true,
        user: {
          userId,
          username,
          tag,
          avatar,
          level: currentLevel,
          rank,
          totalUsers: allGuildUsers.length,
          totalXp: u.totalXp || 0,
          voiceXp: u.voiceXp || 0,
          textXp: u.textXp || 0,
          dailyXp: u.dailyXp || 0,
          weeklyXp: u.weeklyXp || 0,
          monthlyXp: u.monthlyXp || 0,
          voiceHours: (((u.voiceXp || 0) / 25) / 60).toFixed(1),
          progressInLevel,
          neededInLevel,
          progressPercent,
          currentFrogRole,
          nextRoleInfo
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- ADMIN APIs ---

  // Admin Auth Verify & Get Guild Channels / Roles
  app.get('/api/admin/channels-and-roles', async (req, res) => {
    try {
      const defaultGuildId = '1315029372519846039';
      const guildId = req.query.guildId || defaultGuildId;
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      if (!guild) {
        return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
      }

      // Ensure all channels and roles are fetched
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // Build category map
      const categoriesMap = new Map();
      guild.channels.cache.forEach(c => {
        if (c.type === 4) { // GuildCategory
          categoriesMap.set(c.id, {
            id: c.id,
            name: c.name,
            position: c.rawPosition ?? c.position ?? 0
          });
        }
      });

      // Filter out categories from channel items, map type icons and names
      const channels = Array.from(guild.channels.cache.values())
        .filter(c => c && c.type !== 4) // exclude categories themselves
        .map(c => {
          const parent = c.parentId ? categoriesMap.get(c.parentId) : null;
          let typeName = 'Metin';
          let icon = '#';
          if (c.type === 2) { typeName = 'Ses'; icon = '🔊'; }
          else if (c.type === 5) { typeName = 'Duyuru'; icon = '📢'; }
          else if (c.type === 15) { typeName = 'Forum'; icon = '💬'; }
          else if (c.type === 13) { typeName = 'Sahne'; icon = '🎭'; }
          else if (c.type === 0) { typeName = 'Metin'; icon = '#'; }

          return {
            id: c.id,
            name: c.name,
            type: c.type,
            typeName,
            icon,
            parentId: c.parentId || null,
            parentName: parent ? parent.name : 'Genel Kanallar',
            parentPosition: parent ? parent.position : -1,
            position: c.rawPosition ?? c.position ?? 0
          };
        })
        .sort((a, b) => {
          if (a.parentPosition !== b.parentPosition) return a.parentPosition - b.parentPosition;
          return a.position - b.position;
        });

      const roles = Array.from(guild.roles.cache.values())
        .filter(r => r.name !== '@everyone')
        .map(r => ({
          id: r.id,
          name: r.name,
          color: (!r.hexColor || r.hexColor === '#000000') ? '#99aab5' : r.hexColor,
          position: r.position,
          managed: r.managed || false,
          memberCount: r.members ? r.members.size : 0
        }))
        .sort((a, b) => b.position - a.position);

      const settings = getGuildSettings(guild.id);

      res.json({
        success: true,
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL() },
        channels,
        roles,
        settings
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Analytics & Growth Endpoint
  app.get('/api/admin/analytics', async (req, res) => {
    try {
      const { password, period, guildId } = req.query;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası / PIN!' });
      }

      const defaultGuildId = '1315029372519846039';
      const targetGuildId = guildId || defaultGuildId;
      const guild = client.guilds.cache.get(targetGuildId) || client.guilds.cache.first();

      if (!guild) {
        return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });
      }

      const analytics = await computeServerAnalytics(guild, levelCache, period || 'week');

      res.json({
        success: true,
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL() },
        analytics
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Save Settings
  app.post('/api/admin/settings', async (req, res) => {
    try {
      const { password, guildId, settings } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası / PIN!' });
      }

      const defaultGuildId = '1315029372519846039';
      const targetGuildId = guildId || defaultGuildId;

      const updated = await updateGuildSettings(targetGuildId, settings);
      console.log(`🛠️ [Admin Panel] ${targetGuildId} sunucu ayarları güncellendi!`);

      res.json({ success: true, settings: updated });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin Modify User Level / XP
  app.post('/api/admin/modify-user', async (req, res) => {
    try {
      const { password, guildId, userId, action, value } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası / PIN!' });
      }

      const defaultGuildId = '1315029372519846039';
      const targetGuildId = guildId || defaultGuildId;
      const data = getUserData(targetGuildId, userId);

      const numericValue = parseInt(value || '0', 10);

      if (action === 'setLevel') {
        data.level = numericValue;
        data.totalXp = getXpForLevel(numericValue);
      } else if (action === 'addXp') {
        data.totalXp += numericValue;
        data.textXp += numericValue;
        data.dailyXp += numericValue;
        data.weeklyXp += numericValue;
        data.monthlyXp += numericValue;
        data.level = getLevelForXp(data.totalXp);
      } else if (action === 'removeXp') {
        data.totalXp = Math.max(0, data.totalXp - numericValue);
        data.level = getLevelForXp(data.totalXp);
      } else if (action === 'reset') {
        data.totalXp = 0;
        data.textXp = 0;
        data.voiceXp = 0;
        data.dailyXp = 0;
        data.weeklyXp = 0;
        data.monthlyXp = 0;
        data.level = 0;
      }

      const guild = client.guilds.cache.get(targetGuildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await checkRoleRewards(guild, member, data.level);
        }
      }

      res.json({ success: true, user: data });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Get all guild members for quick selection
  app.get('/api/admin/members', async (req, res) => {
    try {
      const { password, guildId, search } = req.query;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }

      const defaultGuildId = '1315029372519846039';
      const guild = client.guilds.cache.get(guildId || defaultGuildId) || client.guilds.cache.first();
      if (!guild) return res.status(404).json({ success: false, error: 'Sunucu bulunamadı.' });

      // Fetch or cache members
      await guild.members.fetch().catch(() => {});
      const query = (search || '').toLowerCase().trim();

      const memberList = Array.from(guild.members.cache.values())
        .filter(m => !m.user.bot)
        .map(m => {
          const uData = getUserData(guild.id, m.id);
          const displayRole = getUserDisplayRole(m, m.user, uData?.level || 0);
          return {
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            tag: m.user.tag,
            avatar: m.user.displayAvatarURL({ size: 64 }),
            level: uData?.level || 0,
            role: displayRole
          };
        })
        .filter(m => {
          if (!query) return true;
          return m.username.toLowerCase().includes(query) ||
                 m.displayName.toLowerCase().includes(query) ||
                 m.tag.toLowerCase().includes(query) ||
                 m.id.includes(query);
        })
        .slice(0, 50);

      res.json({ success: true, members: memberList });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Get Conversations List & Total Unread Count
  app.get('/api/admin/conversations', async (req, res) => {
    try {
      const { password } = req.query;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }

      const data = getConversationsList();
      res.json({ success: true, ...data });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Get Thread Messages for a User & Mark Read
  app.get('/api/admin/conversations/:userId', async (req, res) => {
    try {
      const { password } = req.query;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }

      const { userId } = req.params;
      const messages = getUserThread(userId);
      await markThreadAsRead(userId);

      res.json({ success: true, messages });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Mark Thread as Read
  app.post('/api/admin/conversations/:userId/read', async (req, res) => {
    try {
      const { password } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }

      const { userId } = req.params;
      await markThreadAsRead(userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Admin: Send Bot DM to User
  app.post('/api/admin/send-dm', async (req, res) => {
    try {
      const { password, userId, message, asEmbed, title } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }
      if (!userId || !message) {
        return res.status(400).json({ success: false, error: 'Kullanıcı ve mesaj metni gereklidir.' });
      }

      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Discord kullanıcısı bulunamadı veya ID geçersiz.' });
      }

      const defaultGuildId = '1315029372519846039';
      const guild = client.guilds.cache.get(defaultGuildId) || client.guilds.cache.first();

      if (asEmbed) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setColor('#5EA454')
          .setTitle(title || '🌿 Yeşil Gölet Bildirimi')
          .setDescription(message)
          .setFooter({ text: `${guild?.name || 'Yeşil Gölet'} • Yönetim Bildirisi`, iconURL: guild?.iconURL() })
          .setTimestamp();
        await user.send({ embeds: [embed] });
      } else {
        await user.send(message);
      }

      // Record to direct messages storage
      const msgRecord = await recordDirectMessage({
        userId: user.id,
        userTag: user.tag || user.username,
        userDisplayName: user.globalName || user.username,
        userAvatar: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true, size: 128 }) : '',
        direction: 'outgoing',
        content: message,
        asEmbed: !!asEmbed,
        embedTitle: title || '🌿 Yeşil Gölet Bildirimi',
        sentBy: 'admin',
        timestamp: new Date().toISOString(),
        read: true
      });

      console.log(`✉️ [Admin DM] ${user.tag} (${userId}) kullanıcısına DM gönderildi.`);
      res.json({ 
        success: true, 
        message: `Mesaj @${user.tag} kullanıcısına başarıyla iletildi!`,
        msgRecord 
      });
    } catch (e) {
      res.status(500).json({ success: false, error: `DM gönderilemedi: ${e.message} (Kullanıcının DM'leri kapalı olabilir)` });
    }
  });

  // Admin: Send Bot Message to Channel
  app.post('/api/admin/send-channel-msg', async (req, res) => {
    try {
      const { password, channelId, message, asEmbed, title } = req.body;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }
      if (!channelId || !message) {
        return res.status(400).json({ success: false, error: 'Kanal ve mesaj metni gereklidir.' });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ success: false, error: 'Metin kanalı bulunamadı.' });
      }

      const defaultGuildId = '1315029372519846039';
      const guild = client.guilds.cache.get(defaultGuildId) || client.guilds.cache.first();

      if (asEmbed) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setColor('#5EA454')
          .setTitle(title || '🌿 Yeşil Gölet Duyurusu')
          .setDescription(message)
          .setFooter({ text: `${guild?.name || 'Yeşil Gölet'} • Yönetim`, iconURL: guild?.iconURL() })
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      } else {
        await channel.send(message);
      }

      console.log(`📢 [Admin Kanal Mesajı] #${channel.name} (${channelId}) kanalına mesaj yollandı.`);
      res.json({ success: true, message: `Mesaj #${channel.name} kanalına başarıyla gönderildi!` });
    } catch (e) {
      res.status(500).json({ success: false, error: `Kanal mesajı gönderilemedi: ${e.message}` });
    }
  });

  // Admin: Download Database Backup
  app.get('/api/admin/backup-download', async (req, res) => {
    try {
      const { password } = req.query;
      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, error: 'Geçersiz Admin Parolası!' });
      }

      const defaultGuildId = '1315029372519846039';
      const guild = client.guilds.cache.get(defaultGuildId) || client.guilds.cache.first();
      const settings = getGuildSettings(defaultGuildId);

      const backupData = {
        exportedAt: new Date().toISOString(),
        guild: {
          id: guild?.id,
          name: guild?.name,
          memberCount: guild?.memberCount
        },
        settings,
        users: Array.from(levelCache.values())
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Disposition', `attachment; filename="kurbot-backup-${dateStr}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(backupData, null, 2));
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Contact Requests Store
  const contactRequests = [];

  // POST /api/contact — public form submission
  app.post('/api/contact', (req, res) => {
    try {
      const { subject, discordUsername, discordId, email, message } = req.body || {};
      if (!subject || !message || message.length < 10) {
        return res.status(400).json({ success: false, error: 'Gerekli alanlar eksik.' });
      }
      if (!discordUsername && !discordId) {
        return res.status(400).json({ success: false, error: 'Discord kullanıcı adı veya ID gerekli.' });
      }
      const id = `CR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const record = {
        id,
        subject: String(subject).slice(0, 100),
        discordUsername: String(discordUsername || '').slice(0, 64),
        discordId: String(discordId || '').replace(/[^0-9]/g, '').slice(0, 20),
        email: String(email || '').slice(0, 120),
        message: String(message).slice(0, 1000),
        status: 'new',
        createdAt: new Date().toISOString()
      };
      contactRequests.unshift(record);
      if (contactRequests.length > 500) contactRequests.splice(500);
      console.log(`📩 Yeni iletişim talebi: [${id}] ${record.subject} — @${record.discordUsername || record.discordId}`);
      res.json({ success: true, id });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /api/contact-requests — admin only
  app.get('/api/contact-requests', (req, res) => {
    const pw = req.headers['x-admin-password'] || req.query.pw || '';
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Yetkisiz.' });
    res.json({ success: true, requests: contactRequests, total: contactRequests.length });
  });

  // PATCH /api/contact-requests/:id — mark as resolved
  app.patch('/api/contact-requests/:id', (req, res) => {
    const pw = req.headers['x-admin-password'] || req.query.pw || '';
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Yetkisiz.' });
    const record = contactRequests.find(r => r.id === req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });
    record.status = req.body?.status || 'resolved';
    res.json({ success: true, record });
  });

  // DELETE /api/contact-requests/:id — admin only
  app.delete('/api/contact-requests/:id', (req, res) => {
    const pw = req.headers['x-admin-password'] || req.query.pw || '';
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Yetkisiz.' });
    const idx = contactRequests.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });
    contactRequests.splice(idx, 1);
    res.json({ success: true });
  });

  // Contact Page Route
  app.get(['/contact', '/iletisim'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
  });

  // Privacy Policy Route
  app.get(['/privacy', '/privacy-policy', '/gizlilik'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
  });

  // Terms of Service Route
  app.get(['/terms', '/terms-of-service', '/kosullar', '/hizmet-kosullari'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
  });

  // SPA fallback
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = app.listen(port, () => {
    console.log(`🌐 KurBot Dashboard & Liderlik Tablosu aktif: http://localhost:${port}`);
  });

  return server;
}