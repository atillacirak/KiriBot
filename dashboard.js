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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboard(client, port = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yesilgolet2026';

  // Helper: Get frog role info based on dynamic settings
  function getFrogRole(level, roleRewards = {}) {
    if (level >= 80) return { name: 'Bu Direkt Göl Olmuş', color: '#1B5E20', badge: '👑', minLevel: 80 };
    if (level >= 50) return { name: 'Göl Müdavimi Kurbağa', color: '#2E7D32', badge: '🌿', minLevel: 50 };
    if (level >= 25) return { name: 'Kurbağa', color: '#4CAF50', badge: '🐸', minLevel: 25 };
    return { name: 'Gölet Sakini', color: '#8BC34A', badge: '🌱', minLevel: 0 };
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
          tag: client.user ? client.user.tag : 'Kiri Bot#2895',
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

  // API: Leaderboard with Member Resolution
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const defaultGuildId = '1315029372519846039'; // Yeşil Gölet
      const guildId = req.query.guildId || defaultGuildId;
      const sortBy = req.query.sortBy || 'totalXp'; // totalXp | voiceXp | textXp | dailyXp | weeklyXp | monthlyXp
      const search = (req.query.search || '').trim().toLowerCase();
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      const settings = getGuildSettings(guild ? guild.id : defaultGuildId);

      let users = Array.from(levelCache.values())
        .filter(u => !guild || u.guildId === guild.id)
        .map(u => {
          checkAndResetTimeBuckets(u);
          return u;
        });

      // Sort
      users.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

      // Build rich user models
      const richUsers = await Promise.all(
        users.map(async (u, index) => {
          let userObj = client.users.cache.get(u.userId);
          if (!userObj && client.users) {
            try {
              userObj = await client.users.fetch(u.userId).catch(() => null);
            } catch {}
          }

          const username = userObj ? (userObj.globalName || userObj.username) : `Üye (${u.userId ? u.userId.slice(-4) : '...' })`;
          const avatar = userObj ? userObj.displayAvatarURL({ size: 128 }) : 'https://cdn.discordapp.com/embed/avatars/0.png';
          const tag = userObj ? userObj.tag : `user#${u.userId ? u.userId.slice(-4) : '0000'}`;

          const currentLevel = u.level || 0;
          const currentLevelBaseXp = getXpForLevel(currentLevel);
          const nextLevelXp = getXpForLevel(currentLevel + 1);
          const progressInLevel = Math.max(0, (u.totalXp || 0) - currentLevelBaseXp);
          const neededInLevel = Math.max(1, nextLevelXp - currentLevelBaseXp);
          const progressPercent = Math.min(100, Math.floor((progressInLevel / neededInLevel) * 100));

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
            weeklyXp: u.weeklyXp || 0,
            monthlyXp: u.monthlyXp || 0,
            voiceHours: (((u.voiceXp || 0) / 25) / 60).toFixed(1),
            progressInLevel,
            neededInLevel,
            progressPercent,
            frogRole: getFrogRole(currentLevel, settings.roleRewards)
          };
        })
      );

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

      const currentFrogRole = getFrogRole(currentLevel, settings.roleRewards);
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

  // SPA fallback
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = app.listen(port, () => {
    console.log(`🌐 Kiri Bot Dashboard & Liderlik Tablosu aktif: http://localhost:${port}`);
  });

  return server;
}