/**
 * main.js — ES module entry point for Deal Pipeline Dashboard
 *
 * Load order (index.html):
 *   1. config.js         (plain script, sets window.API_BASE_URL)
 *   2. api-client.js     (plain script, sets window.API)
 *   3. globals.js        (plain script, window.* stubs for inline onclick handlers)
 *   4. domo.js ryuu      (plain script, sets window.domo)
 *   5. main.js           (type="module", this file)
 *
 * Responsibilities:
 *   - Import all ES modules and wire them together
 *   - Expose necessary globals on window (for backward-compat inline handlers)
 *   - Run init() on DOMContentLoaded
 */

import { state, STAGE_CONFIG, STAGE_DISPLAY_ORDER, DEFAULT_EXCLUDED_STAGES } from './modules/core/state.js';
import {
    _dpLog, _dpInfo, _dpWarn, _dpError,
    showToast, domoConfirm, animateModalClose, showError,
    formatDate, parseLocalDateOnly, toNormalizedDateString, isOverdue, debounce
} from './modules/core/utils.js';
import { getDomoQuick, waitForDomo, getAlias, getDomoCurrentUser } from './modules/data/domo.js';
import {
    normalizeStage, normalizeBankName, buildBankNameMap, getCanonicalBankName,
    getDealLocation, getDealState, getDealProductType,
    parseNotes, deduplicateDbDealsByDealPipelineId, mapDealPipelineDataToDeal,
    applyFilters, sortDeal, applySorting, groupDealsByStage, groupDealsByYear,
    calculateSummary, computeYieldOnCostForDeals
} from './modules/data/transforms.js';
import {
    buildProcoreMatches, syncProcoreDataToDatabase,
    isProcoreStartDateOverride, fuzzyMatchProjectName, extractStateAbbreviation
} from './modules/data/domo.js';
import { loadAllDeals, refreshDealsFromApi as _refreshDealsFromApi, loadProcoreData } from './modules/data/loaders.js';
import {
    updateAuthUI, updateEditModeUI, toggleEditMode, handleLogin, tryDomoSsoLogin,
    updateOtherAdminsViewingUI, startPresence, stopPresence, initAuthUI
} from './modules/auth/auth.js';
import {
    updateFiltersUI, updateSortUI, getActiveFilters, renderActiveFilters,
    clearFilters as _clearFilters, initStageFilterDropdowns
} from './modules/ui/filters.js';
import {
    renderDealRow, renderDealRowCompact, renderStageGroup,
    renderDealListByLocation, renderDealListByStage, renderDealList,
    updateVisibleDealCount, renderMobileDealCards
} from './modules/ui/deal-list.js';

/* ============================================================
   WIRE GLOBALS — so inline onclick="" attributes and legacy
   app code that references globals continue to work.
   ============================================================ */

// Core globals
window.allDeals = state.allDeals;
window.PROCORE_MATCHES = window.PROCORE_MATCHES || new Map();

// Debug helpers
window._dpLog = _dpLog;
window._dpInfo = _dpInfo;
window._dpWarn = _dpWarn;
window._dpError = _dpError;

// Toast / confirm
window.showToast = showToast;
window.domoConfirm = domoConfirm;
window.animateModalClose = animateModalClose;
window.showError = showError;

// Date utils
window.formatDate = formatDate;
window.parseLocalDateOnly = parseLocalDateOnly;
window.toNormalizedDateString = toNormalizedDateString;
window.isOverdue = isOverdue;

// Data transforms
window.normalizeStage = normalizeStage;
window.normalizeBankName = normalizeBankName;
window.buildBankNameMap = buildBankNameMap;
window.getCanonicalBankName = getCanonicalBankName;
window.getDealLocation = getDealLocation;
window.getDealState = getDealState;
window.getDealProductType = getDealProductType;
window.parseNotes = parseNotes;
window.deduplicateDbDealsByDealPipelineId = deduplicateDbDealsByDealPipelineId;
window.mapDealPipelineDataToDeal = mapDealPipelineDataToDeal;
window.applyFilters = applyFilters;
window.sortDeal = sortDeal;
window.applySorting = applySorting;
window.groupDealsByStage = groupDealsByStage;
window.groupDealsByYear = groupDealsByYear;
window.calculateSummary = calculateSummary;
window.computeYieldOnCostForDeals = computeYieldOnCostForDeals;

// Procore
window.buildProcoreMatches = buildProcoreMatches;
window.syncProcoreDataToDatabase = syncProcoreDataToDatabase;
window.isProcoreStartDateOverride = isProcoreStartDateOverride;
window.fuzzyMatchProjectName = fuzzyMatchProjectName;
window.extractStateAbbreviation = extractStateAbbreviation;
window.getDomoQuick = getDomoQuick;
window.waitForDomo = waitForDomo;
window.getAlias = getAlias;
window.getDomoCurrentUser = getDomoCurrentUser;

// Auth
window.updateAuthUI = updateAuthUI;
window.updateEditModeUI = updateEditModeUI;
window.toggleEditMode = toggleEditMode;

// Filters
window.updateFiltersUI = updateFiltersUI;
window.updateSortUI = updateSortUI;
window.renderActiveFilters = renderActiveFilters;
window.getActiveFilters = getActiveFilters;

// Wire the globals.js stubs to real implementations
window.__clearFilters = () => {
    _clearFilters();
};
window.__toggleMainStageDropdown = window.__toggleMainStageDropdown; // set by initStageFilterDropdowns
window.__toggleOverviewStageDropdown = window.__toggleOverviewStageDropdown; // set by initStageFilterDropdowns

// Deal list
window.renderDealRow = renderDealRow;
window.renderDealRowCompact = renderDealRowCompact;
window.renderStageGroup = renderStageGroup;
window.renderDealListByLocation = renderDealListByLocation;
window.renderDealListByStage = renderDealListByStage;
window.renderDealList = renderDealList;
window.updateVisibleDealCount = updateVisibleDealCount;
window.renderMobileDealCards = renderMobileDealCards;

// Expose state constants
window.STAGE_CONFIG = STAGE_CONFIG;
window.STAGE_DISPLAY_ORDER = STAGE_DISPLAY_ORDER;
window.DEFAULT_EXCLUDED_STAGES = DEFAULT_EXCLUDED_STAGES;

/* ============================================================
   STATE PROXY — keep window.allDeals / window.currentView etc.
   in sync with the state object (backwards compat for old code)
   ============================================================ */

// Proxy getters/setters so window.* mirrors state.*
Object.defineProperties(window, {
    isAuthenticated: {
        get: () => state.isAuthenticated,
        set: (v) => { state.isAuthenticated = v; },
        configurable: true
    },
    isEditMode: {
        get: () => state.isEditMode,
        set: (v) => { state.isEditMode = v; },
        configurable: true
    },
    currentUser: {
        get: () => state.currentUser,
        set: (v) => { state.currentUser = v; },
        configurable: true
    },
    currentView: {
        get: () => state.currentView,
        set: (v) => { state.currentView = v; },
        configurable: true
    },
    currentFilters: {
        get: () => state.currentFilters,
        set: (v) => { state.currentFilters = v; },
        configurable: true
    },
    currentSort: {
        get: () => state.currentSort,
        set: (v) => { state.currentSort = v; },
        configurable: true
    },
    blockSort: {
        get: () => state.blockSort,
        set: (v) => { state.blockSort = v; },
        configurable: true
    },
    listViewMode: {
        get: () => state.listViewMode,
        set: (v) => { state.listViewMode = v; },
        configurable: true
    },
    mapInstance: {
        get: () => state.mapInstance,
        set: (v) => { state.mapInstance = v; },
        configurable: true
    },
    contactsMapInstance: {
        get: () => state.contactsMapInstance,
        set: (v) => { state.contactsMapInstance = v; },
        configurable: true
    },
    mapMarkers: {
        get: () => state.mapMarkers,
        set: (v) => { state.mapMarkers = v; },
        configurable: true
    },
    visibleDealsForMap: {
        get: () => state.visibleDealsForMap,
        set: (v) => { state.visibleDealsForMap = v; },
        configurable: true
    },
    allMapMarkers: {
        get: () => state.allMapMarkers,
        set: (v) => { state.allMapMarkers = v; },
        configurable: true
    },
    isCityView: {
        get: () => state.isCityView,
        set: (v) => { state.isCityView = v; },
        configurable: true
    },
    currentCityView: {
        get: () => state.currentCityView,
        set: (v) => { state.currentCityView = v; },
        configurable: true
    },
    currentEditingDeal: {
        get: () => state.currentEditingDeal,
        set: (v) => { state.currentEditingDeal = v; },
        configurable: true
    },
    bankNameMap: {
        get: () => state.bankNameMap,
        set: (v) => { state.bankNameMap = v; },
        configurable: true
    },
    landDevelopmentContacts: {
        get: () => state.landDevelopmentContacts,
        set: (v) => { state.landDevelopmentContacts = v; },
        configurable: true
    },
    landDevelopmentContactFilters: {
        get: () => state.landDevelopmentContactFilters,
        set: (v) => { state.landDevelopmentContactFilters = v; },
        configurable: true
    },
    contactsViewMode: {
        get: () => state.contactsViewMode,
        set: (v) => { state.contactsViewMode = v; },
        configurable: true
    },
    timelineScrollPosition: {
        get: () => state.timelineScrollPosition,
        set: (v) => { state.timelineScrollPosition = v; },
        configurable: true
    },
    presenceHeartbeatId: {
        get: () => state.presenceHeartbeatId,
        set: (v) => { state.presenceHeartbeatId = v; },
        configurable: true
    },
    presencePollId: {
        get: () => state.presencePollId,
        set: (v) => { state.presencePollId = v; },
        configurable: true
    }
});

// Keep window.allDeals array in sync with state.allDeals (same reference)
Object.defineProperty(window, 'allDeals', {
    get: () => state.allDeals,
    set: (v) => {
        if (Array.isArray(v)) {
            state.allDeals.length = 0;
            v.forEach(d => state.allDeals.push(d));
        }
    },
    configurable: true
});

/* ============================================================
   INTERNAL WIRING — expose private functions to modules
   ============================================================ */

window.__switchView = function(view, deals) {
    if (typeof window.switchView === 'function') window.switchView(view, deals);
};
window.__setupDrillDownHandlers = function() {
    if (typeof window.setupDrillDownHandlers === 'function') window.setupDrillDownHandlers();
};
window.__renderTimeline = function(deals) {
    if (typeof window.renderTimeline === 'function') return window.renderTimeline(deals);
    return '';
};
window.__renderByProductType = function(deals) {
    if (typeof window.renderByProductType === 'function') return window.renderByProductType(deals);
    return '';
};
window.__renderByBank = async function(deals) {
    if (typeof window.renderByBank === 'function') return await window.renderByBank(deals);
    return '';
};
window.__rerenderForMobileLayout = function() {
    if (typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
};

/* ============================================================
   INIT — orchestrate bootstrap
   ============================================================ */

async function init() {
    // Mobile state
    if (typeof window.updateMobileState === 'function') window.updateMobileState();
    window.addEventListener('resize', typeof window.debouncedMobileResize === 'function' ? window.debouncedMobileResize : () => {});
    if (typeof window.initMobileLayout === 'function') window.initMobileLayout();

    // One-time UI setup
    initStageFilterDropdowns();
    if (typeof window.initMapFullscreenDelegation === 'function') window.initMapFullscreenDelegation();
    if (typeof window.initBackToTopButton === 'function') window.initBackToTopButton();

    const container = document.getElementById('deal-list-container');
    if (container) container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';

    // Wire globals.js stubs to real implementations
    window.__openDealEditModal = typeof window.openDealEditModal === 'function' ? window.openDealEditModal : null;
    window.__showDealDetail = typeof window.showDealDetail === 'function' ? window.showDealDetail : null;
    window.__showBankDetails = typeof window.showBankDetails === 'function' ? window.showBankDetails : null;
    window.__showContactModal = typeof window.showContactModal === 'function' ? window.showContactModal : null;
    window.__showSendReminderModal = typeof window.showSendReminderModal === 'function' ? window.showSendReminderModal : null;
    window.__showNotesModal = typeof window.showNotesModal === 'function' ? window.showNotesModal : null;
    window.__updateFullscreenDealsList = typeof window.updateFullscreenDealsList === 'function' ? window.updateFullscreenDealsList : null;
    window.__exitCityView = typeof window.exitCityView === 'function' ? window.exitCityView : null;
    window.__focusMapOnCity = typeof window.focusMapOnCity === 'function' ? window.focusMapOnCity : null;

    // Auth UI
    initAuthUI({
        showDealPipelineView: window.showDealPipelineView,
        hideDealPipelineView: window.hideDealPipelineView,
        renderDealPipelineTable: window.renderDealPipelineTable,
        filterDealPipelineTable: window.filterDealPipelineTable,
        saveAllDealPipelineRows: window.saveAllDealPipelineRows,
        openDealEditModal: window.openDealEditModal,
        closeDealEditModal: window.closeDealEditModal,
        handleDealSave: window.handleDealSave,
        handleDealDelete: window.handleDealDelete,
        exportPipelineToExcel: window.exportPipelineToExcel,
        initPreConManagerModal: window.initPreConManagerModal,
        initBrokerReferralModal: window.initBrokerReferralModal,
        showBankDetails: window.showBankDetails
    });

    // Check stored auth token
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
        API.setAuthToken(storedToken);
        try {
            const verifyResult = await API.verifyAuth();
            if (verifyResult.success) {
                state.isAuthenticated = true;
                state.currentUser = verifyResult.data.user;
                updateAuthUI();
            } else {
                localStorage.removeItem('authToken');
                API.clearAuthToken();
            }
        } catch (error) {
            console.warn('Stored token invalid:', error);
            localStorage.removeItem('authToken');
            API.clearAuthToken();
        }
    }

    // Load Procore data from Domo
    const procoreData = await loadProcoreData();
    state.DOMO = getDomoQuick();

    // Domo SSO
    await tryDomoSsoLogin();
    updateAuthUI();

    // Load deals from database
    try {
        const { allDeals, loansMap } = await loadAllDeals();

        // Procore sync in background
        if (procoreData.length > 0 && state.isAuthenticated) {
            const rawDbDeals = [];
            syncProcoreDataToDatabase(procoreData, rawDbDeals).catch(err => console.error('Procore sync error:', err));
        }

        // Update state (don't reassign window.allDeals — the proxy getter already returns state.allDeals)
        state.allDeals.length = 0;
        allDeals.forEach(d => state.allDeals.push(d));

        buildBankNameMap(state.allDeals);

        // Compute Yield on Cost (non-blocking)
        computeYieldOnCostForDeals(state.allDeals, loansMap).catch(e => console.warn('YoC computation error:', e));

        // Mobile filter toggle
        const mobileFilterToggleBtn = document.getElementById('mobile-filter-toggle');
        if (mobileFilterToggleBtn) {
            mobileFilterToggleBtn.addEventListener('click', function() {
                const fc = document.getElementById('filter-controls');
                const sc = document.getElementById('sort-controls');
                const expanded = this.getAttribute('aria-expanded') === 'true';
                const next = !expanded;
                this.setAttribute('aria-expanded', String(next));
                if (fc) fc.style.display = next ? 'flex' : 'none';
                if (sc) sc.style.display = next ? 'flex' : 'none';
            });
        }

        // Desktop keyboard shortcuts
        if (!window.IS_MOBILE) {
            document.addEventListener('keydown', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
                const deals = state.allDeals;
                const viewMap = { '1': 'overview', '2': 'list', '3': 'location', '4': 'product', '5': 'bank', '6': 'upcoming-dates', '7': 'contacts' };
                if (viewMap[e.key]) { e.preventDefault(); if (typeof window.switchView === 'function') window.switchView(viewMap[e.key], deals); return; }
                if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    const si = document.getElementById('search-filter') || document.getElementById('deal-pipeline-search');
                    if (si) { si.focus(); si.select(); }
                }
                if (e.key === 'Escape') {
                    const anyModal = document.querySelector('.modal-overlay[style*="flex"], .deal-detail-modal[style*="flex"]');
                    if (anyModal) { const closeBtn = anyModal.querySelector('.modal-close, .deal-detail-close'); if (closeBtn) closeBtn.click(); }
                }
            });
        }

        // Nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                if (typeof window.switchView === 'function') window.switchView(this.dataset.view, state.allDeals);
            });
        });

        const backToNavBtn = document.getElementById('back-to-nav-btn');
        if (backToNavBtn) {
            backToNavBtn.addEventListener('click', function() {
                if (typeof window.switchView === 'function') window.switchView('list', state.allDeals);
            });
        }

        if (state.allDeals.length > 0) {
            // Search input handler
            const searchInput = document.getElementById('search-filter');
            if (searchInput) {
                let searchDebounceTimer = null;
                searchInput.addEventListener('input', function() {
                    state.currentFilters.search = this.value.trim();
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = setTimeout(() => {
                        if (typeof window.isMobileLayout === 'function' && window.isMobileLayout()) {
                            if (typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
                        } else if (typeof window.switchView === 'function') {
                            window.switchView(state.currentView, state.allDeals);
                        }
                    }, 220);
                });
            }

            // Filter controls
            const filterControlsContainer = document.getElementById('filter-controls');
            if (filterControlsContainer) {
                filterControlsContainer.addEventListener('change', function(e) {
                    const isMobile = typeof window.isMobileLayout === 'function' && window.isMobileLayout();
                    const rerender = () => {
                        if (isMobile && typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
                        else if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
                    };
                    if (e.target.id === 'state-filter') { state.currentFilters.state = e.target.value; rerender(); }
                    else if (e.target.id === 'bank-filter') { state.currentFilters.bank = e.target.value; rerender(); }
                    else if (e.target.id === 'product-filter') { state.currentFilters.product = e.target.value; rerender(); }
                    else if (e.target.id === 'date-added-filter') {
                        state.currentFilters.dateAddedRange = e.target.value;
                        try { localStorage.setItem('dealPipeline_dateAddedDefault', e.target.value); } catch (e2) {}
                        rerender();
                    }
                });
            }

            // Stage filter dropdown trigger + close
            const stageTrigger = document.getElementById('stage-filter-trigger');
            const stagePanel = document.getElementById('stage-filter-dropdown-panel');
            const stageClearBtn = document.getElementById('stage-filter-clear-btn');
            if (stageTrigger && stagePanel) {
                stageTrigger.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const open = stagePanel.getAttribute('aria-hidden') !== 'true';
                    stagePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
                    stageTrigger.setAttribute('aria-expanded', !open);
                    stagePanel.style.display = open ? 'block' : 'none';
                });
                document.addEventListener('click', function(e) {
                    if (!stagePanel.contains(e.target) && e.target !== stageTrigger) {
                        stagePanel.setAttribute('aria-hidden', 'true');
                        stageTrigger.setAttribute('aria-expanded', 'false');
                        stagePanel.style.display = 'none';
                    }
                });
            }
            if (stageClearBtn) {
                stageClearBtn.addEventListener('click', function() {
                    state.currentFilters.stages = [];
                    updateFiltersUI();
                    if (stagePanel) { stagePanel.setAttribute('aria-hidden', 'true'); stagePanel.style.display = 'none'; }
                    if (stageTrigger) stageTrigger.setAttribute('aria-expanded', 'false');
                    if (typeof window.isMobileLayout === 'function' && window.isMobileLayout()) {
                        if (typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
                    } else if (typeof window.switchView === 'function') {
                        window.switchView(state.currentView, state.allDeals);
                    }
                });
            }

            // Sort controls
            const sortControlsContainer = document.getElementById('sort-controls');
            if (sortControlsContainer) {
                sortControlsContainer.addEventListener('change', function(e) {
                    const isMobile = typeof window.isMobileLayout === 'function' && window.isMobileLayout();
                    if (e.target.id === 'sort-by') {
                        state.currentSort.by = e.target.value;
                        window.listViewSort = window.listViewSort || {};
                        window.listViewSort.by = e.target.value;
                        if (isMobile && typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
                        else if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
                    } else if (e.target.id === 'sort-order') {
                        state.currentSort.order = e.target.value;
                        window.listViewSort = window.listViewSort || {};
                        window.listViewSort.order = e.target.value;
                        if (isMobile && typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
                        else if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
                    }
                });
            }

            // List view toggle buttons
            const listViewToggle = document.getElementById('list-view-toggle');
            if (listViewToggle) {
                listViewToggle.addEventListener('click', function(e) {
                    const btn = e.target.closest('.toggle-btn');
                    if (!btn) return;
                    state.listViewMode = btn.dataset.mode;
                    listViewToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.listViewMode));
                    if (typeof window.switchView === 'function') window.switchView('list', state.allDeals);
                });
            }

            updateFiltersUI();
            updateSortUI();

            const dc = document.getElementById('desktop-content');
            const ms = document.getElementById('mobile-shell');
            if (typeof window.isMobileLayout === 'function' && window.isMobileLayout()) {
                if (dc) dc.style.display = 'none';
                if (ms) { ms.style.display = ''; ms.removeAttribute('aria-hidden'); }
                if (typeof window.rerenderForMobileLayout === 'function') window.rerenderForMobileLayout();
            } else {
                if (dc) dc.style.display = '';
                if (ms) { ms.style.display = 'none'; ms.setAttribute('aria-hidden', 'true'); }
                if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
            }
        } else {
            if (typeof window.isMobileLayout === 'function' && window.isMobileLayout()) {
                const dc = document.getElementById('desktop-content');
                const ms = document.getElementById('mobile-shell');
                if (dc) dc.style.display = 'none';
                if (ms) { ms.style.display = ''; ms.removeAttribute('aria-hidden'); }
                renderMobileDealCards([]);
            }
            showError('No deals found in the database.', { showRetry: true });
        }
    } catch (error) {
        _dpError('Error loading deals:', error);
        showError(error?.message || error?.error?.message || 'Unknown error', { showRetry: true });
    }
}

// Also expose refreshDealsFromApi globally
window.refreshDealsFromApi = async function() {
    try {
        document.querySelectorAll('.deal-detail-modal').forEach(m => m.remove());
        document.querySelectorAll('.contacts-modal-overlay').forEach(m => m.remove());
        const { allDeals, loansMap } = await _refreshDealsFromApi();
        buildBankNameMap(state.allDeals);
        computeYieldOnCostForDeals(state.allDeals, loansMap).then(() => {
            if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
        }).catch(e => {
            console.warn('YoC refresh error:', e);
            if (typeof window.switchView === 'function') window.switchView(state.currentView, state.allDeals);
        });
        if (document.body.classList.contains('deal-pipeline-open') && typeof window.renderDealPipelineTable === 'function') {
            await window.renderDealPipelineTable({ forceApi: true });
        }
    } catch (e) { console.warn('refreshDealsFromApi failed:', e); }
};

// Expose init globally (needed by showError retry button)
window.init = init;

/* ============================================================
   BOOTSTRAP
   ============================================================ */

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
