// modules/auth/auth.js — Login, JWT, admin check, presence
import { state } from '../core/state.js';
import { showToast, animateModalClose } from '../core/utils.js';
import { getDomoCurrentUser } from '../data/domo.js';

const $ = (sel, root) => (root || document).querySelector(sel);

/* ---------- Auth state helpers ---------- */

export function isAdmin() { return state.isAuthenticated; }

/* ---------- Auth UI update ---------- */

export function updateAuthUI() {
    const adminBadge = document.getElementById('admin-badge');
    const authActions = document.getElementById('auth-actions');
    const loginBtn = document.getElementById('login-btn');
    const dealPipelineBtn = document.getElementById('deal-pipeline-btn');
    const editModeBtn = document.getElementById('edit-mode-btn');
    const otherAdminsEl = document.getElementById('other-admins-viewing');

    if (state.isAuthenticated) {
        if (adminBadge) adminBadge.style.display = 'inline-flex';
        if (authActions) authActions.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';
        if (dealPipelineBtn) dealPipelineBtn.style.display = 'inline-block';
        if (editModeBtn) editModeBtn.style.display = 'inline-block';
        if (otherAdminsEl) {
            otherAdminsEl.style.display = 'inline-flex';
            updateOtherAdminsViewingUI([]);
            startPresence();
        }
    } else {
        if (adminBadge) adminBadge.style.display = 'none';
        if (dealPipelineBtn) dealPipelineBtn.style.display = 'none';
        if (editModeBtn) editModeBtn.style.display = 'none';
        if (otherAdminsEl) otherAdminsEl.style.display = 'none';
        stopPresence();
        state.isEditMode = false;
        updateEditModeUI();
        document.body.classList.remove('deal-pipeline-open');
        const dealPipelineView = document.getElementById('deal-pipeline-view');
        if (dealPipelineView) { dealPipelineView.style.display = 'none'; dealPipelineView.classList.remove('active'); }
        if (authActions) authActions.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'inline-block';
    }
}

export function updateEditModeUI() {
    const editModeBtn = document.getElementById('edit-mode-btn');
    if (editModeBtn) editModeBtn.textContent = state.isEditMode ? 'Exit Edit Mode' : 'Edit Mode';
    if (state.isEditMode) document.body.classList.add('edit-mode');
    else document.body.classList.remove('edit-mode');
}

export function toggleEditMode() {
    if (!state.isAuthenticated) { showToast('Please login first to enable edit mode.', 'info'); return; }
    state.isEditMode = !state.isEditMode;
    updateEditModeUI();
    showToast(state.isEditMode ? 'Edit Mode enabled. Click any deal to edit.' : 'Edit Mode disabled.', 'info');
    // Trigger re-render to show/hide edit buttons
    if (typeof window.__switchView === 'function') window.__switchView(state.currentView, state.allDeals);
}

/* ---------- Login ---------- */

export async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    try {
        const result = await API.login(username, password);
        if (result.success) {
            state.isAuthenticated = true;
            state.currentUser = result.data.user;
            localStorage.setItem('authToken', result.data.token);
            updateAuthUI();
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('login-form').reset();
        } else {
            throw new Error(result.error?.message || 'Login failed');
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    }
}

/* ---------- SSO Domo login ---------- */

export async function tryDomoSsoLogin() {
    if (state.isAuthenticated || !state.DOMO) return;
    try {
        const domoUser = await getDomoCurrentUser();
        if (domoUser && domoUser.email) {
            console.info('[Domo SSO] Calling backend with email:', domoUser.email);
            const result = await API.loginWithDomo(domoUser);
            if (result.success && result.data && result.data.token) {
                state.isAuthenticated = true;
                state.currentUser = result.data.user || { username: domoUser.email, email: domoUser.email, fullName: domoUser.name };
                localStorage.setItem('authToken', result.data.token);
                updateAuthUI();
                console.info('[Domo SSO] Success – ADMIN badge visible.');
            } else {
                console.warn('[Domo SSO] Backend did not return a token:', result && result.error ? result.error.message : result);
            }
        }
    } catch (err) {
        console.warn('[Domo SSO] Login skipped or failed:', err);
    }
}

/* ---------- Presence ---------- */

export function updateOtherAdminsViewingUI(users) {
    const el = document.getElementById('other-admins-viewing');
    if (!el) return;
    const me = state.currentUser;
    const meId = me && (me.userId ?? me.id ?? me.UserId);
    const meEmail = (me && (me.email || '')).toString().toLowerCase().trim();
    const others = (users || []).filter(u => {
        const uid = u.userId ?? u.id ?? u.user_id;
        const email = (u.email || '').toString().toLowerCase().trim();
        if (meId != null && uid != null && String(meId) === String(uid)) return false;
        if (meEmail && email && meEmail === email) return false;
        return true;
    });
    const names = others.map(u => u.userName || u.username || u.email || u.name || 'User').filter(Boolean);
    if (names.length === 0) {
        el.textContent = 'Only you viewing';
        el.classList.remove('other-admins-has-others');
        el.title = "You're the only one currently viewing this dashboard";
    } else {
        el.textContent = 'Also viewing: ' + names.join(', ');
        el.classList.add('other-admins-has-others');
        el.title = 'Currently viewing: ' + names.join(', ');
    }
}

export async function fetchAndUpdatePresence() {
    if (!state.isAuthenticated || !state.currentUser) return;
    const base = (typeof API !== 'undefined' && API.getApiBaseUrl) ? API.getApiBaseUrl() : (window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com');
    const token = (typeof API !== 'undefined' && API.getAuthToken) ? API.getAuthToken() : (typeof localStorage !== 'undefined' && localStorage.getItem('authToken'));
    try {
        const res = await fetch(base + '/api/pipeline/presence', { method: 'GET', headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
        if (!res.ok) { updateOtherAdminsViewingUI([]); return; }
        const data = await res.json();
        const users = (data && data.data && data.data.users) ? data.data.users : (Array.isArray(data.data) ? data.data : []);
        updateOtherAdminsViewingUI(users);
    } catch (_) { updateOtherAdminsViewingUI([]); }
}

export function reportPresenceHeartbeat() {
    if (!state.isAuthenticated || !state.currentUser) return;
    const base = (typeof API !== 'undefined' && API.getApiBaseUrl) ? API.getApiBaseUrl() : (window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com');
    const token = (typeof API !== 'undefined' && API.getAuthToken) ? API.getAuthToken() : (typeof localStorage !== 'undefined' && localStorage.getItem('authToken'));
    const payload = {
        userId: state.currentUser.userId ?? state.currentUser.id ?? state.currentUser.UserId,
        userName: state.currentUser.username ?? state.currentUser.userName ?? state.currentUser.name ?? state.currentUser.fullName,
        email: state.currentUser.email,
        timestamp: new Date().toISOString()
    };
    fetch(base + '/api/pipeline/presence', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {}),
        body: JSON.stringify(payload)
    }).catch(() => {});
}

export function startPresence() {
    if (!state.isAuthenticated || !state.currentUser) return;
    stopPresence();
    reportPresenceHeartbeat();
    fetchAndUpdatePresence();
    state.presenceHeartbeatId = setInterval(reportPresenceHeartbeat, 45000);
    state.presencePollId = setInterval(fetchAndUpdatePresence, 30000);
}

export function stopPresence() {
    if (state.presenceHeartbeatId) { clearInterval(state.presenceHeartbeatId); state.presenceHeartbeatId = null; }
    if (state.presencePollId) { clearInterval(state.presencePollId); state.presencePollId = null; }
}

/* ---------- Auth UI init ---------- */

export function initAuthUI({
    showDealPipelineView, hideDealPipelineView,
    renderDealPipelineTable, filterDealPipelineTable, saveAllDealPipelineRows,
    openDealEditModal, closeDealEditModal, handleDealSave, handleDealDelete,
    exportPipelineToExcel, initPreConManagerModal, initBrokerReferralModal,
    showBankDetails
} = {}) {
    const headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.style.display = 'flex';

    if (typeof initPreConManagerModal === 'function') initPreConManagerModal();
    if (typeof initBrokerReferralModal === 'function') initBrokerReferralModal();

    const exportBtn = document.getElementById('export-pipeline-btn');
    if (exportBtn && typeof exportPipelineToExcel === 'function') exportBtn.addEventListener('click', exportPipelineToExcel);

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => { document.getElementById('login-modal').style.display = 'flex'; });

    const editModeBtn = document.getElementById('edit-mode-btn');
    if (editModeBtn) editModeBtn.addEventListener('click', toggleEditMode);

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const closeLoginFn = () => {
        const lm = document.getElementById('login-modal');
        if (!lm) return;
        lm.classList.add('modal-closing');
        setTimeout(() => { lm.style.display = 'none'; lm.classList.remove('modal-closing'); }, 180);
    };
    document.getElementById('close-login-modal')?.addEventListener('click', closeLoginFn);
    document.getElementById('cancel-login')?.addEventListener('click', closeLoginFn);

    if (closeDealEditModal) {
        document.getElementById('close-deal-modal')?.addEventListener('click', closeDealEditModal);
        document.getElementById('cancel-deal-edit')?.addEventListener('click', closeDealEditModal);
    }
    if (handleDealSave) document.getElementById('deal-edit-form')?.addEventListener('submit', handleDealSave);
    if (handleDealDelete) document.getElementById('delete-deal-btn')?.addEventListener('click', handleDealDelete);

    if (showDealPipelineView) document.getElementById('deal-pipeline-btn')?.addEventListener('click', showDealPipelineView);
    if (hideDealPipelineView) document.getElementById('exit-deal-pipeline-btn')?.addEventListener('click', hideDealPipelineView);

    if (openDealEditModal) {
        document.getElementById('add-deal-pipeline-btn')?.addEventListener('click', () => openDealEditModal({}));
    }

    if (filterDealPipelineTable) {
        document.getElementById('deal-pipeline-search')?.addEventListener('input', (e) => filterDealPipelineTable(e.target.value));
    }
    if (saveAllDealPipelineRows) document.getElementById('save-all-deals-btn')?.addEventListener('click', saveAllDealPipelineRows);

    document.getElementById('login-modal')?.addEventListener('click', (e) => { if (e.target.id === 'login-modal') e.target.style.display = 'none'; });
    document.getElementById('bank-details-modal')?.addEventListener('click', (e) => { if (e.target.id === 'bank-details-modal') e.target.style.display = 'none'; });
    document.getElementById('deal-edit-modal')?.addEventListener('click', (e) => { if (e.target.id === 'deal-edit-modal' && closeDealEditModal) closeDealEditModal(); });

    updateAuthUI();

    if (showBankDetails) {
        document.addEventListener('click', async (e) => {
            const bankNameEl = e.target.closest('.bank-name-clickable');
            if (bankNameEl) { e.preventDefault(); await showBankDetails(bankNameEl.dataset.bankName, bankNameEl.dataset.bankId); }
        });
    }
}
