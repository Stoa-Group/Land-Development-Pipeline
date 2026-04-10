/**
 * app-timeline-units.js — Timeline rendering, unit summary view
 * Also contains duplicate filter UI functions (superceded by modules/ui/filters.js at runtime).
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function renderTimeline(deals) {
    const filtered = applyFilters(deals, false, false, true); // Don't exclude START; skip year filter (we filter by card date below)
    const summary = calculateSummary(filtered, false); // Include START in timeline calculations
    
    const now = new Date();
    const allDates = [...summary.upcomingDates, ...summary.pastDates];
    
    // Get available years for timeline filter (from ALL deals, not just filtered ones)
    // Calculate years from the original allDeals array to show all available years
    // This ensures all years are visible even when other filters are applied
    const sourceDeals = window.allDeals || allDeals || deals;
    const allYearsFromAllDeals = [...new Set(sourceDeals.map(deal => {
        try {
            const startDate = deal['Start Date'] || deal.startDate || deal._original?.StartDate || deal._original?.startDate;
            if (startDate) {
                const itemDate = new Date(startDate);
                if (!isNaN(itemDate.getTime())) {
                    return itemDate.getFullYear().toString();
                }
            }
        } catch (e) {
            // Skip invalid dates
        }
        return null;
    }).filter(y => y !== null))].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Also get years from the current filtered dates as a fallback
    const allYearsFromFiltered = [...new Set(allDates.map(item => {
        try {
            const itemDate = new Date(item.date);
            if (!isNaN(itemDate.getTime())) {
                return itemDate.getFullYear().toString();
            }
        } catch (e) {
            console.warn('Invalid date in timeline:', item.date);
        }
        return null;
    }).filter(y => y !== null))].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Use the union of both to ensure we have all years
    const allYears = [...new Set([...allYearsFromAllDeals, ...allYearsFromFiltered])].sort((a, b) => parseInt(b) - parseInt(a));
    
    // One card per deal: for each deal, keep only the earliest date
    const dealToEarliest = {};
    allDates.forEach(item => {
        try {
            const date = new Date(item.date);
            if (isNaN(date.getTime())) return;
            const name = item.name || '';
            if (!name) return;
            const existing = dealToEarliest[name];
            if (!existing || date < new Date(existing.date)) {
                dealToEarliest[name] = item;
            }
        } catch (e) {
            console.warn('Error processing date in timeline:', item.date);
        }
    });
    let onePerDeal = Object.values(dealToEarliest);
    
    // Filter by year when a specific year is selected (filter by card date, not deal Start Date)
    if (currentFilters.year) {
        const targetYear = currentFilters.year;
        onePerDeal = onePerDeal.filter(item => {
            try {
                const date = new Date(item.date);
                return !isNaN(date.getTime()) && date.getFullYear().toString() === targetYear;
            } catch (e) { return false; }
        });
    }
    
    // Group by year/quarter
    const groupedByPeriod = {};
    onePerDeal.forEach(item => {
        try {
            const date = new Date(item.date);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                const periodKey = `Q${quarter} ${year}`;
                if (!groupedByPeriod[periodKey]) {
                    groupedByPeriod[periodKey] = [];
                }
                groupedByPeriod[periodKey].push(item);
            }
        } catch (e) {
            console.warn('Error processing date in timeline:', item.date);
        }
    });
    
    // Sort periods chronologically (oldest to newest for left-to-right display)
    let periods = Object.keys(groupedByPeriod).sort((a, b) => {
        const [qA, yA] = a.split(' ').map(v => v.replace('Q', ''));
        const [qB, yB] = b.split(' ').map(v => v.replace('Q', ''));
        if (yA !== yB) return parseInt(yA) - parseInt(yB);
        return parseInt(qA) - parseInt(qB);
    });
    
    // Check if we should highlight a specific deal
    const highlightDeal = window.highlightDealInTimeline;
    if (highlightDeal) {
        delete window.highlightDealInTimeline;
    }
    
    // Ensure we have years to display (fallback to current year if none found)
    const yearsToDisplay = allYears.length > 0 ? allYears : [new Date().getFullYear().toString()];
    
    return `
        <div class="timeline-board-container">
            ${renderActiveFilters()}
            <div class="timeline-board-header">
                <h3>Timeline View - Organized by Quarter</h3>
                <div class="timeline-header-controls">
                    <div class="timeline-year-filter">
                        <label>Filter by Year:</label>
                        <div class="quick-filter-buttons">
                            <button class="quick-filter-btn ${!currentFilters.year ? 'active' : ''}" data-filter-type="year" data-filter-value="" style="cursor: pointer; padding: 8px 16px; margin: 4px;">All Years</button>
                            ${yearsToDisplay.map(year => `
                                <button class="quick-filter-btn ${currentFilters.year === year ? 'active' : ''}" data-filter-type="year" data-filter-value="${year}" style="cursor: pointer; padding: 8px 16px; margin: 4px;">${year}</button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="timeline-board-columns">
                ${periods.map(period => {
                    const periodDeals = groupedByPeriod[period].sort((a, b) => a.date - b.date);
                    const [, year] = period.split(' ').map(v => v.replace('Q', ''));
                    return `
                        <div class="timeline-column" data-period="${period}" data-year="${year}">
                            <div class="timeline-column-header">
                                <span class="timeline-period">${period}</span>
                                <span class="timeline-count">${periodDeals.length}</span>
                            </div>
                            <div class="timeline-column-content">
                                ${periodDeals.map(item => {
                                    const stageConfig = STAGE_CONFIG[item.stage] || STAGE_CONFIG['Prospective'];
                                    const daysUntil = Math.ceil((item.date - now) / (1000 * 60 * 60 * 24));
                                    const isHighlighted = highlightDeal && item.name === highlightDeal;
                                    return `
                                        <div class="timeline-card ${isHighlighted ? 'highlighted' : ''}" data-deal-name="${item.name}">
                                            <div class="timeline-card-date">${formatDate(item.date)}</div>
                                            <div class="timeline-card-name">${item.name}</div>
                                            <div class="timeline-card-details">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${item.stage}">${item.stage}</span>
                                                ${item.dateType ? `<span class="date-type-badge">${item.dateType}</span>` : ''}
                                                ${item.location ? `<span class="location-badge clickable" data-location="${item.location}">${item.location}</span>` : ''}
                                                ${item.units ? `<span class="units-info">${item.units} units</span>` : ''}
                                                ${item.bank ? `<span class="bank-info">${item.bank}</span>` : ''}
                                            </div>
                                            ${daysUntil >= 0 ? 
                                                `<div class="timeline-card-time">${daysUntil} day${daysUntil !== 1 ? 's' : ''} away</div>` :
                                                `<div class="timeline-card-time past">${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago</div>`
                                            }
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Render Unit Summary
function renderUnitSummary(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    const summary = calculateSummary(filtered);
    
    return `
        ${renderActiveFilters()}
        <div class="unit-summary-container">
            <div class="summary-section">
                <h3>Total Units by Stage</h3>
                <div class="unit-breakdown">
                    ${(function () {
                        const stageKeys = Object.keys(summary.byStage).filter(k => !k.includes('_units') && k !== 'START');
                        const order = UNIT_SUMMARY_STAGE_ORDER;
                        const sorted = [...stageKeys].sort((a, b) => {
                            const ai = order.indexOf(a);
                            const bi = order.indexOf(b);
                            if (ai !== -1 && bi !== -1) return ai - bi;
                            if (ai !== -1) return -1;
                            if (bi !== -1) return 1;
                            return a.localeCompare(b);
                        });
                        return sorted.map(stage => {
                            const units = summary.byStage[stage + '_units'] || 0;
                            const count = summary.byStage[stage];
                            const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                            const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                            return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: ${stageConfig.color};"></div>
                                </div>
                                <div class="unit-count">${count} deals</div>
                            </div>
                        `;
                        }).join('');
                    })()}
                </div>
            </div>
            
            <div class="summary-section">
                <h3>Total Units by Product Type</h3>
                <div class="unit-breakdown">
                    ${Object.keys(summary.byProductType).map(productType => {
                        const typeDeals = filtered.filter(d => (d['Product Type'] || d.productType || 'Other') === productType);
                        const units = typeDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
                        const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                        return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span>${productType}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: var(--primary-green);"></div>
                                </div>
                                <div class="unit-count">${summary.byProductType[productType]} deals</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// Update filter UI
function updateFiltersUI() {
    // Exclude START deals before calculating summary
    const dealsWithoutStart = allDeals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    });
    const summary = calculateSummary(dealsWithoutStart, true);
    
    // Build valid stages list (exclude START)
    const validStageKeys = Object.keys(summary.byStage)
        .filter(k => !k.includes('_units'))
        .filter(k => k !== 'START')
        .filter(k => k.toLowerCase() !== 'start')
        .filter(k => !k.includes('START'));
    const validStages = [...STAGE_DISPLAY_ORDER.filter(s => validStageKeys.includes(s)), ...validStageKeys.filter(s => !STAGE_DISPLAY_ORDER.includes(s)).sort()];
    const selectedStages = Array.isArray(currentFilters.stages) ? currentFilters.stages : [];

    // Update stage filter checkboxes (list view filter-controls)
    const stageCheckboxesContainer = document.getElementById('stage-filter-checkboxes');
    if (stageCheckboxesContainer) {
        stageCheckboxesContainer.innerHTML = validStages.map(s => {
            const checked = selectedStages.includes(s) ? ' checked' : '';
            const safe = s.replace(/"/g, '&quot;');
            return `<label class="stage-filter-checkbox-label"><input type="checkbox" class="stage-filter-checkbox" value="${safe}"${checked}> ${s}</label>`;
        }).join('');
    }

    // Update stage filter trigger button label
    const stageTrigger = document.getElementById('stage-filter-trigger');
    if (stageTrigger) {
        if (selectedStages.length === 0) stageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) stageTrigger.textContent = selectedStages.join(', ');
        else stageTrigger.textContent = selectedStages.length + ' stages';
    }
    // Overview stage dropdown trigger label (when on Overview page)
    const overviewStageTrigger = document.getElementById('overview-stage-filter-trigger');
    if (overviewStageTrigger) {
        if (selectedStages.length === 0) overviewStageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) overviewStageTrigger.textContent = selectedStages.join(', ');
        else overviewStageTrigger.textContent = selectedStages.length + ' stages';
    }
    
    // Update quick filter dropdowns on overview page (state, product, year)
    const stateDropdown = document.getElementById('state-filter-dropdown');
    if (stateDropdown) stateDropdown.value = currentFilters.state || '';
    // Overview stage checkboxes are rendered in renderOverview; sync checked state if container exists
    const overviewStageCheckboxes = document.querySelectorAll('#overview-stage-filter-checkboxes .stage-filter-checkbox');
    overviewStageCheckboxes.forEach(cb => {
        cb.checked = selectedStages.includes(cb.value);
    });
    
    const productDropdown = document.getElementById('product-filter-dropdown');
    if (productDropdown) {
        productDropdown.value = currentFilters.product || '';
    }
    
    const yearDropdown = document.getElementById('year-filter-dropdown');
    if (yearDropdown) {
        yearDropdown.value = currentFilters.year || '';
    }
    
    // Update state filter (Filter by State)
    const stateFilter = document.getElementById('state-filter');
    if (stateFilter) {
        const states = Object.keys(summary.byState || {}).filter(s => s !== 'Unknown').sort();
        stateFilter.innerHTML = '<option value="">All States</option>' +
            states.map(state =>
                `<option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>`
            ).join('');
    }
    
    // Update bank filter
    const bankFilter = document.getElementById('bank-filter');
    if (bankFilter) {
        bankFilter.innerHTML = '<option value="">All Banks</option>' +
            Object.keys(summary.byBank).filter(b => b !== 'Unknown').sort().map(bank => 
                `<option value="${bank}" ${currentFilters.bank === bank ? 'selected' : ''}>${bank}</option>`
            ).join('');
    }
    
    // Update product filter
    const productFilter = document.getElementById('product-filter');
    if (productFilter) {
        productFilter.innerHTML = '<option value="">All Types</option>' +
            Object.keys(summary.byProductType).sort().map(product => 
                `<option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>`
            ).join('');
    }

    // Update date-added filter
    const dateAddedFilter = document.getElementById('date-added-filter');
    if (dateAddedFilter) dateAddedFilter.value = currentFilters.dateAddedRange || '1y';
    
    // hideStart filter removed - START deals are automatically excluded
    
    // Update mobile filter toggle badge
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

// Update sort UI to reflect current sort settings
function updateSortUI() {
    const sortBy = document.getElementById('sort-by');
    const sortOrder = document.getElementById('sort-order');
    
    if (sortBy) {
        sortBy.value = currentSort.by;
    }
    
    if (sortOrder) {
        sortOrder.value = currentSort.order;
    }
}

// Get active filters for display
function getActiveFilters() {
    const active = [];
    if (currentFilters.stages && currentFilters.stages.length > 0) active.push({ label: 'Stage', value: currentFilters.stages.join(', ') });
    if (currentFilters.state) active.push({ label: 'State', value: currentFilters.state });
    if (currentFilters.bank) active.push({ label: 'Bank', value: currentFilters.bank });
    if (currentFilters.product) active.push({ label: 'Product Type', value: currentFilters.product });
    if (currentFilters.year) active.push({ label: 'Year', value: currentFilters.year });
    if (currentFilters.search) active.push({ label: 'Search', value: currentFilters.search });
    const dateAddedLabels = { '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last 1 year', '2y': 'Last 2 years' };
    if (currentFilters.dateAddedRange && currentFilters.dateAddedRange !== 'unlimited') {
        active.push({ label: 'Date Added', value: dateAddedLabels[currentFilters.dateAddedRange] || currentFilters.dateAddedRange });
    }
    return active;
}

// Render active filters display
function renderActiveFilters() {
    const active = getActiveFilters();
    if (active.length === 0) return '';
    
    return `
        <div class="active-filters-container">
            <div class="active-filters-label">Active Filters:</div>
            <div class="active-filters-list">
                ${active.map(filter => `
                    <span class="active-filter-badge">
                        <span class="filter-label">${filter.label}:</span>
                        <span class="filter-value">${filter.value}</span>
                    </span>
                `).join('')}
            </div>
            <button class="clear-filters-btn-top" onclick="clearFilters()">Clear All Filters</button>
        </div>
    `;
}

// Clear filters
function clearFilters() {
    currentFilters = {
        stages: [],
        location: '',
        bank: '',
        product: '',
        state: '',
        search: '', // Clear search
        year: '', // Clear year filter
        timelineStartDate: null,
        timelineEndDate: null,
        dateAddedRange: 'unlimited'  // Truly clear - remove Date Added filter when user clicks Clear
    };
    try { localStorage.setItem('dealPipeline_dateAddedDefault', 'unlimited'); } catch (e) { /* ignore */ }
    // Clear search input
    const searchInput = document.getElementById('search-filter');
    if (searchInput) searchInput.value = '';
    
    // Update year filter buttons if on timeline view
    if (currentView === 'timeline') {
        const timelineYearFilter = document.querySelector('.timeline-year-filter');
        if (timelineYearFilter) {
            timelineYearFilter.querySelectorAll('.quick-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filterValue === '');
            });
        }
        // Force re-render timeline to show all years
        const container = document.getElementById('deal-list-container');
        if (container) {
            container.innerHTML = renderTimeline(allDeals);
            setupDrillDownHandlers();
        }
    }
    
    updateFiltersUI();
    // Only switch view if not already on timeline (to avoid double render)
    if (currentView !== 'timeline') {
    switchView(currentView, allDeals);
    }
}

// Make clearFilters globally accessible
window.clearFilters = clearFilters;

// Asana sync: other custom fields (Unit Count, Stage, Bank, Product Type, Location, Pre-Con Manager). Both directions: DB ↔ Asana.
var ASANA_OTHER_FIELDS_CONFIG = [
    { key: 'unit_count', label: 'Unit Count', getDb: function(d) { var v = d['Unit Count'] || d.unitCount; return v != null && v !== '' ? String(v).trim() : ''; }, getAsana: function(t) { var v = t.unit_count != null ? t.unit_count : (t.custom_fields && t.custom_fields.unit_count != null ? t.custom_fields.unit_count : null); return v != null ? String(v).trim() : ''; }, same: function(a, b) { var na = parseInt(a, 10), nb = parseInt(b, 10); if (!isNaN(na) && !isNaN(nb)) return na === nb; return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'stage', label: 'Stage', getDb: function(d) { return (normalizeStage(d.Stage || d.stage) || '').trim(); }, getAsana: function(t) { var v = t.stage != null ? t.stage : (t.custom_fields && t.custom_fields.stage != null ? t.custom_fields.stage : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'bank', label: 'Bank', getDb: function(d) { return (d.Bank || d.bank || '').toString().trim(); }, getAsana: function(t) { var v = t.bank != null ? t.bank : (t.custom_fields && t.custom_fields.bank != null ? t.custom_fields.bank : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'product_type', label: 'Product Type', getDb: function(d) { return (getDealProductType(d) || (d['Product Type'] || d.productType) || '').toString().trim(); }, getAsana: function(t) { var v = t.product_type != null ? t.product_type : (t.custom_fields && t.custom_fields.product_type != null ? t.custom_fields.product_type : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'location', label: 'Location', getDb: function(d) { return (getDealLocation(d) || d.Location || d.location || '').toString().trim(); }, getAsana: function(t) { var v = t.location != null ? t.location : (t.custom_fields && t.custom_fields.location != null ? t.custom_fields.location : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'precon_manager', label: 'Pre-Con Manager', getDb: function(d) { return (d['Pre-Con'] || d.preCon || d['Pre-Con Manager'] || '').toString().trim(); }, getAsana: function(t) { var v = t.precon_manager != null ? t.precon_manager : (t.custom_fields && t.custom_fields.precon_manager != null ? t.custom_fields.precon_manager : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
];
