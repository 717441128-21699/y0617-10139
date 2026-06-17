const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, '..', '..', 'chat.db');

let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT DEFAULT 'default.png',
      created_at INTEGER NOT NULL,
      last_online INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'public',
      password TEXT,
      owner_id INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      last_read_message_id INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(room_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      file_name TEXT,
      file_size INTEGER,
      file_url TEXT,
      mentions TEXT,
      is_recalled INTEGER DEFAULT 0,
      recalled_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id)`);

  saveDatabase();
  console.log('Database initialized successfully');
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function sanitizeRoom(room) {
  if (!room) return null;
  return {
    ...room,
    password: undefined,
    has_password: !!room.password
  };
}

function sanitizeRooms(rooms) {
  if (!rooms) return [];
  return rooms.map(sanitizeRoom);
}

function run(query, params = []) {
  const stmt = db.prepare(query);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  
  const result = db.exec('SELECT last_insert_rowid()');
  let lastId = null;
  if (result && result.length > 0 && result[0].values && result[0].values.length > 0) {
    lastId = result[0].values[0][0];
  }
  
  saveDatabase();
  return lastId;
}

function get(query, params = []) {
  const stmt = db.prepare(query);
  stmt.bind(params);
  if (stmt.step()) {
    const result = stmt.getAsObject();
    stmt.free();
    return result;
  }
  stmt.free();
  return null;
}

function all(query, params = []) {
  const stmt = db.prepare(query);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

const dbOperations = {
  createUser: (username, password, nickname) => {
    const now = Date.now();
    const userId = run(
      'INSERT INTO users (username, password, nickname, created_at) VALUES (?, ?, ?, ?)',
      [username, password, nickname, now]
    );
    return userId ? get('SELECT * FROM users WHERE id = ?', [userId]) : null;
  },

  getUserByUsername: (username) => {
    return get('SELECT * FROM users WHERE username = ?', [username]);
  },

  getUserById: (id) => {
    return get('SELECT id, username, nickname, avatar, last_online FROM users WHERE id = ?', [id]);
  },

  updateUserProfile: (userId, nickname, avatar) => {
    run('UPDATE users SET nickname = ?, avatar = ? WHERE id = ?', [nickname, avatar, userId]);
    return dbOperations.getUserById(userId);
  },

  updateUserLastOnline: (userId) => {
    run('UPDATE users SET last_online = ? WHERE id = ?', [Date.now(), userId]);
  },

  searchUsers: (keyword, excludeUserId) => {
    return all(
      'SELECT id, username, nickname, avatar, last_online FROM users WHERE (username LIKE ? OR nickname LIKE ?) AND id != ? LIMIT 20',
      [`%${keyword}%`, `%${keyword}%`, excludeUserId]
    );
  },

  createRoom: (name, type, password, ownerId) => {
    const now = Date.now();
    const roomId = run(
      'INSERT INTO rooms (name, type, password, owner_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, type, password, ownerId, now]
    );
    const room = roomId ? get('SELECT * FROM rooms WHERE id = ?', [roomId]) : null;
    if (room) {
      dbOperations.addRoomMember(room.id, ownerId);
    }
    return sanitizeRoom(room);
  },

  getRoomById: (id) => {
    return get('SELECT * FROM rooms WHERE id = ?', [id]);
  },

  getRoomByIdSafe: (id) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [id]);
    return sanitizeRoom(room);
  },

  verifyRoomPassword: (roomId, password) => {
    const room = get('SELECT password FROM rooms WHERE id = ?', [roomId]);
    if (!room || !room.password) return false;
    return bcrypt.compareSync(password, room.password);
  },

  getRoomsByUserId: (userId) => {
    const rooms = all(`
      SELECT r.*, 
             (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.id > rm.last_read_message_id AND m.user_id != ?) as unread_count
      FROM rooms r
      INNER JOIN room_members rm ON r.id = rm.room_id
      WHERE rm.user_id = ?
      ORDER BY (SELECT MAX(created_at) FROM messages m WHERE m.room_id = r.id) DESC, r.created_at DESC
    `, [userId, userId]);
    return sanitizeRooms(rooms);
  },

  getPublicRooms: (currentUserId = null) => {
    const params = [];
    let joinSql = '';
    let whereSql = "WHERE r.type = 'public'";
    
    if (currentUserId) {
      joinSql = 'LEFT JOIN room_members rm_current ON r.id = rm_current.room_id AND rm_current.user_id = ?';
      params.push(currentUserId);
      whereSql = `WHERE (r.type = 'public' OR (r.type = 'private' AND r.password IS NOT NULL))`;
    }
    
    return all(`
      SELECT r.*, 
             (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count,
             CASE WHEN r.password IS NOT NULL THEN 1 ELSE 0 END as has_password,
             ${currentUserId ? 'CASE WHEN rm_current.user_id IS NOT NULL THEN 1 ELSE 0 END as is_member' : '0 as is_member'}
      FROM rooms r
      ${joinSql}
      ${whereSql}
      ORDER BY r.created_at DESC
    `, params).map(room => ({
      ...room,
      password: undefined
    }));
  },

  getPrivateRoom: (user1Id, user2Id) => {
    const room = get(`
      SELECT r.*
      FROM rooms r
      INNER JOIN room_members rm1 ON r.id = rm1.room_id
      INNER JOIN room_members rm2 ON r.id = rm2.room_id
      WHERE r.type = 'private' 
        AND rm1.user_id = ? 
        AND rm2.user_id = ?
      LIMIT 1
    `, [user1Id, user2Id]);
    return sanitizeRoom(room);
  },

  addRoomMember: (roomId, userId) => {
    const now = Date.now();
    run(
      'INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)',
      [roomId, userId, now]
    );
  },

  isRoomMember: (roomId, userId) => {
    const result = get('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
    return !!result;
  },

  getRoomMembers: (roomId) => {
    return all(`
      SELECT u.id, u.username, u.nickname, u.avatar, u.last_online
      FROM users u
      INNER JOIN room_members rm ON u.id = rm.user_id
      WHERE rm.room_id = ?
      ORDER BY u.nickname
    `, [roomId]);
  },

  updateLastReadMessage: (roomId, userId, messageId) => {
    run(
      'UPDATE room_members SET last_read_message_id = ? WHERE room_id = ? AND user_id = ?',
      [messageId, roomId, userId]
    );
  },

  createMessage: (roomId, userId, type, content, fileName = null, fileSize = null, fileUrl = null, mentions = null) => {
    const now = Date.now();
    const mentionsStr = mentions ? JSON.stringify(mentions) : null;
    const msgId = run(
      'INSERT INTO messages (room_id, user_id, type, content, file_name, file_size, file_url, mentions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [roomId, userId, type, content, fileName, fileSize, fileUrl, mentionsStr, now]
    );
    const msg = msgId ? get('SELECT * FROM messages WHERE id = ?', [msgId]) : null;
    if (msg) {
      const user = dbOperations.getUserById(userId);
      msg.user = user;
      msg.mentions = msg.mentions ? JSON.parse(msg.mentions) : null;
    }
    return msg;
  },

  getMessages: (roomId, beforeId = null, limit = 50) => {
    let query = `
      SELECT m.*, u.username, u.nickname, u.avatar
      FROM messages m
      INNER JOIN users u ON m.user_id = u.id
      WHERE m.room_id = ?
    `;
    const params = [roomId];

    if (beforeId) {
      query += ' AND m.id < ?';
      params.push(beforeId);
    }

    query += ' ORDER BY m.id DESC LIMIT ?';
    params.push(limit);

    const messages = all(query, params);
    return messages.reverse().map(msg => ({
      ...msg,
      mentions: msg.mentions ? JSON.parse(msg.mentions) : null,
      user: {
        id: msg.user_id,
        username: msg.username,
        nickname: msg.nickname,
        avatar: msg.avatar
      }
    }));
  },

  getMessageById: (id) => {
    const msg = get(`
      SELECT m.*, u.username, u.nickname, u.avatar
      FROM messages m
      INNER JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `, [id]);
    if (msg) {
      msg.mentions = msg.mentions ? JSON.parse(msg.mentions) : null;
      msg.user = {
        id: msg.user_id,
        username: msg.username,
        nickname: msg.nickname,
        avatar: msg.avatar
      };
    }
    return msg;
  },

  recallMessage: (messageId) => {
    const now = Date.now();
    run(
      'UPDATE messages SET is_recalled = 1, recalled_at = ?, content = ? WHERE id = ?',
      [now, '消息已撤回', messageId]
    );
    return dbOperations.getMessageById(messageId);
  },

  getUnreadMessages: (userId, sinceTime) => {
    return all(`
      SELECT m.*, u.username, u.nickname, u.avatar
      FROM messages m
      INNER JOIN users u ON m.user_id = u.id
      INNER JOIN room_members rm ON m.room_id = rm.room_id
      WHERE rm.user_id = ? 
        AND m.created_at > ? 
        AND m.user_id != ?
        AND m.id > rm.last_read_message_id
      ORDER BY m.created_at ASC
    `, [userId, sinceTime, userId]).map(msg => ({
      ...msg,
      mentions: msg.mentions ? JSON.parse(msg.mentions) : null,
      user: {
        id: msg.user_id,
        username: msg.username,
        nickname: msg.nickname,
        avatar: msg.avatar
      }
    }));
  },

  updateRoom: (roomId, updates, userId) => {
    const room = get('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) return null;
    if (room.owner_id !== parseInt(userId)) return null;

    const fields = [];
    const params = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.password !== undefined) {
      if (updates.password === '') {
        fields.push('password = ?');
        params.push(null);
      } else {
        fields.push('password = ?');
        params.push(bcrypt.hashSync(updates.password, 10));
      }
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      params.push(updates.type);
    }

    if (fields.length === 0) return sanitizeRoom(room);

    params.push(roomId);
    run(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`, params);
    return dbOperations.getRoomByIdSafe(roomId);
  },

  removeRoomMember: (roomId, userId) => {
    run('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  },

  searchMessages: (roomId, keyword, limit = 50) => {
    const likeKeyword = `%${keyword}%`;
    return all(`
      SELECT m.*, u.username, u.nickname, u.avatar
      FROM messages m
      INNER JOIN users u ON m.user_id = u.id
      WHERE m.room_id = ?
        AND m.is_recalled = 0
        AND (m.content LIKE ? OR m.file_name LIKE ?)
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [roomId, likeKeyword, likeKeyword, limit]).map(msg => ({
      ...msg,
      mentions: msg.mentions ? JSON.parse(msg.mentions) : null,
      user: {
        id: msg.user_id,
        username: msg.username,
        nickname: msg.nickname,
        avatar: msg.avatar
      }
    }));
  },

  getPrivateChatReadStatus: (roomId, userId) => {
    const room = get('SELECT * FROM rooms WHERE id = ? AND type = ?', [roomId, 'private']);
    if (!room) return null;

    const members = all(
      'SELECT user_id, last_read_message_id FROM room_members WHERE room_id = ?',
      [roomId]
    );

    const otherMember = members.find(m => m.user_id !== userId);
    const myMember = members.find(m => m.user_id === userId);
    if (!otherMember || !myMember) return null;

    const lastMessage = get(
      'SELECT id FROM messages WHERE room_id = ? AND is_recalled = 0 ORDER BY id DESC LIMIT 1',
      [roomId]
    );

    const otherRead = !lastMessage || otherMember.last_read_message_id >= lastMessage.id;
    const myRead = !lastMessage || myMember.last_read_message_id >= lastMessage.id;

    return {
      otherUserId: otherMember.user_id,
      otherRead,
      myRead,
      lastMessageId: lastMessage ? lastMessage.id : 0
    };
  },

  getLastReadMessageId: (roomId, userId) => {
    const result = get(
      'SELECT last_read_message_id FROM room_members WHERE room_id = ? AND user_id = ?',
      [roomId, userId]
    );
    return result ? result.last_read_message_id : 0;
  }
};

module.exports = {
  initDatabase,
  ...dbOperations
};
