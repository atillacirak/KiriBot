import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { levelCache, getXpForLevel, checkAndResetTimeBuckets } from './levelSystem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboard(client, port = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Helper: Get frog role info
  function getFrogRole(level) {
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
      const sortBy = req.query.sortBy || 'totalXp'; // totalXp | voiceXp | textXp
      const search = (req.query.search || '').trim().toLowerCase();
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
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
            frogRole: getFrogRole(currentLevel)
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

  // SPA fallback
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = app.listen(port, () => {
    console.log(`🌐 Kiri Bot Dashboard & Liderlik Tablosu aktif: http://localhost:${port}`);
  });

  return server;
}