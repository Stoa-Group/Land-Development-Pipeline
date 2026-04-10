/**
 * globals.js — plain <script> (not a module) that runs BEFORE main.js
 * Provides window.* stubs that inline onclick="" handlers call.
 * Real implementations are wired by main.js after modules load.
 */

// HTML escape utility — prevents XSS when interpolating user data into innerHTML
window.escapeHtml = function(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};

// Stub: inline onclick="clearFilters()" in HTML calls this before main.js sets the real one
window.clearFilters = function() {
  if (window.__clearFilters) window.__clearFilters();
};

// Stub: stage dropdown toggles called from onclick= attributes
window.toggleMainStageDropdown = function() {
  if (window.__toggleMainStageDropdown) window.__toggleMainStageDropdown();
};

window.toggleOverviewStageDropdown = function() {
  if (window.__toggleOverviewStageDropdown) window.__toggleOverviewStageDropdown();
};

// Stub: deal edit modal called from inline handlers
window.openDealEditModal = function(deal) {
  if (window.__openDealEditModal) window.__openDealEditModal(deal);
};

// Stub: showDealDetail called from drilldown handlers
window.showDealDetail = function(deal) {
  if (window.__showDealDetail) window.__showDealDetail(deal);
};

// Stub: showBankDetails called from bank name clicks
window.showBankDetails = function(bankName, bankId) {
  if (window.__showBankDetails) window.__showBankDetails(bankName, bankId);
};

// Stub: showContactModal
window.showContactModal = function(contact) {
  if (window.__showContactModal) window.__showContactModal(contact);
};

// Stub: showSendReminderModal
window.showSendReminderModal = function(contact, email) {
  if (window.__showSendReminderModal) window.__showSendReminderModal(contact, email);
};

// Stub: showNotesModal
window.showNotesModal = function(dealName, notes) {
  if (window.__showNotesModal) window.__showNotesModal(dealName, notes);
};

// Stub: updateFullscreenDealsList
window.updateFullscreenDealsList = function() {
  if (window.__updateFullscreenDealsList) window.__updateFullscreenDealsList();
};

// Stub: exitCityView
window.exitCityView = function() {
  if (window.__exitCityView) window.__exitCityView();
};

// Stub: focusMapOnCity
window.focusMapOnCity = function(cityName) {
  if (window.__focusMapOnCity) window.__focusMapOnCity(cityName);
};

// Open external URL — escapes Domo's sandboxed iframe (allow-popups blocked)
window.openExternalUrl = function(url) {
  if (!url) return;
  try {
    // Try window.top first (escapes Domo sandbox)
    if (window.top && window.top !== window) {
      window.top.open(url, '_blank');
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    // Cross-origin top frame — fall back to copying URL
    try { navigator.clipboard.writeText(url); } catch (ignored) {}
    if (typeof showToast === 'function') {
      showToast('Link copied to clipboard — paste in a new tab to open.', 'info');
    } else {
      alert('Could not open link. URL copied to clipboard:\n' + url);
    }
  }
};

// Delegate click handler: intercept all external Asana links in Domo's sandbox
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[target="_blank"]');
  if (!link) return;
  var href = link.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  e.stopPropagation();
  window.openExternalUrl(href);
}, true);
