/**
 * app-overview.js — Overview dashboard, summary stats, Asana name matching helpers
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function calculateSummary(deals, excludeStart = true) {
    // Filter out START deals by default (they're placeholders)
    // Use multiple checks to be absolutely sure START and HoldCo are excluded
    const filteredDeals = excludeStart ? deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage.toLowerCase() !== 'start' && !stage.includes('START') &&
               stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    }) : deals.filter(deal => {
        // Even if excludeStart is false, still exclude HoldCo
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    });
    
    const summary = {
        total: filteredDeals.length,
        byStage: {},
        totalUnits: 0,
        byProductType: {},
        byLocation: {},
        byBank: {},
        byState: {}, // Add state breakdown
        byYear: {}, // Add year breakdown
        upcomingDates: [],
        pastDates: []
    };
    
    filteredDeals.forEach(deal => {
        // By stage (never include START)
        const stage = normalizeStage(deal.Stage || deal.stage);
        
        // Skip all processing for START deals
        if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) {
            return; // Skip this deal entirely
        }
        
        summary.byStage[stage] = (summary.byStage[stage] || 0) + 1;
        
        // Get units once for use throughout
        const units = parseInt(deal['Unit Count'] || deal.unitCount || 0);
        
        // Total units
        if (units) {
            summary.totalUnits += units;
            if (!summary.byStage[stage + '_units']) {
                summary.byStage[stage + '_units'] = 0;
            }
            summary.byStage[stage + '_units'] += units;
        }
        
        // By product type
        const productType = deal['Product Type'] || deal.productType || 'Other';
        summary.byProductType[productType] = (summary.byProductType[productType] || 0) + 1;
        
        // By location
        const location = getDealLocation(deal) || 'Unknown';
        if (!summary.byLocation[location]) {
            summary.byLocation[location] = { count: 0, units: 0 };
        }
        summary.byLocation[location].count++;
        if (units) summary.byLocation[location].units += units;
        
        // By bank (use normalized name for grouping)
        const bank = deal.Bank || deal.bank || 'Unknown';
        const normalizedBank = normalizeBankName(bank);
        const canonicalBank = getCanonicalBankName(bank);
        // Use canonical name for display, but group by normalized name
        if (!summary.byBank[canonicalBank]) {
            summary.byBank[canonicalBank] = 0;
        }
        summary.byBank[canonicalBank] = (summary.byBank[canonicalBank] || 0) + 1;
        
        // By state (extract from location)
        const stateMatch = location.match(/,\s*([A-Z]{2})$/);
        const state = stateMatch ? stateMatch[1] : 'Unknown';
        if (!summary.byState[state]) {
            summary.byState[state] = { count: 0, units: 0 };
        }
        summary.byState[state].count++;
        if (units) summary.byState[state].units += units;
        
        // By year
        const dealStartDate = deal['Start Date'] || deal.startDate;
        if (dealStartDate) {
            const date = new Date(dealStartDate);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear().toString();
                if (!summary.byYear[year]) {
                    summary.byYear[year] = 0;
                }
                summary.byYear[year]++;
            }
        }
        
        // Dates (exclude START deals from dates) - use all deal date fields
        if (stage !== 'START') {
            const dateFields = [
                { key: 'Start Date', alt: 'startDate', dateType: 'Start date' },
                { key: 'ExecutionDate', alt: null, dateType: 'Execution' },
                { key: 'DueDiligenceDate', alt: null, dateType: 'Due Diligence' },
                { key: 'ClosingDate', alt: null, dateType: 'Closing' },
                { key: 'ConstructionLoanClosingDate', alt: null, dateType: 'Construction Loan Closing' }
            ];
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            for (const f of dateFields) {
                const val = deal[f.key] || (f.alt && deal[f.alt]);
                if (!val) continue;
                const date = new Date(val);
                if (isNaN(date.getTime())) continue;
                const dateItem = {
                    name: deal.Name || deal.name,
                    date: date,
                    dateType: f.dateType,
                    stage: stage,
                    location: getDealLocation(deal),
                    units: deal['Unit Count'] || deal.unitCount,
                    bank: deal.Bank || deal.bank
                };
                const dateOnly = new Date(date);
                dateOnly.setHours(0, 0, 0, 0);
                if (dateOnly >= today) {
                    summary.upcomingDates.push(dateItem);
                } else {
                    summary.pastDates.push(dateItem);
                }
            }
        }
    });
    
    // Sort dates and cap upcoming to avoid performance issues
    summary.upcomingDates.sort((a, b) => a.date - b.date);
    if (summary.upcomingDates.length > 100) {
        summary.upcomingDates = summary.upcomingDates.slice(0, 100);
    }
    summary.pastDates.sort((a, b) => b.date - a.date);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations - check all keys
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || (key.toLowerCase() === 'start' && !key.includes('_units'))) {
            delete summary.byStage[key];
        }
        // Remove HoldCo from stage summaries
        if (key === 'HoldCo' || (key.toLowerCase() === 'holdco' && !key.includes('_units'))) {
            delete summary.byStage[key];
        }
    });
    
    return summary;
}

// Render Overview
function renderOverview(deals) {
    // Get filter options from ALL deals (so dropdowns show all available options)
    // First filter out START deals before calculating summary
    const dealsWithoutStart = deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START';
    });
    const allDealsSummary = calculateSummary(dealsWithoutStart, true);
    const states = Object.keys(allDealsSummary.byState).filter(s => s !== 'Unknown').sort();
    const years = Object.keys(allDealsSummary.byYear).sort((a, b) => parseInt(b) - parseInt(a)); // Most recent first
    // Completely exclude START from stages; order by STAGE_DISPLAY_ORDER
    const stageKeys = Object.keys(allDealsSummary.byStage)
        .filter(k => !k.includes('_units'))
        .filter(k => k !== 'START')
        .filter(k => k.toLowerCase() !== 'start')
        .filter(k => !k.includes('START'));
    const stages = [...STAGE_DISPLAY_ORDER.filter(s => stageKeys.includes(s)), ...stageKeys.filter(s => !STAGE_DISPLAY_ORDER.includes(s)).sort()];
    const productTypes = Object.keys(allDealsSummary.byProductType).sort();
    
    // Apply filters for overview: include all stages (Prospective, Under Review) so overview shows full deal counts
    const filteredDeals = applyFilters(deals, true, true);
    // Calculate summary from filtered deals for the stats
    const summary = calculateSummary(filteredDeals, true);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || key.toLowerCase() === 'start' || key.includes('START')) {
            delete summary.byStage[key];
        }
    });
    
    return `
        <div class="overview-container">
            <div class="overview-header">
                <img src="Logos/STOA20-Logo-Mark-Green.jpg" alt="STOA" class="stoa-logo-overview" />
                <div class="beta-badge">BETA</div>
            </div>
            
            <!-- Quick Filters -->
            <div class="quick-filters">
                <div class="quick-filter-group">
                    <label for="state-filter-dropdown">Filter by State:</label>
                    <select id="state-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All States</option>
                        ${states.map(state => `
                            <option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group overview-stage-filter-group">
                    <label>Filter by Stage:</label>
                    <div class="stage-filter-dropdown-wrap overview-stage-dropdown-wrap">
                        <button type="button" class="stage-filter-trigger overview-stage-filter-trigger" id="overview-stage-filter-trigger" aria-haspopup="true" aria-expanded="false" onclick="event.preventDefault(); event.stopPropagation(); window.toggleOverviewStageDropdown && window.toggleOverviewStageDropdown();">${(currentFilters.stages && currentFilters.stages.length > 0) ? (currentFilters.stages.length <= 2 ? currentFilters.stages.join(', ') : currentFilters.stages.length + ' stages') : 'All Stages'}</button>
                        <div class="stage-filter-dropdown-panel overview-stage-filter-dropdown-panel" id="overview-stage-filter-dropdown-panel" role="menu" aria-hidden="true" style="display: none;">
                            <div class="stage-filter-checkboxes" id="overview-stage-filter-checkboxes">
                                ${stages
                                    .filter(s => s !== 'START' && s.toLowerCase() !== 'start' && !s.includes('START'))
                                    .map(s => {
                                        const checked = (currentFilters.stages && currentFilters.stages.includes(s)) ? ' checked' : '';
                                        const safe = s.replace(/"/g, '&quot;');
                                        return `<label class="stage-filter-checkbox-label"><input type="checkbox" class="stage-filter-checkbox" value="${safe}"${checked}> ${s}</label>`;
                                    })
                                    .join('')}
                            </div>
                            <button type="button" class="stage-filter-clear-btn overview-stage-clear-btn">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="quick-filter-group">
                    <label for="product-filter-dropdown">Filter by Product Type:</label>
                    <select id="product-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Types</option>
                        ${productTypes.map(product => `
                            <option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="year-filter-dropdown">Filter by Year:</label>
                    <select id="year-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Years</option>
                        ${years.map(year => `
                            <option value="${year}" ${currentFilters.year === year ? 'selected' : ''}>${year}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="overview-date-added-filter">Date Added:</label>
                    <select id="overview-date-added-filter" class="quick-filter-dropdown" aria-label="Filter by date added">
                        <option value="3m" ${currentFilters.dateAddedRange === '3m' ? 'selected' : ''}>Last 3 months</option>
                        <option value="6m" ${currentFilters.dateAddedRange === '6m' ? 'selected' : ''}>Last 6 months</option>
                        <option value="1y" ${(currentFilters.dateAddedRange || '1y') === '1y' ? 'selected' : ''}>Last 1 year</option>
                        <option value="2y" ${currentFilters.dateAddedRange === '2y' ? 'selected' : ''}>Last 2 years</option>
                        <option value="unlimited" ${currentFilters.dateAddedRange === 'unlimited' ? 'selected' : ''}>Unlimited (no filter)</option>
                    </select>
                </div>
            </div>
            
            <div class="overview-filter-actions">
                <button class="clear-filters-btn-overview" onclick="clearFilters()">Clear All Filters</button>
            </div>
            
            ${renderActiveFilters()}
            
            <div class="overview-stats">
                <div class="stat-card clickable" data-drill="list">
                    <div class="stat-value">${summary.total}</div>
                    <div class="stat-label">Total Deals</div>
                </div>
                <div class="stat-card clickable" data-drill="units">
                    <div class="stat-value">${summary.totalUnits.toLocaleString()}</div>
                    <div class="stat-label">Total Units</div>
                </div>
                <div class="stat-card clickable" data-drill="location">
                    <div class="stat-value">${Object.keys(summary.byLocation).filter(l => l !== 'Unknown').length}</div>
                    <div class="stat-label">Locations</div>
                </div>
                <div class="stat-card clickable" data-drill="bank">
                    <div class="stat-value">${Object.keys(summary.byBank).filter(b => b !== 'Unknown').length}</div>
                    <div class="stat-label">Banks</div>
                </div>
            </div>
            
            <div class="overview-sections">
                <div class="overview-section">
                    <h3>Deals by Stage (Click to Filter)</h3>
                    <div class="stage-breakdown">
                        ${(() => {
                            // Define stage order (Dead and Other should be last)
                            const stageOrder = [
                                'Prospective',
                                'Under Review',
                                'Under Contract',
                                'Under Construction',
                                'Lease-up',
                                'Stabilized',
                                'Liquidated',
                                'Commercial Land Listed',
                                'Rejected',
                                'Dead',
                                'Other'
                            ];
                            
                            // Get all stages from summary, excluding START and unit counts
                            const allStages = Object.keys(summary.byStage)
                            .filter(k => !k.includes('_units'))
                            .filter(k => k !== 'START')
                            .filter(k => k.toLowerCase() !== 'start')
                                .filter(k => !k.includes('START'));
                            
                            // Normalize stage names for matching (handle variations)
                            const normalizeStageName = (stage) => {
                                const normalized = stage.toLowerCase().trim();
                                if (normalized.includes('lease') && normalized.includes('up')) return 'Lease-up';
                                if (normalized.includes('under') && normalized.includes('construction')) return 'Under Construction';
                                if (normalized.includes('under') && normalized.includes('contract')) return 'Under Contract';
                                if (normalized.includes('commercial') && normalized.includes('land') && normalized.includes('listed')) return 'Commercial Land Listed';
                                return stage;
                            };
                            
                            // Sort stages: first by defined order, then any remaining stages alphabetically, with Dead and Other at the end
                            const sortedStages = allStages.sort((a, b) => {
                                const aNormalized = normalizeStageName(a);
                                const bNormalized = normalizeStageName(b);
                                const aIndex = stageOrder.indexOf(aNormalized);
                                const bIndex = stageOrder.indexOf(bNormalized);
                                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                                if (aIndex !== -1) return -1;
                                if (bIndex !== -1) return 1;
                                const aIsDeadOrOther = a === 'Dead' || a === 'Other';
                                const bIsDeadOrOther = b === 'Dead' || b === 'Other';
                                if (aIsDeadOrOther && !bIsDeadOrOther) return 1;
                                if (!aIsDeadOrOther && bIsDeadOrOther) return -1;
                                return a.localeCompare(b);
                            });
                            
                            return sortedStages.map(stage => {
                                if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) return '';
                                const count = summary.byStage[stage];
                                const units = summary.byStage[stage + '_units'] || 0;
                                const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                return `
                                    <div class="breakdown-item clickable" data-stage="${stage}" style="cursor: pointer; width: 100%;">
                                        <span class="stage-badge ${stageConfig.class}">${stage}</span>
                                        <span class="breakdown-count">${count} deals</span>
                                        ${units > 0 ? `<span class="breakdown-units">${units.toLocaleString()} units</span>` : ''}
                                    </div>
                                `;
                            }).filter(html => html !== '').join('');
                        })()}
                    </div>
                </div>
                
                <div class="overview-section">
                    <h3>Upcoming Dates (Next 10)</h3>
                    <div class="upcoming-dates">
                        ${summary.upcomingDates.slice(0, 10).map(item => `
                            <div class="date-item clickable" data-drill-timeline="${item.name}" style="cursor: pointer;">
                                <span class="date-value">${formatDate(item.date)}</span>
                                <span class="date-name">${item.name}</span>
                                <span class="stage-badge clickable ${STAGE_CONFIG[item.stage]?.class || ''}" data-stage="${item.stage}">${item.stage}</span>
                            </div>
                        `).join('')}
                        ${summary.upcomingDates.length === 0 ? '<div class="no-data">No upcoming dates</div>' : ''}
                    </div>  
                </div>
            </div>
        </div>
    `;
}

// Normalize for Asana/deal name comparison (trim, lowercase, collapse spaces, ignore apostrophes)
function asanaNormalizeName(str) {
    return String(str || '').trim().toLowerCase()
        .replace(/['\u2019\u2018\u0027]/g, '')
        .replace(/\s+/g, ' ');
}
// Two key words match if equal or one is a prefix of the other (handles truncation e.g. "East Ba" vs "East Bay")
function asanaWordMatches(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (a.length >= 2 && b.startsWith(a)) || (b.length >= 2 && a.startsWith(b));
}
// Match Asana project/task name to deal name with disambiguation so generic names don't match specific deals.
// e.g. Asana "The Heights" must not match deal "The Heights at Inverness" unless Asana name contains "inverness".
// Ignores apostrophes (e.g. "Settler's" matches "Settlers") and allows word-overlap match when names are very similar.
function asanaProjectNameMatchesDeal(projectName, dealName) {
    if (!projectName || !dealName) return false;
    const p = asanaNormalizeName(projectName);
    const d = asanaNormalizeName(dealName);
    if (!p || !d) return false;
    if (p === d) return true;
    const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
    const getKeyWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0);
    const pWords = getKeyWords(p);
    const dWords = getKeyWords(d);
    if (d.indexOf(p) !== -1) {
        const extraInDeal = dWords.filter(w => !pWords.includes(w) && w.length > 3);
        if (extraInDeal.length >= 2) {
            const asanaHasExtra = extraInDeal.some(w => p.indexOf(w) !== -1);
            if (!asanaHasExtra) return false;
        }
        return true;
    }
    if (p.indexOf(d) !== -1) {
        const extraInAsana = pWords.filter(w => !dWords.includes(w) && w.length > 3);
        if (extraInAsana.length >= 2) {
            const dealHasExtra = extraInAsana.some(w => d.indexOf(w) !== -1);
            if (!dealHasExtra) return false;
        }
        return true;
    }
    // Word-overlap fallback: e.g. "The Waters at Settler's Trace" vs "Waters at Settlers Trace" – same key words
    if (pWords.length >= 2 && dWords.length >= 2) {
        const pSet = new Set(pWords);
        const dSet = new Set(dWords);
        const overlap = pWords.filter(w => dSet.has(w)).length;
        const minWords = Math.min(pWords.length, dWords.length);
        if (overlap >= minWords || (overlap >= 2 && overlap >= minWords * 0.8)) return true;
    }
    return false;
}
// Return a score for match quality (higher = better). Used to pick the best Asana task when multiple match.
function asanaMatchQuality(asanaName, dealName) {
    if (!asanaName || !dealName) return 0;
    const p = asanaNormalizeName(asanaName);
    const d = asanaNormalizeName(dealName);
    if (!p || !d) return 0;
    if (p === d) return 100;
    if (d.indexOf(p) !== -1 || p.indexOf(d) !== -1) {
        if (!asanaProjectNameMatchesDeal(asanaName, dealName)) return 0;
        const lenMatch = Math.min(p.length, d.length) / Math.max(p.length, d.length);
        return 50 + Math.round(lenMatch * 40);
    }
    if (asanaProjectNameMatchesDeal(asanaName, dealName)) {
        const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
        const getKeyWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0);
        const pWords = getKeyWords(p);
        const dWords = getKeyWords(d);
        const overlap = pWords.filter(w => dWords.includes(w)).length;
        const minWords = Math.min(pWords.length, dWords.length);
        if (minWords > 0) return 40 + Math.round((overlap / minWords) * 50);
    }
    return 0;
}

// Upcoming Dates view – land development: deal start dates, key dates, and Asana tasks (view-only, matched by project name)
