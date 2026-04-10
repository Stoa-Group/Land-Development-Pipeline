/**
 * app-charts.js — Charts & Analytics dashboard
 * Plain <script> (not ES module). Uses Chart.js for visualizations.
 */

/* jshint esversion: 11 */

// Store chart instances for cleanup
var _chartInstances = {};

function _destroyChart(key) {
    if (_chartInstances[key]) {
        _chartInstances[key].destroy();
        _chartInstances[key] = null;
    }
}

function _destroyAllCharts() {
    Object.keys(_chartInstances).forEach(_destroyChart);
}

/**
 * Shared Chart.js defaults matching the dashboard palette
 */
function _getChartDefaults() {
    var style = getComputedStyle(document.documentElement);
    return {
        textPrimary: style.getPropertyValue('--text-primary').trim() || '#1f2937',
        textSecondary: style.getPropertyValue('--text-secondary').trim() || '#6b7280',
        primaryGreen: style.getPropertyValue('--primary-green').trim() || '#7e8a6b',
        white: style.getPropertyValue('--white').trim() || '#ffffff',
        borderColor: style.getPropertyValue('--border-color').trim() || '#e5e7eb',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    };
}

/**
 * Main entry: build the Charts & Analytics view.
 * @param {Array} deals - all deals (will be filtered internally)
 */
function renderCharts(deals) {
    _destroyAllCharts();

    var filtered = typeof applyFilters === 'function' ? applyFilters(deals, true) : deals;
    var container = document.getElementById('deal-list-container');
    if (!container) return;

    container.innerHTML =
        '<div class="charts-analytics-header">' +
            '<h2 class="charts-analytics-title">Charts &amp; Analytics</h2>' +
            '<p class="charts-analytics-subtitle">' + filtered.length + ' deals after current filters</p>' +
        '</div>' +
        '<div class="charts-grid">' +
            _chartCard('chart-pipeline-stage', 'Pipeline by Stage', 'Deal and unit counts per stage') +
            _chartCard('chart-deal-flow', 'Deal Flow Over Time', 'Deals added per month (last 12 months)') +
            _chartCard('chart-geo', 'Geographic Distribution', 'Top 10 states by deal count') +
            _chartCard('chart-product', 'Product Type Breakdown', 'Distribution by product type') +
            _chartCard('chart-bank', 'Bank Exposure', 'Top 10 banks by deal count') +
            _chartCard('chart-velocity', 'Stage Velocity', 'Average days in pipeline per stage') +
        '</div>';

    // Defer rendering so the DOM is ready and canvas elements exist
    requestAnimationFrame(function () {
        var pal = _getChartDefaults();
        _renderPipelineByStage(filtered, pal);
        _renderDealFlow(filtered, pal);
        _renderGeoDistribution(filtered, pal);
        _renderProductType(filtered, pal);
        _renderBankExposure(filtered, pal);
        _renderStageVelocity(filtered, pal);
    });
}

function _chartCard(id, title, subtitle) {
    return (
        '<div class="chart-card">' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            '<p class="chart-subtitle">' + escapeHtml(subtitle) + '</p>' +
            '<div class="chart-container"><canvas id="' + id + '"></canvas></div>' +
        '</div>'
    );
}

/* ── Chart 1: Pipeline by Stage (horizontal bar) ─────────────────── */
function _renderPipelineByStage(deals, pal) {
    var order = (typeof STAGE_DISPLAY_ORDER !== 'undefined') ? STAGE_DISPLAY_ORDER : [];
    var config = (typeof STAGE_CONFIG !== 'undefined') ? STAGE_CONFIG : {};

    // Count deals and units per stage
    var stageCounts = {};
    var stageUnits = {};
    deals.forEach(function (d) {
        var stage = (typeof normalizeStage === 'function') ? normalizeStage(d.Stage || d.stage) : (d.Stage || d.stage || 'Other');
        if (stage === 'START' || stage === 'HoldCo') return;
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        var units = parseInt(d['Unit Count'] || d.unitCount || 0) || 0;
        stageUnits[stage] = (stageUnits[stage] || 0) + units;
    });

    // Build ordered labels
    var labels = order.filter(function (s) { return stageCounts[s]; });
    Object.keys(stageCounts).forEach(function (s) {
        if (labels.indexOf(s) === -1) labels.push(s);
    });

    var colors = labels.map(function (s) { return (config[s] && config[s].color) || pal.primaryGreen; });
    var counts = labels.map(function (s) { return stageCounts[s] || 0; });
    var units = labels.map(function (s) { return stageUnits[s] || 0; });

    var ctx = document.getElementById('chart-pipeline-stage');
    if (!ctx) return;
    _destroyChart('pipelineStage');
    _chartInstances.pipelineStage = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Deals',
                    data: counts,
                    backgroundColor: colors,
                    borderRadius: 4
                },
                {
                    label: 'Units',
                    data: units,
                    backgroundColor: colors.map(function (c) { return c + '66'; }), // 40% opacity
                    borderRadius: 4
                }
            ]
        },
        options: _horizontalBarOptions(pal)
    });
}

/* ── Chart 2: Deal Flow Over Time (line) ──────────────────────────── */
function _renderDealFlow(deals, pal) {
    // Build last 12 months
    var months = [];
    var now = new Date();
    for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
    }

    var buckets = {};
    months.forEach(function (m) { buckets[m.key] = 0; });

    deals.forEach(function (deal) {
        var raw = deal.DateAdded || deal.dateAdded || deal.CreatedAt || deal.createdAt || deal['Start Date'] || deal.startDate;
        if (!raw) return;
        var dt = new Date(raw);
        if (isNaN(dt.getTime())) return;
        var key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        if (typeof buckets[key] !== 'undefined') {
            buckets[key]++;
        }
    });

    var labels = months.map(function (m) { return m.label; });
    var data = months.map(function (m) { return buckets[m.key]; });

    var ctx = document.getElementById('chart-deal-flow');
    if (!ctx) return;
    _destroyChart('dealFlow');
    _chartInstances.dealFlow = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Deals Added',
                data: data,
                borderColor: pal.primaryGreen,
                backgroundColor: pal.primaryGreen + '33',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: pal.primaryGreen
            }]
        },
        options: _lineOptions(pal)
    });
}

/* ── Chart 3: Geographic Distribution (bar) ───────────────────────── */
function _renderGeoDistribution(deals, pal) {
    var stateCounts = {};
    deals.forEach(function (deal) {
        var loc = (typeof getDealLocation === 'function') ? getDealLocation(deal) : (deal.Location || deal.location || '');
        var match = (loc || '').match(/,\s*([A-Z]{2})$/);
        var state = match ? match[1] : 'Other';
        stateCounts[state] = (stateCounts[state] || 0) + 1;
    });

    // Sort descending, take top 10
    var sorted = Object.keys(stateCounts)
        .filter(function (s) { return s !== 'Unknown' && s !== 'Other'; })
        .sort(function (a, b) { return stateCounts[b] - stateCounts[a]; })
        .slice(0, 10);

    var labels = sorted;
    var data = sorted.map(function (s) { return stateCounts[s]; });

    // Gradient of the primary green
    var barColors = data.map(function (_, i) {
        var opacity = 1 - (i * 0.06);
        return pal.primaryGreen + Math.round(opacity * 255).toString(16).padStart(2, '0');
    });

    var ctx = document.getElementById('chart-geo');
    if (!ctx) return;
    _destroyChart('geo');
    _chartInstances.geo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Deals',
                data: data,
                backgroundColor: barColors,
                borderRadius: 4
            }]
        },
        options: _verticalBarOptions(pal)
    });
}

/* ── Chart 4: Product Type Breakdown (doughnut) ───────────────────── */
function _renderProductType(deals, pal) {
    var typeCounts = {};
    deals.forEach(function (deal) {
        var pt = (typeof getDealProductType === 'function') ? getDealProductType(deal) : (deal['Product Type'] || deal.productType || 'Other');
        typeCounts[pt] = (typeCounts[pt] || 0) + 1;
    });

    var labels = Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; });
    var data = labels.map(function (l) { return typeCounts[l]; });
    var total = data.reduce(function (a, b) { return a + b; }, 0);

    var palette = ['#7e8a6b', '#c026d3', '#9333ea', '#dc2626', '#ea580c', '#eab308', '#22c55e', '#14b8a6', '#6b7280', '#374151'];

    var ctx = document.getElementById('chart-product');
    if (!ctx) return;
    _destroyChart('product');
    _chartInstances.product = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: palette.slice(0, labels.length),
                borderWidth: 2,
                borderColor: pal.white
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: pal.textPrimary,
                        font: { family: pal.fontFamily, size: 12 },
                        padding: 12,
                        generateLabels: function (chart) {
                            var ds = chart.data.datasets[0];
                            return chart.data.labels.map(function (label, i) {
                                var val = ds.data[i];
                                var pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return {
                                    text: label + ' (' + val + ', ' + pct + '%)',
                                    fillStyle: ds.backgroundColor[i],
                                    strokeStyle: ds.borderColor,
                                    lineWidth: ds.borderWidth,
                                    index: i,
                                    hidden: false
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            var val = ctx.parsed;
                            var pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return ctx.label + ': ' + val + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

/* ── Chart 5: Bank Exposure (horizontal bar) ──────────────────────── */
function _renderBankExposure(deals, pal) {
    var bankCounts = {};
    var bankUnits = {};
    deals.forEach(function (deal) {
        var bank = deal.Bank || deal.bank || 'Unknown';
        if (bank === 'Unknown' || bank === '' || bank === 'N/A' || bank === 'TBD') return;
        var canonical = (typeof getCanonicalBankName === 'function') ? getCanonicalBankName(bank) : bank;
        bankCounts[canonical] = (bankCounts[canonical] || 0) + 1;
        var units = parseInt(deal['Unit Count'] || deal.unitCount || 0) || 0;
        bankUnits[canonical] = (bankUnits[canonical] || 0) + units;
    });

    var sorted = Object.keys(bankCounts)
        .sort(function (a, b) { return bankCounts[b] - bankCounts[a]; })
        .slice(0, 10);

    var labels = sorted;
    var counts = sorted.map(function (b) { return bankCounts[b]; });
    var units = sorted.map(function (b) { return bankUnits[b]; });

    var ctx = document.getElementById('chart-bank');
    if (!ctx) return;
    _destroyChart('bank');
    _chartInstances.bank = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Deals',
                    data: counts,
                    backgroundColor: pal.primaryGreen,
                    borderRadius: 4
                },
                {
                    label: 'Units',
                    data: units,
                    backgroundColor: pal.primaryGreen + '55',
                    borderRadius: 4
                }
            ]
        },
        options: _horizontalBarOptions(pal)
    });
}

/* ── Chart 6: Stage Velocity (bar) ────────────────────────────────── */
function _renderStageVelocity(deals, pal) {
    var order = (typeof STAGE_DISPLAY_ORDER !== 'undefined') ? STAGE_DISPLAY_ORDER : [];
    var config = (typeof STAGE_CONFIG !== 'undefined') ? STAGE_CONFIG : {};
    var now = Date.now();

    // Accumulate days since start date per stage
    var stageDays = {};
    var stageDealCount = {};
    deals.forEach(function (deal) {
        var stage = (typeof normalizeStage === 'function') ? normalizeStage(deal.Stage || deal.stage) : (deal.Stage || deal.stage || 'Other');
        if (stage === 'START' || stage === 'HoldCo') return;
        var raw = deal['Start Date'] || deal.startDate || deal.DateAdded || deal.dateAdded || deal.CreatedAt || deal.createdAt;
        if (!raw) return;
        var dt = new Date(raw);
        if (isNaN(dt.getTime())) return;
        var days = Math.max(0, Math.round((now - dt.getTime()) / 86400000));
        stageDays[stage] = (stageDays[stage] || 0) + days;
        stageDealCount[stage] = (stageDealCount[stage] || 0) + 1;
    });

    var labels = order.filter(function (s) { return stageDealCount[s]; });
    Object.keys(stageDealCount).forEach(function (s) {
        if (labels.indexOf(s) === -1) labels.push(s);
    });

    var avgDays = labels.map(function (s) {
        return stageDealCount[s] ? Math.round(stageDays[s] / stageDealCount[s]) : 0;
    });
    var colors = labels.map(function (s) { return (config[s] && config[s].color) || pal.primaryGreen; });

    var ctx = document.getElementById('chart-velocity');
    if (!ctx) return;
    _destroyChart('velocity');
    _chartInstances.velocity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Avg Days Since Start Date',
                data: avgDays,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: _verticalBarOptions(pal, 'Days')
    });
}

/* ── Shared chart option builders ─────────────────────────────────── */
function _horizontalBarOptions(pal) {
    return {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                beginAtZero: true,
                grid: { color: pal.borderColor },
                ticks: { color: pal.textSecondary, font: { family: pal.fontFamily, size: 11 } }
            },
            y: {
                grid: { display: false },
                ticks: { color: pal.textPrimary, font: { family: pal.fontFamily, size: 12 } }
            }
        },
        plugins: {
            legend: {
                labels: { color: pal.textPrimary, font: { family: pal.fontFamily, size: 12 }, padding: 12 }
            },
            tooltip: { titleFont: { family: pal.fontFamily }, bodyFont: { family: pal.fontFamily } }
        }
    };
}

function _verticalBarOptions(pal, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                title: yLabel ? { display: true, text: yLabel, color: pal.textSecondary, font: { family: pal.fontFamily, size: 12 } } : undefined,
                grid: { color: pal.borderColor },
                ticks: { color: pal.textSecondary, font: { family: pal.fontFamily, size: 11 } }
            },
            x: {
                grid: { display: false },
                ticks: { color: pal.textPrimary, font: { family: pal.fontFamily, size: 12 } }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { titleFont: { family: pal.fontFamily }, bodyFont: { family: pal.fontFamily } }
        }
    };
}

function _lineOptions(pal) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: pal.borderColor },
                ticks: { color: pal.textSecondary, font: { family: pal.fontFamily, size: 11 }, precision: 0 }
            },
            x: {
                grid: { display: false },
                ticks: { color: pal.textPrimary, font: { family: pal.fontFamily, size: 11 } }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { titleFont: { family: pal.fontFamily }, bodyFont: { family: pal.fontFamily } }
        }
    };
}
