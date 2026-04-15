const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const logger = require('./utils/logger');
const OtpController = require('./controllers/otp');
dotenv.config(); 

// Import Routes
const signupRoutes = require('./routes/signup');
const loginRoutes = require('./routes/login');
const approvalRoutes = require('./routes/approval');
const userRoutes = require('./routes/user');
const masterRoutes = require('./routes/master');
const archiveRoutes = require('./routes/archive');
const stockEntryRoutes = require('./routes/stockEntry');
const forgotPasswordRoutes = require('./routes/forgotPassword');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const app = express();
const frontendPath = path.join(__dirname, 'dist');

// JSON parsing for API routes
app.use(express.json());

// Serve static frontend files
app.use(express.static(frontendPath, {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// --- API ROUTES ---
app.use('/api/auth', signupRoutes);
app.use('/api/auth', loginRoutes);
app.use('/api/auth', approvalRoutes);
app.use('/api/auth/forgot-password', forgotPasswordRoutes);
app.use('/api/user', userRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/stock', stockEntryRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch-all: serve React app for all non-API routes (SPA routing)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;

// Auto-cleanup expired OTPs every minute
setInterval(async () => {
  try {
    await OtpController.cleanupExpired();
  } catch (error) {
    logger.error('OTP cleanup error:', error);
  }
}, 60000);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});