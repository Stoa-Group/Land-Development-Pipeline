/**
 * app-bank-contacts.js — Bank view, product type view, deal files view, contacts view
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

async function renderByBank(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    
    // Fetch banks from bank database
    let banksData = [];
    try {
        const banksResponse = await API.getAllBanks();
        if (banksResponse.success) {
            banksData = banksResponse.data || [];
        }
    } catch (error) {
        console.warn('Failed to load banks from database:', error);
    }
    
    // Build bank name mapping first
    buildBankNameMap(filtered);
    
    const grouped = {};
    
    filtered.forEach(deal => {
        const bank = deal.Bank || deal.bank || 'Unknown';
        // Use canonical bank name for grouping
        const canonicalBank = getCanonicalBankName(bank);
        if (!grouped[canonicalBank]) {
            grouped[canonicalBank] = [];
        }
        grouped[canonicalBank].push(deal);
    });
    
    // Match deals to bank database records
    const banks = Object.keys(grouped).filter(b => b !== 'Unknown').sort();
    if (grouped['Unknown']) banks.push('Unknown');
    
    // Get current sort for bank view
    const bankSortConfig = window.bankSort || { by: 'name', order: 'asc' };
    
    // Sort deals within each bank group
    banks.forEach(bankName => {
        grouped[bankName].sort((a, b) => sortDeal(a, b, bankSortConfig));
    });
    
    return `
        ${renderActiveFilters()}
        ${banks.map(bankName => {
        const bankDeals = grouped[bankName];
        const totalUnits = bankDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        // Find matching bank in database
        const bankRecord = banksData.find(b => {
            const bankNameLower = bankName.toLowerCase();
            const recordNameLower = (b.BankName || '').toLowerCase();
            return recordNameLower === bankNameLower || 
                   recordNameLower.includes(bankNameLower) || 
                   bankNameLower.includes(recordNameLower);
        });
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span class="bank-name-clickable" data-bank-name="${escapeHtml(bankName)}" data-bank-id="${bankRecord?.BankId || ''}" style="cursor: pointer; text-decoration: underline; color: var(--primary-green);">
                        <span class="bank-icon">Bank:</span> ${escapeHtml(bankName)}
                    </span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${bankDeals.length} deals | ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table bank-table">
                            <thead>
                                <tr>
                                    <th class="sortable-header ${bankSortConfig.by === 'name' ? 'sorted' : ''}" data-sort-by="name" data-sort-order="${bankSortConfig.by === 'name' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Name ${bankSortConfig.by === 'name' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${bankSortConfig.by === 'stage' ? 'sorted' : ''}" data-sort-by="stage" data-sort-order="${bankSortConfig.by === 'stage' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Stage ${bankSortConfig.by === 'stage' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${bankSortConfig.by === 'units' ? 'sorted' : ''}" data-sort-by="units" data-sort-order="${bankSortConfig.by === 'units' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Unit Count ${bankSortConfig.by === 'units' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${bankSortConfig.by === 'date' ? 'sorted' : ''}" data-sort-by="date" data-sort-order="${bankSortConfig.by === 'date' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Start Date ${bankSortConfig.by === 'date' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${bankSortConfig.by === 'product' ? 'sorted' : ''}" data-sort-by="product" data-sort-order="${bankSortConfig.by === 'product' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Product Type ${bankSortConfig.by === 'product' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${bankSortConfig.by === 'location' ? 'sorted' : ''}" data-sort-by="location" data-sort-order="${bankSortConfig.by === 'location' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Location ${bankSortConfig.by === 'location' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-yoc ${bankSortConfig.by === 'yoc' ? 'sorted' : ''}" data-sort-by="yoc" data-sort-order="${bankSortConfig.by === 'yoc' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;" title="Yield on Cost">
                                        YoC ${bankSortConfig.by === 'yoc' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-date-added ${bankSortConfig.by === 'dateAdded' ? 'sorted' : ''}" data-sort-by="dateAdded" data-sort-order="${bankSortConfig.by === 'dateAdded' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Added ${bankSortConfig.by === 'dateAdded' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-updated ${bankSortConfig.by === 'updated' ? 'sorted' : ''}" data-sort-by="updated" data-sort-order="${bankSortConfig.by === 'updated' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Updated ${bankSortConfig.by === 'updated' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-notes ${bankSortConfig.by === 'notes' ? 'sorted' : ''}" data-sort-by="notes" data-sort-order="${bankSortConfig.by === 'notes' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Notes ${bankSortConfig.by === 'notes' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bankDeals.map(deal => {
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row" data-deal-name="${escapeHtml(deal.Name || deal.name)}">
                                            <td class="deal-name" data-label="Name">
                                                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                                                ${escapeHtml(deal.Name || deal.name || 'Unnamed Deal')}
                                            </td>
                                            <td class="deal-cell" data-label="Stage">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                            </td>
                                            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
                                            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">
                                                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}
                                            </td>
                                            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
                                            <td class="deal-cell" data-label="Location">
                                                ${(() => {
                                                    const location = getDealLocation(deal);
                                                    return location ? 
                                                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                                                        '-';
                                                })()}
                                            </td>
                                            <td class="deal-cell yoc-cell" data-label="Yield on Cost">${(() => {
                                                const yoc = deal._yieldOnCost;
                                                if (yoc != null && !isNaN(yoc)) return `<span class="yoc-value">${yoc.toFixed(1)}%</span>`;
                                                return '<span class="yoc-na">N/A</span>';
                                            })()}</td>
                                            <td class="deal-cell date-display date-added-cell" data-label="Date Added">${(() => {
                                                const ca = deal.CreatedAt;
                                                if (!ca) return '-';
                                                const d = new Date(ca);
                                                if (isNaN(d.getTime())) return '-';
                                                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
                                            })()}</td>
                                            <td class="deal-cell date-display updated-cell" data-label="Last Updated">${(() => {
                                                const ua = deal.UpdatedAt || deal.CreatedAt;
                                                if (!ua) return '-';
                                                const d = new Date(ua);
                                                if (isNaN(d.getTime())) return '-';
                                                const now = new Date();
                                                const diffMs = now - d;
                                                const diffDays = Math.floor(diffMs / 86400000);
                                                if (diffDays === 0) return 'Today';
                                                if (diffDays === 1) return 'Yesterday';
                                                if (diffDays < 30) return `${diffDays}d ago`;
                                                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
                                            })()}</td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell actions-cell" data-label="Actions">
                                                <button type="button" class="deal-files-view-btn" data-deal-name="${((deal.Name || deal.name) || '').replace(/"/g, '&quot;')}" title="Open deal and view/download/upload files" onclick="event.stopPropagation();">View deal & files</button>
                                                ${isAuthenticated && isEditMode ? `<button class="deal-edit-btn-small" onclick="event.stopPropagation(); window.openDealEditModal(window.allDeals.find(d => (d.Name || d.name) === '${(deal.Name || deal.name || '').replace(/'/g, "\\'")}'))">Edit</button>` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
    `;
}

// Render by Product Type
function renderByProductType(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    const grouped = {};
    
    filtered.forEach(deal => {
        const productType = deal['Product Type'] || deal.productType || 'Other';
        if (!grouped[productType]) {
            grouped[productType] = [];
        }
        grouped[productType].push(deal);
    });
    
    // Sort product types: Prototype first, then Heights/Flats, then others alphabetically
    const productTypes = Object.keys(grouped).sort((a, b) => {
        const order = ['Prototype', 'Heights/Flats'];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        
        // If both are in the order array, sort by their position
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }
        // If only a is in the order array, it comes first
        if (aIndex !== -1) return -1;
        // If only b is in the order array, it comes first
        if (bIndex !== -1) return 1;
        // If neither is in the order array, sort alphabetically
        return a.localeCompare(b);
    });
    
    // Get current sort for product type view (use a separate sort config for product type)
    const productTypeSort = window.productTypeSort || { by: 'name', order: 'asc' };
    
    // Sort deals within each product type group
    productTypes.forEach(productType => {
        grouped[productType].sort((a, b) => sortDeal(a, b, productTypeSort));
    });
    
    return `
        ${renderActiveFilters()}
        ${productTypes.map(productType => {
        const typeDeals = grouped[productType];
        const totalUnits = typeDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
        
        return `
            <div class="stage-group">
                <div class="stage-group-header">
                    <span><span class="product-icon">Product:</span> ${productType}</span>
                    <span style="margin-left: auto; opacity: 0.7;">
                        ${typeDeals.length} deals | ${totalUnits.toLocaleString()} units
                    </span>
                </div>
                <div class="stage-group-content">
                    <div class="stage-group-table-wrapper">
                        <table class="deal-list-table product-type-table">
                            <thead>
                                <tr>
                                    <th class="sortable-header ${productTypeSort.by === 'name' ? 'sorted' : ''}" data-sort-by="name" data-sort-order="${productTypeSort.by === 'name' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Name ${productTypeSort.by === 'name' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${productTypeSort.by === 'stage' ? 'sorted' : ''}" data-sort-by="stage" data-sort-order="${productTypeSort.by === 'stage' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Stage ${productTypeSort.by === 'stage' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${productTypeSort.by === 'units' ? 'sorted' : ''}" data-sort-by="units" data-sort-order="${productTypeSort.by === 'units' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Unit Count ${productTypeSort.by === 'units' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${productTypeSort.by === 'date' ? 'sorted' : ''}" data-sort-by="date" data-sort-order="${productTypeSort.by === 'date' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Start Date ${productTypeSort.by === 'date' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${productTypeSort.by === 'bank' ? 'sorted' : ''}" data-sort-by="bank" data-sort-order="${productTypeSort.by === 'bank' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Bank ${productTypeSort.by === 'bank' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header ${productTypeSort.by === 'location' ? 'sorted' : ''}" data-sort-by="location" data-sort-order="${productTypeSort.by === 'location' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Location ${productTypeSort.by === 'location' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-yoc ${productTypeSort.by === 'yoc' ? 'sorted' : ''}" data-sort-by="yoc" data-sort-order="${productTypeSort.by === 'yoc' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;" title="Yield on Cost">
                                        YoC ${productTypeSort.by === 'yoc' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-date-added ${productTypeSort.by === 'dateAdded' ? 'sorted' : ''}" data-sort-by="dateAdded" data-sort-order="${productTypeSort.by === 'dateAdded' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Added ${productTypeSort.by === 'dateAdded' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-updated ${productTypeSort.by === 'updated' ? 'sorted' : ''}" data-sort-by="updated" data-sort-order="${productTypeSort.by === 'updated' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Updated ${productTypeSort.by === 'updated' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th class="sortable-header col-notes ${productTypeSort.by === 'notes' ? 'sorted' : ''}" data-sort-by="notes" data-sort-order="${productTypeSort.by === 'notes' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Notes ${productTypeSort.by === 'notes' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${typeDeals.map(deal => {
                                    const dealName = deal.Name || deal.name || 'Unnamed Deal';
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row" data-deal-name="${dealName}">
                                            <td class="deal-name" data-label="Name">
                                                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                                                ${deal.Name || deal.name || 'Unnamed Deal'}
                                            </td>
                                            <td class="deal-cell" data-label="Stage">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                            </td>
                                            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
                                            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date">
                                                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}
                                            </td>
                                            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
                                            <td class="deal-cell" data-label="Location">
                                                ${(() => {
                                                    const location = getDealLocation(deal);
                                                    return location ? 
                                                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                                                        '-';
                                                })()}
                                            </td>
                                            <td class="deal-cell yoc-cell" data-label="Yield on Cost">${(() => {
                                                const yoc = deal._yieldOnCost;
                                                if (yoc != null && !isNaN(yoc)) return `<span class="yoc-value">${yoc.toFixed(1)}%</span>`;
                                                return '<span class="yoc-na">N/A</span>';
                                            })()}</td>
                                            <td class="deal-cell date-display date-added-cell" data-label="Date Added">${(() => {
                                                const ca = deal.CreatedAt;
                                                if (!ca) return '-';
                                                const d = new Date(ca);
                                                if (isNaN(d.getTime())) return '-';
                                                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
                                            })()}</td>
                                            <td class="deal-cell date-display updated-cell" data-label="Last Updated">${(() => {
                                                const ua = deal.UpdatedAt || deal.CreatedAt;
                                                if (!ua) return '-';
                                                const d = new Date(ua);
                                                if (isNaN(d.getTime())) return '-';
                                                const now = new Date();
                                                const diffMs = now - d;
                                                const diffDays = Math.floor(diffMs / 86400000);
                                                if (diffDays === 0) return 'Today';
                                                if (diffDays === 1) return 'Yesterday';
                                                if (diffDays < 30) return `${diffDays}d ago`;
                                                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
                                            })()}</td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell actions-cell" data-label="Actions">
                                                <button type="button" class="deal-files-view-btn" data-deal-name="${(dealName || '').replace(/"/g, '&quot;')}" title="Open deal and view/download/upload files" onclick="event.stopPropagation();">View deal & files</button>
                                                ${isAuthenticated && isEditMode ? `<button class="deal-edit-btn-small" data-deal-id="${deal.DealPipelineId || ''}" onclick="event.stopPropagation(); (function() { const d = window.allDeals.find(x => (x.Name || x.name) === '${(dealName || '').replace(/'/g, "\\'")}'); if (d) window.openDealEditModal(d); })();">Edit</button>` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('')}
    `;
}

// Render Deal Files view – list of deals with link to view files (opens deal popup) [kept for reference, merged into List]
function renderDealFilesView(deals) {
    const filtered = applyFilters(deals, true); // Exclude START
    const sortConfig = window.dealFilesTableSort || { by: 'name', order: 'asc' };
    const stageOrder = [...STAGE_DISPLAY_ORDER];
    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortConfig.by === 'name') {
            const na = (a.Name || a.name || '').toLowerCase();
            const nb = (b.Name || b.name || '').toLowerCase();
            cmp = na.localeCompare(nb);
        } else if (sortConfig.by === 'stage') {
            const sa = normalizeStage(a.Stage || a.stage || '');
            const sb = normalizeStage(b.Stage || b.stage || '');
            const idxA = stageOrder.indexOf(sa);
            const idxB = stageOrder.indexOf(sb);
            cmp = (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        } else if (sortConfig.by === 'location') {
            const la = (getDealLocation(a) || '').toLowerCase();
            const lb = (getDealLocation(b) || '').toLowerCase();
            cmp = la.localeCompare(lb);
        }
        return sortConfig.order === 'desc' ? -cmp : cmp;
    });
    return `
        ${renderActiveFilters()}
        <div class="deal-files-view">
            <h2 class="deal-files-title">Deal Files</h2>
            <p class="deal-files-desc">Click "View deal & files" to open a deal and see its attached files. Everyone can view and download; only admins can upload, rename, or delete. To show a deal on the map: enter Latitude and Longitude in the deal form, or upload a .kmz file in the Land section.</p>
            <div class="deal-files-table-wrapper">
                <table class="deal-list-table deal-files-table">
                    <thead>
                        <tr>
                            <th class="sortable-header ${sortConfig.by === 'name' ? 'sorted' : ''}" data-sort-by="name" data-sort-order="${sortConfig.by === 'name' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Deal ${sortConfig.by === 'name' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="sortable-header ${sortConfig.by === 'stage' ? 'sorted' : ''}" data-sort-by="stage" data-sort-order="${sortConfig.by === 'stage' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Stage ${sortConfig.by === 'stage' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th class="sortable-header ${sortConfig.by === 'location' ? 'sorted' : ''}" data-sort-by="location" data-sort-order="${sortConfig.by === 'location' ? (sortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">Location ${sortConfig.by === 'location' ? (sortConfig.order === 'asc' ? '↑' : '↓') : ''}</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(deal => {
                            const name = deal.Name || deal.name || 'Unnamed Deal';
                            const stage = normalizeStage(deal.Stage || deal.stage || 'Prospective');
                            const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                            const location = getDealLocation(deal);
                            const safeName = (name || '').replace(/"/g, '&quot;');
                            return `<tr class="deal-row deal-files-row" data-deal-name="${safeName}">
                                <td class="deal-name" data-label="Deal">${(name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                                <td class="deal-cell" data-label="Stage"><span class="stage-badge ${stageConfig.class}">${stage}</span></td>
                                <td class="deal-cell" data-label="Location">${location || '—'}</td>
                                <td class="deal-cell" data-label="Actions">
                                    <button type="button" class="deal-files-view-btn" data-deal-name="${safeName}" title="Open deal and view/download/upload files">View deal & files</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ${sorted.length === 0 ? '<p class="no-data">No deals match the current filters.</p>' : ''}
        </div>
    `;
}

// Land Development Contacts – linked to core.contacts; list shows individuals with optional land-dev attributes
function getLandDevContactId(c) {
    return c.ContactId != null ? c.ContactId : c.LandDevelopmentContactId;
}
function formatContactDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
    } catch (e) { return dateStr; }
}
function formatContactNextFollowUp(c) {
    const next = c.NextFollowUpDate || (c.DateOfContact && c.FollowUpTimeframeDays != null ? (() => {
        try {
            const d = new Date(c.DateOfContact);
            d.setDate(d.getDate() + parseInt(c.FollowUpTimeframeDays, 10));
            return d.toISOString().slice(0, 10);
        } catch (e) { return null; }
    })() : null);
    if (!next) return '—';
    try {
        const d = new Date(next);
        return isNaN(d.getTime()) ? next : d.toLocaleDateString();
    } catch (e) { return next; }
}
function isContactFollowUpUpcoming(c, withinDays = 14) {
    const next = c.NextFollowUpDate || (c.DateOfContact && c.FollowUpTimeframeDays != null ? (() => {
        try {
            const d = new Date(c.DateOfContact);
            d.setDate(d.getDate() + parseInt(c.FollowUpTimeframeDays, 10));
            return d;
        } catch (e) { return null; }
    })() : null);
    if (!next) return false;
    const n = next instanceof Date ? next : new Date(next);
    if (isNaN(n.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + withinDays);
    return n >= today && n <= end;
}

function renderContactsView(contacts) {
    const f = window.landDevelopmentContactFilters || {};
    const types = ['Land Owner', 'Developer', 'Broker'];
    const sortConfig = window.contactsSort || { by: 'name', order: 'asc' };
    const isMapMode = window.contactsViewMode === 'map';
    const sorted = [...(contacts || [])].sort((a, b) => {
        let cmp = 0;
        if (sortConfig.by === 'name') cmp = (a.Name || '').toLowerCase().localeCompare((b.Name || '').toLowerCase());
        else if (sortConfig.by === 'type') cmp = (a.Type || '').toLowerCase().localeCompare((b.Type || '').toLowerCase());
        else if (sortConfig.by === 'city') cmp = (a.City || '').toLowerCase().localeCompare((b.City || '').toLowerCase());
        else if (sortConfig.by === 'state') cmp = (a.State || '').toLowerCase().localeCompare((b.State || '').toLowerCase());
        else if (sortConfig.by === 'date') {
            const dA = a.DateOfContact ? new Date(a.DateOfContact).getTime() : 0;
            const dB = b.DateOfContact ? new Date(b.DateOfContact).getTime() : 0;
            cmp = dA - dB;
        } else if (sortConfig.by === 'followup') {
            const nextA = a.NextFollowUpDate ? new Date(a.NextFollowUpDate).getTime() : (a.DateOfContact && a.FollowUpTimeframeDays ? new Date(a.DateOfContact).getTime() + a.FollowUpTimeframeDays * 86400000 : 0);
            const nextB = b.NextFollowUpDate ? new Date(b.NextFollowUpDate).getTime() : (b.DateOfContact && b.FollowUpTimeframeDays ? new Date(b.DateOfContact).getTime() + b.FollowUpTimeframeDays * 86400000 : 0);
            cmp = nextA - nextB;
        }
        return sortConfig.order === 'asc' ? cmp : -cmp;
    });
    const upcoming = (contacts || []).filter(c => c.UpcomingFollowUp === true || isContactFollowUpUpcoming(c));
    return `
        <div class="contacts-view">
            <h2 class="contacts-view-title">Land Development Contacts</h2>
            <p class="contacts-view-desc">Individuals only (people)—not entities. Pull up contacts and details like a contact book; track follow-up dates and send reminder emails.</p>
            ${upcoming.length > 0 ? `
            <div class="contacts-upcoming-alert" role="alert">
                <h3 class="contacts-upcoming-heading">Follow-ups due soon (${upcoming.length})</h3>
                <ul class="contacts-upcoming-list">
                    ${upcoming.map(c => {
                        const name = (c.Name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const nextStr = formatContactNextFollowUp(c);
                        const id = getLandDevContactId(c);
                        const email = (c.Email || '').replace(/"/g, '&quot;');
                        return `<li class="contacts-upcoming-item">
                            <span class="contacts-upcoming-name">${name}</span>
                            <span class="contacts-upcoming-next">${nextStr}</span>
                            <button type="button" class="contacts-btn contacts-send-reminder-btn" data-contact-id="${id}" data-contact-name="${name}" data-contact-email="${email}" title="Send reminder now (immediate)">Send reminder</button>
                        </li>`;
                    }).join('')}
                </ul>
            </div>
            ` : ''}
            <div class="contacts-toolbar">
                <div class="contacts-view-toggle" role="group" aria-label="List or map view">
                    <button type="button" class="contacts-toggle-btn ${!isMapMode ? 'active' : ''}" data-mode="list">List</button>
                    <button type="button" class="contacts-toggle-btn ${isMapMode ? 'active' : ''}" data-mode="map">Map</button>
                </div>
                <div class="contacts-filters">
                    <select id="contacts-sort-by" class="contacts-filter-select" aria-label="Sort contacts by">
                        <option value="name" ${sortConfig.by === 'name' ? 'selected' : ''}>Sort: Name</option>
                        <option value="type" ${sortConfig.by === 'type' ? 'selected' : ''}>Sort: Type</option>
                        <option value="city" ${sortConfig.by === 'city' ? 'selected' : ''}>Sort: City</option>
                        <option value="state" ${sortConfig.by === 'state' ? 'selected' : ''}>Sort: State</option>
                        <option value="date" ${sortConfig.by === 'date' ? 'selected' : ''}>Sort: Contact Date</option>
                        <option value="followup" ${sortConfig.by === 'followup' ? 'selected' : ''}>Sort: Follow-up Date</option>
                    </select>
                    <select id="contacts-sort-order" class="contacts-filter-select" aria-label="Sort order" style="width: 6em;">
                        <option value="asc" ${sortConfig.order === 'asc' ? 'selected' : ''}>A→Z</option>
                        <option value="desc" ${sortConfig.order === 'desc' ? 'selected' : ''}>Z→A</option>
                    </select>
                    <select id="contacts-filter-type" class="contacts-filter-select" aria-label="Filter by type">
                        <option value="">All types</option>
                        ${types.map(t => `<option value="${t.replace(/"/g, '&quot;')}" ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    <input type="text" id="contacts-filter-city" class="contacts-filter-input" placeholder="City" value="${(f.city || '').replace(/"/g, '&quot;')}" aria-label="Filter by city" />
                    <input type="text" id="contacts-filter-state" class="contacts-filter-input" placeholder="State" value="${(f.state || '').replace(/"/g, '&quot;')}" maxlength="2" aria-label="Filter by state" style="width: 4em;" />
                    <input type="text" id="contacts-filter-q" class="contacts-filter-input" placeholder="Search name, email, notes…" value="${(f.q || '').replace(/"/g, '&quot;')}" aria-label="Search contacts" />
                    <label class="contacts-filter-checkbox-label"><input type="checkbox" id="contacts-filter-upcoming" ${f.upcomingOnly ? 'checked' : ''} /> Upcoming only</label>
                </div>
                <button type="button" class="contacts-add-btn" id="contacts-add-btn">Add contact</button>
            </div>
            <div class="contacts-panels">
                <div class="contacts-list-panel ${isMapMode ? 'hidden' : ''}" id="contacts-list-panel">
            <div class="contacts-list" id="contacts-list">
                ${!(sorted && sorted.length) ? '<p class="contacts-empty">No contacts yet. Add a contact or adjust filters.</p>' : sorted.map(c => {
                    const name = (c.Name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const type = (c.Type || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const city = (c.City || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const state = (c.State || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const dateContact = formatContactDate(c.DateOfContact);
                    const nextFollow = formatContactNextFollowUp(c);
                    const id = getLandDevContactId(c);
                    const upcomingBadge = (c.UpcomingFollowUp === true || isContactFollowUpUpcoming(c)) ? '<span class="contacts-badge-upcoming">Due soon</span>' : '';
                    const email = (c.Email || '').replace(/"/g, '&quot;');
                    return `
                <div class="contacts-card" data-contact-id="${id}">
                    <div class="contacts-card-main">
                        <div class="contacts-card-header">
                            <span class="contacts-card-name">${name}</span>
                            ${upcomingBadge}
                        </div>
                        <div class="contacts-card-meta">${type ? `<span class="contacts-card-type">${type}</span>` : ''} ${city || state ? `<span>${[city, state].filter(Boolean).join(', ')}</span>` : ''}</div>
                        <div class="contacts-card-dates">Contact: ${dateContact} · Follow-up: ${nextFollow}</div>
                    </div>
                    <div class="contacts-card-actions">
                        <button type="button" class="contacts-btn contacts-view-btn" data-contact-id="${id}" title="View / Edit">Edit</button>
                        <button type="button" class="contacts-btn contacts-send-reminder-btn" data-contact-id="${id}" data-contact-name="${name}" data-contact-email="${email}" title="Send reminder now (immediate)">Remind</button>
                        <button type="button" class="contacts-btn contacts-delete-btn" data-contact-id="${id}" data-contact-name="${name}" title="Delete">Delete</button>
                    </div>
                </div>`;
                }).join('')}
            </div>
                </div>
                <div class="contacts-map-panel ${!isMapMode ? 'hidden' : ''}" id="contacts-map-panel">
                    <div id="contacts-map" class="contacts-map-canvas" aria-label="Contacts map"></div>
                </div>
            </div>
        </div>
    `;
}

function debounce(fn, ms) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}
function setupContactsViewHandlers(container) {
    if (!container) return;
    const applyFiltersAndRefresh = () => {
        window.landDevelopmentContactFilters = {
            type: (container.querySelector('#contacts-filter-type') || {}).value || '',
            city: (container.querySelector('#contacts-filter-city') || {}).value || '',
            state: (container.querySelector('#contacts-filter-state') || {}).value || '',
            q: (container.querySelector('#contacts-filter-q') || {}).value || '',
            upcomingOnly: (container.querySelector('#contacts-filter-upcoming') || {}).checked || false
        };
        switchView('contacts', typeof allDeals !== 'undefined' ? allDeals : []);
    };
    const applySortAndRefresh = () => {
        const sortBy = (container.querySelector('#contacts-sort-by') || {}).value || 'name';
        const sortOrder = (container.querySelector('#contacts-sort-order') || {}).value || 'asc';
        window.contactsSort = { by: sortBy, order: sortOrder };
        switchView('contacts', typeof allDeals !== 'undefined' ? allDeals : []);
    };
    container.querySelector('#contacts-sort-by')?.addEventListener('change', applySortAndRefresh);
    container.querySelector('#contacts-sort-order')?.addEventListener('change', applySortAndRefresh);
    container.querySelector('#contacts-filter-type')?.addEventListener('change', applyFiltersAndRefresh);
    container.querySelector('#contacts-filter-city')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-state')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-q')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-upcoming')?.addEventListener('change', applyFiltersAndRefresh);
    container.querySelector('#contacts-add-btn')?.addEventListener('click', () => showContactModal(null));

    container.querySelectorAll('.contacts-toggle-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = this.dataset.mode;
            if (!mode || mode === window.contactsViewMode) return;
            window.contactsViewMode = mode;
            const listPanel = container.querySelector('#contacts-list-panel');
            const mapPanel = container.querySelector('#contacts-map-panel');
            container.querySelectorAll('.contacts-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            if (mode === 'map') {
                if (listPanel) listPanel.classList.add('hidden');
                if (mapPanel) mapPanel.classList.remove('hidden');
                setTimeout(async () => {
                    await initContactsMap(window.landDevelopmentContacts || []);
                    if (contactsMapInstance) contactsMapInstance.invalidateSize();
                }, 100);
            } else {
                if (listPanel) listPanel.classList.remove('hidden');
                if (mapPanel) mapPanel.classList.add('hidden');
            }
        });
    });
    container.querySelectorAll('.contacts-view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = parseInt(this.dataset.contactId, 10);
            const c = (window.landDevelopmentContacts || []).find(x => getLandDevContactId(x) === id);
            if (c) showContactModal(c);
        });
    });
    container.querySelectorAll('.contacts-send-reminder-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.dataset.contactId ? parseInt(this.dataset.contactId, 10) : null;
            const name = this.dataset.contactName || '';
            const email = this.dataset.contactEmail || '';
            const c = id ? (window.landDevelopmentContacts || []).find(x => getLandDevContactId(x) === id) : null;
            showSendReminderModal(c || { Name: name, Email: email }, !c ? email : null);
        });
    });
    container.querySelectorAll('.contacts-delete-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            const rawId = this.getAttribute('data-contact-id');
            const id = rawId != null && rawId !== '' ? parseInt(String(rawId).trim(), 10) : NaN;
            const name = (this.getAttribute('data-contact-name') || 'this contact').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (isNaN(id) || id < 1) {
                showToast('Cannot delete: invalid contact id.', 'error');
                return;
            }
            const confirmed = await domoConfirm(`Delete ${name}? This cannot be undone.`, { confirmLabel: 'Delete' });
            if (!confirmed) return;
            try {
                const api = typeof API !== 'undefined' && API.deleteLandDevelopmentContact ? API : null;
                if (!api) throw new Error('Contacts API not loaded. Ensure api-client is loaded and includes deleteLandDevelopmentContact.');
                await api.deleteLandDevelopmentContact(id);
                switchView('contacts', typeof allDeals !== 'undefined' ? allDeals : []);
            } catch (err) {
                showToast(err?.message || err?.error?.message || 'Delete failed.', 'error');
            }
        });
    });
}

function showContactModal(contact) {
    const isEdit = !!contact;
    const id = contact ? getLandDevContactId(contact) : null;
    const types = ['Land Owner', 'Developer', 'Broker'];
    const modal = document.createElement('div');
    modal.className = 'deal-detail-overlay contacts-modal-overlay';
    modal.id = 'contact-edit-modal';
    modal.innerHTML = `
        <div class="contacts-modal" role="dialog" aria-labelledby="contact-modal-title">
            <h3 id="contact-modal-title">${isEdit ? 'Edit contact' : 'Add contact'}</h3>
            <form id="contact-edit-form" class="contacts-form">
                <label>Name <span class="required">*</span></label>
                <input type="text" id="contact-field-name" required value="${(contact?.Name || '').replace(/"/g, '&quot;')}" />
                <label>Email</label>
                <input type="email" id="contact-field-email" value="${(contact?.Email || '').replace(/"/g, '&quot;')}" />
                <label>Phone</label>
                <input type="tel" id="contact-field-phone" value="${(contact?.PhoneNumber || '').replace(/"/g, '&quot;')}" />
                <label>Office address</label>
                <input type="text" id="contact-field-office" value="${(contact?.OfficeAddress || '').replace(/"/g, '&quot;')}" />
                <label>Type</label>
                <select id="contact-field-type">
                    <option value="">—</option>
                    ${types.map(t => `<option value="${t.replace(/"/g, '&quot;')}" ${(contact?.Type || '') === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                <label>City</label>
                <input type="text" id="contact-field-city" value="${(contact?.City || '').replace(/"/g, '&quot;')}" />
                <label>State</label>
                <input type="text" id="contact-field-state" value="${(contact?.State || '').replace(/"/g, '&quot;')}" maxlength="2" placeholder="e.g. LA" />
                <label>Date of contact</label>
                <input type="date" id="contact-field-date" value="${contact?.DateOfContact ? String(contact.DateOfContact).slice(0, 10) : ''}" />
                <label>Follow-up timeframe (days)</label>
                <input type="number" id="contact-field-followup-days" min="0" placeholder="e.g. 180" value="${contact?.FollowUpTimeframeDays != null ? contact.FollowUpTimeframeDays : ''}" />
                <div class="contact-scheduled-reminder-box" id="contact-scheduled-reminder-box" aria-live="polite">
                    <strong>Scheduled reminder</strong>
                    <p class="contact-scheduled-reminder-text">When the follow-up date is reached, we'll send a reminder so <em>you</em> remember to reach out to this contact (e.g. &quot;You need to reach out to [contact] — it's been X days&quot;). The <strong>Remind</strong> button sends an immediate reminder to the selected recipient so they remember to reach out to this contact.</p>
                    <label for="contact-reminder-select-input">Send reminder to (who should be reminded)</label>
                    <div class="searchable-select-wrapper contact-reminder-select-wrapper" data-reminder-select="true">
                        <input type="text" id="contact-reminder-select-input" class="searchable-select-input" placeholder="Search contacts..." autocomplete="off" value="" data-reminder-to-email="" />
                        <div class="searchable-select-dropdown" style="display: none;">
                            <div class="searchable-select-options"></div>
                        </div>
                    </div>
                    <label for="contact-field-reminder-email">Or enter email address</label>
                    <input type="email" id="contact-field-reminder-email" placeholder="you@company.com or team@company.com" value="" />
                    <p id="contact-scheduled-reminder-preview" class="contact-scheduled-reminder-preview"></p>
                </div>
                <label>Notes</label>
                <textarea id="contact-field-notes" rows="3">${(contact?.Notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <div class="contacts-form-actions">
                    <button type="submit" class="contacts-btn contacts-save-btn">${isEdit ? 'Save' : 'Add'}</button>
                    <button type="button" class="contacts-btn contacts-cancel-btn">Cancel</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    let close = () => { document.removeEventListener('keydown', escHandler); modal.remove(); };

    const reminderSelectInput = modal.querySelector('#contact-reminder-select-input');
    const reminderEmailInput = modal.querySelector('#contact-field-reminder-email');
    const contactsList = (window.landDevelopmentContacts || []).filter(c => getLandDevContactId(c) !== id);
    if (contact?.ReminderToEmail) {
        const rem = (contact.ReminderToEmail || '').trim().toLowerCase();
        const match = contactsList.find(c => (c.Email || '').trim().toLowerCase() === rem);
        if (match) {
            reminderSelectInput.value = (match.Name || '').trim();
            reminderSelectInput.setAttribute('data-reminder-to-email', (match.Email || '').trim());
        } else {
            reminderEmailInput.value = (contact.ReminderToEmail || '').trim();
        }
    }

    function getEffectiveReminderToEmail() {
        const fromSelect = (reminderSelectInput?.getAttribute('data-reminder-to-email') || '').trim();
        const fromEmail = (reminderEmailInput?.value || '').trim();
        return fromSelect || fromEmail || '';
    }

    const wrapper = modal.querySelector('.contact-reminder-select-wrapper');
    const dropdown = wrapper?.querySelector('.searchable-select-dropdown');
    const optionsContainer = wrapper?.querySelector('.searchable-select-options');
    if (wrapper && dropdown && optionsContainer) {
        function updateReminderOptions(q) {
            const qq = (q || '').trim().toLowerCase();
            const list = qq ? contactsList.filter(c => {
                const name = (c.Name || '').toLowerCase();
                const email = (c.Email || '').toLowerCase();
                return name.includes(qq) || email.includes(qq);
            }) : contactsList;
            let html = '';
            list.forEach(c => {
                const cid = getLandDevContactId(c);
                const name = (c.Name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const email = (c.Email || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                html += `<div class="searchable-select-option" data-action="select" data-reminder-contact-id="${cid}" data-reminder-email="${(c.Email || '').replace(/"/g, '&quot;')}" data-reminder-name="${name.replace(/"/g, '&quot;')}">${name}${email ? ` <span class="searchable-select-option-email">${email}</span>` : ''}</div>`;
            });
            if (!html) html = '<div class="searchable-select-option no-results">No contacts match. Use the email field below.</div>';
            optionsContainer.innerHTML = html;
        }
        reminderSelectInput.addEventListener('focus', () => { dropdown.style.display = 'block'; updateReminderOptions(reminderSelectInput.value); });
        reminderSelectInput.addEventListener('input', () => { updateReminderOptions(reminderSelectInput.value); dropdown.style.display = 'block'; updateScheduledReminderPreview(); });
        reminderSelectInput.addEventListener('click', (e) => e.stopPropagation());
        let closeDropdown = (e) => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; };
        document.addEventListener('click', closeDropdown);
        const origClose = close;
        close = function () { document.removeEventListener('click', closeDropdown); origClose(); };
        optionsContainer.addEventListener('click', (e) => {
            const option = e.target.closest('.searchable-select-option');
            if (!option || option.classList.contains('no-results')) return;
            if (option.dataset.action === 'select') {
                const name = (option.dataset.reminderName || option.textContent).trim().replace(/&quot;/g, '"');
                const email = (option.dataset.reminderEmail || '').trim();
                reminderSelectInput.value = name;
                reminderSelectInput.setAttribute('data-reminder-to-email', email);
                dropdown.style.display = 'none';
                reminderEmailInput.value = '';
                updateScheduledReminderPreview();
            }
        });
    }

    function updateScheduledReminderPreview() {
        const reminderTo = getEffectiveReminderToEmail();
        const dateVal = (document.getElementById('contact-field-date')?.value || '').trim();
        const daysVal = document.getElementById('contact-field-followup-days')?.value;
        const days = daysVal !== '' && daysVal != null ? parseInt(daysVal, 10) : null;
        const previewEl = document.getElementById('contact-scheduled-reminder-preview');
        if (!previewEl) return;
        if (reminderTo && dateVal && !isNaN(days) && days >= 0) {
            const d = new Date(dateVal);
            d.setDate(d.getDate() + days);
            if (!isNaN(d.getTime())) {
                const followUpStr = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
                previewEl.textContent = `We'll notify ${reminderTo} on ${followUpStr} to reach out to this contact.`;
                previewEl.classList.remove('contact-scheduled-reminder-no-email');
            } else {
                previewEl.textContent = reminderTo ? `We'll notify ${reminderTo} when the follow-up date is reached.` : '';
                previewEl.classList.add('contact-scheduled-reminder-no-email');
            }
        } else if (reminderTo) {
            previewEl.textContent = `We'll notify ${reminderTo} when the follow-up date is reached. Set date of contact and follow-up days above.`;
            previewEl.classList.remove('contact-scheduled-reminder-no-email');
        } else {
            previewEl.textContent = '';
        }
    }
    updateScheduledReminderPreview();
    ['contact-field-date', 'contact-field-followup-days'].forEach(uid => {
        const el = document.getElementById(uid);
        if (el) { el.addEventListener('input', updateScheduledReminderPreview); el.addEventListener('change', updateScheduledReminderPreview); }
    });
    if (reminderEmailInput) { reminderEmailInput.addEventListener('input', () => { reminderSelectInput.value = ''; reminderSelectInput.removeAttribute('data-reminder-to-email'); updateScheduledReminderPreview(); }); reminderEmailInput.addEventListener('change', updateScheduledReminderPreview); }

    modal.querySelector('.contacts-cancel-btn').addEventListener('click', close);
    modal.querySelector('.contacts-modal').addEventListener('click', e => e.stopPropagation());
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#contact-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('contact-field-name')?.value || '').trim();
        if (!name) { showToast('Name is required.', 'error'); return; }
        const data = {
            Name: name,
            Email: (document.getElementById('contact-field-email')?.value || '').trim() || undefined,
            PhoneNumber: (document.getElementById('contact-field-phone')?.value || '').trim() || undefined,
            OfficeAddress: (document.getElementById('contact-field-office')?.value || '').trim() || undefined,
            Type: (document.getElementById('contact-field-type')?.value || '').trim() || undefined,
            City: (document.getElementById('contact-field-city')?.value || '').trim() || undefined,
            State: (document.getElementById('contact-field-state')?.value || '').trim().toUpperCase().slice(0, 2) || undefined,
            DateOfContact: (document.getElementById('contact-field-date')?.value || '').trim() || undefined,
            FollowUpTimeframeDays: (() => { const v = document.getElementById('contact-field-followup-days')?.value; if (v === '' || v == null) return undefined; const n = parseInt(v, 10); return isNaN(n) ? undefined : n; })(),
            ReminderToEmail: getEffectiveReminderToEmail() || undefined,
            Notes: (document.getElementById('contact-field-notes')?.value || '').trim() || undefined
        };
        Object.keys(data).forEach(k => { if (data[k] === undefined) delete data[k]; });
        try {
            if (isEdit && id != null) {
                await (typeof API !== 'undefined' && API.updateLandDevelopmentContact ? API.updateLandDevelopmentContact(id, data) : Promise.reject(new Error('Contacts API not loaded. Ensure api-client is loaded and includes updateLandDevelopmentContact.')));
            } else {
                await (typeof API !== 'undefined' && API.createLandDevelopmentContact ? API.createLandDevelopmentContact(data) : Promise.reject(new Error('Contacts API not loaded. Ensure api-client is loaded and includes createLandDevelopmentContact.')));
            }
            close();
            switchView('contacts', typeof allDeals !== 'undefined' ? allDeals : []);
        } catch (err) {
            showToast(err.message || 'Save failed.', 'error');
        }
    });
}

function showSendReminderModal(contactOrContext, emailPrefill) {
    const contacts = window.landDevelopmentContacts || [];
    const preSelectId = contactOrContext ? getLandDevContactId(contactOrContext) : null;
    const emailPrefillVal = emailPrefill != null ? emailPrefill : (contactOrContext?.Email || '');
    const modal = document.createElement('div');
    modal.className = 'deal-detail-overlay contacts-modal-overlay';
    modal.id = 'send-reminder-modal';
    modal.innerHTML = `
        <div class="contacts-modal contacts-reminder-modal" role="dialog" aria-labelledby="reminder-modal-title">
            <h3 id="reminder-modal-title">Send reminder now</h3>
            <p class="contacts-reminder-desc">Send an immediate reminder to the recipient so they remember to reach out to the selected contact(s). Each reminder goes to that contact&apos;s &quot;Send reminder to&quot; address. Select contacts that have this set, or enter an ad-hoc email.</p>
            <form id="send-reminder-form" class="contacts-form">
                <label for="reminder-search">Search contacts</label>
                <input type="text" id="reminder-search" class="reminder-search-input" placeholder="Type name or email…" autocomplete="off" />
                <div class="reminder-contact-list-wrap" aria-label="Contact list">
                    <ul id="reminder-contact-list" class="reminder-contact-list"></ul>
                    <p id="reminder-contact-list-empty" class="reminder-list-empty hidden">No contacts match. Add contacts in the Contacts tab or use the email field below.</p>
                </div>
                <label for="reminder-email">Or send to an email address (not in list)</label>
                <input type="email" id="reminder-email" placeholder="someone@example.com" value="${(emailPrefillVal || '').replace(/"/g, '&quot;')}" />
                <label for="reminder-message">Message (optional)</label>
                <textarea id="reminder-message" rows="3" placeholder="e.g. Reminder to follow up on the land discussion."></textarea>
                <div class="contacts-form-actions">
                    <button type="submit" class="contacts-btn contacts-save-btn">Send reminder</button>
                    <button type="button" class="contacts-btn contacts-cancel-btn">Cancel</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    const close = () => { modal.remove(); };
    const listEl = modal.querySelector('#reminder-contact-list');
    const emptyEl = modal.querySelector('#reminder-contact-list-empty');
    const searchEl = modal.querySelector('#reminder-search');

    function filterContacts(q) {
        const qq = (q || '').trim().toLowerCase();
        if (!qq) return contacts;
        return contacts.filter(c => {
            const name = (c.Name || '').toLowerCase();
            const email = (c.Email || c.PhoneNumber || '').toLowerCase();
            const type = (c.Type || '').toLowerCase();
            const city = (c.City || '').toLowerCase();
            const state = (c.State || '').toLowerCase();
            return name.includes(qq) || email.includes(qq) || type.includes(qq) || city.includes(qq) || state.includes(qq);
        });
    }

    function renderContactList(filtered) {
        listEl.innerHTML = '';
        if (filtered.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }
        emptyEl.classList.add('hidden');
        filtered.forEach(c => {
            const id = getLandDevContactId(c);
            const name = (c.Name || 'Unnamed').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const email = (c.Email || c.PhoneNumber || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const checked = id === preSelectId ? ' checked' : '';
            const li = document.createElement('li');
            li.className = 'reminder-contact-item';
            li.innerHTML = `
                <label class="reminder-contact-label">
                    <input type="checkbox" class="reminder-contact-checkbox" value="${id}" data-email="${email.replace(/"/g, '&quot;')}"${checked} />
                    <span class="reminder-contact-name">${name}</span>
                    ${email ? `<span class="reminder-contact-email">${email}</span>` : ''}
                </label>
            `;
            listEl.appendChild(li);
        });
    }

    renderContactList(contacts);
    searchEl.addEventListener('input', function() { renderContactList(filterContacts(this.value)); });
    searchEl.addEventListener('keydown', function(e) { e.stopPropagation(); });

    modal.querySelector('.contacts-cancel-btn').addEventListener('click', close);
    modal.querySelector('.contacts-modal').addEventListener('click', e => e.stopPropagation());
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#send-reminder-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const checked = modal.querySelectorAll('.reminder-contact-checkbox:checked');
        const contactIds = Array.from(checked).map(cb => parseInt(cb.value, 10)).filter(n => !isNaN(n));
        const emailVal = (modal.querySelector('#reminder-email')?.value || '').trim();
        if (contactIds.length === 0 && !emailVal) {
            showToast('Select at least one contact or enter an email address.', 'info');
            return;
        }
        const msg = (modal.querySelector('#reminder-message')?.value || '').trim();
        const send = typeof API !== 'undefined' && API.sendLandDevelopmentContactReminder;
        if (!send) {
            showToast('Contacts API not loaded. Ensure api-client is loaded and includes sendLandDevelopmentContactReminder.', 'error');
            return;
        }
        try {
            const payload = { message: msg || undefined };
            if (contactIds.length > 0) payload.contactIds = contactIds;
            if (emailVal) payload.email = emailVal;
            const resp = await API.sendLandDevelopmentContactReminder(payload);
            close();
            const sent = resp.sent ?? (resp.success && (contactIds.length > 0 || emailVal) ? 1 : 0);
            if (resp.failed && resp.failed.length > 0) {
                const failSummary = resp.failed.map(f => `${f.label || f.email || f.contactId}: ${f.error}`).join('; ');
                showToast(`Sent to ${sent}. Failed: ${failSummary}`, 'error');
            } else {
                showToast(sent === 1 ? 'Reminder sent.' : `Reminder(s) sent to ${sent} recipient(s).`, 'success');
            }
        } catch (err) {
            const errMsg = err?.message || err?.error?.message || String(err);
            showToast(errMsg || 'Failed to send reminder.', 'error');
        }
    });
    document.addEventListener('keydown', function escapeReminderModal(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escapeReminderModal); }
    });
}

// Render Timeline (board-style with year/quarter columns)
