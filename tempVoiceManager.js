import { 
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
const tempVoiceCache = new Map(); // channelId -> tempData
const userProfilesCache = new Map(); // userId -> Array of profiles

// Initialize MongoDB for JTC profiles and channels
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
  return userProfilesCache.get(userId) || [];
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

// Build 5-Row Vertical Control Panel (Strictly matching jtc_design_plan.md)
export async function buildControlPanelComponents(tempData, member) {
  const rows = [];
  const profiles = await getUserProfiles(tempData.ownerId);
  const maxSlots = getMaxProfileSlots(member);

  // Row 1: Oda Profili (Select Menu with Owner Transfer & Slot creation)
  const profileOptions = [
    { label: '👑 Oda Sahibini Devret...', value: 'action_owner_transfer' }
  ];

  profiles.forEach(p => {
    profileOptions.push({
      label: p.name,
      value: `prof_${p.name}`,
      default: tempData.activeProfileName === p.name
    });
  });

  if (profiles.length < maxSlots) {
    profileOptions.push({
      label: `Yeni Profil Slotu Oluştur... (${profiles.length}/${maxSlots})`,
      value: 'create_new_profile'
    });
  }

  const profileMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_profile_select')
    .setPlaceholder('Oda Profili')
    .addOptions(profileOptions);
  rows.push(new ActionRowBuilder().addComponents(profileMenu));

  // Row 2: Moderatörler (UserSelectMenu)
  const modMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_mods_select')
    .setPlaceholder('Moderatörler')
    .setDefaultUsers(tempData.moderators || [])
    .setMinValues(0)
    .setMaxValues(10);
  rows.push(new ActionRowBuilder().addComponents(modMenu));

  // Row 3: İzinli Kullanıcılar (UserSelectMenu)
  const allowMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_allowed_select')
    .setPlaceholder('İzinli Kullanıcılar')
    .setDefaultUsers(tempData.allowedUsers || [])
    .setMinValues(0)
    .setMaxValues(10);
  rows.push(new ActionRowBuilder().addComponents(allowMenu));

  // Row 4: Yasaklanan Kullanıcılar (UserSelectMenu)
  const rejectMenu = new UserSelectMenuBuilder()
    .setCustomId('jtc_rejected_select')
    .setPlaceholder('Yasaklanan Kullanıcılar')
    .setDefaultUsers(tempData.rejectedUsers || [])
    .setMinValues(0)
    .setMaxValues(10);
  rows.push(new ActionRowBuilder().addComponents(rejectMenu));

  // Row 5: Action Buttons (Exact Emojis & Dynamic Styles)
  const nameBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_name')
    .setEmoji('🏷️')
    .setStyle(ButtonStyle.Secondary);

  const limitBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_limit')
    .setEmoji('👥')
    .setStyle(ButtonStyle.Secondary);

  const lockBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_lock')
    .setEmoji(tempData.isLocked ? '🔒' : '🔓')
    .setStyle(tempData.isLocked ? ButtonStyle.Danger : ButtonStyle.Secondary);

  const speakBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_speak')
    .setEmoji('🎙️')
    .setStyle(tempData.isSpeakAllowed !== false ? ButtonStyle.Secondary : ButtonStyle.Danger);

  const streamBtn = new ButtonBuilder()
    .setCustomId('jtc_btn_stream')
    .setEmoji('📹')
    .setStyle(tempData.isStreamAllowed !== false ? ButtonStyle.Success : ButtonStyle.Danger);

  rows.push(new ActionRowBuilder().addComponents(nameBtn, limitBtn, lockBtn, speakBtn, streamBtn));

  return rows;
}

// Synchronize channel permissions cleanly according to design plan
export async function syncChannelPermissions(channel, tempData) {
  try {
    const everyoneRole = channel.guild.roles.everyone;

    // 1. Owner Control (Full Access)
    await channel.permissionOverwrites.edit(tempData.ownerId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      MuteMembers: true,
      DeafenMembers: true,
      MoveMembers: true
    }).catch(e => console.warn('Sync owner perm error:', e.message));

    // 2. Lock / Unlock State on @everyone
    if (tempData.isLocked) {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Connect: false
      }).catch(e => console.warn('Sync lock perm error:', e.message));
    } else {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Connect: true
      }).catch(e => console.warn('Sync unlock perm error:', e.message));
      await channel.permissionOverwrites.delete(everyoneRole.id).catch(() => {});
    }

    // 3. Camera & Stream Permission (Default Enabled)
    if (tempData.isStreamAllowed !== false) {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Stream: true
      }).catch(e => console.warn('Sync stream allow perm error:', e.message));
    } else {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Stream: false
      }).catch(e => console.warn('Sync stream deny perm error:', e.message));
    }

    // 4. Speak Permission
    if (tempData.isSpeakAllowed !== false) {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Speak: true
      }).catch(e => console.warn('Sync speak allow perm error:', e.message));
    } else {
      await channel.permissionOverwrites.edit(everyoneRole, {
        Speak: false
      }).catch(e => console.warn('Sync speak deny perm error:', e.message));
    }

    // 5. Moderators (Full Channel Control)
    for (const modId of tempData.moderators) {
      if (modId !== tempData.ownerId) {
        await channel.permissionOverwrites.edit(modId, {
          ViewChannel: true,
          Connect: true,
          Speak: true,
          Stream: true,
          MuteMembers: true,
          MoveMembers: true
        }).catch(e => console.warn('Sync mod perm error:', e.message));
      }
    }

    // 6. Allowed Users (Explicit Connect permission if channel is locked)
    for (const userId of tempData.allowedUsers) {
      if (userId !== tempData.ownerId && !tempData.moderators.includes(userId)) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          Connect: true,
          Speak: true,
          Stream: true
        }).catch(e => console.warn('Sync allow perm error:', e.message));
      }
    }

    // 7. Rejected Users (Blocked & Disconnected)
    for (const userId of tempData.rejectedUsers) {
      if (userId !== tempData.ownerId) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: false,
          Connect: false
        }).catch(e => console.warn('Sync reject perm error:', e.message));
      }
    }

  } catch (e) {
    console.error('Error syncing channel permissions:', e);
  }
}

// Save current channel state to user active profile
export async function autoSaveCurrentState(tempData) {
  if (!tempData.ownerId) return;
  const profileObj = {
    name: tempData.activeProfileName || 'Varsayılan',
    channelName: tempData.channelName,
    limit: tempData.userLimit,
    isLocked: tempData.isLocked,
    isStreamAllowed: tempData.isStreamAllowed,
    isSpeakAllowed: tempData.isSpeakAllowed,
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

  // 1. User joined hub channel -> Create temp voice channel
  if (newState.channelId === hubChannelId) {
    const member = newState.member;
    const channelName = `🔊 ${member.displayName} Odası`;

    try {
      const hubChannel = guild.channels.cache.get(hubChannelId);
      const category = hubChannel ? hubChannel.parent : null;

      // Create channel cleanly inheriting category perms
      const tempChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: category ? category.id : undefined
      });

      // Move member to new channel
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
        isSpeakAllowed: true,
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
        tempData.isSpeakAllowed = lastP.isSpeakAllowed !== undefined ? lastP.isSpeakAllowed : true;
        tempData.moderators = lastP.moderators || [];
        tempData.allowedUsers = lastP.allowedUsers || [];
        tempData.rejectedUsers = lastP.rejectedUsers || [];

        await tempChannel.setName(tempData.channelName);
        if (tempData.userLimit > 0) await tempChannel.setUserLimit(tempData.userLimit);
      }

      tempVoiceCache.set(tempChannel.id, tempData);

      // Send Control Panel Components directly into Voice Channel Text Chat (No Embed)
      try {
        const components = await buildControlPanelComponents(tempData, member);
        const controlMsg = await tempChannel.send({ components });
        tempData.controlMessageId = controlMsg.id;
      } catch (sendErr) {
        console.error('⚠️ Control panel send error:', sendErr.message);
      }

      // Sync channel permissions
      await syncChannelPermissions(tempChannel, tempData);

    } catch (err) {
      console.error('Error creating temp voice channel:', err);
    }
  }

  // 2. Cleanup empty temp voice channels (0 members)
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
  const { customId, member, guild } = interaction;
  const channelId = interaction.channelId || interaction.channel?.id;
  const channel = interaction.channel || guild?.channels.cache.get(channelId);
  const tempData = channelId ? tempVoiceCache.get(channelId) : null;

  if (!tempData || !channel) {
    return interaction.reply({ content: '❌ Bu kanal geçici bir sesli oda değil.', flags: 64 });
  }

  // Check if member is owner, moderator or admin
  const isOwner = member.id === tempData.ownerId;
  const isMod = tempData.moderators.includes(member.id);

  if (!isOwner && !isMod && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu odayı yönetme yetkiniz yok!', flags: 64 });
  }

  // 1. Transfer Ownership Menu
  if (customId === 'jtc_owner_transfer') {
    await interaction.deferUpdate();
    const newOwnerId = interaction.values[0];
    tempData.ownerId = newOwnerId;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }

  // 2. Profile Selection / Create Profile / Trigger Owner Transfer
  if (customId === 'jtc_profile_select') {
    const selected = interaction.values[0];
    if (selected === 'action_owner_transfer') {
      const ownerMenu = new UserSelectMenuBuilder()
        .setCustomId('jtc_owner_transfer')
        .setPlaceholder('Oda Sahibi Devret...')
        .setDefaultUsers(tempData.ownerId ? [tempData.ownerId] : [])
        .setMinValues(1)
        .setMaxValues(1);

      return interaction.reply({
        content: '👑 Yeni oda sahibini seçin:',
        components: [new ActionRowBuilder().addComponents(ownerMenu)],
        flags: 64
      });
    } else if (selected === 'create_new_profile') {
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
      await interaction.deferUpdate();
      const profName = selected.replace('prof_', '');
      const userProfiles = await getUserProfiles(tempData.ownerId);
      const targetP = userProfiles.find(p => p.name === profName);

      if (targetP) {
        tempData.activeProfileName = targetP.name;
        tempData.channelName = targetP.channelName || tempData.channelName;
        tempData.userLimit = targetP.limit || 0;
        tempData.isLocked = !!targetP.isLocked;
        tempData.isStreamAllowed = targetP.isStreamAllowed !== undefined ? targetP.isStreamAllowed : true;
        tempData.isSpeakAllowed = targetP.isSpeakAllowed !== undefined ? targetP.isSpeakAllowed : true;
        tempData.moderators = targetP.moderators || [];
        tempData.allowedUsers = targetP.allowedUsers || [];
        tempData.rejectedUsers = targetP.rejectedUsers || [];

        await channel.setName(tempData.channelName);
        await channel.setUserLimit(tempData.userLimit);
        await syncChannelPermissions(channel, tempData);
        await refreshControlPanel(channel, tempData, interaction);
        return;
      }
    }
  }

  // 3. Select Moderators
  if (customId === 'jtc_mods_select') {
    await interaction.deferUpdate();
    tempData.moderators = interaction.values;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }

  // 4. Select Allowed Users
  if (customId === 'jtc_allowed_select') {
    await interaction.deferUpdate();
    tempData.allowedUsers = interaction.values;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }

  // 5. Select Rejected Users
  if (customId === 'jtc_rejected_select') {
    await interaction.deferUpdate();
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
    return;
  }

  // 6. Action Buttons
  if (customId === 'jtc_btn_name') {
    const modal = new ModalBuilder()
      .setCustomId('jtc_modal_change_name')
      .setTitle('🏷️ Oda İsmini Değiştir');

    const input = new TextInputBuilder()
      .setCustomId('channel_name')
      .setLabel('Yeni Oda İsmi')
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
    await interaction.deferUpdate();
    tempData.isLocked = !tempData.isLocked;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }

  if (customId === 'jtc_btn_speak') {
    await interaction.deferUpdate();
    tempData.isSpeakAllowed = tempData.isSpeakAllowed !== undefined ? !tempData.isSpeakAllowed : false;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }

  if (customId === 'jtc_btn_stream') {
    await interaction.deferUpdate();
    tempData.isStreamAllowed = tempData.isStreamAllowed !== undefined ? !tempData.isStreamAllowed : false;
    await syncChannelPermissions(channel, tempData);
    await autoSaveCurrentState(tempData);
    await refreshControlPanel(channel, tempData, interaction);
    return;
  }
}

// Handle Modal Submits
export async function handleTempVoiceModalSubmit(interaction) {
  const { customId, guild } = interaction;
  const channelId = interaction.channelId || interaction.channel?.id;
  const channel = interaction.channel || guild?.channels.cache.get(channelId);
  const tempData = channelId ? tempVoiceCache.get(channelId) : null;
  if (!tempData || !channel) return;

  if (customId === 'jtc_modal_change_name') {
    await interaction.deferUpdate();
    const newName = interaction.fields.getTextInputValue('channel_name').trim();
    if (newName) {
      tempData.channelName = newName;
      await channel.setName(newName);
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return;
    }
  }

  if (customId === 'jtc_modal_change_limit') {
    await interaction.deferUpdate();
    const limitVal = parseInt(interaction.fields.getTextInputValue('channel_limit').trim(), 10);
    if (!isNaN(limitVal) && limitVal >= 0 && limitVal <= 99) {
      tempData.userLimit = limitVal;
      await channel.setUserLimit(limitVal);
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return;
    }
  }

  if (customId === 'jtc_modal_new_profile') {
    await interaction.deferUpdate();
    const profName = interaction.fields.getTextInputValue('profile_name').trim();
    if (profName) {
      tempData.activeProfileName = profName;
      await autoSaveCurrentState(tempData);
      await refreshControlPanel(channel, tempData, interaction);
      return;
    }
  }
}

// Refresh panel components silently without embed card
async function refreshControlPanel(channel, tempData, interaction) {
  try {
    const components = await buildControlPanelComponents(tempData, interaction.member);

    if (tempData.controlMessageId) {
      const msg = await channel.messages.fetch(tempData.controlMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ components });
      }
    }
  } catch (e) {
    console.error('Error refreshing control panel components:', e);
  }
}
