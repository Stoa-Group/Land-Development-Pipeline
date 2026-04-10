/**
 * app-kanban.js — Kanban board view with drag-and-drop stage columns
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

/**
 * Render a Kanban board with stage columns. Cards can be dragged between columns
 * to change a deal's stage (admin-only, requires confirmation).
 * @param {Array} deals - The full deals array (window.allDeals)
 * @returns {string} HTML string for the kanban board
 */
function renderKanban(deals) {
    // Archive stages that go into the collapsed bottom section
    var ARCHIVE_STAGES = ['Dead', 'Rejected'];

    // Build active columns from STAGE_DISPLAY_ORDER, excluding archive + START/HoldCo
    var activeStages = STAGE_DISPLAY_ORDER.filter(function (s) {
        return ARCHIVE_STAGES.indexOf(s) === -1 && s !== 'START' && s !== 'HoldCo';
    });

    // Apply current filters to deals
    var filteredDeals = applyFilters(deals, true);

    // Group deals by normalised stage
    var dealsByStage = {};
    activeStages.forEach(function (s) { dealsByStage[s] = []; });
    ARCHIVE_STAGES.forEach(function (s) { dealsByStage[s] = []; });

    filteredDeals.forEach(function (deal) {
        var stage = normalizeStage(deal.Stage || deal.stage);
        if (stage === 'START' || stage === 'HoldCo') return;
        // Handle Lease-up / Lease-Up variation
        if (stage === 'Lease-up') stage = 'Lease-Up';
        if (stage === 'Commercial Land Listed') stage = 'Commercial Land - Listed';
        if (dealsByStage[stage]) {
            dealsByStage[stage].push(deal);
        } else {
            // Unknown stage — put in first active column
            if (activeStages.length > 0) dealsByStage[activeStages[0]].push(deal);
        }
    });

    // Build column HTML
    var columnsHtml = activeStages.map(function (stage) {
        return _kanbanColumnHtml(stage, dealsByStage[stage]);
    }).join('');

    // Archive section
    var archiveDeals = [];
    ARCHIVE_STAGES.forEach(function (s) { archiveDeals = archiveDeals.concat(dealsByStage[s] || []); });
    var archiveCount = archiveDeals.length;
    var archiveUnits = archiveDeals.reduce(function (sum, d) {
        return sum + (parseInt(d['Unit Count'] || d.unitCount || 0) || 0);
    }, 0);
    var archiveCardsHtml = archiveDeals.map(function (deal) {
        return _kanbanCardHtml(deal);
    }).join('');

    var html = '<div class="kanban-wrapper">' +
        '<div class="kanban-search-bar">' +
            '<input type="text" class="kanban-search-input" id="kanban-search-input" placeholder="Search cards..." aria-label="Search kanban cards">' +
        '</div>' +
        '<div class="kanban-board" id="kanban-board">' +
            columnsHtml +
        '</div>' +
        '<div class="kanban-archive" id="kanban-archive">' +
            '<button type="button" class="kanban-archive-toggle" id="kanban-archive-toggle" aria-expanded="false">' +
                '<span class="kanban-archive-arrow">&#9654;</span> Archive (Dead / Rejected) ' +
                '<span class="kanban-column-count">' + archiveCount + '</span>' +
                (archiveUnits > 0 ? ' <span class="kanban-column-units">' + archiveUnits.toLocaleString() + ' units</span>' : '') +
            '</button>' +
            '<div class="kanban-archive-content" id="kanban-archive-content" style="display:none;">' +
                '<div class="kanban-archive-cards">' +
                    (archiveCardsHtml || '<div class="kanban-empty">No archived deals</div>') +
                '</div>' +
            '</div>' +
        '</div>' +
    '</div>';

    // Attach event listeners after DOM update
    setTimeout(function () { _kanbanBindEvents(); }, 0);

    return html;
}

/**
 * Build HTML for a single kanban column.
 */
function _kanbanColumnHtml(stage, deals) {
    var stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    var count = deals.length;
    var totalUnits = deals.reduce(function (sum, d) {
        return sum + (parseInt(d['Unit Count'] || d.unitCount || 0) || 0);
    }, 0);
    var cardsHtml = deals.map(function (deal) { return _kanbanCardHtml(deal); }).join('');

    return '<div class="kanban-column" data-stage="' + escapeHtml(stage) + '">' +
        '<div class="kanban-column-header" style="border-top: 3px solid ' + stageConfig.color + ';">' +
            '<span class="kanban-column-title">' + escapeHtml(stage) + '</span>' +
            '<span class="kanban-column-count">' + count + '</span>' +
            (totalUnits > 0 ? '<span class="kanban-column-units">' + totalUnits.toLocaleString() + ' units</span>' : '') +
        '</div>' +
        '<div class="kanban-column-content" data-stage="' + escapeHtml(stage) + '">' +
            (cardsHtml || '<div class="kanban-empty">No deals</div>') +
        '</div>' +
    '</div>';
}

/**
 * Build HTML for a single deal card.
 */
function _kanbanCardHtml(deal) {
    var stage = normalizeStage(deal.Stage || deal.stage);
    if (stage === 'Lease-up') stage = 'Lease-Up';
    if (stage === 'Commercial Land Listed') stage = 'Commercial Land - Listed';
    var stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    var name = deal.Name || deal.name || deal.ProjectName || '';
    var location = getDealLocation(deal) || '';
    var units = deal['Unit Count'] || deal.unitCount || '';
    var bank = deal.Bank || deal.bank || '';
    var startDate = deal['Start Date'] || deal.startDate || '';
    var formattedDate = startDate ? formatDate(startDate) : '';
    var dealPipelineId = deal.DealPipelineId || deal.dealPipelineId || deal.id || '';
    var isAdmin = typeof isAuthenticated !== 'undefined' && isAuthenticated && typeof isEditMode !== 'undefined' && isEditMode;

    return '<div class="kanban-card" ' +
        'data-deal-pipeline-id="' + escapeHtml(String(dealPipelineId)) + '" ' +
        'data-deal-name="' + escapeHtml(name) + '" ' +
        'data-stage="' + escapeHtml(stage) + '" ' +
        (isAdmin ? 'draggable="true"' : '') +
        ' style="border-left: 4px solid ' + stageConfig.color + ';">' +
        '<div class="kanban-card-name">' + escapeHtml(name) + '</div>' +
        (location ? '<div class="kanban-card-location">' + escapeHtml(location) + '</div>' : '') +
        '<div class="kanban-card-meta">' +
            (units ? '<span class="kanban-card-units">' + escapeHtml(String(units)) + ' units</span>' : '') +
            (bank ? '<span class="kanban-card-bank">' + escapeHtml(bank) + '</span>' : '') +
            (formattedDate ? '<span class="kanban-card-date">' + escapeHtml(formattedDate) + '</span>' : '') +
        '</div>' +
    '</div>';
}

/**
 * Bind all kanban event listeners (drag-and-drop, click, search, archive toggle).
 */
function _kanbanBindEvents() {
    var board = document.getElementById('kanban-board');
    if (!board) return;

    // --- Card click → deal detail ---
    board.addEventListener('click', function (e) {
        var card = e.target.closest('.kanban-card');
        if (!card) return;
        var dealName = card.getAttribute('data-deal-name');
        if (!dealName) return;
        var deals = typeof allDeals !== 'undefined' ? allDeals : [];
        var deal = deals.find(function (d) {
            return (d.Name || d.name || d.ProjectName) === dealName;
        });
        if (deal && typeof showDealDetail === 'function') showDealDetail(deal);
    });

    // Archive cards click
    var archiveContent = document.getElementById('kanban-archive-content');
    if (archiveContent) {
        archiveContent.addEventListener('click', function (e) {
            var card = e.target.closest('.kanban-card');
            if (!card) return;
            var dealName = card.getAttribute('data-deal-name');
            if (!dealName) return;
            var deals = typeof allDeals !== 'undefined' ? allDeals : [];
            var deal = deals.find(function (d) {
                return (d.Name || d.name || d.ProjectName) === dealName;
            });
            if (deal && typeof showDealDetail === 'function') showDealDetail(deal);
        });
    }

    // --- Drag and drop ---
    var columns = board.querySelectorAll('.kanban-column-content');

    board.addEventListener('dragstart', function (e) {
        var card = e.target.closest('.kanban-card');
        if (!card) return;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.getAttribute('data-deal-pipeline-id'));
        e.dataTransfer.setData('application/x-kanban-stage', card.getAttribute('data-stage'));
        e.dataTransfer.setData('application/x-kanban-name', card.getAttribute('data-deal-name'));
    });

    board.addEventListener('dragend', function (e) {
        var card = e.target.closest('.kanban-card');
        if (card) card.classList.remove('dragging');
        // Remove all drop-zone highlights
        columns.forEach(function (col) { col.classList.remove('kanban-drop-zone'); });
    });

    columns.forEach(function (col) {
        col.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            col.classList.add('kanban-drop-zone');
        });
        col.addEventListener('dragleave', function (e) {
            // Only remove if leaving the column element itself
            if (!col.contains(e.relatedTarget)) {
                col.classList.remove('kanban-drop-zone');
            }
        });
        col.addEventListener('drop', function (e) {
            e.preventDefault();
            col.classList.remove('kanban-drop-zone');
            var dealPipelineId = e.dataTransfer.getData('text/plain');
            var oldStage = e.dataTransfer.getData('application/x-kanban-stage');
            var dealName = e.dataTransfer.getData('application/x-kanban-name');
            var newStage = col.getAttribute('data-stage');
            if (!dealPipelineId || !newStage || newStage === oldStage) return;
            _kanbanConfirmMove(dealPipelineId, dealName, oldStage, newStage);
        });
    });

    // --- Search ---
    var searchInput = document.getElementById('kanban-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var query = searchInput.value.trim().toLowerCase();
            var cards = board.querySelectorAll('.kanban-card');
            cards.forEach(function (card) {
                var name = (card.getAttribute('data-deal-name') || '').toLowerCase();
                var text = card.textContent.toLowerCase();
                var match = !query || name.indexOf(query) !== -1 || text.indexOf(query) !== -1;
                card.style.display = match ? '' : 'none';
            });
            // Also search archive cards
            var archiveCards = document.querySelectorAll('#kanban-archive-content .kanban-card');
            archiveCards.forEach(function (card) {
                var name = (card.getAttribute('data-deal-name') || '').toLowerCase();
                var text = card.textContent.toLowerCase();
                var match = !query || name.indexOf(query) !== -1 || text.indexOf(query) !== -1;
                card.style.display = match ? '' : 'none';
            });
            // Update column counts based on visible cards
            _kanbanUpdateColumnCounts();
        });
    }

    // --- Archive toggle ---
    var archiveToggle = document.getElementById('kanban-archive-toggle');
    var archiveContentEl = document.getElementById('kanban-archive-content');
    if (archiveToggle && archiveContentEl) {
        archiveToggle.addEventListener('click', function () {
            var expanded = archiveToggle.getAttribute('aria-expanded') === 'true';
            archiveToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            archiveContentEl.style.display = expanded ? 'none' : 'block';
            var arrow = archiveToggle.querySelector('.kanban-archive-arrow');
            if (arrow) arrow.style.transform = expanded ? '' : 'rotate(90deg)';
        });
    }
}

/**
 * Update visible column counts after search filtering.
 */
function _kanbanUpdateColumnCounts() {
    var board = document.getElementById('kanban-board');
    if (!board) return;
    var columns = board.querySelectorAll('.kanban-column');
    columns.forEach(function (col) {
        var visibleCards = col.querySelectorAll('.kanban-card:not([style*="display: none"])');
        var countEl = col.querySelector('.kanban-column-count');
        if (countEl) countEl.textContent = visibleCards.length;
    });
}

/**
 * Show a confirmation modal to move a deal between stages.
 */
function _kanbanConfirmMove(dealPipelineId, dealName, oldStage, newStage) {
    // Remove any existing kanban confirm modal
    var existing = document.getElementById('kanban-confirm-modal');
    if (existing) existing.remove();

    var safeName = escapeHtml(dealName);
    var safeOld = escapeHtml(oldStage);
    var safeNew = escapeHtml(newStage);

    var modal = document.createElement('div');
    modal.id = 'kanban-confirm-modal';
    modal.className = 'modal-overlay confirm-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
        '<div class="confirm-modal-content">' +
            '<p class="confirm-modal-message">Move <strong>' + safeName + '</strong> from <strong>' + safeOld + '</strong> to <strong>' + safeNew + '</strong>?</p>' +
            '<div class="confirm-modal-actions">' +
                '<button type="button" class="confirm-modal-cancel" id="kanban-confirm-cancel">Cancel</button>' +
                '<button type="button" class="confirm-modal-ok" id="kanban-confirm-ok" style="background: var(--primary-green); color: #fff;">Move</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);

    var cancelBtn = document.getElementById('kanban-confirm-cancel');
    var okBtn = document.getElementById('kanban-confirm-ok');

    function closeModal() {
        modal.remove();
    }

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModal();
    });

    okBtn.addEventListener('click', function () {
        okBtn.disabled = true;
        okBtn.textContent = 'Moving...';
        if (typeof API !== 'undefined' && typeof API.updateDealPipeline === 'function') {
            API.updateDealPipeline(parseInt(dealPipelineId), { Stage: newStage })
                .then(function () {
                    closeModal();
                    // Update the local deal object
                    var deals = typeof allDeals !== 'undefined' ? allDeals : [];
                    var deal = deals.find(function (d) {
                        return String(d.DealPipelineId || d.dealPipelineId || d.id) === String(dealPipelineId);
                    });
                    if (deal) {
                        deal.Stage = newStage;
                        deal.stage = newStage;
                    }
                    // Show toast
                    if (typeof showToast === 'function') {
                        showToast('"' + dealName + '" moved to ' + newStage, 'success');
                    }
                    // Re-render
                    var container = document.getElementById('deal-list-container');
                    if (container) container.innerHTML = renderKanban(deals);
                })
                .catch(function (err) {
                    closeModal();
                    if (typeof showToast === 'function') {
                        showToast('Failed to move deal: ' + (err.message || err), 'error');
                    }
                });
        } else {
            closeModal();
            if (typeof showToast === 'function') {
                showToast('API not available. Please log in as admin.', 'error');
            }
        }
    });
}
