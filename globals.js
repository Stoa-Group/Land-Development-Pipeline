/**
 * globals.js — plain <script> (not a module) that runs BEFORE main.js
 * Provides window.* stubs that inline onclick="" handlers call.
 * Real implementations are wired by main.js after modules load.
 */

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
