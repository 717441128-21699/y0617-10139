const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('chat_token');
}

function setToken(token) {
  localStorage.setItem('chat_token', token);
}

function removeToken() {
  localStorage.removeItem('chat_token');
}

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

const api = {
  auth: {
    register: (username, password, nickname) => {
      return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, nickname })
      });
    },

    login: (username, password) => {
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
    },

    getProfile: () => {
      return request('/auth/profile');
    },

    updateProfile: (nickname, avatar) => {
      return request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ nickname, avatar })
      });
    },

    searchUsers: (keyword) => {
      return request(`/auth/users/search?keyword=${encodeURIComponent(keyword)}`);
    }
  },

  rooms: {
    getMyRooms: () => {
      return request('/rooms');
    },

    getPublicRooms: () => {
      return request('/rooms/public');
    },

    createRoom: (name, type, password) => {
      return request('/rooms/create', {
        method: 'POST',
        body: JSON.stringify({ name, type, password })
      });
    },

    joinRoom: (roomId, password) => {
      return request('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ roomId, password })
      });
    },

    createPrivateRoom: (targetUserId) => {
      return request('/rooms/private', {
        method: 'POST',
        body: JSON.stringify({ targetUserId })
      });
    },

    getMessages: (roomId, before = null, limit = 50) => {
      let url = `/rooms/${roomId}/messages?limit=${limit}`;
      if (before) {
        url += `&before=${before}`;
      }
      return request(url);
    },

    getMembers: (roomId) => {
      return request(`/rooms/${roomId}/members`);
    }
  },

  upload: {
    uploadFile: (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      const token = getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      return fetch(`${API_BASE}/upload/file`, {
        method: 'POST',
        headers,
        body: formData
      }).then(res => res.json()).then(data => {
        if (!data.fileUrl) {
          throw new Error(data.error || '上传失败');
        }
        return data;
      });
    }
  }
};
