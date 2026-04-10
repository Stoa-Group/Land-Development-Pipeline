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

// ============================================================
// RBAC — Role-based access control helpers
// ============================================================

window.getUserRole = function() {
  try {
    // Try the live state first (set by main.js after auth verify)
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) return currentUser.role;
    // Fallback: check localStorage
    var user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.role || 'ReadOnly';
  } catch(e) { return 'ReadOnly'; }
};

window.isAdmin = function() { return getUserRole() === 'Admin'; };
window.canEdit = function() { return ['Admin', 'Editor'].includes(getUserRole()); };

// ============================================================
// Notification bell
// ============================================================

window._notificationPollTimer = null;

window.toggleNotificationPanel = function() {
  var panel = document.getElementById('notification-panel');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadNotifications();
};

window.loadNotifications = function() {
  if (typeof API === 'undefined' || typeof API.getNotifications !== 'function') return;
  API.getNotifications().then(function(res) {
    var items = (res && res.data) || (Array.isArray(res) ? res : []);
    var badge = document.getElementById('notification-badge');
    var body = document.getElementById('notification-panel-body');
    var unread = items.filter(function(n) { return !n.read && !n.isRead; });
    if (badge) {
      badge.textContent = unread.length;
      badge.style.display = unread.length > 0 ? 'inline-flex' : 'none';
    }
    if (!body) return;
    if (items.length === 0) {
      body.innerHTML = '<div class="notification-empty">No notifications</div>';
      return;
    }
    var html = '';
    items.forEach(function(n) {
      var isRead = n.read || n.isRead;
      var timeStr = '';
      if (n.createdAt || n.timestamp) {
        try {
          var d = new Date(n.createdAt || n.timestamp);
          var now = new Date();
          var diffMs = now - d;
          var mins = Math.floor(diffMs / 60000);
          if (mins < 60) timeStr = mins + 'm ago';
          else if (mins < 1440) timeStr = Math.floor(mins / 60) + 'h ago';
          else timeStr = Math.floor(mins / 1440) + 'd ago';
        } catch(e) {}
      }
      html += '<div class="notification-item' + (isRead ? '' : ' notification-unread') + '" data-notification-id="' + (n.id || n.notificationId || '') + '">' +
        '<div class="notification-item-text">' + (typeof escapeHtml === 'function' ? escapeHtml(n.message || n.title || '') : (n.message || n.title || '')) + '</div>' +
        (timeStr ? '<div class="notification-item-time">' + timeStr + '</div>' : '') +
        '</div>';
    });
    body.innerHTML = html;
    // Click to mark single notification read
    body.querySelectorAll('.notification-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var nId = el.getAttribute('data-notification-id');
        if (nId && typeof API.markNotificationRead === 'function') {
          API.markNotificationRead(nId).then(function() { loadNotifications(); }).catch(function() {});
        }
      });
    });
  }).catch(function() {});
};

window.markAllNotificationsRead = function() {
  if (typeof API === 'undefined' || typeof API.markAllNotificationsRead !== 'function') return;
  API.markAllNotificationsRead().then(function() {
    loadNotifications();
    if (typeof showToast === 'function') showToast('All notifications marked as read', 'success');
  }).catch(function(err) {
    if (typeof showToast === 'function') showToast('Failed to mark notifications read', 'error');
  });
};

window.initNotificationPolling = function() {
  // Show bell only when authenticated
  var bellWrap = document.getElementById('notification-bell');
  if (bellWrap) bellWrap.style.display = '';
  loadNotifications();
  if (window._notificationPollTimer) clearInterval(window._notificationPollTimer);
  window._notificationPollTimer = setInterval(loadNotifications, 60000);
};

window.stopNotificationPolling = function() {
  if (window._notificationPollTimer) { clearInterval(window._notificationPollTimer); window._notificationPollTimer = null; }
  var bellWrap = document.getElementById('notification-bell');
  if (bellWrap) bellWrap.style.display = 'none';
};

// Close notification panel when clicking outside
document.addEventListener('click', function(e) {
  var bellWrap = document.getElementById('notification-bell');
  var panel = document.getElementById('notification-panel');
  if (panel && bellWrap && panel.style.display !== 'none' && !bellWrap.contains(e.target)) {
    panel.style.display = 'none';
  }
});

// ============================================================
// Pull-to-refresh (mobile only)
// ============================================================

(function() {
  var PTR_THRESHOLD = 60;
  var _ptrStartY = 0;
  var _ptrCurrentY = 0;
  var _ptrActive = false;
  var _ptrIndicator = null;

  function _isMobile() {
    return window.IS_MOBILE || window.innerWidth <= 768;
  }

  function _getIndicator() {
    if (!_ptrIndicator) {
      _ptrIndicator = document.createElement('div');
      _ptrIndicator.className = 'ptr-indicator';
      _ptrIndicator.innerHTML = '<span class="ptr-spinner"></span><span class="ptr-text">Pull to refresh</span>';
      _ptrIndicator.style.cssText = 'position:fixed;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--primary-green,#7e8a6b);color:#fff;font-size:13px;font-weight:500;z-index:9999;transform:translateY(-100%);transition:transform 0.2s ease;';
      document.body.appendChild(_ptrIndicator);
    }
    return _ptrIndicator;
  }

  function _isScrolledToTop() {
    // Check if the active scrollable area is at the top
    var mobileContent = document.getElementById('mobile-content');
    if (mobileContent) {
      var scrollable = mobileContent.querySelector('.mobile-deals-pane:not([style*="display: none"])') ||
                       mobileContent.querySelector('.mobile-more-pane:not([style*="display: none"])');
      if (scrollable) return scrollable.scrollTop <= 0;
    }
    return window.scrollY <= 0 || document.documentElement.scrollTop <= 0;
  }

  document.addEventListener('touchstart', function(e) {
    if (!_isMobile()) return;
    if (!_isScrolledToTop()) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrActive = true;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!_ptrActive || !_isMobile()) return;
    _ptrCurrentY = e.touches[0].clientY;
    var diff = _ptrCurrentY - _ptrStartY;
    if (diff < 0) { _ptrActive = false; return; }
    if (!_isScrolledToTop()) { _ptrActive = false; return; }

    var indicator = _getIndicator();
    var progress = Math.min(diff / PTR_THRESHOLD, 1);
    indicator.style.transform = 'translateY(' + ((progress * 100) - 100) + '%)';
    var textEl = indicator.querySelector('.ptr-text');
    if (textEl) textEl.textContent = diff >= PTR_THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (!_ptrActive) return;
    _ptrActive = false;
    var diff = _ptrCurrentY - _ptrStartY;
    var indicator = _getIndicator();

    if (diff >= PTR_THRESHOLD) {
      var textEl = indicator.querySelector('.ptr-text');
      if (textEl) textEl.textContent = 'Refreshing...';
      indicator.style.transform = 'translateY(0)';

      // Trigger data reload
      var reloaded = false;
      if (typeof init === 'function') { init(); reloaded = true; }
      else if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined') {
        switchView(currentView, allDeals);
        reloaded = true;
      }
      if (!reloaded && typeof showToast === 'function') showToast('Refreshed', 'info');

      setTimeout(function() {
        indicator.style.transform = 'translateY(-100%)';
      }, 1200);
    } else {
      indicator.style.transform = 'translateY(-100%)';
    }
    _ptrCurrentY = 0;
    _ptrStartY = 0;
  }, { passive: true });
})();

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
