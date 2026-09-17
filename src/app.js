const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');
const jwtRoutes = require('./routes/jwt');

const app = express();

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', authRoutes);
app.use('/api', otpRoutes);
app.use('/api', jwtRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SecureID IAM Demo Web App',
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for non-API routes (SPA support)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
