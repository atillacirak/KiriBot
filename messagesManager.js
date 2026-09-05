import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MESSAGES_FILE = path.join(__dirname, 'database_messages.json');

// In-Memory Storage: Array of DirectMessage objects
let messagesMemory = [];
let messagesCollection = null;

// Initialize Mongo Collection
export async function initMessagesMongo(db) {
  if (!db) return;
  try {
    messagesCollection = db.collection('direct_messages');
    await messagesCollection.createIndex({ userId: 1, timestamp: -1 });
    await messagesCollection.createIndex({ timestamp: -1 });

    // Load messages from MongoDB into memory
    const docs = await messagesCollection.find({}).sort({ timestamp: 1 }).toArray();
    if (docs && docs.length > 0) {
      messagesMemory = docs.map(d => ({
        id: d.id || d._id?.toString(),
        userId: d.userId,
        userTag: d.userTag || '',
        userDisplayName: d.userDisplayName || d.userTag || 'Kullanıcı',
        userAvatar: d.userAvatar || '',
        direction: d.direction || 'incoming', // 'incoming' | 'outgoing'
        content: d.content || '',
        asEmbed: !!d.asEmbed,
        embedTitle: d.embedTitle || '',
        sentBy: d.sentBy || (d.direction === 'outgoing' ? 'admin' : 'user'),
        timestamp: d.timestamp || new Date().toISOString(),
        read: d.read !== undefined ? d.read : (d.direction === 'outgoing'),
        attachments: d.attachments || []
      }));
      console.log(`💬 MongoDB'den ${messagesMemory.length} adet DM kaydı hafızaya yüklendi.`);
    } else {
      loadMessagesLocal();
    }
  } catch (err) {
    console.error('❌ Messages MongoDB init error:', err.message);
    loadMessagesLocal();
  }
}

// Local File Persistence
function loadMessagesLocal() {
  if (fs.existsSync(MESSAGES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
      if (Array.isArray(data)) {
        messagesMemory = data;
        console.log(`💬 Yerel dosyadan ${messagesMemory.length} adet DM kaydı yüklendi.`);
      }
    } catch (e) {
      console.warn('Messages local load warning:', e.message);
      messagesMemory = [];
    }
  }
}

// Save to disk asynchronously
let saveTimeout = null;
function persistMessagesDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      // Keep last 5000 messages to prevent unbounded disk usage
      if (messagesMemory.length > 5000) {
        messagesMemory = messagesMemory.slice(-5000);
      }
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesMemory, null, 2), 'utf8');
    } catch (e) {
      console.error('Messages save to disk error:', e.message);
    }
  }, 1000);
}

// Record a new DM message
export async function recordDirectMessage({
  id = null,
  userId,
  userTag = '',
  userDisplayName = '',
  userAvatar = '',
  direction = 'incoming', // 'incoming' | 'outgoing'
  content = '',
  asEmbed = false,
  embedTitle = '',
  sentBy = 'user',
  timestamp = null,
  read = null,
  attachments = []
}) {
  if (!userId) return null;

  const msgId = id || `dm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const msgRecord = {
    id: msgId,
    userId: String(userId),
    userTag: userTag || 'Bilinmeyen Kullanıcı',
    userDisplayName: userDisplayName || userTag || 'Kullanıcı',
    userAvatar: userAvatar || '',
    direction: direction === 'outgoing' ? 'outgoing' : 'incoming',
    content: content || '',
    asEmbed: !!asEmbed,
    embedTitle: embedTitle || '',
    sentBy: sentBy || (direction === 'outgoing' ? 'admin' : 'user'),
    timestamp: timestamp || new Date().toISOString(),
    read: read !== null ? !!read : (direction === 'outgoing'),
    attachments: Array.isArray(attachments) ? attachments : []
  };

  messagesMemory.push(msgRecord);
  persistMessagesDisk();

  if (messagesCollection) {
    try {
      await messagesCollection.insertOne({ ...msgRecord, _id: msgId });
    } catch (e) {
      console.error('MongoDB message insert error:', e.message);
    }
  }

  return msgRecord;
}

// Get conversations summary list
export function getConversationsList() {
  const userMap = new Map();

  for (const msg of messagesMemory) {
    const uId = msg.userId;
    if (!userMap.has(uId)) {
      userMap.set(uId, {
        userId: uId,
        userTag: msg.userTag,
        userDisplayName: msg.userDisplayName,
        userAvatar: msg.userAvatar,
        lastMessage: msg.content || (msg.asEmbed ? `[Embed: ${msg.embedTitle || 'Bildiri'}]` : ''),
        lastMessageTime: msg.timestamp,
        lastDirection: msg.direction,
        lastSentBy: msg.sentBy,
        unreadCount: 0,
        totalMessages: 0
      });
    }

    const conv = userMap.get(uId);
    conv.totalMessages++;
    if (msg.userTag) conv.userTag = msg.userTag;
    if (msg.userDisplayName) conv.userDisplayName = msg.userDisplayName;
    if (msg.userAvatar) conv.userAvatar = msg.userAvatar;

    if (new Date(msg.timestamp) > new Date(conv.lastMessageTime)) {
      conv.lastMessage = msg.content || (msg.asEmbed ? `[Embed: ${msg.embedTitle || 'Bildiri'}]` : '');
      conv.lastMessageTime = msg.timestamp;
      conv.lastDirection = msg.direction;
      conv.lastSentBy = msg.sentBy;
    }

    if (msg.direction === 'incoming' && !msg.read) {
      conv.unreadCount++;
    }
  }

  // Convert to array and sort by most recent message descending
  const list = Array.from(userMap.values()).sort(
    (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
  );

  const totalUnread = list.reduce((sum, item) => sum + (item.unreadCount || 0), 0);

  return { conversations: list, totalUnread };
}

// Get full message thread for a user
export function getUserThread(userId) {
  if (!userId) return [];
  const thread = messagesMemory
    .filter(m => m.userId === String(userId))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return thread;
}

// Mark thread as read
export async function markThreadAsRead(userId) {
  if (!userId) return;
  const targetId = String(userId);
  let updated = false;

  for (const msg of messagesMemory) {
    if (msg.userId === targetId && msg.direction === 'incoming' && !msg.read) {
      msg.read = true;
      updated = true;
    }
  }

  if (updated) {
    persistMessagesDisk();
    if (messagesCollection) {
      try {
        await messagesCollection.updateMany(
          { userId: targetId, direction: 'incoming', read: false },
          { $set: { read: true } }
        );
      } catch (e) {
        console.error('MongoDB markThreadAsRead error:', e.message);
      }
    }
  }
}

// Load local on initial module import
loadMessagesLocal();
