// modules/ui/filters.js — Filter controls, stage pills, active filter display
import { state, STAGE_DISPLAY_ORDER } from '../core/state.js';
import { normalizeStage, calculateSummary, applyFilters } from '../data/transforms.js';

const $ = (sel, root) => (root || document).querySelector(sel);

export function updateFiltersUI() {
    const { currentFilters, allDeals } = state;
    const dealsWithoutStart = allDeals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    });
    const summary = calculateSummary(dealsWithoutStart, true);
    const validStageKeys = Object.keys(summary.byStage).filter(k => !k.includes('_units') && k !== 'START' && k.toLowerCase() !== 'start' && !k.includes('START'));
    const validStages = [...STAGE_DISPLAY_ORDER.filter(s => validStageKeys.includes(s)), ...validStageKeys.filter(s => !STAGE_DISPLAY_ORDER.includes(s)).sort()];
    const selectedStages = Array.isArray(currentFilters.stages) ? currentFilters.stages : [];

    const stageCheckboxesContainer = document.getElementById('stage-filter-checkboxes');
    if (stageCheckboxesContainer) {
        stageCheckboxesContainer.innerHTML = validStages.map(s => {
            const checked = selectedStages.includes(s) ? ' checked' : '';
            const safe = s.replace(/"/g, '&quot;');
            return `<label class="stage-filter-checkbox-label"><input type="checkbox" class="stage-filter-checkbox" value="${safe}"${checked}> ${s}</label>`;
        }).join('');
    }

    const stageTrigger = document.getElementById('stage-filter-trigger');
    if (stageTrigger) {
        if (selectedStages.length === 0) stageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) stageTrigger.textContent = selectedStages.join(', ');
        else stageTrigger.textContent = selectedStages.length + ' stages';
    }
    const overviewStageTrigger = document.getElementById('overview-stage-filter-trigger');
    if (overviewStageTrigger) {
        if (selectedStages.length === 0) overviewStageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) overviewStageTrigger.textContent = selectedStages.join(', ');
        else overviewStageTrigger.textContent = selectedStages.length + ' stages';
    }

    const stateDropdown = document.getElementById('state-filter-dropdown');
    if (stateDropdown) stateDropdown.value = currentFilters.state || '';
    const overviewStageCheckboxes = document.querySelectorAll('#overview-stage-filter-checkboxes .stage-filter-checkbox');
    overviewStageCheckboxes.forEach(cb => { cb.checked = selectedStages.includes(cb.value); });

    const productDropdown = document.getElementById('product-filter-dropdown');
    if (productDropdown) productDropdown.value = currentFilters.product || '';
    const yearDropdown = document.getElementById('year-filter-dropdown');
    if (yearDropdown) yearDropdown.value = currentFilters.year || '';

    const stateFilter = document.getElementById('state-filter');
    if (stateFilter) {
        const states = Object.keys(summary.byState || {}).filter(s => s !== 'Unknown').sort();
        stateFilter.innerHTML = '<option value="">All States</option>' + states.map(state => `<option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>`).join('');
    }
    const bankFilter = document.getElementById('bank-filter');
    if (bankFilter) {
        bankFilter.innerHTML = '<option value="">All Banks</option>' + Object.keys(summary.byBank).filter(b => b !== 'Unknown').sort().map(bank => `<option value="${bank}" ${currentFilters.bank === bank ? 'selected' : ''}>${bank}</option>`).join('');
    }
    const productFilter = document.getElementById('product-filter');
    if (productFilter) {
        productFilter.innerHTML = '<option value="">All Types</option>' + Object.keys(summary.byProductType).sort().map(product => `<option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>`).join('');
    }
    const dateAddedFilter = document.getElementById('date-added-filter');
    if (dateAddedFilter) dateAddedFilter.value = currentFilters.dateAddedRange || '1y';

    const mobileCount = document.getElementById('mobile-filter-active-count');
    if (mobileCount) {
        let activeCount = 0;
        if (currentFilters.stages && currentFilters.stages.length > 0) activeCount++;
        if (currentFilters.state) activeCount++;
        if (currentFilters.bank) activeCount++;
        if (currentFilters.product) activeCount++;
        if (currentFilters.search) activeCount++;
        mobileCount.textContent = activeCount > 0 ? String(activeCount) : '';
    }
}

export function updateSortUI() {
    const sortBy = document.getElementById('sort-by');
    const sortOrder = document.getElementById('sort-order');
    if (sortBy) sortBy.value = state.currentSort.by;
    if (sortOrder) sortOrder.value = state.currentSort.order;
}

export function getActiveFilters() {
    const { currentFilters } = state;
    const active = [];
    if (currentFilters.stages && currentFilters.stages.length > 0) active.push({ label: 'Stage', value: currentFilters.stages.join(', ') });
    if (currentFilters.state) active.push({ label: 'State', value: currentFilters.state });
    if (currentFilters.bank) active.push({ label: 'Bank', value: currentFilters.bank });
    if (currentFilters.product) active.push({ label: 'Product Type', value: currentFilters.product });
    if (currentFilters.year) active.push({ label: 'Year', value: currentFilters.year });
    if (currentFilters.search) active.push({ label: 'Search', value: currentFilters.search });
    const dateAddedLabels = { '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last 1 year', '2y': 'Last 2 years' };
    if (currentFilters.dateAddedRange && currentFilters.dateAddedRange !== 'unlimited') active.push({ label: 'Date Added', value: dateAddedLabels[currentFilters.dateAddedRange] || currentFilters.dateAddedRange });
    return active;
}

export function renderActiveFilters() {
    const active = getActiveFilters();
    if (active.length === 0) return '';
    return `<div class="active-filters-container"><div class="active-filters-label">Active Filters:</div><div class="active-filters-list">${active.map(filter => `<span class="active-filter-badge"><span class="filter-label">${filter.label}:</span><span class="filter-value">${filter.value}</span></span>`).join('')}</div><button class="clear-filters-btn-top" onclick="clearFilters()">Clear All Filters</button></div>`;
}

export function clearFilters() {
    state.currentFilters = {
        stages: [], location: '', bank: '', product: '', state: '', search: '', year: '',
        timelineStartDate: null, timelineEndDate: null, dateAddedRange: 'unlimited'
    };
    try { localStorage.setItem('dealPipeline_dateAddedDefault', 'unlimited'); } catch (e) {}
    const searchInput = document.getElementById('search-filter');
    if (searchInput) searchInput.value = '';
    if (state.currentView === 'timeline') {
        const timelineYearFilter = document.querySelector('.timeline-year-filter');
        if (timelineYearFilter) {
            timelineYearFilter.querySelectorAll('.quick-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filterValue === '');
            });
        }
        const container = document.getElementById('deal-list-container');
        if (container && typeof window.__renderTimeline === 'function') {
            container.innerHTML = window.__renderTimeline(state.allDeals);
            if (typeof window.__setupDrillDownHandlers === 'function') window.__setupDrillDownHandlers();
        }
    }
    updateFiltersUI();
    if (state.currentView !== 'timeline' && typeof window.__switchView === 'function') {
        window.__switchView(state.currentView, state.allDeals);
    }
}

export function initStageFilterDropdowns() {
    // Delegated stage filter checkbox handler for the main list-view filter
    document.addEventListener('change', function(e) {
        if (!e.target.classList.contains('stage-filter-checkbox')) return;
        const panel = e.target.closest('#stage-filter-dropdown-panel, #overview-stage-filter-dropdown-panel');
        if (!panel) return;
        const checked = Array.from(panel.querySelectorAll('.stage-filter-checkbox:checked')).map(cb => cb.value);
        state.currentFilters.stages = checked;
        updateFiltersUI();
        if (typeof window.__rerenderForMobileLayout === 'function' && window.IS_MOBILE_LAYOUT) window.__rerenderForMobileLayout();
        else if (typeof window.__switchView === 'function') window.__switchView(state.currentView, state.allDeals);
    });

    // Overview stage dropdown close on outside click
    document.addEventListener('click', function(e) {
        const overviewPanel = document.getElementById('overview-stage-filter-dropdown-panel');
        const overviewTrigger = document.getElementById('overview-stage-filter-trigger');
        if (overviewPanel && !overviewPanel.contains(e.target) && e.target !== overviewTrigger) {
            overviewPanel.setAttribute('aria-hidden', 'true');
            if (overviewTrigger) overviewTrigger.setAttribute('aria-expanded', 'false');
            overviewPanel.style.display = 'none';
        }
    });

    // Wire global toggles
    window.__toggleMainStageDropdown = function() {
        const panel = document.getElementById('stage-filter-dropdown-panel');
        const trigger = document.getElementById('stage-filter-trigger');
        if (!panel || !trigger) return;
        const open = panel.style.display !== 'none' && panel.style.display !== '';
        panel.style.display = open ? 'none' : 'block';
        panel.setAttribute('aria-hidden', open ? 'true' : 'false');
        trigger.setAttribute('aria-expanded', !open);
    };

    window.__toggleOverviewStageDropdown = function() {
        const panel = document.getElementById('overview-stage-filter-dropdown-panel');
        const trigger = document.getElementById('overview-stage-filter-trigger');
        if (!panel || !trigger) return;
        const open = panel.style.display !== 'none' && panel.style.display !== '';
        panel.style.display = open ? 'none' : 'block';
        panel.setAttribute('aria-hidden', open ? 'true' : 'false');
        trigger.setAttribute('aria-expanded', !open);
    };

    // Clear overview stage filter button
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('overview-stage-clear-btn')) {
            state.currentFilters.stages = [];
            updateFiltersUI();
            const panel = document.getElementById('overview-stage-filter-dropdown-panel');
            if (panel) { panel.setAttribute('aria-hidden', 'true'); panel.style.display = 'none'; }
            const trigger = document.getElementById('overview-stage-filter-trigger');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
            if (typeof window.__switchView === 'function') window.__switchView(state.currentView, state.allDeals);
        }
    });
}
