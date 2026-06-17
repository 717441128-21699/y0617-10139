const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, (req, res) => {
  try {
    const rooms = db.getRoomsByUserId(req.user.id);
    res.json({ rooms });
  } catch (err) {
    console.error('获取房间列表错误:', err);
    res.status(500).json({ error: '获取房间列表失败' });
  }
});

router.get('/public', authenticateToken, (req, res) => {
  try {
    const rooms = db.getPublicRooms();
    res.json({ rooms });
  } catch (err) {
    console.error('获取公开房间错误:', err);
    res.status(500).json({ error: '获取公开房间失败' });
  }
});

router.post('/create', authenticateToken, (req, res) => {
  try {
    const { name, type = 'public', password } = req.body;

    if (!name || name.length < 1 || name.length > 50) {
      return res.status(400).json({ error: '房间名称长度应为1-50个字符' });
    }

    if (!['public', 'private'].includes(type)) {
      return res.status(400).json({ error: '无效的房间类型' });
    }

    const hashedPassword = type === 'private' && password ? bcrypt.hashSync(password, 10) : null;
    const room = db.createRoom(name, type, hashedPassword, req.user.id);

    res.json({ room });
  } catch (err) {
    console.error('创建房间错误:', err);
    res.status(500).json({ error: '创建房间失败' });
  }
});

router.post('/join', authenticateToken, (req, res) => {
  try {
    const { roomId, password } = req.body;

    const room = db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }

    if (room.type === 'private' && room.password) {
      if (!password || !bcrypt.compareSync(password, room.password)) {
        return res.status(403).json({ error: '房间密码错误' });
      }
    }

    db.addRoomMember(roomId, req.user.id);
    const members = db.getRoomMembers(roomId);

    res.json({ room, members });
  } catch (err) {
    console.error('加入房间错误:', err);
    res.status(500).json({ error: '加入房间失败' });
  }
});

router.post('/private', authenticateToken, (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json({ error: '无效的目标用户' });
    }

    const targetUser = db.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: '目标用户不存在' });
    }

    let room = db.getPrivateRoom(req.user.id, targetUserId);
    if (!room) {
      const roomName = `${req.user.nickname} 和 ${targetUser.nickname}`;
      room = db.createRoom(roomName, 'private', null, req.user.id);
      db.addRoomMember(room.id, targetUserId);
    }

    const members = db.getRoomMembers(room.id);
    res.json({ room, members });
  } catch (err) {
    console.error('创建私聊错误:', err);
    res.status(500).json({ error: '创建私聊失败' });
  }
});

router.get('/:roomId/messages', authenticateToken, (req, res) => {
  try {
    const { roomId } = req.params;
    const { before, limit = 50 } = req.query;

    const room = db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }

    const messages = db.getMessages(roomId, before ? parseInt(before) : null, parseInt(limit));
    const lastReadId = db.getLastReadMessageId(roomId, req.user.id);

    if (messages.length > 0) {
      const maxId = Math.max(...messages.map(m => m.id));
      if (maxId > lastReadId) {
        db.updateLastReadMessage(roomId, req.user.id, maxId);
      }
    }

    res.json({ messages, hasMore: messages.length >= limit });
  } catch (err) {
    console.error('获取消息错误:', err);
    res.status(500).json({ error: '获取消息失败' });
  }
});

router.get('/:roomId/members', authenticateToken, (req, res) => {
  try {
    const { roomId } = req.params;

    const room = db.getRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: '房间不存在' });
    }

    const members = db.getRoomMembers(roomId);
    res.json({ members });
  } catch (err) {
    console.error('获取成员错误:', err);
    res.status(500).json({ error: '获取成员失败' });
  }
});

module.exports = router;
