class SocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.lastSyncTime = null;
    this.eventHandlers = {};
    this.joinedRooms = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const token = getToken();
      if (!token) {
        reject(new Error('未登录'));
        return;
      }

      if (this.socket && this.socket.connected) {
        resolve();
        return;
      }

      this.socket = io({
        auth: { token },
        reconnection: false,
        pingTimeout: 60000,
        pingInterval: 25000
      });

      this.socket.on('connect', () => {
        console.log('Socket连接成功');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.trigger('connect');
        this.showConnectionStatus('connected', '连接成功');
        
        this.joinedRooms.forEach(roomId => {
          this.joinRoom(roomId);
        });

        this.syncOfflineMessages();
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Socket断开:', reason);
        this.connected = false;
        this.trigger('disconnect', reason);
        this.showConnectionStatus('disconnected', '连接断开');
        
        if (reason === 'io server disconnect' || reason === 'io client disconnect') {
          return;
        }

        this.tryReconnect();
      });

      this.socket.on('connect_error', (error) => {
        console.error('连接错误:', error);
        this.connected = false;
        this.trigger('connect_error', error);
        this.tryReconnect();
      });

      this.socket.on('error', (error) => {
        console.error('Socket错误:', error);
        this.trigger('error', error);
      });

      this.socket.on('new_message', (data) => {
        this.trigger('new_message', data);
      });

      this.socket.on('message_recalled', (data) => {
        this.trigger('message_recalled', data);
      });

      this.socket.on('room_joined', (data) => {
        this.joinedRooms.add(data.room.id);
        this.trigger('room_joined', data);
      });

      this.socket.on('user_joined', (data) => {
        this.trigger('user_joined', data);
      });

      this.socket.on('user_left', (data) => {
        this.trigger('user_left', data);
      });

      this.socket.on('online_users', (data) => {
        this.trigger('online_users', data);
      });

      this.socket.on('user_status', (data) => {
        this.trigger('user_status', data);
      });

      this.socket.on('user_typing', (data) => {
        this.trigger('user_typing', data);
      });

      this.socket.on('mention_notification', (data) => {
        this.trigger('mention_notification', data);
      });

      this.socket.on('offline_messages', (data) => {
        this.lastSyncTime = data.syncTime;
        localStorage.setItem('last_sync_time', data.syncTime);
        this.trigger('offline_messages', data);
      });
    });
  }

  tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showConnectionStatus('disconnected', '连接失败，请刷新页面重试');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    this.showConnectionStatus('reconnecting', `重连中... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (!this.connected) {
        this.connect().catch(err => {
          console.error('重连失败:', err);
        });
      }
    }, Math.min(delay, 30000));
  }

  showConnectionStatus(type, message) {
    let statusBar = document.querySelector('.connection-status');
    if (!statusBar) {
      statusBar = document.createElement('div');
      statusBar.className = `connection-status ${type}`;
      document.body.appendChild(statusBar);
    }
    
    statusBar.className = `connection-status ${type} show`;
    statusBar.textContent = message;

    if (type === 'connected') {
      setTimeout(() => {
        statusBar.classList.remove('show');
      }, 2000);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.joinedRooms.clear();
  }

  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
  }

  trigger(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`事件处理错误 [${event}]:`, err);
        }
      });
    }
  }

  emitRoomUpdated(roomId, room) {
    if (this.socket && this.connected) {
      this.socket.emit('room_updated', { roomId, room });
    }
  }

  emitMemberRemoved(roomId, userId) {
    if (this.socket && this.connected) {
      this.socket.emit('member_removed', { roomId, userId });
    }
  }

  joinRoom(roomId, lastMessageId = 0) {
    if (this.socket && this.connected) {
      this.socket.emit('join_room', { roomId, lastMessageId });
    }
  }

  leaveRoom(roomId) {
    if (this.socket && this.connected) {
      this.socket.emit('leave_room', { roomId });
      this.joinedRooms.delete(roomId);
    }
  }

  sendMessage(roomId, type, content, fileName, fileSize, fileUrl, mentions) {
    if (this.socket && this.connected) {
      this.socket.emit('send_message', {
        roomId, type, content, fileName, fileSize, fileUrl, mentions });
    }
  }

  recallMessage(messageId) {
    if (this.socket && this.connected) {
      this.socket.emit('recall_message', { messageId });
    }
  }

  markRead(roomId, messageId) {
    if (this.socket && this.connected) {
      this.socket.emit('mark_read', { roomId, messageId });
    }
  }

  syncOfflineMessages() {
    if (this.socket && this.connected) {
      const lastSyncTime = this.lastSyncTime || parseInt(localStorage.getItem('last_sync_time')) || null;
      this.socket.emit('sync_offline_messages', { lastSyncTime });
    }
  }

  getOnlineUsers(roomId) {
    if (this.socket && this.connected) {
      this.socket.emit('get_online_users', { roomId });
    }
  }

  sendTyping(roomId, isTyping) {
    if (this.socket && this.connected) {
      this.socket.emit('typing', { roomId, isTyping });
    }
  }
}

const socketClient = new SocketClient();
