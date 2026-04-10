/**
 * app-comparables.js — Comparables Analysis View
 * Plain <script> (not ES module). Select 2-5 deals to compare side-by-side.
 */

/* jshint esversion: 11 */

// Track selected deal IDs for comparison
window._compareSelectedIds = new Set();
window._compareChartInstance = null;

function renderComparablesView(deals) {
    const filtered = typeof applyFilters === 'function' ? applyFilters(deals, true) : deals;
    const container = document.getElementById('deal-list-container');
    if (!container) return '';

    const selectedIds = window._compareSelectedIds;
    const selectedDeals = filtered.filter(d => selectedIds.has(_compareDealId(d)));

    let html = '<div class="compare-wrapper">';
    html += '<div class="compare-header">';
    html += '<h2 class="compare-title">Comparables Analysis</h2>';
    html += '<p class="compare-subtitle">Select 2-5 deals to compare side-by-side</p>';
    html += '</div>';

    // Deal selector
    html += '<div class="compare-selector">';
    html += '<div class="compare-selector-header">';
    html += '<span class="compare-selected-count">' + selectedIds.size + ' of 5 selected</span>';
    if (selectedIds.size > 0) {
        html += '<button type="button" class="compare-clear-btn" id="compare-clear-btn">Clear selection</button>';
    }
    html += '</div>';
    html += '<div class="compare-search-wrap">';
    html += '<input type="text" class="compare-search" id="compare-search" placeholder="Search deals by name, city, state..." aria-label="Search deals to compare">';
    html += '</div>';
    html += '<div class="compare-deal-grid" id="compare-deal-grid">';
    filtered.forEach(d => {
        const id = _compareDealId(d);
        const isSelected = selectedIds.has(id);
        const disabled = !isSelected && selectedIds.size >= 5;
        const stage = typeof normalizeStage === 'function' ? normalizeStage(d.Stage || d.stage) : (d.Stage || d.stage || '');
        const stageClass = _compareStageClass(stage);
        const name = d.ProjectName || d['Project Name'] || d.name || '';
        const city = d.City || d.city || '';
        const state = d.State || d.state || '';
        const loc = [city, state].filter(Boolean).join(', ');
        const units = d.UnitCount || d['Unit Count'] || '';

        html += '<div class="compare-deal-card' + (isSelected ? ' selected' : '') + (disabled ? ' disabled' : '') + '" data-deal-id="' + escapeHtml(id) + '">';
        html += '<div class="compare-deal-check">' + (isSelected ? '&#10003;' : '') + '</div>';
        html += '<div class="compare-deal-info">';
        html += '<span class="compare-deal-name">' + escapeHtml(name) + '</span>';
        html += '<span class="compare-deal-meta">';
        if (stage) html += '<span class="stage-badge stage-' + stageClass + '" style="font-size:10px;padding:1px 6px;">' + escapeHtml(stage) + '</span> ';
        if (loc) html += escapeHtml(loc);
        if (units) html += ' &middot; ' + escapeHtml(String(units)) + ' units';
        html += '</span>';
        html += '</div></div>';
    });
    html += '</div></div>'; // close grid + selector

    // Comparison table (only if 2+ deals selected)
    if (selectedDeals.length >= 2) {
        html += _renderComparisonTable(selectedDeals);
        html += _renderComparisonChart(selectedDeals);
    } else if (selectedDeals.length === 1) {
        html += '<div class="compare-prompt">Select at least one more deal to begin comparison.</div>';
    }

    html += '</div>'; // close wrapper
    container.innerHTML = html;

    // Wire up event handlers
    _setupComparablesHandlers(container, filtered);
}

function _compareDealId(deal) {
    return String(deal.ProjectId || deal.projectId || deal.DealId || deal.dealId || deal.gid || deal.ProjectName || deal['Project Name'] || '');
}

function _compareStageClass(stage) {
    if (!stage) return 'prospective';
    const s = stage.toLowerCase().replace(/\s+/g, '-');
    if (s.includes('prospect')) return 'prospective';
    if (s.includes('under-contract')) return 'under-contract';
    if (s.includes('construction') || s.includes('started')) return 'started';
    if (s.includes('lease') || s.includes('stabilized')) return 'stabilized';
    if (s.includes('closed')) return 'closed';
    if (s.includes('rejected') || s.includes('dead')) return 'closed';
    return 'prospective';
}

function _renderComparisonTable(deals) {
    // Define metrics with labels, accessor, formatter, and whether higher is better (true), lower is better (false), or neutral (null)
    const metrics = [
        { label: 'Project Name', get: d => d.ProjectName || d['Project Name'] || d.name || '', fmt: v => escapeHtml(v || ''), rank: null },
        { label: 'Stage', get: d => { const s = d.Stage || d.stage || ''; return typeof normalizeStage === 'function' ? normalizeStage(s) : s; }, fmt: v => escapeHtml(v || ''), rank: null },
        { label: 'City / State', get: d => [d.City || d.city, d.State || d.state].filter(Boolean).join(', '), fmt: v => escapeHtml(v || ''), rank: null },
        { label: 'Unit Count', get: d => _numVal(d.UnitCount || d['Unit Count']), fmt: v => _fmtNum(v), rank: true },
        { label: 'Acreage', get: d => _numVal(d.Acreage || d.acreage), fmt: v => v != null ? v.toFixed(2) : '-', rank: true },
        { label: 'Land Price', get: d => _numVal(d.LandPrice || d.landPrice), fmt: v => _fmtCurrency(v), rank: null },
        { label: '$/Unit', get: d => { const lp = _numVal(d.LandPrice || d.landPrice); const uc = _numVal(d.UnitCount || d['Unit Count']); return (lp && uc) ? lp / uc : null; }, fmt: v => _fmtCurrency(v), rank: false },
        { label: '$/SqFt', get: d => _numVal(d.SqFtPrice || d.PricePerSqFt || d.sqFtPrice), fmt: v => _fmtCurrency(v), rank: false },
        { label: 'Product Type', get: d => d.ProductType || d['Product Type'] || d['Product Type Custom'] || '', fmt: v => escapeHtml(v || '-'), rank: null },
        { label: 'Bank', get: d => d.Bank || d.bank || '', fmt: v => escapeHtml(v || '-'), rank: null },
        { label: 'Start Date', get: d => d.StartDate || d['Start Date'] || d['Start Date Custom'] || '', fmt: v => _fmtDate(v), rank: null },
        { label: 'Close Date', get: d => d.CloseDate || d['Close Date'] || d.closeDate || '', fmt: v => _fmtDate(v), rank: null },
        { label: 'Opportunity Zone', get: d => d.OpportunityZone ? 'Yes' : 'No', fmt: v => v, rank: null }
    ];

    let html = '<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th class="compare-metric-header">Metric</th>';
    deals.forEach(d => {
        const name = d.ProjectName || d['Project Name'] || d.name || '';
        html += '<th class="compare-deal-header">' + escapeHtml(name) + '</th>';
    });
    html += '</tr></thead><tbody>';

    metrics.forEach(m => {
        const values = deals.map(d => m.get(d));
        const numericValues = values.filter(v => v != null && typeof v === 'number' && !isNaN(v));

        let bestIdx = -1, worstIdx = -1;
        if (m.rank !== null && numericValues.length >= 2) {
            let bestVal = m.rank ? -Infinity : Infinity;
            let worstVal = m.rank ? Infinity : -Infinity;
            values.forEach((v, i) => {
                if (v == null || typeof v !== 'number' || isNaN(v)) return;
                if (m.rank) { // higher is better
                    if (v > bestVal) { bestVal = v; bestIdx = i; }
                    if (v < worstVal) { worstVal = v; worstIdx = i; }
                } else { // lower is better
                    if (v < bestVal) { bestVal = v; bestIdx = i; }
                    if (v > worstVal) { worstVal = v; worstIdx = i; }
                }
            });
            // Only highlight if there is actual differentiation
            if (bestVal === worstVal) { bestIdx = -1; worstIdx = -1; }
        }

        html += '<tr><td class="compare-metric-label">' + escapeHtml(m.label) + '</td>';
        values.forEach((v, i) => {
            let cls = '';
            if (i === bestIdx) cls = ' compare-best';
            else if (i === worstIdx) cls = ' compare-worst';
            html += '<td class="compare-value' + cls + '">' + m.fmt(v) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
}

function _renderComparisonChart(deals) {
    // Only render chart placeholder; actual Chart.js initialization happens in _setupComparablesHandlers
    return '<div class="compare-chart-section">' +
        '<h3 class="compare-chart-title">Visual Comparison</h3>' +
        '<canvas id="compare-chart" width="600" height="300"></canvas>' +
        '</div>';
}

function _initCompareChart(deals) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('compare-chart');
    if (!canvas) return;

    if (window._compareChartInstance) {
        window._compareChartInstance.destroy();
        window._compareChartInstance = null;
    }

    const labels = deals.map(d => {
        const name = d.ProjectName || d['Project Name'] || d.name || '';
        return name.length > 20 ? name.substring(0, 18) + '...' : name;
    });

    const unitCounts = deals.map(d => _numVal(d.UnitCount || d['Unit Count']) || 0);
    const landPrices = deals.map(d => (_numVal(d.LandPrice || d.landPrice) || 0) / 1000); // in thousands
    const perUnit = deals.map(d => {
        const lp = _numVal(d.LandPrice || d.landPrice);
        const uc = _numVal(d.UnitCount || d['Unit Count']);
        return (lp && uc) ? Math.round(lp / uc) : 0;
    });

    window._compareChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Unit Count',
                    data: unitCounts,
                    backgroundColor: 'rgba(126, 138, 107, 0.7)',
                    borderColor: 'rgba(126, 138, 107, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Land Price ($K)',
                    data: landPrices,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                },
                {
                    label: '$/Unit',
                    data: perUnit,
                    backgroundColor: 'rgba(245, 158, 11, 0.7)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            let val = ctx.parsed.y;
                            if (ctx.dataset.label === 'Land Price ($K)') return ctx.dataset.label + ': $' + val.toLocaleString() + 'K';
                            if (ctx.dataset.label === '$/Unit') return ctx.dataset.label + ': $' + val.toLocaleString();
                            return ctx.dataset.label + ': ' + val.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Unit Count' }, beginAtZero: true },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Dollars ($K / $/Unit)' }, beginAtZero: true, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function _setupComparablesHandlers(container, allFilteredDeals) {
    // Card click to toggle selection
    container.querySelectorAll('.compare-deal-card').forEach(card => {
        card.addEventListener('click', function() {
            const id = this.getAttribute('data-deal-id');
            if (!id) return;
            const selected = window._compareSelectedIds;
            if (selected.has(id)) {
                selected.delete(id);
            } else {
                if (selected.size >= 5) {
                    if (typeof showToast === 'function') showToast('Maximum 5 deals for comparison', 'info');
                    return;
                }
                selected.add(id);
            }
            // Re-render
            renderComparablesView(typeof allDeals !== 'undefined' ? allDeals : allFilteredDeals);
        });
    });

    // Clear selection
    const clearBtn = document.getElementById('compare-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            window._compareSelectedIds.clear();
            renderComparablesView(typeof allDeals !== 'undefined' ? allDeals : allFilteredDeals);
        });
    }

    // Search filter
    const searchInput = document.getElementById('compare-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const q = this.value.toLowerCase().trim();
            container.querySelectorAll('.compare-deal-card').forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = (!q || text.includes(q)) ? '' : 'none';
            });
        });
        // Restore focus if we had it before re-render
        if (document.activeElement === document.body) {
            // Don't auto-focus; user might be scrolling
        }
    }

    // Initialize chart if we have enough selected deals
    const selectedDeals = allFilteredDeals.filter(d => window._compareSelectedIds.has(_compareDealId(d)));
    if (selectedDeals.length >= 2) {
        setTimeout(() => _initCompareChart(selectedDeals), 50);
    }
}

// Helper functions
function _numVal(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function _fmtNum(v) {
    if (v == null) return '-';
    return Number(v).toLocaleString();
}

function _fmtCurrency(v) {
    if (v == null) return '-';
    return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function _fmtDate(v) {
    if (!v) return '-';
    try {
        const d = new Date(v);
        if (isNaN(d.getTime())) return escapeHtml(String(v));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        return escapeHtml(String(v));
    }
}
