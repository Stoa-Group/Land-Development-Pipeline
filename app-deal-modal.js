/**
 * app-deal-modal.js — Deal edit modal: open, save, delete, rejection reason parsing
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function parseRejectionReasonFromNotes(notes) {
    if (!notes || typeof notes !== 'string') return '';
    const re = /Reject(?:ion|ed)\s+reason:\s*(?:\r?\n)?/i;
    const match = notes.match(re);
    if (!match) return '';
    const after = notes.slice(notes.indexOf(match[0]) + match[0].length);
    const trimmed = after.trimStart();
    const blankLine = trimmed.search(/\n\s*\n/);
    const reason = (blankLine >= 0 ? trimmed.slice(0, blankLine) : trimmed).trim();
    return reason;
}

// Make functions globally accessible for inline onclick handlers
window.openDealEditModal = async function(deal) {
    if (!isAuthenticated) {
        showToast('Please log in to edit deals.', 'info');
        return;
    }
    
    // Call the main openDealEditModal function
    const modal = document.getElementById('deal-edit-modal');
    const form = document.getElementById('deal-edit-form');
    const deleteBtn = document.getElementById('delete-deal-btn');
    const title = document.getElementById('deal-edit-title');
    
    if (!modal || !form) return;
    
    currentEditingDeal = deal;
    
    // Set title
    if (title) {
        title.textContent = deal.DealPipelineId ? 'Edit Deal' : 'Create New Deal';
    }
    
    // Show delete button only for existing deals
    if (deleteBtn) {
        deleteBtn.style.display = deal.DealPipelineId ? 'inline-block' : 'none';
    }
    
    // Load Pre-Con Managers for dropdown
    let preConManagers = [];
    try {
        const managersResponse = await API.getAllPreConManagers();
        if (managersResponse.success) {
            preConManagers = managersResponse.data || [];
        }
    } catch (error) {
        console.warn('Failed to load Pre-Con Managers:', error);
    }
    
    const preconManagerSelect = document.getElementById('edit-precon-manager');
    if (preconManagerSelect) {
        preconManagerSelect.innerHTML = '<option value="">Select...</option>' +
            preConManagers.map(m => `<option value="${m.PreConManagerId || ''}">${m.ManagerName || m.FullName || ''}</option>`).join('');
    }
    
    // Format date for input
    const formatDateInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };
    
    // Populate form with all fields
    const original = deal._original || deal;
    document.getElementById('edit-project-name').value = deal.Name || original.ProjectName || '';
    const stageVal = deal.Stage || original.Stage || 'Prospective';
    document.getElementById('edit-stage').value = stageVal;
    const rejectionWrap = document.getElementById('edit-rejection-reason-wrap');
    const rejectionInput = document.getElementById('edit-rejection-reason');
    if (rejectionWrap) rejectionWrap.style.display = stageVal === 'Rejected' ? 'block' : 'none';
    if (rejectionInput) {
        const notesForRejection = (deal.Notes || original.Notes || '').trim();
        rejectionInput.value = stageVal === 'Rejected' ? parseRejectionReasonFromNotes(notesForRejection) : '';
    }
    document.getElementById('edit-city').value = original.City || '';
    document.getElementById('edit-state').value = original.State || '';
    document.getElementById('edit-region').value = original.Region || '';
    const editLat = document.getElementById('edit-latitude');
    const editLng = document.getElementById('edit-longitude');
    if (editLat) editLat.value = original.Latitude != null ? String(original.Latitude) : (deal.Latitude != null ? String(deal.Latitude) : '');
    if (editLng) editLng.value = original.Longitude != null ? String(original.Longitude) : (deal.Longitude != null ? String(deal.Longitude) : '');
    document.getElementById('edit-unit-count').value = original.UnitCount || deal['Unit Count'] || original.Units || '';
    document.getElementById('edit-product-type').value = deal['Product Type'] || original.ProductType || '';
    const bankField = document.getElementById('edit-bank');
    if (bankField) {
        bankField.value = deal.Bank || original.Bank || '';
        bankField.readOnly = true;
        bankField.style.backgroundColor = '#f5f5f5';
        bankField.style.cursor = 'not-allowed';
        bankField.classList.add('external-source-field');
        bankField.setAttribute('data-source', 'Banking Dashboard');
        bankField.title = 'Read-only: Bank information is managed in the Banking Dashboard. Edit bank details there to update this field.';
    }
    document.getElementById('edit-start-date').value = formatDateInput(deal['Start Date'] || original.StartDate);
    document.getElementById('edit-priority').value = original.Priority || '';
    document.getElementById('edit-acreage').value = original.Acreage || '';
    document.getElementById('edit-land-price').value = original.LandPrice || '';
    const pricePerUnitField = document.getElementById('edit-price-per-unit');
    if (pricePerUnitField) {
        const lp = parseFloat(original.LandPrice || 0);
        const uc = parseInt(original.UnitCount || original.Units || 0, 10);
        pricePerUnitField.value = (lp > 0 && uc > 0) ? (lp / uc).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';
        pricePerUnitField.classList.add('auto-calculated-field');
        pricePerUnitField.setAttribute('data-source', 'Auto-calculated');
        pricePerUnitField.style.cursor = 'not-allowed';
        pricePerUnitField.title = 'Read-only: Auto-calculated from Land Price and Unit Count. Update those fields to recalculate.';
    }
    document.getElementById('edit-execution-date').value = formatDateInput(original.ExecutionDate);
    document.getElementById('edit-due-diligence-date').value = formatDateInput(original.DueDiligenceDate);
    document.getElementById('edit-closing-date').value = formatDateInput(original.ClosingDate);
    document.getElementById('edit-construction-loan-closing').value = formatDateInput(original.ConstructionLoanClosingDate);
    document.getElementById('edit-purchasing-entity').value = original.PurchasingEntity || '';
    document.getElementById('edit-cash').checked = original.Cash || false;
    document.getElementById('edit-opportunity-zone').checked = original.OpportunityZone || false;
    if (preconManagerSelect) {
        preconManagerSelect.value = original.PreConManagerId || '';
    }
    document.getElementById('edit-notes').value = deal.Notes || original.Notes || '';
    document.getElementById('edit-closing-notes').value = original.ClosingNotes || '';
    const editBrokerRef = document.getElementById('edit-broker-referral');
    const editBrokerRefId = document.getElementById('edit-broker-referral-id');
    if (editBrokerRef) editBrokerRef.value = deal.BrokerReferralName || original.BrokerReferralSource || '';
    if (editBrokerRefId) editBrokerRefId.value = original.BrokerReferralContactId || deal.BrokerReferralContactId || '';
    const editBrokerEmail = document.getElementById('edit-broker-email');
    const editBrokerPhone = document.getElementById('edit-broker-phone');
    if (editBrokerEmail) editBrokerEmail.value = '';
    if (editBrokerPhone) editBrokerPhone.value = '';
    const editPriceRaw = document.getElementById('edit-price-raw');
    if (editPriceRaw) editPriceRaw.value = deal.PriceRaw ?? original.PriceRaw ?? '';
    const editListingStatus = document.getElementById('edit-listing-status');
    if (editListingStatus) editListingStatus.value = deal.ListingStatus || original.ListingStatus || '';
    const editZoning = document.getElementById('edit-zoning');
    if (editZoning) editZoning.value = deal.Zoning || original.Zoning || '';
    const editCountyParish = document.getElementById('edit-county-parish');
    if (editCountyParish) editCountyParish.value = deal.CountyParish || original.County || '';
    
    // Auto-calculate Price Per Unit if LandPrice and UnitCount are present
    const landPrice = parseFloat(original.LandPrice || '');
    const unitCount = parseInt(original.UnitCount || original.Units || '', 10);
    const pricePerUnitEl = document.getElementById('edit-price-per-unit');
    if (pricePerUnitEl && landPrice > 0 && unitCount > 0) {
        pricePerUnitEl.value = (landPrice / unitCount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (pricePerUnitEl) {
        pricePerUnitEl.value = '';
    }
    
    // Add listeners for auto-calculation
    const unitCountField = document.getElementById('edit-unit-count');
    const landPriceField = document.getElementById('edit-land-price');
    if (unitCountField) {
        unitCountField.removeEventListener('input', calculatePricePerUnit);
        unitCountField.addEventListener('input', calculatePricePerUnit);
    }
    if (landPriceField) {
        landPriceField.removeEventListener('input', calculatePricePerUnit);
        landPriceField.addEventListener('input', calculatePricePerUnit);
    }
    
    // Show/hide rejection reason when stage is Rejected
    const editStageSelect = document.getElementById('edit-stage');
    const editRejectionWrap = document.getElementById('edit-rejection-reason-wrap');
    const editRejectionInput = document.getElementById('edit-rejection-reason');
    // Remove previous listener if stored, then add fresh one
    if (editStageSelect._toggleRejectionReason) {
        editStageSelect.removeEventListener('change', editStageSelect._toggleRejectionReason);
    }
    editStageSelect._toggleRejectionReason = function() {
        const isRejected = editStageSelect && editStageSelect.value === 'Rejected';
        if (editRejectionWrap) editRejectionWrap.style.display = isRejected ? 'block' : 'none';
        if (editRejectionInput && !isRejected) editRejectionInput.value = '';
    };
    editStageSelect.addEventListener('change', editStageSelect._toggleRejectionReason);
    
    modal.style.display = 'flex';
}

function calculatePricePerUnit() {
    const unitCount = parseInt(document.getElementById('edit-unit-count')?.value || 0, 10);
    const landPrice = parseFloat(document.getElementById('edit-land-price')?.value || 0);
    const pricePerUnitField = document.getElementById('edit-price-per-unit');
    
    if (pricePerUnitField && unitCount > 0 && landPrice > 0) {
        pricePerUnitField.value = (landPrice / unitCount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (pricePerUnitField) {
        pricePerUnitField.value = '';
    }
}

function closeDealEditModal() {
    var modal = document.getElementById('deal-edit-modal');
    if (!modal) return;
    modal.style.pointerEvents = 'none';
    modal.classList.add('modal-closing');
    setTimeout(function() {
        modal.style.display = 'none';
        modal.style.pointerEvents = '';
        modal.classList.remove('modal-closing');
        currentEditingDeal = null;
        var errDiv = document.getElementById('deal-edit-error');
        if (errDiv) errDiv.style.display = 'none';
    }, 180);
    var detailModal = document.querySelector('.deal-detail-modal');
    if (detailModal) {
        detailModal.style.pointerEvents = 'none';
        detailModal.classList.add('modal-closing');
        setTimeout(function() { detailModal.remove(); }, 180);
    }
}

async function handleDealSave(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('deal-edit-error');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    if (!isAuthenticated) {
        errorDiv.textContent = 'You must be logged in to save deals.';
        errorDiv.style.display = 'block';
        return;
    }
    
    const form = e.target;
    // Read project name from DOM by id so it's reliable (form['edit-project-name'] can be undefined when input has name="ProjectName")
    const projectNameEl = document.getElementById('edit-project-name');
    const projectName = (projectNameEl && projectNameEl.value) ? projectNameEl.value.trim() : '';
    if (!projectName) {
        errorDiv.textContent = 'Project Name is required.';
        errorDiv.style.display = 'block';
        if (projectNameEl) projectNameEl.focus();
        return;
    }
    const brokerNameInput = form['edit-broker-referral'];
    const brokerIdInput = form['edit-broker-referral-id'];
    if (brokerNameInput && brokerNameInput.value.trim() && (!brokerIdInput || !brokerIdInput.value)) {
        const name = brokerNameInput.value.trim();
        try {
            const listRes = await API.listBrokerReferralContacts(name);
            const contacts = listRes.data || [];
            let match = contacts.find(c => (c.Name || '').trim().toLowerCase() === name.toLowerCase());
            if (!match && contacts.length > 0) match = contacts.find(c => (c.Name || '').toLowerCase().includes(name.toLowerCase()));
            if (match && (match.BrokerReferralContactId || match.Id)) {
                const id = match.BrokerReferralContactId ?? match.Id;
                if (brokerIdInput) brokerIdInput.value = String(id);
            } else {
                const email = (form['edit-broker-email'] && form['edit-broker-email'].value) ? form['edit-broker-email'].value.trim() : undefined;
                const phone = (form['edit-broker-phone'] && form['edit-broker-phone'].value) ? form['edit-broker-phone'].value.trim() : undefined;
                const payload = { Name: name };
                if (email) payload.Email = email;
                if (phone) payload.Phone = phone;
                const createRes = await API.createBrokerReferralContact(payload);
                if (createRes.success && createRes.data && (createRes.data.BrokerReferralContactId || createRes.data.Id)) {
                    const id = createRes.data.BrokerReferralContactId ?? createRes.data.Id;
                    if (brokerIdInput) brokerIdInput.value = String(id);
                }
            }
        } catch (err) {
            console.warn('Broker/Referral resolve failed:', err);
        }
    }
    
    const stageVal = form['edit-stage'].value;
    let notesVal = form['edit-notes'].value.trim() || null;
    if (stageVal === 'Rejected') {
        const rejectionReasonEl = document.getElementById('edit-rejection-reason');
        const rejectionReason = rejectionReasonEl ? rejectionReasonEl.value.trim() : '';
        if (!rejectionReason) {
            errorDiv.textContent = 'Please enter a rejection reason when stage is Rejected.';
            errorDiv.style.display = 'block';
            if (rejectionReasonEl) rejectionReasonEl.focus();
            return;
        }
        const rejectionLine = 'Rejection reason: ' + rejectionReason;
        notesVal = notesVal ? (rejectionLine + '\n\n' + notesVal) : rejectionLine;
    }
    
    const formData = {
        ProjectName: projectName,
        Stage: stageVal,
        City: form['edit-city'].value.trim() || null,
        State: form['edit-state'].value.trim().toUpperCase() || null,
        Region: form['edit-region'].value.trim() || null,
        Latitude: form['edit-latitude'] && form['edit-latitude'].value ? parseFloat(form['edit-latitude'].value) : null,
        Longitude: form['edit-longitude'] && form['edit-longitude'].value ? parseFloat(form['edit-longitude'].value) : null,
        UnitCount: form['edit-unit-count'].value ? parseInt(form['edit-unit-count'].value) : null,
        ProductType: form['edit-product-type'].value || null,
        // Bank field is read-only, don't include it in updates
        // Bank: form['edit-bank'].value.trim() || null,
        StartDate: form['edit-start-date'].value || null,
        Priority: form['edit-priority'].value || null,
        Acreage: form['edit-acreage'].value ? parseFloat(form['edit-acreage'].value) : null,
        LandPrice: form['edit-land-price'].value ? parseFloat(form['edit-land-price'].value) : null,
        ExecutionDate: form['edit-execution-date'].value || null,
        DueDiligenceDate: form['edit-due-diligence-date'].value || null,
        ClosingDate: form['edit-closing-date'].value || null,
        ConstructionLoanClosingDate: form['edit-construction-loan-closing'].value || null,
        PurchasingEntity: form['edit-purchasing-entity'].value.trim() || null,
        Cash: form['edit-cash'].checked,
        OpportunityZone: form['edit-opportunity-zone'].checked,
        PreConManagerId: form['edit-precon-manager'].value ? parseInt(form['edit-precon-manager'].value) : null,
        Notes: notesVal,
        ClosingNotes: form['edit-closing-notes'].value.trim() || null,
        BrokerReferralContactId: form['edit-broker-referral-id'] && form['edit-broker-referral-id'].value ? parseInt(form['edit-broker-referral-id'].value) : null,
        PriceRaw: form['edit-price-raw'] && form['edit-price-raw'].value ? form['edit-price-raw'].value.trim() : null,
        ListingStatus: form['edit-listing-status'] && form['edit-listing-status'].value ? form['edit-listing-status'].value : null,
        Zoning: form['edit-zoning'] && form['edit-zoning'].value ? form['edit-zoning'].value.trim() : null,
        County: form['edit-county-parish'] && form['edit-county-parish'].value ? form['edit-county-parish'].value.trim() : null
    };
    
    // Remove empty fields (never remove ProjectName – backend may require it on update)
    Object.keys(formData).forEach(key => {
        if (key === 'ProjectName') return;
        if (formData[key] === '' || formData[key] === null) {
            delete formData[key];
        }
    });
    
    try {
        let result;
        const dealPipelineIdForUpdate = currentEditingDeal && (currentEditingDeal.DealPipelineId || (currentEditingDeal._original && currentEditingDeal._original.DealPipelineId));
        if (dealPipelineIdForUpdate) {
            // Update existing deal
            result = await API.updateDealPipeline(dealPipelineIdForUpdate, formData);
        } else {
            // Create new deal - need ProjectId
            if (!currentEditingDeal || !currentEditingDeal.ProjectId) {
                // Try to find or create project first
                const projectsResult = await API.getAllProjects();
                let projectId = null;
                
                if (projectsResult.success && projectsResult.data) {
                    const existingProject = projectsResult.data.find(p => 
                        p.ProjectName === formData.ProjectName
                    );
                    if (existingProject) {
                        projectId = existingProject.ProjectId;
                    }
                }
                
                if (!projectId) {
                    // Create new project
                    const newProject = await API.createProject({
                        ProjectName: formData.ProjectName,
                        City: formData.City,
                        State: formData.State,
                        Region: formData.Region,
                        Stage: formData.Stage || 'Prospective',
                        Units: formData.Units,
                        ProductType: formData.ProductType
                    });
                    if (newProject.success) {
                        projectId = newProject.data.ProjectId;
                    } else {
                        throw new Error('Failed to create project');
                    }
                }
                
                formData.ProjectId = projectId;
            } else {
                formData.ProjectId = currentEditingDeal.ProjectId;
            }
            
            result = await API.createDealPipeline(formData);
        }
        
        if (result.success) {
            closeDealEditModal();
            showToast('Deal saved successfully.', 'success');
            refreshDealsFromApi().catch(function(e) { console.warn('Background refresh after save:', e); });
        } else {
            throw new Error(result.error?.message || 'Failed to save deal');
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'Failed to save deal. Please try again.';
        errorDiv.style.display = 'block';
    }
}

async function handleDealDelete() {
    if (!isAuthenticated || !isEditMode) {
        showToast('You must be logged in and in edit mode to delete deals.', 'info');
        return;
    }
    
    if (!currentEditingDeal || !currentEditingDeal.DealPipelineId) {
        showToast('Cannot delete: Deal ID not found.', 'error');
        return;
    }
    
    const deleteConfirmed = await domoConfirm(`Are you sure you want to delete "${currentEditingDeal.Name}"? This action cannot be undone.`, { confirmLabel: 'Delete' });
    if (!deleteConfirmed) {
        return;
    }
    
    try {
        const result = await API.deleteDealPipeline(currentEditingDeal.DealPipelineId);
        if (result.success) {
            closeDealEditModal();
            await refreshDealsFromApi();
            showToast('Deal deleted.', 'success');
        } else {
            throw new Error(result.error?.message || 'Failed to delete deal');
        }
    } catch (error) {
        showToast(`Failed to delete deal: ${error.message || 'Unknown error'}`, 'error');
    }
}

// Add edit button to deal cards when in edit mode
function addEditButtonToDeal(dealElement, deal) {
    if (!isAuthenticated || !isEditMode) return;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'deal-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openDealEditModal(deal);
    };
    
    // Find a good place to insert the button (e.g., in the deal header or footer)
    const dealHeader = dealElement.querySelector('.deal-header') || dealElement.querySelector('.deal-name');
    if (dealHeader) {
        dealHeader.appendChild(editBtn);
    } else {
        // Fallback: prepend to the deal element
        dealElement.insertBefore(editBtn, dealElement.firstChild);
    }
}

// ============================================================
// DEAL PIPELINE VIEW FUNCTIONS
// ============================================================

