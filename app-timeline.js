/**
 * app-timeline.js — Timeline list view, deal list by stage, drill-down handlers
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

// Unit summary stage order constant
var UNIT_SUMMARY_STAGE_ORDER = [
    'Under Construction', 'Lease-Up', 'Lease-up', 'Stabilized', 'Liquidated', 'Under Contract',
    'Prospective', 'Under Review', 'Commercial Land - Listed', 'Rejected', 'Dead', 'Other'
];

function renderDealListByTimeline(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true); // Exclude START deals
    // Don't sort before grouping - we'll sort blocks and items within blocks separately
    const { grouped, sortedPeriods } = groupDealsByYear(filtered);
    
    // Build HTML with year/quarter groups, showing START slots if they exist (START deals are automatically included in timeline view)
    const html = `
        ${renderActiveFilters()}
        ${sortedPeriods.map(period => {
        const periodData = grouped[period];
        // Filter out any START items from other (in case they slipped through)
        const otherWithoutStart = periodData.other.filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return stage !== 'START';
        });
        const stageGrouped = groupDealsByStage(otherWithoutStart);
        // Sort deals within each stage group by listViewSort
        const listSortConfig = window.listViewSort || { by: 'name', order: 'asc' };
        Object.keys(stageGrouped).forEach(stage => {
            stageGrouped[stage].sort((a, b) => sortDeal(a, b, listSortConfig));
        });
        // Exclude START from stage groups since we handle it separately
        const stageGroups = Object.keys(stageGrouped)
            .filter(stage => stage !== 'START')
            .map(stage => renderStageGroup(stage, stageGrouped[stage]))
            .join('');
        
        // Add START items only if there are any (they're automatically included in timeline view)
        let startGroup = '';
        if (periodData.start.length > 0) {
            startGroup = renderStageGroup('START', periodData.start);
        }
        
        // Collect all deals in this period for debugging
        const allPeriodDeals = [...periodData.start, ...periodData.other];
        
        return `
            <div class="year-group" data-period="${period}">
                <div class="year-group-header">
                    <span>${period}</span>
                    <div class="block-sort-controls">
                        <span class="block-sort-label">Sort:</span>
                        <button class="block-sort-btn ${blockSort.by === 'date' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="date" data-sort-order="asc" title="Start Date (Ascending)">
                            Date (A-Z)
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'date' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="date" data-sort-order="desc" title="Start Date (Descending)">
                            Date (Z-A)
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'units' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="units" data-sort-order="asc" title="Unit Count (Ascending)">
                            Units (Low-High)
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'units' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="units" data-sort-order="desc" title="Unit Count (Descending)">
                            Units (High-Low)
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'name' && blockSort.order === 'asc' ? 'active' : ''}" data-sort-by="name" data-sort-order="asc" title="Name (A-Z)">
                            A-Z
                        </button>
                        <button class="block-sort-btn ${blockSort.by === 'name' && blockSort.order === 'desc' ? 'active' : ''}" data-sort-by="name" data-sort-order="desc" title="Name (Z-A)">
                            Z-A
                        </button>
                    </div>
                </div>
                ${startGroup}
                ${stageGroups}
            </div>
        `;
    }).join('')}
    `;
    
    container.innerHTML = html;
    
    // Scroll to current quarter/year after rendering (scroll only inside list-view-container so Domo header stays visible)
    setTimeout(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
        const currentPeriod = `Q${currentQuarter} ${currentYear}`;
        const listViewContainer = document.querySelector('.list-view-container');
        const scrollTargetIntoContainer = (targetEl) => {
            if (!listViewContainer || !targetEl) return;
            const targetRect = targetEl.getBoundingClientRect();
            const containerRect = listViewContainer.getBoundingClientRect();
            const scrollOffset = targetRect.top - containerRect.top + listViewContainer.scrollTop;
            listViewContainer.scrollTo({ top: Math.max(0, scrollOffset - 8), behavior: 'smooth' });
        };
        const highlightGroup = (groupEl) => {
            if (!groupEl) return;
            groupEl.style.transition = 'box-shadow 0.3s ease';
            groupEl.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.3)';
            setTimeout(() => { groupEl.style.boxShadow = ''; }, 2000);
        };
        const currentPeriodGroup = container.querySelector(`[data-period="${currentPeriod}"]`);
        if (currentPeriodGroup) {
            scrollTargetIntoContainer(currentPeriodGroup);
            highlightGroup(currentPeriodGroup);
        } else {
            for (let q = 1; q <= 4; q++) {
                const periodKey = `Q${q} ${currentYear}`;
                const yearGroup = container.querySelector(`[data-period="${periodKey}"]`);
                if (yearGroup) {
                    scrollTargetIntoContainer(yearGroup);
                    highlightGroup(yearGroup);
                    break;
                }
            }
        }
    }, 100);
}

// Render list by stage (Prospective, Under Contract, Started, Stabilized, Closed, START)
function renderDealListByStage(deals) {
    const container = document.getElementById('deal-list-container');
    const filtered = applyFilters(deals, true); // Exclude START deals
    
    // Group by stage first
    const stageGrouped = groupDealsByStage(filtered);
    
    // Sort deals within each stage group by listViewSort
    const listSortConfig = window.listViewSort || { by: 'name', order: 'asc' };
    Object.keys(stageGrouped).forEach(stage => {
        stageGrouped[stage].sort((a, b) => sortDeal(a, b, listSortConfig));
    });
    
    // Use single source of truth for stage order
    const stageOrder = STAGE_DISPLAY_ORDER;
    
    // Build HTML with stage groups
    const html = `
        ${renderActiveFilters()}
        ${stageOrder.map(stage => {
            if (!stageGrouped[stage] || stageGrouped[stage].length === 0) {
                // START deals are automatically excluded, so don't show empty START groups
                if (stage === 'START') {
                    return '';
                }
                return renderStageGroup(stage, []);
            }
            return renderStageGroup(stage, stageGrouped[stage]);
        }).join('')}
    `;
    
    container.innerHTML = html;
}

// Setup drill-down click handlers
function setupDrillDownHandlers() {
    // Stage-group collapse/expand toggle
    document.querySelectorAll('.stage-group-toggle').forEach(toggle => {
        if (toggle._collapseHandlerBound) return;
        toggle._collapseHandlerBound = true;
        toggle.style.cursor = 'pointer';
        const headerEl = toggle.closest('.stage-group-header');
        if (headerEl) headerEl.style.cursor = 'pointer';
        
        const handleToggle = function(e) {
            e.stopPropagation();
            const group = toggle.closest('.stage-group');
            if (!group) return;
            const content = group.querySelector('.stage-group-content');
            if (!content) return;
            const isCollapsed = group.classList.toggle('collapsed');
            toggle.textContent = isCollapsed ? '+' : '-';
            if (isCollapsed) {
                content.style.maxHeight = '0';
                content.style.overflow = 'hidden';
            } else {
                content.style.maxHeight = '';
                content.style.overflow = '';
            }
        };
        
        toggle.addEventListener('click', handleToggle);
        if (headerEl && !headerEl._collapseHandlerBound) {
            headerEl._collapseHandlerBound = true;
            headerEl.addEventListener('click', function(e) {
                if (e.target.classList.contains('clickable') || e.target.closest('.clickable')) return;
                handleToggle(e);
            });
        }
    });
    
    // Auto-collapse stage groups on phone to reduce scrolling
    if (window.IS_MOBILE) {
        document.querySelectorAll('.stage-group').forEach((group, idx) => {
            if (idx === 0) return; // Keep first group open
            if (group.classList.contains('collapsed')) return;
            const toggle = group.querySelector('.stage-group-toggle');
            const content = group.querySelector('.stage-group-content');
            if (toggle && content) {
                group.classList.add('collapsed');
                toggle.textContent = '+';
                content.style.maxHeight = '0';
                content.style.overflow = 'hidden';
            }
        });
    }

    // Stage badge clicks – filter to this stage (add to multi-select)
    document.querySelectorAll('.stage-badge.clickable').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.stopPropagation();
            const stage = this.dataset.stage;
            if (!currentFilters.stages.includes(stage)) currentFilters.stages = [...currentFilters.stages, stage];
            updateFiltersUI();
            switchView('list', allDeals);
        });
    });
    
    // Location badge clicks - filter by city and focus map
    document.querySelectorAll('.location-badge.clickable').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.stopPropagation();
            const location = this.dataset.location;
            
            // Extract city from location string (e.g., "Baton Rouge, LA" -> "Baton Rouge")
            const cityMatch = location.match(/^([^,]+)/);
            const city = cityMatch ? cityMatch[1].trim() : location;
            
            // Set location filter
            currentFilters.location = location;
            updateFiltersUI();
            
            // Switch to location view
            switchView('location', allDeals);
            
            // After view switches, focus map on deals in that city
            setTimeout(() => {
                focusMapOnCity(city);
            }, 100);
        });
    });
    
    // Product type table sortable headers
    document.querySelectorAll('.product-type-table .sortable-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            
            // Update product type sort config
            window.productTypeSort = { by: sortBy, order: sortOrder };
            
            // Re-render the product type view
            switchView('product', allDeals);
        });
    });
    
    // Upcoming dates table sortable headers
    document.querySelectorAll('.upcoming-dates-table .sortable-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            if (sortBy && sortOrder) {
                window.upcomingDatesSort = { by: sortBy, order: sortOrder };
                switchView('upcoming-dates', typeof allDeals !== 'undefined' ? allDeals : []);
            }
        });
    });

    // Map/location table sortable headers
    document.querySelectorAll('.map-location-table .sortable-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            if (sortBy && sortOrder) {
                window.mapTableSort = { by: sortBy, order: sortOrder };
                if (currentView === 'location') {
                    updateMapTable();
                    setupDrillDownHandlers();
                }
            }
        });
    });

    // Bank table sortable headers
    document.querySelectorAll('.bank-table .sortable-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            
            // Update bank sort config
            window.bankSort = { by: sortBy, order: sortOrder };
            
            // Re-render the bank view
            switchView('bank', allDeals);
        });
    });
    
    // "View deal & files" button clicks
    document.querySelectorAll('.deal-files-view-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const dealName = (this.dataset.dealName || '').replace(/&quot;/g, '"');
            const deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(d => (d.Name || d.name) === dealName);
            if (deal) showDealDetail(deal);
        });
    });

    // List view table sortable headers
    document.querySelectorAll('.list-view-table .sortable-header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            
            // Update list view sort config
            window.listViewSort = { by: sortBy, order: sortOrder };
            
            // Re-render the list view
            switchView('list', allDeals);
        });
    });
    
    // Overview stat card clicks
    document.querySelectorAll('.stat-card[data-drill]').forEach(card => {
        card.addEventListener('click', function(e) {
            e.stopPropagation();
            const drill = this.dataset.drill;
            if (drill === 'list') {
                switchView('list', allDeals);
            } else if (drill === 'units') {
                switchView('units', allDeals);
            } else if (drill === 'location') {
                switchView('location', allDeals);
            } else if (drill === 'bank') {
                switchView('bank', allDeals);
            }
        });
    });
    
    // Stage breakdown item clicks (entire row) – add stage to multi-select
    document.querySelectorAll('.breakdown-item[data-stage]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const stage = this.dataset.stage;
            if (!currentFilters.stages.includes(stage)) currentFilters.stages = [...currentFilters.stages, stage];
            updateFiltersUI();
            switchView('list', allDeals);
        });
    });
    
    // Upcoming dates item clicks (drill to timeline)
    document.querySelectorAll('.date-item[data-drill-timeline]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            const dealName = this.dataset.drillTimeline;
            // Store the deal name to highlight in timeline
            window.highlightDealInTimeline = dealName;
            switchView('timeline', allDeals);
        });
    });
    
    // Deal card clicks (timeline cards, list rows, etc.) - show deal detail
    document.querySelectorAll('.timeline-card[data-deal-name]').forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on a badge or other interactive element
            if (e.target.closest('.stage-badge.clickable, .location-badge.clickable, .precon-badge, .clickable')) {
                return;
            }
            const dealName = this.dataset.dealName;
            const deal = allDeals.find(d => (d.Name || d.name) === dealName);
            if (deal) {
                showDealDetail(deal);
            }
        });
    });
    
    // Deal row clicks (list view) - show deal detail
    document.querySelectorAll('.deal-row[data-deal-name]').forEach(row => {
        row.addEventListener('click', function(e) {
            if (e.target.closest('.stage-badge.clickable, .location-badge.clickable, .precon-badge, .notes-cell.clickable, .clickable')) {
                return;
            }
            const dealName = this.dataset.dealName;
            const deal = allDeals.find(d => (d.Name || d.name) === dealName);
            if (deal) showDealDetail(deal);
        });
    });
    
    // Upcoming dates row clicks – open deal detail
    document.querySelectorAll('.upcoming-date-row[data-deal-name]').forEach(row => {
        row.addEventListener('click', function() {
            const dealName = this.dataset.dealName;
            const deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(d => (d.Name || d.name) === dealName);
            if (deal) showDealDetail(deal);
        });
    });
    
    // Notes cell clicks (show modal)
    document.querySelectorAll('.notes-cell, .notes-preview').forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const row = this.closest('.deal-row');
            if (row) {
                const dealName = row.querySelector('.deal-name')?.textContent?.trim() || 'Unknown Deal';
                const notes = this.title || this.textContent || '';
                if (notes && notes !== '-') {
                    showNotesModal(dealName, notes);
                }
            }
        });
    });
    
    // Block sort button clicks (sort within year/quarter groups)
    document.querySelectorAll('.block-sort-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const sortBy = this.dataset.sortBy;
            const sortOrder = this.dataset.sortOrder;
            blockSort = { by: sortBy, order: sortOrder };
            switchView('list', allDeals);
        });
    });
    
    // (Stage checkbox change and dropdown toggle are registered once in initStageFilterDropdowns().)

    // Quick filter dropdown change handlers (state, product, year, overview date-added)
    document.body.addEventListener('change', function(e) {
        if (e.target.classList.contains('quick-filter-dropdown')) {
            const filterType = e.target.id.replace('-filter-dropdown', '');
            const filterValue = e.target.value || '';
            
            if (filterType === 'state') {
                currentFilters.state = filterValue;
            } else if (filterType === 'product') { 
                currentFilters.product = filterValue;
            } else if (filterType === 'year') {
                currentFilters.year = filterValue;
            } else if (e.target.id === 'overview-date-added-filter') {
                currentFilters.dateAddedRange = filterValue;
                try { localStorage.setItem('dealPipeline_dateAddedDefault', filterValue); } catch (e2) { /* ignore */ }
            }
            
            updateFiltersUI();
            if (typeof isMobileLayout === 'function' && isMobileLayout()) rerenderForMobileLayout();
            else switchView(currentView, allDeals);
        }
    });
    
    // Timeline year filter button clicks (debounced to prevent freeze on rapid clicks)
    var timelineYearDebounceTimer = null;
    var timelineYearDebounceMs = 120;
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('quick-filter-btn') && e.target.closest('.timeline-year-filter')) {
            e.preventDefault();
            e.stopPropagation();
            const filterValue = e.target.dataset.filterValue || '';
            if (currentFilters.year === filterValue) return;
            currentFilters.year = filterValue;
            
            // Update active state of all year filter buttons immediately
            const timelineYearFilter = e.target.closest('.timeline-year-filter');
            if (timelineYearFilter) {
                timelineYearFilter.querySelectorAll('.quick-filter-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.filterValue === filterValue);
                });
            }
            
            // Debounce the expensive re-render so rapid clicks don't queue multiple full renders
            if (timelineYearDebounceTimer) clearTimeout(timelineYearDebounceTimer);
            timelineYearDebounceTimer = setTimeout(function() {
                timelineYearDebounceTimer = null;
                const container = document.getElementById('deal-list-container');
                if (container && currentView === 'timeline') {
                    container.innerHTML = renderTimeline(allDeals);
                    setupDrillDownHandlers();
                    // Scroll to selected year when filtering
                    if (filterValue) {
                        setTimeout(() => {
                            const targetColumn = document.querySelector(`.timeline-column[data-year="${filterValue}"]`);
                            const timelineColumns = document.querySelector('.timeline-board-columns');
                            if (targetColumn && timelineColumns) {
                                const columnLeft = targetColumn.offsetLeft;
                                timelineColumns.scrollTo({ left: Math.max(0, columnLeft - 40), behavior: 'smooth' });
                            }
                        }, 100);
                    }
                } else {
                    switchView('timeline', allDeals);
                }
            }, timelineYearDebounceMs);
        }
    });
    
    // Toggle map visibility in location view
    document.body.addEventListener('click', function(e) {
        if (e.target.id === 'toggle-map-btn' || e.target.closest('#toggle-map-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const mapContainer = document.getElementById('location-map');
            const toggleBtn = document.getElementById('toggle-map-btn');
            
            if (mapContainer && toggleBtn) {
                const isHidden = mapContainer.style.display === 'none';
                mapContainer.style.display = isHidden ? 'block' : 'none';
                toggleBtn.textContent = isHidden ? 'Hide Map' : 'Show Map';
                
                // Resize map if showing it again
                if (isHidden && mapInstance) {
                    setTimeout(() => {
                        mapInstance.invalidateSize();
                    }, 100);
                }
            }
        }
    });
    
    // List view toggle handlers (using event delegation since toggle is dynamically shown/hidden)
    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('toggle-btn') && e.target.closest('#list-view-toggle')) {
            const mode = e.target.dataset.mode;
            if (mode && (mode === 'timeline' || mode === 'location' || mode === 'stage' || mode === 'product' || mode === 'bank')) {
                listViewMode = mode;
                // Update active state
                const toggle = document.getElementById('list-view-toggle');
                if (toggle) {
                    toggle.querySelectorAll('.toggle-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.mode === listViewMode);
                    });
                }
                // Re-render list view
                if (currentView === 'list') {
                    switchView('list', allDeals);
                }
            }
        }
    });
}
