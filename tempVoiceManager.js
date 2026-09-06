import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import { getGuildSettings } from './levelSystem.js';

let mongoTempVoiceCollection = null;
const tempVoiceCache = new Map(); // channelId -> data
const userProfilesCache = new Map(); // userId -> Array of profiles

export function initTempVoiceMongo(db) {
  if (db) {
    mongoTempVoiceCollection = db.collection('temp_voice_channels');
    db.collection('user_temp_profiles').find({}).toArray().then(docs => {
      docs.forEach(doc => {
        userProfilesCache.set(doc._id, doc.profiles || []);
      });
    }).catch(console.error);
  }
}

// Role-based max custom profile slots limit
export function getMaxProfileSlots(member) {
  if (!member) return 2;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 10;
  if (member.roles.cache.some(r => /boost|vip/i.test(r.name))) return 5;
  return 2;
}

export async function getUserProfiles(userId) {
  if (userProfilesCache.has(userId)) {
    return userProfilesCache.get(userId);
  }
  return [];
}

export async function saveUserProfile(userId, profile) {
  let profiles = userProfilesCache.get(userId) || [];
  const idx = profiles.findIndex(p => p.name === profile.name);
  if (idx !== -1) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  userProfilesCache.set(userId, profiles);

  if (mongoTempVoiceCollection) {
    try {
      const db = mongoTempVoiceCollection.db;
      await db.collection('user_temp_profiles').updateOne(
        { _id: userId },
        { $set: { profiles, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error('Error saving user profile to MongoDB:', e);
    }
  }
}

// Helper: Build vertical 5-row interactive control panel
export async function buildControlPanelComponents(tempData, member) {
  const rows = [];

  // Row 1: 👑 ODA SAHİBİ & DEVİR (UserSelectMenu)
  const ownerMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_owner_transfer')
    .setPlaceholder('👑 Oda Sahibi Devret...')
    .setMinValues(1)
    .setMaxValues(1);
  rows.push(new ActionRowBuilder().addComponents(ownerMenu));

  // Row 2: 📂 ODA PROFİLİ SEÇİMİ (StringSelectMenu)
  const profiles = await getUserProfiles(tempData.ownerId);
  const profileOptions = profiles.map(p => ({
    label: p.name,
    description: `👥 Limit: ${p.limit || 'Sınırsız'} | 🔒 ${p.isLocked ? 'Kilitli' : 'Açık'}`,
    value: `prof_${p.name}`,
    emoji: '🎮',
    default: tempData.activeProfileName === p.name
  }));

  const maxSlots = getMaxProfileSlots(member);
  if (profiles.length < maxSlots) {
    profileOptions.push({
      label: '➕ Yeni Profil Slotu Oluştur...',
      description: `Mevcut slot: ${profiles.length}/${maxSlots}`,
      value: 'create_new_profile',
      emoji: '✨'
    });
  }

  const profileMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_profile_select')
    .setPlaceholder('📂 Profil Seç veya Yeni Slot Oluştur...')
    .addOptions(profileOptions.length > 0 ? profileOptions : [{ label: 'Varsayılan Profil', value: 'default', emoji: '⚙️' }]);
  rows.push(new ActionRowBuilder().addComponents(profileMenu));

  // Row 3: 🛡️ MODERATÖRLER (UserSelectMenu)
  const modMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_mods_select')
    .setPlaceholder('🛡️ Oda Moderatörlerini Seç...')
    .setMinValues(0)
    .setMaxValues(10);
  rows.push(new ActionRowBuilder().addComponents(modMenu));

  // Row 4: 🟢 İZİNLİ / GİREBİLEN KULLANICILAR (UserSelectMenu)
  const allowMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_allowed_select')
    .setPlaceholder('🟢 İzinli Kullanıcıları Seç (Kilitli İçin)...')
    .setMinValues(0)
    .setMaxValues(10);
  rows.push(new ActionRowBuilder().addComponents(allowMenu));

  // Row 5: 🧰 HIZLI EYLEMLER (5 Buttons in 1 Row - Discord Max)
  const nameBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_name')
    .setLabel('🏷️ Ad')
    .setStyle(ButtonStyle.Secondary);

  const limitBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_limit')
    .setLabel('👥 Limit')
    .setStyle(ButtonStyle.Secondary);

  const lockBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_lock')
    .setLabel(tempData.isLocked ? '🔒 Kilitli' : '🔓 Açık')
    .setStyle(tempData.isLocked ? ButtonStyle.Danger : ButtonStyle.Success);

  const streamBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_stream')
    .setLabel(tempData.isStreamAllowed ? '📹 Kamera Açık' : '📹 Kamera Kapalı')
    .setStyle(tempData.isStreamAllowed ? ButtonStyle.Success : ButtonStyle.Secondary);

  const rejectBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_reject_menu')
    .setLabel('🚫 Engelle / At')
    .setStyle(ButtonStyle.Danger);

  rows.push(new ActionRowBuilder().addComponents(nameBtn, limitBtn, lockBtn, streamBtn, rejectBtn));

  return rows;
}

export function buildControlPanelEmbed(tempData, ownerUser) {
  return new EmbedBuilder()
    .setColor('#5EA454')
    .setTitle(`🎙️ ${tempData.channelName} — Kontrol Paneli`)
    .setDescription(
      `Odanızı aşağıdaki dikey panel menülerini kullanarak kolayca özelleştirebilirsiniz.\n` +
      `*Yaptığınız tüm değişiklikler seçili profilinize anında **otomatik kaydedilir**.*`
    )
    .addFields(
      { name: '👑 Oda Sahibi', value: `<@${tempData.ownerId}>`, inline: true },
      { name: '📂 Aktif Profil', value: `\`${tempData.activeProfileName || 'Özel Profil'}\``, inline: true },
      { name: '👥 Kişi Limiti', value: tempData.userLimit > 0 ? `\`${tempData.userLimit} Kişi\`` : '`Sınırsız`', inline: true },
      { name: '🔒 Kilit Durumu', value: tempData.isLocked ? '🔴 **Kilitli** (Sadece İzinliler)' : '🟢 **Açık** (Herkes Katılabilir)', inline: true },
      { name: '📹 Kamera & Yayın', value: tempData.isStreamAllowed ? '🟢 **İzin Verildi**' : '🔴 **Yasaklandı**', inline: true },
      { name: '🛡️ Moderatörler', value: tempData.moderators.length > 0 ? tempData.moderators.map(id => `<@${id}>`).join(', ') : '*Yok*', inline: false },
      { name: '🟢 İzinli Üyeler', value: tempData.allowedUsers.length > 0 ? tempData.allowedUsers.map(id => `<@${id}>`).join(', ') : '*Yok*', inline: false },
      { name: '🚫 Yasaklananlar', value: tempData.rejectedUsers.length > 0 ? tempData.rejectedUsers.map(id => `<@${id}>`).join(', ') : '*Yok*', inline: false }
    )
    .setFooter({ text: 'Yeşil Gölet • Geçici Sesli Oda Yönetimi', iconURL: ownerUser ? ownerUser.displayAvatarURL() : undefined })
    .setTimestamp();
}

// Sync permissions on channel
export async function syncChannelPermissions(channel, tempData) {
  try {
    // Owner gets Full Control
    await channel.permissionOverwrites.edit(tempData.ownerId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      MuteMembers: true,
      DeafenMembers: true,
      MoveMembers: true
    }).catch(e => console.warn('Sync owner perm error:', e.message));

    // Handle Lock
    if (tempData.isLocked) {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: false
      }).catch(e => console.warn('Sync lock perm error:', e.message));

      for (const userId of tempData.allowedUsers) {
        await channel.permissionOverwrites.edit(userId, {
          Connect: true,
          ViewChannel: true,
          Speak: true,
          SendMessages: true
        }).catch(e => console.warn('Sync allowed user perm error:', e.message));
      }
    } else {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Connect: true,
        ViewChannel: true,
        SendMessages: true
      }).catch(e => console.warn('Sync unlock perm error:', e.message));
    }

    // Handle Rejected Users
    for (const userId of tempData.rejectedUsers) {
      await channel.permissionOverwrites.edit(userId, {
        Connect: false,
        ViewChannel: false
      }).catch(e => console.warn('Sync reject user perm error:', e.message));
    }

    // Stream permission override
    if (!tempData.isStreamAllowed) {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Stream: false
      }).catch(e => console.warn('Sync stream perm error:', e.message));
    } else {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        Stream: true
      }).catch(e => console.warn('Sync stream allow perm error:', e.message));
    }

  } catch (e) {
    console.error('Error syncing channel permissions:', e);
  }
}

// Auto-save active state to profile
export async function autoSaveCurrentState(tempData) {
  if (!tempData.ownerId) return;
  const profileObj = {
    name: tempData.activeProfileName || 'Varsayılan',
    channelName: tempData.channelName,
    limit: tempData.userLimit,
    isLocked: tempData.isLocked,
    isStreamAllowed: tempData.isStreamAllowed,
    moderators: tempData.moderators,
    allowedUsers: tempData.allowedUsers,
    rejectedUsers: tempData.rejectedUsers
  };
  await saveUserProfile(tempData.ownerId, profileObj);
}

// Handle voice state join/leave for JTC
export async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const settings = getGuildSettings(guild.id);

  const hubChannelId = settings.tempVoiceHubChannelId;
  if (!hubChannelId) return;

  // 1. Check if user joined hub channel
  if (newState.channelId === hubChannelId) {
    const member = newState.member;
    const channelName = `🔊 ${member.displayName} Odası`;

    try {
      const hubChannel = guild.channels.cache.get(hubChannelId);
      const category = hubChannel ? hubChannel.parent : null;

      // Clone EXACT permission overwrites from Hub channel onto new channel
      const exactHubOverwrites = hubChannel ? Array.from(hubChannel.permissionOverwrites.cache.values()).map(o => ({
        id: o.id,
        type: o.type,
        allow: o.allow,
        deny: o.deny
      })) : [];

      const tempChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: category ? category.id : undefined,
        permissionOverwrites: exactHubOverwrites
      });

      // Move member to new channel (safely handled if bot lacks move permission)
      try {
        await member.voice.setChannel(tempChannel);
      } catch (moveErr) {
        console.warn('⚠️ Bot member move permission missing or failed:', moveErr.message);
      }

      const tempData = {
        channelId: tempChannel.id,
        ownerId: member.id,
        channelName: channelName,
        userLimit: 0,
        isLocked: false,
        isStreamAllowed: true,
        activeProfileName: 'Varsayılan',
        moderators: [],
        allowedUsers: [],
        rejectedUsers: [],
        controlMessageId: null
      };

      // Check if user has saved profiles
      const userProfiles = await getUserProfiles(member.id);
      if (userProfiles.length > 0) {
        const lastP = userProfiles[0];
        tempData.activeProfileName = lastP.name;
        tempData.channelName = lastP.channelName || channelName;
        tempData.userLimit = lastP.limit || 0;
        tempData.isLocked = !!lastP.isLocked;
        tempData.isStreamAllowed = lastP.isStreamAllowed !== undefined ? lastP.isStreamAllowed : true;
        tempData.moderators = lastP.moderators || [];
        tempData.allowedUsers = lastP.allowedUsers || [];
        tempData.rejectedUsers = lastP.rejectedUsers || [];

        await tempChannel.setName(tempData.channelName);
        if (tempData.userLimit > 0) await tempChannel.setUserLimit(tempData.userLimit);
      }

      tempVoiceCache.set(tempChannel.id, tempData);

      // Send Control Panel Embed into Voice Channel Text Chat FIRST (before overwrites sync)
      try {
        const embed = buildControlPanelEmbed(tempData, member.user);
        const components = await buildControlPanelComponents(tempData, member);
        const controlMsg = await tempChannel.send({ embeds: [embed], components });
        tempData.controlMessageId = controlMsg.id;
      } catch (sendErr) {
        console.error('⚠️ Control panel send error:', sendErr.message);
      }

      // Sync channel permissions after sending message
      await syncChannelPermissions(tempChannel, tempData);

    } catch (err) {
      console.error('Error creating temp voice channel:', err);
    }
  }

  // 2. Cleanup empty temp voice channels
  if (oldState.channelId && oldState.channelId !== hubChannelId) {
    const oldChannel = guild.channels.cache.get(oldState.channelId);
    if (oldChannel && tempVoiceCache.has(oldChannel.id)) {
      if (oldChannel.members.size === 0) {
        tempVoiceCache.delete(oldChannel.id);
        try {
          await oldChannel.delete();
        } catch (e) {
          console.error('Error deleting empty temp channel:', e);
        }
      }
    }
  }
}

// Handle Component Interactions (Buttons, Select Menus)
export async function handleTempVoiceInteraction(interaction) {
  const { customId, channel, member, guild } = interaction;
  const tempData = tempVoiceCache.get(channel.id);

  if (!tempData) {
    return interaction.reply({ content: '❌ Bu kanal geçici bir sesli oda değil.', flags: 64 });
  }

  // Check if member is owner or moderator
  const isOwner = member.id === tempData.ownerId;
  const isMod = tempData.moderators.includes(member.id);

  if (!isOwner && !isMod && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu odayı yönetme yetkiniz yok!', flags: 64 });
  }

  // 1. Transfer Ownership
  if (customId === 'jtc_owner_transfer') {
    const newOwnerId = interaction.values[0];
    tempData.ownerId = newOwnerId;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: `👑 Oda sahipliği <@${newOwnerId}> kullanıcısına devredildi!`, flags: 64 });
  }

  // 2. Select / Create Profile
  if (customId === 'jtc_profile_select') {
    const selected = interaction.values[0];
    if (selected === 'create_new_profile') {
      const modal = new ModalBuilder()
        .setCustomId('jtc_modal_new_profile')
        .setTitle('➕ Yeni Profil Slotu Oluştur');

      const nameInput = new TextInputBuilder()
        .setCustomId('profile_name')
        .setLabel('Profil İsmi')
        .setPlaceholder('Örn: Valorant Tryhard, Takılma vs.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
      return interaction.showModal(modal);
    } else if (selected.startsWith('prof_')) {
      const profName = selected.replace('prof_', '');
      const userProfiles = await getUserProfiles(tempData.ownerId);
      const targetP = userProfiles.find(p => p.name === profName);

      if (targetP) {
        tempData.activeProfileName = targetP.name;
        tempData.channelName = targetP.channelName || tempData.channelName;
        tempData.userLimit = targetP.limit || 0;
        tempData.isLocked = !!targetP.isLocked;
        tempData.isStreamAllowed = targetP.isStreamAllowed !== undefined ? targetP.isStreamAllowed : true;
        tempData.moderators = targetP.moderators || [];
        tempData.allowedUsers = targetP.allowedUsers || [];
        tempData.rejectedUsers = targetP.rejectedUsers || [];

        await channel.setName(tempData.channelName);
        await channel.setUserLimit(tempData.userLimit);
        await syncChannelPermissions(channel, tempData);
        await refreshControlPanel(channel, tempData, interaction);
        return interaction.reply({ content: `📂 \`${profName}\` profili yüklendi!`, flags: 64 });
      }
    }
  }

  // 3. Select Moderators
  if (customId === 'jtc_mods_select') {
    tempData.moderators = interaction.values;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: '🛡️ Moderatör listesi güncellendi ve kaydedildi!', flags: 64 });
  }

  // 4. Select Allowed Users
  if (customId === 'jtc_allowed_select') {
    tempData.allowedUsers = interaction.values;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: '🟢 İzinli üyeler güncellendi ve kaydedildi!', flags: 64 });
  }

  // 5. Buttons
  if (customId === 'jtc_btn_name') {
    const modal = new ModalBuilder()
      .setCustomId('jtc_modal_change_name')
      .setTitle('🏷️ Oda İsmini Değiştir');

    const input = new TextInputBuilder()
      .setCustomId('channel_name')
      .setLabel('Yeni Oda İsmi (Emojili öneriler: 🎮 💬 🎵)')
      .setValue(tempData.channelName)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (customId === 'jtc_btn_limit') {
    const modal = new ModalBuilder()
      .setCustomId('jtc_modal_change_limit')
      .setTitle('👥 Kişi Limitini Ayarla');

    const input = new TextInputBuilder()
      .setCustomId('channel_limit')
      .setLabel('Kişi Sayısı (0 = Sınırsız)')
      .setValue(String(tempData.userLimit))
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (customId === 'jtc_btn_lock') {
    tempData.isLocked = !tempData.isLocked;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: tempData.isLocked ? '🔒 Oda kilitlendi!' : '🔓 Oda kiliti açıldı!', flags: 64 });
  }

  if (customId === 'jtc_btn_stream') {
    tempData.isStreamAllowed = !tempData.isStreamAllowed;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: tempData.isStreamAllowed ? '📹 Kamera ve yayın kullanımı açıldı!' : '📹 Kamera ve yayın kullanımı kapatıldı!', flags: 64 });
  }

  if (customId === 'jtc_btn_reject_menu') {
    const rejectMenu = new UserSelectMenuBuilder()
      .setCustomId('jtc_rejected_select')
      .setPlaceholder('🚫 Yasaklanacak / Odadan Atılacak Üyeleri Seç...')
      .setMinValues(0)
      .setMaxValues(10);

    return interaction.reply({
      content: '🚫 Yasaklamak veya odadan atmak istediğiniz kullanıcıları seçin:',
      components: [new ActionRowBuilder().addComponents(rejectMenu)],
      flags: 64
    });
  }

  if (customId === 'jtc_rejected_select') {
    tempData.rejectedUsers = interaction.values;

    // Kick rejected users if currently in channel
    channel.members.forEach(async (m) => {
      if (tempData.rejectedUsers.includes(m.id)) {
        try {
          await m.voice.disconnect('Oda sahibi tarafından engellendi');
        } catch (e) {}
      }
    });

    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return interaction.reply({ content: '🚫 Engellenen kullanıcılar güncellendi ve odadan atıldı!', flags: 64 });
  }
}

// Handle Modal Submits
export async function handleTempVoiceModalSubmit(interaction) {
  const { customId, channel } = interaction;
  const tempData = tempVoiceCache.get(channel.id);
  if (!tempData) return;

  if (customId === 'jtc_modal_change_name') {
    const newName = interaction.fields.getTextInputValue('channel_name').trim();
    if (newName) {
      tempData.channelName = newName;
      await channel.setName(newName);
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return interaction.reply({ content: `🏷️ Oda adı \`${newName}\` olarak güncellendi!`, flags: 64 });
    }
  }

  if (customId === 'jtc_modal_change_limit') {
    const limitVal = parseInt(interaction.fields.getTextInputValue('channel_limit').trim(), 10);
    if (!isNaN(limitVal) && limitVal >= 0 && limitVal <= 99) {
      tempData.userLimit = limitVal;
      await channel.setUserLimit(limitVal);
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return interaction.reply({ content: `👥 Kişi limiti \`${limitVal === 0 ? 'Sınırsız' : limitVal}\` olarak ayarlandı!`, flags: 64 });
    }
  }

  if (customId === 'jtc_modal_new_profile') {
    const profName = interaction.fields.getTextInputValue('profile_name').trim();
    if (profName) {
      tempData.activeProfileName = profName;
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return interaction.reply({ content: `✨ \`${profName}\` isimli yeni profil slotu oluşturuldu ve kaydedildi!`, flags: 64 });
    }
  }
}

async function refreshControlPanel(channel, tempData, interaction) {
  try {
    const ownerUser = await channel.client.users.fetch(tempData.ownerId).catch(() => null);
    const embed = buildControlPanelEmbed(tempData, ownerUser);
    const components = await buildControlPanelComponents(tempData, interaction.member);

    if (tempData.controlMessageId) {
      const msg = await channel.messages.fetch(tempData.controlMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed], components });
      }
    }
  } catch (e) {
    console.error('Error refreshing control panel embed:', e);
  }
}
