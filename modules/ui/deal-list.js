// modules/ui/deal-list.js — Deal list rendering (table rows, list by location/stage)
import { state, STAGE_CONFIG, STAGE_DISPLAY_ORDER } from '../core/state.js';
import { formatDate, isOverdue } from '../core/utils.js';
import { normalizeStage, getDealLocation, getDealProductType, applyFilters, sortDeal, groupDealsByStage, groupDealsByYear } from '../data/transforms.js';
import { renderActiveFilters } from './filters.js';

const $ = (sel, root) => (root || document).querySelector(sel);

/* ---------- Single row renderers ---------- */

export function renderDealRow(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const dealName = deal.Name || deal.name || 'Unnamed Deal';
    const dealId = deal.DealPipelineId || '';
    const { isAuthenticated, isEditMode } = state;
    return `
        <tr class="deal-row" data-deal-name="${(dealName).replace(/"/g,'&quot;')}" data-deal-id="${dealId}" style="cursor: pointer;">
            <td class="deal-name" data-label="Name">${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}${dealName}</td>
            <td class="deal-cell" data-label="Stage"><span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span></td>
            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">${formatDate(deal['Start Date'] || deal.startDate) || '-'}${(deal._procoreOverridesStartDate || (deal['Start Date Source'] && String(deal['Start Date Source']).toLowerCase() === 'procore')) ? ' <span class="date-source-procore" title="Start date controlled by Procore">(Procore)</span>' : ''}</td>
            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
            <td class="deal-cell" data-label="Location">${(() => { const loc = getDealLocation(deal); return loc ? `<span class="location-badge clickable" data-location="${loc}">${loc}</span>` : '-'; })()}</td>
            <td class="deal-cell yoc-cell" data-label="Yield on Cost">${(() => { const yoc = deal._yieldOnCost; if (yoc != null && !isNaN(yoc)) return `<span class="yoc-value" title="Yield on Cost">${yoc.toFixed(1)}%</span>`; return '<span class="yoc-na" title="Insufficient data">N/A</span>'; })()}</td>
            <td class="deal-cell date-display date-added-cell" data-label="Date Added">${(() => { const ca = deal.CreatedAt; if (!ca) return '-'; const d = new Date(ca); if (isNaN(d.getTime())) return '-'; return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })()}</td>
            <td class="deal-cell date-display updated-cell" data-label="Last Updated">${(() => { const ua = deal.UpdatedAt || deal.CreatedAt; if (!ua) return '-'; const d = new Date(ua); if (isNaN(d.getTime())) return '-'; const now = new Date(); const diffDays = Math.floor((now - d) / 86400000); if (diffDays === 0) return 'Today'; if (diffDays === 1) return 'Yesterday'; if (diffDays < 30) return `${diffDays}d ago`; return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`; })()}</td>
            <td class="deal-cell notes-cell clickable" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">${deal.Notes || deal.notes ? `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : '-'}</td>
            <td class="deal-cell actions-cell" data-label="Actions">
                <button type="button" class="deal-files-view-btn" data-deal-name="${(dealName || '').replace(/"/g, '&quot;')}" title="Open deal and view/download/upload files" onclick="event.stopPropagation();">View deal &amp; files</button>
                ${isAuthenticated && isEditMode ? `<button class="deal-edit-btn-small" data-deal-id="${dealId}" onclick="event.stopPropagation(); (function() { const deal = window.allDeals.find(d => d.DealPipelineId === ${dealId}); if (deal) window.openDealEditModal(deal); })();">Edit</button>` : ''}
            </td>
        </tr>`;
}

export function renderDealRowCompact(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const dealName = deal.Name || deal.name || 'Unnamed Deal';
    const dealId = deal.DealPipelineId || '';
    const { isAuthenticated, isEditMode } = state;
    return `
        <tr class="deal-row" data-deal-name="${(dealName).replace(/"/g,'&quot;')}" data-deal-id="${dealId}" style="cursor: pointer;">
            <td class="deal-name" data-label="Name">${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}${dealName}</td>
            <td class="deal-cell" data-label="Stage"><span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span></td>
            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">${formatDate(deal['Start Date'] || deal.startDate) || '-'}${(deal._procoreOverridesStartDate || (deal['Start Date Source'] && String(deal['Start Date Source']).toLowerCase() === 'procore')) ? ' <span class="date-source-procore">(Procore)</span>' : ''}</td>
            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
            <td class="deal-cell" data-label="Location">${(() => { const loc = getDealLocation(deal); return loc ? `<span class="location-badge clickable" data-location="${loc}">${loc}</span>` : '-'; })()}</td>
            <td class="deal-cell notes-cell" data-label="Notes">${deal.Notes || deal.notes ? `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 80)}${(deal.Notes || deal.notes).length > 80 ? '...' : ''}</span>` : '-'}</td>
            <td class="deal-cell actions-cell" data-label="Actions">
                <button type="button" class="deal-files-view-btn" data-deal-name="${(dealName || '').replace(/"/g, '&quot;')}" title="View deal &amp; files" onclick="event.stopPropagation();">View deal &amp; files</button>
                ${isAuthenticated && isEditMode ? `<button class="deal-edit-btn-small" data-deal-id="${dealId}" onclick="event.stopPropagation(); (function() { const deal = window.allDeals.find(d => d.DealPipelineId === ${dealId}); if (deal) window.openDealEditModal(deal); })();">Edit</button>` : ''}
            </td>
        </tr>`;
}

/* ---------- Stage group ---------- */

export function renderStageGroup(stage, deals) {
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const totalUnits = deals.reduce((sum, d) => sum + (parseInt(d['Unit Count'] || d.unitCount || 0) || 0), 0);
    const isStart = stage === 'START';
    return `
        <div class="stage-group${isStart ? ' start-group' : ''}" data-stage="${stage}">
            <div class="stage-group-header">
                <button type="button" class="stage-group-toggle" aria-expanded="true" aria-label="Toggle ${stage} group">
                    <span class="stage-badge ${stageConfig.class}">${stage}</span>
                    <span class="stage-group-count">${deals.length} deal${deals.length !== 1 ? 's' : ''}${totalUnits > 0 ? ` · ${totalUnits.toLocaleString()} units` : ''}</span>
                    <span class="toggle-icon" aria-hidden="true">▾</span>
                </button>
            </div>
            <div class="stage-group-content" style="display: block;">
                ${deals.length === 0 ? '<div class="stage-group-empty">No deals</div>' : `
                <table class="deal-table">
                    <thead><tr>
                        <th>Name</th><th>Stage</th><th>Units</th><th>Start Date</th>
                        <th>Bank</th><th>Product Type</th><th>Location</th>
                        <th>Notes</th><th>Actions</th>
                    </tr></thead>
                    <tbody>${deals.map(d => renderDealRowCompact(d)).join('')}</tbody>
                </table>`}
            </div>
        </div>`;
}

/* ---------- By-location list ---------- */

export function renderDealListByLocation(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true);
    const sortConfig = window.listViewSort || { by: 'name', order: 'asc' };

    // Group by location
    const byLocation = {};
    filtered.forEach(deal => {
        const loc = getDealLocation(deal) || 'Unknown';
        if (!byLocation[loc]) byLocation[loc] = [];
        byLocation[loc].push(deal);
    });

    // Sort within each group
    Object.keys(byLocation).forEach(loc => byLocation[loc].sort((a, b) => sortDeal(a, b, sortConfig)));

    // Sort locations alphabetically, 'Unknown' last
    const locations = Object.keys(byLocation).sort((a, b) => {
        if (a === 'Unknown') return 1; if (b === 'Unknown') return -1;
        return a.localeCompare(b);
    });

    if (locations.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-text">No deals found</div><div class="empty-state-subtext">Try adjusting your filters</div></div>`;
        return;
    }

    container.innerHTML = renderActiveFilters() + locations.map(loc => {
        const locDeals = byLocation[loc];
        const totalUnits = locDeals.reduce((s, d) => s + (parseInt(d['Unit Count'] || d.unitCount || 0) || 0), 0);
        return `
            <div class="location-group" data-location="${loc.replace(/"/g,'&quot;')}">
                <div class="location-group-header">
                    <button type="button" class="stage-group-toggle" aria-expanded="true" aria-label="Toggle ${loc} group">
                        <span class="location-badge">${loc}</span>
                        <span class="stage-group-count">${locDeals.length} deal${locDeals.length !== 1 ? 's' : ''}${totalUnits > 0 ? ` · ${totalUnits.toLocaleString()} units` : ''}</span>
                        <span class="toggle-icon" aria-hidden="true">▾</span>
                    </button>
                </div>
                <div class="stage-group-content" style="display: block;">
                    <table class="deal-table">
                        <thead><tr><th>Name</th><th>Stage</th><th>Units</th><th>Start Date</th><th>Bank</th><th>Product Type</th><th>Location</th><th>Notes</th><th>Actions</th></tr></thead>
                        <tbody>${locDeals.map(d => renderDealRowCompact(d)).join('')}</tbody>
                    </table>
                </div>
            </div>`;
    }).join('');
}

/* ---------- By-stage list ---------- */

export function renderDealListByStage(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true);
    const stageGrouped = groupDealsByStage(filtered);
    const listSortConfig = window.listViewSort || { by: 'name', order: 'asc' };
    Object.keys(stageGrouped).forEach(stage => { stageGrouped[stage].sort((a, b) => sortDeal(a, b, listSortConfig)); });
    container.innerHTML = renderActiveFilters() + STAGE_DISPLAY_ORDER.map(stage => {
        const groupDeals = stageGrouped[stage] || [];
        if (stage === 'START') return '';
        return renderStageGroup(stage, groupDeals);
    }).join('');
}

/* ---------- Flat list (no grouping) ---------- */

export function renderDealListFlat(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true);
    const sortConfig = window.listViewSort || { by: 'date', order: 'asc' };
    const sorted = [...filtered].sort((a, b) => sortDeal(a, b, sortConfig));

    if (sorted.length === 0) {
        container.innerHTML = `${renderActiveFilters()}<div class="empty-state"><div class="empty-state-text">No deals found</div><div class="empty-state-subtext">Try adjusting your filters</div></div>`;
        return;
    }

    container.innerHTML = `${renderActiveFilters()}
        <table class="deal-list-table list-view-table">
            <thead><tr>
                <th class="sortable-header" data-sort-by="name" data-sort-order="${sortConfig.by === 'name' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Name${sortConfig.by === 'name' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="stage" data-sort-order="${sortConfig.by === 'stage' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Stage${sortConfig.by === 'stage' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="units" data-sort-order="${sortConfig.by === 'units' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Units${sortConfig.by === 'units' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="date" data-sort-order="${sortConfig.by === 'date' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Start Date${sortConfig.by === 'date' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="bank" data-sort-order="${sortConfig.by === 'bank' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Bank${sortConfig.by === 'bank' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="product" data-sort-order="${sortConfig.by === 'product' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Product Type${sortConfig.by === 'product' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="location" data-sort-order="${sortConfig.by === 'location' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Location${sortConfig.by === 'location' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="yoc" data-sort-order="${sortConfig.by === 'yoc' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">YoC${sortConfig.by === 'yoc' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="dateAdded" data-sort-order="${sortConfig.by === 'dateAdded' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Date Added${sortConfig.by === 'dateAdded' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th class="sortable-header" data-sort-by="updated" data-sort-order="${sortConfig.by === 'updated' && sortConfig.order === 'asc' ? 'desc' : 'asc'}">Updated${sortConfig.by === 'updated' ? (sortConfig.order === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                <th>Notes</th>
                <th>Actions</th>
            </tr></thead>
            <tbody>${sorted.map(d => renderDealRow(d)).join('')}</tbody>
        </table>`;
}

/* ---------- Main deal list ---------- */

export async function renderDealList(deals) {
    const container = document.getElementById('deal-list-container');
    if (!deals || deals.length === 0) {
        container.innerHTML = `<div class="empty-state"><img src="Logos/STOA20-Logo-Mark-Grey.jpg" alt="STOA" class="stoa-logo" /><div class="empty-state-text">No deals found</div><div class="empty-state-subtext">Try adjusting your filters</div></div>`;
        return;
    }
    // Hide the grouping toggle — list view is now a flat table
    const toggle = document.getElementById('list-view-toggle');
    if (toggle) toggle.style.display = 'none';

    // Always render a flat list — filters from the grey bar control what's shown
    renderDealListFlat(deals);
    if (typeof window.__setupDrillDownHandlers === 'function') window.__setupDrillDownHandlers();
}

/* ---------- Visible deal count badge ---------- */

export function updateVisibleDealCount(deals) {
    const source = deals != null ? deals : state.allDeals;
    const filtered = Array.isArray(source) && source.length > 0 ? applyFilters(source, true) : [];
    const badge = document.getElementById('visible-deal-count-badge');
    if (!badge) return;

    var mapContainer = document.getElementById('map-canvas-container');
    var isMapView = mapContainer !== null;

    if (isMapView && typeof mapMarkers !== 'undefined' && mapMarkers.length > 0) {
        var firstMarker = mapMarkers[0];
        var isCityGrouped = firstMarker && firstMarker.deals && Array.isArray(firstMarker.deals);
        if (isCityGrouped) {
            var locCount = mapMarkers.length;
            badge.textContent = locCount === 1 ? '1 location' : locCount + ' locations';
        } else {
            var dealCount = mapMarkers.length;
            badge.textContent = dealCount === 1 ? '1 deal' : dealCount + ' deals';
        }
    } else {
        badge.textContent = filtered.length === 1 ? '1 deal' : filtered.length + ' deals';
    }
    badge.style.display = '';
}

/* ---------- Mobile cards ---------- */

export function renderMobileDealCards(deals) {
    const container = document.getElementById('mobile-deal-cards-container');
    if (!container) return;
    if (!deals || deals.length === 0) {
        container.innerHTML = '<div class="mobile-empty-state"><p>No deals found</p><p class="mobile-empty-sub">Try adjusting your filters</p></div>';
        return;
    }
    const sortConfig = window.listViewSort || state.currentSort || { by: 'date', order: 'asc' };
    const sorted = [...deals].sort((a, b) => sortDeal(a, b, sortConfig));
    container.innerHTML = sorted.map(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
        const loc = getDealLocation(deal) || '';
        const units = deal['Unit Count'] || deal.unitCount || '';
        const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
        const dateStr = startDate ? (typeof startDate === 'string' ? startDate.split('T')[0] : new Date(startDate).toISOString().split('T')[0]) : '';
        const name = (deal.Name || deal.name || 'Unnamed').replace(/</g, '&lt;');
        return `<div class="mobile-deal-card" data-deal-id="${String(deal.DealPipelineId || deal.id || '').replace(/"/g,'&quot;')}" role="button" tabindex="0">
            <div class="mobile-deal-card-header"><span class="stage-badge ${cfg.class}">${stage}</span><span class="mobile-deal-card-name">${name}</span></div>
            <div class="mobile-deal-card-meta">${loc ? '<span>' + loc.replace(/</g,'&lt;') + '</span>' : ''}${units ? '<span>' + units + ' units</span>' : ''}${dateStr ? '<span>' + dateStr + '</span>' : ''}</div>
        </div>`;
    }).join('');
    container.querySelectorAll('.mobile-deal-card').forEach(card => {
        const id = card.dataset.dealId;
        const deal = (window.allDeals || []).find(d => String(d.DealPipelineId || d.id || '') === id) || sorted.find(d => String(d.DealPipelineId || d.id || '') === id);
        if (deal) {
            card.addEventListener('click', () => { if (typeof window.showDealDetail === 'function') window.showDealDetail(deal); });
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (typeof window.showDealDetail === 'function') window.showDealDetail(deal); } });
        }
    });
}
