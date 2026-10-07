// Handles user and admin login: verifies credentials with Firebase, generates JWT tokens, and tracks login activity.

const { auth } = require('../config/firebase');
const { generateToken } = require('../utils/jwt');
const UserService = require('../services/User');
const loginActivityService = require('../services/loginActivityService');
const logger = require('../utils/logger');
const https = require('https');
const http = require('http');

// Login user with Firebase Authentication
exports.login = async (req, res) => {
  try {
    const { userId, password } = req.body;

    // Validate required fields
    if (!userId || !password) {
      return res.status(400).json({
        message: 'User ID and password are required'
      });
    }

    // Step 1: Find user by userId
    const user = await UserService.findByUserId(userId);
    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }
    // Step 2: Verify user exists in Firebase Auth
    try {
      await auth.getUserByEmail(user.email);
    } catch (authError) {
      console.error('Firebase Auth user not found:', authError);
      return res.status(401).json({
        message: 'Invalid credentials - user not found in authentication system'
      });
    }
    // Step 3: Verify password using Firebase REST API
    const firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY;

    if (!firebaseApiKey) {
      logger.error('Firebase API key not configured. Please set FIREBASE_API_KEY environment variable.');
      return res.status(500).json({
        message: 'Server configuration error. Please contact administrator.',
        error: 'Firebase API key not configured'
      });
    }

    // Verify password using Firebase Auth REST API with https module
    const signInResult = await verifyPasswordWithFirebase(user.email, password, firebaseApiKey);
    
    if (!signInResult.success) {
      console.error('Firebase sign-in failed:', signInResult.error);
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // Step 4: Generate JWT token
    const token = generateToken(
      user.userId,
      user.email,
      user.role || 'employee',
      user.firstName || ''
    );

    // Step 5: Record login activity (non-blocking, ignore errors)
    try {
      await loginActivityService.recordLogin(user.userId);
    } catch (activityError) {
      // Log the error but don't fail the login
      console.warn('Failed to record login activity:', activityError.message);
      logger.warn('Login activity recording failed:', { 
        userId: user.userId, 
        error: activityError.message 
      });
    }

    // Step 6: Return success response
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'employee'
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    logger.error('Login Error Details:', { 
      message: error.message, 
      stack: error.stack,
      userId: req.body?.userId
    });
    res.status(500).json({
      message: 'Login failed. Please try again.',
      error: error.message
    });
  }
};

// Get user login sessions (activities)
exports.getUserSessions = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const activities = await loginActivityService.getUserActivities(userId, 5);

    res.status(200).json({
      userId,
      sessions: activities
    });

  } catch (error) {
    console.error('Get User Sessions Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function acts as a bridge between node.js and Firebase REST API to verify password
function verifyPasswordWithFirebase(email, password, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      email: email,
      password: password,
      returnSecureToken: true,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };

    // Local Auth emulator (FIREBASE_AUTH_EMULATOR_HOST) serves the same REST path over plain HTTP
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const options = emulatorHost
      ? {
          hostname: emulatorHost.split(':')[0],
          port: Number(emulatorHost.split(':')[1]),
          path: `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          method: 'POST',
          headers,
        }
      : {
          hostname: 'identitytoolkit.googleapis.com',
          path: `/v1/accounts:signInWithPassword?key=${apiKey}`,
          method: 'POST',
          headers,
        };

    const transport = emulatorHost ? http : https;
    const req = transport.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          
          if (res.statusCode === 200) {
            resolve({ success: true, data: parsedData });
          } else {
            resolve({ success: false, error: parsedData });
          }
        } catch (error) {
          reject(new Error(`Failed to parse Firebase response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Firebase authentication request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}
