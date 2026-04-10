/**
 * app-deal-detail.js — Deal detail modal, Asana fields, notes modal
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

function buildAsanaOtherFieldsSection(modal, deal, matchedTask, asanaUrl, isAdmin) {
    var container = modal && modal.querySelector('#deal-detail-asana-other-fields-content');
    if (!container || !matchedTask || typeof API === 'undefined' || !API.updateAsanaTaskCustomField) return;
    var taskGid = (matchedTask.gid || '').replace(/"/g, '&quot;');
    var dealPipelineId = deal.DealPipelineId || (deal._original && deal._original.DealPipelineId) || '';
    var rows = [];
    for (var i = 0; i < ASANA_OTHER_FIELDS_CONFIG.length; i++) {
        var cfg = ASANA_OTHER_FIELDS_CONFIG[i];
        var dbVal = cfg.getDb(deal);
        var asanaVal = cfg.getAsana(matchedTask);
        var displayDb = (dbVal || '—').replace(/</g, '&lt;');
        var displayAsana = (asanaVal || '—').replace(/</g, '&lt;');
        var isSame = cfg.same(dbVal, asanaVal);
        if (isSame) {
            rows.push('<div class="deal-detail-asana-field-row"><strong>' + cfg.label + ':</strong> Database and Asana match (<span>' + displayDb + '</span>).</div>');
        } else {
            var asanaValEsc = (asanaVal || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            var dbBtn = isAdmin ? ' <button type="button" class="deal-detail-btn deal-detail-asana-override-field" data-task-gid="' + taskGid + '" data-field-key="' + (cfg.key || '').replace(/"/g, '&quot;') + '" data-db-value="' + (dbVal || '').replace(/"/g, '&quot;') + '">Override Asana with database value</button>' : '';
            // Bank is controlled by another department in the DB — only allow DB → Asana, not Asana → DB
            var asanaBtn = (isAdmin && dealPipelineId && cfg.key !== 'bank') ? ' <button type="button" class="deal-detail-btn deal-detail-asana-override-db-field" data-field-key="' + (cfg.key || '').replace(/"/g, '&quot;') + '" data-asana-value="' + asanaValEsc + '" data-deal-pipeline-id="' + String(dealPipelineId).replace(/"/g, '&quot;') + '">Override database with Asana value</button>' : '';
            rows.push('<div class="deal-detail-asana-field-row">' +
                '<strong>' + cfg.label + ':</strong> Database: <span>' + displayDb + '</span>; Asana: <span>' + displayAsana + '</span>.' +
                dbBtn + asanaBtn +
                '</div>');
        }
    }
    container.innerHTML = rows.length ? '<p class="deal-detail-asana-remedies" style="margin-bottom: 8px;">Other fields (sync either direction):</p>' + rows.join('') : '';
    if (isAdmin) {
        modal.querySelectorAll('.deal-detail-asana-override-field').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var gid = this.getAttribute('data-task-gid');
                var fieldKey = this.getAttribute('data-field-key');
                var dbValue = this.getAttribute('data-db-value');
                if (!gid || !fieldKey) return;
                btn.disabled = true;
                API.updateAsanaTaskCustomField(gid, fieldKey, dbValue != null ? dbValue : '').then(function() {
                    var label = fieldKey;
                    for (var k = 0; k < ASANA_OTHER_FIELDS_CONFIG.length; k++) { if (ASANA_OTHER_FIELDS_CONFIG[k].key === fieldKey) { label = ASANA_OTHER_FIELDS_CONFIG[k].label; break; } }
                    btn.outerHTML = '<span class="deal-detail-asana-discrepancy-msg">Asana ' + label + ' updated to match database.</span>';
                }).catch(function(e) {
                    btn.disabled = false;
                    if (typeof console !== 'undefined') console.error(e);
                });
            });
        });
        modal.querySelectorAll('.deal-detail-asana-override-db-field').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var fieldKey = this.getAttribute('data-field-key');
                var asanaValue = this.getAttribute('data-asana-value');
                var dealPipelineIdVal = this.getAttribute('data-deal-pipeline-id');
                if (!dealPipelineIdVal || !fieldKey) return;
                if (typeof API.updateDealPipeline !== 'function') return;
                var label = fieldKey;
                for (var k = 0; k < ASANA_OTHER_FIELDS_CONFIG.length; k++) { if (ASANA_OTHER_FIELDS_CONFIG[k].key === fieldKey) { label = ASANA_OTHER_FIELDS_CONFIG[k].label; break; } }
                var payload = {};
                if (fieldKey === 'unit_count') {
                    var num = parseInt(asanaValue, 10);
                    if (!isNaN(num)) payload.UnitCount = num; else payload.UnitCount = null;
                } else if (fieldKey === 'stage') {
                    payload.Stage = asanaValue != null ? asanaValue : '';
                } else if (fieldKey === 'bank') {
                    payload.Bank = asanaValue != null ? asanaValue : '';
                } else if (fieldKey === 'product_type') {
                    payload.ProductType = asanaValue != null ? asanaValue : '';
                } else if (fieldKey === 'location') {
                    var loc = (asanaValue || '').trim();
                    if (loc) {
                        var commaIdx = loc.lastIndexOf(',');
                        if (commaIdx > 0) {
                            payload.City = loc.slice(0, commaIdx).trim();
                            payload.State = loc.slice(commaIdx + 1).trim();
                        } else {
                            payload.City = loc;
                        }
                    } else {
                        payload.City = '';
                        payload.State = '';
                    }
                } else if (fieldKey === 'precon_manager') {
                    var asanaPreConName = (asanaValue || '').trim();
                    if (!asanaPreConName) return;
                    btn.disabled = true;
                    var rowForPreCon = btn.closest('.deal-detail-asana-field-row');
                    if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg">Looking up Pre-Con Manager…</span>';
                    if (typeof API.getAllPreConManagers !== 'function') {
                        if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Pre-Con Manager list is not available. Use the deal form to assign.</span>';
                        btn.disabled = false;
                        return;
                    }
                    API.getAllPreConManagers().then(function(res) {
                        if (!res || !res.success || !Array.isArray(res.data)) {
                            if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Could not load Pre-Con Manager list.</span>';
                            btn.disabled = false;
                            return;
                        }
                        var nameLower = asanaPreConName.toLowerCase();
                        var match = res.data.find(function(m) { return ((m.FullName || m.PreConManagerName || '').trim().toLowerCase() === nameLower); });
                        if (!match) {
                            if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">No Pre-Con Manager in the database matches &quot;' + (asanaPreConName.replace(/</g, '&lt;')) + '&quot;. Add them in Settings or use the deal form to assign.</span>';
                            btn.disabled = false;
                            return;
                        }
                        var preConPayload = { PreConManagerId: match.PreConManagerId };
                        if (typeof console !== 'undefined') console.log('[Override DB field] REQUEST →', { dealPipelineId: dealPipelineIdVal, fieldKey: fieldKey, payload: preConPayload });
                        API.updateDealPipeline(dealPipelineIdVal, preConPayload).then(function(response) {
                            if (typeof console !== 'undefined') console.log('[Override DB field] RESPONSE from database ←', response);
                            if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg">Database updated to match Asana (' + (match.FullName || match.PreConManagerName || '').replace(/</g, '&lt;') + ').</span>';
                            if (typeof allDeals !== 'undefined' && Array.isArray(allDeals)) {
                                var idx = allDeals.findIndex(function(d) { return (d.DealPipelineId || (d._original && d._original.DealPipelineId)) === parseInt(dealPipelineIdVal, 10); });
                                if (idx >= 0) {
                                    var d = allDeals[idx];
                                    d['Pre-Con'] = match.FullName || match.PreConManagerName;
                                    d.preCon = d['Pre-Con'];
                                    d.PreConManagerId = match.PreConManagerId;
                                    if (d._original) { d._original.PreConManagerId = match.PreConManagerId; d._original.PreConManagerName = d['Pre-Con']; }
                                }
                            }
                        }).catch(function(e) {
                            if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Update failed: ' + (e && e.message ? String(e.message).replace(/</g, '&lt;') : 'Unknown error') + '</span>';
                            if (typeof console !== 'undefined') console.error('[Override DB field] failed', e);
                            btn.disabled = false;
                        });
                    }).catch(function(e) {
                        if (rowForPreCon) rowForPreCon.innerHTML = '<strong>Pre-Con Manager:</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Could not load Pre-Con Manager list.</span>';
                        btn.disabled = false;
                        if (typeof console !== 'undefined') console.error(e);
                    });
                    return;
                }
                if (Object.keys(payload).length === 0) return;
                btn.disabled = true;
                if (typeof console !== 'undefined') {
                    console.log('[Override DB field] REQUEST →', { dealPipelineId: dealPipelineIdVal, fieldKey: fieldKey, payload: payload });
                }
                API.updateDealPipeline(dealPipelineIdVal, payload).then(function(response) {
                    if (typeof console !== 'undefined') {
                        console.log('[Override DB field] RESPONSE from database ←', response);
                        console.log('[Override DB field] rowsUpdated:', response && response.rowsUpdated, '| message:', response && response.message);
                    }
                    var row = btn.closest('.deal-detail-asana-field-row');
                    var successMsg = (fieldKey === 'location' && response && response.rowsUpdated === 0) ? 'Database (city/state) updated to match Asana.' : 'Database updated to match Asana.';
                    if (row) row.innerHTML = '<strong>' + label + ':</strong> <span class="deal-detail-asana-discrepancy-msg">' + successMsg + '</span>';
                    else btn.outerHTML = '<span class="deal-detail-asana-discrepancy-msg">Database ' + label + ' updated to match Asana.</span>';
                    if (typeof allDeals !== 'undefined' && Array.isArray(allDeals)) {
                        var idx = allDeals.findIndex(function(d) { return (d.DealPipelineId || (d._original && d._original.DealPipelineId)) === parseInt(dealPipelineIdVal, 10); });
                        if (idx >= 0) {
                            var d = allDeals[idx];
                            if (fieldKey === 'unit_count') { d['Unit Count'] = payload.UnitCount; d.unitCount = payload.UnitCount; }
                            else if (fieldKey === 'stage') { d.Stage = payload.Stage; d.stage = payload.Stage; }
                            else if (fieldKey === 'bank') { d.Bank = payload.Bank; d.bank = payload.Bank; }
                            else if (fieldKey === 'product_type') { d['Product Type'] = payload.ProductType; d.productType = payload.ProductType; }
                            else if (fieldKey === 'location') {
                                d.Location = (payload.City || '') + (payload.State ? ', ' + payload.State : ''); d.location = d.Location;
                                if (payload.City != null) d.City = payload.City; if (payload.State != null) d.State = payload.State;
                                if (d._original) { d._original.City = payload.City != null ? payload.City : d._original.City; d._original.State = payload.State != null ? payload.State : d._original.State; d._original.Location = d.Location; }
                            }
                        }
                    }
                    // Re-render current view so list/timeline/map shows updated data when modal is closed
                    if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined' && Array.isArray(allDeals)) {
                        switchView(currentView, allDeals);
                    }
                }).catch(function(e) {
                    btn.disabled = false;
                    if (typeof console !== 'undefined') console.error('[Override DB field] failed', e);
                    var row = btn.closest('.deal-detail-asana-field-row');
                    var errMsg = (e && e.message) ? String(e.message).replace(/</g, '&lt;') : 'Update failed. Try the deal Edit form to change City/State.';
                    if (row) row.innerHTML = '<strong>' + (label || 'Location') + ':</strong> <span class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">' + errMsg + '</span>';
                });
            });
        });
    }
}

// Load Asana start-date discrepancy for deal detail (match by task name to deal name; show and offer remedies if admin)
function loadDealDetailAsanaDiscrepancy(modal, deal) {
    const wrap = modal && modal.querySelector('#deal-detail-asana-discrepancy-wrap');
    const content = modal && modal.querySelector('#deal-detail-asana-discrepancy-content');
    if (!wrap || !content) return;
    if (typeof API === 'undefined' || !API.getAsanaUpcomingTasks) return;

    const dealName = (deal.Name || deal.name || '').trim();
    const dbStartDate = deal['Start Date'] || deal.startDate;
    const dbDateStr = dbStartDate ? toNormalizedDateString(dbStartDate) || null : null;

    API.getAsanaUpcomingTasks({ daysAhead: 365, daysBack: 730 }).then(function(res) {
        if (!res || !res.success || !Array.isArray(res.data)) return;
        const projects = res.data || [];
        const candidates = [];
        for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            const projName = (project.projectName || project.name || '').trim();
            const tasks = project.tasks || [];
            if (asanaProjectNameMatchesDeal(projName, dealName) && tasks.length > 0) {
                candidates.push({ task: tasks[0], score: asanaMatchQuality(projName, dealName), byProject: true });
            }
            for (let j = 0; j < tasks.length; j++) {
                const task = tasks[j];
                const taskName = (task.name || '').trim();
                if (asanaProjectNameMatchesDeal(taskName, dealName)) {
                    const score = asanaMatchQuality(taskName, dealName);
                    if (!candidates.some(c => c.task.gid === task.gid)) candidates.push({ task: task, score: score, byProject: false });
                }
            }
        }
        candidates.sort(function(a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return (b.byProject ? 1 : 0) - (a.byProject ? 1 : 0);
        });
        const matchedTask = candidates.length > 0 ? candidates[0].task : null;
        if (!matchedTask) return;

        // Use Asana custom field "Start Date" only; never treat due_on as start date.
        const asanaStartDateStr = (matchedTask.start_date || matchedTask.start_date_custom || '').trim() || null;

        const isAdmin = typeof isAuthenticated !== 'undefined' && isAuthenticated;
        const asanaUrl = (matchedTask.permalink_url || 'https://app.asana.com/0/0/' + (matchedTask.gid || '')).replace(/"/g, '&quot;');

        // Check Procore: when project is in Procore and start date is 60+ days in past, Procore overrides DB and Asana
        let procoreDateStr = null;
        const projectId = deal.ProjectId != null ? deal.ProjectId : (deal._original && deal._original.ProjectId);
        if (projectId && typeof window.PROCORE_MATCHES !== 'undefined' && window.PROCORE_MATCHES) {
            const projectIdNum = typeof projectId === 'number' ? projectId : parseInt(projectId, 10);
            let procoreMatch = window.PROCORE_MATCHES.get(projectIdNum) || window.PROCORE_MATCHES.get(projectId) || window.PROCORE_MATCHES.get(String(projectId));
            if (!procoreMatch) {
                const allKeys = Array.from(window.PROCORE_MATCHES.keys());
                const foundKey = allKeys.find(function(k) { return k == projectId || k == projectIdNum || String(k) === String(projectId) || Number(k) === projectIdNum; });
                if (foundKey !== undefined) procoreMatch = window.PROCORE_MATCHES.get(foundKey);
            }
            if (procoreMatch && procoreMatch.actualstartdate && typeof isProcoreStartDateOverride === 'function' && isProcoreStartDateOverride(procoreMatch.actualstartdate)) {
                procoreDateStr = procoreMatch.actualstartdate;
                if (procoreDateStr.indexOf('T') !== -1) procoreDateStr = procoreDateStr.split('T')[0];
            }
        }

        if (!asanaStartDateStr) {
            var dbFormattedNoDate = dbDateStr ? formatDate(dbStartDate) : '';
            // When Procore override applies, show Procore date and prefer it for DB/Asana
            var dateToUse = procoreDateStr || dbDateStr;
            var dateToUseFormatted = dateToUse ? (dateToUse === procoreDateStr ? formatDate(dateToUse) : dbFormattedNoDate) : dbFormattedNoDate;
            if (!dateToUseFormatted && dateToUse) {
                try { dateToUseFormatted = formatDate(new Date(dateToUse)); } catch (e) { dateToUseFormatted = dateToUse; }
            }
            var msg = 'Asana has no start date for this project.';
            if (procoreDateStr) {
                msg += ' This project is in <strong>Procore</strong> with start date <strong>' + (dateToUseFormatted.replace(/</g, '&lt;')) + '</strong> (60+ days in past, so Procore overrides).';
                if (dbDateStr && dbDateStr !== procoreDateStr) msg += ' Database currently has <strong>' + (dbFormattedNoDate.replace(/</g, '&lt;')) + '</strong>.';
            } else if (dbDateStr) {
                msg += ' Database start date is <strong>' + (dbFormattedNoDate.replace(/</g, '&lt;')) + '</strong>. Do you want to fill the start date in Asana with the database date?';
            }
            content.innerHTML =
                '<p class="deal-detail-asana-discrepancy-msg">' + msg + '</p>' +
                (isAdmin && dateToUse
                    ? '<div class="deal-detail-asana-remedy-btns">' +
                      '<button type="button" class="deal-detail-btn deal-detail-asana-fill-date" data-task-gid="' + (matchedTask.gid || '').replace(/"/g, '&quot;') + '" data-db-date="' + (dateToUse || '').replace(/"/g, '&quot;') + '" data-procore-date="' + (procoreDateStr || '').replace(/"/g, '&quot;') + '" data-deal-pipeline-id="' + (deal.DealPipelineId || (deal._original && deal._original.DealPipelineId) || '').replace(/"/g, '&quot;') + '" data-project-id="' + (projectId != null ? String(projectId).replace(/"/g, '&quot;') : '') + '">' + (procoreDateStr ? 'Set Asana (and database if needed) to Procore start date' : 'Fill start date in Asana with database date') + '</button>' +
                      '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>' +
                      '</div>'
                    : '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>');
            wrap.style.display = 'block';
            if (isAdmin && dateToUse) {
                modal.querySelectorAll('.deal-detail-asana-fill-date').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var taskGid = this.getAttribute('data-task-gid');
                        var dateToSet = this.getAttribute('data-db-date');
                        var procoreDate = this.getAttribute('data-procore-date');
                        var dealPipelineIdForDate = this.getAttribute('data-deal-pipeline-id');
                        var projectIdForDate = this.getAttribute('data-project-id');
                        if (!taskGid || !dateToSet) return;
                        if (typeof API.updateAsanaTaskStartDate !== 'function') {
                            if (typeof console !== 'undefined') console.warn('API.updateAsanaTaskStartDate not implemented');
                            return;
                        }
                        btn.disabled = true;
                        var updateDbToo = procoreDate && dealPipelineIdForDate;
                        function doneAsana() {
                            API.updateAsanaTaskStartDate(taskGid, dateToSet).then(function() {
                                content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg">Asana Start Date set to ' + (procoreDate ? 'Procore' : 'database') + ' date.</p>' +
                                    '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>';
                            }).catch(function(e) {
                                btn.disabled = false;
                                if (typeof console !== 'undefined') console.error(e);
                            });
                        }
                        if (updateDbToo && typeof API.updateDealPipeline === 'function' && dealPipelineIdForDate) {
                            API.updateDealPipeline(dealPipelineIdForDate, { StartDate: dateToSet }).then(function() {
                                if (projectIdForDate && typeof API.updateProject === 'function') {
                                    API.updateProject(projectIdForDate, { EstimatedConstructionStartDate: dateToSet }).then(doneAsana).catch(doneAsana);
                                } else {
                                    doneAsana();
                                }
                            }).catch(function() { doneAsana(); });
                        } else {
                            doneAsana();
                        }
                    });
                });
            }
            buildAsanaOtherFieldsSection(modal, deal, matchedTask, asanaUrl, isAdmin);
            return;
        }

        const asanaDateStr = asanaStartDateStr;
        const asanaDate = parseLocalDateOnly(asanaDateStr) || new Date(asanaDateStr);
        const dbDate = dbDateStr ? (parseLocalDateOnly(dbDateStr) || new Date(dbDateStr)) : null;
        if (!dbDate || isNaN(dbDate.getTime())) return;
        const normDb = toNormalizedDateString(dbStartDate);
        const normAsana = toNormalizedDateString(asanaDateStr);
        const sameDay = normDb && normAsana && normDb === normAsana;
        const dbFormatted = formatDate(dbStartDate);
        const asanaFormatted = formatDate(asanaDate);
        const procoreFormatted = procoreDateStr ? formatDate(procoreDateStr) : '';
        const dealPipelineIdForBtn = deal.DealPipelineId || (deal._original && deal._original.DealPipelineId);

        // When Procore has start date 60+ days in the past, it is the only source of truth—no choice between DB and Asana
        if (procoreDateStr) {
            content.innerHTML =
                '<p class="deal-detail-asana-discrepancy-msg">This project is in <strong>Procore</strong> with start date <strong>' + (procoreFormatted.replace(/</g, '&lt;')) + '</strong> (60+ days in past). Procore overrides both database and Asana—they are set to this date when the app loads.</p>' +
                '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>';
        } else if (sameDay) {
            content.innerHTML =
                '<p class="deal-detail-asana-discrepancy-msg">Database and Asana start dates match (<strong>' + (dbFormatted.replace(/</g, '&lt;')) + '</strong>).</p>' +
                '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>';
        } else {
            content.innerHTML =
                '<p class="deal-detail-asana-discrepancy-msg">Database start date is <strong>' + (dbFormatted.replace(/</g, '&lt;')) + '</strong>; Asana start date for this project is <strong>' + (asanaFormatted.replace(/</g, '&lt;')) + '</strong>.</p>' +
                (isAdmin
                    ? '<p class="deal-detail-asana-remedies">Correct:</p>' +
                      '<div class="deal-detail-asana-remedy-btns">' +
                      '<button type="button" class="deal-detail-btn deal-detail-asana-override-asana" data-task-gid="' + (matchedTask.gid || '').replace(/"/g, '&quot;') + '" data-db-date="' + (dbDateStr || '').replace(/"/g, '&quot;') + '">Override Asana date with database date</button>' +
                      '<button type="button" class="deal-detail-btn deal-detail-asana-override-db" data-task-gid="' + (matchedTask.gid || '').replace(/"/g, '&quot;') + '" data-asana-date="' + (asanaDateStr || '').replace(/"/g, '&quot;') + '" data-deal-pipeline-id="' + (dealPipelineIdForBtn != null ? String(dealPipelineIdForBtn).replace(/"/g, '&quot;') : '') + '">Override database date with Asana date</button>' +
                      '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>' +
                      '</div>'
                    : '<p class="deal-detail-asana-view-only">Only admins can correct dates.</p>' +
                      '<a href="' + asanaUrl + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>');
        }
        wrap.style.display = 'block';

        if (isAdmin && !sameDay && !procoreDateStr) {
            const dealPipelineId = deal.DealPipelineId || (deal._original && deal._original.DealPipelineId);
            modal.querySelectorAll('.deal-detail-asana-override-asana').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const taskGid = this.getAttribute('data-task-gid');
                    const dbDate = this.getAttribute('data-db-date');
                    if (!taskGid || !dbDate) return;
                    if (typeof API.updateAsanaTaskStartDate !== 'function') {
                        if (typeof console !== 'undefined') console.warn('API.updateAsanaTaskStartDate not implemented');
                        return;
                    }
                    btn.disabled = true;
                    API.updateAsanaTaskStartDate(taskGid, dbDate).then(function() {
                        content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg">Asana Start Date updated to match database.</p>';
                    }).catch(function(e) {
                        btn.disabled = false;
                        if (typeof console !== 'undefined') console.error(e);
                    });
                });
            });
            modal.querySelectorAll('.deal-detail-asana-override-db').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const asanaDateRaw = this.getAttribute('data-asana-date');
                    const idFromBtn = this.getAttribute('data-deal-pipeline-id');
                    const dealPipelineIdToUse = (idFromBtn != null && idFromBtn !== '') ? idFromBtn : dealPipelineId;
                    if (!asanaDateRaw) return;
                    if (!dealPipelineIdToUse) {
                        content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Deal pipeline ID not found for this project. The database cannot be updated from this view.</p>';
                        return;
                    }
                    if (typeof API.updateDealPipeline !== 'function') return;
                    var asanaDateNorm = (typeof toNormalizedDateString === 'function' && toNormalizedDateString(asanaDateRaw)) ? toNormalizedDateString(asanaDateRaw) : (asanaDateRaw && asanaDateRaw.trim().length >= 10 && /^\d{4}-\d{2}-\d{2}$/.test(asanaDateRaw.trim().slice(0, 10)) ? asanaDateRaw.trim().slice(0, 10) : '');
                    if (!asanaDateNorm || !/^\d{4}-\d{2}-\d{2}$/.test(asanaDateNorm)) {
                        content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Could not parse Asana date. Expected YYYY-MM-DD.</p>';
                        return;
                    }
                    btn.disabled = true;
                    content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg">Saving database date…</p>';
                    var datePayload = { StartDate: asanaDateNorm };
                    if (typeof console !== 'undefined') {
                        console.log('[Override DB date] REQUEST →', { dealPipelineId: dealPipelineIdToUse, payload: datePayload });
                    }
                    API.updateDealPipeline(dealPipelineIdToUse, datePayload).then(function(response) {
                        if (typeof console !== 'undefined') {
                            console.log('[Override DB date] RESPONSE from database ←', response);
                            console.log('[Override DB date] rowsUpdated:', response && response.rowsUpdated, '| message:', response && response.message);
                            console.log('[Override DB date] saved StartDate from server:', response && response.data && (response.data.StartDate != null ? response.data.StartDate : response.data['Start Date']));
                        }
                        // Use server-returned date so we show what was actually saved
                        var savedDate = (response && response.data && (response.data.StartDate != null ? response.data.StartDate : response.data['Start Date'])) ? (response.data.StartDate || response.data['Start Date']) : asanaDateNorm;
                        var dateToShow = (typeof toNormalizedDateString === 'function' && toNormalizedDateString(savedDate)) ? toNormalizedDateString(savedDate) : (savedDate && String(savedDate).trim().slice(0, 10));
                        if (!dateToShow) dateToShow = asanaDateNorm;
                        deal['Start Date'] = dateToShow;
                        deal.StartDate = dateToShow;
                        if (deal._original) {
                            deal._original.StartDate = dateToShow;
                            deal._original['Start Date'] = dateToShow;
                        }
                        var idNum = Number(dealPipelineIdToUse);
                        if (typeof allDeals !== 'undefined' && Array.isArray(allDeals)) {
                            var idx = allDeals.findIndex(function(d) {
                                var did = d.DealPipelineId != null ? d.DealPipelineId : (d._original && d._original.DealPipelineId != null ? d._original.DealPipelineId : null);
                                return did != null && (Number(did) === idNum || String(did) === String(dealPipelineIdToUse));
                            });
                            if (idx >= 0) {
                                allDeals[idx]['Start Date'] = dateToShow;
                                allDeals[idx].StartDate = dateToShow;
                                if (allDeals[idx]._original) {
                                    allDeals[idx]._original.StartDate = dateToShow;
                                    allDeals[idx]._original['Start Date'] = dateToShow;
                                }
                            }
                        }
                        content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg">Database start date updated to match Asana.</p>' +
                            '<a href="' + (matchedTask.permalink_url || '').replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="deal-detail-btn deal-detail-asana-view-link">View deal in Asana</a>';
                        var overviewSection = modal.querySelector('.deal-detail-section');
                        if (overviewSection) {
                            var items = overviewSection.querySelectorAll('.deal-detail-item');
                            for (var i = 0; i < items.length; i++) {
                                var label = items[i].querySelector('label');
                                if (label && label.textContent.trim() === 'Start Date') {
                                    var span = items[i].querySelector('span');
                                    if (span) {
                                        try {
                                            var d = new Date(dateToShow);
                                            var now = new Date();
                                            var diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
                                            var timeInfo = diffDays >= 0 ? (diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' away') : (Math.abs(diffDays) + ' day' + (Math.abs(diffDays) !== 1 ? 's' : '') + ' ago');
                                            span.innerHTML = formatDate(dateToShow) + ' <span class="time-info">(' + timeInfo + ')</span>';
                                        } catch (e) {
                                            span.textContent = formatDate(dateToShow);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        // Refetch from API (not Domo) so we get instant fresh data after save
                        (function refetchDealsAfterDateOverride() {
                            if (typeof API.getAllDealPipelines !== 'function') return;
                            API.getAllDealPipelines({ forceApi: true }).then(function(refreshResponse) {
                                if (!refreshResponse.success || !refreshResponse.data) return;
                                var dbDeals = refreshResponse.data;
                                var loansPromise = typeof API.getAllLoans === 'function' ? API.getAllLoans() : Promise.resolve({ success: false });
                                var banksPromise = typeof API.getAllBanks === 'function' ? API.getAllBanks() : Promise.resolve({ success: false });
                                Promise.all([loansPromise, banksPromise]).then(function(results) {
                                    var loansMap = {};
                                    var banksMap = {};
                                    if (results[0] && results[0].success && results[0].data) {
                                        results[0].data.forEach(function(loan) {
                                            if (loan.ProjectId) {
                                                if (!loansMap[loan.ProjectId]) loansMap[loan.ProjectId] = [];
                                                loansMap[loan.ProjectId].push(loan);
                                            }
                                        });
                                    }
                                    if (results[1] && results[1].success && results[1].data) {
                                        results[1].data.forEach(function(bank) {
                                            if (bank.BankId) banksMap[bank.BankId] = bank;
                                        });
                                    }
                                    var mapped = dbDeals.map(function(d) { return mapDealPipelineDataToDeal(d, loansMap, banksMap); }).filter(function(d) { return d !== null; });
                                    var filtered = mapped.filter(function(d) {
                                        var stage = normalizeStage(d.Stage || d.stage);
                                        return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
                                    });
                                    if (typeof allDeals !== 'undefined' && Array.isArray(filtered)) {
                                        allDeals.length = 0;
                                        filtered.forEach(function(d) { allDeals.push(d); });
                                        if (typeof window !== 'undefined') window.allDeals = allDeals;
                                        if (typeof buildBankNameMap === 'function') buildBankNameMap(allDeals);
                                        if (typeof renderDealList === 'function') renderDealList(allDeals);
                                    }
                                }).catch(function() {});
                            }).catch(function() {});
                        })();
                    }).catch(function(e) {
                        btn.disabled = false;
                        var errMsg = (e && (e.message || (e.error && e.error.message))) ? (e.message || e.error.message) : 'Update failed';
                        var hint = (errMsg && (errMsg.indexOf('401') !== -1 || errMsg.toLowerCase().indexOf('unauthorized') !== -1)) ? ' Check that you are logged in.' : '';
                        if (errMsg && errMsg.indexOf('fetch') !== -1) hint = ' Check your connection and that the API URL is correct.';
                        content.innerHTML = '<p class="deal-detail-asana-discrepancy-msg deal-detail-asana-error">Database update failed: ' + String(errMsg).replace(/</g, '&lt;') + hint + '</p>';
                        if (typeof console !== 'undefined') console.error('Override database date failed', e);
                    });
                });
            });
        }
        buildAsanaOtherFieldsSection(modal, deal, matchedTask, asanaUrl, isAdmin);
    }).catch(function() {});
}

// Build ordered list of deals for Previous/Next nav from current view (list, timeline, or upcoming-dates)
function getDealDetailNavList(deal) {
    var container = document.getElementById('deal-list-container');
    var all = (typeof allDeals !== 'undefined' ? allDeals : []);
    var navList = [];
    if (container) {
        var rows = container.querySelectorAll('.deal-row[data-deal-name]');
        if (!rows.length) rows = container.querySelectorAll('.timeline-card[data-deal-name]');
        if (!rows.length) rows = container.querySelectorAll('.upcoming-date-row[data-deal-name]');
        for (var i = 0; i < rows.length; i++) {
            var name = rows[i].getAttribute('data-deal-name');
            if (name) {
                var d = all.find(function(o) { return (o.Name || o.name) === name; });
                if (d) navList.push(d);
            }
        }
    }
    if (navList.length === 0 && all.length) navList = all.slice();
    var currentId = deal.DealPipelineId || (deal._original && deal._original.DealPipelineId);
    var idx = navList.findIndex(function(d) { return (d.DealPipelineId || (d._original && d._original.DealPipelineId)) === currentId; });
    if (idx < 0) idx = navList.findIndex(function(d) { return (d.Name || d.name) === (deal.Name || deal.name); });
    return { list: navList, index: idx, prev: idx > 0 ? navList[idx - 1] : null, next: idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null };
}

// Show deal detail page
function showDealDetail(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const location = getDealLocation(deal);
    const productType = getDealProductType(deal);
    const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
    const bank = deal.Bank || deal.bank;
    const units = deal['Unit Count'] || deal.unitCount;
    const preCon = deal['Pre-Con'] || deal.preCon || deal['Pre-Con Manager'];
    const notesRaw = deal.Notes || deal.notes || '';
    // Parse out auto-populated rejection reason; only show manually added notes in Notes section
    let rejectedReason = '';
    let manualNotes = notesRaw;
    const rejectionMatch = notesRaw.match(/^Rejection reason:\s*(.+?)(?:\n\n|$)/s);
    if (rejectionMatch) {
        rejectedReason = rejectionMatch[1].trim();
        manualNotes = notesRaw.replace(/^Rejection reason:\s*.+?(?:\n\n)?/s, '').trim();
    }
    
    // Get full address from Procore match or original data
    const address = deal._procoreMatch?.address || deal._original?.Address || null;
    
    // Calculate days until/ago
    let timeInfo = '';
    if (startDate) {
        try {
            const date = new Date(startDate);
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
                timeInfo = `${diffDays} day${diffDays !== 1 ? 's' : ''} away`;
            } else {
                timeInfo = `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
            }
        } catch (e) {
            // Date parsing failed
        }
    }
    const startDateControlledByProcore = !!(deal._procoreOverridesStartDate || (deal['Start Date Source'] && String(deal['Start Date Source']).toLowerCase() === 'procore'));
    
    var nav = getDealDetailNavList(deal);
    var navPosition = nav.list.length && nav.index >= 0 ? (nav.index + 1) + ' of ' + nav.list.length : '';
    
    const modal = document.createElement('div');
    modal.className = 'deal-detail-modal modal-overlay' + (typeof isMobileLayout === 'function' && isMobileLayout() ? ' deal-detail-modal-mobile' : '');
    modal.style.display = 'flex';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', (deal.Name || deal.name || 'Deal') + ' details');
    modal.innerHTML = `
        <div class="deal-detail-overlay"></div>
        <div class="deal-detail-content modal-content">
            <div class="deal-detail-header">
                <div class="deal-detail-nav">
                    <button type="button" class="deal-detail-nav-btn deal-detail-prev" ${nav.prev ? '' : ' disabled'} aria-label="Previous deal">‹ Previous</button>
                    <span class="deal-detail-nav-position">${navPosition}</span>
                    <button type="button" class="deal-detail-nav-btn deal-detail-next" ${nav.next ? '' : ' disabled'} aria-label="Next deal">Next ›</button>
                </div>
                <h2>${escapeHtml(deal.Name || deal.name || 'Unnamed Deal')}</h2>
                <div class="deal-detail-header-actions">
                    ${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '<button type="button" class="deal-detail-edit-btn deal-edit-btn-small" aria-label="Edit deal">Edit</button>' : ''}
                    <button class="deal-detail-close" aria-label="Close">&times;</button>
                </div>
            </div>
            <div class="deal-detail-body">
                <div class="deal-detail-section">
                    <h3>Overview</h3>
                    <div class="deal-detail-grid">
                        <div class="deal-detail-item">
                            <label>Stage</label>
                            <span class="stage-badge ${stageConfig.class}">${escapeHtml(stage)}</span>
                        </div>
                        ${location ? `
                        <div class="deal-detail-item">
                            <label>Location</label>
                            <span>${escapeHtml(location)}</span>
                        </div>
                        ` : ''}
                        ${address ? `
                        <div class="deal-detail-item">
                            <label>Address</label>
                            <span>${escapeHtml(address)}</span>
                        </div>
                        ` : ''}
                        ${productType ? `
                        <div class="deal-detail-item">
                            <label>Product Type</label>
                            <span>${escapeHtml(productType)}</span>
                        </div>
                        ` : ''}
                        ${units ? `
                        <div class="deal-detail-item">
                            <label>Unit Count</label>
                            <span>${escapeHtml(units)} units</span>
                        </div>
                        ` : ''}
                        ${bank ? `
                        <div class="deal-detail-item">
                            <label>Bank</label>
                            <span>${escapeHtml(bank)}</span>
                        </div>
                        ` : ''}
                        ${preCon ? `
                        <div class="deal-detail-item">
                            <label>Pre-Con Manager</label>
                            <span>${escapeHtml(preCon)}</span>
                        </div>
                        ` : ''}
                        ${startDate ? `
                        <div class="deal-detail-item">
                            <label>Start Date</label>
                            <span>${formatDate(startDate)}${timeInfo ? ` <span class="time-info">(${timeInfo})</span>` : ''}${startDateControlledByProcore ? ' <span class="deal-detail-procore-note">(controlled by Procore)</span>' : ''}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="deal-detail-section deal-detail-files-section" id="deal-detail-files-section" data-deal-pipeline-id="${deal.DealPipelineId || deal._original?.DealPipelineId || ''}">
                    <h3>Files</h3>
                    <p class="deal-detail-files-desc">${typeof isAuthenticated !== 'undefined' && isAuthenticated ? 'View, download, upload, rename, or delete files.' : 'View and download files. Only admins can upload, rename, or delete.'}</p>
                    <p class="deal-detail-files-map-tip">To have this deal show on the map: either <strong>manually enter Latitude and Longitude</strong> in the deal form (Edit or Core Data Management), or <strong>upload a .kmz file</strong> below—coordinates will be extracted and placed on the map.</p>
                    <div class="deal-detail-files-message" id="deal-detail-files-message" role="status" aria-live="polite"></div>
                    <input type="file" id="deal-detail-file-version-input" accept="*" style="display: none;" />
                    <div class="deal-detail-files-subsections" id="deal-detail-files-subsections">
                        <div class="deal-detail-files-subsection deal-detail-files-single" data-section="Other">
                            <div class="deal-detail-files-upload" id="deal-detail-files-upload-wrap" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Other" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Other">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Other"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                    </div>
                </div>
                ${deal._original ? `
                <div class="deal-detail-section">
                    <h3>Additional Information</h3>
                    <div class="deal-detail-grid">
                        ${(() => {
                            const orig = deal._original;
                            const additionalFields = [];
                            
                            // Land development pipeline attributes (Broker/Referral first)
                            if (deal.BrokerReferralName || orig.BrokerReferralSource || orig.BrokerReferralName) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Broker/Referral</label><span>${(deal.BrokerReferralName || orig.BrokerReferralSource || orig.BrokerReferralName || '').replace(/</g, '&lt;')}</span></div>`);
                            }
                            if (rejectedReason || orig.RejectedReason) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Rejected Reason</label><span>${(rejectedReason || orig.RejectedReason || '').replace(/</g, '&lt;')}</span></div>`);
                            }
                            if (deal.PriceRaw != null && deal.PriceRaw !== '' || orig.PriceRaw != null && orig.PriceRaw !== '') {
                                additionalFields.push(`<div class="deal-detail-item"><label>Price (raw)</label><span>${(deal.PriceRaw ?? orig.PriceRaw ?? '').toString().replace(/</g, '&lt;')}</span></div>`);
                            }
                            if (deal.ListingStatus || orig.ListingStatus) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Listed/Unlisted</label><span>${(deal.ListingStatus || orig.ListingStatus || '').replace(/</g, '&lt;')}</span></div>`);
                            }
                            if (deal.Zoning || orig.Zoning) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Zoning</label><span>${(deal.Zoning || orig.Zoning || '').replace(/</g, '&lt;')}</span></div>`);
                            }
                            if (deal.CountyParish || orig.County) {
                                additionalFields.push(`<div class="deal-detail-item"><label>County/Parish</label><span>${(deal.CountyParish || orig.County || '').replace(/</g, '&lt;')}</span></div>`);
                            }
                            // Region (if not already shown in location)
                            if (orig.Region && location && orig.Region !== location) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Region</label><span>${orig.Region}</span></div>`);
                            }

                            // City and State (if not already shown in location)
                            if (orig.City && (!location || !location.includes(orig.City))) {
                                additionalFields.push(`<div class="deal-detail-item"><label>City</label><span>${orig.City}</span></div>`);
                            }
                            if (orig.State && (!location || !location.includes(orig.State))) {
                                additionalFields.push(`<div class="deal-detail-item"><label>State</label><span>${orig.State}</span></div>`);
                            }
                            
                            // Units (if different from Unit Count)
                            if (orig.Units && orig.Units !== units) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Units</label><span>${orig.Units}</span></div>`);
                            }
                            
                            // Priority
                            if (orig.Priority) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Priority</label><span>${orig.Priority}</span></div>`);
                            }
                            
                            // Latitude / Longitude
                            if (orig.Latitude != null && orig.Latitude !== '') {
                                additionalFields.push(`<div class="deal-detail-item"><label>Latitude</label><span>${orig.Latitude}</span></div>`);
                            }
                            if (orig.Longitude != null && orig.Longitude !== '') {
                                additionalFields.push(`<div class="deal-detail-item"><label>Longitude</label><span>${orig.Longitude}</span></div>`);
                            }
                            
                            // Acreage
                            if (orig.Acreage) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Acreage</label><span>${orig.Acreage} acres</span></div>`);
                            }
                            
                            // Land Price
                            if (orig.LandPrice) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Land Price</label><span>$${parseFloat(orig.LandPrice).toLocaleString()}</span></div>`);
                            }
                            
                            // Price Per Unit (Land Price / Unit Count)
                            const landPrice = parseFloat(orig.LandPrice || 0);
                            const unitCount = parseInt(orig.UnitCount || orig.Units || deal['Unit Count'] || deal.unitCount || 0);
                            if (landPrice > 0 && unitCount > 0) {
                                const pricePerUnit = (landPrice / unitCount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                                additionalFields.push(`<div class="deal-detail-item"><label>Price Per Unit</label><span>$${pricePerUnit}</span></div>`);
                            }
                            
                            // PSA to Execution Date
                            if (orig.ExecutionDate) {
                                additionalFields.push(`<div class="deal-detail-item"><label>PSA to Execution Date</label><span>${formatDate(orig.ExecutionDate)}</span></div>`);
                            }
                            
                            // Due Diligence Date
                            if (orig.DueDiligenceDate) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Due Diligence Date</label><span>${formatDate(orig.DueDiligenceDate)}</span></div>`);
                            }
                            
                            // Closing Date
                            if (orig.ClosingDate) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Closing Date</label><span>${formatDate(orig.ClosingDate)}</span></div>`);
                            }
                            
                            // Construction Loan Closing Date
                            if (orig.ConstructionLoanClosingDate) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Construction Loan Closing</label><span>${formatDate(orig.ConstructionLoanClosingDate)}</span></div>`);
                            }
                            
                            // Purchasing Entity
                            if (orig.PurchasingEntity) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Purchasing Entity</label><span>${orig.PurchasingEntity}</span></div>`);
                            }
                            
                            // Cash
                            if (orig.Cash !== undefined && orig.Cash !== null) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Cash</label><span>${orig.Cash === true || orig.Cash === 'true' || orig.Cash === 1 ? 'Yes' : 'No'}</span></div>`);
                            }
                            
                            // Opportunity Zone
                            if (orig.OpportunityZone !== undefined && orig.OpportunityZone !== null) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Opportunity Zone</label><span>${orig.OpportunityZone === true || orig.OpportunityZone === 'true' || orig.OpportunityZone === 1 ? 'Yes' : 'No'}</span></div>`);
                            }
                            
                            // Closing Notes
                            if (orig.ClosingNotes) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Closing Notes</label><span>${orig.ClosingNotes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>`);
                            }
                            
                            // Database metadata
                            if (orig.CreatedAt || orig.createdat) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Created</label><span>${formatDate(orig.CreatedAt || orig.createdat)}</span></div>`);
                            }
                            
                            if (orig.ModifiedAt || orig.modifiedat) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Last Modified</label><span>${formatDate(orig.ModifiedAt || orig.modifiedat)}</span></div>`);
                            }
                            
                            if (orig.completed !== undefined) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Completed</label><span>${orig.completed === 'true' || orig.completed === true ? 'Yes' : 'No'}</span></div>`);
                            }
                            
                            // DealPipelineId and ProjectId
                            if (orig.DealPipelineId) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Deal Pipeline ID</label><span>${orig.DealPipelineId}</span></div>`);
                            }
                            
                            if (orig.ProjectId) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Project ID</label><span>${orig.ProjectId}</span></div>`);
                            }
                            
                            return additionalFields.join('');
                        })()}
                        </div>
                        </div>
                        ` : ''}
                <div class="deal-detail-section deal-detail-asana-discrepancy-section" id="deal-detail-asana-discrepancy-wrap" style="display: none;">
                    <h3>Asana sync</h3>
                    <div id="deal-detail-asana-discrepancy-content"></div>
                    <div id="deal-detail-asana-other-fields-content" class="deal-detail-asana-other-fields" style="margin-top: 16px;"></div>
                </div>
                ${manualNotes ? `
                <div class="deal-detail-section">
                    <h3>Notes</h3>
                    <div class="deal-detail-notes">
                        <pre>${manualNotes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.classList.add('deal-modal-open');
    
    const dealPipelineId = deal.DealPipelineId || deal._original?.DealPipelineId;
    const filesSection = modal.querySelector('#deal-detail-files-section');
    const filesMessageEl = modal.querySelector('#deal-detail-files-message');
    var DEAL_PIPELINE_FILE_SECTIONS = ['Land', 'Design and Permits', 'Comp Validation', 'Contractor', 'Legal', 'Underwriting', 'Other'];
    var sectionKeys = ['Other'];
    
    // Show message in Files section (works in sandboxed iframe where alert() is blocked)
    function showFilesMessage(text, isError) {
        if (!filesMessageEl) return;
        filesMessageEl.textContent = text;
        filesMessageEl.className = 'deal-detail-files-message' + (isError ? ' deal-detail-files-message-error' : '');
        filesMessageEl.style.display = 'block';
        clearTimeout(filesMessageEl._clearTimer);
        filesMessageEl._clearTimer = setTimeout(() => { filesMessageEl.textContent = ''; filesMessageEl.style.display = 'none'; }, 8000);
    }
    
    // True for PDF and common image types that browsers can display inline (no download required)
    function isViewableFile(fileName, contentType) {
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const viewableExts = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        if (viewableExts.includes(ext)) return true;
        const ct = (contentType || '').toLowerCase();
        if (ct === 'application/pdf' || ct.startsWith('image/')) return true;
        return false;
    }
    
    // Extract first coordinates from KML or KMZ file. KML order is longitude,latitude[,altitude]. Returns { latitude, longitude } or null.
    async function extractCoordinatesFromKmlOrKmz(file) {
        if (!file) return null;
        const name = (file.name || '').toLowerCase();
        let kmlText = null;
        if (name.endsWith('.kml')) {
            kmlText = await file.text();
        } else if (name.endsWith('.kmz') && typeof JSZip !== 'undefined') {
            const zip = await JSZip.loadAsync(file);
            const kmlEntry = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.kml'));
            if (!kmlEntry) return null;
            kmlText = await zip.files[kmlEntry].async('string');
        } else {
            return null;
        }
        if (!kmlText || !kmlText.trim()) return null;
        const coordMatch = kmlText.match(/<coordinates[^>]*>([^<]+)<\/coordinates>/i);
        if (!coordMatch) return null;
        const tokens = coordMatch[1].trim().split(/[\s,]+/).filter(Boolean);
        for (let i = 0; i + 1 < tokens.length; i++) {
            const lon = parseFloat(tokens[i]);
            const lat = parseFloat(tokens[i + 1]);
            if (!isNaN(lon) && !isNaN(lat) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                return { latitude: lat, longitude: lon };
            }
        }
        return null;
    }
    
    function displaySectionForAttachment(a, list) {
        var rootId = a.ParentAttachmentId != null ? a.ParentAttachmentId : a.DealPipelineAttachmentId;
        var root = list.find(function (x) { return x.DealPipelineAttachmentId == rootId; });
        var s = (root && root.Section && DEAL_PIPELINE_FILE_SECTIONS.indexOf(root.Section) >= 0) ? root.Section : 'Other';
        return s;
    }

    async function renderDealPopupFiles() {
        if (!dealPipelineId || !filesSection) return;
        var listElsBySection = {};
        sectionKeys.forEach(function (k) {
            var el = filesSection.querySelector('.deal-detail-files-list-section[data-section="' + k + '"]');
            if (el) listElsBySection[k] = el;
        });
        try {
            var res = await API.listDealPipelineAttachments(dealPipelineId);
            var list = res.data || [];
            var canEdit = typeof isAuthenticated !== 'undefined' && isAuthenticated;
            var emptyMsg = canEdit ? 'No files attached. Upload using the button above.' : 'No files attached.';
            if (list.length === 0) {
                sectionKeys.forEach(function (k) {
                    if (listElsBySection[k]) listElsBySection[k].innerHTML = '<span class="deal-detail-files-empty">' + (k === 'Other' ? emptyMsg : 'No files in this section.') + '</span>';
                });
                return;
            }
            var bySection = {};
            sectionKeys.forEach(function (k) { bySection[k] = []; });
            list.forEach(function (a) {
                bySection['Other'].push(a);
            });

            var token = (typeof API.getAuthToken === 'function' && API.getAuthToken()) || (typeof localStorage !== 'undefined' && localStorage.getItem('authToken'));
            async function getFetchErrorMessage(res) {
                try {
                    var json = await res.json();
                    return json && json.error && json.error.message ? json.error.message : res.statusText || 'Request failed';
                } catch (_) {
                    return res.statusText || 'Request failed';
                }
            }

            function attachFileListeners(listEl) {
                if (!listEl) return;
                listEl.querySelectorAll('.deal-detail-file-rename-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var attachmentId = parseInt(btn.dataset.attachmentId, 10);
                        var currentName = (btn.dataset.fileName || '').replace(/&quot;/g, '"');
                        var item = btn.closest('.deal-detail-file-item');
                        var nameEl = item.querySelector('.deal-detail-file-name');
                        var actionsEl = item.querySelector('.deal-detail-file-actions');
                        var input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'deal-detail-file-rename-input';
                        input.value = currentName;
                        input.placeholder = 'File name';
                        var saveBtn = document.createElement('button');
                        saveBtn.type = 'button';
                        saveBtn.className = 'deal-detail-files-confirm-btn deal-detail-file-rename-save';
                        saveBtn.textContent = 'Save';
                        var cancelBtn = document.createElement('button');
                        cancelBtn.type = 'button';
                        cancelBtn.className = 'deal-detail-files-confirm-btn deal-detail-file-rename-cancel';
                        cancelBtn.textContent = 'Cancel';
                        nameEl.replaceWith(input);
                        actionsEl.prepend(saveBtn, cancelBtn);
                        btn.remove();
                        input.focus();
                        input.select();
                        saveBtn.addEventListener('click', async function () {
                            var newName = (input.value || '').trim();
                            if (!newName) { showFilesMessage('Enter a file name.', true); return; }
                            try {
                                await API.updateDealPipelineAttachment(attachmentId, { FileName: newName });
                                renderDealPopupFiles();
                            } catch (e) {
                                showFilesMessage(e.message || 'Rename failed.', true);
                            }
                        });
                        cancelBtn.addEventListener('click', function () { renderDealPopupFiles(); });
                        input.addEventListener('keydown', function (e) {
                            if (e.key === 'Enter') saveBtn.click();
                            if (e.key === 'Escape') cancelBtn.click();
                        });
                    });
                });
                listEl.querySelectorAll('.deal-detail-file-view-btn').forEach(function (btn) {
                    btn.addEventListener('click', async function () {
                        var attachmentId = btn.dataset.attachmentId;
                        var url = API.getDealPipelineAttachmentDownloadUrl(attachmentId);
                        try {
                            var res = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
                            if (!res.ok) {
                                var msg = await getFetchErrorMessage(res);
                                var hint = msg.toLowerCase().includes('file not found') ? ' The file may not have been saved on the server.' : (msg.toLowerCase().includes('crypto is not defined') ? ' This is a server-side error: the backend must require the Node.js "crypto" module where it serves file URLs.' : '');
                                showFilesMessage(msg + hint, true);
                                return;
                            }
                            var blob = await res.blob();
                            var objectUrl = URL.createObjectURL(blob);
                            window.open(objectUrl, '_blank', 'noopener');
                        } catch (e) {
                            var msg = e.message || 'Could not open file.';
                            if (String(msg).toLowerCase().includes('crypto is not defined')) msg += ' This is a server-side error: the backend must require the Node.js "crypto" module where it serves file downloads.';
                            showFilesMessage(msg, true);
                        }
                    });
                });
                listEl.querySelectorAll('.deal-detail-file-download-btn').forEach(function (btn) {
                    btn.addEventListener('click', async function () {
                        var attachmentId = btn.dataset.attachmentId;
                        var fileName = (btn.dataset.fileName || 'file').replace(/&quot;/g, '"');
                        var url = API.getDealPipelineAttachmentDownloadUrl(attachmentId);
                        try {
                            var res = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
                            if (!res.ok) {
                                var msg = await getFetchErrorMessage(res);
                                var hint = msg.toLowerCase().includes('file not found') ? ' The file may not have been saved on the server. Check that the backend is storing uploads correctly.' : (msg.toLowerCase().includes('crypto is not defined') ? ' This is a server-side error: the backend must require the Node.js "crypto" module (e.g. const crypto = require("crypto")) where it serves or signs file URLs.' : '');
                                showFilesMessage(msg + hint, true);
                                return;
                            }
                            var blob = await res.blob();
                            var objectUrl = URL.createObjectURL(blob);
                            var a = document.createElement('a');
                            a.href = objectUrl;
                            a.download = fileName;
                            a.click();
                            URL.revokeObjectURL(objectUrl);
                        } catch (e) {
                            var msg = e.message || 'Download failed.';
                            if (String(msg).toLowerCase().includes('crypto is not defined')) msg += ' This is a server-side error: the backend must require the Node.js "crypto" module where it serves file downloads.';
                            showFilesMessage(msg, true);
                        }
                    });
                });
                listEl.querySelectorAll('.deal-detail-file-delete').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var attachmentId = parseInt(btn.dataset.attachmentId, 10);
                        if (!filesMessageEl) return;
                        clearTimeout(filesMessageEl._clearTimer);
                        filesMessageEl._clearTimer = null;
                        filesMessageEl.innerHTML = 'Delete this file? This cannot be undone. <button type="button" class="deal-detail-files-confirm-btn deal-detail-files-confirm-delete">Yes, delete</button> <button type="button" class="deal-detail-files-confirm-btn deal-detail-files-confirm-cancel">Cancel</button>';
                        filesMessageEl.style.display = 'block';
                        filesMessageEl.className = 'deal-detail-files-message';
                        filesMessageEl.dataset.pendingAttachmentId = String(attachmentId);
                        filesMessageEl.querySelector('.deal-detail-files-confirm-cancel').addEventListener('click', function () {
                            filesMessageEl.textContent = '';
                            filesMessageEl.style.display = 'none';
                            filesMessageEl.removeAttribute('data-pending-attachment-id');
                        });
                        filesMessageEl.querySelector('.deal-detail-files-confirm-delete').addEventListener('click', async function () {
                            var id = parseInt(filesMessageEl.dataset.pendingAttachmentId, 10);
                            filesMessageEl.textContent = '';
                            filesMessageEl.style.display = 'none';
                            filesMessageEl.removeAttribute('data-pending-attachment-id');
                            try {
                                await API.deleteDealPipelineAttachment(id);
                                renderDealPopupFiles();
                            } catch (e) {
                                showFilesMessage(e.message || 'Delete failed.', true);
                            }
                        });
                    });
                });
                listEl.querySelectorAll('.deal-detail-file-upload-version-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var parentId = btn.dataset.parentId;
                        var versionInput = document.getElementById('deal-detail-file-version-input');
                        if (versionInput && parentId) {
                            versionInput.dataset.parentId = parentId;
                            versionInput.value = '';
                            versionInput.click();
                        }
                    });
                });
            }

            sectionKeys.forEach(function (sectionKey) {
                var listEl = listElsBySection[sectionKey];
                if (!listEl) return;
                var sectionList = bySection[sectionKey] || [];
                if (sectionList.length === 0) {
                    listEl.innerHTML = '<span class="deal-detail-files-empty">No files in this section.</span>';
                    return;
                }
                var docGroups = [];
                if (sectionList.some(function (a) { return a.ParentAttachmentId != null; })) {
                    var byRoot = {};
                    sectionList.forEach(function (a) {
                        var rootId = a.ParentAttachmentId != null ? a.ParentAttachmentId : a.DealPipelineAttachmentId;
                        if (!byRoot[rootId]) byRoot[rootId] = [];
                        byRoot[rootId].push(a);
                    });
                    docGroups = Object.keys(byRoot).map(function (rootId) {
                        return { key: rootId, versions: (byRoot[rootId] || []).slice().sort(function (x, y) { return new Date(y.CreatedAt || 0) - new Date(x.CreatedAt || 0); }) };
                    });
                } else {
                    var byName = {};
                    sectionList.forEach(function (a) {
                        var key = (a.FileName || '').toLowerCase().trim() || String(a.DealPipelineAttachmentId);
                        if (!byName[key]) byName[key] = [];
                        byName[key].push(a);
                    });
                    docGroups = Object.keys(byName).map(function (k) {
                        return { key: k, versions: (byName[k] || []).slice().sort(function (x, y) { return new Date(y.CreatedAt || 0) - new Date(x.CreatedAt || 0); }) };
                    });
                }
                var projectName = (deal.ProjectName || deal.Name || deal.name || '').trim().replace(/"/g, '&quot;');
                var downloadFileNamePrefix = projectName ? projectName + ' - ' : '';
                var html = '';
                docGroups.forEach(function (group) {
                    var versions = group.versions;
                    var latest = versions[0];
                    var versionCount = versions.length;
                    var sizeKb = (latest.FileSizeBytes / 1024).toFixed(1);
                    var dateStr = latest.CreatedAt ? formatDate(latest.CreatedAt) : '—';
                    var deleteBtn = canEdit
                        ? '<button type="button" class="deal-detail-file-delete" data-attachment-id="' + latest.DealPipelineAttachmentId + '" title="Delete (admin only)">Delete</button>'
                        : '<span class="deal-detail-file-delete-disabled" title="Only admins can delete files.">Delete (admin only)</span>';
                    var renameBtn = canEdit
                        ? '<button type="button" class="deal-detail-file-rename-btn" data-attachment-id="' + latest.DealPipelineAttachmentId + '" data-file-name="' + (latest.FileName || '').replace(/"/g, '&quot;') + '" title="Rename">Rename</button>'
                        : '';
                    var fileName = (latest.FileName || 'File').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    var fileNameAttr = (latest.FileName || '').replace(/"/g, '&quot;');
                    var downloadFileNameAttr = downloadFileNamePrefix + fileNameAttr;
                    var versionLabel = versionCount > 1 ? ' <span class="deal-detail-file-version-badge">Version ' + versionCount + ' (current)</span>' : '';
                    var uploadNewVersionBtn = canEdit
                        ? ' <button type="button" class="deal-detail-file-upload-version-btn" data-parent-id="' + latest.DealPipelineAttachmentId + '" title="Upload new version">Upload new version</button>'
                        : '';
                    var viewableLatest = isViewableFile(latest.FileName, latest.ContentType);
                    var viewBtnLatest = viewableLatest
                        ? '<button type="button" class="deal-detail-file-view-btn" data-attachment-id="' + latest.DealPipelineAttachmentId + '" data-file-name="' + fileNameAttr + '" title="View in browser">View</button>'
                        : '';
                    html += '<div class="deal-detail-file-doc" data-parent-id="' + latest.DealPipelineAttachmentId + '"><div class="deal-detail-file-item" data-attachment-id="' + latest.DealPipelineAttachmentId + '"><span class="deal-detail-file-name" title="' + fileNameAttr + '">' + fileName + '</span>' + versionLabel + '<span class="deal-detail-file-meta">' + sizeKb + ' KB · ' + dateStr + '</span><div class="deal-detail-file-actions">' + renameBtn + viewBtnLatest + '<button type="button" class="deal-detail-file-download-btn" data-attachment-id="' + latest.DealPipelineAttachmentId + '" data-file-name="' + downloadFileNameAttr + '" title="Download">Download</button>' + deleteBtn + uploadNewVersionBtn + '</div></div>';
                    if (versions.length > 1) {
                        html += '<div class="deal-detail-file-version-history">';
                        versions.slice(1).forEach(function (a, i) {
                            var vNum = versions.length - i;
                            var vDate = a.CreatedAt ? formatDate(a.CreatedAt) : '—';
                            var vName = (a.FileName || '').replace(/"/g, '&quot;');
                            var vDownloadName = downloadFileNamePrefix + vName;
                            var viewableVer = isViewableFile(a.FileName, a.ContentType);
                            var viewBtnVer = viewableVer
                                ? '<button type="button" class="deal-detail-file-view-btn" data-attachment-id="' + a.DealPipelineAttachmentId + '" data-file-name="' + vName + '" title="View in browser">View</button>'
                                : '';
                            html += '<div class="deal-detail-file-version-row"><span class="deal-detail-file-version-label">Version ' + vNum + '</span><span class="deal-detail-file-meta">' + vDate + '</span>' + viewBtnVer + '<button type="button" class="deal-detail-file-download-btn" data-attachment-id="' + a.DealPipelineAttachmentId + '" data-file-name="' + vDownloadName + '" title="Download">Download</button></div>';
                        });
                        html += '</div>';
                    }
                    html += '</div>';
                });
                listEl.innerHTML = html;
                attachFileListeners(listEl);
            });
        } catch (e) {
            var msg = (e && e.message) ? e.message : 'Could not load files.';
            sectionKeys.forEach(function (k) {
                if (listElsBySection[k]) listElsBySection[k].innerHTML = '<span class="deal-detail-files-error">' + msg + (msg.toLowerCase().indexOf('file not found') >= 0 ? ' Check that the backend is saving uploads and serving them correctly.' : '') + '</span>';
            });
        }
    }
    
    if (dealPipelineId && filesSection) {
        renderDealPopupFiles();
        filesSection.querySelectorAll('.deal-detail-upload-btn').forEach(function (uploadBtn) {
            var section = uploadBtn.getAttribute('data-section');
            var fileInput = filesSection.querySelector('.deal-detail-file-input[data-section="' + section + '"]');
            if (!fileInput) return;
            uploadBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', async function () {
                var files = fileInput.files;
                if (!files || files.length === 0) return;
                var apiSection = (section === 'Other' || !section) ? null : section;
                var anyFailed = false;
                var kmzCoordsUpdated = false;
                for (var i = 0; i < files.length; i++) {
                    var file = files[i];
                    try {
                        await API.uploadDealPipelineAttachment(dealPipelineId, file, apiSection);
                        var name = (file.name || '').toLowerCase();
                        if (name.endsWith('.kmz') || name.endsWith('.kml')) {
                            try {
                                var coords = await extractCoordinatesFromKmlOrKmz(file);
                                if (coords != null) {
                                    await API.updateDealPipeline(dealPipelineId, {
                                        Latitude: coords.latitude,
                                        Longitude: coords.longitude,
                                        CoordinateSource: 'KMZ'
                                    });
                                    kmzCoordsUpdated = true;
                                    var dealInList = (typeof allDeals !== 'undefined' ? allDeals : []).find(function (d) { return (d.DealPipelineId || d._original && d._original.DealPipelineId) == dealPipelineId; });
                                    if (dealInList) {
                                        dealInList.Latitude = dealInList.latitude = coords.latitude;
                                        dealInList.Longitude = dealInList.longitude = coords.longitude;
                                        dealInList.CoordinateSource = dealInList.coordinateSource = 'KMZ';
                                        var orig = dealInList._original || deal._original;
                                        if (orig) {
                                            orig.Latitude = coords.latitude;
                                            orig.Longitude = coords.longitude;
                                            orig.CoordinateSource = 'KMZ';
                                        }
                                    }
                                    if (deal) {
                                        deal.Latitude = deal.latitude = coords.latitude;
                                        deal.Longitude = deal.longitude = coords.longitude;
                                        deal.CoordinateSource = deal.coordinateSource = 'KMZ';
                                    }
                                }
                            } catch (parseErr) {
                                if (typeof console !== 'undefined' && console.warn) console.warn('KMZ/KML coordinate extraction failed:', parseErr);
                            }
                        }
                    } catch (e) {
                        anyFailed = true;
                        var msg = (e && e.message) ? e.message : 'Upload failed.';
                        showFilesMessage(msg + (msg.toLowerCase().indexOf('file not found') >= 0 ? ' The server may not be saving files. Check backend upload/storage configuration.' : ''), true);
                    }
                }
                fileInput.value = '';
                if (!anyFailed && files.length > 0) {
                    renderDealPopupFiles();
                    if (kmzCoordsUpdated) showFilesMessage('File uploaded. Coordinates updated from KMZ/KML.', false);
                }
            });
        });
        var versionInput = modal.querySelector('#deal-detail-file-version-input');
        if (versionInput) {
            versionInput.addEventListener('change', async function() {
                const parentId = this.dataset.parentId;
                const file = this.files && this.files[0];
                this.value = '';
                this.removeAttribute('data-parent-id');
                if (!file || !parentId) return;
                try {
                    await API.uploadDealPipelineAttachment(dealPipelineId, file, null);
                    renderDealPopupFiles();
                    showFilesMessage('New version uploaded.', false);
                } catch (e) {
                    showFilesMessage(e.message || 'Upload failed.', true);
                }
            });
        }
    } else if (filesSection) {
        filesSection.querySelectorAll('.deal-detail-files-list-section').forEach(function (el) {
            el.innerHTML = '<span class="deal-detail-files-empty">Files are available for deals saved in the pipeline.</span>';
        });
        filesSection.querySelectorAll('.deal-detail-files-upload').forEach(function (el) { el.style.display = 'none'; });
    }
    
    const escapeHandler = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escapeHandler);

    const closeModal = () => {
        document.removeEventListener('keydown', escapeHandler);
        animateModalClose(modal, () => {
            document.body.classList.remove('deal-modal-open');
            modal.remove();
        });
    };
    
    // Close handlers
    modal.querySelector('.deal-detail-overlay').addEventListener('click', closeModal);
    modal.querySelector('.deal-detail-close').addEventListener('click', closeModal);
    
    // Admin Edit: open deal edit modal (edit in place — close view so edit is the only layer)
    var editBtn = modal.querySelector('.deal-detail-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', function() {
            closeModal();
            if (typeof window.openDealEditModal === 'function') window.openDealEditModal(deal);
        });
    }
    
    loadDealDetailAsanaDiscrepancy(modal, deal);
    
    // Previous/Next deal navigation
    if (nav.prev) {
        modal.querySelector('.deal-detail-prev').addEventListener('click', function() {
            closeModal();
            showDealDetail(nav.prev);
        });
    }
    if (nav.next) {
        modal.querySelector('.deal-detail-next').addEventListener('click', function() {
            closeModal();
            showDealDetail(nav.next);
        });
    }
}

// Show notes modal
function animateModalClose(modalEl, onDone) {
    modalEl.classList.add('modal-closing');
    setTimeout(() => {
        if (onDone) onDone();
        else modalEl.remove();
    }, 180);
}

function showNotesModal(dealName, notes) {
    const existingModal = document.getElementById('notes-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'notes-modal';
    modal.className = 'notes-modal modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', dealName + ' notes');
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="notes-modal-overlay"></div>
        <div class="notes-modal-content modal-content">
            <div class="notes-modal-header">
                <h3>${escapeHtml(dealName)}</h3>
                <button class="notes-modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="notes-modal-body">
                <pre>${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => animateModalClose(modal, () => {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
    });

    modal.querySelector('.notes-modal-close').addEventListener('click', close);
    modal.querySelector('.notes-modal-overlay').addEventListener('click', close);

    const escapeHandler = (e) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', escapeHandler);
}

// Store timeline scroll position
let timelineScrollPosition = 0;

