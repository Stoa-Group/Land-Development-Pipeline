/**
 * Configuration for Deal Pipeline Dashboard (Frontend)
 * 
 * IMPORTANT: This is a FRONTEND configuration file.
 * 
 * The following .env variables are BACKEND-ONLY and should NOT be in this file:
 * - DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, DB_ENCRYPT (database credentials)
 * - JWT_SECRET, JWT_EXPIRES_IN (JWT secrets - backend only)
 * - PORT (server port - backend only)
 * 
 * These belong in your backend API server's .env, not here!
 * 
 * This frontend only needs:
 * - API_BASE_URL (the URL where your backend API is hosted)
 * - Optional: Feature flags, debug settings, etc.
 */

// API Configuration
// Set this to your backend API server URL
// If your backend runs on a different port locally, use: 'http://localhost:YOUR_PORT'
window.API_BASE_URL = window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com';

// Optional: Frontend-only configuration
// These are safe to expose in the browser
window.APP_CONFIG = window.APP_CONFIG || {
    API_BASE_URL: window.API_BASE_URL,
    // Add frontend-only config here (feature flags, debug mode, etc.)
    // DEBUG_MODE: false,
    // ENABLE_LOGGING: true,
};
