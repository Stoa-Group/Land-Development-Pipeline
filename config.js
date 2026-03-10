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
// When on localhost: use Render API by default so static server works without running API locally.
// Add ?api=local to use local backend (port 3002) when running the API locally.
var defaultApi = 'https://stoagroupdb-ddre.onrender.com';
if (typeof window !== 'undefined' && window.location && /[?&]api=local\b/.test(window.location.search)) {
  defaultApi = 'http://localhost:3002';
}
window.API_BASE_URL = window.API_BASE_URL || defaultApi;

// Debug flag: set to true to enable console logging (Domo, Procore, API, etc.)
window.DEAL_PIPELINE_DEBUG = window.DEAL_PIPELINE_DEBUG || false;

// Optional: Frontend-only configuration
// These are safe to expose in the browser
window.APP_CONFIG = window.APP_CONFIG || {
    API_BASE_URL: window.API_BASE_URL,
    // Add frontend-only config here (feature flags, debug mode, etc.)
    // DEBUG_MODE: false,
    // ENABLE_LOGGING: true,
};
