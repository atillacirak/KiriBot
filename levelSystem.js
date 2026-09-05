import { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Local backup files
const LEVELS_DB_FILE = path.join(process.cwd(), 'database_levels.json');
const SETTINGS_DB_FILE = path.join(process.cwd(), 'database_settings.json');

// In-memory cache for ultra-fast zero-latency operations
const levelCache = new Map();
const guildSettingsCache = new Map();

let mongoLevelsCollection = null;
let mongoSettingsCollection = null;

// Default server settings
export const DEFAULT_SETTINGS = {
  voiceXpPerMin: 25,
  textXpMin: 10,
  textXpMax: 15,
  textCooldownSeconds: 20,
  minVoiceMembers: 2,
  ignoredChannels: ['1439038727644250346', '1315051073781895168', '1439016893322100746'],
  roleRewards: {
    25: '1439006338402484305', // kurbağa
    50: '1439006370769666140', // göl müdavimi kurbağa
    80: '1439006516282785964'  // bu direkt göl olmuş
  }
};

const ADMIN_ROLE_ID = '1315029510672089129';

export function getGuildSettings(guildId) {
  if (!guildSettingsCache.has(guildId)) {
    guildSettingsCache.set(guildId, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  }
  return guildSettingsCache.get(guildId);
}

export async function updateGuildSettings(guildId, newSettings) {
  const current = getGuildSettings(guildId);
  const merged = { ...current, ...newSettings };
  guildSettingsCache.set(guildId, merged);

  try {
    fs.writeFileSync(SETTINGS_DB_FILE, JSON.stringify(Object.fromEntries(guildSettingsCache.entries()), null, 2), 'utf8');
  } catch (e) {}

  if (mongoSettingsCollection) {
    try {
      await mongoSettingsCollection.updateOne(
        { _id: guildId },
        { $set: { settings: merged, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error('Mongo settings update error:', e.message);
    }
  }
  return merged;
}

function loadLocalLevels() {
  try {
    if (fs.existsSync(LEVELS_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEVELS_DB_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        levelCache.set(k, v);
      }
    }
    if (fs.existsSync(SETTINGS_DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_DB_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        guildSettingsCache.set(k, v);
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
    mongoSettingsCollection = db.collection('guild_settings');

    // Load levels
    const allDocs = await mongoLevelsCollection.find({}).toArray();
    for (const doc of allDocs) {
      const key = `${doc.guildId}_${doc.userId}`;
      levelCache.set(key, {
        userId: doc.userId,
        guildId: doc.guildId,
        textXp: doc.textXp || 0,
        voiceXp: doc.voiceXp || 0,
        totalXp: doc.totalXp || 0,
        dailyXp: doc.dailyXp || 0,
        dailyVoiceXp: doc.dailyVoiceXp || 0,
        dailyTextXp: doc.dailyTextXp || 0,
        weeklyXp: doc.weeklyXp || 0,
        weeklyVoiceXp: doc.weeklyVoiceXp || 0,
        weeklyTextXp: doc.weeklyTextXp || 0,
        monthlyXp: doc.monthlyXp || 0,
        monthlyVoiceXp: doc.monthlyVoiceXp || 0,
        monthlyTextXp: doc.monthlyTextXp || 0,
        level: doc.level || 0,
        lastMessageAt: doc.lastMessageAt || 0,
        lastDay: doc.lastDay || '',
        lastWeek: doc.lastWeek || '',
        lastMonth: doc.lastMonth || ''
      });
    }

    // Load settings
    const settingDocs = await mongoSettingsCollection.find({}).toArray();
    for (const doc of settingDocs) {
      guildSettingsCache.set(doc._id, doc.settings || DEFAULT_SETTINGS);
    }

    console.log(`✅ MongoDB Seviye Sistemi & Ayar Koleksiyonu aktif! (${allDocs.length} üye verisi yüklendi)`);
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

// Time Bucket Helper (Daily, Weekly, Monthly Resets)
export function checkAndResetTimeBuckets(data) {
  const now = new Date();
  
  // Daily Reset (UTC midnight)
  const currentDay = now.toISOString().slice(0, 10);
  if (data.lastDay !== currentDay) {
    data.dailyXp = 0;
    data.dailyVoiceXp = 0;
    data.dailyTextXp = 0;
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
    data.weeklyVoiceXp = 0;
    data.weeklyTextXp = 0;
    data.lastWeek = currentWeek;
  }

  // Monthly Reset (YYYY-MM)
  const currentMonth = now.toISOString().slice(0, 7);
  if (data.lastMonth !== currentMonth) {
    data.monthlyXp = 0;
    data.monthlyVoiceXp = 0;
    data.monthlyTextXp = 0;
    data.lastMonth = currentMonth;
  }
}

export { levelCache };
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
      dailyVoiceXp: 0,
      dailyTextXp: 0,
      weeklyXp: 0,
      weeklyVoiceXp: 0,
      weeklyTextXp: 0,
      monthlyXp: 0,
      monthlyVoiceXp: 0,
      monthlyTextXp: 0,
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

// Special level messages
const ROLE_CUSTOM_MESSAGES = {
  25: 'Tebrikler, büyüyüp kurbağa oldun! 🐸',
  50: 'Tebrikler, artık müdavim bir kurbağasın!! 🌿',
  80: 'Sen kurbağa değil direkt göl olmuşsun, biraz çimene dokunmak iyi gelebilir!!! 👑🏞️'
};

// Send DM Congratulation Notification (DISABLED)
export async function sendLevelUpDm(guild, member, newLevel, roleRewardRole = null) {
  // Automatic level up DMs temporarily disabled per user request
  return;
}

// Check & Award Role Rewards
export async function checkRoleRewards(guild, member, newLevel) {
  if (!guild || !member) return null;
  const settings = getGuildSettings(guild.id);
  const roleRewards = settings.roleRewards || DEFAULT_SETTINGS.roleRewards;
  let newlyAwardedRole = null;

  for (const [lvlReqStr, roleId] of Object.entries(roleRewards)) {
    const lvlReq = parseInt(lvlReqStr, 10);
    if (newLevel >= lvlReq) {
      if (!member.roles.cache.has(roleId)) {
        try {
          await member.roles.add(roleId);
          newlyAwardedRole = guild.roles.cache.get(roleId);
          console.log(`🎉 [Seviye Ödülü] ${member.user.tag} Seviye ${newLevel}'e ulaştı ve rolü aldı: ${roleId}`);
        } catch (err) {
          console.warn(`Rol verme hatası (${roleId}):`, err.message);
        }
      }
    }
  }
  return newlyAwardedRole;
}

// --- TEXT XP HANDLER ---
export async function handleTextMessage(message) {
  if (!message.guild || message.author.bot) return;

  const { guild, author, channel } = message;
  const settings = getGuildSettings(guild.id);

  // Check Ignored channels
  const ignoredChannels = settings.ignoredChannels || DEFAULT_SETTINGS.ignoredChannels;
  if (ignoredChannels.includes(channel.id)) return;

  const data = getUserData(guild.id, author.id);
  const now = Date.now();

  const cooldownMs = (settings.textCooldownSeconds || 20) * 1000;
  if (now - data.lastMessageAt < cooldownMs) return;

  data.lastMessageAt = now;

  const minXp = settings.textXpMin || 10;
  const maxXp = settings.textXpMax || 15;
  const earnedXp = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;

  data.textXp = (data.textXp || 0) + earnedXp;
  data.totalXp = (data.totalXp || 0) + earnedXp;
  data.dailyXp = (data.dailyXp || 0) + earnedXp;
  data.dailyTextXp = (data.dailyTextXp || 0) + earnedXp;
  data.weeklyXp = (data.weeklyXp || 0) + earnedXp;
  data.weeklyTextXp = (data.weeklyTextXp || 0) + earnedXp;
  data.monthlyXp = (data.monthlyXp || 0) + earnedXp;
  data.monthlyTextXp = (data.monthlyTextXp || 0) + earnedXp;

  const oldLevel = data.level;
  const newLevel = getLevelForXp(data.totalXp);

  if (newLevel > oldLevel) {
    data.level = newLevel;
    const member = message.member || await guild.members.fetch(author.id).catch(() => null);
    const awardedRole = await checkRoleRewards(guild, member, newLevel);

    // Send DM notification
    if (member) {
      await sendLevelUpDm(guild, member, newLevel, awardedRole);
    }

    const roleRewards = settings.roleRewards || DEFAULT_SETTINGS.roleRewards;
    if (Object.keys(roleRewards).map(Number).includes(newLevel)) {
      const customMsg = ROLE_CUSTOM_MESSAGES[newLevel] || `Tebrikler <@${author.id}>! **Seviye ${newLevel}** seviyesine ulaştın ve yeni kurbağa rolünü kazandın! 🐸✨`;
      const celebrateEmbed = new EmbedBuilder()
        .setColor('#5EA454')
        .setTitle('🎉 YENİ KURBAĞA ROLÜ KAZANILDI!')
        .setDescription(`<@${author.id}>\n\n> **${customMsg}**`)
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
        const settings = getGuildSettings(guildId);
        const minMembers = settings.minVoiceMembers || 2;
        const voiceXpAmount = settings.voiceXpPerMin || 25;

        // Role ID for bot / roBOT accounts
        const ROBOT_ROLE_ID = '1439012819977633843';

        // Iterate over all voice channels
        for (const [channelId, channel] of guild.channels.cache) {
          if (!channel.isVoiceBased() || channel.id === afkChannelId) continue;
          if (settings.disabledChannels && settings.disabledChannels.includes(channel.id)) continue;

          // Exclude bot accounts and members holding the roBOT role
          const validMembers = Array.from(channel.members.values()).filter(m => 
            !m.user.bot && !m.roles.cache.has(ROBOT_ROLE_ID)
          );
          if (validMembers.length < minMembers) continue;

          for (const member of validMembers) {
            if (member.voice.deaf || member.voice.serverDeaf) continue;

            const data = getUserData(guildId, member.id);
            data.voiceXp = (data.voiceXp || 0) + voiceXpAmount;
            data.totalXp = (data.totalXp || 0) + voiceXpAmount;
            data.dailyXp = (data.dailyXp || 0) + voiceXpAmount;
            data.dailyVoiceXp = (data.dailyVoiceXp || 0) + voiceXpAmount;
            data.weeklyXp = (data.weeklyXp || 0) + voiceXpAmount;
            data.weeklyVoiceXp = (data.weeklyVoiceXp || 0) + voiceXpAmount;
            data.monthlyXp = (data.monthlyXp || 0) + voiceXpAmount;
            data.monthlyVoiceXp = (data.monthlyVoiceXp || 0) + voiceXpAmount;

            const oldLevel = data.level;
            const newLevel = getLevelForXp(data.totalXp);

            if (newLevel > oldLevel) {
              data.level = newLevel;
              const awardedRole = await checkRoleRewards(guild, member, newLevel);
              await sendLevelUpDm(guild, member, newLevel, awardedRole);
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

// Check if a member has Admin permissions
export function isMemberAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
  return false;
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

// Admin Slash Commands
export const setLevelCommand = new SlashCommandBuilder()
  .setName('seviye-ayarla')
  .setDescription('[YETKİLİ] Bir üyenin seviyesini doğrudan belirler.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('kullanici').setDescription('Seviyesi ayarlanacak üye').setRequired(true))
  .addIntegerOption(opt => opt.setName('seviye').setDescription('Yeni seviye (0-100)').setMinValue(0).setMaxValue(100).setRequired(true));

export const addXpCommand = new SlashCommandBuilder()
  .setName('xp-ekle')
  .setDescription('[YETKİLİ] Bir üyeye özel XP ekler.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('kullanici').setDescription('XP eklenecek üye').setRequired(true))
  .addIntegerOption(opt => opt.setName('miktar').setDescription('Eklenecek XP miktarı').setMinValue(1).setRequired(true));

export const removeXpCommand = new SlashCommandBuilder()
  .setName('xp-sil')
  .setDescription('[YETKİLİ] Bir üyeden XP düşer.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('kullanici').setDescription('XP silinecek üye').setRequired(true))
  .addIntegerOption(opt => opt.setName('miktar').setDescription('Silinecek XP miktarı').setMinValue(1).setRequired(true));

export const resetLevelCommand = new SlashCommandBuilder()
  .setName('seviye-sifirla')
  .setDescription('[YETKİLİ] Bir üyenin tüm XP ve seviye verisini sıfırlar.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('kullanici').setDescription('Sıfırlanacak üye').setRequired(true));

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

// --- ADMIN COMMAND HANDLERS ---
export async function handleSetLevelCommand(interaction) {
  const { guild, member } = interaction;
  if (!isMemberAdmin(member)) {
    return interaction.reply({ content: '⛔ Bu komutu kullanmak için `ADMIN` yetkisine sahip olmalısınız.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('kullanici');
  const targetLevel = interaction.options.getInteger('seviye');

  const data = getUserData(guild.id, targetUser.id);
  const targetBaseXp = getXpForLevel(targetLevel);
  data.level = targetLevel;
  data.totalXp = targetBaseXp;

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember) {
    await checkRoleRewards(guild, targetMember, targetLevel);
  }

  const embed = new EmbedBuilder()
    .setColor('#5EA454')
    .setTitle('✅ Seviye Başarıyla Ayarlandı!')
    .setDescription(`<@${targetUser.id}> adlı üyenin seviyesi **Level ${targetLevel}** (\`${targetBaseXp.toLocaleString()} XP\`) olarak güncellendi ve rolleri senkronize edildi.`)
    .setFooter({ text: `Yetkili: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.reply({ embeds: [embed] });
}

export async function handleAddXpCommand(interaction) {
  const { guild, member } = interaction;
  if (!isMemberAdmin(member)) {
    return interaction.reply({ content: '⛔ Bu komutu kullanmak için `ADMIN` yetkisine sahip olmalısınız.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('kullanici');
  const amount = interaction.options.getInteger('miktar');

  const data = getUserData(guild.id, targetUser.id);
  data.totalXp += amount;
  data.textXp += amount;
  data.dailyXp += amount;
  data.weeklyXp += amount;
  data.monthlyXp += amount;

  const oldLevel = data.level;
  const newLevel = getLevelForXp(data.totalXp);
  data.level = newLevel;

  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
  if (targetMember && newLevel > oldLevel) {
    await checkRoleRewards(guild, targetMember, newLevel);
  }

  const embed = new EmbedBuilder()
    .setColor('#5EA454')
    .setTitle('✨ XP Başarıyla Eklendi!')
    .setDescription(`<@${targetUser.id}> adlı üyeye **+${amount.toLocaleString()} XP** eklendi!\n💎 Yeni Toplam: \`${data.totalXp.toLocaleString()} XP\` (Level ${newLevel})`)
    .setFooter({ text: `Yetkili: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.reply({ embeds: [embed] });
}

export async function handleRemoveXpCommand(interaction) {
  const { guild, member } = interaction;
  if (!isMemberAdmin(member)) {
    return interaction.reply({ content: '⛔ Bu komutu kullanmak için `ADMIN` yetkisine sahip olmalısınız.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('kullanici');
  const amount = interaction.options.getInteger('miktar');

  const data = getUserData(guild.id, targetUser.id);
  data.totalXp = Math.max(0, data.totalXp - amount);
  data.level = getLevelForXp(data.totalXp);

  const embed = new EmbedBuilder()
    .setColor('#F79F36')
    .setTitle('🔻 XP Silindi!')
    .setDescription(`<@${targetUser.id}> adlı üyeden **-${amount.toLocaleString()} XP** düşüldü.\n💎 Yeni Toplam: \`${data.totalXp.toLocaleString()} XP\` (Level ${data.level})`)
    .setFooter({ text: `Yetkili: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.reply({ embeds: [embed] });
}

export async function handleResetLevelCommand(interaction) {
  const { guild, member } = interaction;
  if (!isMemberAdmin(member)) {
    return interaction.reply({ content: '⛔ Bu komutu kullanmak için `ADMIN` yetkisine sahip olmalısınız.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('kullanici');
  const data = getUserData(guild.id, targetUser.id);
  data.totalXp = 0;
  data.textXp = 0;
  data.voiceXp = 0;
  data.dailyXp = 0;
  data.weeklyXp = 0;
  data.monthlyXp = 0;
  data.level = 0;

  const embed = new EmbedBuilder()
    .setColor('#E53E3E')
    .setTitle('🔄 Seviye ve XP Sıfırlandı!')
    .setDescription(`<@${targetUser.id}> adlı üyenin tüm XP ve seviye verileri sıfırlandı.`)
    .setFooter({ text: `Yetkili: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

  await interaction.reply({ embeds: [embed] });
}