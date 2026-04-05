/**
 * app-pipeline-table.js — Pipeline admin table: show/hide view, render table, row binding, save all
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function showDealPipelineView() {
    if (!isAuthenticated) {
        showToast('Please login to access Deal Pipeline management.', 'info');
        return;
    }
    
    // Require Edit Mode to be on before opening Deal Pipeline
    if (!isEditMode) {
        showToast('Please click "Edit Mode" first to access Deal Pipeline management.', 'info');
        return;
    }
    
    // Hide main views
    const listViewContainer = document.querySelector('.list-view-container');
    if (listViewContainer) {
        listViewContainer.style.display = 'none';
    }
    
    // Hide filter and sort controls
    const filterControls = document.getElementById('filter-controls');
    const sortControls = document.getElementById('sort-controls');
    if (filterControls) filterControls.style.display = 'none';
    if (sortControls) sortControls.style.display = 'none';
    
    const visibleCountBadge = document.getElementById('visible-deal-count-badge');
    if (visibleCountBadge) visibleCountBadge.style.display = 'none';

    // Show deal pipeline view (full-viewport overlay – single scroll, no nested scrollers)
    const dealPipelineView = document.getElementById('deal-pipeline-view');
    if (dealPipelineView) {
        document.body.classList.add('deal-pipeline-open');
        dealPipelineView.style.display = 'block';
        dealPipelineView.classList.add('active');
        renderDealPipelineTable();
        
        // Ensure Save All button visibility is updated after table renders
        setTimeout(() => {
            updateSaveAllButtonVisibility();
        }, 100);
    }
}

function hideDealPipelineView() {
    document.body.classList.remove('deal-pipeline-open');
    const dealPipelineView = document.getElementById('deal-pipeline-view');
    if (dealPipelineView) {
        dealPipelineView.style.display = 'none';
        dealPipelineView.classList.remove('active');
    }
    
    // Show main views
    const listViewContainer = document.querySelector('.list-view-container');
    if (listViewContainer) {
        listViewContainer.style.display = 'block';
    }
    
    // Show filter and sort controls if needed
    const filterControls = document.getElementById('filter-controls');
    const sortControls = document.getElementById('sort-controls');
    // These will be shown/hidden by switchView based on current view
    
    // Refresh the main view
    switchView(currentView, allDeals);
}

async function renderDealPipelineTable(opts) {
    const container = document.getElementById('deal-pipeline-table-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    
    try {
        const response = await API.getAllDealPipelines(opts && opts.forceApi ? { forceApi: true } : undefined);
        if (!response.success) {
            throw new Error(response.error?.message || 'Failed to load deals');
        }
        
        const deals = response.data || [];
        
        // Get loans and banks to determine bank names
        let loansMap = {};
        let banksMap = {};
        try {
            const loansResponse = await API.getAllLoans();
            if (loansResponse.success && loansResponse.data) {
                loansResponse.data.forEach(loan => {
                    const projectId = loan.ProjectId;
                    if (!loansMap[projectId]) {
                        loansMap[projectId] = [];
                    }
                    loansMap[projectId].push(loan);
                });
            }
            
            const banksResponse = await API.getAllBanks();
            if (banksResponse.success && banksResponse.data) {
                banksResponse.data.forEach(bank => {
                    banksMap[bank.BankId] = bank;
                });
            }
        } catch (error) {
            console.warn('Failed to load loans/banks for bank name calculation:', error);
        }
        
        // Get Pre-Con Managers for dropdown
        let preConManagers = [];
        try {
            const managersResponse = await API.getAllPreConManagers();
            if (managersResponse.success) {
                preConManagers = managersResponse.data || [];
            }
        } catch (error) {
            console.warn('Failed to load Pre-Con Managers:', error);
        }
        
        // Get regions for dropdown
        let regions = [];
        try {
            const regionsResponse = await API.getAllRegions();
            if (regionsResponse.success) {
                regions = regionsResponse.data || [];
            }
        } catch (error) {
            console.warn('Failed to load regions:', error);
        }
        
        // Get product types for dropdown
        let productTypes = [];
        try {
            const productTypesResponse = await API.getAllProductTypes();
            if (productTypesResponse.success) {
                productTypes = productTypesResponse.data || [];
            }
        } catch (error) {
            console.warn('Failed to load product types:', error);
        }
        
        // Build table HTML with helpful tooltips
        let html = `
            <div class="deal-pipeline-table-wrapper">
                <div class="deal-pipeline-scrollbar-top" id="deal-pipeline-scrollbar-top"></div>
                <div class="deal-pipeline-table-scroll-container" id="deal-pipeline-table-scroll-container">
                    <table class="deal-pipeline-table">
                        <thead>
                    <tr>
                        <th title="The name of the project/deal">Project Name</th>
                        <th title="Current stage of the deal">Stage</th>
                        <th title="Priority (High, Medium, Low)">Priority</th>
                        <th title="City where the project is located">City</th>
                        <th title="State abbreviation (e.g., LA, TX)">State</th>
                        <th title="Geographic region">Region</th>
                        <th title="Latitude (from Procore if linked, otherwise enter manually)">Latitude</th>
                        <th title="Longitude (from Procore if linked, otherwise enter manually)">Longitude</th>
                        <th title="Type of product (Prototype, Heights, Flats, etc.)">Product Type</th>
                        <th title="Bank name (managed in Banking Dashboard)">Bank <span class="readonly-badge">Read-Only</span></th>
                        <th title="Project start date">Start Date</th>
                        <th title="Total unit count">Unit Count</th>
                        <th title="Pre-Construction Manager">Pre-Con Manager</th>
                        <th title="Land size in acres">Acreage</th>
                        <th title="Price paid for the land">Land Price</th>
                        <th title="Price per square foot (auto-calculated)">Sq Ft Price <span class="auto-badge">Auto</span></th>
                        <th title="Date of execution">Execution Date</th>
                        <th title="Due diligence deadline">Due Diligence Date</th>
                        <th title="Closing date">Closing Date</th>
                        <th title="Construction loan closing date">Construction Loan Closing</th>
                        <th title="Entity purchasing the property">Purchasing Entity</th>
                        <th title="Cash transaction">Cash</th>
                        <th title="Located in an Opportunity Zone">Opportunity Zone</th>
                        <th title="Broker or referral contact">Broker/Referral</th>
                        <th title="Price (raw), e.g. -, TBD, $1.2M">Price (raw)</th>
                        <th title="Listed or unlisted">Listed/Unlisted</th>
                        <th title="Zoning code">Zoning</th>
                        <th title="County or Parish">County/Parish</th>
                        <th title="Notes about the deal">Notes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Filter out HoldCo deals - they should not be displayed in the deal pipeline table
        const filteredDeals = deals.filter(dbDeal => {
            const stage = normalizeStage(dbDeal.Stage || 'Prospective');
            return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
        });
        
        // Read current filter/sort state from DOM (if filter-sort bar was already rendered)
        const filterSortEl = document.getElementById('deal-pipeline-filter-sort');
        let selectedStages = [];
        let sortBy = 'stage';
        let sortOrder = 'asc';
        if (filterSortEl && filterSortEl.innerHTML) {
            filterSortEl.querySelectorAll('.deal-pipeline-stage-cb:checked').forEach(cb => selectedStages.push(cb.value));
            const sortBySelect = filterSortEl.querySelector('.deal-pipeline-sort-by');
            const sortOrderSelect = filterSortEl.querySelector('.deal-pipeline-sort-order');
            if (sortBySelect) sortBy = sortBySelect.value || 'stage';
            if (sortOrderSelect) sortOrder = sortOrderSelect.value || 'asc';
        }
        
        // Build filter/sort bar HTML (stage checkboxes + sort dropdowns)
        const stagesForFilter = STAGE_DISPLAY_ORDER.filter(s => s !== 'START');
        const filterSortHTML = `
            <div class="deal-pipeline-filter-sort-inner">
                <div class="deal-pipeline-filter-group">
                    <label>Filter by Stage:</label>
                    <div class="deal-pipeline-stage-checkboxes">
                        ${stagesForFilter.map(s => `<label class="deal-pipeline-stage-cb-label"><input type="checkbox" class="deal-pipeline-stage-cb" value="${s.replace(/"/g, '&quot;')}" ${selectedStages.includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
                        <button type="button" class="deal-pipeline-filter-clear-btn">Clear</button>
                    </div>
                </div>
                <div class="deal-pipeline-sort-group">
                    <label>Sort by:</label>
                    <select class="deal-pipeline-sort-by">
                        <option value="stage" ${sortBy === 'stage' ? 'selected' : ''}>Stage</option>
                        <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Project Name</option>
                        <option value="date" ${sortBy === 'date' ? 'selected' : ''}>Start Date</option>
                        <option value="city" ${sortBy === 'city' ? 'selected' : ''}>City</option>
                    </select>
                    <select class="deal-pipeline-sort-order">
                        <option value="asc" ${sortOrder === 'asc' ? 'selected' : ''}>Ascending</option>
                        <option value="desc" ${sortOrder === 'desc' ? 'selected' : ''}>Descending</option>
                    </select>
                </div>
            </div>
        `;
        if (filterSortEl) filterSortEl.innerHTML = filterSortHTML;
        
        // Apply stage filter
        let dealsToRender = filteredDeals;
        if (selectedStages.length > 0) {
            dealsToRender = filteredDeals.filter(dbDeal => {
                const stage = normalizeStage(dbDeal.Stage || 'Prospective');
                return selectedStages.includes(stage);
            });
        }
        
        // Map of dealId -> deal for Edit button (so full edit modal can open with correct data)
        window._dealPipelineDealsForEdit = {};
        
        // Sort deals
        const stageOrder = [...STAGE_DISPLAY_ORDER];
        dealsToRender = [...dealsToRender].sort((a, b) => {
            const dealA = mapDealPipelineDataToDeal(a, loansMap, banksMap);
            const dealB = mapDealPipelineDataToDeal(b, loansMap, banksMap);
            if (!dealA || !dealB) return 0;
            let cmp = 0;
            if (sortBy === 'stage') {
                const stageA = normalizeStage(dealA.Stage || '');
                const stageB = normalizeStage(dealB.Stage || '');
                const idxA = stageOrder.indexOf(stageA);
                const idxB = stageOrder.indexOf(stageB);
                cmp = (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            } else if (sortBy === 'name') {
                cmp = (dealA.Name || '').localeCompare(dealB.Name || '');
            } else if (sortBy === 'date') {
                const dateA = dealA['Start Date'] || dealA.startDate || '';
                const dateB = dealB['Start Date'] || dealB.startDate || '';
                cmp = (new Date(dateA) || 0) - (new Date(dateB) || 0);
            } else if (sortBy === 'city') {
                cmp = (dealA.Location || '').localeCompare(dealB.Location || '');
            }
            return sortOrder === 'desc' ? -cmp : cmp;
        });
        
        // Attach filter/sort change listeners (re-render table when filter or sort changes)
        if (filterSortEl) {
            filterSortEl.querySelectorAll('.deal-pipeline-stage-cb').forEach(cb => {
                cb.addEventListener('change', () => renderDealPipelineTable());
            });
            filterSortEl.querySelector('.deal-pipeline-filter-clear-btn')?.addEventListener('click', () => {
                filterSortEl.querySelectorAll('.deal-pipeline-stage-cb').forEach(c => { c.checked = false; });
                renderDealPipelineTable();
            });
            filterSortEl.querySelector('.deal-pipeline-sort-by')?.addEventListener('change', () => renderDealPipelineTable());
            filterSortEl.querySelector('.deal-pipeline-sort-order')?.addEventListener('change', () => renderDealPipelineTable());
        }
        
        dealsToRender.forEach(dbDeal => {
            const dealId = dbDeal.DealPipelineId || '';
            const projectId = dbDeal.ProjectId || '';
            
            // Map the deal using the same logic as mapDealPipelineDataToDeal to get Procore overrides
            // Get loans and banks for this project
            const projectLoans = loansMap[projectId] || [];
            const deal = mapDealPipelineDataToDeal(dbDeal, loansMap, banksMap);
            if (!deal) return; // Skip START deals
            
            // Check if this project has Procore data (try both string and number projectId)
            // The Map stores projectId as a number, so we need to ensure we're looking it up correctly
            let procoreMatch = null;
            if (projectId && window.PROCORE_MATCHES) {
                const projectIdNum = typeof projectId === 'number' ? projectId : parseInt(projectId);
                // Try multiple lookup methods to handle type mismatches
                procoreMatch = window.PROCORE_MATCHES.get(projectIdNum) || 
                              window.PROCORE_MATCHES.get(projectId) ||
                              window.PROCORE_MATCHES.get(String(projectId));
                
                // If still not found, search all keys for a match
                if (!procoreMatch) {
                    const allKeys = Array.from(window.PROCORE_MATCHES.keys());
                    const foundKey = allKeys.find(k => k == projectId || k == projectIdNum || String(k) === String(projectId) || Number(k) === projectIdNum);
                    if (foundKey !== undefined) {
                        procoreMatch = window.PROCORE_MATCHES.get(foundKey);
                    }
                }
            }
            const hasProcore = procoreMatch && procoreMatch.hasProcore === true;
            
            // Store for Edit button: full deal with _original so edit modal has all fields
            if (dealId) {
                window._dealPipelineDealsForEdit[dealId] = { ...deal, _original: dbDeal };
            }
            
            // Format dates
            const formatDateInput = (date) => {
                if (!date) return '';
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                return d.toISOString().split('T')[0];
            };
            
            // Determine bank name from loans/banks (same logic as mapDealPipelineDataToDeal)
            let bankName = deal.Bank || null;
            const stage = normalizeStage(deal.Stage || 'Prospective');
            
            if (projectLoans.length > 0) {
                const permanentLoan = projectLoans.find(l => l.LoanPhase === 'Permanent');
                const constructionLoan = projectLoans.find(l => l.LoanPhase === 'Construction');
                
                // If stabilized and has permanent financing, use permanent lender
                if (stage === 'Stabilized' && permanentLoan && permanentLoan.LenderId) {
                    const permanentBank = banksMap[permanentLoan.LenderId];
                    if (permanentBank) {
                        bankName = permanentBank.BankName || bankName;
                    }
                } 
                // Otherwise, use construction lender
                else if (constructionLoan && constructionLoan.LenderId) {
                    const constructionBank = banksMap[constructionLoan.LenderId];
                    if (constructionBank) {
                        bankName = constructionBank.BankName || bankName;
                    }
                }
            }
            
            // Determine which fields are read-only due to Procore
            // If Procore has data for this project, make city/state readonly if:
            // 1. Procore has city/state data directly, OR
            // 2. Procore has address data (which contains location info)
            // This ensures that if Procore has any location data, the fields are readonly
            const hasProcoreLocationData = hasProcore && procoreMatch && (
                (procoreMatch.city && String(procoreMatch.city).trim() !== '') || 
                (procoreMatch.state && String(procoreMatch.state).trim() !== '') || 
                (procoreMatch.address && String(procoreMatch.address).trim() !== '')
            );
            const cityReadonly = hasProcoreLocationData;
            const stateReadonly = hasProcoreLocationData;
            const regionReadonly = hasProcore && procoreMatch && procoreMatch.region && String(procoreMatch.region).trim() !== '';
            const hasProcoreLat = hasProcore && procoreMatch && (procoreMatch.latitude != null && procoreMatch.latitude !== '');
            const hasProcoreLng = hasProcore && procoreMatch && (procoreMatch.longitude != null && procoreMatch.longitude !== '');
            const latitudeReadonly = hasProcoreLat;
            const longitudeReadonly = hasProcoreLng;
            const startDateReadonly = !!(deal._procoreOverridesStartDate || (hasProcore && procoreMatch && procoreMatch.actualStartDate && isProcoreStartDateOverride(procoreMatch.actualStartDate)));
            const unitCountReadonly = hasProcore && procoreMatch && procoreMatch.unitCount;
            
            const cityClass = cityReadonly ? 'external-source-field' : '';
            const stateClass = stateReadonly ? 'external-source-field' : '';
            const regionClass = regionReadonly ? 'external-source-field' : '';
            const latitudeClass = latitudeReadonly ? 'external-source-field' : '';
            const longitudeClass = longitudeReadonly ? 'external-source-field' : '';
            const startDateClass = startDateReadonly ? 'external-source-field' : '';
            const unitCountClass = unitCountReadonly ? 'external-source-field' : '';
            
            const cityTitle = cityReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : '';
            const stateTitle = stateReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : 'State abbreviation (2 letters, e.g., CA, TX, NY)';
            const regionTitle = regionReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : '';
            const latitudeTitle = latitudeReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : 'Enter latitude manually if not linked to Procore. If linked, value comes from Procore.';
            const longitudeTitle = longitudeReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : 'Enter longitude manually if not linked to Procore. If linked, value comes from Procore.';
            const startDateTitle = startDateReadonly ? 'Data Source: Procore (actual start 60+ days in past)\n\nThis field is synced from Procore and cannot be edited here. Otherwise start date is entered in Deal Pipeline.' : 'Start date is controlled by Deal Pipeline. Procore overrides only when actual start is 60+ days in the past.';
            const unitCountTitle = unitCountReadonly ? 'Data Source: Procore\n\nThis field is automatically synced from Procore and cannot be edited here. To update this value, modify it in Procore.' : '';
            
            html += `
                <tr data-deal-id="${dealId}" data-project-id="${projectId}">
                    <td class="project-name-cell"><input type="text" class="deal-pipeline-field" data-field="ProjectName" value="${(deal.ProjectName || deal.Name || dbDeal.ProjectName || '').replace(/"/g, '&quot;')}" style="min-width: 200px; width: 100%;" /></td>
                    <td>
                        <select class="deal-pipeline-field" data-field="Stage">
                            <option value="Prospective" ${deal.Stage === 'Prospective' ? 'selected' : ''}>Prospective</option>
                            <option value="Under Contract" ${deal.Stage === 'Under Contract' ? 'selected' : ''}>Under Contract</option>
                            <option value="Commercial Land - Listed" ${deal.Stage === 'Commercial Land - Listed' ? 'selected' : ''}>Commercial Land - Listed</option>
                            <option value="Under Construction" ${deal.Stage === 'Under Construction' ? 'selected' : ''}>Under Construction</option>
                            <option value="Lease-Up" ${deal.Stage === 'Lease-Up' ? 'selected' : ''}>Lease-Up</option>
                            <option value="Stabilized" ${deal.Stage === 'Stabilized' ? 'selected' : ''}>Stabilized</option>
                            <option value="Liquidated" ${deal.Stage === 'Liquidated' ? 'selected' : ''}>Liquidated</option>
                            <option value="Rejected" ${deal.Stage === 'Rejected' ? 'selected' : ''}>Rejected</option>
                            <option value="Dead" ${deal.Stage === 'Dead' ? 'selected' : ''}>Dead</option>
                        </select>
                    </td>
                    <td>
                        <select class="deal-pipeline-field" data-field="Priority">
                            <option value="">-- Select --</option>
                            <option value="High" ${(deal.Priority || dbDeal.Priority) === 'High' ? 'selected' : ''}>High</option>
                            <option value="Medium" ${(deal.Priority || dbDeal.Priority) === 'Medium' ? 'selected' : ''}>Medium</option>
                            <option value="Low" ${(deal.Priority || dbDeal.Priority) === 'Low' ? 'selected' : ''}>Low</option>
                        </select>
                    </td>
                    <td><input type="text" class="deal-pipeline-field ${cityClass}" data-field="City" value="${(deal.City || '').replace(/"/g, '&quot;')}" ${cityReadonly ? 'readonly' : ''} title="${cityTitle}" /></td>
                    <td><input type="text" class="deal-pipeline-field ${stateClass}" data-field="State" value="${(deal.State || '').replace(/"/g, '&quot;').toUpperCase()}" maxlength="2" pattern="[A-Z]{2}" placeholder="e.g., CA, TX" ${stateReadonly ? 'readonly' : ''} title="${stateTitle}" /></td>
                    <td>
                        <select class="deal-pipeline-field ${regionClass}" data-field="Region" ${regionReadonly ? 'disabled' : ''} title="${regionTitle}">
                            <option value="">-- Select --</option>
                            ${regions.map(r => `<option value="${r.RegionName || ''}" ${deal.Region === r.RegionName ? 'selected' : ''}>${r.RegionName || ''}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="number" step="any" class="deal-pipeline-field ${latitudeClass}" data-field="Latitude" value="${deal.Latitude != null && deal.Latitude !== '' ? Number(deal.Latitude) : ''}" ${latitudeReadonly ? 'readonly' : ''} title="${latitudeTitle}" placeholder="e.g. 30.45" style="min-width: 100px;" /></td>
                    <td><input type="number" step="any" class="deal-pipeline-field ${longitudeClass}" data-field="Longitude" value="${deal.Longitude != null && deal.Longitude !== '' ? Number(deal.Longitude) : ''}" ${longitudeReadonly ? 'readonly' : ''} title="${longitudeTitle}" placeholder="e.g. -90.12" style="min-width: 100px;" /></td>
                    <td>
                        <select class="deal-pipeline-field" data-field="ProductType">
                            <option value="">-- Select --</option>
                            ${productTypes.map(pt => `<option value="${pt.ProductTypeName || ''}" ${deal.ProductType === pt.ProductTypeName ? 'selected' : ''}>${pt.ProductTypeName || ''}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="text" class="deal-pipeline-field external-source-field" data-field="Bank" data-source="Banking Dashboard" value="${(bankName || '').replace(/"/g, '&quot;')}" readonly style="background-color: #f5f5f5; cursor: not-allowed;" title="Read-only: Bank information is managed in the Banking Dashboard. Edit bank details there to update this field." /></td>
                    <td><input type="date" class="deal-pipeline-field ${startDateClass}" data-field="StartDate" value="${formatDateInput(deal['Start Date'] || deal.StartDate || dbDeal.StartDate || dbDeal.EstimatedConstructionStartDate)}" ${startDateReadonly ? 'readonly' : ''} title="${startDateTitle}" /></td>
                    <td><input type="number" class="deal-pipeline-field ${unitCountClass}" data-field="UnitCount" value="${deal['Unit Count'] || deal.UnitCount || dbDeal.UnitCount || ''}" ${unitCountReadonly ? 'readonly' : ''} title="${unitCountTitle}" /></td>
                    <td>
                        <div class="searchable-select-wrapper" data-field="PreConManagerId">
                            <input type="text" 
                                   class="searchable-select-input deal-pipeline-field" 
                                   data-field="PreConManagerId" 
                                   data-precon-manager-id="${deal.PreConManagerId || ''}"
                                   value="${(() => {
                                       // Try to find manager by PreConManagerId
                                       const managerId = deal.PreConManagerId || dbDeal.PreConManagerId;
                                       if (managerId) {
                                           const manager = preConManagers.find(m => m.PreConManagerId === managerId || m.PreConManagerId === parseInt(managerId));
                                           if (manager) {
                                               return manager.ManagerName || manager.FullName || '';
                                           }
                                       }
                                       // Fallback to Pre-Con field if manager not found by ID
                                       return deal['Pre-Con'] || dbDeal.PreConManagerName || '';
                                   })()}"
                                   placeholder="Search or type to create new..."
                                   autocomplete="off" />
                            <div class="searchable-select-dropdown" style="display: none;">
                                <div class="searchable-select-options"></div>
                            </div>
                        </div>
                    </td>
                    <td><input type="number" step="0.01" class="deal-pipeline-field" data-field="Acreage" value="${deal.Acreage || ''}" style="min-width: 120px;" /></td>
                    <td>
                        <div style="position: relative; display: flex; align-items: center;">
                            <span style="position: absolute; left: 8px; color: #666; font-weight: 500;">$</span>
                            <input type="number" step="0.01" class="deal-pipeline-field" data-field="LandPrice" value="${deal.LandPrice || ''}" style="padding-left: 24px; min-width: 180px;" />
                        </div>
                    </td>
                    <td><input type="text" class="deal-pipeline-field auto-calculated-field" data-field="SqFtPrice" data-source="Auto-calculated" value="${deal.SqFtPrice || ''}" readonly style="background-color: #f5f5f5; cursor: not-allowed;" title="Read-only: Auto-calculated from Land Price and Acreage. Update those fields to recalculate." /></td>
                    <td><input type="date" class="deal-pipeline-field" data-field="ExecutionDate" value="${formatDateInput(deal.ExecutionDate)}" /></td>
                    <td><input type="date" class="deal-pipeline-field" data-field="DueDiligenceDate" value="${formatDateInput(deal.DueDiligenceDate)}" /></td>
                    <td><input type="date" class="deal-pipeline-field" data-field="ClosingDate" value="${formatDateInput(deal.ClosingDate)}" /></td>
                    <td><input type="date" class="deal-pipeline-field" data-field="ConstructionLoanClosingDate" value="${formatDateInput(deal.ConstructionLoanClosingDate)}" /></td>
                    <td><input type="text" class="deal-pipeline-field" data-field="PurchasingEntity" value="${(deal.PurchasingEntity || '').replace(/"/g, '&quot;')}" /></td>
                    <td><input type="checkbox" class="deal-pipeline-field" data-field="Cash" ${deal.Cash ? 'checked' : ''} /></td>
                    <td><input type="checkbox" class="deal-pipeline-field" data-field="OpportunityZone" ${deal.OpportunityZone ? 'checked' : ''} /></td>
                    <td>
                        <div class="searchable-select-wrapper" data-field="BrokerReferralContactId">
                            <input type="text" class="searchable-select-input deal-pipeline-field broker-referral-input" data-field="BrokerReferralContactId" data-broker-referral-id="${deal.BrokerReferralContactId || ''}" value="${(deal.BrokerReferralName || '').replace(/"/g, '&quot;')}" placeholder="Search or add contact..." autocomplete="off" style="min-width: 140px;" />
                            <div class="searchable-select-dropdown" style="display: none;"><div class="searchable-select-options"></div></div>
                        </div>
                    </td>
                    <td><input type="text" class="deal-pipeline-field" data-field="PriceRaw" value="${(deal.PriceRaw || '').replace(/"/g, '&quot;')}" placeholder="e.g. -, TBD" style="min-width: 80px;" /></td>
                    <td>
                        <select class="deal-pipeline-field" data-field="ListingStatus">
                            <option value="">--</option>
                            <option value="Listed" ${(deal.ListingStatus || '') === 'Listed' ? 'selected' : ''}>Listed</option>
                            <option value="Unlisted" ${(deal.ListingStatus || '') === 'Unlisted' ? 'selected' : ''}>Unlisted</option>
                        </select>
                    </td>
                    <td><input type="text" class="deal-pipeline-field" data-field="Zoning" value="${(deal.Zoning || '').replace(/"/g, '&quot;')}" placeholder="e.g. CH" style="min-width: 80px;" /></td>
                    <td><input type="text" class="deal-pipeline-field" data-field="County" value="${(deal.CountyParish || deal.County || '').replace(/"/g, '&quot;')}" placeholder="County/Parish" style="min-width: 100px;" title="County or Parish" /></td>
                    <td><textarea class="deal-pipeline-field" data-field="Notes" rows="4" style="min-width: 300px; width: 100%;">${(deal.Notes || deal.ClosingNotes || '').replace(/"/g, '&quot;')}</textarea></td>
                    <td class="deal-pipeline-actions">
                        ${dealId ? `<button type="button" class="edit-form-btn" data-deal-id="${dealId}" title="Open full edit form for all fields">Edit</button>` : ''}
                        <button class="save-btn" onclick="saveDealPipelineRow(event, '${dealId || 'new'}', '${projectId || ''}')" title="Save changes to this deal">Save</button>
                        ${dealId ? `<button class="delete-btn" onclick="deleteDealPipelineRow('${dealId}')" title="Delete this deal (cannot be undone)">Delete</button>` : ''}
                    </td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Setup synchronized scrolling between top and bottom scrollbars
        const scrollContainer = document.getElementById('deal-pipeline-table-scroll-container');
        const scrollbarTop = document.getElementById('deal-pipeline-scrollbar-top');
        
        if (scrollContainer && scrollbarTop) {
            // Create a dummy div for the top scrollbar
            const table = scrollContainer.querySelector('.deal-pipeline-table');
            if (table) {
                // Set the top scrollbar width to match the table width
                const tableWidth = table.offsetWidth;
                scrollbarTop.style.width = '100%';
                scrollbarTop.style.overflowX = 'auto';
                scrollbarTop.style.overflowY = 'hidden';
                scrollbarTop.style.height = '17px'; // Standard scrollbar height
                scrollbarTop.style.marginBottom = '0';
                
                // Create a dummy div inside the top scrollbar to match table width
                const dummyDiv = document.createElement('div');
                dummyDiv.style.width = tableWidth + 'px';
                dummyDiv.style.height = '1px';
                scrollbarTop.innerHTML = '';
                scrollbarTop.appendChild(dummyDiv);
                
                // Sync scrolling: when bottom scrolls, top scrolls
                scrollContainer.addEventListener('scroll', () => {
                    scrollbarTop.scrollLeft = scrollContainer.scrollLeft;
                });
                
                // Sync scrolling: when top scrolls, bottom scrolls
                scrollbarTop.addEventListener('scroll', () => {
                    scrollContainer.scrollLeft = scrollbarTop.scrollLeft;
                });
                
                // Update dummy div width when window resizes
                const resizeObserver = new ResizeObserver(() => {
                    const newWidth = table.offsetWidth;
                    dummyDiv.style.width = newWidth + 'px';
                });
                resizeObserver.observe(table);
            }
        }
        
        // Update count (after stage filter/sort; search filter updates count when user types)
        const countEl = document.getElementById('deal-pipeline-count');
        if (countEl) {
            countEl.textContent = `${dealsToRender.length} ${dealsToRender.length === 1 ? 'deal' : 'deals'}`;
        }
        
        // Bind change listeners to track changes
        bindDealPipelineFieldListeners();
        
        // Edit button: open full edit modal (user-friendly form view)
        container.querySelectorAll('.edit-form-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const id = this.getAttribute('data-deal-id');
                const d = window._dealPipelineDealsForEdit && window._dealPipelineDealsForEdit[id];
                if (d && typeof window.openDealEditModal === 'function') {
                    window.openDealEditModal(d);
                }
            });
        });
        
        // Initialize searchable selects for Pre-Con Manager and Broker/Referral
        initializeSearchableSelects(preConManagers);
        initializeBrokerReferralSelects();
        
        // Update Save All button visibility after table renders
        updateSaveAllButtonVisibility();
        
        // Re-apply search filter if user had typed something (updates count and row visibility)
        const searchInput = document.getElementById('deal-pipeline-search');
        if (searchInput && searchInput.value.trim()) filterDealPipelineTable(searchInput.value);
        
    } catch (error) {
        console.error('Error rendering deal pipeline table:', error);
        container.innerHTML = `<div class="error">Failed to load deals: ${error.message}</div>`;
    }
}

function bindDealPipelineFieldListeners() {
    document.querySelectorAll('.deal-pipeline-field').forEach(field => {
        // Store original value for readonly Procore fields
        const originalValue = field.value;
        const isReadonly = field.hasAttribute('readonly') || field.hasAttribute('disabled');
        const isProcoreField = field.classList.contains('external-source-field');
        const fieldName = field.dataset.field;
        
        // Check if this is a Procore-synced field (City, State, Region, Latitude, Longitude, StartDate, UnitCount)
        const isProcoreSyncedField = (fieldName === 'City' || fieldName === 'State' || fieldName === 'Region' || 
                                      fieldName === 'Latitude' || fieldName === 'Longitude' ||
                                      fieldName === 'StartDate' || fieldName === 'UnitCount') && isProcoreField;
        
        // Prevent editing of readonly Procore fields
        // Check if field should be readonly: has readonly attribute AND external-source-field class,
        // OR is a Procore-synced field (City, State, Region, StartDate, UnitCount) with external-source-field class
        if ((isReadonly && isProcoreField) || isProcoreSyncedField) {
            // Store the original value to restore if changed
            let storedValue = originalValue;
            
            // Also set readonly attribute if not already set (for extra protection)
            if (!field.hasAttribute('readonly') && fieldName !== 'Region') {
                field.setAttribute('readonly', 'readonly');
            }
            if (fieldName === 'Region' && !field.hasAttribute('disabled')) {
                field.setAttribute('disabled', 'disabled');
            }
            
            // Prevent input changes and restore original value
            field.addEventListener('input', function(e) {
                if (e.target.value !== storedValue) {
                    e.target.value = storedValue;
                    // Show a brief visual indicator
                    e.target.style.backgroundColor = '#ffebee';
                    setTimeout(() => {
                        e.target.style.backgroundColor = '';
                    }, 500);
                }
            }, { passive: false });
            
            // Prevent change events and restore original value
            field.addEventListener('change', function(e) {
                if (e.target.value !== storedValue) {
                    e.target.value = storedValue;
                }
            }, { passive: false });
            
            // Prevent keydown for readonly fields (except Tab and Escape)
            field.addEventListener('keydown', function(e) {
                if (e.key !== 'Tab' && e.key !== 'Escape' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Show a brief visual indicator
                    e.target.style.backgroundColor = '#ffebee';
                    setTimeout(() => {
                        e.target.style.backgroundColor = '';
                    }, 500);
                }
            }, { passive: false });
            
            // Prevent paste
            field.addEventListener('paste', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.target.value = storedValue;
            }, { passive: false });
            
            // Skip adding other listeners for readonly fields
            return;
        }
        
        field.addEventListener('change', function() {
            const row = this.closest('tr');
            if (row) {
                row.classList.add('has-changes');
                updateSaveAllButtonVisibility();
                
                // Auto-calculate SqFtPrice if LandPrice or Acreage changes
                if (this.dataset.field === 'LandPrice' || this.dataset.field === 'Acreage') {
                    const landPrice = parseFloat(row.querySelector('[data-field="LandPrice"]')?.value || 0);
                    const acreage = parseFloat(row.querySelector('[data-field="Acreage"]')?.value || 0);
                    const sqFtPriceField = row.querySelector('[data-field="SqFtPrice"]');
                    if (sqFtPriceField && acreage > 0) {
                        const sqFtPrice = (landPrice / (acreage * 43560)).toFixed(2);
                        sqFtPriceField.value = sqFtPrice;
                    }
                }
            }
        });
        
        // Auto-uppercase State field and validate on input
        if (field.dataset.field === 'State' && !field.hasAttribute('readonly')) {
            field.addEventListener('input', function(e) {
                // Remove any non-letter characters and convert to uppercase
                let value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
                // Limit to 2 characters
                if (value.length > 2) {
                    value = value.substring(0, 2);
                }
                e.target.value = value;
                
                // Mark row as changed
                const row = e.target.closest('tr');
                if (row) {
                    row.classList.add('has-changes');
                    updateSaveAllButtonVisibility();
                }
            });
            
            // Validate on blur
            field.addEventListener('blur', function(e) {
                const value = e.target.value.trim().toUpperCase();
                if (value && value.length !== 2) {
                    // Show warning but don't block (user might be typing)
                    if (value.length > 0 && value.length < 2) {
                        e.target.style.borderColor = '#ff9800';
                        setTimeout(() => {
                            e.target.style.borderColor = '';
                        }, 2000);
                    }
                } else if (value.length === 2) {
                    e.target.value = value;
                    e.target.style.borderColor = '';
                }
            });
        }
    });
}

// Update Save All button visibility based on changed rows
function updateSaveAllButtonVisibility() {
    const saveAllBtn = document.getElementById('save-all-deals-btn');
    if (!saveAllBtn) return;
    
    // Make sure we're looking in the right table
    const dealPipelineTable = document.querySelector('.deal-pipeline-table');
    if (!dealPipelineTable) return;
    
    const changedRows = dealPipelineTable.querySelectorAll('tr.has-changes');
    
    if (changedRows.length > 0) {
        saveAllBtn.style.display = 'inline-flex';
        saveAllBtn.innerHTML = `<span class="save-icon">Save</span> All Changes (${changedRows.length})`;
    } else {
        saveAllBtn.style.display = 'none';
    }
}

// Save all modified deal pipeline rows
async function saveAllDealPipelineRows() {
    if (!isAuthenticated || !isEditMode) {
        showToast('You must be logged in and in edit mode to save changes.', 'info');
        return;
    }
    
    const changedRows = document.querySelectorAll('.deal-pipeline-table tr.has-changes');
    if (changedRows.length === 0) {
        showToast('No changes to save.', 'info');
        return;
    }
    
    const confirmMessage = `Are you sure you want to save changes to ${changedRows.length} deal${changedRows.length !== 1 ? 's' : ''}?`;
    const saveConfirmed = await domoConfirm(confirmMessage, { confirmLabel: 'Save' });
    if (!saveConfirmed) {
        return;
    }
    
    const saveAllBtn = document.getElementById('save-all-deals-btn');
    const originalHTML = saveAllBtn.innerHTML;
    saveAllBtn.disabled = true;
    saveAllBtn.innerHTML = '<span class="loading-spinner-small"></span> Saving...';
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // Save each row sequentially
    for (let i = 0; i < changedRows.length; i++) {
        const row = changedRows[i];
        const dealId = row.dataset.dealId || 'new';
        const projectId = row.dataset.projectId || null;
        
        try {
            // Use the existing saveDealPipelineRow logic but without alerts
            const fields = row.querySelectorAll('.deal-pipeline-field');
            const data = {};
            
            // Validate required fields
            const projectNameField = row.querySelector('[data-field="ProjectName"]');
            if (!projectNameField || !projectNameField.value.trim()) {
                errors.push(`Row ${i + 1}: Project Name is required.`);
                errorCount++;
                continue;
            }
            
            // Check if this project has Procore data
            const rowProjectId = row.dataset.projectId;
            const procoreMatch = rowProjectId ? window.PROCORE_MATCHES?.get(parseInt(rowProjectId)) : null;
            const hasProcore = procoreMatch && procoreMatch.hasProcore;
            
            fields.forEach(field => {
                const fieldName = field.dataset.field;
                if (!fieldName) return;
                
                // Skip Bank field
                if (fieldName === 'Bank') return;
                
                // Skip Procore fields if this project has Procore data
                if (hasProcore) {
                    if (fieldName === 'City' && procoreMatch.city) return;
                    if (fieldName === 'State' && procoreMatch.state) return;
                    if (fieldName === 'Region' && procoreMatch.region) return;
                    if (fieldName === 'Latitude' && (procoreMatch.latitude != null && procoreMatch.latitude !== '')) return;
                    if (fieldName === 'Longitude' && (procoreMatch.longitude != null && procoreMatch.longitude !== '')) return;
                    if (fieldName === 'StartDate' && procoreMatch.actualStartDate && isProcoreStartDateOverride(procoreMatch.actualStartDate)) return;
                    if (fieldName === 'UnitCount' && procoreMatch.unitCount) return;
                }
                
                // Handle searchable select for PreConManagerId
                if (fieldName === 'PreConManagerId' && field.classList.contains('searchable-select-input')) {
                    const managerId = field.dataset.preconManagerId;
                    if (managerId) {
                        data[fieldName] = parseInt(managerId);
                    }
                    return;
                }
                
                // Handle searchable select for BrokerReferralContactId
                if (fieldName === 'BrokerReferralContactId' && field.classList.contains('broker-referral-input')) {
                    const contactId = field.dataset.brokerReferralId || field.getAttribute('data-broker-referral-id');
                    if (contactId) {
                        const parsedId = parseInt(contactId);
                        if (!isNaN(parsedId) && parsedId > 0) data[fieldName] = parsedId;
                    } else if (!field.value.trim()) {
                        data[fieldName] = null;
                    }
                    return;
                }
                
                if (field.type === 'checkbox') {
                    data[fieldName] = field.checked;
                } else if (field.type === 'number') {
                    const value = field.value;
                    if (value !== '') {
                        data[fieldName] = parseFloat(value);
                    }
                } else if (field.type === 'date') {
                    if (field.value) {
                        data[fieldName] = field.value;
                    }
                } else {
                    let value = field.value.trim();
                    if (value !== '') {
                        // Special handling for State field
                        if (fieldName === 'State') {
                            value = value.replace(/[^A-Za-z]/g, '').toUpperCase();
                            if (value.length !== 2) {
                                errors.push(`Row ${i + 1}: State must be exactly 2 letters.`);
                                errorCount++;
                                return;
                            }
                        }
                        data[fieldName] = value;
                    }
                }
            });
            
            // Save the deal
            const isNewDeal = !dealId || dealId === 'new' || dealId === '';
            let result;
            if (isNewDeal) {
                // For new deals, create Project first (which auto-generates ProjectId)
                // Then use that ProjectId to create the DealPipeline
                
                // Separate Project fields from DealPipeline fields
                const projectData = {
                    ProjectName: data.ProjectName,
                    City: data.City || null,
                    State: data.State || null,
                    Region: data.Region || null,
                    Units: data.UnitCount || data.Units || null,
                    ProductType: data.ProductType || null,
                    Stage: data.Stage || 'Prospective',
                    EstimatedConstructionStartDate: data.StartDate || data.EstimatedConstructionStartDate || null
                };
                
                // Remove Project fields from DealPipeline data (they'll be in the Project)
                const dealPipelineData = { ...data };
                delete dealPipelineData.ProjectName;
                delete dealPipelineData.City;
                delete dealPipelineData.State;
                delete dealPipelineData.Region;
                delete dealPipelineData.Units;
                delete dealPipelineData.ProductType;
                delete dealPipelineData.Stage;
                delete dealPipelineData.EstimatedConstructionStartDate;
                
                // Create Project first
                const projectResult = await API.createProject(projectData);
                if (!projectResult.success) {
                    throw new Error(projectResult.error?.message || 'Failed to create project');
                }
                
                const newProjectId = projectResult.data.ProjectId;
                if (!newProjectId) {
                    throw new Error('Project was created but ProjectId was not returned');
                }
                
                // Now create DealPipeline with the ProjectId
                dealPipelineData.ProjectId = newProjectId;
                result = await API.createDealPipeline(dealPipelineData);
            } else {
                result = await API.updateDealPipeline(parseInt(dealId), data);
            }
            
            if (result.success) {
                successCount++;
                // Remove has-changes class
                row.classList.remove('has-changes');
                // Update row data attributes if it was a new deal
                if (isNewDeal && result.data) {
                    row.dataset.dealId = result.data.DealPipelineId || '';
                    row.dataset.projectId = result.data.ProjectId || '';
                }
            } else {
                errors.push(`Row ${i + 1}: ${result.error?.message || 'Failed to save'}`);
                errorCount++;
            }
        } catch (error) {
            errors.push(`Row ${i + 1}: ${error.message}`);
            errorCount++;
        }
    }
    
    // Update button state
    saveAllBtn.disabled = false;
    updateSaveAllButtonVisibility();
    
    // Show results
    if (errorCount === 0) {
        showToast(`Successfully saved ${successCount} deal${successCount !== 1 ? 's' : ''}!`, 'success');
        
        // Refresh data from database
        // Refresh the deal pipeline table (use API for instant fresh data after save)
        await renderDealPipelineTable({ forceApi: true });
        
        // Also refresh the main allDeals array for other views
        try {
            const refreshResponse = await API.getAllDealPipelines({ forceApi: true });
            if (refreshResponse.success) {
                const dbDeals = refreshResponse.data || [];
                
                // Fetch loans and banks for bank name mapping
                let loansMap = {};
                let banksMap = {};
                
                try {
                    const loansResponse = await API.getAllLoans();
                    if (loansResponse.success && loansResponse.data) {
                        loansResponse.data.forEach(loan => {
                            if (loan.ProjectId) {
                                if (!loansMap[loan.ProjectId]) {
                                    loansMap[loan.ProjectId] = [];
                                }
                                loansMap[loan.ProjectId].push(loan);
                            }
                        });
                    }
                } catch (error) {
                    console.warn('Failed to refresh loans:', error);
                }
                
                try {
                    const banksResponse = await API.getAllBanks();
                    if (banksResponse.success && banksResponse.data) {
                        banksResponse.data.forEach(bank => {
                            if (bank.BankId) {
                                banksMap[bank.BankId] = bank;
                            }
                        });
                    }
                } catch (error) {
                    console.warn('Failed to refresh banks:', error);
                }
                
                // Map and filter deals (exclude HoldCo and START)
                allDeals = dbDeals
                    .map(deal => mapDealPipelineDataToDeal(deal, loansMap, banksMap))
                    .filter(deal => deal !== null)
                    .filter(deal => {
                        const stage = normalizeStage(deal.Stage || deal.stage);
                        return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
                    });
                
                // Update global reference
                window.allDeals = allDeals;
                
                // Rebuild bank name mapping
                buildBankNameMap(allDeals);
                
                console.log(`Refreshed allDeals: ${allDeals.length} deals loaded from database`);
            }
        } catch (error) {
            console.warn('Failed to refresh main allDeals array:', error);
            // Still refresh the table even if main refresh fails
        }
    } else {
        const errorMsg = `Saved ${successCount} deal${successCount !== 1 ? 's' : ''}, but ${errorCount} error${errorCount !== 1 ? 's' : ''} occurred: ${errors.join('; ')}`;
        showToast(errorMsg, 'error');
        // Still refresh even if there were some errors
        await renderDealPipelineTable({ forceApi: true });
    }
}

// Make saveAllDealPipelineRows globally accessible
window.saveAllDealPipelineRows = saveAllDealPipelineRows;

// Initialize searchable select dropdowns for Pre-Con Manager
