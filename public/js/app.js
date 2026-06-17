const app = {
  currentUser: null,
  currentRoom: null,
  currentRoomMembers: [],
  rooms: [],
  publicRooms: [],
  roomMessages: new Map(),
  roomHasMore: new Map(),
  selectedAvatar: '👤',
  pendingJoinRoom: null,
  mentionIndex: 0,
  mentionList: null,
  mentionUsers: [],
  typingTimeout: null,
  isTyping: false,

  init() {
    this.bindEvents();
    this.checkAuth();
  },

  bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(`${tab}-form`).classList.add('active');
      });
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      this.logout();
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
      this.openSettingsModal();
    });

    document.getElementById('room-search').addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    document.getElementById('room-search').addEventListener('blur', () => {
      setTimeout(() => {
        document.getElementById('search-results').classList.remove('active');
      }, 200);
    });

    document.querySelectorAll('.room-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.dataset.type;
        document.querySelectorAll('.room-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderRoomList(type);
      });
    });

    document.getElementById('create-room-btn').addEventListener('click', () => {
      this.openCreateRoomModal();
    });

    document.getElementById('new-room-type').addEventListener('change', (e) => {
      document.getElementById('password-group').style.display = 
        e.target.value === 'private' ? 'block' : 'none';
    });

    document.getElementById('close-create-modal').addEventListener('click', () => {
      document.getElementById('create-room-modal').classList.add('hidden');
    });

    document.getElementById('cancel-create').addEventListener('click', () => {
      document.getElementById('create-room-modal').classList.add('hidden');
    });

    document.getElementById('confirm-create').addEventListener('click', () => {
      this.handleCreateRoom();
    });

    document.getElementById('close-join-modal').addEventListener('click', () => {
      document.getElementById('join-room-modal').classList.add('hidden');
    });

    document.getElementById('cancel-join').addEventListener('click', () => {
      document.getElementById('join-room-modal').classList.add('hidden');
    });

    document.getElementById('confirm-join').addEventListener('click', () => {
      this.handleJoinPrivateRoom();
    });

    document.getElementById('join-room-id-btn').addEventListener('click', () => {
      this.openJoinByIdModal();
    });

    document.getElementById('close-join-by-id-modal').addEventListener('click', () => {
      document.getElementById('join-by-id-modal').classList.add('hidden');
    });

    document.getElementById('cancel-join-by-id').addEventListener('click', () => {
      document.getElementById('join-by-id-modal').classList.add('hidden');
    });

    document.getElementById('join-by-id-roomid').addEventListener('input', (e) => {
      this.handleRoomIdInput(e.target.value);
    });

    document.getElementById('confirm-join-by-id').addEventListener('click', () => {
      this.handleJoinByIdRoom();
    });

    document.getElementById('close-settings-modal').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('cancel-settings').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('confirm-settings').addEventListener('click', () => {
      this.handleUpdateProfile();
    });

    document.querySelectorAll('.avatar-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
        e.target.classList.add('selected');
        this.selectedAvatar = e.target.dataset.avatar;
      });
    });

    document.getElementById('close-image-preview').addEventListener('click', () => {
      document.getElementById('image-preview-modal').classList.add('hidden');
    });

    document.getElementById('image-preview-modal').addEventListener('click', (e) => {
      if (e.target.id === 'image-preview-modal') {
        document.getElementById('image-preview-modal').classList.add('hidden');
      }
    });

    document.getElementById('members-btn').addEventListener('click', () => {
      document.getElementById('members-panel').classList.toggle('hidden');
    });

    document.getElementById('close-members').addEventListener('click', () => {
      document.getElementById('members-panel').classList.add('hidden');
    });

    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    document.getElementById('message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    document.getElementById('message-input').addEventListener('input', (e) => {
      this.autoResizeTextarea(e.target);
      this.handleInputMention(e);
      this.handleTyping();
    });

    document.getElementById('message-input').addEventListener('blur', () => {
      this.clearTyping();
      setTimeout(() => {
        if (this.mentionList) {
          this.mentionList.remove();
          this.mentionList = null;
        }
      }, 200);
    });

    document.getElementById('upload-file-btn').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('upload-image-btn').addEventListener('click', () => {
      document.getElementById('image-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.uploadFile(e.target.files[0], 'file');
      }
      e.target.value = '';
    });

    document.getElementById('image-input').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.uploadFile(e.target.files[0], 'image');
      }
      e.target.value = '';
    });

    document.getElementById('mention-btn').addEventListener('click', () => {
      const input = document.getElementById('message-input');
      input.value += '@';
      input.focus();
      this.handleInputMention({ target: input });
    });

    document.getElementById('chat-messages').addEventListener('scroll', (e) => {
      if (e.target.scrollTop === 0 && this.currentRoom) {
        this.loadMoreMessages();
      }
    });

    socketClient.on('new_message', (data) => {
      this.handleNewMessage(data);
    });

    socketClient.on('message_recalled', (data) => {
      this.handleMessageRecalled(data);
    });

    socketClient.on('room_joined', (data) => {
      this.handleRoomJoined(data);
    });

    socketClient.on('user_joined', (data) => {
      this.handleUserJoined(data);
    });

    socketClient.on('user_left', (data) => {
      this.handleUserLeft(data);
    });

    socketClient.on('online_users', (data) => {
      this.handleOnlineUsers(data);
    });

    socketClient.on('user_status', (data) => {
      this.handleUserStatus(data);
    });

    socketClient.on('user_typing', (data) => {
      this.handleUserTyping(data);
    });

    socketClient.on('mention_notification', (data) => {
      this.handleMentionNotification(data);
    });

    socketClient.on('offline_messages', (data) => {
      this.handleOfflineMessages(data);
    });

    socketClient.on('error', (data) => {
      this.showToast(data.message || '发生错误', 'error');
    });
  },

  async checkAuth() {
    const token = getToken();
    if (token) {
      try {
        const data = await api.auth.getProfile();
        this.currentUser = data.user;
        this.showChat();
        this.resetChatState();
        await this.loadRooms();
        await this.setupSocket();
        await this.ensureRoomSelected();
      } catch (err) {
        removeToken();
        this.showAuth();
      }
    } else {
      this.showAuth();
    }
  },

  showAuth() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
  },

  showChat() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('chat-container').classList.remove('hidden');
    document.getElementById('current-nickname').textContent = this.currentUser.nickname;
    document.getElementById('current-avatar').textContent = this.currentUser.avatar;
  },

  resetChatState() {
    document.getElementById('chat-title').textContent = '选择一个房间开始聊天';
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>选择左侧房间开始聊天</p>
      </div>
    `;
    document.getElementById('message-input').value = '';
  },

  async ensureRoomSelected() {
    if (this.currentRoom) {
      return;
    }

    const savedId = localStorage.getItem('current_room_id');
    if (savedId) {
      const savedRoom = this.rooms.find(r => r.id === parseInt(savedId));
      if (savedRoom) {
        await this.selectRoom(savedRoom.id, savedRoom.type);
        return;
      }
    }

    if (this.rooms.length > 0) {
      const first = this.rooms[0];
      await this.selectRoom(first.id, first.type);
    } else {
      this.resetChatState();
    }
  },

  async setupSocket() {
    try {
      await socketClient.connect();
    } catch (err) {
      console.error('Socket连接失败:', err);
    }
  },

  async handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      errorEl.textContent = '请填写用户名和密码';
      return;
    }

    try {
      const data = await api.auth.login(username, password);
      setToken(data.token);
      this.currentUser = data.user;
      this.showChat();
      this.resetChatState();
      await this.loadRooms();
      await this.setupSocket();
      await this.ensureRoomSelected();
      this.showToast('登录成功', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  async handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const nickname = document.getElementById('register-nickname').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorEl = document.getElementById('register-error');

    if (password !== confirm) {
      errorEl.textContent = '两次输入的密码不一致';
      return;
    }

    try {
      const data = await api.auth.register(username, password, nickname);
      setToken(data.token);
      this.currentUser = data.user;
      this.showChat();
      this.resetChatState();
      await this.loadRooms();
      await this.setupSocket();
      await this.ensureRoomSelected();
      this.showToast('注册成功', 'success');
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  logout() {
    removeToken();
    localStorage.removeItem('last_sync_time');
    socketClient.disconnect();
    this.currentUser = null;
    this.currentRoom = null;
    this.rooms = [];
    this.roomMessages.clear();
    this.showAuth();
    this.showToast('已退出登录', 'info');
  },

  async loadRooms() {
    try {
      const [myData, publicData] = await Promise.all([
        api.rooms.getMyRooms(),
        api.rooms.getPublicRooms()
      ]);
      this.rooms = myData.rooms;
      this.publicRooms = publicData.rooms;
      this.renderRoomList('rooms');
    } catch (err) {
      this.showToast('加载房间列表失败', 'error');
    }
  },

  renderRoomList(type) {
    const listEl = document.getElementById('room-list');
    const rooms = type === 'rooms' ? this.rooms : this.publicRooms;

    if (rooms.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #999;">
          <div style="font-size: 48px; margin-bottom: 12px;">💬</div>
          <p>${type === 'rooms' ? '还没有加入任何房间' : '暂无可加入的房间'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = rooms.map(room => {
      const isActive = this.currentRoom && this.currentRoom.id === room.id;
      const unread = room.unread_count > 0 ? `<span class="unread-badge">${room.unread_count}</span>` : '';
      
      let typeBadge = '';
      if (type === 'rooms') {
        typeBadge = room.type === 'private' 
          ? '<span class="room-type-badge private">私聊/私密</span>' 
          : '<span class="room-type-badge public">公开</span>';
      } else {
        if (room.has_password) {
          typeBadge = '<span class="room-type-badge private">🔐 密码房</span>';
        } else {
          typeBadge = '<span class="room-type-badge public">公开</span>';
        }
      }

      let joinBtn = '';
      if (type === 'public' && !room.is_member) {
        joinBtn = `<button class="btn btn-primary btn-small room-join-btn" data-room-id="${room.id}" data-room-type="${room.type}">加入</button>`;
      }

      return `
        <div class="room-item ${isActive ? 'active' : ''}" data-room-id="${room.id}" data-room-type="${room.type}">
          <div class="room-avatar">${room.name.charAt(0)}</div>
          <div class="room-info">
            <div class="room-name">${this.escapeHtml(room.name)}</div>
            <div class="room-last-message">${typeBadge}${room.member_count !== undefined ? `<span style="color: #999; margin-left: 8px;">${room.member_count}人</span>` : ''}</div>
          </div>
          <div class="room-meta">
            ${unread}
            ${joinBtn}
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.room-join-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomId = parseInt(btn.dataset.roomId);
        const roomType = btn.dataset.roomType;
        this.selectRoom(roomId, roomType);
      });
    });

    listEl.querySelectorAll('.room-item').forEach(item => {
      if (item.querySelector('.room-join-btn')) return;
      item.addEventListener('click', () => {
        const roomId = parseInt(item.dataset.roomId);
        const roomType = item.dataset.roomType;
        this.selectRoom(roomId, roomType);
      });
    });
  },

  async selectRoom(roomId, roomType) {
    let isMember = this.rooms.some(r => r.id === roomId);
    
    if (!isMember) {
      const publicRoom = this.publicRooms.find(r => r.id === roomId);
      const needsPassword = publicRoom && publicRoom.has_password;
      
      if (needsPassword) {
        this.pendingJoinRoom = roomId;
        document.getElementById('join-room-name').textContent = `房间: ${publicRoom.name}（密码房间）`;
        document.getElementById('join-room-modal').classList.remove('hidden');
        return;
      } else {
        try {
          await api.rooms.joinRoom(roomId);
          await this.loadRooms();
          isMember = true;
        } catch (err) {
          this.showToast(err.message || '加入房间失败', 'error');
          return;
        }
      }
    }

    const room = this.rooms.find(r => r.id === roomId);
    if (!room) {
      this.showToast('房间不存在', 'error');
      this.resetChatState();
      return;
    }

    this.currentRoom = room;
    localStorage.setItem('current_room_id', roomId.toString());
    
    document.getElementById('chat-title').textContent = room.name;
    document.getElementById('members-panel').classList.add('hidden');
    
    const messagesEl = document.getElementById('chat-messages');
    const cached = this.roomMessages.get(roomId);
    if (cached && cached.length > 0) {
      this.renderMessages(roomId);
    } else {
      messagesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <p>加载消息中...</p>
        </div>
      `;
    }
    
    if (room.unread_count && room.unread_count > 0) {
      room.unread_count = 0;
    }
    
    this.renderRoomList('rooms');
    
    try {
      await this.loadMessages(roomId);
    } catch (err) {
      this.showToast(err.message || '加载消息失败', 'error');
      messagesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <p>加载消息失败: ${this.escapeHtml(err.message || '未知错误')}</p>
        </div>
      `;
    }
    
    try {
      socketClient.joinRoom(roomId);
      socketClient.getOnlineUsers(roomId);
    } catch (err) {
      console.error('Socket加入房间失败:', err);
      this.showToast('实时连接异常，部分功能可能不可用', 'warning');
    }
  },

  async handleJoinPrivateRoom() {
    const password = document.getElementById('join-room-password').value;
    
    if (!this.pendingJoinRoom) return;

    try {
      await api.rooms.joinRoom(this.pendingJoinRoom, password);
      document.getElementById('join-room-modal').classList.add('hidden');
      document.getElementById('join-room-password').value = '';
      await this.loadRooms();
      await this.selectRoom(this.pendingJoinRoom, 'private');
      this.pendingJoinRoom = null;
      this.showToast('加入房间成功', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  openJoinByIdModal() {
    document.getElementById('join-by-id-roomid').value = '';
    document.getElementById('join-by-id-password').value = '';
    document.getElementById('join-by-id-password-group').style.display = 'none';
    document.getElementById('join-by-id-room-info').style.display = 'none';
    document.getElementById('join-by-id-room-info').innerHTML = '';
    this.pendingJoinByIdRoom = null;
    document.getElementById('join-by-id-modal').classList.remove('hidden');
  },

  async handleRoomIdInput(value) {
    const roomId = parseInt(value.trim());
    const passwordGroup = document.getElementById('join-by-id-password-group');
    const infoEl = document.getElementById('join-by-id-room-info');
    
    if (!roomId || roomId <= 0) {
      passwordGroup.style.display = 'none';
      infoEl.style.display = 'none';
      this.pendingJoinByIdRoom = null;
      return;
    }

    try {
      const data = await api.rooms.getRoomInfo(roomId);
      const room = data.room;
      this.pendingJoinByIdRoom = room;
      
      if (room.is_member) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<div style="color: #27ae60;">✅ 你已经是「${this.escapeHtml(room.name)}」的成员，可以直接进入</div>`;
        passwordGroup.style.display = 'none';
      } else if (room.has_password) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<div>房间：<strong>${this.escapeHtml(room.name)}</strong>（🔐 加密房间）</div>`;
        passwordGroup.style.display = 'block';
      } else {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<div>房间：<strong>${this.escapeHtml(room.name)}</strong>（公开房间）</div>`;
        passwordGroup.style.display = 'none';
      }
    } catch (err) {
      passwordGroup.style.display = 'none';
      infoEl.style.display = 'block';
      infoEl.innerHTML = `<div style="color: #e74c3c;">❌ ${this.escapeHtml(err.message)}</div>`;
      this.pendingJoinByIdRoom = null;
    }
  },

  async handleJoinByIdRoom() {
    if (!this.pendingJoinByIdRoom) {
      this.showToast('请输入有效的房间号', 'warning');
      return;
    }

    const { id, has_password, is_member } = this.pendingJoinByIdRoom;
    let password = null;

    if (has_password && !is_member) {
      password = document.getElementById('join-by-id-password').value;
      if (!password) {
        this.showToast('请输入访问密码', 'warning');
        return;
      }
    }

    try {
      await api.rooms.joinRoom(id, password);
      document.getElementById('join-by-id-modal').classList.add('hidden');
      await this.loadRooms();
      await this.selectRoom(id, this.pendingJoinByIdRoom.type);
      this.pendingJoinByIdRoom = null;
      this.showToast('加入房间成功', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async loadMessages(roomId) {
    const messagesEl = document.getElementById('chat-messages');
    
    try {
      const data = await api.rooms.getMessages(roomId);
      this.roomMessages.set(roomId, data.messages);
      this.roomHasMore.set(roomId, data.hasMore);
      this.renderMessages(roomId);
      
      if (data.messages.length > 0) {
        const lastMsgId = Math.max(...data.messages.map(m => m.id));
        socketClient.markRead(roomId, lastMsgId);
      }

      const room = this.rooms.find(r => r.id === roomId);
      if (room && room.unread_count && room.unread_count > 0) {
        room.unread_count = 0;
        this.renderRoomList('rooms');
      }
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (err) {
      this.showToast(err.message || '加载消息失败', 'error');
    }
  },

  async loadMoreMessages() {
    if (!this.currentRoom) return;
    
    const messages = this.roomMessages.get(this.currentRoom.id) || [];
    const hasMore = this.roomHasMore.get(this.currentRoom.id);
    
    if (!hasMore || messages.length === 0) return;

    const firstMsgId = Math.min(...messages.map(m => m.id));
    
    try {
      const data = await api.rooms.getMessages(this.currentRoom.id, firstMsgId);
      const allMessages = [...data.messages, ...messages];
      this.roomMessages.set(this.currentRoom.id, allMessages);
      this.roomHasMore.set(this.currentRoom.id, data.hasMore);
      
      const messagesEl = document.getElementById('chat-messages');
      const prevScrollHeight = messagesEl.scrollHeight;
      this.renderMessages(this.currentRoom.id);
      messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight;
    } catch (err) {
      console.error('加载更多失败:', err);
      this.showToast(err.message || '加载更多消息失败', 'error');
    }
  },

  renderMessages(roomId) {
    const messagesEl = document.getElementById('chat-messages');
    const messages = this.roomMessages.get(roomId) || [];
    const hasMore = this.roomHasMore.get(roomId);

    if (messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>开始聊天吧</p>
        </div>
      `;
      return;
    }

    let html = '';
    
    if (hasMore) {
      html += '<div class="load-more" onclick="app.loadMoreMessages()">加载更多消息</div>';
    }

    let lastDate = null;

    messages.forEach(msg => {
      const msgDate = new Date(msg.created_at).toLocaleDateString();
      if (msgDate !== lastDate) {
        html += `
          <div class="message-date">
            <span>${msgDate}</span>
          </div>
        `;
        lastDate = msgDate;
      }

      const isSelf = msg.user_id === this.currentUser.id;
      const canRecall = isSelf && !msg.is_recalled && (Date.now() - msg.created_at < 120000);
      
      html += this.renderMessageItem(msg, isSelf, canRecall);
    });

    messagesEl.innerHTML = html;

    messagesEl.querySelectorAll('.message-image').forEach(img => {
      img.addEventListener('click', (e) => {
        this.showImagePreview(e.target.src);
      });
    });

    messagesEl.querySelectorAll('.message-action-btn[data-action="recall"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const msgId = parseInt(e.target.dataset.messageId);
        this.recallMessage(msgId);
      });
    });
  },

  renderMessageItem(msg, isSelf, canRecall) {
    const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    let contentHtml = '';
    
    if (msg.is_recalled) {
      contentHtml = `<div class="message-recalled">消息已撤回</div>`;
    } else if (msg.type === 'image') {
      contentHtml = `<img class="message-image" src="${msg.file_url}" alt="${msg.file_name}">`;
    } else if (msg.type === 'file') {
      const size = this.formatFileSize(msg.file_size);
      contentHtml = `
        <a class="message-file" href="${msg.file_url}" download="${msg.file_name}" target="_blank">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">${this.escapeHtml(msg.file_name)}</div>
            <div class="file-size">${size}</div>
          </div>
        </a>
      `;
    } else {
      let text = this.escapeHtml(msg.content);
      if (msg.mentions && msg.mentions.length > 0) {
        msg.mentions.forEach(userId => {
          const member = this.currentRoomMembers.find(m => m.id === userId);
          if (member) {
            const mentionPattern = new RegExp(`@${member.nickname}`, 'g');
            text = text.replace(mentionPattern, `<span class="mention">@${member.nickname}</span>`);
          }
        });
      }
      contentHtml = `<div class="message-text">${text}</div>`;
    }

    const actionsHtml = canRecall ? `
      <div class="message-actions">
        <button class="message-action-btn" data-action="recall" data-message-id="${msg.id}">撤回</button>
      </div>
    ` : '';

    return `
      <div class="message-item ${isSelf ? 'self' : ''}" data-message-id="${msg.id}">
        <div class="message-avatar">${msg.user ? msg.user.avatar : '👤'}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">${msg.user ? this.escapeHtml(msg.user.nickname) : '用户'}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-bubble">
            ${contentHtml}
          </div>
          ${actionsHtml}
        </div>
      </div>
    `;
  },

  sendMessage() {
    if (!this.currentRoom) {
      this.showToast('请先选择一个房间', 'warning');
      return;
    }

    const input = document.getElementById('message-input');
    const content = input.value.trim();
    
    if (!content) return;

    if (!socketClient.isConnected()) {
      this.showToast('连接已断开，正在重连中...', 'warning');
      return;
    }

    const mentions = this.extractMentions(content);
    
    socketClient.sendMessage(
      this.currentRoom.id,
      'text',
      content,
      null,
      null,
      null,
      mentions.length > 0 ? mentions : null
    );

    input.value = '';
    this.autoResizeTextarea(input);
    this.clearTyping();
  },

  extractMentions(text) {
    const mentions = [];
    const mentionRegex = /@(\S+)/g;
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      const nickname = match[1];
      const member = this.currentRoomMembers.find(m => m.nickname === nickname);
      if (member && !mentions.includes(member.id)) {
        mentions.push(member.id);
      }
    }
    
    return mentions;
  },

  async uploadFile(file, type) {
    if (!this.currentRoom) {
      this.showToast('请先选择房间', 'warning');
      return;
    }

    try {
      this.showToast('上传中...', 'info');
      const data = await api.upload.uploadFile(file);
      
      socketClient.sendMessage(
        this.currentRoom.id,
        data.fileType,
        data.fileUrl,
        data.fileName,
        data.fileSize,
        data.fileUrl
      );
      
      this.showToast('上传成功', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  recallMessage(messageId) {
    if (confirm('确定要撤回这条消息吗？')) {
      socketClient.recallMessage(messageId);
    }
  },

  handleNewMessage(data) {
    const { roomId, message } = data;
    
    const messages = this.roomMessages.get(roomId) || [];
    if (!messages.find(m => m.id === message.id)) {
      messages.push(message);
      this.roomMessages.set(roomId, messages);
    }

    if (this.currentRoom && this.currentRoom.id === roomId) {
      this.renderMessages(roomId);
      const messagesEl = document.getElementById('chat-messages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
      socketClient.markRead(roomId, message.id);
    } else {
      const room = this.rooms.find(r => r.id === roomId);
      if (room) {
        room.unread_count = (room.unread_count || 0) + 1;
        this.renderRoomList('rooms');
      }
      
      if (message.user_id !== this.currentUser.id) {
        this.showToast(`新消息: ${message.user.nickname}`, 'info');
      }
    }
  },

  handleMessageRecalled(data) {
    const { roomId, messageId, message } = data;
    const messages = this.roomMessages.get(roomId) || [];
    const index = messages.findIndex(m => m.id === messageId);
    
    if (index !== -1) {
      messages[index] = message;
      this.roomMessages.set(roomId, messages);
      
      if (this.currentRoom && this.currentRoom.id === roomId) {
        this.renderMessages(roomId);
      }
    }
    
    this.showToast('消息已撤回', 'info');
  },

  handleRoomJoined(data) {
    this.currentRoomMembers = data.members;
    this.renderMembers();
  },

  handleUserJoined(data) {
    const { roomId, user } = data;
    
    if (!this.currentRoomMembers.find(m => m.id === user.id)) {
      this.currentRoomMembers.push({ ...user, online: true });
      this.renderMembers();
    }

    if (this.currentRoom && this.currentRoom.id === roomId && user.id !== this.currentUser.id) {
      this.showToast(`${user.nickname} 加入了房间`, 'info');
    }
  },

  handleUserLeft(data) {
    const { roomId, userId } = data;
    
    this.currentRoomMembers = this.currentRoomMembers.filter(m => m.id !== userId);
    const member = this.currentRoomMembers.find(m => m.id === userId);
    
    if (member && this.currentRoom && this.currentRoom.id === roomId) {
      this.showToast(`${member.nickname} 离开了房间`, 'info');
    }
    
    this.renderMembers();
  },

  handleOnlineUsers(data) {
    const { roomId, users } = data;
    
    if (this.currentRoom && this.currentRoom.id === roomId) {
      this.currentRoomMembers = users;
      this.renderMembers();
    }
  },

  handleUserStatus(data) {
    const { userId, online } = data;
    
    this.currentRoomMembers.forEach(member => {
      if (member.id === userId) {
        member.online = online;
      }
    });
    
    this.renderMembers();
  },

  handleUserTyping(data) {
    const { roomId, nickname, isTyping } = data;
    
    if (this.currentRoom && this.currentRoom.id === roomId) {
      const indicator = document.getElementById('typing-indicator');
      if (isTyping) {
        indicator.textContent = `${nickname} 正在输入...`;
      } else {
        indicator.textContent = '';
      }
    }
  },

  handleMentionNotification(data) {
    const { message, fromUser } = data;
    this.showToast(`${fromUser.nickname} @了你`, 'warning');
  },

  handleOfflineMessages(data) {
    const { messages } = data;
    
    if (messages.length > 0) {
      messages.forEach(msg => {
        const roomMessages = this.roomMessages.get(msg.room_id) || [];
        if (!roomMessages.find(m => m.id === msg.id)) {
          roomMessages.push(msg);
          this.roomMessages.set(msg.room_id, roomMessages);
        }
      });

      if (this.currentRoom) {
        this.renderMessages(this.currentRoom.id);
      }
    }

    this.refreshUnreadCounts();
    
    if (messages.length > 0) {
      this.showToast(`收到 ${messages.length} 条离线消息`, 'info');
    }
  },

  async refreshUnreadCounts() {
    try {
      const data = await api.rooms.getMyRooms();
      const freshRooms = data.rooms;
      
      freshRooms.forEach(freshRoom => {
        const localRoom = this.rooms.find(r => r.id === freshRoom.id);
        if (localRoom) {
          localRoom.unread_count = freshRoom.unread_count || 0;
        }
      });
      
      this.rooms = freshRooms;
      this.renderRoomList('rooms');
    } catch (err) {
      console.error('刷新未读计数失败:', err);
      this.showToast(err.message || '刷新未读失败', 'warning');
    }
  },

  renderMembers() {
    const listEl = document.getElementById('members-list');
    
    listEl.innerHTML = this.currentRoomMembers.map(member => {
      const statusClass = member.online ? 'online' : 'offline';
      const statusText = member.online ? '在线' : '离线';
      
      return `
        <div class="member-item" data-user-id="${member.id}">
          <div class="member-avatar">
            ${member.avatar}
            <span class="status-dot ${statusClass}"></span>
          </div>
          <div class="member-info">
            <div class="member-name">${this.escapeHtml(member.nickname)}</div>
            <div class="member-status">${statusText}</div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.member-item').forEach(item => {
      item.addEventListener('click', async () => {
        const userId = parseInt(item.dataset.userId);
        if (userId === this.currentUser.id) return;
        
        try {
          const data = await api.rooms.createPrivateRoom(userId);
          if (!this.rooms.find(r => r.id === data.room.id)) {
            this.rooms.push(data.room);
          }
          this.renderRoomList('rooms');
          await this.selectRoom(data.room.id, 'private');
          document.getElementById('members-panel').classList.add('hidden');
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    });
  },

  openCreateRoomModal() {
    document.getElementById('new-room-name').value = '';
    document.getElementById('new-room-type').value = 'public';
    document.getElementById('new-room-password').value = '';
    document.getElementById('password-group').style.display = 'none';
    document.getElementById('create-room-modal').classList.remove('hidden');
  },

  async handleCreateRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    const type = document.getElementById('new-room-type').value;
    const password = document.getElementById('new-room-password').value;

    if (!name) {
      this.showToast('请输入房间名称', 'warning');
      return;
    }

    if (type === 'private' && !password) {
      this.showToast('请设置访问密码', 'warning');
      return;
    }

    try {
      const data = await api.rooms.createRoom(name, type, password);
      this.rooms.unshift(data.room);
      this.renderRoomList('rooms');
      document.getElementById('create-room-modal').classList.add('hidden');
      await this.selectRoom(data.room.id, type);
      this.showToast('创建成功', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  openSettingsModal() {
    this.selectedAvatar = this.currentUser.avatar;
    document.getElementById('settings-nickname').value = this.currentUser.nickname;
    
    document.querySelectorAll('.avatar-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.avatar === this.selectedAvatar);
    });
    
    document.getElementById('settings-modal').classList.remove('hidden');
  },

  async handleUpdateProfile() {
    const nickname = document.getElementById('settings-nickname').value.trim();
    
    if (!nickname) {
      this.showToast('请输入昵称', 'warning');
      return;
    }

    try {
      const data = await api.auth.updateProfile(nickname, this.selectedAvatar);
      this.currentUser = data.user;
      document.getElementById('current-nickname').textContent = this.currentUser.nickname;
      document.getElementById('current-avatar').textContent = this.currentUser.avatar;
      document.getElementById('settings-modal').classList.add('hidden');
      this.showToast('更新成功', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async handleSearch(keyword) {
    const resultsEl = document.getElementById('search-results');
    
    if (!keyword) {
      resultsEl.classList.remove('active');
      resultsEl.innerHTML = '';
      return;
    }

    try {
      const data = await api.auth.searchUsers(keyword);
      
      if (data.users.length === 0) {
        resultsEl.innerHTML = '<div class="search-result-item">未找到用户</div>';
      } else {
        resultsEl.innerHTML = data.users.map(user => `
          <div class="search-result-item" data-user-id="${user.id}">
            <div class="avatar-small">${user.avatar}</div>
            <div>
              <div>${this.escapeHtml(user.nickname)}</div>
              <div style="font-size: 12px; color: #999;">@${this.escapeHtml(user.username)}</div>
            </div>
          </div>
        `).join('');

        resultsEl.querySelectorAll('.search-result-item[data-user-id]').forEach(item => {
          item.addEventListener('click', async () => {
            const userId = parseInt(item.dataset.userId);
            try {
              const data = await api.rooms.createPrivateRoom(userId);
              if (!this.rooms.find(r => r.id === data.room.id)) {
                this.rooms.push(data.room);
              }
              this.renderRoomList('rooms');
              await this.selectRoom(data.room.id, 'private');
            } catch (err) {
              this.showToast(err.message, 'error');
            }
            resultsEl.classList.remove('active');
            document.getElementById('room-search').value = '';
          });
        });
      }
      
      resultsEl.classList.add('active');
    } catch (err) {
      console.error('搜索失败:', err);
    }
  },

  handleInputMention(e) {
    const input = e.target;
    const text = input.value;
    const cursorPos = input.selectionStart;
    
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\S*)$/);
    
    if (mentionMatch && this.currentRoom) {
      const searchTerm = mentionMatch[1].toLowerCase();
      this.mentionUsers = this.currentRoomMembers.filter(m => 
        m.id !== this.currentUser.id && 
        m.nickname.toLowerCase().includes(searchTerm)
      );
      
      if (this.mentionUsers.length > 0) {
        this.showMentionList(input, mentionMatch.index);
      } else if (this.mentionList) {
        this.mentionList.remove();
        this.mentionList = null;
      }
    } else if (this.mentionList) {
      this.mentionList.remove();
      this.mentionList = null;
    }
  },

  showMentionList(input, startPos) {
    if (this.mentionList) {
      this.mentionList.remove();
    }

    this.mentionIndex = 0;
    
    this.mentionList = document.createElement('div');
    this.mentionList.className = 'mention-list';
    
    const rect = input.getBoundingClientRect();
    this.mentionList.style.left = `${rect.left}px`;
    this.mentionList.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    
    this.mentionList.innerHTML = this.mentionUsers.map((user, idx) => `
      <div class="mention-item ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        <div class="avatar-small">${user.avatar}</div>
        <span>${this.escapeHtml(user.nickname)}</span>
      </div>
    `).join('');
    
    document.body.appendChild(this.mentionList);
    
    this.mentionList.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(item.dataset.index);
        this.insertMention(input, this.mentionUsers[idx]);
      });
    });

    const keydownHandler = (e) => {
      if (!this.mentionList) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.mentionIndex = (this.mentionIndex + 1) % this.mentionUsers.length;
        this.updateMentionSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.mentionIndex = (this.mentionIndex - 1 + this.mentionUsers.length) % this.mentionUsers.length;
        this.updateMentionSelection();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (this.mentionUsers[this.mentionIndex]) {
          this.insertMention(input, this.mentionUsers[this.mentionIndex]);
        }
      } else if (e.key === 'Escape') {
        if (this.mentionList) {
          this.mentionList.remove();
          this.mentionList = null;
        }
      }
    };
    
    input.addEventListener('keydown', keydownHandler, { once: true });
  },

  updateMentionSelection() {
    if (!this.mentionList) return;
    
    this.mentionList.querySelectorAll('.mention-item').forEach((item, idx) => {
      item.classList.toggle('active', idx === this.mentionIndex);
    });
  },

  insertMention(input, user) {
    const text = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const textAfterCursor = text.substring(cursorPos);
    
    const newTextBefore = textBeforeCursor.replace(/@\S*$/, `@${user.nickname} `);
    input.value = newTextBefore + textAfterCursor;
    input.selectionStart = input.selectionEnd = newTextBefore.length;
    input.focus();
    
    if (this.mentionList) {
      this.mentionList.remove();
      this.mentionList = null;
    }
  },

  handleTyping() {
    if (!this.currentRoom) return;
    
    if (!this.isTyping) {
      this.isTyping = true;
      socketClient.sendTyping(this.currentRoom.id, true);
    }
    
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.clearTyping();
    }, 2000);
  },

  clearTyping() {
    if (this.isTyping && this.currentRoom) {
      this.isTyping = false;
      socketClient.sendTyping(this.currentRoom.id, false);
    }
    clearTimeout(this.typingTimeout);
  },

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  },

  showImagePreview(src) {
    document.getElementById('preview-image').src = src;
    document.getElementById('image-preview-modal').classList.remove('hidden');
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
