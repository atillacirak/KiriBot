import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  SlashCommandBuilder, 
  REST, 
  Routes, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { 
  initLevelSystemMongo, 
  handleTextMessage, 
  startVoiceXpTicker, 
  rankCommand, 
  topCommand, 
  handleRankCommand, 
  handleTopCommand,
  buildTopEmbedAndButtons,
  setLevelCommand,
  addXpCommand,
  removeXpCommand,
  resetLevelCommand,
  handleSetLevelCommand,
  handleAddXpCommand,
  handleRemoveXpCommand,
  handleResetLevelCommand
} from './levelSystem.js';
import { 
  initAnalyticsMongo, 
  recordMemberJoin, 
  recordMemberLeave, 
  recordChannelMessage 
} from './analyticsManager.js';
import { startDashboard } from './dashboard.js';

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL || '';

if (!TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN bulunamadı. Lütfen .env dosyasını kontrol edin.');
  process.exit(1);
}

// Memory Profile Cache (MongoDB Atlas Sync)
let mongoDb = null;
let profilesCollection = null;
const PROFILE_CACHE = new Map();

async function initMongo() {
  if (!MONGODB_URI) {
    console.log('ℹ️ MONGODB_URI tanımlı değil. Bellek ve yerel dosya modu aktif.');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000
    });
    await client.connect();
    mongoDb = client.db('project_x');
    profilesCollection = mongoDb.collection('profiles');
    console.log('✅ MongoDB Atlas bulut veritabanına başarıyla bağlanıldı!');

    // Initialize level collection
    await initLevelSystemMongo(mongoDb);

    // Initialize analytics collection
    await initAnalyticsMongo(mongoDb);

    // Hydrate profile cache
    const docs = await profilesCollection.find({}).toArray();
    docs.forEach(doc => {
      const key = doc._id || doc.key;
      if (key) PROFILE_CACHE.set(key, doc.data || doc);
    });
    console.log(`📦 MongoDB'den ${docs.length} profil kaydı hafızaya yüklendi.`);
  } catch (err) {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
  }
}

async function persistProfile(key, data) {
  PROFILE_CACHE.set(key, data);
  if (profilesCollection) {
    try {
      await profilesCollection.updateOne(
        { _id: key },
        { $set: { key, data, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error('MongoDB persist error:', e.message);
    }
  }
}

// Clean text for privacy
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[GİZLİ E-POSTA]')
    .replace(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}/g, '[GİZLİ TELEFON]')
    .replace(/(?:password|şifre|pass|token|secret)[\s:=]+([^\s]+)/gi, '$1: [GİZLİ BİLGİ]')
    .replace(/https?:\/\/\S+/gi, '')
    .slice(0, 300);
}

// Gemini AI Call Helper
const WORKING_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash'
];

async function callAi(prompt) {
  if (!GEMINI_API_KEY) {
    console.error('❌ callAi: GEMINI_API_KEY ortam değişkeni bulunamadı!');
    return null;
  }

  for (const model of WORKING_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            responseMimeType: 'application/json',
            temperature: 0.85,
            maxOutputTokens: 2500
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (err) {
      console.warn(`Gemini AI (${model}) error:`, err.message);
    }
  }
  return null;
}

// Fetch user messages from channel
async function fetchUserMessages(guild, userId, limit = 500, onProgress = null) {
  const userMessages = [];
  try {
    const allChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
    const textChannels = Array.from(allChannels.values()).filter(c => 
      c && c.isTextBased() && c.viewable &&
      !c.name?.toLowerCase().includes('komut') &&
      !c.name?.toLowerCase().includes('bot') &&
      !c.name?.toLowerCase().includes('spam')
    );

    for (const channel of textChannels) {
      if (userMessages.length >= limit) break;
      let lastId = null;
      for (let i = 0; i < 5; i++) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const messages = await channel.messages.fetch(options).catch(() => null);
        if (!messages || messages.size === 0) break;

        for (const msg of messages.values()) {
          lastId = msg.id;
          if (msg.author.id === userId && msg.content && msg.content.trim().length > 3) {
            const clean = sanitizeText(msg.content);
            if (clean) userMessages.push(clean);
            if (userMessages.length >= limit) break;
          }
        }
        if (messages.size < 100) break;
      }
    }
  } catch (e) {
    console.warn('Fetch messages error:', e.message);
  }
  return userMessages;
}

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('xray')
    .setDescription('Bir sunucu üyesinin mesajlarını analiz eder (MBTI, Toksisite, Aura, Guilty Pleasure).')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Analiz edilecek sunucu üyesi (Boş bırakırsan seni analiz eder).')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('ship')
    .setDescription('İki sunucu üyesinin sohbet dinamiklerine göre uyumunu analiz eder.')
    .addUserOption(opt => opt.setName('kisi1').setDescription('Birinci kişi').setRequired(true))
    .addUserOption(opt => opt.setName('kisi2').setDescription('İkinci kişi').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ruh-ikizi')
    .setDescription('Sunucudaki mesaj tarzına göre senin gizli kozmik ruh ikizini bulur!'),
  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Yeşil Gölet canlı web sitesi ve liderlik tablosu linkini görüntüler.'),
  rankCommand,
  topCommand,
  setLevelCommand,
  addXpCommand,
  removeXpCommand,
  resetLevelCommand
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Kiri Bot Aktif: ${client.user.tag}`);
  
  // Start Voice XP Tracker
  startVoiceXpTicker(client);

  // Start Web Dashboard
  const DASHBOARD_PORT = process.env.PORT || 3000;
  startDashboard(client, DASHBOARD_PORT);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    console.log('⚡ Discord Slash komutları kaydediliyor...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Discord Slash komutları tüm sunucularda aktif edildi!');
  } catch (err) {
    console.error('Slash commands registration error:', err);
  }
});

// Track text messages for XP and channel analytics
client.on('messageCreate', (message) => {
  if (message.guild && message.channel && !message.author?.bot) {
    recordChannelMessage(message.channel.id, message.channel.name);
  }
  handleTextMessage(message).catch(err => console.warn('Text XP error:', err.message));
});

// Member Join & Leave Tracking
client.on('guildMemberAdd', (member) => {
  recordMemberJoin(member).catch(err => console.warn('Record join error:', err.message));
});

client.on('guildMemberRemove', (member) => {
  recordMemberLeave(member).catch(err => console.warn('Record leave error:', err.message));
});

client.on('error', (err) => {
  console.warn('⚠️ Discord Client Hatası:', err.message);
});

// Handle Interactions (Slash Commands & Buttons)
client.on('interactionCreate', async (interaction) => {
  // Handle Interactive Category Buttons for /top
  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('top_')) {
      const category = customId.replace('top_', '');
      const payload = buildTopEmbedAndButtons(interaction.guild, category);
      await interaction.update(payload).catch(() => {});
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, user } = interaction;
  if (!guild) {
    return interaction.reply({ content: '❌ Bu komutlar sadece sunucularda kullanılabilir.', ephemeral: true }).catch(() => {});
  }

  try {
    // 1. /rank
    if (commandName === 'rank') {
      await handleRankCommand(interaction).catch(err => {
        console.error('Rank command error:', err);
        interaction.reply({ content: '❌ Seviye kartı yüklenirken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

    // 2. /top
    else if (commandName === 'top') {
      await handleTopCommand(interaction).catch(err => {
        console.error('Top command error:', err);
        interaction.reply({ content: '❌ Liderlik tablosu yüklenirken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

    // 3. /xray
    else if (commandName === 'xray') {
      await interaction.deferReply().catch(() => {});
      const targetUser = interaction.options.getUser('kullanici') || user;
      const member = await guild.members.fetch(targetUser.id).catch(() => null);

      const cacheKey = `discord_profile_${guild.id}_${targetUser.id}`;
      let messages = PROFILE_CACHE.get(cacheKey)?.rawMessages;

      if (!messages || messages.length < 5) {
        messages = await fetchUserMessages(guild, targetUser.id, 500);
      }

      if (!messages || messages.length < 3) {
        return interaction.editReply({
          content: `⚠️ **${targetUser.username}** adlı üyenin bu sunucuda yeterli mesajı bulunamadı (En az 3-5 sohbet mesajı gereklidir).`
        }).catch(() => {});
      }

      const prompt = `Analiz et ve sadece geçerli JSON döndür:
Kullanıcı mesajları: ${JSON.stringify(messages.slice(0, 50))}
İstenen JSON formatı:
{
  "summary": "2 cümlelik samimi, esprili ve çarpıcı kişilik özeti",
  "mbti": "4 harfli MBTI tipi (örn: ENFP)",
  "toxicScore": 0-100 arası sayı,
  "aura": "Aura rengi ve hissi (örn: Mor Mistik, Zümrüt Dinginlik)",
  "guiltyPleasure": "Mesajlarından anlaşılan gizli zevk veya takıntı",
  "mostUsedWords": ["kelime1", "kelime2", "kelime3"]
}`;

      const aiRes = await callAi(prompt);
      let data = null;
      try {
        data = JSON.parse(aiRes?.replace(/```json|```/gi, '').trim() || '{}');
      } catch (e) {
        data = { summary: 'Analiz tamamlandı.', mbti: 'INFP', toxicScore: 15, aura: 'Zümrüt Yeşil', guiltyPleasure: 'Gece sohbeti' };
      }

      // Save to memory and MongoDB
      persistProfile(cacheKey, { rawMessages: messages, aiAnalysis: data, memberName: member?.displayName || targetUser.username });

      const embed = new EmbedBuilder()
        .setColor('#5EA454')
        .setTitle(`🔍 ${member?.displayName || targetUser.username} • X-Ray Analizi`)
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setDescription(data.summary || 'Kişilik profili başarıyla oluşturuldu.')
        .addFields(
          { name: '🧠 MBTI', value: `\`${data.mbti || 'Bilinmiyor'}\``, inline: true },
          { name: '☣️ Toksisite', value: `\`%${data.toxicScore ?? 10}\``, inline: true },
          { name: '✨ Aura', value: `\`${data.aura || 'Zümrüt Yeşil'}\``, inline: true },
          { name: '🤫 Gizli Zevk (Guilty Pleasure)', value: data.guiltyPleasure || 'Gece sohbetinde sabahlamak', inline: false }
        )
        .setFooter({ text: 'Kiri Bot • Yeşil Gölet AI X-Ray', iconURL: guild.iconURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    // 4. /ship
    else if (commandName === 'ship') {
      await interaction.deferReply().catch(() => {});
      const u1 = interaction.options.getUser('kisi1');
      const u2 = interaction.options.getUser('kisi2');

      const score = Math.floor(Math.random() * 41) + 60; // %60 - %100
      const embed = new EmbedBuilder()
        .setColor(score > 75 ? '#FF69B4' : '#5EA454')
        .setTitle(`💘 ${u1.username} & ${u2.username} • Uyum Analizi`)
        .setDescription(`**Aşk & Uyum Oranı: %${score}**\n\n> Bu ikili aynı frekansta takıldığında sunucunun en ikonik ikilisi olabilir! ✨`)
        .setFooter({ text: 'Kiri Bot Ship Metresi', iconURL: guild.iconURL() });

      await interaction.editReply({ embeds: [embed] });
    }

    // 5. /ruh-ikizi
    else if (commandName === 'ruh-ikizi') {
      await interaction.deferReply().catch(() => {});
      const embed = new EmbedBuilder()
        .setColor('#5EA454')
        .setTitle(`✨ ${user.username} • Ruh İkizi Kehaneti`)
        .setDescription('Sunucudaki mesaj dalga boyun incelendi: Gece seslilerinde aynı odada bulunduğun kişilerle kozmik bir bağın var!')
        .setFooter({ text: 'Kiri Bot • Ruh İkizi Kehaneti', iconURL: guild.iconURL() });

      await interaction.editReply({ embeds: [embed] });
    }

    // 6. /dashboard
    else if (commandName === 'dashboard') {
      const dashboardUrl = process.env.DASHBOARD_URL || 'https://yesilgolet.duckdns.org';
      const embed = new EmbedBuilder()
        .setColor('#5EA454')
        .setTitle('🌐 Yeşil Gölet • Canlı Web Dashboard & Liderlik Tablosu')
        .setDescription(`Sunucudaki tüm üyelerin canlı XP sıralamasını, kurbağa unvanlarını ve sunucu istatistiklerini web sitemizden anlık olarak takip edebilirsin!\n\n🔗 **Web Sitesi:** [${dashboardUrl}](${dashboardUrl})`)
        .setFooter({ text: 'Kiri Bot Canlı Dashboard', iconURL: guild.iconURL() });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🌐 Web Sitesini Aç')
          .setStyle(ButtonStyle.Link)
          .setURL(dashboardUrl)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // 7. /seviye-ayarla
    else if (commandName === 'seviye-ayarla') {
      await handleSetLevelCommand(interaction).catch(err => {
        console.error('Set level error:', err);
        interaction.reply({ content: '❌ Seviye ayarlanırken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

    // 8. /xp-ekle
    else if (commandName === 'xp-ekle') {
      await handleAddXpCommand(interaction).catch(err => {
        console.error('Add XP error:', err);
        interaction.reply({ content: '❌ XP eklenirken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

    // 9. /xp-sil
    else if (commandName === 'xp-sil') {
      await handleRemoveXpCommand(interaction).catch(err => {
        console.error('Remove XP error:', err);
        interaction.reply({ content: '❌ XP silinirken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

    // 10. /seviye-sifirla
    else if (commandName === 'seviye-sifirla') {
      await handleResetLevelCommand(interaction).catch(err => {
        console.error('Reset level error:', err);
        interaction.reply({ content: '❌ Seviye sıfırlanırken bir hata oluştu.', ephemeral: true }).catch(() => {});
      });
    }

  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// Boot Database & Login Bot
initMongo().then(() => {
  client.login(TOKEN).catch(err => {
    console.error('❌ Discord bot login error:', err.message);
  });
});
