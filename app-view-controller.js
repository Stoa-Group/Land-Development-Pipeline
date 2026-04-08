/**
 * app-view-controller.js — switchView orchestrator, mobile layout, fullscreen overlay
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

async function switchView(view, deals) {
    // Save timeline scroll position if leaving timeline view
    if (currentView === 'timeline') {
        const timelineColumns = document.querySelector('.timeline-board-columns');
        if (timelineColumns) {
            timelineScrollPosition = timelineColumns.scrollLeft;
        }
    }
    
    currentView = view;
    if (view !== 'contacts' && contactsMapInstance) {
        contactsMapInstance.remove();
        contactsMapInstance = null;
    }
    const container = document.getElementById('deal-list-container');
    const filterControls = document.getElementById('filter-controls');
    const sortControls = document.getElementById('sort-controls');
    const backToNavBtn = document.getElementById('back-to-nav-btn');
    if (container) container.classList.toggle('view-location', view === 'location');

    // Show/hide back button - show when not on overview or list
    if (backToNavBtn) {
        if (view === 'overview' || view === 'list') {
            backToNavBtn.style.display = 'none';
        } else {
            backToNavBtn.style.display = 'flex';
        }
    }
    
    // Update active tab and aria-selected; scroll active tab into view on mobile
    document.querySelectorAll('.nav-tab').forEach(tab => {
        const isActive = tab.dataset.view === view;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive && window.IS_MOBILE) {
            requestAnimationFrame(() => tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }));
        }
    });
    
    // Show/hide filter and sort controls
    const mobileFilterToggle = document.getElementById('mobile-filter-toggle');
    const showFilters = view === 'list' || view === 'location' || view === 'upcoming-dates';
    
    if (showFilters) {
        if (window.IS_MOBILE) {
            if (mobileFilterToggle) mobileFilterToggle.style.display = 'flex';
            const filtersExpanded = mobileFilterToggle && mobileFilterToggle.getAttribute('aria-expanded') === 'true';
            if (filterControls) filterControls.style.display = filtersExpanded ? 'flex' : 'none';
            if (sortControls) sortControls.style.display = filtersExpanded ? 'flex' : 'none';
        } else {
            if (mobileFilterToggle) mobileFilterToggle.style.display = 'none';
            if (filterControls) filterControls.style.display = 'flex';
            if (sortControls) sortControls.style.display = 'flex';
        }
        updateFiltersUI();
        updateSortUI();
    } else {
        if (mobileFilterToggle) mobileFilterToggle.style.display = 'none';
        if (filterControls) filterControls.style.display = 'none';
        if (sortControls) sortControls.style.display = 'none';
    }
    
    // Show/hide list view toggle
    const listViewToggle = document.getElementById('list-view-toggle');
    if (view === 'list') {
        if (listViewToggle) listViewToggle.style.display = 'flex';
    } else {
        if (listViewToggle) listViewToggle.style.display = 'none';
    }
    
    // Re-trigger view fade-in animation
    container.style.animation = 'none';
    container.offsetHeight; // force reflow
    container.style.animation = '';

    // Render appropriate view
    switch(view) {
        case 'overview':
            container.innerHTML = renderOverview(deals);
            setupDrillDownHandlers();
            break;
        case 'list':
            await renderDealList(deals);
            break;
        case 'location':
            container.innerHTML = renderByLocation(deals);
            const filteredForMap = applyFilters(deals, true);
            setTimeout(async () => {
                await initMap(filteredForMap);
                setupDrillDownHandlers();
                setupMapViewControls();
                if (mapInstance) mapInstance.invalidateSize();
                // Auto-enter fullscreen on mobile for better map experience
                if (window.IS_MOBILE && window.innerWidth <= 768) {
                    const fsBtn = document.getElementById('map-fullscreen-btn');
                    if (fsBtn && !document.querySelector('.map-canvas-container.is-fullscreen')) {
                        setTimeout(() => fsBtn.click(), 200);
                    }
                }
            }, 350);
            break;
        case 'upcoming-dates':
            container.innerHTML = renderUpcomingDatesView(deals);
            setupDrillDownHandlers();
            break;
        case 'contacts':
            container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading contacts…</div>';
            (async () => {
                try {
                    const f = window.landDevelopmentContactFilters || {};
                    const params = {};
                    if (f.type) params.type = f.type;
                    if (f.city) params.city = f.city;
                    if (f.state) params.state = f.state;
                    if (f.q) params.q = f.q;
                    if (f.upcomingOnly) params.upcomingOnly = true;
                    const res = await (typeof API !== 'undefined' && API.getLandDevelopmentContacts ? API.getLandDevelopmentContacts(params) : { success: true, data: [] });
                    const list = res.success && res.data ? res.data : [];
                    window.landDevelopmentContacts = list;
                    container.innerHTML = renderContactsView(list);
                    setupContactsViewHandlers(container);
                    if (window.contactsViewMode === 'map') {
                        setTimeout(async () => {
                            await initContactsMap(list);
                            if (contactsMapInstance) contactsMapInstance.invalidateSize();
                        }, 150);
                    }
                } catch (e) {
                    container.innerHTML = `<div class="contacts-view"><p class="contacts-error">Could not load contacts: ${(e.message || e).toString()}. Check that the Land Development Contacts API is available.</p></div>`;
                }
            })();
            break;
        case 'timeline':
            // Year filter applied in renderTimeline (by card date); auto-scroll to current or selected year
            container.innerHTML = renderTimeline(deals);
            setupDrillDownHandlers();
            
            // Auto-scroll to current year after rendering (similar to list view)
            setTimeout(() => {
                const now = new Date();
                const currentYear = now.getFullYear().toString();
                const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
                const currentPeriod = `Q${currentQuarter} ${currentYear}`;
                
                const timelineColumns = document.querySelector('.timeline-board-columns');
                if (!timelineColumns) return;
                
                // Try to find the current quarter column first
                let targetColumn = document.querySelector(`.timeline-column[data-period="${currentPeriod}"]`);
                
                // If current quarter not found, try to find any column from the current year
                if (!targetColumn) {
                    targetColumn = document.querySelector(`.timeline-column[data-year="${currentYear}"]`);
                }
                
                if (targetColumn) {
                    // Calculate horizontal scroll position to center the current year column
                    const columnRect = targetColumn.getBoundingClientRect();
                    const columnsRect = timelineColumns.getBoundingClientRect();
                    const columnLeft = targetColumn.offsetLeft;
                    
                    // Calculate how much we need to scroll to center the column
                    const targetHorizontalScroll = columnLeft - (columnsRect.width / 2) + (columnRect.width / 2);
                    
                    timelineColumns.scrollTo({ 
                        left: Math.max(0, targetHorizontalScroll), 
                        behavior: 'smooth' 
                    });
                    
                    // Update stored scroll position
                    timelineScrollPosition = Math.max(0, targetHorizontalScroll);
                    
                    // Add a temporary highlight to the current year column
                    targetColumn.style.transition = 'box-shadow 0.3s ease';
                    targetColumn.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.3)';
                    setTimeout(() => {
                        targetColumn.style.boxShadow = '';
                    }, 2000);
                }
            }, 150);
            
            // Check if we need to scroll to a highlighted deal
            const highlightDeal = window.highlightDealInTimeline;
            if (highlightDeal) {
                // Scroll to highlighted deal after DOM is ready (after auto-scroll to current year)
                setTimeout(() => {
                    const highlightedCard = document.querySelector(`.timeline-card[data-deal-name="${highlightDeal}"]`);
                    if (highlightedCard) {
                        // Find the parent column and column content
                        const timelineColumn = highlightedCard.closest('.timeline-column');
                        const columnContent = highlightedCard.closest('.timeline-column-content');
                        const timelineColumns = document.querySelector('.timeline-board-columns');
                        
                        if (timelineColumn && timelineColumns && columnContent) {
                            // First, scroll the timeline columns horizontally to bring the column into view
                            const columnRect = timelineColumn.getBoundingClientRect();
                            const columnsRect = timelineColumns.getBoundingClientRect();
                            const columnLeft = timelineColumn.offsetLeft;
                            
                            // Calculate how much we need to scroll to center the column
                            const targetHorizontalScroll = columnLeft - (columnsRect.width / 2) + (columnRect.width / 2);
                            
                            timelineColumns.scrollTo({ 
                                left: Math.max(0, targetHorizontalScroll), 
                                behavior: 'smooth' 
                            });
                            
                            // Update stored scroll position
                            timelineScrollPosition = Math.max(0, targetHorizontalScroll);
                            
                            // Then scroll the column content vertically to show the card
                            // Wait a bit for horizontal scroll to start
                            setTimeout(() => {
                                const cardTop = highlightedCard.offsetTop;
                                const contentHeight = columnContent.clientHeight;
                                const cardHeight = highlightedCard.offsetHeight;
                                
                                // Calculate scroll position to center the card vertically
                                const targetVerticalScroll = cardTop - (contentHeight / 2) + (cardHeight / 2);
                                
                                columnContent.scrollTo({
                                    top: Math.max(0, targetVerticalScroll),
                                    behavior: 'smooth'
                                });
                            }, 100);
                        }
                    }
                }, 300); // Wait a bit longer to ensure current year scroll completes first
            }
            break;
        case 'units':
            container.innerHTML = renderUnitSummary(deals);
            setupDrillDownHandlers();
            break;
        default:
            renderDealList(deals);
    }

    updateVisibleDealCount(deals);
}

// Update the fixed bottom-right deal count badge (main dashboard filtered count)
// In map city-view (non-fullscreen), show "X locations"; in fullscreen/drilled-in, show "X deals"
function updateVisibleDealCount(deals) {
    const source = deals != null ? deals : (typeof allDeals !== 'undefined' ? allDeals : []);
    const filtered = Array.isArray(source) && source.length > 0 ? applyFilters(source, true) : [];
    const count = filtered.length;
    const badge = document.getElementById('visible-deal-count-badge');
    if (!badge) return;

    // Check if we are in the map city-view (location view, not fullscreen, not drilled into a city)
    var mapContainer = document.getElementById('map-canvas-container');
    var isMapView = mapContainer !== null;
    var isFullscreen = mapContainer && mapContainer.classList.contains('is-fullscreen');
    var isDrilledIntoCity = typeof currentCityView !== 'undefined' && currentCityView !== null;

    if (isMapView && !isFullscreen && !isDrilledIntoCity && typeof mapMarkers !== 'undefined' && mapMarkers.length > 0) {
        // City-grouped view: show location count
        var locCount = mapMarkers.length;
        badge.textContent = locCount === 1 ? '1 location' : locCount + ' locations';
    } else {
        badge.textContent = count === 1 ? '1 deal' : count + ' deals';
    }
    badge.style.display = '';
}

// Handle errors (options: { showRetry?: boolean } – for load failures)
function showError(message, options) {
    const container = document.getElementById('deal-list-container');
    const showRetry = options && options.showRetry;
    const retryHtml = showRetry
        ? `<button type="button" class="error-retry-btn" id="error-retry-btn">Retry</button>`
        : '';
    container.innerHTML = `
        <div class="error-state">
            <p class="error-message">Unable to load pipeline. ${(message || '').replace(/^Error:\s*/i, '')}</p>
            ${retryHtml}
        </div>
    `;
    if (showRetry) {
        const btn = document.getElementById('error-retry-btn');
        if (btn && typeof init === 'function') {
            btn.addEventListener('click', function() { init(); });
        }
    }
}

// Process custom field data - group by task gid and extract custom field values
function processCustomFieldsData(rawData) {
    // The manifest maps:
    // - projectid (alias) -> projects_gid (column)
    // - ProjectName (alias) -> projects_name (column)
    // So each row already has the project name and project ID directly available!
    
    // Group by task gid
    const tasksMap = {};
    
    rawData.forEach(item => {
        const taskGid = item.gid;
        const customFieldName = item.customfieldsname || item.custom_fields_name;
        const customFieldType = item.customfieldstype || item.custom_fields_type;
        // Get project_id - manifest maps projectid (alias) -> projects_gid (column)
        const projectId = item.projectid || item.project_id || item.projectsgid || item.projects_gid;
        const resourceType = item.resourcetype || item.resource_type || '';
        
        // Skip project records in task processing (we already processed them above)
        if (resourceType === 'project' || (item.resourcesubtype || item.resource_subtype) === 'project') {
            return; // Skip project records
        }
        
        // Initialize task if not seen before
        if (!tasksMap[taskGid]) {
            // Copy all original fields from the first occurrence
            tasksMap[taskGid] = { ...item };
            // Initialize custom field containers
            tasksMap[taskGid]._customFields = {};
        }
        
        // Always preserve project_id from any row (it should be the same for all rows of same gid)
        // The manifest maps projectid (alias) -> projects_gid (column)
        if (projectId && !tasksMap[taskGid].projectid && !tasksMap[taskGid].project_id) {
            tasksMap[taskGid].projectid = projectId;
            tasksMap[taskGid].project_id = projectId;
        }
        
        // Set Project Name from the row data
        // The manifest maps ProjectName (alias) -> projects_name (column)
        const projectName = item.ProjectName || item['Project Name'] || item.projectsname || item.projects_name;
        if (projectName && projectName !== 'Unknown' && projectName.trim() !== '') {
            tasksMap[taskGid].ProjectName = projectName;
            tasksMap[taskGid]['Project Name'] = projectName;
        }
        
        // Extract custom field value based on type
        if (customFieldName) {
            let value = null;
            
            if (customFieldType === 'text') {
                value = item.customfieldstextvalue || item.custom_fields_text_value || null;
            } else if (customFieldType === 'enum') {
                // For enum, try display_value first, then enum_value_name
                // Also check if the value is "List" and skip it
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                const enumValueName = item.customfieldsenumvaluename || item.custom_fields_enum_value_name;
                
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (enumValueName && enumValueName !== 'List' && enumValueName.trim() !== '') {
                    value = enumValueName;
                } else {
                    value = null;
                }
            } else if (customFieldType === 'multi_enum') {
                // For multi_enum, it's stored as a list/array
                const multiEnum = item.customfieldsmultienumvalues || item.custom_fields_multi_enum_values;
                // Check display_value first (might have the actual selected value)
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (multiEnum && typeof multiEnum === 'string') {
                    // Skip if it's just the literal "List" placeholder
                    if (multiEnum === 'List' || multiEnum.trim() === 'List') {
                        value = null;
                    } else {
                        // Try to parse if it's a string representation
                        try {
                            const parsed = JSON.parse(multiEnum);
                            value = Array.isArray(parsed) ? parsed.map(v => v.name || v).join(', ') : (multiEnum !== 'List' ? multiEnum : null);
                        } catch {
                            value = (multiEnum !== 'List' ? multiEnum : null);
                        }
                    }
                } else if (Array.isArray(multiEnum)) {
                    value = multiEnum.map(v => v.name || v).join(', ');
                } else {
                    value = (multiEnum && multiEnum !== 'List') ? multiEnum : null;
                }
            } else if (customFieldType === 'people') {
                // For people, it's stored as a list/array
                const people = item.customfieldspeoplevalue || item.custom_fields_people_value;
                // Check if there's a name in the people value structure
                if (people && typeof people === 'string') {
                    // Skip if it's just the literal "List" placeholder
                    if (people === 'List' || people.trim() === 'List') {
                        value = null;
                    } else {
                        try {
                            const parsed = JSON.parse(people);
                            value = Array.isArray(parsed) ? parsed.map(p => p.name || p).join(', ') : (people !== 'List' ? people : null);
                        } catch {
                            value = (people !== 'List' ? people : null);
                        }
                    }
                } else if (Array.isArray(people)) {
                    value = people.map(p => p.name || p).join(', ');
                } else {
                    value = (people && people !== 'List') ? people : null;
                }
            } else if (customFieldType === 'date') {
                value = item.customfieldsdatevaluedate || item.custom_fields_date_value_date || 
                        item.customfieldsdatevalue || item.custom_fields_date_value || null;
            } else if (customFieldType === 'number') {
                value = item.customfieldsnumbervalue || item.custom_fields_number_value || null;
            }
            
            // Store custom field value
            if (value !== null && value !== '') {
                tasksMap[taskGid]._customFields[customFieldName] = value;
            }
        }
    });
    
    // Convert map to array and add custom fields as direct properties
    return Object.values(tasksMap).map(task => {
        // Add custom fields as direct properties for easy access
        if (task._customFields) {
            if (task._customFields['Bank']) task.Bank = task._customFields['Bank'];
            if (task._customFields['Location']) {
                task.Location = task._customFields['Location'];
                task.location = task._customFields['Location']; // Also set lowercase version
            }
            if (task._customFields['Pre-Con Manager']) {
                task['Pre-Con Manager'] = task._customFields['Pre-Con Manager'];
                task.PreConManager = task._customFields['Pre-Con Manager']; // Also set as PreConManager for easier access
                task.preConManager = task._customFields['Pre-Con Manager']; // Also set lowercase version
            }
            if (task._customFields['Unit Count']) task['Unit Count Custom'] = task._customFields['Unit Count'];
            if (task._customFields['Start Date']) task['Start Date Custom'] = task._customFields['Start Date'];
            if (task._customFields['Product Type']) task['Product Type Custom'] = task._customFields['Product Type'];
            if (task._customFields['Stage']) {
                task.Stage = task._customFields['Stage'];
                task.stage = task._customFields['Stage']; // Also set lowercase version
                task['Stage Custom'] = task._customFields['Stage']; // Also set as Stage Custom for consistency
            }
        }
        // Also check for Location in the raw item fields as fallback
        if (!task.Location && !task.location) {
            const rawLocation = task.customfieldsdisplayvalue || task.custom_fields_display_value ||
                               task.customfieldsenumvaluename || task.custom_fields_enum_value_name;
            if (rawLocation && (task.customfieldsname || task.custom_fields_name) === 'Location') {
                task.Location = rawLocation;
                task.location = rawLocation;
            }
        }
        return task;
    });
}

// Global toggle for main filter bar "All Stages" – called from onclick so it always works
window.toggleMainStageDropdown = function() {
    console.log('[Filter by Stage] Main bar button clicked');
    var panel = document.getElementById('stage-filter-dropdown-panel');
    var trigger = document.getElementById('stage-filter-trigger');
    if (!panel || !trigger) {
        console.warn('[Filter by Stage] Main: panel or trigger not found', { panel: !!panel, trigger: !!trigger });
        return;
    }
    var isCurrentlyOpen = panel.getAttribute('aria-hidden') !== 'true';
    var wantOpen = !isCurrentlyOpen;
    console.log('[Filter by Stage] Main: toggling panel', wantOpen ? 'open' : 'close');
    panel.setAttribute('aria-hidden', wantOpen ? 'false' : 'true');
    panel.style.display = wantOpen ? 'block' : 'none';
    trigger.setAttribute('aria-expanded', wantOpen ? 'true' : 'false');
};

// Global toggle for Overview "All Stages" – called from onclick so it always works
window.toggleOverviewStageDropdown = function() {
    console.log('[Filter by Stage] Overview button clicked');
    var panel = document.getElementById('overview-stage-filter-dropdown-panel');
    var trigger = document.getElementById('overview-stage-filter-trigger');
    if (!panel || !trigger) {
        console.warn('[Filter by Stage] Overview: panel or trigger not found', { panel: !!panel, trigger: !!trigger });
        return;
    }
    var isCurrentlyOpen = panel.getAttribute('aria-hidden') !== 'true';
    var wantOpen = !isCurrentlyOpen;
    console.log('[Filter by Stage] Overview: toggling panel', wantOpen ? 'open' : 'close');
    panel.setAttribute('aria-hidden', wantOpen ? 'false' : 'true');
    panel.style.display = wantOpen ? 'block' : 'none';
    trigger.setAttribute('aria-expanded', wantOpen ? 'true' : 'false');
    if (wantOpen) {
        panel.classList.add('is-open');
        var rect = trigger.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.top = (rect.bottom + 4) + 'px';
        panel.style.minWidth = Math.max(rect.width, 220) + 'px';
    } else {
        panel.classList.remove('is-open');
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.minWidth = '';
    }
};

// One-time: stage filter dropdown (main bar + overview) – must run once so we don't add duplicate listeners
function initStageFilterDropdowns() {
    document.body.addEventListener('change', function(e) {
        if (e.target.classList.contains('stage-filter-checkbox')) {
            var container = e.target.closest('#stage-filter-checkboxes') || e.target.closest('#overview-stage-filter-checkboxes');
            if (!container) return;
            var checkboxes = container.querySelectorAll('.stage-filter-checkbox:checked');
            var checked = Array.from(checkboxes).map(function(c) { return c.value; });
            if (typeof currentFilters !== 'undefined') currentFilters.stages = checked;
            if (typeof updateFiltersUI === 'function') updateFiltersUI();
            if (typeof isMobileLayout === 'function' && isMobileLayout() && typeof rerenderForMobileLayout === 'function') rerenderForMobileLayout();
            else if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined') switchView(currentView, allDeals);
        }
    });
    // Use capture phase so we run before any other handler (sticky header / iframe can't steal the click)
    document.body.addEventListener('click', function(e) {
        var clickedTrigger = e.target.closest('#stage-filter-trigger');
        var mainPanel = document.getElementById('stage-filter-dropdown-panel');
        if (clickedTrigger) {
            console.log('[Filter by Stage] Main bar button hit (delegated handler)');
            e.stopPropagation();
            e.preventDefault();
            if (mainPanel) {
                var mainCurrentlyOpen = mainPanel.getAttribute('aria-hidden') !== 'true';
                var mainWantOpen = !mainCurrentlyOpen;
                mainPanel.setAttribute('aria-hidden', mainWantOpen ? 'false' : 'true');
                mainPanel.style.display = mainWantOpen ? 'block' : 'none';
                clickedTrigger.setAttribute('aria-expanded', mainWantOpen ? 'true' : 'false');
            }
            return;
        }
        var clearBtn = e.target.closest('#stage-filter-clear-btn');
        if (clearBtn) {
            e.stopPropagation();
            e.preventDefault();
            if (typeof currentFilters !== 'undefined') currentFilters.stages = [];
            if (typeof updateFiltersUI === 'function') updateFiltersUI();
            if (mainPanel) { mainPanel.setAttribute('aria-hidden', 'true'); mainPanel.style.display = 'none'; }
            var t = document.getElementById('stage-filter-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
            if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined') switchView(currentView, allDeals);
            return;
        }
        var mainTrigger = document.getElementById('stage-filter-trigger');
        if (mainPanel && mainPanel.getAttribute('aria-hidden') !== 'true') {
            if (!mainPanel.contains(e.target) && (!mainTrigger || !mainTrigger.contains(e.target))) {
                mainPanel.setAttribute('aria-hidden', 'true');
                mainPanel.style.display = 'none';
                if (mainTrigger) mainTrigger.setAttribute('aria-expanded', 'false');
            }
        }
        var overviewTrigger = e.target.closest('.overview-stage-filter-trigger');
        var overviewPanel = document.getElementById('overview-stage-filter-dropdown-panel');
        var overviewClearBtn = e.target.closest('.overview-stage-clear-btn');
        if (overviewTrigger) {
            console.log('[Filter by Stage] Overview button hit (delegated handler)');
            e.stopPropagation();
            e.preventDefault();
            if (overviewPanel) {
                var isCurrentlyOpen = overviewPanel.getAttribute('aria-hidden') !== 'true';
                var wantOpen = !isCurrentlyOpen;
                overviewPanel.setAttribute('aria-hidden', wantOpen ? 'false' : 'true');
                overviewTrigger.setAttribute('aria-expanded', wantOpen ? 'true' : 'false');
                overviewPanel.style.display = wantOpen ? 'block' : 'none';
                if (wantOpen) {
                    overviewPanel.classList.add('is-open');
                    var rect = overviewTrigger.getBoundingClientRect();
                    overviewPanel.style.position = 'fixed';
                    overviewPanel.style.left = rect.left + 'px';
                    overviewPanel.style.top = (rect.bottom + 4) + 'px';
                    overviewPanel.style.minWidth = Math.max(rect.width, 220) + 'px';
                } else {
                    overviewPanel.classList.remove('is-open');
                    overviewPanel.style.position = '';
                    overviewPanel.style.left = '';
                    overviewPanel.style.top = '';
                    overviewPanel.style.minWidth = '';
                }
            } else {
                console.warn('[Filter by Stage] Overview panel not found');
            }
            return;
        }
        if (overviewClearBtn) {
            e.stopPropagation();
            if (typeof currentFilters !== 'undefined') currentFilters.stages = [];
            if (typeof updateFiltersUI === 'function') updateFiltersUI();
            if (overviewPanel) {
                overviewPanel.setAttribute('aria-hidden', 'true');
                overviewPanel.style.display = 'none';
                overviewPanel.classList.remove('is-open');
                overviewPanel.style.position = overviewPanel.style.left = overviewPanel.style.top = overviewPanel.style.minWidth = '';
            }
            var t = document.getElementById('overview-stage-filter-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
            if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined') switchView(currentView, allDeals);
            return;
        }
        if (overviewPanel && !e.target.closest('.overview-stage-dropdown-wrap')) {
            overviewPanel.setAttribute('aria-hidden', 'true');
            overviewPanel.style.display = 'none';
            overviewPanel.classList.remove('is-open');
            overviewPanel.style.position = overviewPanel.style.left = overviewPanel.style.top = overviewPanel.style.minWidth = '';
            var ot = document.getElementById('overview-stage-filter-trigger');
            if (ot) ot.setAttribute('aria-expanded', 'false');
        }
    }, true);
}

// Populate and refresh fullscreen overlay (filters + deals list)
function setupFullscreenOverlay() {
    const overlay = document.getElementById('map-fullscreen-overlay');
    if (!overlay) return;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    var stageFiltersEl = document.getElementById('map-fullscreen-stage-filters');
    if (stageFiltersEl) {
        // Map only: Dead and Rejected share one filter (no separate Dead chip)
        var stages = STAGE_DISPLAY_ORDER.filter(function(s) { return s !== 'START' && s !== 'Dead'; });
        var current = (typeof currentFilters !== 'undefined' && currentFilters.stages) ? currentFilters.stages : [];
        stageFiltersEl.innerHTML = '<span class="map-fs-filter-label">Stage:</span>' + stages.map(function(stage) {
            var checked = current.length === 0 || current.some(function(s) {
                var n = normalizeStage(s);
                if (stage === 'Rejected') return n === 'Rejected' || n === 'Dead';
                return n === normalizeStage(stage);
            });
            var cfg = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
            var color = (cfg && cfg.color) || '#8b5cf6';
            return '<label class="map-fs-stage-chip"><input type="checkbox" class="map-fs-stage-cb" value="' + (stage.replace(/"/g, '&quot;')) + '" ' + (checked ? 'checked' : '') + '><span class="map-fs-stage-dot" style="background:' + color + '"></span>' + stage + '</label>';
        }).join('');
        stageFiltersEl.querySelectorAll('.map-fs-stage-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
                var checked = stageFiltersEl.querySelectorAll('.map-fs-stage-cb:checked');
                var selected = Array.from(checked).map(function(c) { return c.value; });
                if (selected.length === stages.length) selected = [];
                if (typeof currentFilters !== 'undefined') currentFilters.stages = selected;
                var deals = (typeof allDeals !== 'undefined' && allDeals.length) ? allDeals : [];
                // When "all" stages selected (selected.length === 0), use forOverview so Rejected/Dead etc. are not excluded by default
                var filtered = applyFilters(deals, true, selected.length === 0);
                if (selected.length) {
                    filtered = filtered.filter(function(d) {
                        var st = normalizeStage(d.Stage || d.stage);
                        return selected.some(function(s) {
                            var n = normalizeStage(s);
                            return n === st || (n === 'Rejected' && st === 'Dead');
                        });
                    });
                }
                initMap(filtered).then(function() {
                    if (window.updateFullscreenDealsList) window.updateFullscreenDealsList();
                });
            });
        });
    }
    var dealsBtn = document.getElementById('map-fullscreen-deals-btn');
    var panel = document.getElementById('map-fullscreen-deals-panel');
    var closeBtn = document.getElementById('map-fullscreen-deals-close');
    if (dealsBtn && panel) {
        dealsBtn.onclick = function() {
            panel.classList.toggle('open');
            if (window.updateFullscreenDealsList) window.updateFullscreenDealsList();
        };
    }
    if (closeBtn && panel) closeBtn.onclick = function() { panel.classList.remove('open'); };
    
    // Swipe-down to close deals panel on mobile
    if (panel && window.IS_MOBILE) {
        let touchStartY = 0;
        let touchCurrentY = 0;
        const header = panel.querySelector('.map-fullscreen-deals-panel-header');
        if (header) {
            header.addEventListener('touchstart', function(e) {
                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                panel.style.transition = 'none';
            }, { passive: true });
            header.addEventListener('touchmove', function(e) {
                touchCurrentY = e.touches[0].clientY;
                const delta = touchCurrentY - touchStartY;
                if (delta > 0) {
                    panel.style.transform = 'translateY(' + delta + 'px)';
                }
            }, { passive: true });
            header.addEventListener('touchend', function() {
                panel.style.transition = '';
                const delta = touchCurrentY - touchStartY;
                if (delta > 80) {
                    panel.classList.remove('open');
                }
                panel.style.transform = '';
            });
        }
    }
    
    var exitCityBtn = document.getElementById('map-fullscreen-exit-city-btn');
    if (exitCityBtn) {
        exitCityBtn.style.display = (typeof isCityView !== 'undefined' && isCityView) ? '' : 'none';
        exitCityBtn.onclick = function() {
            if (typeof exitCityView === 'function') exitCityView();
            exitCityBtn.style.display = 'none';
        };
    }
    if (window.updateFullscreenDealsList) window.updateFullscreenDealsList();
}

function updateFullscreenDealsList() {
    var listEl = document.getElementById('map-fullscreen-deals-list');
    var container = document.getElementById('map-canvas-container');
    if (!listEl || !container || !container.classList.contains('is-fullscreen')) return;
    var deals = (typeof visibleDealsForMap !== 'undefined' && visibleDealsForMap.length) ? visibleDealsForMap : [];
    if (deals.length === 0) {
        listEl.innerHTML = '<p class="map-fs-deals-empty">No deals on map. Adjust filters or zoom.</p>';
        return;
    }
    listEl.innerHTML = deals.slice(0, 100).map(function(deal) {
        var name = (deal.Name || deal.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var stage = (deal.Stage || deal.stage || '—').replace(/</g, '&lt;');
        var loc = (deal.Location || deal.location || '—').replace(/</g, '&lt;');
        return '<button type="button" class="map-fs-deal-row" data-deal-name="' + name + '"><strong>' + name + '</strong><span class="map-fs-deal-meta">' + stage + ' · ' + loc + '</span></button>';
    }).join('');
    if (deals.length > 100) listEl.innerHTML += '<p class="map-fs-deals-more">Showing first 100 of ' + deals.length + ' deals.</p>';
    listEl.querySelectorAll('.map-fs-deal-row').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var n = (this.getAttribute('data-deal-name') || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            var deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(function(d) { return (d.Name || d.name) === n; }) ||
                (visibleDealsForMap && visibleDealsForMap.find(function(d) { return (d.Name || d.name) === n; }));
            if (deal && typeof showDealDetail === 'function') showDealDetail(deal);
        });
    });
}
window.updateFullscreenDealsList = updateFullscreenDealsList;

// One-time delegated handler for map fullscreen (works in Domo/iframe and when map is re-rendered)
function initBackToTopButton() {
    var btn = document.getElementById('back-to-top-btn');
    if (!btn) return;
    function updateVisibility() {
        if (document.body.classList.contains('map-fullscreen-active')) {
            btn.style.display = 'none';
            return;
        }
        var listEl = document.querySelector('.list-view-container');
        var listScroll = listEl ? listEl.scrollTop : 0;
        var winScroll = typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0;
        btn.style.display = (listScroll > 80 || winScroll > 80) ? 'block' : 'none';
    }
    function scrollToTop() {
        var listEl = document.querySelector('.list-view-container');
        if (listEl) listEl.scrollTop = 0;
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    btn.addEventListener('click', scrollToTop);
    var listEl = document.querySelector('.list-view-container');
    if (listEl) listEl.addEventListener('scroll', updateVisibility);
    window.addEventListener('scroll', updateVisibility, { passive: true });
}

function initMapFullscreenDelegation() {
    if (window._mapFullscreenDelegationDone) return;
    window._mapFullscreenDelegationDone = true;
    document.body.addEventListener('click', function(e) {
        const fullscreenBtn = e.target.id === 'map-fullscreen-btn' || e.target.closest('#map-fullscreen-btn');
        const exitBtn = e.target.id === 'map-fullscreen-exit-btn' || e.target.closest('#map-fullscreen-exit-btn');
        if (!fullscreenBtn && !exitBtn) return;
        e.preventDefault();
        e.stopPropagation();
        const mapCanvasContainer = document.getElementById('map-canvas-container');
        const panel = document.getElementById('map-view-panel');
        const fsBtn = document.getElementById('map-fullscreen-btn');
        const fsExitBtn = document.getElementById('map-fullscreen-exit-btn');
        if (exitBtn && mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            var ov = document.getElementById('map-fullscreen-overlay');
            if (ov) { ov.classList.remove('visible'); ov.setAttribute('aria-hidden', 'true'); }
            var legendEl = document.getElementById('map-legend');
            if (legendEl && legendEl.parentNode && legendEl.parentNode.id === 'map-fullscreen-legend-slot') {
                mapCanvasContainer.appendChild(legendEl);
            }
            mapCanvasContainer.classList.remove('is-fullscreen');
            var dp = document.getElementById('map-fullscreen-deals-panel');
            if (dp) dp.classList.remove('open');
            if (fsExitBtn) fsExitBtn.style.display = 'none';
            if (fsBtn) fsBtn.textContent = 'Full screen';
            document.body.classList.remove('map-fullscreen-active');
            if (typeof mapInstance !== 'undefined' && mapInstance) {
                setTimeout(function() {
                    mapInstance.invalidateSize();
                    var c = mapInstance.getCenter();
                    var z = mapInstance.getZoom();
                    mapInstance.setView(c, z);
                    if (typeof mapMarkers !== 'undefined' && mapMarkers.length) {
                        mapMarkers.forEach(function(m) {
                            if (m.marker && m.marker.getLatLng) {
                                var ll = m.marker.getLatLng();
                                if (ll) m.marker.setLatLng(ll);
                            }
                        });
                    }
                }, 150);
            }
            return;
        }
        if (fullscreenBtn && mapCanvasContainer && panel && !panel.classList.contains('view-list')) {
            mapCanvasContainer.classList.add('is-fullscreen');
            if (fsExitBtn) fsExitBtn.style.display = 'block';
            if (fsBtn) fsBtn.textContent = 'Exit full screen';
            document.body.classList.add('map-fullscreen-active');
            // Try native Fullscreen API for truly immersive experience
            try {
                var fsEl = document.documentElement;
                if (fsEl.requestFullscreen) fsEl.requestFullscreen().catch(function(){});
                else if (fsEl.webkitRequestFullscreen) fsEl.webkitRequestFullscreen();
            } catch (e) { /* Domo iframe may block — CSS fallback works */ }
            if (typeof setupFullscreenOverlay === 'function') setupFullscreenOverlay();
            var legendEl = document.getElementById('map-legend');
            var legendSlot = document.getElementById('map-fullscreen-legend-slot');
            if (legendEl && legendSlot && legendEl.parentNode !== legendSlot) {
                legendSlot.appendChild(legendEl);
            }
            if (typeof applyFilters === 'function' && typeof initMap === 'function') {
                var deals = (typeof allDeals !== 'undefined' && allDeals.length) ? allDeals : [];
                var showAllStages = (typeof currentFilters !== 'undefined' && (!currentFilters.stages || currentFilters.stages.length === 0));
                var filtered = applyFilters(deals, true, showAllStages);
                initMap(filtered).then(function() {
                    if (typeof mapInstance !== 'undefined' && mapInstance) {
                        mapInstance.invalidateSize();
                        var c = mapInstance.getCenter();
                        var z = mapInstance.getZoom();
                        mapInstance.setView(c, z);
                    }
                });
            } else if (typeof mapInstance !== 'undefined' && mapInstance) {
                function fullscreenMapResize() {
                    mapInstance.invalidateSize();
                    var c = mapInstance.getCenter();
                    var z = mapInstance.getZoom();
                    mapInstance.setView(c, z);
                    if (typeof mapMarkers !== 'undefined' && mapMarkers.length) {
                        mapMarkers.forEach(function(m) {
                            if (m.marker && m.marker.getLatLng) {
                                var ll = m.marker.getLatLng();
                                if (ll) m.marker.setLatLng(ll);
                            }
                        });
                    }
                }
                setTimeout(fullscreenMapResize, 100);
                setTimeout(fullscreenMapResize, 350);
                setTimeout(fullscreenMapResize, 600);
            }
        }
    });
    window.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        const mapCanvasContainer = document.getElementById('map-canvas-container');
        if (mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            e.preventDefault();
            var ov = document.getElementById('map-fullscreen-overlay');
            if (ov) { ov.classList.remove('visible'); ov.setAttribute('aria-hidden', 'true'); }
            var legendEl = document.getElementById('map-legend');
            if (legendEl && legendEl.parentNode && legendEl.parentNode.id === 'map-fullscreen-legend-slot') {
                mapCanvasContainer.appendChild(legendEl);
            }
            mapCanvasContainer.classList.remove('is-fullscreen');
            var dp = document.getElementById('map-fullscreen-deals-panel');
            if (dp) dp.classList.remove('open');
            const fsExitBtn = document.getElementById('map-fullscreen-exit-btn');
            const fsBtn = document.getElementById('map-fullscreen-btn');
            if (fsExitBtn) fsExitBtn.style.display = 'none';
            if (fsBtn) fsBtn.textContent = 'Full screen';
            document.body.classList.remove('map-fullscreen-active');
            // Exit native fullscreen if active
            try {
                if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
                else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
            } catch (e) { /* ignore */ }
            if (typeof mapInstance !== 'undefined' && mapInstance) {
                setTimeout(function() {
                    mapInstance.invalidateSize();
                    var c = mapInstance.getCenter();
                    var z = mapInstance.getZoom();
                    mapInstance.setView(c, z);
                }, 150);
            }
        }
    });
}

// Main initialization
function isMobileLayout() {
    return !!(window.IS_MOBILE_LAYOUT);
}
function updateMobileLayoutState() {
    const mq600 = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    const mq768Portrait = window.matchMedia && window.matchMedia('(max-width: 768px)').matches && window.matchMedia('(orientation: portrait)').matches;
    const ml = mq600 || mq768Portrait;
    document.documentElement.setAttribute('data-mobile-layout', ml ? 'true' : 'false');
    window.IS_MOBILE_LAYOUT = ml;
    return ml;
}
function updateMobileState() {
    const wasMobile = window.IS_MOBILE;
    const wasMobileLayout = window.IS_MOBILE_LAYOUT;
    const m = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches || ('ontouchstart' in window && window.innerWidth <= 1024);
    document.documentElement.setAttribute('data-mobile', m ? 'true' : 'false');
    window.IS_MOBILE = m;
    const ml = updateMobileLayoutState();
    if (wasMobileLayout !== ml && typeof rerenderForMobileLayout === 'function') {
        rerenderForMobileLayout();
    }
    
    // Sync mobile filter toggle visibility on resize/rotation
    const mft = document.getElementById('mobile-filter-toggle');
    const fc = document.getElementById('filter-controls');
    const sc = document.getElementById('sort-controls');
    const showFilters = currentView === 'list' || currentView === 'location' || currentView === 'upcoming-dates';
    if (showFilters && mft) {
        if (m) {
            mft.style.display = 'flex';
            const expanded = mft.getAttribute('aria-expanded') === 'true';
            if (fc) fc.style.display = expanded ? 'flex' : 'none';
            if (sc) sc.style.display = expanded ? 'flex' : 'none';
        } else {
            mft.style.display = 'none';
            if (fc) fc.style.display = 'flex';
            if (sc) sc.style.display = 'flex';
        }
    }
}
var _mobileResizeT;
function debouncedMobileResize() {
    clearTimeout(_mobileResizeT);
    _mobileResizeT = setTimeout(updateMobileState, 100);
}

function renderMobileDealCards(deals) {
    const container = document.getElementById('mobile-deal-cards-container');
    if (!container) return;
    if (!deals || deals.length === 0) {
        container.innerHTML = '<div class="mobile-empty-state"><p>No deals found</p><p class="mobile-empty-sub">Try adjusting your filters</p></div>';
        return;
    }
    const sortConfig = window.listViewSort || currentSort || { by: 'date', order: 'asc' };
    const sorted = [...deals].sort((a, b) => sortDeal(a, b, sortConfig));
    container.innerHTML = sorted.map(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
        const loc = getDealLocation(deal) || '';
        const units = deal['Unit Count'] || deal.unitCount || '';
        const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
        const dateStr = startDate ? (typeof startDate === 'string' ? startDate.split('T')[0] : new Date(startDate).toISOString().split('T')[0]) : '';
        const name = (deal.Name || deal.name || 'Unnamed').replace(/</g, '&lt;');
        return `<div class="mobile-deal-card" data-deal-id="${(deal.DealPipelineId || deal.id || '').toString().replace(/"/g, '&quot;')}" role="button" tabindex="0">
            <div class="mobile-deal-card-header">
                <span class="stage-badge ${cfg.class}">${stage}</span>
                <span class="mobile-deal-card-name">${name}</span>
            </div>
            <div class="mobile-deal-card-meta">${loc ? '<span>' + loc.replace(/</g, '&lt;') + '</span>' : ''}${units ? '<span>' + units + ' units</span>' : ''}${dateStr ? '<span>' + dateStr + '</span>' : ''}</div>
        </div>`;
    }).join('');
    container.querySelectorAll('.mobile-deal-card').forEach(card => {
        const id = card.dataset.dealId;
        const deal = (window.allDeals || []).find(d => String(d.DealPipelineId || d.id || '') === id) || sorted.find(d => String(d.DealPipelineId || d.id || '') === id);
        if (deal) {
            card.addEventListener('click', () => showDealDetail(deal));
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDealDetail(deal); } });
        }
    });
}

function openMobileFilterDrawer() {
    const drawer = document.getElementById('mobile-filter-drawer');
    const body = document.getElementById('mobile-filter-drawer-body');
    const fc = document.getElementById('filter-controls');
    const sc = document.getElementById('sort-controls');
    if (drawer && body && fc && sc) {
        body.appendChild(fc);
        body.appendChild(sc);
        drawer.setAttribute('aria-hidden', 'false');
        drawer.classList.add('is-open');
        updateFiltersUI();
        updateSortUI();
    }
}
function closeMobileFilterDrawer() {
    const drawer = document.getElementById('mobile-filter-drawer');
    const body = document.getElementById('mobile-filter-drawer-body');
    const desktopContent = document.getElementById('desktop-content');
    const fc = document.getElementById('filter-controls');
    const sc = document.getElementById('sort-controls');
    const listView = document.querySelector('.list-view-container');
    if (drawer && body && desktopContent && fc && sc && listView) {
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        desktopContent.insertBefore(sc, listView);
        desktopContent.insertBefore(fc, sc);
    }
}

function rerenderForMobileLayout() {
    const dc = document.getElementById('desktop-content');
    const ms = document.getElementById('mobile-shell');
    if (isMobileLayout()) {
        if (dc) dc.style.display = 'none';
        if (ms) { ms.style.display = ''; ms.removeAttribute('aria-hidden'); }
        const deals = typeof allDeals !== 'undefined' ? allDeals : [];
        const filtered = applyFilters(deals, true);
        renderMobileDealCards(filtered);
        const mapPane = document.getElementById('mobile-map-pane');
        if (mapPane && mapPane.style.display !== 'none') {
            const container = document.getElementById('mobile-map-container');
            if (container && typeof initMap === 'function') {
                initMap(filtered).then(() => {
                    if (typeof mapInstance !== 'undefined' && mapInstance) mapInstance.invalidateSize();
                }).catch(() => {});
            }
        }
    } else {
        if (dc) dc.style.display = '';
        if (ms) { ms.style.display = 'none'; ms.setAttribute('aria-hidden', 'true'); }
        closeMobileFilterDrawer();
        switchView(currentView, typeof allDeals !== 'undefined' ? allDeals : []);
    }
}

function initMobileLayout() {
    const shell = document.getElementById('mobile-shell');
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (!shell || !bottomNav) return;
    if (window.matchMedia) {
        window.matchMedia('(max-width: 600px)').addEventListener('change', debouncedMobileResize);
        window.matchMedia('(max-width: 768px)').addEventListener('change', debouncedMobileResize);
        window.matchMedia('(orientation: portrait)').addEventListener('change', debouncedMobileResize);
    }
    bottomNav.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pane = btn.dataset.pane;
            bottomNav.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const dealsPane = document.getElementById('mobile-deals-pane');
            const mapPane = document.getElementById('mobile-map-pane');
            const morePane = document.getElementById('mobile-more-pane');
            if (pane === 'deals') {
                if (dealsPane) dealsPane.style.display = '';
                if (mapPane) mapPane.style.display = 'none';
                if (morePane) morePane.style.display = 'none';
                closeMobileFilterDrawer();
            } else if (pane === 'map') {
                if (dealsPane) dealsPane.style.display = 'none';
                if (mapPane) { mapPane.style.display = ''; mapPane.style.flex = '1'; }
                if (morePane) morePane.style.display = 'none';
                closeMobileFilterDrawer();
                const container = document.getElementById('mobile-map-container');
                const filtered = applyFilters(typeof allDeals !== 'undefined' ? allDeals : [], true);
                if (container && typeof renderByLocation === 'function') {
                    container.innerHTML = renderByLocation(filtered);
                    setTimeout(async () => {
                        if (typeof initMap === 'function') await initMap(filtered);
                        if (mapInstance) mapInstance.invalidateSize();
                    }, 100);
                }
            } else if (pane === 'filter') {
                if (dealsPane) dealsPane.style.display = 'none';
                if (mapPane) mapPane.style.display = 'none';
                if (morePane) morePane.style.display = 'none';
                openMobileFilterDrawer();
            } else if (pane === 'more') {
                closeMobileFilterDrawer();
                if (dealsPane) dealsPane.style.display = 'none';
                if (mapPane) mapPane.style.display = 'none';
                if (morePane) { morePane.style.display = ''; morePane.style.flex = '1'; }
            }
        });
    });
    document.getElementById('mobile-filter-drawer-close')?.addEventListener('click', () => {
        closeMobileFilterDrawer();
        bottomNav.querySelector('.mobile-nav-btn[data-pane="deals"]')?.click();
    });
    document.querySelectorAll('.mobile-more-link').forEach(link => {
        link.addEventListener('click', () => {
            const view = link.dataset.view;
            closeMobileFilterDrawer();
            const links = document.getElementById('mobile-more-links');
            const wrap = document.getElementById('mobile-more-view-wrap');
            const scroll = document.getElementById('mobile-more-view-scroll');
            const dealListContainer = document.getElementById('deal-list-container');
            const listViewContainer = document.querySelector('.list-view-container');
            if (links && wrap && scroll && dealListContainer && listViewContainer) {
                links.style.display = 'none';
                wrap.style.display = '';
                scroll.innerHTML = '';
                scroll.appendChild(dealListContainer);
                currentView = view;
                switchView(view, typeof allDeals !== 'undefined' ? allDeals : []).then(() => {
                    if (typeof setupDrillDownHandlers === 'function') setupDrillDownHandlers();
                });
            }
        });
    });
    document.getElementById('mobile-more-back')?.addEventListener('click', () => {
        const links = document.getElementById('mobile-more-links');
        const wrap = document.getElementById('mobile-more-view-wrap');
        const scroll = document.getElementById('mobile-more-view-scroll');
        const dealListContainer = document.getElementById('deal-list-container');
        const listViewContainer = document.querySelector('.list-view-container');
        if (links && wrap && scroll && dealListContainer && listViewContainer) {
            wrap.style.display = 'none';
            links.style.display = '';
            listViewContainer.appendChild(dealListContainer);
        }
    });
}
