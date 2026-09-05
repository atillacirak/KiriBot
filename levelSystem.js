import { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Local backup file for level data
const LEVELS_DB_FILE = path.join(process.cwd(), 'database_levels.json');

// In-memory cache for ultra-fast zero-latency operations
// Key: `${guildId}_${userId}` -> UserLevelData
const levelCache = new Map();
let mongoLevelsCollection = null;

function loadLocalLevels() {
  try {
    if (fs.existsSync(LEVELS_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEVELS_DB_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        levelCache.set(k, v);
      }
    }
  } catch (e) {
    console.error('Local levels load error:', e.message);
  }
}

function saveLocalLevels() {
  try {
    const obj = Object.fromEntries(levelCache.entries());
    fs.writeFileSync(LEVELS_DB_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Local levels save error:', e.message);
  }
}

// Load initial data
loadLocalLevels();

// Initialize MongoDB Collection
export async function initLevelSystemMongo(db) {
  if (!db) return;
  try {
    mongoLevelsCollection = db.collection('user_levels');
    const allDocs = await mongoLevelsCollection.find({}).toArray();
    for (const doc of allDocs) {
      const key = `${doc.guildId}_${doc.userId}`;
      levelCache.set(key, {
        userId: doc.userId,
        guildId: doc.guildId,
        textXp: doc.textXp || 0,
        voiceXp: doc.voiceXp || 0,
        totalXp: doc.totalXp || 0,
        level: doc.level || 0,
        lastMessageAt: doc.lastMessageAt || 0
      });
    }
    console.log(`✅ MongoDB Seviye Sistemi aktif! (${allDocs.length} üye verisi yüklendi)`);
  } catch (err) {
    console.error('MongoDB Level System Init Error:', err.message);
  }
}

// Flush dirty cache to MongoDB and local disk every 60 seconds
setInterval(async () => {
  if (levelCache.size === 0) return;
  saveLocalLevels();
  if (mongoLevelsCollection) {
    try {
      const bulkOps = [];
      for (const [key, data] of levelCache.entries()) {
        bulkOps.push({
          updateOne: {
            filter: { guildId: data.guildId, userId: data.userId },
            update: { $set: data },
            upsert: true
          }
        });
      }
      if (bulkOps.length > 0) {
        await mongoLevelsCollection.bulkWrite(bulkOps, { ordered: false });
      }
    } catch (e) {
      // Background sync quiet fail
    }
  }
}, 60000);

// --- XP & LEVEL FORMULAS ---
// Amari/Standard Cubic Level Formula
export function getXpForLevel(level) {
  if (level <= 0) return 0;
  return Math.floor((5.0 / 3.0) * Math.pow(level, 3) + (135.0 / 2.0) * Math.pow(level, 2) + (455.0 / 6.0) * level);
}

export function getLevelForXp(xp) {
  if (!xp || xp <= 0) return 0;
  let l = 0;
  while (getXpForLevel(l + 1) <= xp) {
    l++;
  }
  return l;
}

// Server Role Rewards mapping for Yeşil Gölet
const ROLE_REWARDS = {
  25: '1439006338402484305', // kurbağa
  50: '1439006370769666140', // göl müdavimi kurbağa
  80: '1439006516282785964'  // bu direkt göl olmuş
};

// Time Bucket Helper (Daily, Weekly, Monthly Resets)
function checkAndResetTimeBuckets(data) {
  const now = new Date();
  
  // Daily Reset (UTC midnight)
  const currentDay = now.toISOString().slice(0, 10);
  if (data.lastDay !== currentDay) {
    data.dailyXp = 0;
    data.lastDay = currentDay;
  }

  // Weekly Reset (ISO Week)
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const currentWeek = `${d.getUTCFullYear()}-W${weekNo}`;
  if (data.lastWeek !== currentWeek) {
    data.weeklyXp = 0;
    data.lastWeek = currentWeek;
  }

  // Monthly Reset (YYYY-MM)
  const currentMonth = now.toISOString().slice(0, 7);
  if (data.lastMonth !== currentMonth) {
    data.monthlyXp = 0;
    data.lastMonth = currentMonth;
  }
}

export { levelCache, ROLE_REWARDS, checkAndResetTimeBuckets };
export function getUserData(guildId, userId) {
  const key = `${guildId}_${userId}`;
  if (!levelCache.has(key)) {
    levelCache.set(key, {
      userId,
      guildId,
      textXp: 0,
      voiceXp: 0,
      totalXp: 0,
      dailyXp: 0,
      weeklyXp: 0,
      monthlyXp: 0,
      level: 0,
      lastMessageAt: 0,
      lastDay: '',
      lastWeek: '',
      lastMonth: ''
    });
  }
  const data = levelCache.get(key);
  checkAndResetTimeBuckets(data);
  return data;
}

// Check & Award Role Rewards
async function checkRoleRewards(guild, member, newLevel) {
  if (!guild || !member) return;
  for (const [lvlReqStr, roleId] of Object.entries(ROLE_REWARDS)) {
    const lvlReq = parseInt(lvlReqStr, 10);
    if (newLevel >= lvlReq) {
      if (!member.roles.cache.has(roleId)) {
        try {
          await member.roles.add(roleId);
          console.log(`🎉 [Seviye Ödülü] ${member.user.tag} Seviye ${newLevel}'e ulaştı ve rolü aldı: ${roleId}`);
        } catch (err) {
          console.warn(`Rol verme hatası (${roleId}):`, err.message);
        }
      }
    }
  }
}

// --- TEXT XP HANDLER ---
export async function handleTextMessage(message) {
  if (!message.guild || message.author.bot) return;

  const { guild, author, channel } = message;
  // Ignore specific bot/spam channels
  const ignoreChannels = ['1439038727644250346', '1315051073781895168', '1439016893322100746'];
  if (ignoreChannels.includes(channel.id)) return;

  const data = getUserData(guild.id, author.id);
  const now = Date.now();

  // 20-second cooldown per user for text XP
  if (now - data.lastMessageAt < 20000) return;

  data.lastMessageAt = now;
  // Award 10 - 15 XP
  const earnedXp = Math.floor(Math.random() * 6) + 10;
  data.textXp = (data.textXp || 0) + earnedXp;
  data.totalXp = (data.totalXp || 0) + earnedXp;
  data.dailyXp = (data.dailyXp || 0) + earnedXp;
  data.weeklyXp = (data.weeklyXp || 0) + earnedXp;
  data.monthlyXp = (data.monthlyXp || 0) + earnedXp;

  const oldLevel = data.level;
  const newLevel = getLevelForXp(data.totalXp);

  if (newLevel > oldLevel) {
    data.level = newLevel;
    const member = message.member || await guild.members.fetch(author.id).catch(() => null);
    await checkRoleRewards(guild, member, newLevel);

    // Send level up celebration if high tier (25, 50, 80)
    if ([25, 50, 80].includes(newLevel)) {
      const celebrateEmbed = new EmbedBuilder()
        .setColor('#5EA454')
        .setTitle('🎉 SEVİYE ATLADIN!')
        .setDescription(`Tebrikler <@${author.id}>! **Seviye ${newLevel}** seviyesine ulaştın ve yeni kurbağa rolünü kazandın! 🐸✨`)
        .setFooter({ text: 'Yeşil Gölet Seviye Sistemi', iconURL: guild.iconURL() });
      channel.send({ embeds: [celebrateEmbed] }).catch(() => {});
    }
  }
}

// --- VOICE XP TICKER (EVERY 60 SECONDS) ---
export function startVoiceXpTicker(client) {
  setInterval(async () => {
    try {
      for (const [guildId, guild] of client.guilds.cache) {
        const afkChannelId = guild.afkChannelId;

        // Iterate over all voice channels
        for (const [channelId, channel] of guild.channels.cache) {
          if (!channel.isVoiceBased() || channel.id === afkChannelId) continue;

          // Get human members
          const members = Array.from(channel.members.values()).filter(m => !m.user.bot);
          // Require at least 2 people in the room to prevent solo AFK farming
          if (members.length < 2) continue;

          for (const member of members) {
            // If deafened, don't award voice XP
            if (member.voice.deaf || member.voice.serverDeaf) continue;

            const data = getUserData(guildId, member.id);
            // Award 25 XP per minute of voice chat (1500 XP/hour)
            const earnedXp = 25;
            data.voiceXp = (data.voiceXp || 0) + earnedXp;
            data.totalXp = (data.totalXp || 0) + earnedXp;
            data.dailyXp = (data.dailyXp || 0) + earnedXp;
            data.weeklyXp = (data.weeklyXp || 0) + earnedXp;
            data.monthlyXp = (data.monthlyXp || 0) + earnedXp;

            const oldLevel = data.level;
            const newLevel = getLevelForXp(data.totalXp);

            if (newLevel > oldLevel) {
              data.level = newLevel;
              await checkRoleRewards(guild, member, newLevel);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Voice XP ticker error:', err.message);
    }
  }, 60000);
}

// --- PROGRESS BAR HELPER ---
function makeProgressBar(current, target, size = 10) {
  const percent = Math.max(0, Math.min(1, current / Math.max(1, target)));
  const filled = Math.round(size * percent);
  const empty = size - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` **${Math.floor(percent * 100)}%**`;
}

// --- SLASH COMMAND BUILDERS ---
export const rankCommand = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Seviye, XP ve sunucu istatistik kartınızı görüntüler.')
  .addUserOption(opt => opt.setName('kullanici').setDescription('İstatistiğine bakılacak üye').setRequired(false));

export const topCommand = new SlashCommandBuilder()
  .setName('top')
  .setDescription('Sunucunun liderlik tablosunu açar.')
  .addStringOption(opt =>
    opt.setName('kategori')
      .setDescription('Liderlik tablosu kategorisi')
      .setRequired(false)
      .addChoices(
        { name: '🏆 Genel Sıralama (Toplam XP)', value: 'totalXp' },
        { name: '🎙️ Sesli Sohbet Sıralaması', value: 'voiceXp' },
        { name: '💬 Yazılı Sohbet Sıralaması', value: 'textXp' },
        { name: '📅 Günlük Aktiflik', value: 'dailyXp' },
        { name: '🗓️ Haftalık Aktiflik', value: 'weeklyXp' },
        { name: '📆 Aylık Aktiflik', value: 'monthlyXp' }
      )
  );

// Helper to build leaderboard embed and buttons
export function buildTopEmbedAndButtons(guild, category = 'totalXp') {
  const titles = {
    totalXp: '🌿 Yeşil Gölet • Genel Liderlik Tablosu (Top 10)',
    voiceXp: '🎙️ Yeşil Gölet • En Çok Sesli Konuşanlar (Top 10)',
    textXp: '💬 Yeşil Gölet • En Çok Mesaj Yazanlar (Top 10)',
    dailyXp: '📅 Yeşil Gölet • Günlük Aktiflik Sıralaması (Top 10)',
    weeklyXp: '🗓️ Yeşil Gölet • Haftalık Aktiflik Sıralaması (Top 10)',
    monthlyXp: '📆 Yeşil Gölet • Aylık Aktiflik Sıralaması (Top 10)'
  };

  const allGuildUsers = Array.from(levelCache.values())
    .filter(d => d.guildId === guild.id)
    .map(u => {
      checkAndResetTimeBuckets(u);
      return u;
    })
    .sort((a, b) => (b[category] || 0) - (a[category] || 0))
    .slice(0, 10);

  const title = titles[category] || titles.totalXp;

  let desc = 'Henüz bu kategoride kaydedilmiş aktiflik verisi bulunmuyor 🌱';
  if (allGuildUsers.length > 0 && (allGuildUsers[0][category] || 0) > 0) {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    desc = allGuildUsers
      .filter(u => (u[category] || 0) > 0)
      .map((u, i) => {
        let valueStr = `${(u[category] || 0).toLocaleString()} XP`;
        if (category === 'voiceXp') {
          const hours = (((u.voiceXp || 0) / 25) / 60).toFixed(1);
          valueStr = `\`${(u.voiceXp || 0).toLocaleString()} XP\` (${hours} Saat)`;
        } else if (category === 'textXp') {
          valueStr = `\`${(u.textXp || 0).toLocaleString()} XP\``;
        } else {
          valueStr = `**Lvl ${u.level}** (\`${(u[category] || 0).toLocaleString()} XP\`)`;
        }
        return `${medals[i]} <@${u.userId}> — ${valueStr}`;
      }).join('\n\n');
  }

  const embed = new EmbedBuilder()
    .setColor('#5EA454')
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: 'Kiri Bot • Butonlara basarak kategoriyi değiştirebilirsin', iconURL: guild.iconURL() })
    .setTimestamp();

  const dashboardUrl = process.env.DASHBOARD_URL || 'http://3.75.174.25:3000';

  // Category switch buttons
  const rowCategory = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('top_totalXp').setLabel('🏆 Genel').setStyle(category === 'totalXp' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('top_voiceXp').setLabel('🎙️ Sesli').setStyle(category === 'voiceXp' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('top_textXp').setLabel('💬 Yazılı').setStyle(category === 'textXp' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('top_dailyXp').setLabel('📅 Günlük').setStyle(category === 'dailyXp' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('top_weeklyXp').setLabel('🗓️ Haftalık').setStyle(category === 'weeklyXp' ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const rowLink = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('top_monthlyXp').setLabel('📆 Aylık').setStyle(category === 'monthlyXp' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🌐 Web Dashboard').setStyle(ButtonStyle.Link).setURL(dashboardUrl)
  );

  return { embeds: [embed], components: [rowCategory, rowLink] };
}

// --- COMMAND HANDLERS ---
export async function handleRankCommand(interaction) {
  const { guild, user } = interaction;
  const targetUser = interaction.options.getUser('kullanici') || user;
  const member = await guild.members.fetch(targetUser.id).catch(() => null);

  const data = getUserData(guild.id, targetUser.id);
  const currentLevel = data.level;
  const currentXp = data.totalXp;

  const currentLevelBaseXp = getXpForLevel(currentLevel);
  const nextLevelXp = getXpForLevel(currentLevel + 1);
  const progressInLevel = currentXp - currentLevelBaseXp;
  const neededInLevel = nextLevelXp - currentLevelBaseXp;

  // Calculate Rank position in guild
  const allGuildUsers = Array.from(levelCache.values())
    .filter(d => d.guildId === guild.id)
    .sort((a, b) => b.totalXp - a.totalXp);
  const rankIndex = allGuildUsers.findIndex(d => d.userId === targetUser.id);
  const rankPos = rankIndex !== -1 ? `#${rankIndex + 1}` : '#-';

  const voiceHours = (((data.voiceXp || 0) / 25) / 60).toFixed(1);

  const embed = new EmbedBuilder()
    .setColor('#5EA454')
    .setAuthor({ name: `${targetUser.username} • Seviye Kartı`, iconURL: targetUser.displayAvatarURL() })
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '🏆 Sıralama', value: `\`${rankPos}\` / ${allGuildUsers.length} Üye`, inline: true },
      { name: '⚡ Seviye', value: `**Level ${currentLevel}**`, inline: true },
      { name: '💎 Toplam XP', value: `\`${currentXp.toLocaleString()} XP\``, inline: true },
      { 
        name: '📊 Sonraki Seviyeye İlerleme', 
        value: `${makeProgressBar(progressInLevel, neededInLevel, 8)}\n\`${progressInLevel.toLocaleString()} / ${neededInLevel.toLocaleString()} XP\``, 
        inline: false 
      },
      { name: '💬 Yazılı Sohbet XP', value: `\`${data.textXp.toLocaleString()} XP\``, inline: true },
      { name: '🎙️ Sesli Sohbet XP', value: `\`${data.voiceXp.toLocaleString()} XP\` (${voiceHours} Sa)`, inline: true }
    )
    .setFooter({ text: 'Kiri Bot • Yeşil Gölet', iconURL: guild.iconURL() })
    .setTimestamp();

  const dashboardUrl = process.env.DASHBOARD_URL || 'http://3.75.174.25:3000';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🌐 Canlı Liderlik Tablosu')
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardUrl)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

export async function handleTopCommand(interaction) {
  const { guild } = interaction;
  const category = interaction.options?.getString('kategori') || 'totalXp';
  const payload = buildTopEmbedAndButtons(guild, category);
  await interaction.reply(payload);
}
