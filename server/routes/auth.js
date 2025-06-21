import express from 'express';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Mock users database
const mockUsers = {
  'netrunnerX': {
    id: 'netrunnerX',
    username: 'netrunnerX',
    role: 'contributor',
    password: 'password123' // In production, this would be hashed
  },
  'reliefAdmin': {
    id: 'reliefAdmin',
    username: 'reliefAdmin',
    role: 'admin',
    password: 'admin123' // In production, this would be hashed
  },
  'responder1': {
    id: 'responder1',
    username: 'responder1',
    role: 'contributor',
    password: 'responder123'
  }
};

// Mock authentication middleware
export function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.substring(7);
  const user = Object.values(mockUsers).find(u => u.id === token);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
  
  req.user = user;
  next();
}

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = mockUsers[username];
  
  if (!user || user.password !== password) {
    logger.warn(`Failed login attempt for username: ${username}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  logger.info(`User logged in: ${username}`);
  localStorage.setItem('token', response.data.token);
  // Return user ID as token (in production, use JWT)
  res.json({
    token: user.id,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  });
});

// Get current user
router.get('/me', authenticateUser, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    }
  });
});

export default router;