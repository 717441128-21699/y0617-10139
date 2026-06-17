const db = require('../db/database');

const onlineUsers = new Map();
const userRooms = new Map();

function setupSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`用户连接: ${user.nickname} (${user.id})`);

    onlineUsers.set(user.id, {
      ...user,
      socketId: socket.id,
      online: true
    });

    userRooms.set(user.id, new Set());

    io.emit('user_status', {
      userId: user.id,
      online: true
    });

    socket.on('join_room', async ({ roomId, lastMessageId = 0 }) => {
      try {
        const room = db.getRoomById(roomId);
        if (!room) {
          socket.emit('error', { message: '房间不存在' });
          return;
        }

        if (!db.isRoomMember(roomId, user.id)) {
          socket.emit('error', { message: '无权加入该房间，请先申请加入' });
          return;
        }

        socket.join(`room_${roomId}`);

        const userRoomSet = userRooms.get(user.id);
        if (userRoomSet) {
          userRoomSet.add(roomId);
        }

        const members = db.getRoomMembers(roomId);
        const onlineMembers = members.map(m => ({
          ...m,
          online: onlineUsers.has(m.id)
        }));

        const lastReadId = db.getLastReadMessageId(roomId, user.id);
        const unreadCount = await getUnreadCount(roomId, user.id);

        socket.emit('room_joined', {
          room,
          members: onlineMembers,
          lastReadId,
          unreadCount
        });

        io.to(`room_${roomId}`).emit('user_joined', {
          roomId,
          user: onlineUsers.get(user.id)
        });

        broadcastOnlineUsers(io, roomId);
      } catch (err) {
        console.error('加入房间错误:', err);
        socket.emit('error', { message: '加入房间失败' });
      }
    });

    socket.on('leave_room', ({ roomId }) => {
      socket.leave(`room_${roomId}`);
      const userRoomSet = userRooms.get(user.id);
      if (userRoomSet) {
        userRoomSet.delete(roomId);
      }

      io.to(`room_${roomId}`).emit('user_left', {
        roomId,
        userId: user.id
      });

      broadcastOnlineUsers(io, roomId);
    });

    socket.on('send_message', async ({ roomId, type, content, fileName, fileSize, fileUrl, mentions }) => {
      try {
        const room = db.getRoomById(roomId);
        if (!room) {
          socket.emit('error', { message: '房间不存在' });
          return;
        }

        if (!db.isRoomMember(roomId, user.id)) {
          socket.emit('error', { message: '无权在该房间发送消息' });
          return;
        }

        const message = db.createMessage(
          roomId,
          user.id,
          type,
          content,
          fileName,
          fileSize,
          fileUrl,
          mentions
        );

        db.updateLastReadMessage(roomId, user.id, message.id);

        io.to(`room_${roomId}`).emit('new_message', {
          roomId,
          message
        });

        if (mentions && mentions.length > 0) {
          mentions.forEach(mentionId => {
            const mentionUser = onlineUsers.get(mentionId);
            if (mentionUser && mentionUser.socketId) {
              io.to(mentionUser.socketId).emit('mention_notification', {
                roomId,
                message,
                fromUser: user
              });
            }
          });
        }
      } catch (err) {
        console.error('发送消息错误:', err);
        socket.emit('error', { message: '发送消息失败' });
      }
    });

    socket.on('recall_message', async ({ messageId }) => {
      try {
        const message = db.getMessageById(messageId);
        if (!message) {
          socket.emit('error', { message: '消息不存在' });
          return;
        }

        if (!db.isRoomMember(message.room_id, user.id)) {
          socket.emit('error', { message: '无权操作该房间的消息' });
          return;
        }

        if (message.user_id !== user.id) {
          socket.emit('error', { message: '只能撤回自己的消息' });
          return;
        }

        const recallWindow = parseInt(process.env.RECALL_WINDOW) || 120000;
        if (Date.now() - message.created_at > recallWindow) {
          socket.emit('error', { message: '超过撤回时间限制' });
          return;
        }

        if (message.is_recalled) {
          socket.emit('error', { message: '消息已撤回' });
          return;
        }

        const recalledMessage = db.recallMessage(messageId);

        io.to(`room_${message.room_id}`).emit('message_recalled', {
          roomId: message.room_id,
          messageId,
          message: recalledMessage
        });
      } catch (err) {
        console.error('撤回消息错误:', err);
        socket.emit('error', { message: '撤回失败' });
      }
    });

    socket.on('mark_read', ({ roomId, messageId }) => {
      if (db.isRoomMember(roomId, user.id)) {
        db.updateLastReadMessage(roomId, user.id, messageId);
      }
    });

    socket.on('sync_offline_messages', ({ lastSyncTime }) => {
      try {
        const sinceTime = lastSyncTime || user.last_online || (Date.now() - 7 * 24 * 60 * 60 * 1000);
        const messages = db.getUnreadMessages(user.id, sinceTime);

        socket.emit('offline_messages', {
          messages,
          syncTime: Date.now()
        });

        db.updateUserLastOnline(user.id);
      } catch (err) {
        console.error('同步离线消息错误:', err);
        socket.emit('error', { message: '同步离线消息失败' });
      }
    });

    socket.on('get_online_users', ({ roomId }) => {
      if (db.isRoomMember(roomId, user.id)) {
        broadcastOnlineUsers(io, roomId);
      }
    });

    socket.on('typing', ({ roomId, isTyping }) => {
      if (db.isRoomMember(roomId, user.id)) {
        socket.to(`room_${roomId}`).emit('user_typing', {
          roomId,
          userId: user.id,
          nickname: user.nickname,
          isTyping
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`用户断开: ${user.nickname} (${user.id})`);

      const userRoomSet = userRooms.get(user.id);
      if (userRoomSet) {
        userRoomSet.forEach(roomId => {
          io.to(`room_${roomId}`).emit('user_left', {
            roomId,
            userId: user.id
          });
          broadcastOnlineUsers(io, roomId);
        });
      }

      onlineUsers.delete(user.id);
      userRooms.delete(user.id);
      db.updateUserLastOnline(user.id);

      io.emit('user_status', {
        userId: user.id,
        online: false,
        lastOnline: Date.now()
      });
    });
  });
}

function broadcastOnlineUsers(io, roomId) {
  const room = db.getRoomById(roomId);
  if (!room) return;

  const members = db.getRoomMembers(roomId);
  const onlineMembers = members.map(m => ({
    ...m,
    online: onlineUsers.has(m.id)
  }));

  io.to(`room_${roomId}`).emit('online_users', {
    roomId,
    users: onlineMembers
  });
}

async function getUnreadCount(roomId, userId) {
  const lastReadId = db.getLastReadMessageId(roomId, userId);
  const messages = db.getMessages(roomId, null, 1000);
  return messages.filter(m => m.id > lastReadId && m.user_id !== userId).length;
}

function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

function getOnlineUser(userId) {
  return onlineUsers.get(userId);
}

module.exports = {
  setupSocket,
  isUserOnline,
  getOnlineUser
};
