const jwt = require('jsonwebtoken');
const db = require('../db/database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = db.getUserById(user.id);
    if (!dbUser) {
      return res.status(401).json({ error: '用户不存在' });
    }
    req.user = dbUser;
    next();
  } catch (err) {
    return res.status(403).json({ error: '无效的认证令牌' });
  }
}

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('未提供认证令牌'));
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = db.getUserById(user.id);
    if (!dbUser) {
      return next(new Error('用户不存在'));
    }
    socket.user = dbUser;
    next();
  } catch (err) {
    next(new Error('无效的认证令牌'));
  }
}

module.exports = { authenticateToken, authenticateSocket };
