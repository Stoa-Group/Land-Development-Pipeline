/**
 * app-admin.js — Searchable selects, broker/manager modals, add/filter/save/delete rows, bank details
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

async function initializeSearchableSelects(preConManagers) {
    const selects = document.querySelectorAll('.searchable-select-wrapper[data-field="PreConManagerId"]');
    
    selects.forEach(wrapper => {
        const input = wrapper.querySelector('.searchable-select-input');
        const dropdown = wrapper.querySelector('.searchable-select-dropdown');
        const optionsContainer = wrapper.querySelector('.searchable-select-options');
        
        if (!input || !dropdown || !optionsContainer) return;
        
        // Always update the Pre-Con Managers list (even if already initialized)
        // This ensures fresh data after table refresh or manager creation
        wrapper._preConManagers = preConManagers || [];
        
        // If already initialized, just update the options and return
        if (wrapper._initialized) {
            updateSearchableSelectOptions(wrapper, input.value);
            return;
        }
        
        // Mark as initialized and set up event listeners
        wrapper._initialized = true;
        
        // Populate initial options
        updateSearchableSelectOptions(wrapper, '');
        
        // Handle input focus
        input.addEventListener('focus', () => {
            dropdown.style.display = 'block';
            updateSearchableSelectOptions(wrapper, input.value);
        });
        
        // Handle input typing
        input.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            updateSearchableSelectOptions(wrapper, searchTerm);
            dropdown.style.display = 'block';
            
            // Mark row as changed
            const row = input.closest('tr');
            if (row) {
                row.classList.add('has-changes');
            }
        });
        
        // Handle clicking outside to close
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        // Handle option selection
        optionsContainer.addEventListener('click', async (e) => {
            const option = e.target.closest('.searchable-select-option');
            if (!option) return;
            
            const action = option.dataset.action;
            
            if (action === 'create') {
                // Show modal to create new Pre-Con Manager
                const managerName = input.value.trim();
                showPreConManagerModal(managerName, input, wrapper, dropdown);
            } else if (action === 'select') {
                // Select existing Pre-Con Manager
                // Try both dataset and getAttribute to ensure we get the ID
                let managerId = option.dataset.preconManagerId || option.getAttribute('data-precon-manager-id');
                const managerName = option.textContent.trim();
                
                if (!managerId) {
                    // Last resort: try to find by name from the managers list
                    const wrapper = input.closest('.searchable-select-wrapper');
                    if (wrapper && wrapper._preConManagers) {
                        const matchingManager = wrapper._preConManagers.find(m => {
                            const mName = (m.ManagerName || m.FullName || '').trim();
                            return mName === managerName || mName.toLowerCase() === managerName.toLowerCase();
                        });
                        if (matchingManager && matchingManager.PreConManagerId) {
                            managerId = matchingManager.PreConManagerId;
                        }
                    }
                    
                    if (!managerId) {
                        showToast('Error: Could not find Pre-Con Manager ID. Please try selecting again or refresh the page.', 'error');
                        return;
                    }
                }
                
                input.value = managerName;
                // Set both camelCase (for dataset) and kebab-case (for HTML attribute)
                // Ensure it's a string for consistency
                const managerIdStr = String(managerId);
                input.dataset.preconManagerId = managerIdStr;
                input.setAttribute('data-precon-manager-id', managerIdStr);
                
                dropdown.style.display = 'none';
                
                // Mark row as changed
                const row = input.closest('tr');
                if (row) {
                    row.classList.add('has-changes');
                }
            }
        });
    });
}

function updateSearchableSelectOptions(wrapper, searchTerm) {
    const input = wrapper.querySelector('.searchable-select-input');
    const optionsContainer = wrapper.querySelector('.searchable-select-options');
    const preConManagers = wrapper._preConManagers || [];
    
    if (!optionsContainer) return;
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Filter managers - check both ManagerName and FullName, and allow partial matches
    const filtered = preConManagers.filter(m => {
        const managerName = (m.ManagerName || m.FullName || '').toLowerCase();
        const fullName = (m.FullName || m.ManagerName || '').toLowerCase();
        // Check if search term matches either name (partial match)
        return managerName.includes(searchLower) || fullName.includes(searchLower);
    });
    
    let html = '';
    
    if (filtered.length > 0) {
        filtered.forEach(manager => {
            const displayName = manager.ManagerName || manager.FullName || '';
            html += `<div class="searchable-select-option" data-action="select" data-precon-manager-id="${manager.PreConManagerId}">${displayName}</div>`;
        });
    }
    
    // Show "Create new" option if search term doesn't match exactly
    if (searchTerm.trim() && !preConManagers.some(m => {
        const managerName = (m.ManagerName || m.FullName || '').toLowerCase();
        const fullName = (m.FullName || m.ManagerName || '').toLowerCase();
        return managerName === searchLower || fullName === searchLower;
    })) {
        html += `<div class="searchable-select-option create-new" data-action="create">
            <strong>Create new:</strong> "${searchTerm}"
        </div>`;
    }
    
    if (html === '') {
        html = '<div class="searchable-select-option no-results">No results found. Type to create new.</div>';
    }
    
    optionsContainer.innerHTML = html;
}

function updateAllSearchableSelects(newManager) {
    document.querySelectorAll('.searchable-select-wrapper[data-field="PreConManagerId"]').forEach(wrapper => {
        if (!wrapper._preConManagers) {
            wrapper._preConManagers = [];
        }
        // Check if manager already exists
        if (!wrapper._preConManagers.find(m => m.PreConManagerId === newManager.PreConManagerId)) {
            wrapper._preConManagers.push(newManager);
        }
    });
}

// Initialize Broker/Referral contact searchable selects (search + create new)
function initializeBrokerReferralSelects() {
    const wrappers = document.querySelectorAll('.searchable-select-wrapper[data-field="BrokerReferralContactId"]');
    wrappers.forEach(wrapper => {
        const input = wrapper.querySelector('.broker-referral-input');
        const dropdown = wrapper.querySelector('.searchable-select-dropdown');
        const optionsContainer = wrapper.querySelector('.searchable-select-options');
        if (!input || !dropdown || !optionsContainer) return;
        if (wrapper._brokerReferralInitialized) return;
        wrapper._brokerReferralInitialized = true;
        
        async function updateBrokerOptions(query) {
            const q = (query || '').trim();
            let html = '';
            try {
                const res = await API.listBrokerReferralContacts(q || undefined);
                const contacts = res.data || [];
                const searchLower = q.toLowerCase();
                const filtered = q ? contacts.filter(c => (c.Name || '').toLowerCase().includes(searchLower)) : contacts;
                filtered.forEach(c => {
                    const name = c.Name || '';
                    const id = c.BrokerReferralContactId ?? c.Id;
                    html += `<div class="searchable-select-option" data-action="select" data-broker-referral-id="${id}">${name.replace(/</g, '&lt;')}</div>`;
                });
                if (q && !contacts.some(c => (c.Name || '').trim().toLowerCase() === searchLower)) {
                    html += `<div class="searchable-select-option create-new" data-action="create-broker">Add new: "${(q || '').replace(/</g, '&lt;')}"</div>`;
                }
            } catch (_) {
                if (q) html += `<div class="searchable-select-option create-new" data-action="create-broker">Add new: "${(q || '').replace(/</g, '&lt;')}"</div>`;
            }
            if (!html) html = '<div class="searchable-select-option no-results">Type to search or add new contact.</div>';
            optionsContainer.innerHTML = html;
        }
        
        input.addEventListener('focus', () => { dropdown.style.display = 'block'; updateBrokerOptions(input.value); });
        input.addEventListener('input', () => { updateBrokerOptions(input.value); dropdown.style.display = 'block'; const row = input.closest('tr'); if (row) row.classList.add('has-changes'); });
        document.addEventListener('click', e => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; });
        
        optionsContainer.addEventListener('click', async e => {
            const option = e.target.closest('.searchable-select-option');
            if (!option) return;
            const action = option.dataset.action;
            if (action === 'create-broker') {
                const name = input.value.trim();
                if (!name) return;
                showBrokerReferralModal(name, input, dropdown);
                return;
            }
            if (action === 'select') {
                const id = option.dataset.brokerReferralId;
                const name = option.textContent.trim();
                input.value = name;
                input.dataset.brokerReferralId = id || '';
                input.setAttribute('data-broker-referral-id', id || '');
                dropdown.style.display = 'none';
                const row = input.closest('tr'); if (row) row.classList.add('has-changes');
            }
        });
    });
}

// Show Broker/Referral creation modal (for pipeline table "Add new" flow)
function showBrokerReferralModal(prepopulatedName, inputElement, dropdownElement) {
    const modal = document.getElementById('broker-referral-modal');
    const form = document.getElementById('broker-referral-form');
    const nameInput = document.getElementById('broker-referral-name');
    const emailInput = document.getElementById('broker-referral-email');
    const phoneInput = document.getElementById('broker-referral-phone');
    if (!modal || !form || !nameInput) return;
    modal._inputElement = inputElement;
    modal._dropdownElement = dropdownElement;
    nameInput.value = prepopulatedName || '';
    if (emailInput) emailInput.value = '';
    if (phoneInput) phoneInput.value = '';
    modal.style.display = 'flex';
    setTimeout(() => emailInput ? emailInput.focus() : nameInput.focus(), 100);
}

// Initialize Broker/Referral modal event listeners
function initBrokerReferralModal() {
    const modal = document.getElementById('broker-referral-modal');
    const form = document.getElementById('broker-referral-form');
    const closeBtn = document.getElementById('close-broker-referral-modal');
    const cancelBtn = document.getElementById('cancel-broker-referral-btn');
    if (!modal || !form) return;
    const closeModal = () => {
        modal.classList.add('modal-closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            modal._inputElement = null;
            modal._dropdownElement = null;
        }, 180);
    };
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('broker-referral-name');
        const emailInput = document.getElementById('broker-referral-email');
        const phoneInput = document.getElementById('broker-referral-phone');
        const name = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        const email = (emailInput && emailInput.value) ? emailInput.value.trim() : '';
        const phone = (phoneInput && phoneInput.value) ? phoneInput.value.trim() : '';
        if (!name) {
            showToast('Name is required.', 'error');
            if (nameInput) nameInput.focus();
            return;
        }
        const inputEl = modal._inputElement;
        const dropdownEl = modal._dropdownElement;
        try {
            const payload = { Name: name };
            if (email) payload.Email = email;
            if (phone) payload.Phone = phone;
            const createRes = await API.createBrokerReferralContact(payload);
            if (createRes.success && createRes.data) {
                const id = createRes.data.BrokerReferralContactId ?? createRes.data.Id;
                const displayName = createRes.data.Name || name;
                if (inputEl) {
                    inputEl.value = displayName;
                    inputEl.dataset.brokerReferralId = String(id);
                    inputEl.setAttribute('data-broker-referral-id', String(id));
                    const row = inputEl.closest('tr');
                    if (row) row.classList.add('has-changes');
                }
                if (dropdownEl) dropdownEl.style.display = 'none';
                closeModal();
            }
        } catch (err) {
            console.warn('Create broker/referral failed:', err);
        }
    });
}

// Show Pre-Con Manager creation modal
function showPreConManagerModal(prepopulatedName, inputElement, wrapperElement, dropdownElement) {
    const modal = document.getElementById('precon-manager-modal');
    const form = document.getElementById('precon-manager-form');
    const nameInput = document.getElementById('precon-manager-name');
    const emailInput = document.getElementById('precon-manager-email');
    const phoneInput = document.getElementById('precon-manager-phone');
    
    if (!modal || !form || !nameInput) return;
    
    // Store references for use in form submission
    modal._inputElement = inputElement;
    modal._wrapperElement = wrapperElement;
    modal._dropdownElement = dropdownElement;
    
    // Pre-populate name field
    nameInput.value = prepopulatedName || '';
    emailInput.value = '';
    phoneInput.value = '';
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus on email field (name is already filled)
    setTimeout(() => {
        emailInput.focus();
    }, 100);
}

// Initialize Pre-Con Manager modal event listeners
function initPreConManagerModal() {
    const modal = document.getElementById('precon-manager-modal');
    const form = document.getElementById('precon-manager-form');
    const closeBtn = document.getElementById('close-precon-manager-modal');
    const cancelBtn = document.getElementById('cancel-precon-manager-btn');
    
    if (!modal || !form) return;
    
    const closeModal = () => {
        modal.classList.add('modal-closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            modal._inputElement = null;
            modal._wrapperElement = null;
            modal._dropdownElement = null;
        }, 180);
    };
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nameInput = document.getElementById('precon-manager-name');
        const emailInput = document.getElementById('precon-manager-email');
        const phoneInput = document.getElementById('precon-manager-phone');
        
        const fullName = nameInput.value.trim();
        const email = emailInput.value.trim();
        const phone = phoneInput.value.trim();
        
        if (!fullName) {
            showToast('Full Name is required.', 'error');
            nameInput.focus();
            return;
        }
        
        // Get stored references
        const inputElement = modal._inputElement;
        const wrapperElement = modal._wrapperElement;
        const dropdownElement = modal._dropdownElement;
        
        try {
            // First, check for duplicates by fetching existing Pre-Con Managers
            const checkResponse = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                }
            });
            const checkResult = await checkResponse.json();
            
            if (checkResult.success) {
                const existingManagers = checkResult.data || [];
                
                // Check for duplicate name (case-insensitive)
                const duplicateName = existingManagers.find(m => {
                    const existingName = (m.FullName || m.ManagerName || '').trim().toLowerCase();
                    return existingName === fullName.toLowerCase();
                });
                
                if (duplicateName) {
                    showToast(`A Pre-Con Manager with the name "${duplicateName.FullName || duplicateName.ManagerName}" already exists. Please use the existing manager or choose a different name.`, 'error');
                    nameInput.focus();
                    return;
                }
                
                // Check for duplicate email (if email is provided)
                if (email) {
                    const duplicateEmail = existingManagers.find(m => {
                        const existingEmail = (m.Email || '').trim().toLowerCase();
                        return existingEmail && existingEmail === email.toLowerCase();
                    });
                    
                    if (duplicateEmail) {
                        showToast(`A Pre-Con Manager with the email "${duplicateEmail.Email}" already exists (${duplicateEmail.FullName || duplicateEmail.ManagerName}). Please use a different email address.`, 'error');
                        emailInput.focus();
                        return;
                    }
                }
                
                // Check for duplicate phone number (if phone is provided)
                if (phone) {
                    // Normalize phone numbers for comparison (remove spaces, dashes, parentheses)
                    const normalizePhone = (p) => p.replace(/[\s\-\(\)]/g, '').replace(/^\+1/, '');
                    const normalizedPhone = normalizePhone(phone);
                    
                    const duplicatePhone = existingManagers.find(m => {
                        const existingPhone = (m.PhoneNumber || m.Phone || '').trim();
                        if (!existingPhone) return false;
                        return normalizePhone(existingPhone) === normalizedPhone;
                    });
                    
                    if (duplicatePhone) {
                        showToast(`A Pre-Con Manager with the phone number "${duplicatePhone.PhoneNumber || duplicatePhone.Phone}" already exists (${duplicatePhone.FullName || duplicatePhone.ManagerName}). Please use a different phone number.`, 'error');
                        phoneInput.focus();
                        return;
                    }
                }
            }
            
            // If no duplicates found, proceed with creation
            const response = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                },
                body: JSON.stringify({
                    FullName: fullName,
                    Email: email || null,
                    PhoneNumber: phone || null
                })
            });
            const result = await response.json();
            
            if (result.success) {
                const newManager = result.data;
                
                // Ensure the manager has the expected structure
                if (!newManager.PreConManagerId) {
                    console.error('API response missing PreConManagerId:', newManager);
                    throw new Error('API response missing PreConManagerId');
                }
                
                // Normalize the manager name field (API might return ManagerName or FullName)
                if (!newManager.ManagerName && newManager.FullName) {
                    newManager.ManagerName = newManager.FullName;
                }
                
                // Refresh Pre-Con Managers list from API to ensure we have the latest data
                try {
                    const managersResponse = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`);
                    const managersResult = await managersResponse.json();
                    if (managersResult.success) {
                        const allPreConManagers = managersResult.data || [];
                        
                        // Update all searchable select wrappers with the fresh list
                        document.querySelectorAll('.searchable-select-wrapper[data-field="PreConManagerId"]').forEach(wrapper => {
                            wrapper._preConManagers = allPreConManagers;
                            // Update the dropdown options for the current search term
                            const input = wrapper.querySelector('.searchable-select-input');
                            if (input) {
                                updateSearchableSelectOptions(wrapper, input.value);
                            }
                        });
                    }
                } catch (error) {
                    console.warn('Failed to refresh Pre-Con Managers list, using local update:', error);
                    // Fallback: update all searchable selects with the new manager
                    updateAllSearchableSelects(newManager);
                }
                
                // Set the selected value
                if (inputElement) {
                    // The API might return ManagerName or FullName - use whichever is available
                    const managerName = newManager.ManagerName || newManager.FullName || fullName;
                    inputElement.value = managerName;
                    // Set both camelCase (for dataset) and kebab-case (for HTML attribute)
                    inputElement.dataset.preconManagerId = String(newManager.PreConManagerId);
                    inputElement.setAttribute('data-precon-manager-id', String(newManager.PreConManagerId));
                    
                    // Update the dropdown options to show the new manager immediately
                    if (wrapperElement) {
                        updateSearchableSelectOptions(wrapperElement, inputElement.value);
                    }
                }
                
                if (dropdownElement) {
                    dropdownElement.style.display = 'none';
                }
                
                // Mark row as changed
                if (inputElement) {
                    const row = inputElement.closest('tr');
                    if (row) {
                        row.classList.add('has-changes');
                    }
                }
                
                // Close modal
                closeModal();
                
                showToast(`Pre-Con Manager "${fullName}" created successfully! Save the deal to persist this change.`, 'success');
            } else {
                console.error('Failed to create Pre-Con Manager:', result);
                throw new Error(result.error?.message || 'Failed to create Pre-Con Manager');
            }
        } catch (error) {
            showToast(`Failed to create Pre-Con Manager: ${error.message}`, 'error');
        }
    });
}

function addNewDealRow() {
    const table = document.querySelector('.deal-pipeline-table tbody');
    if (!table) return;
    
    // Get dropdown options (we'll need to fetch these, but for now use empty)
    const formatDateInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };
    
    // Create a new empty row
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-deal-id', '');
    newRow.setAttribute('data-project-id', '');
    newRow.innerHTML = `
        <td class="project-name-cell"><input type="text" class="deal-pipeline-field" data-field="ProjectName" value="" style="min-width: 200px; width: 100%;" required /></td>
        <td>
            <select class="deal-pipeline-field" data-field="Stage">
                <option value="Prospective" selected>Prospective</option>
                <option value="Under Contract">Under Contract</option>
                <option value="Commercial Land - Listed">Commercial Land - Listed</option>
                <option value="Under Construction">Under Construction</option>
                <option value="Lease-Up">Lease-Up</option>
                <option value="Stabilized">Stabilized</option>
                <option value="Liquidated">Liquidated</option>
                <option value="Dead">Dead</option>
            </select>
        </td>
        <td>
            <select class="deal-pipeline-field" data-field="Priority">
                <option value="">-- Select --</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
            </select>
        </td>
        <td><input type="text" class="deal-pipeline-field" data-field="City" value="" /></td>
        <td><input type="text" class="deal-pipeline-field" data-field="State" value="" maxlength="2" pattern="[A-Z]{2}" placeholder="e.g., CA, TX" title="State abbreviation (2 letters only, e.g., CA, TX, NY)" /></td>
        <td>
            <select class="deal-pipeline-field" data-field="Region">
                <option value="">-- Select --</option>
            </select>
        </td>
        <td><input type="number" step="any" class="deal-pipeline-field" data-field="Latitude" value="" placeholder="e.g. 30.45" title="Enter latitude manually. If linked to Procore, value will sync from Procore." style="min-width: 100px;" /></td>
        <td><input type="number" step="any" class="deal-pipeline-field" data-field="Longitude" value="" placeholder="e.g. -90.12" title="Enter longitude manually. If linked to Procore, value will sync from Procore." style="min-width: 100px;" /></td>
        <td>
            <select class="deal-pipeline-field" data-field="ProductType">
                <option value="">-- Select --</option>
            </select>
        </td>
        <td><input type="text" class="deal-pipeline-field external-source-field" data-field="Bank" data-source="Banking Dashboard" value="" readonly style="background-color: #f5f5f5; cursor: not-allowed;" title="Read-only: Bank information is managed in the Banking Dashboard. Edit bank details there to update this field." /></td>
        <td><input type="date" class="deal-pipeline-field" data-field="StartDate" value="" /></td>
        <td><input type="number" class="deal-pipeline-field" data-field="UnitCount" value="" /></td>
        <td>
            <div class="searchable-select-wrapper" data-field="PreConManagerId">
                <input type="text" 
                       class="searchable-select-input deal-pipeline-field" 
                       data-field="PreConManagerId" 
                       data-precon-manager-id=""
                       value=""
                       placeholder="Search or type to create new..."
                       autocomplete="off" />
                <div class="searchable-select-dropdown" style="display: none;">
                    <div class="searchable-select-options"></div>
                </div>
            </div>
        </td>
        <td><input type="number" step="0.01" class="deal-pipeline-field" data-field="Acreage" value="" style="min-width: 120px;" /></td>
        <td>
            <div style="position: relative; display: flex; align-items: center;">
                <span style="position: absolute; left: 8px; color: #666; font-weight: 500;">$</span>
                <input type="number" step="0.01" class="deal-pipeline-field" data-field="LandPrice" value="" style="padding-left: 24px; min-width: 180px;" />
            </div>
        </td>
        <td><input type="text" class="deal-pipeline-field auto-calculated-field" data-field="SqFtPrice" data-source="Auto-calculated" value="" readonly style="background-color: #f5f5f5; cursor: not-allowed;" title="Read-only: Auto-calculated from Land Price and Acreage. Update those fields to recalculate." /></td>
        <td><input type="date" class="deal-pipeline-field" data-field="ExecutionDate" value="" /></td>
        <td><input type="date" class="deal-pipeline-field" data-field="DueDiligenceDate" value="" /></td>
        <td><input type="date" class="deal-pipeline-field" data-field="ClosingDate" value="" /></td>
        <td><input type="date" class="deal-pipeline-field" data-field="ConstructionLoanClosingDate" value="" /></td>
        <td><input type="text" class="deal-pipeline-field" data-field="PurchasingEntity" value="" /></td>
        <td><input type="checkbox" class="deal-pipeline-field" data-field="Cash" /></td>
        <td><input type="checkbox" class="deal-pipeline-field" data-field="OpportunityZone" /></td>
        <td>
            <div class="searchable-select-wrapper" data-field="BrokerReferralContactId">
                <input type="text" class="searchable-select-input deal-pipeline-field broker-referral-input" data-field="BrokerReferralContactId" data-broker-referral-id="" value="" placeholder="Search or add contact..." autocomplete="off" style="min-width: 140px;" />
                <div class="searchable-select-dropdown" style="display: none;"><div class="searchable-select-options"></div></div>
            </div>
        </td>
        <td><input type="text" class="deal-pipeline-field" data-field="PriceRaw" value="" placeholder="e.g. -, TBD" style="min-width: 80px;" /></td>
        <td>
            <select class="deal-pipeline-field" data-field="ListingStatus">
                <option value="">--</option>
                <option value="Listed">Listed</option>
                <option value="Unlisted">Unlisted</option>
            </select>
        </td>
        <td><input type="text" class="deal-pipeline-field" data-field="Zoning" value="" placeholder="e.g. CH" style="min-width: 80px;" /></td>
        <td><input type="text" class="deal-pipeline-field" data-field="County" value="" placeholder="County/Parish" style="min-width: 100px;" title="County or Parish" /></td>
        <td><textarea class="deal-pipeline-field" data-field="Notes" rows="4" style="min-width: 300px; width: 100%;"></textarea></td>
        <td class="deal-pipeline-actions">
            <button class="save-btn" onclick="saveDealPipelineRow(event, 'new', null)" title="Save this new deal">Save</button>
            <button class="cancel-new-deal-btn" onclick="cancelNewDealRow(this)" title="Cancel and remove this new deal">Cancel</button>
        </td>
    `;
    
    // Insert at the top of the table
    table.insertBefore(newRow, table.firstChild);
    
    // Highlight the new row
    newRow.classList.add('has-changes');
    newRow.style.backgroundColor = '#fff3cd';
    updateSaveAllButtonVisibility();
    
    // Focus on project name field
    const projectNameInput = newRow.querySelector('[data-field="ProjectName"]');
    if (projectNameInput) {
        projectNameInput.focus();
    }
    
    // Bind change listeners
    bindDealPipelineFieldListeners();
    
    // Populate Region and ProductType dropdowns for the new row
    setTimeout(async () => {
        try {
            // Fetch regions
            const regionsResponse = await API.getAllRegions();
            if (regionsResponse.success) {
                const regions = regionsResponse.data || [];
                const regionSelect = newRow.querySelector('[data-field="Region"]');
                if (regionSelect) {
                    regions.forEach(region => {
                        const option = document.createElement('option');
                        option.value = region.RegionName || '';
                        option.textContent = region.RegionName || '';
                        regionSelect.appendChild(option);
                    });
                }
            }
            
            // Fetch product types
            const productTypesResponse = await API.getAllProductTypes();
            if (productTypesResponse.success) {
                const productTypes = productTypesResponse.data || [];
                const productTypeSelect = newRow.querySelector('[data-field="ProductType"]');
                if (productTypeSelect) {
                    productTypes.forEach(pt => {
                        const option = document.createElement('option');
                        option.value = pt.ProductTypeName || '';
                        option.textContent = pt.ProductTypeName || '';
                        productTypeSelect.appendChild(option);
                    });
                }
            }
            
            // Use direct API call since api-client doesn't have this function
            const response = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`);
            const managersResponse = await response.json();
            if (managersResponse.success) {
                const preConManagers = managersResponse.data || [];
                initializeSearchableSelects(preConManagers);
            }
            initializeBrokerReferralSelects();
        } catch (error) {
            console.warn('Failed to load Pre-Con Managers for new row:', error);
        }
    }, 100);
    
    // Scroll to the new row
    newRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Cancel creating a new deal: remove the unsaved row from the table.
 * Only removes rows that are still "new" (data-deal-id empty).
 * @param {HTMLElement} buttonEl - The Cancel button element (used to find the row)
 */
function cancelNewDealRow(buttonEl) {
    const row = buttonEl && buttonEl.closest ? buttonEl.closest('tr') : null;
    if (!row) return;
    const dealId = row.getAttribute('data-deal-id');
    if (dealId !== '' && dealId !== null) return;
    row.remove();
    updateSaveAllButtonVisibility();
}

function filterDealPipelineTable(searchTerm) {
    const searchLower = (searchTerm || '').trim().toLowerCase();
    const rows = document.querySelectorAll('.deal-pipeline-table tbody tr');
    let visibleCount = 0;
    
    // If search is empty, show all rows
    if (!searchLower) {
        rows.forEach(row => {
            row.style.display = '';
            visibleCount++;
        });
        const countEl = document.getElementById('deal-pipeline-count');
        if (countEl) {
            countEl.textContent = `${visibleCount} ${visibleCount === 1 ? 'deal' : 'deals'}`;
        }
        return;
    }
    
    // Split search term into words for better matching
    const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);
    
    rows.forEach(row => {
        // Extract values from all searchable fields
        const searchableText = [];
        
        // Project Name (first column - most important)
        const projectNameInput = row.querySelector('td:first-child input[data-field="ProjectName"]');
        if (projectNameInput) {
            searchableText.push((projectNameInput.value || '').toLowerCase());
        }
        
        // Stage
        const stageSelect = row.querySelector('select[data-field="Stage"]');
        if (stageSelect) {
            const selectedOption = stageSelect.options[stageSelect.selectedIndex];
            if (selectedOption) {
                searchableText.push(selectedOption.text.toLowerCase());
            }
        }
        
        // City
        const cityInput = row.querySelector('input[data-field="City"]');
        if (cityInput) {
            searchableText.push((cityInput.value || '').toLowerCase());
        }
        
        // State
        const stateInput = row.querySelector('input[data-field="State"]');
        if (stateInput) {
            searchableText.push((stateInput.value || '').toLowerCase());
        }
        
        // Region
        const regionSelect = row.querySelector('select[data-field="Region"]');
        if (regionSelect) {
            const selectedOption = regionSelect.options[regionSelect.selectedIndex];
            if (selectedOption) {
                searchableText.push(selectedOption.text.toLowerCase());
            }
        }
        
        // Product Type
        const productTypeSelect = row.querySelector('select[data-field="ProductType"]');
        if (productTypeSelect) {
            const selectedOption = productTypeSelect.options[productTypeSelect.selectedIndex];
            if (selectedOption) {
                searchableText.push(selectedOption.text.toLowerCase());
            }
        }
        
        // Bank
        const bankInput = row.querySelector('input[data-field="Bank"]');
        if (bankInput) {
            searchableText.push((bankInput.value || '').toLowerCase());
        }
        
        // Pre-Con Manager
        const preConManagerInput = row.querySelector('input[data-field="PreConManagerId"]');
        if (preConManagerInput) {
            searchableText.push((preConManagerInput.value || '').toLowerCase());
        }
        
        // Notes
        const notesTextarea = row.querySelector('textarea[data-field="Notes"]');
        if (notesTextarea) {
            searchableText.push((notesTextarea.value || '').toLowerCase());
        }
        
        // Combine all searchable text
        const combinedText = searchableText.join(' ');
        
        // Check if all search words are found in the combined text
        // This allows for partial matches like "waters conway" matching "The Waters at Conway"
        const allWordsMatch = searchWords.every(word => combinedText.includes(word));
        
        if (allWordsMatch) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    const countEl = document.getElementById('deal-pipeline-count');
    if (countEl) {
        const totalCount = rows.length;
        countEl.textContent = `${visibleCount} of ${totalCount} ${totalCount === 1 ? 'deal' : 'deals'}`;
    }
}

// Make functions globally accessible
window.saveDealPipelineRow = async function(dealIdOrEvent, projectId) {
    // Support (event, dealId, projectId) when event is passed from onclick so we save the row that was clicked
    let dealId = dealIdOrEvent;
    let row = null;
    if (dealIdOrEvent && typeof dealIdOrEvent === 'object' && dealIdOrEvent.target) {
        const ev = dealIdOrEvent;
        row = (ev.target && ev.target.closest) ? ev.target.closest('tr') : null;
        if (row) {
            dealId = row.getAttribute('data-deal-id') || row.dataset?.dealId || 'new';
            projectId = row.getAttribute('data-project-id') || row.dataset?.projectId || projectId || '';
        }
    }
    
    // Check authentication - allow if authenticated (edit mode is optional for viewing, but required for editing)
    if (!isAuthenticated) {
        showToast('You must be logged in to save changes. Please log in and try again.', 'info');
        console.error('Save failed: isAuthenticated =', isAuthenticated, 'isEditMode =', isEditMode);
        return;
    }
    
    // Warn if not in edit mode, but allow save if authenticated
    if (!isEditMode) {
        const proceed = confirm('Edit mode is not enabled. You can still save, but some features may be limited. Continue?');
        if (!proceed) {
            return;
        }
    }
    
    // Resolve row: prefer row from click event so we always save the row the user clicked
    const isNewDeal = !dealId || dealId === 'new' || dealId === '';
    if (!row) {
        row = isNewDeal
            ? document.querySelector(`tr[data-deal-id=""]`) || document.querySelector(`tr:not([data-deal-id])`)
            : document.querySelector(`tr[data-deal-id="${dealId}"]`);
    }
    
    if (!row) {
        showToast('Could not find deal row to save.', 'error');
        return;
    }
    
    const fields = row.querySelectorAll('.deal-pipeline-field');
    const data = {};
    
    // Validate required fields (use the row we're actually saving)
    const projectNameField = row.querySelector('[data-field="ProjectName"]');
    if (!projectNameField || !projectNameField.value.trim()) {
        showToast('Project Name is required. Enter a name in the Project Name column for this row.', 'error');
        projectNameField?.focus();
        return;
    }
    
    // Check if this project has Procore data (to exclude Procore fields from save)
    const rowProjectId = row.dataset.projectId;
    const procoreMatch = rowProjectId ? window.PROCORE_MATCHES?.get(parseInt(rowProjectId)) : null;
    const hasProcore = procoreMatch && procoreMatch.hasProcore;
    
    // First, handle PreConManagerId lookup if needed (async operation)
    const preConManagerField = row.querySelector('[data-field="PreConManagerId"].searchable-select-input');
    if (preConManagerField && preConManagerField.value.trim()) {
        let managerId = preConManagerField.dataset.preconManagerId || preConManagerField.getAttribute('data-precon-manager-id');
        
        if (!managerId) {
            const managerName = preConManagerField.value.trim();
            const wrapper = preConManagerField.closest('.searchable-select-wrapper');
            let managers = wrapper?._preConManagers || [];
            
            // If managers list is empty, fetch from API
            if (managers.length === 0) {
                try {
                    const managersResponse = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`, {
                        headers: {
                            'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
                        }
                    });
                    const managersResult = await managersResponse.json();
                    if (managersResult.success) {
                        managers = managersResult.data || [];
                        if (wrapper) {
                            wrapper._preConManagers = managers;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to fetch Pre-Con Managers:', error);
                }
            }
            
            if (managers.length > 0) {
                // Try exact match first (case-insensitive)
                let matchingManager = managers.find(m => {
                    const mName = (m.ManagerName || m.FullName || '').trim();
                    return mName.toLowerCase() === managerName.toLowerCase();
                });
                
                // If no exact match, try partial match (handles "Morgan" matching "Morgan Smith")
                if (!matchingManager) {
                    matchingManager = managers.find(m => {
                        const mName = (m.ManagerName || m.FullName || '').trim().toLowerCase();
                        return mName.includes(managerName.toLowerCase()) || managerName.toLowerCase().includes(mName);
                    });
                }
                
                if (matchingManager && matchingManager.PreConManagerId) {
                    managerId = matchingManager.PreConManagerId;
                    // Update the field with the ID for future saves
                    preConManagerField.dataset.preconManagerId = String(managerId);
                    preConManagerField.setAttribute('data-precon-manager-id', String(managerId));
                    // Also update the display value to the full name
                    preConManagerField.value = matchingManager.ManagerName || matchingManager.FullName || managerName;
                }
            }
        }
    }
    
    // Resolve Broker/Referral contact: if user typed a name but no ID, search or create
    const brokerReferralField = row.querySelector('.broker-referral-input');
    if (brokerReferralField && brokerReferralField.value.trim()) {
        let contactId = brokerReferralField.dataset.brokerReferralId || brokerReferralField.getAttribute('data-broker-referral-id');
        if (!contactId) {
            const name = brokerReferralField.value.trim();
            try {
                const listRes = await API.listBrokerReferralContacts(name);
                const contacts = listRes.data || [];
                let match = contacts.find(c => (c.Name || '').trim().toLowerCase() === name.toLowerCase());
                if (!match && contacts.length > 0) match = contacts.find(c => (c.Name || '').toLowerCase().includes(name.toLowerCase()));
                if (match && match.BrokerReferralContactId) {
                    contactId = String(match.BrokerReferralContactId);
                    brokerReferralField.dataset.brokerReferralId = contactId;
                    brokerReferralField.setAttribute('data-broker-referral-id', contactId);
                    brokerReferralField.value = match.Name || name;
                } else {
                    const createRes = await API.createBrokerReferralContact({ Name: name });
                    if (createRes.success && createRes.data && createRes.data.BrokerReferralContactId) {
                        contactId = String(createRes.data.BrokerReferralContactId);
                        brokerReferralField.dataset.brokerReferralId = contactId;
                        brokerReferralField.setAttribute('data-broker-referral-id', contactId);
                        brokerReferralField.value = createRes.data.Name || name;
                    }
                }
            } catch (err) {
                console.warn('Broker/Referral resolve failed:', err);
            }
        }
    }
    
    fields.forEach(field => {
        const fieldName = field.dataset.field;
        if (!fieldName) return;
        
        // Skip Bank field - it's read-only and managed in Banking Dashboard
        if (fieldName === 'Bank') return;
        
        // Skip Procore fields if this project has Procore data
        if (hasProcore) {
            // City, State, Region, Latitude, Longitude, StartDate, UnitCount are synced from Procore when present
            if (fieldName === 'City' && procoreMatch.city) return;
            if (fieldName === 'State' && procoreMatch.state) return;
            if (fieldName === 'Region' && procoreMatch.region) return;
            if (fieldName === 'Latitude' && (procoreMatch.latitude != null && procoreMatch.latitude !== '')) return;
            if (fieldName === 'Longitude' && (procoreMatch.longitude != null && procoreMatch.longitude !== '')) return;
            if (fieldName === 'StartDate' && procoreMatch.actualStartDate) return;
            if (fieldName === 'UnitCount' && procoreMatch.unitCount) return;
        }
        
        // Handle searchable select for PreConManagerId
        if (fieldName === 'PreConManagerId' && field.classList.contains('searchable-select-input')) {
            // Try both camelCase (dataset) and kebab-case (attribute) to get the manager ID
            // The ID should already be set from the async lookup above
            let managerId = field.dataset.preconManagerId || field.getAttribute('data-precon-manager-id');
            
            // Save PreConManagerId - include null if field is empty (to clear it), or the ID if set
            if (managerId) {
                const parsedId = parseInt(managerId);
                if (!isNaN(parsedId) && parsedId > 0) {
                    data[fieldName] = parsedId;
                }
            } else if (!field.value.trim()) {
                // If field is empty, set to null to clear the Pre-Con Manager
                data[fieldName] = null;
            }
            return;
        }
        
        // Handle searchable select for BrokerReferralContactId
        if (fieldName === 'BrokerReferralContactId' && field.classList.contains('broker-referral-input')) {
            let contactId = field.dataset.brokerReferralId || field.getAttribute('data-broker-referral-id');
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
                // Special handling for State field - ensure uppercase and 2 letters only
                if (fieldName === 'State') {
                    value = value.replace(/[^A-Za-z]/g, '').toUpperCase();
                    if (value.length !== 2) {
                        showToast('State must be exactly 2 letters (e.g., CA, TX, NY).', 'error');
                        field.focus();
                        return;
                    }
                }
                data[fieldName] = value;
            }
        }
    });
    
    try {
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
            
            if (result.success) {
                row.classList.remove('has-changes');
                updateSaveAllButtonVisibility();
                showToast('Deal created successfully!', 'success');
            }
        } else {
            // Update existing deal
            result = await API.updateDealPipeline(parseInt(dealId), data);
            if (result.success) {
                row.classList.remove('has-changes');
                updateSaveAllButtonVisibility();
                showToast('Deal updated successfully!', 'success');
            }
        }
        
        if (!result.success) {
            const errorMsg = result.error?.message || 'Unknown error';
            showToast(`Failed to ${isNewDeal ? 'create' : 'update'} deal: ${errorMsg}`, 'error');
            console.error('Deal save failed:', result.error);
        }
        
        if (result.success) {
            // Update row data attributes if it was a new deal
            if (isNewDeal && result.data) {
                row.dataset.dealId = result.data.DealPipelineId || '';
                row.dataset.projectId = result.data.ProjectId || '';
            }
            
            // Refresh data from database
            // Refresh the deal pipeline table (use API for instant fresh data after save)
            await renderDealPipelineTable({ forceApi: true });
            
            // Also refresh the main allDeals array for other views (use API for instant fresh data)
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
                    
                }
            } catch (error) {
                console.warn('Failed to refresh main allDeals array:', error);
                // Still refresh the table even if main refresh fails
            }
        } else {
            throw new Error(result.error?.message || `Failed to ${isNewDeal ? 'create' : 'update'} deal`);
        }
    } catch (error) {
        showToast(`Failed to ${isNewDeal ? 'create' : 'update'} deal: ${error.message}`, 'error');
    }
};

window.deleteDealPipelineRow = async function(dealId) {
    if (!isAuthenticated || !isEditMode) {
        showToast('You must be logged in and in edit mode to delete deals.', 'info');
        return;
    }
    
    const delConfirmed = await domoConfirm('Are you sure you want to delete this deal? This action cannot be undone.', { confirmLabel: 'Delete' });
    if (!delConfirmed) {
        return;
    }
    
    try {
        const result = await API.deleteDealPipeline(dealId);
        if (result.success) {
            await refreshDealsFromApi();
            showToast('Deal deleted successfully!', 'success');
        } else {
            throw new Error(result.error?.message || 'Failed to delete deal');
        }
    } catch (error) {
        showToast(`Failed to delete deal: ${error.message}`, 'error');
    }
};

// ============================================================
// BANK DETAILS MODAL FUNCTIONS
// ============================================================

async function showBankDetails(bankName, bankId) {
    const modal = document.getElementById('bank-details-modal');
    const title = document.getElementById('bank-details-title');
    const content = document.getElementById('bank-details-content');
    
    if (!modal || !title || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    title.textContent = `Bank Information: ${bankName}`;
    content.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    
    try {
        let bankData = null;
        
        // If we have a bankId, fetch directly
        if (bankId) {
            const response = await API.getBankById(parseInt(bankId));
            if (response.success) {
                bankData = response.data;
            }
        }
        
        // If no bankId or fetch failed, try to find by name
        if (!bankData) {
            const banksResponse = await API.getAllBanks();
            if (banksResponse.success) {
                const banks = banksResponse.data || [];
                const bankNameLower = bankName.toLowerCase();
                bankData = banks.find(b => {
                    const recordName = (b.BankName || '').toLowerCase();
                    return recordName === bankNameLower || 
                           recordName.includes(bankNameLower) || 
                           bankNameLower.includes(recordName);
                });
            }
        }
        
        if (!bankData) {
            content.innerHTML = `
                <div class="error" style="padding: 20px; text-align: center;">
                    <p>Bank information not found in database.</p>
                    <p style="margin-top: 8px; color: var(--text-secondary); font-size: 14px;">
                        Bank name: <strong>${bankName}</strong>
                    </p>
                </div>
            `;
            return;
        }
        
        // Format bank data for display
        const formatCurrency = (value) => {
            if (!value && value !== 0) return '—';
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(value);
        };
        
        content.innerHTML = `
            <div class="bank-details-container">
                <div class="bank-details-section">
                    <h3 style="margin-top: 0; color: var(--primary-green); border-bottom: 2px solid var(--primary-green); padding-bottom: 8px;">
                        Basic Information
                    </h3>
                    <div class="bank-details-grid">
                        <div class="bank-detail-item">
                            <span class="bank-detail-label">Bank Name:</span>
                            <span class="bank-detail-value">${bankData.BankName || '—'}</span>
                        </div>
                        ${bankData.BankId ? `
                        <div class="bank-detail-item">
                            <span class="bank-detail-label">Bank ID:</span>
                            <span class="bank-detail-value">${bankData.BankId}</span>
                        </div>
                        ` : ''}
                        ${bankData.HoldLimit ? `
                        <div class="bank-detail-item">
                            <span class="bank-detail-label">Hold Limit:</span>
                            <span class="bank-detail-value">${formatCurrency(bankData.HoldLimit)}</span>
                        </div>
                        ` : ''}
                        ${bankData.City ? `
                        <div class="bank-detail-item">
                            <span class="bank-detail-label">City:</span>
                            <span class="bank-detail-value">${bankData.City}</span>
                        </div>
                        ` : ''}
                        ${bankData.State ? `
                        <div class="bank-detail-item">
                            <span class="bank-detail-label">State:</span>
                            <span class="bank-detail-value">${bankData.State}</span>
                        </div>
                        ` : ''}
                        ${bankData.ContactText ? `
                        <div class="bank-detail-item" style="grid-column: 1 / -1;">
                            <span class="bank-detail-label">Contact:</span>
                            <span class="bank-detail-value">${bankData.ContactText}</span>
                        </div>
                        ` : ''}
                        ${bankData.Comments ? `
                        <div class="bank-detail-item" style="grid-column: 1 / -1;">
                            <span class="bank-detail-label">Comments:</span>
                            <span class="bank-detail-value">${bankData.Comments}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${bankData.AssetsText ? `
                <div class="bank-details-section" style="margin-top: 24px;">
                    <h3 style="color: var(--primary-green); border-bottom: 2px solid var(--primary-green); padding-bottom: 8px;">
                        Assets Information
                    </h3>
                    <div class="bank-details-grid">
                        <div class="bank-detail-item" style="grid-column: 1 / -1;">
                            <span class="bank-detail-label">Assets:</span>
                            <span class="bank-detail-value">${bankData.AssetsText}</span>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="bank-details-note" style="margin-top: 24px; padding: 12px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <p style="margin: 0; font-size: 13px; color: #856404;">
                        <strong>Note:</strong> For detailed loan information, participations, and exposure data, please visit the Banking Dashboard.
                    </p>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading bank details:', error);
        content.innerHTML = `
            <div class="error" style="padding: 20px; text-align: center;">
                <p>Failed to load bank information.</p>
                <p style="margin-top: 8px; color: var(--text-secondary); font-size: 14px;">
                    ${error.message}
                </p>
            </div>
        `;
    }
}

// Export Pipeline to Excel
