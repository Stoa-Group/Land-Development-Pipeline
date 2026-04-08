/**
 * app-upcoming-map.js — Upcoming dates view, geocoding, map (renderByLocation), contacts map
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function renderUpcomingDatesView(deals) {
    const filtered = applyFilters(deals, true);
    const summary = calculateSummary(filtered, true);
    const sortConfig = window.upcomingDatesSort || { by: 'date', order: 'asc' };
    const upcoming = (summary.upcomingDates || []).slice().sort((a, b) => {
        let cmp = 0;
        const dA = a.date instanceof Date ? a.date : new Date(a.date);
        const dB = b.date instanceof Date ? b.date : new Date(b.date);
        if (sortConfig.by === 'date') cmp = dA - dB;
        else if (sortConfig.by === 'name') cmp = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        else if (sortConfig.by === 'stage') cmp = (a.stage || '').toLowerCase().localeCompare((b.stage || '').toLowerCase());
        else if (sortConfig.by === 'location') cmp = (a.location || '').toLowerCase().localeCompare((b.location || '').toLowerCase());
        else if (sortConfig.by === 'dateType') cmp = (a.dateType || '').toLowerCase().localeCompare((b.dateType || '').toLowerCase());
        return sortConfig.order === 'asc' ? cmp : -cmp;
    });
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const rowsHtml = upcoming.map(item => {
        const d = item.date instanceof Date ? item.date : new Date(item.date);
        const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
        const daysText = days === 0 ? 'Today' : days === 1 ? 'In 1 day' : days < 0 ? `${Math.abs(days)} days ago` : `In ${days} days`;
        const nameEsc = (item.name || 'Unnamed').replace(/"/g, '&quot;');
        const stageClass = (STAGE_CONFIG[item.stage] || STAGE_CONFIG['Prospective']).class;
        const dateType = item.dateType || 'Start date';
        return `<tr class="upcoming-date-row clickable" data-source="deal" data-deal-name="${nameEsc}" style="cursor: pointer;">
            <td class="upcoming-date-type">${dateType}</td>
            <td>${formatDate(d)}</td>
            <td>${daysText}</td>
            <td class="deal-name">${(item.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
            <td><span class="stage-badge ${stageClass}">${item.stage || '—'}</span></td>
            <td>${(item.location || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        </tr>`;
    }).join('');
    const emptyRow = upcoming.length === 0 ? '<tr class="upcoming-date-row-empty"><td colspan="6" class="no-data">No upcoming deal dates in the filtered set.</td></tr>' : '';
    return `
        ${renderActiveFilters()}
        <div class="upcoming-dates-view">
            <h2 class="upcoming-dates-view-title">Upcoming Dates</h2>
            <p class="upcoming-dates-view-desc">Internal deal start dates and key dates from the database. The &quot;Date Type&quot; column indicates the kind of date; &quot;Days from today&quot; shows how many days until each date. Click a row to open the deal; the detail view will flag any Asana start date discrepancy if the API is available.</p>
            <div class="upcoming-dates-list" id="upcoming-dates-list">
                <table class="deal-list-table upcoming-dates-table">
                    <thead>
                        <tr>
                            <th class="sortable-header ${sortConfig.by === 'dateType' ? 'sorted' : ''}" data-sort-by="dateType" data-sort-order="${sortConfig.by === 'dateType' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Date Type ${sortConfig.by === 'dateType' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="sortable-header ${sortConfig.by === 'date' ? 'sorted' : ''}" data-sort-by="date" data-sort-order="${sortConfig.by === 'date' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Date ${sortConfig.by === 'date' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th>Days from today</th>
                            <th class="sortable-header ${sortConfig.by === 'name' ? 'sorted' : ''}" data-sort-by="name" data-sort-order="${sortConfig.by === 'name' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Deal ${sortConfig.by === 'name' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="sortable-header ${sortConfig.by === 'stage' ? 'sorted' : ''}" data-sort-by="stage" data-sort-order="${sortConfig.by === 'stage' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Stage ${sortConfig.by === 'stage' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="sortable-header ${sortConfig.by === 'location' ? 'sorted' : ''}" data-sort-by="location" data-sort-order="${sortConfig.by === 'location' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Location ${sortConfig.by === 'location' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                        </tr>
                    </thead>
                    <tbody id="upcoming-dates-tbody">
                        ${rowsHtml || emptyRow}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Fetch Asana upcoming tasks and merge into Upcoming Dates table (view-only; match by project name to deal name)
function loadUpcomingDatesAsanaAndMerge(container, deals) {
    const tbody = container && container.querySelector('#upcoming-dates-tbody');
    if (!tbody) return;
    const filtered = applyFilters(deals || [], true);
    const summary = calculateSummary(filtered, true);
    const dealDates = (summary.upcomingDates || []).slice();
    const dealNamesNormalized = new Set(filtered.map(d => (d.Name || d.name || '').toLowerCase().trim()));

    const dealItems = dealDates.map(item => ({
        ...item,
        source: 'deal',
        date: item.date instanceof Date ? item.date : new Date(item.date)
    }));

    if (typeof API === 'undefined' || !API.getAsanaUpcomingTasks) return;

    API.getAsanaUpcomingTasks({ daysAhead: 90 }).then(function(res) {
        if (!res || !res.success || !Array.isArray(res.data)) return;
        const asanaItems = [];
        res.data.forEach(function(project) {
            const projectName = (project.projectName || project.name || '').trim();
            (project.tasks || []).forEach(function(task) {
                const dueOn = task.due_on;
                if (!dueOn) return;
                const taskName = (task.name || 'Task').trim();
                const projectMatchesDeal = Array.from(dealNamesNormalized).some(function(dn) {
                    return asanaProjectNameMatchesDeal(projectName, dn);
                });
                const taskMatchesDeal = Array.from(dealNamesNormalized).some(function(dn) {
                    return asanaProjectNameMatchesDeal(taskName, dn);
                });
                if (!projectMatchesDeal && !taskMatchesDeal) return;
                const date = parseLocalDateOnly(dueOn) || new Date(dueOn);
                if (!date || isNaN(date.getTime())) return;
                asanaItems.push({
                    date: date,
                    name: taskName,
                    source: 'asana',
                    taskName: taskName,
                    taskGid: task.gid,
                    permalink_url: task.permalink_url || ('https://app.asana.com/0/0/' + (task.gid || '')),
                    location: '—',
                    stage: '—'
                });
            });
        });

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const combined = [...dealItems, ...asanaItems].sort(function(a, b) { return a.date - b.date; });

        const defaultStageClass = (STAGE_CONFIG['Prospective'] || {}).class || 'prospective';
        const emptyMsg = '<tr class="upcoming-date-row-empty"><td colspan="6" class="no-data">No upcoming deal dates or Asana tasks in the filtered set.</td></tr>';
        const rowsHtml = combined.length === 0 ? emptyMsg : combined.map(function(item) {
            const d = item.date;
            const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
            const daysText = days === 0 ? 'Today' : days === 1 ? 'In 1 day' : days < 0 ? Math.abs(days) + ' days ago' : 'In ' + days + ' days';
            if (item.source === 'asana') {
                const taskNameEsc = (item.taskName || item.name || 'Task').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                const link = (item.permalink_url || '').replace(/"/g, '&quot;');
                return '<tr class="upcoming-date-row upcoming-date-row-asana" data-source="asana">' +
                    '<td>' + formatDate(d) + '</td>' +
                    '<td>' + daysText + '</td>' +
                    '<td class="deal-name">' + taskNameEsc + '</td>' +
                    '<td>—</td>' +
                    '<td>—</td>' +
                    '<td class="upcoming-source"><a href="' + link + '" target="_blank" rel="noopener noreferrer" class="upcoming-open-asana">Open in Asana</a></td>' +
                    '</tr>';
            }
            const nameEsc = (item.name || 'Unnamed').replace(/"/g, '&quot;');
            return '<tr class="upcoming-date-row clickable" data-source="deal" data-deal-name="' + nameEsc + '" style="cursor: pointer;">' +
                '<td>' + formatDate(d) + '</td>' +
                '<td>' + daysText + '</td>' +
                '<td class="deal-name">' + (item.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>' +
                '<td><span class="stage-badge ' + defaultStageClass + '">' + (item.stage || '—') + '</span></td>' +
                '<td>' + (item.location || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</td>' +
                '<td class="upcoming-source">Deal</td>' +
                '</tr>';
        }).join('');

        tbody.innerHTML = rowsHtml || emptyMsg;

        document.querySelectorAll('.upcoming-date-row[data-source="deal"][data-deal-name]').forEach(function(row) {
            row.addEventListener('click', function() {
                var dealName = (this.dataset.dealName || '').replace(/&quot;/g, '"');
                var deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(function(d) { return (d.Name || d.name) === dealName; });
                if (deal && typeof showDealDetail === 'function') showDealDetail(deal);
            });
        });
    }).catch(function() {
        /* Asana unavailable: keep deal-only rows, show optional note */
        const note = container && container.querySelector('.upcoming-asana-unavailable-note');
        if (!note) {
            const wrap = container && container.querySelector('.upcoming-dates-list');
            if (wrap) {
                const el = document.createElement('p');
                el.className = 'upcoming-asana-unavailable-note';
                el.setAttribute('aria-live', 'polite');
                el.textContent = 'Asana tasks unavailable. Showing deal dates only.';
                wrap.insertBefore(el, wrap.firstChild);
            }
        }
    });
}

// Geocode location (simple city, state parser)
// Cache for geocoded locations to avoid repeated API calls
const geocodeCache = {};
// Session cache: reuse resolved coords when re-building map (e.g. filter toggles) for faster load
let locationCoordsSessionCache = {};

async function geocodeLocation(location) {
    if (!location || location === 'Unknown') return null;
    
    // Check cache first
    if (geocodeCache[location]) {
        return geocodeCache[location];
    }
    
    // Simple mapping for common cities (fast lookup)
    const cityStateMap = {
        'Panama City, FL': [30.1588, -85.6602],
        'Fayetteville, NC': [35.0527, -78.8784],
        'Greenville, NC': [35.6127, -77.3663],
        'New Bern, NC': [35.1085, -77.0441],
        'Irmo, SC': [34.0854, -81.1832],
        'Hardeeville, SC': [32.2871, -81.0790],
        'Bartlett, TN': [35.2045, -89.8735],
        'Conway, LA': [30.4049, -91.0487],
        'Covington, LA': [30.4755, -90.1001],
        'Birmingham, AL': [33.5207, -86.8025],
        'Foley, AL': [30.4066, -87.6836],
        'Fort Walton Beach, FL': [30.4058, -86.6188],
        'Charlotte, NC': [35.2271, -80.8431],
        'Freeport, FL': [30.4983, -86.1361],
        'Flowood, MS': [32.3096, -90.1381],
        'Harvey, LA': [29.9035, -90.0773],
        'Pensacola, FL': [30.4213, -87.2169],
        'Baton Rouge, LA': [30.4515, -91.1871],
        'Columbia, SC': [34.0007, -81.0348],
        'Mobile, AL': [30.6954, -88.0399],
        'Gonzales, Louisiana': [30.2383, -90.9201],
        'Gonzales, LA': [30.2383, -90.9201]
    };
    
    // Try exact match first
    if (cityStateMap[location]) {
        geocodeCache[location] = cityStateMap[location];
        return cityStateMap[location];
    }
    
    // Try case-insensitive exact match (handles "charlotte, nc", "Charlotte,NC", etc.)
    const normalizedLoc = location.trim();
    const exactKey = Object.keys(cityStateMap).find(k => k.toLowerCase() === normalizedLoc.toLowerCase());
    if (exactKey) {
        geocodeCache[location] = cityStateMap[exactKey];
        return cityStateMap[exactKey];
    }

    // Try to extract city and state for partial match
    const match = location.match(/([^,]+),\s*([A-Za-z]{2})$/);
    if (match) {
        const city = match[1].trim();
        const state = match[2].toUpperCase();
        
        // Partial match: require city name in key (not state-only, or Charlotte could get Fayetteville, NC)
        for (const [key, coords] of Object.entries(cityStateMap)) {
            if (key.toLowerCase().includes(city.toLowerCase())) {
                geocodeCache[location] = coords;
                return coords;
            }
        }
    }
    
    // If not in hardcoded list, try OpenStreetMap Nominatim API.
    // In Domo: ensure Content-Security-Policy connect-src allows https://nominatim.openstreetmap.org
    try {
        const encodedLocation = encodeURIComponent(location);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1`, {
            headers: {
                'User-Agent': 'STOA Deal Pipeline Dashboard'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                if (!isNaN(lat) && !isNaN(lon)) {
                    const coords = [lat, lon];
                    geocodeCache[location] = coords;
                    return coords;
                }
            }
        }
    } catch (error) {
        if (!window._geocodeNetworkWarned) {
            window._geocodeNetworkWarned = true;
            _dpWarn('Geocoding unavailable (network/CSP). Add https://nominatim.openstreetmap.org to connect-src if needed. First failure:', location, error);
        }
    }
    
    // Return null if all methods fail
    return null;
}

// Render table for visible deals on map
function renderMapTable(deals) {
    if (!deals || deals.length === 0) {
        return `
            <div class="empty-state">
                <img src="Logos/STOA20-Logo-Mark-Grey.jpg" alt="STOA" class="stoa-logo" />
                <div class="empty-state-text">No deals visible on map</div>
                <div class="empty-state-subtext">Zoom or pan to see deals in the current view</div>
            </div>
        `;
    }
    
    // Add header showing count of visible deals
    const totalVisibleUnits = deals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
    const headerHtml = `
        <div style="margin-bottom: 16px; padding: 12px; background-color: var(--bg-secondary, #f5f5f5); border-radius: 8px; border-left: 4px solid var(--primary-green, #7e8a6b);">
            <strong>Visible Deals on Map:</strong> ${deals.length} deal${deals.length !== 1 ? 's' : ''} | ${totalVisibleUnits.toLocaleString()} total units
        </div>
    `;
    
    const grouped = {};
    
    deals.forEach(deal => {
        const location = getDealLocation(deal) || 'Unknown';
        if (!grouped[location]) {
            grouped[location] = [];
        }
        grouped[location].push(deal);
    });
    
    // Include all locations (including Unknown) so every deal appears in the list; put Unknown last
    const locations = Object.keys(grouped).sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return a.localeCompare(b);
    });
    
    const mapSortConfig = window.mapTableSort || { by: 'name', order: 'asc' };
    const sortableTh = (col, label) => {
        const isActive = mapSortConfig.by === col;
        const order = isActive ? mapSortConfig.order : 'asc';
        const nextOrder = isActive && order === 'asc' ? 'desc' : 'asc';
        return `<th class="sortable-header map-table-sort ${isActive ? 'sorted' : ''}" data-sort-by="${col}" data-sort-order="${nextOrder}" style="cursor: pointer;">${label} ${isActive ? (order === 'asc' ? '↑' : '↓') : ''}</th>`;
    };
    
    return headerHtml + locations.map(location => {
        const locationDeals = grouped[location];
        const sorted = [...locationDeals].sort((a, b) => sortDeal(a, b, mapSortConfig));
        const totalUnits = locationDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span class="clickable" data-location="${location}">Location: ${location}</span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${locationDeals.length} deals | ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table map-location-table">
                            <thead>
                                <tr>
                                    ${sortableTh('name', 'Name')}
                                    ${sortableTh('stage', 'Stage')}
                                    ${sortableTh('units', 'Unit Count')}
                                    ${sortableTh('date', 'Start Date')}
                                    ${sortableTh('bank', 'Bank')}
                                    ${sortableTh('product', 'Product Type')}
                                    ${sortableTh('location', 'Location')}
                                    ${sortableTh('notes', 'Notes')}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sorted.map(deal => renderDealRow(deal)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Update table based on all deals with markers on the map (not just viewport)
function updateMapTable() {
    const tableContainer = document.getElementById('map-table-container');
    if (!tableContainer) return;

    if (!mapInstance || mapMarkers.length === 0) {
        // No markers yet (e.g. initMap not done) – fall back to filtered deals so list view still shows data
        let dealsToShow = visibleDealsForMap && visibleDealsForMap.length > 0 ? visibleDealsForMap : [];
        if (dealsToShow.length === 0 && typeof allDeals !== 'undefined' && allDeals.length > 0) {
            const filtered = applyFilters(allDeals, true);
            dealsToShow = filtered.filter(deal => {
                const loc = getDealLocation(deal);
                return loc && loc !== 'Unknown';
            });
        }
        if (dealsToShow.length > 0) {
            tableContainer.innerHTML = renderMapTable(dealsToShow);
            setupDrillDownHandlers();
        } else {
            tableContainer.innerHTML = '<div class="empty-state">No deals match the current filters</div>';
        }
        return;
    }
    
    // Get all deals from all markers on the map (not just viewport-visible)
    const allDealsOnMap = [];
    
    mapMarkers.forEach(markerData => {
            // Handle both city markers (with deals array) and property markers (with deal object)
            if (markerData.deals && Array.isArray(markerData.deals)) {
                // City marker - has deals array
            allDealsOnMap.push(...markerData.deals);
            } else if (markerData.deal) {
                // Property marker - has single deal object
            allDealsOnMap.push(markerData.deal);
        }
    });
    
    // Remove duplicates (in case a deal appears in multiple markers)
    const uniqueDeals = [];
    const seenDealIds = new Set();
    allDealsOnMap.forEach(deal => {
        const dealId = deal.DealPipelineId || deal.ProjectId || deal.Name || deal.name;
        if (!seenDealIds.has(dealId)) {
            seenDealIds.add(dealId);
            uniqueDeals.push(deal);
        }
    });
    
    visibleDealsForMap = uniqueDeals;
    
    // Update the table container
    tableContainer.innerHTML = renderMapTable(uniqueDeals);
    setupDrillDownHandlers();
    if (window.updateFullscreenDealsList) window.updateFullscreenDealsList();
}

// Render by Location with Map
function renderByLocation(deals) {
    // Exclude START deals and filter by location
    const filtered = applyFilters(deals, true); // Exclude START deals
    const allDealsForMap = filtered.filter(deal => {
        const location = getDealLocation(deal);
        return location && location !== 'Unknown';
    });
    
    const mapHtml = `
        ${renderActiveFilters()}
        <div class="map-view-panel view-map" id="map-view-panel">
            <div id="map-controls-container" class="map-controls">
                <div class="map-view-toggle" role="group" aria-label="Map, split, or list view">
                    <button type="button" class="map-view-toggle-btn active" id="map-view-map-btn" data-view="map" aria-pressed="true">Map</button>
                    <button type="button" class="map-view-toggle-btn" id="map-view-split-btn" data-view="split" aria-pressed="false">Split</button>
                    <button type="button" class="map-view-toggle-btn" id="map-view-list-btn" data-view="list" aria-pressed="false">List</button>
                </div>
                <div class="map-search-row">
                    <label for="map-location-search" class="map-search-label">Enter a location</label>
                    <input type="text" id="map-location-search" class="map-location-search-input" placeholder="e.g. Baton Rouge, LA or New Orleans" autocomplete="off" />
                    <button type="button" id="map-location-search-btn" class="map-btn map-btn-primary" aria-label="Go to location">Go</button>
                </div>
                <div class="map-toolbar">
                    <button id="toggle-map-btn" class="map-btn map-btn-secondary" style="display: none;">Hide Map</button>
                    <button id="exit-city-view-btn" class="map-btn map-btn-secondary exit-city-view-btn" style="display: none;">Exit City View</button>
                    <button id="map-fit-all-btn" class="map-btn map-btn-primary" title="Fit map to show all deals">Fit All Deals</button>
                    <button id="map-fullscreen-btn" class="map-btn map-btn-secondary" title="Expand map to full screen" aria-label="Full screen">Full screen</button>
                </div>
            </div>
            <div class="map-split-wrap" id="map-split-wrap">
                <div class="map-canvas-container" id="map-canvas-container">
                    <div id="location-map" class="location-map-canvas"></div>
                    <div id="map-legend" class="map-legend" style="display: none;" aria-hidden="true"></div>
                    <button type="button" class="map-fullscreen-exit" id="map-fullscreen-exit-btn" aria-label="Exit full screen" style="display: none;">Exit full screen</button>
                    <div class="map-fullscreen-overlay" id="map-fullscreen-overlay" aria-hidden="true">
                        <div class="map-fullscreen-topbar">
                            <button type="button" class="map-fullscreen-exit-city-btn map-btn map-btn-secondary" id="map-fullscreen-exit-city-btn" aria-label="Exit city view" style="display: none;">Exit City View</button>
                            <div class="map-fullscreen-stage-filters" id="map-fullscreen-stage-filters"></div>
                        </div>
                        <div class="map-fullscreen-bottom-left" id="map-fullscreen-bottom-left">
                            <button type="button" class="map-fullscreen-deals-btn" id="map-fullscreen-deals-btn" aria-label="Toggle deals list">Deals</button>
                            <div class="map-fullscreen-legend-slot" id="map-fullscreen-legend-slot"></div>
                        </div>
                        <div class="map-fullscreen-deals-panel" id="map-fullscreen-deals-panel">
                            <div class="map-fullscreen-deals-panel-header">
                                <h3>Deals on map</h3>
                                <button type="button" class="map-fullscreen-deals-close" id="map-fullscreen-deals-close" aria-label="Close">×</button>
                            </div>
                            <div class="map-fullscreen-deals-list" id="map-fullscreen-deals-list"></div>
                        </div>
                    </div>
                </div>
                <div id="map-table-container" class="map-table-container"></div>
            </div>
        </div>
    `;
    
    return mapHtml;
}

// Prevent overlapping initMap runs (avoids layering when toggling filters quickly)
let mapInitInProgress = false;

// Initialize map
async function initMap(deals) {
    if (mapInitInProgress) return;
    mapInitInProgress = true;
    try {
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
        
        const mapDiv = document.getElementById('location-map');
        if (!mapDiv) { mapInitInProgress = false; return; }
        
        // Clear previous markers so we never layer city dots + color markers
        mapMarkers = [];
        allMapMarkers = [];
        isCityView = false;
        currentCityView = null;
        
        // Deals passed to initMap should already be filtered, but ensure they have locations
        const allDealsForMap = (deals || []).filter(deal => {
            const location = getDealLocation(deal);
            return location && location !== 'Unknown';
        });
        
        // Restrict map to continental US only; default view centered on US
        const DEFAULT_MAP_CENTER = [39.5, -98.5]; // Center of continental US
        const DEFAULT_MAP_ZOOM = 4;
        const US_BOUNDS = L.latLngBounds([[24, -125], [49, -66]]); // Continental US (SW to NE)
        mapInstance = L.map('location-map', {
            center: DEFAULT_MAP_CENTER,
            zoom: DEFAULT_MAP_ZOOM,
            maxBounds: US_BOUNDS,
            maxBoundsViscosity: 1.0
        });
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(mapInstance);
        
        // In full screen: always individual color-coded markers (no city view / city dots)
        const mapCanvasContainer = document.getElementById('map-canvas-container');
        const isFullscreen = mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen');
        const useCityView = !isFullscreen && currentFilters.stages.length === 0 &&
            !currentFilters.state && !currentFilters.bank && !currentFilters.product && !currentFilters.search;
    
    const legendEl = document.getElementById('map-legend');
    if (legendEl) {
        legendEl.style.display = useCityView ? 'none' : 'block';
        legendEl.setAttribute('aria-hidden', useCityView ? 'true' : 'false');
    }
    
    if (useCityView) {
    // --- City view: one marker per location (decluttered) ---
    const locationGroups = {};
    allDealsForMap.forEach(deal => {
        const location = getDealLocation(deal);
        if (location && location !== 'Unknown') {
            if (!locationGroups[location]) {
                locationGroups[location] = [];
            }
            locationGroups[location].push(deal);
        }
    });
    
    const markerPromises = Object.keys(locationGroups).map(async (location) => {
        const locationDeals = locationGroups[location];
        
        // Try to get coordinates from deal data first (check multiple field names)
        let coords = null;
        const dealsWithCoords = locationDeals.filter(deal => {
            let lat = null;
            let lng = null;
            
            // Check lowercase fields first
            if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
                lat = parseFloat(deal.latitude);
                lng = parseFloat(deal.longitude);
            } 
            // Check uppercase fields
            else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
                lat = parseFloat(deal.Latitude);
                lng = parseFloat(deal.Longitude);
            }
            
            return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
                   lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        });
        
        if (dealsWithCoords.length > 0) {
            // Use the first deal's coordinates (or average if multiple)
            let lat = null;
            let lng = null;
            
            if (dealsWithCoords[0].latitude !== null && dealsWithCoords[0].latitude !== undefined) {
                lat = parseFloat(dealsWithCoords[0].latitude);
                lng = parseFloat(dealsWithCoords[0].longitude);
            } else {
                lat = parseFloat(dealsWithCoords[0].Latitude);
                lng = parseFloat(dealsWithCoords[0].Longitude);
            }
            
            if (!isNaN(lat) && !isNaN(lng)) {
                coords = [lat, lng];
            }
        }
        
        // Fall back to geocoding if no deal coordinates
        if (!coords) {
            coords = await geocodeLocation(location);
        }
        
        if (coords) {
            const count = locationDeals.length;
            const totalUnits = locationDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
            
            const marker = L.marker(coords).addTo(mapInstance);
            
            // Extract city name from location (e.g., "Baton Rouge, LA" -> "Baton Rouge")
            const cityMatch = location.match(/^([^,]+)/);
            const cityName = cityMatch ? cityMatch[1].trim() : location;
            
            // Check if any deals in this location have valid coordinates
            const dealsWithCoords = locationDeals.filter(deal => {
                let lat = null;
                let lng = null;
                
                if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
                    lat = parseFloat(deal.latitude);
                    lng = parseFloat(deal.longitude);
                } else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
                    lat = parseFloat(deal.Latitude);
                    lng = parseFloat(deal.Longitude);
                }
                
                return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
                       lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
            });
            
            // Always show "View Deals" button (even without coordinates, it will show deals in table)
            const hasValidCoords = dealsWithCoords.length > 0;
            
            // Create popup with button (always show button, even if no coordinates)
            const popupContent = `
                <div style="text-align: center; padding: 4px;">
                    <strong>${location}</strong><br>
                    ${count} deal${count !== 1 ? 's' : ''}<br>
                    ${totalUnits.toLocaleString()} units<br>
                        <button class="map-popup-btn" data-city="${cityName}" data-location="${location}" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-green); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                            View Deals
                        </button>
                    ${!hasValidCoords ? `
                        <div style="margin-top: 4px; padding: 4px; color: #666; font-size: 10px; font-style: italic;">
                            (No individual property locations available)
                        </div>
                    ` : ''}
                </div>
            `;
            
            marker.bindPopup(popupContent);
            
            // Store marker with deal data
            const markerData = {
                marker: marker,
                location: location,
                city: cityName,
                deals: locationDeals,
                coords: coords
            };
            mapMarkers.push(markerData);
            allMapMarkers.push(markerData); // Also store in all markers array
            
            return markerData;
        }
        
        return null;
    });
    
    const markerResults = await Promise.all(markerPromises);
    } else {
    // --- Individual markers: one per deal, color by stage, with legend ---
    function getDealCoords(deal) {
        let lat = null, lng = null;
        if (deal.latitude != null && deal.longitude != null) {
            lat = parseFloat(deal.latitude);
            lng = parseFloat(deal.longitude);
        } else if (deal.Latitude != null && deal.Longitude != null) {
            lat = parseFloat(deal.Latitude);
            lng = parseFloat(deal.Longitude);
        }
        if (lat != null && !isNaN(lat) && lng != null && !isNaN(lng) && lat !== 0 && lng !== 0) return [lat, lng];
        return null;
    }
    const locationToCoords = {};
    const locationsToGeocode = [...new Set(allDealsForMap.map(d => getDealLocation(d)).filter(Boolean))];
    locationsToGeocode.forEach(function(loc) {
        if (locationToCoords[loc]) return;
        var fromDeal = getDealCoords(allDealsForMap.find(function(d) { return getDealLocation(d) === loc; }));
        if (fromDeal) {
            locationToCoords[loc] = fromDeal;
            locationCoordsSessionCache[loc] = fromDeal;
        } else if (locationCoordsSessionCache[loc]) {
            locationToCoords[loc] = locationCoordsSessionCache[loc];
        }
    });
    await Promise.all(locationsToGeocode.map(async (loc) => {
        if (locationToCoords[loc]) return;
        const c = await geocodeLocation(loc);
        if (c) {
            locationToCoords[loc] = c;
            locationCoordsSessionCache[loc] = c;
        }
    }));
    const locationIndex = {};
    const stagesInMap = new Set();
    allDealsForMap.forEach(deal => {
        const loc = getDealLocation(deal);
        if (!loc) return;
        const coords = locationToCoords[loc];
        if (!coords) return;
        const idx = (locationIndex[loc] || 0);
        locationIndex[loc] = idx + 1;
        const offset = idx * 0.002;
        const latLng = [coords[0] + offset, coords[1]];
        const stage = normalizeStage(deal.Stage || deal.stage);
        const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
        const fillColor = stageConfig.color || '#8b5cf6';
        const strokeColor = stageConfig.borderColor != null ? stageConfig.borderColor : '#333';
        const strokeWeight = stageConfig.borderColor != null ? 2 : 1;
        stagesInMap.add(stage);
        const marker = L.circleMarker(latLng, {
            radius: 10,
            fillColor: fillColor,
            color: strokeColor,
            weight: strokeWeight,
            fillOpacity: 0.9
        }).addTo(mapInstance);
        const name = deal.Name || deal.name || 'Unnamed';
        const units = deal['Unit Count'] || deal.unitCount || '';
        const nameEsc = (name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const popupContent = `<div style="min-width: 160px; font-size: 13px;"><strong>${name}</strong><br/><span style="color: #666;">${stage}</span>${units ? '<br/>' + units + ' units' : ''}<br/><button type="button" class="map-popup-btn map-popup-view-deal-btn" data-deal-name="${nameEsc}">View deal</button></div>`;
        marker.bindPopup(popupContent);
        mapMarkers.push({ marker: marker, deal: deal, location: loc, deals: null, coords: latLng });
        allMapMarkers.push({ marker: marker, deal: deal, location: loc, deals: null, coords: latLng });
    });
    if (legendEl) {
        const stages = Array.from(stagesInMap).sort();
        legendEl.innerHTML = '<div class="map-legend-title">Stage</div>' + stages.map(stage => {
            const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
            const bg = cfg.color || '#8b5cf6';
            const borderStyle = cfg.borderColor != null ? `border: 2px solid ${cfg.borderColor};` : '';
            return `<div class="map-legend-item"><span class="map-legend-dot" style="background:${bg};${borderStyle}"></span>${stage}</div>`;
        }).join('');
    }
    }
    
    // Fit map to show all filtered markers (defer so Split view container has dimensions)
    function doFitAllDeals() {
        if (!mapInstance) return;
        if (mapInstance.invalidateSize) mapInstance.invalidateSize();
        if (mapMarkers.length > 0) {
            const group = new L.featureGroup(mapMarkers.map(m => m.marker));
            const bounds = group.getBounds();
            if (bounds && (typeof bounds.isValid !== 'function' || bounds.isValid())) {
                mapInstance.fitBounds(bounds.pad(0.15), { padding: [60, 60], maxZoom: 12 });
            }
        } else {
            mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
        }
    }
    setTimeout(doFitAllDeals, 100);
    
    // Add event listeners for map movement
    mapInstance.on('moveend', updateMapTable);
    mapInstance.on('zoomend', function() {
        updateMapTable();
        var container = document.getElementById('map-canvas-container');
        if (container && container.classList.contains('is-fullscreen') && mapMarkers.length) {
            mapInstance.invalidateSize();
            var c = mapInstance.getCenter();
            var z = mapInstance.getZoom();
            mapInstance.setView(c, z);
            mapMarkers.forEach(function(m) {
                if (m.marker && m.marker.getLatLng) {
                    var ll = m.marker.getLatLng();
                    if (ll) m.marker.setLatLng(ll);
                }
            });
        }
    });
    
    // Ensure table container exists and is visible
    const tableContainerCheck = document.getElementById('map-table-container');
    if (!tableContainerCheck) {
        _dpError('map-table-container not found in DOM');
    } else {
        // Make sure it's visible
        tableContainerCheck.style.display = 'block';
    }
    
    // Populate list view on initial load (otherwise it stays empty until user moves/zooms map)
    updateMapTable();
    
    // Add event listener for popup button clicks (city "View Deals" and single-deal "View deal")
    mapInstance.on('popupopen', function(e) {
        const popup = e.popup;
        const popupElement = popup.getElement();
        if (!popupElement) return;
        // Single-deal (color point) "View deal" button
        const viewDealBtn = popupElement.querySelector('.map-popup-view-deal-btn');
        if (viewDealBtn) {
            const newBtn = viewDealBtn.cloneNode(true);
            viewDealBtn.parentNode.replaceChild(newBtn, viewDealBtn);
            newBtn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                const dealName = (this.getAttribute('data-deal-name') || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(d => (d.Name || d.name) === dealName) ||
                    (visibleDealsForMap && visibleDealsForMap.find(d => (d.Name || d.name) === dealName));
                if (deal) {
                    showDealDetail(deal);
                    mapInstance.closePopup();
                }
            });
            return;
        }
        // City view "View Deals" button
        const viewDealsBtn = popupElement.querySelector('.map-popup-btn');
        if (viewDealsBtn) {
            const newBtn = viewDealsBtn.cloneNode(true);
            viewDealsBtn.parentNode.replaceChild(newBtn, viewDealsBtn);
            newBtn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                const cityName = this.dataset.city;
                const location = this.dataset.location;
                if (cityName && location) {
                    focusMapOnCityFromMarker(cityName, location);
                }
            });
        }
    });
    
    // Event delegation on the map container for popup buttons
    if (mapInstance.getContainer()) {
        mapInstance.getContainer().addEventListener('click', function(e) {
            const target = e.target;
            if (!target || !target.classList.contains('map-popup-btn')) return;
            e.preventDefault();
            e.stopPropagation();
            // Single-deal "View deal" (color point view)
            if (target.classList.contains('map-popup-view-deal-btn')) {
                const dealName = (target.getAttribute('data-deal-name') || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                const deal = (typeof allDeals !== 'undefined' ? allDeals : []).find(d => (d.Name || d.name) === dealName) ||
                    (visibleDealsForMap && visibleDealsForMap.find(d => (d.Name || d.name) === dealName));
                if (deal) {
                    showDealDetail(deal);
                    if (mapInstance) mapInstance.closePopup();
                }
                return;
            }
            // City "View Deals"
            const cityName = target.dataset.city;
            const location = target.dataset.location;
            if (cityName && location) {
                focusMapOnCityFromMarker(cityName, location);
            }
        });
    }
    
    // Add event listener for exit city view button
    setTimeout(() => {
        const exitBtn = document.getElementById('exit-city-view-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', exitCityView);
        }
        setupMapViewControls();
    }, 200);
    
    // Initial table update - show all filtered deals
    setTimeout(() => {
        // Get all deals from markers (these are already filtered)
        const allFilteredDeals = mapMarkers.reduce((acc, markerData) => {
            if (markerData.deals && Array.isArray(markerData.deals)) {
            acc.push(...markerData.deals);
            } else if (markerData.deal) {
                acc.push(markerData.deal);
            }
            return acc;
        }, []);
        
        // Initially show all filtered deals in the table (not just viewport-visible)
        visibleDealsForMap = allFilteredDeals;
        
        // Update table with all filtered deals initially
        const tableContainer = document.getElementById('map-table-container');
        if (tableContainer) {
            if (allFilteredDeals.length > 0) {
            tableContainer.innerHTML = renderMapTable(allFilteredDeals);
            setupDrillDownHandlers();
            } else {
                tableContainer.innerHTML = '<div class="empty-state"><div class="empty-state-text">No deals found</div></div>';
        }
        }
    }, 300);

    // Update badge to show location count now that markers are created
    if (typeof updateVisibleDealCount === 'function') updateVisibleDealCount();

    } finally {
        mapInitInProgress = false;
    }
}

// Build address string from contact for geocoding
function getContactAddress(contact) {
    const addr = (contact.OfficeAddress || contact.officeAddress || '').trim();
    const city = (contact.City || contact.city || '').trim();
    const state = (contact.State || contact.state || '').trim();
    if (addr && (city || state)) {
        return [addr, city, state].filter(Boolean).join(', ');
    }
    if (addr) return addr;
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    return '';
}

let contactsMapInitInProgress = false;

async function initContactsMap(contacts) {
    if (contactsMapInitInProgress) return;
    contactsMapInitInProgress = true;
    const mapDiv = document.getElementById('contacts-map');
    const panel = mapDiv ? mapDiv.closest('.contacts-map-panel') : null;
    function showMapUnavailable() {
        if (panel) {
            panel.querySelectorAll('.contacts-map-unavailable').forEach(el => el.remove());
            const el = document.createElement('div');
            el.className = 'contacts-map-unavailable';
            el.setAttribute('aria-live', 'polite');
            el.textContent = 'Map unavailable. Geocoding service may be blocked or offline.';
            panel.appendChild(el);
        }
    }
    try {
        if (panel) panel.querySelectorAll('.contacts-map-unavailable').forEach(el => el.remove());
        if (contactsMapInstance) {
            contactsMapInstance.remove();
            contactsMapInstance = null;
        }
        const mapDiv = document.getElementById('contacts-map');
        if (!mapDiv) { contactsMapInitInProgress = false; return; }

        const DEFAULT_CENTER = [39.5, -98.5];
        const DEFAULT_ZOOM = 4;
        const US_BOUNDS = L.latLngBounds([[24, -125], [49, -66]]);

        contactsMapInstance = L.map('contacts-map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            maxBounds: US_BOUNDS,
            maxBoundsViscosity: 1.0
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(contactsMapInstance);

        const list = Array.isArray(contacts) ? contacts : [];
        const withAddress = list.filter(c => getContactAddress(c));
        const seen = {};
        const uniqueByLocation = [];
        withAddress.forEach(c => {
            const addr = getContactAddress(c);
            if (!addr || seen[addr]) return;
            seen[addr] = true;
            uniqueByLocation.push(c);
        });

        const markers = [];
        for (const c of uniqueByLocation) {
            const city = (c.City || c.city || '').trim();
            const state = (c.State || c.state || '').trim();
            // Prefer City, State for pin placement to avoid wrong-city geocoding (e.g. street address resolving to Fayetteville instead of Charlotte)
            const addr = getContactAddress(c);
            const locForGeocode = (city && state) ? `${city}, ${state}` : addr;
            const coords = await geocodeLocation(locForGeocode);
            if (!coords) continue;
            const name = (c.Name || c.name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const type = (c.Type || c.type || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const cityEsc = (c.City || c.city || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const stateEsc = (c.State || c.state || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const locStr = [cityEsc, stateEsc].filter(Boolean).join(', ');
            const officeAddr = (c.OfficeAddress || c.officeAddress || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const id = getLandDevContactId(c);
            const popupHtml = `
                <div style="min-width: 160px;">
                    <strong>${name}</strong><br/>
                    ${type ? type + '<br/>' : ''}${locStr ? locStr + '<br/>' : ''}${officeAddr ? officeAddr + '<br/>' : ''}
                    <button type="button" class="map-popup-btn contacts-map-edit-btn" data-contact-id="${id}">Edit</button>
                </div>`;
            const marker = L.marker(coords).addTo(contactsMapInstance);
            marker.bindPopup(popupHtml);
            marker._contact = c;
            markers.push(marker);
        }

        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            contactsMapInstance.fitBounds(group.getBounds().pad(0.1));
        } else if (uniqueByLocation.length > 0 && window._geocodeNetworkWarned) {
            showMapUnavailable();
        } else if (list.length > 0) {
            if (panel) {
                panel.querySelectorAll('.contacts-map-empty-msg').forEach(el => el.remove());
                const emptyEl = document.createElement('div');
                emptyEl.className = 'contacts-map-empty-msg';
                emptyEl.textContent = 'No contacts with address data to display. Add City/State or Office Address to contacts.';
                emptyEl.setAttribute('aria-live', 'polite');
                panel.appendChild(emptyEl);
            }
        }

        if (contactsMapInstance.getContainer()) {
            contactsMapInstance.getContainer().addEventListener('click', function(e) {
                const target = e.target;
                if (!target || !target.classList.contains('contacts-map-edit-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                const id = parseInt(target.dataset.contactId, 10);
                const c = (window.landDevelopmentContacts || []).find(x => getLandDevContactId(x) === id);
                if (c) showContactModal(c);
                if (contactsMapInstance) contactsMapInstance.closePopup();
            });
        }
    } catch (err) {
        _dpWarn('Contacts map init failed:', err);
        showMapUnavailable();
    } finally {
        contactsMapInitInProgress = false;
    }
}

// Focus map on city from marker popup (uses marker data directly)
function focusMapOnCityFromMarker(cityName, location) {
    if (!mapInstance) return;
    
    // Find the marker data for this location
    const markerData = allMapMarkers.find(m => m.location === location || m.city === cityName);
    
    if (!markerData) {
        _dpWarn(`No marker found for city: ${cityName}`);
        return;
    }
    
    const cityDeals = markerData.deals;
    
    if (cityDeals.length === 0) {
        _dpWarn(`No deals found for city: ${cityName}`);
        return;
    }
    
    // First, check if any deals have valid coordinates
    const dealsWithValidCoords = cityDeals.filter(deal => {
        let lat = null;
        let lng = null;
        
        if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
            lat = parseFloat(deal.latitude);
            lng = parseFloat(deal.longitude);
        } else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
            lat = parseFloat(deal.Latitude);
            lng = parseFloat(deal.Longitude);
        }
        
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
               lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    });
    
    // If no deals have valid coordinates, still allow city view but just show deals in table
    // (This allows the feature to work even without Procore data locally)
    if (dealsWithValidCoords.length === 0) {
        _dpWarn(`No deals with valid coordinates found for city: ${cityName}, showing deals in table only`);
        // Still proceed to show deals in table, just won't show individual property markers
    }
    
    // Hide all other city markers
    allMapMarkers.forEach(m => {
        if (m.location !== location && m.city !== cityName) {
            mapInstance.removeLayer(m.marker);
        }
    });
    
    // Remove the city marker itself (we'll show individual property markers instead)
    mapInstance.removeLayer(markerData.marker);
    
    // Create individual markers for each property/deal in this city (only those with valid coordinates)
    const propertyMarkers = [];
    const coordinates = [];
    
    // Check if we have any deals with valid coordinates
    const hasValidCoords = dealsWithValidCoords.length > 0;
    
    // Process deals with valid coordinates (if any)
    if (hasValidCoords) {
    dealsWithValidCoords.forEach(deal => {
        // Try to get coordinates from deal object using lowercase latitude/longitude (as user specified)
        let lat = null;
        let lng = null;
        
        // Check lowercase first (as user specified)
        if (deal.latitude !== null && deal.latitude !== undefined && deal.longitude !== null && deal.longitude !== undefined) {
            lat = parseFloat(deal.latitude);
            lng = parseFloat(deal.longitude);
        } 
        // Fall back to capitalized (for backward compatibility)
        else if (deal.Latitude !== null && deal.Latitude !== undefined && deal.Longitude !== null && deal.Longitude !== undefined) {
            lat = parseFloat(deal.Latitude);
            lng = parseFloat(deal.Longitude);
        }
        
        // Validate coordinates are valid numbers and within valid ranges
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && 
            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            coordinates.push([lat, lng]);
            
            try {
                // Create a marker for this property
                const propertyMarker = L.marker([lat, lng]).addTo(mapInstance);
                
                // Get deal name
                const dealName = deal.Name || deal.name || 'Unknown Property';
                const unitCount = deal['Unit Count'] || deal.unitCount || 0;
                const stage = deal.Stage || deal.stage || 'Unknown';
                
                // Create popup for this property with clickable button and coordinates
                const popupContent = `
                    <div style="text-align: center; padding: 4px;">
                        <strong>${dealName}</strong><br>
                        ${stage}<br>
                        ${unitCount} units<br>
                        <div style="margin-top: 4px; font-size: 11px; color: #666;">
                            Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}
                        </div>
                        <button class="map-property-popup-btn" data-deal-name="${dealName}" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-green); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                            View Details
                        </button>
                    </div>
                `;
                propertyMarker.bindPopup(popupContent);
                
                // Add click handler for the popup button
                propertyMarker.on('popupopen', function() {
                    const popupElement = propertyMarker.getPopup().getElement();
                    if (popupElement) {
                        const viewDetailsBtn = popupElement.querySelector('.map-property-popup-btn');
                        if (viewDetailsBtn) {
                            // Remove any existing listeners to prevent duplicates
                            const newBtn = viewDetailsBtn.cloneNode(true);
                            viewDetailsBtn.parentNode.replaceChild(newBtn, viewDetailsBtn);
                            
                            newBtn.addEventListener('click', function() {
                                const dealName = this.dataset.dealName;
                                // Find the deal object from deals with valid coordinates
                                const deal = dealsWithValidCoords.find(d => (d.Name || d.name) === dealName);
                                if (deal) {
                                    showDealDetail(deal);
                                    mapInstance.closePopup();
                                }
                            });
                        }
                    }
                });
                
                propertyMarkers.push({
                    marker: propertyMarker,
                    deal: deal,
                    coords: [lat, lng]
                });
            } catch (error) {
                console.warn(`Failed to create marker for deal "${deal.Name || deal.name}" with coordinates [${lat}, ${lng}]:`, error);
            }
        }
    });
    }
    
    // If no coordinates found, fall back to city marker coordinates
    if (coordinates.length === 0) {
        console.warn(`No coordinates found for individual properties in city: ${cityName}, using city center`);
        if (markerData.coords) {
            coordinates.push(markerData.coords);
        } else {
            const coords = geocodeLocation(location);
            if (coords) {
                coordinates.push(coords);
            }
        }
    }
    
    // Store property markers (replacing city marker) - even if empty, we still want to show deals in table
    mapMarkers = propertyMarkers;
    
    // Update table to show all deals for this city (even if no coordinates)
    visibleDealsForMap = cityDeals;
    const cityTableContainer = document.getElementById('map-table-container');
    if (cityTableContainer) {
        cityTableContainer.innerHTML = renderMapTable(cityDeals);
        setupDrillDownHandlers();
    }
    
    // Show exit city view button
    const cityExitBtn = document.getElementById('exit-city-view-btn');
    const cityControlsContainer = document.getElementById('map-controls-container');
    if (cityExitBtn) cityExitBtn.style.display = 'block';
    if (cityControlsContainer) cityControlsContainer.style.display = 'block';
    
    // Set city view flag
    isCityView = true;
    currentCityView = { cityName, location, deals: cityDeals };
    var mapCanvasContainer = document.getElementById('map-canvas-container');
    if (mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
        var fsExitCityBtn = document.getElementById('map-fullscreen-exit-city-btn');
        if (fsExitCityBtn) fsExitCityBtn.style.display = '';
    }
    
    // If we have coordinates, fit map to show properties
    if (coordinates.length > 0) {
    // Create bounds from all property coordinates
    const bounds = L.latLngBounds(coordinates);
    
    // Fit map to show all properties in that city with padding
    mapInstance.fitBounds(bounds, { padding: [50, 50] });
    } else {
        // If no coordinates, try to use city marker coordinates or geocode
        if (markerData.coords) {
            mapInstance.setView(markerData.coords, 12); // Zoom to city level
        } else {
            // Try to geocode the location
            geocodeLocation(location).then(coords => {
                if (coords && Array.isArray(coords) && coords.length === 2) {
                    mapInstance.setView(coords, 12);
                }
            }).catch(err => {
                console.warn('Geocoding failed:', err);
            });
        }
    }
    
    // Update the table to show all deals for this city (not just those with coordinates)
    // This ensures the table works even without Procore data locally
    visibleDealsForMap = cityDeals;
    
    // Update table directly to show all city deals
    if (cityTableContainer) {
        cityTableContainer.innerHTML = renderMapTable(cityDeals);
        setupDrillDownHandlers();
    }
    
    // Also update after map finishes zooming
    mapInstance.once('zoomend', function() {
        const zoomTableContainer = document.getElementById('map-table-container');
        if (zoomTableContainer) {
            zoomTableContainer.innerHTML = renderMapTable(cityDeals);
            setupDrillDownHandlers();
        }
    });
    
    // Close the popup
    mapInstance.closePopup();
}

// Exit city view and restore full map
function exitCityView() {
    if (!mapInstance || !isCityView) return;
    
    // Remove all property markers (if we're in city view, these are individual property markers)
    mapMarkers.forEach(m => {
        if (m.marker && m.deal) {
            // This is a property marker, remove it
            mapInstance.removeLayer(m.marker);
        }
    });
    
    // Restore all city markers (so map is not left blank when city had no lat/long)
    allMapMarkers.forEach(m => {
        if (m && m.marker) mapInstance.addLayer(m.marker);
    });
    
    // Restore mapMarkers to all city markers (all locations, not just current city)
    mapMarkers = [...allMapMarkers];
    
    // Fit map to show ALL markers - defer slightly so restored layers are rendered first
    var defaultCenter = [39.5, -98.5];
    var defaultZoom = 4;
    var markersToFit = allMapMarkers;
    setTimeout(function() {
        if (!mapInstance) return;
        if (mapInstance.invalidateSize) mapInstance.invalidateSize();
        if (markersToFit.length > 0) {
            try {
                var group = new L.featureGroup(markersToFit.map(function(m) { return m.marker; }).filter(Boolean));
                if (group.getLayers().length > 0) {
                    var bounds = group.getBounds();
                    var valid = bounds && (typeof bounds.isValid !== 'function' || bounds.isValid());
                    if (valid) {
                        mapInstance.fitBounds(bounds.pad(0.15), { padding: [60, 60], maxZoom: 12 });
                        return;
                    }
                }
            } catch (err) {}
            var first = markersToFit[0];
            var center = first && (first.coords || (first.marker && first.marker.getLatLng && first.marker.getLatLng()));
            if (center) {
                var c = Array.isArray(center) ? center : [center.lat, center.lng];
                mapInstance.setView(c, 6);
            } else {
                mapInstance.setView(defaultCenter, defaultZoom);
            }
        } else {
            mapInstance.setView(defaultCenter, defaultZoom);
        }
    }, 50);
    
    // Update table to show all filtered deals
    const allFilteredDeals = mapMarkers.reduce((acc, markerData) => {
        acc.push(...markerData.deals);
        return acc;
    }, []);
    visibleDealsForMap = allFilteredDeals;
    updateMapTable();
    
    // Reset city view state
    isCityView = false;
    currentCityView = null;
    
    // Hide exit city view button
    const controlsContainer = document.getElementById('map-controls-container');
    const exitBtn = document.getElementById('exit-city-view-btn');
    if (controlsContainer && exitBtn) {
        exitBtn.style.display = 'none';
        if (mapMarkers.length === 0) {
            controlsContainer.style.display = 'none';
        }
    }
    var fsExitCityBtn = document.getElementById('map-fullscreen-exit-city-btn');
    if (fsExitCityBtn) fsExitCityBtn.style.display = 'none';
}

// Bind location search, Fit All, and Map/List toggle for map view
function setupMapViewControls() {
    const panel = document.getElementById('map-view-panel');
    const searchInput = document.getElementById('map-location-search');
    const searchBtn = document.getElementById('map-location-search-btn');
    const fitAllBtn = document.getElementById('map-fit-all-btn');
    const mapViewBtn = document.getElementById('map-view-map-btn');
    const splitViewBtn = document.getElementById('map-view-split-btn');
    const listViewBtn = document.getElementById('map-view-list-btn');
    const mapCanvas = document.getElementById('location-map');
    const tableContainer = document.getElementById('map-table-container');

    // Map / Split / List view toggle
    function setMapPanelView(mode) {
        if (!panel || !mapCanvas || !tableContainer) return;
        panel.classList.remove('view-map', 'view-list', 'view-split');
        if (mode === 'list') {
            panel.classList.add('view-list');
            mapCanvas.setAttribute('aria-hidden', 'true');
            tableContainer.setAttribute('aria-hidden', 'false');
            if (mapViewBtn) { mapViewBtn.classList.remove('active'); mapViewBtn.setAttribute('aria-pressed', 'false'); }
            if (splitViewBtn) { splitViewBtn.classList.remove('active'); splitViewBtn.setAttribute('aria-pressed', 'false'); }
            if (listViewBtn) { listViewBtn.classList.add('active'); listViewBtn.setAttribute('aria-pressed', 'true'); }
            updateMapTable();
            setupDrillDownHandlers();
            requestAnimationFrame(function() { if (tableContainer) tableContainer.scrollTop = 0; });
        } else if (mode === 'split') {
            panel.classList.add('view-split');
            mapCanvas.setAttribute('aria-hidden', 'false');
            tableContainer.setAttribute('aria-hidden', 'false');
            if (mapViewBtn) { mapViewBtn.classList.remove('active'); mapViewBtn.setAttribute('aria-pressed', 'false'); }
            if (splitViewBtn) { splitViewBtn.classList.add('active'); splitViewBtn.setAttribute('aria-pressed', 'true'); }
            if (listViewBtn) { listViewBtn.classList.remove('active'); listViewBtn.setAttribute('aria-pressed', 'false'); }
            updateMapTable();
            setupDrillDownHandlers();
            if (mapInstance) setTimeout(function() { mapInstance.invalidateSize(); }, 100);
        } else {
            panel.classList.add('view-map');
            mapCanvas.setAttribute('aria-hidden', 'false');
            tableContainer.setAttribute('aria-hidden', 'true');
            if (mapViewBtn) { mapViewBtn.classList.add('active'); mapViewBtn.setAttribute('aria-pressed', 'true'); }
            if (splitViewBtn) { splitViewBtn.classList.remove('active'); splitViewBtn.setAttribute('aria-pressed', 'false'); }
            if (listViewBtn) { listViewBtn.classList.remove('active'); listViewBtn.setAttribute('aria-pressed', 'false'); }
            if (mapInstance) setTimeout(function() { mapInstance.invalidateSize(); }, 100);
        }
    }

    if (mapViewBtn) mapViewBtn.addEventListener('click', function() { setMapPanelView('map'); });
    if (splitViewBtn) splitViewBtn.addEventListener('click', function() { setMapPanelView('split'); });
    if (listViewBtn) listViewBtn.addEventListener('click', function() { setMapPanelView('list'); });

    // Mobile/small screens: show Map or List only (no Split) for easier use
    function isMapSmallScreen() {
        return (typeof window !== 'undefined' && (window.innerWidth <= 900 || window.innerHeight <= 760));
    }
    function updateMapSmallScreenLayout() {
        if (!panel || !splitViewBtn) return;
        var small = isMapSmallScreen();
        splitViewBtn.style.display = small ? 'none' : '';
        if (small && panel.classList.contains('view-split')) {
            setMapPanelView('map');
        }
    }
    updateMapSmallScreenLayout();
    window.addEventListener('resize', function onMapResize() {
        if (!document.getElementById('map-view-panel')) {
            window.removeEventListener('resize', onMapResize);
            return;
        }
        updateMapSmallScreenLayout();
    });

    // Full screen map – set up first so it works even if mapInstance isn't ready yet
    const mapCanvasContainer = document.getElementById('map-canvas-container');
    const fullscreenBtn = document.getElementById('map-fullscreen-btn');
    const fullscreenExitBtn = document.getElementById('map-fullscreen-exit-btn');

    function enterMapFullscreen() {
        if (!mapCanvasContainer || !panel || panel.classList.contains('view-list')) return;
        mapCanvasContainer.classList.add('is-fullscreen');
        if (fullscreenExitBtn) fullscreenExitBtn.style.display = 'block';
        if (fullscreenBtn) fullscreenBtn.textContent = 'Exit full screen';
        document.body.classList.add('map-fullscreen-active');
        var ov = document.getElementById('map-fullscreen-overlay');
        if (ov) { ov.classList.add('visible'); ov.setAttribute('aria-hidden', 'false'); }
        var legendEl = document.getElementById('map-legend');
        var legendSlot = document.getElementById('map-fullscreen-legend-slot');
        if (legendEl && legendSlot && legendEl.parentNode !== legendSlot) {
            legendSlot.appendChild(legendEl);
        }
        // Try native Fullscreen API for truly immersive experience (hides browser chrome)
        try {
            var fsEl = document.documentElement;
            if (fsEl.requestFullscreen) fsEl.requestFullscreen().catch(function(){});
            else if (fsEl.webkitRequestFullscreen) fsEl.webkitRequestFullscreen();
        } catch (e) { /* Domo iframe may block this — CSS fallback still works */ }
        // Invalidate map size at multiple intervals for smooth resize
        if (mapInstance) {
            setTimeout(function() { mapInstance.invalidateSize(); }, 100);
            setTimeout(function() { mapInstance.invalidateSize(); }, 300);
            setTimeout(function() { mapInstance.invalidateSize(); }, 600);
        }
        window.addEventListener('keydown', onFullscreenKeydown);
        // Update badge to show deal count (fullscreen shows individual deals)
        if (typeof updateVisibleDealCount === 'function') updateVisibleDealCount();
    }

    function exitMapFullscreen() {
        if (!mapCanvasContainer) return;
        var ov = document.getElementById('map-fullscreen-overlay');
        if (ov) { ov.classList.remove('visible'); ov.setAttribute('aria-hidden', 'true'); }
        var legendEl = document.getElementById('map-legend');
        if (legendEl && legendEl.parentNode && legendEl.parentNode.id === 'map-fullscreen-legend-slot') {
            mapCanvasContainer.appendChild(legendEl);
        }
        mapCanvasContainer.classList.remove('is-fullscreen');
        if (fullscreenExitBtn) fullscreenExitBtn.style.display = 'none';
        if (fullscreenBtn) fullscreenBtn.textContent = 'Full screen';
        document.body.classList.remove('map-fullscreen-active');
        // Exit native fullscreen if active
        try {
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
        } catch (e) { /* ignore */ }
        if (mapInstance) {
            setTimeout(function() { mapInstance.invalidateSize(); }, 100);
            setTimeout(function() { mapInstance.invalidateSize(); }, 300);
        }
        window.removeEventListener('keydown', onFullscreenKeydown);
        // Update badge back to location count (city view)
        if (typeof updateVisibleDealCount === 'function') updateVisibleDealCount();
    }

    function onFullscreenKeydown(e) {
        if (e.key === 'Escape' && mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            exitMapFullscreen();
        }
    }

    // Sync CSS fullscreen state when native fullscreen exits (e.g. user presses Escape in browser fullscreen)
    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement && mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            exitMapFullscreen();
        }
    });
    document.addEventListener('webkitfullscreenchange', function() {
        if (!document.webkitFullscreenElement && mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            exitMapFullscreen();
        }
    });

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
                exitMapFullscreen();
            } else {
                enterMapFullscreen();
            }
        });
    }
    if (fullscreenExitBtn) {
        fullscreenExitBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exitMapFullscreen();
        });
    }

    if (!mapInstance) return;

    async function goToLocation() {
        const q = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
        if (!q) return;
        try {
            const coords = await geocodeLocation(q);
            if (coords && mapInstance) {
                mapInstance.setView(coords, 10);
            }
        } catch (_) {}
    }

    if (searchBtn) searchBtn.addEventListener('click', goToLocation);
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); goToLocation(); }
        });
    }

    if (fitAllBtn) {
        fitAllBtn.addEventListener('click', function() {
            if (!mapInstance) return;
            if (isCityView) {
                exitCityView();
                return;
            }
            if (mapMarkers.length === 0) return;
            if (mapInstance.invalidateSize) mapInstance.invalidateSize();
            const group = new L.featureGroup(mapMarkers.map(m => m.marker));
            const bounds = group.getBounds();
            if (bounds && (typeof bounds.isValid !== 'function' || bounds.isValid())) {
                mapInstance.fitBounds(bounds.pad(0.15), { padding: [60, 60], maxZoom: 12 });
            }
        });
    }
}

// Focus map on deals in a specific city
function focusMapOnCity(cityName) {
    if (!mapInstance) return;
    
    // Find all deals in that city
    const cityDeals = allDeals.filter(deal => {
        const location = getDealLocation(deal);
        if (!location) return false;
        
        // Extract city from location string
        const cityMatch = location.match(/^([^,]+)/);
        const city = cityMatch ? cityMatch[1].trim().toLowerCase() : location.toLowerCase();
        
        return city === cityName.toLowerCase();
    });
    
    if (cityDeals.length === 0) {
        _dpWarn(`No deals found for city: ${cityName}`);
        return;
    }
    
    // Collect coordinates from Procore data
    const coordinates = [];
    cityDeals.forEach(deal => {
        // First try to get coordinates from deal object (stored from Procore)
        if (deal.Latitude && deal.Longitude) {
            const lat = parseFloat(deal.Latitude);
            const lng = parseFloat(deal.Longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                coordinates.push([lat, lng]);
            }
        } else {
            // Fall back to geocoding the location
            const location = getDealLocation(deal);
            if (location) {
                const coords = geocodeLocation(location);
                if (coords) {
                    coordinates.push(coords);
                }
            }
        }
    });
    
    if (coordinates.length === 0) {
        console.warn(`No coordinates found for deals in city: ${cityName}`);
        // Try to geocode the city name directly
        const cityLocation = `${cityName}, US`;
        const coords = geocodeLocation(cityLocation);
        if (coords) {
            mapInstance.setView(coords, 12);
        }
        return;
    }
    
    // Create bounds from all coordinates
    const bounds = L.latLngBounds(coordinates);
    
    // Fit map to show all deals in that city with some padding
    mapInstance.fitBounds(bounds, { padding: [50, 50] });
    
    // Update the table to show only deals with valid coordinates in that city
    visibleDealsForMap = dealsWithValidCoords;
    updateMapTable();
}

