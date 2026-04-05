// modules/core/utils.js — Utility functions for deal pipeline
// All pure helpers with no cross-module state dependencies

const $ = (sel, root) => (root || document).querySelector(sel);

/* ---------- Debug logging ---------- */
export function _dpLog(...args) { if (window.DEAL_PIPELINE_DEBUG) console.log(...args); }
export function _dpInfo(...args) { if (window.DEAL_PIPELINE_DEBUG && typeof console !== 'undefined' && console.info) console.info(...args); }
export function _dpWarn(...args) { if (window.DEAL_PIPELINE_DEBUG) console.warn(...args); }
export function _dpError(...args) { if (window.DEAL_PIPELINE_DEBUG) console.error(...args); }

/* ---------- Toast notifications ---------- */
export function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container') || (function() {
        const el = document.createElement('div');
        el.id = 'toast-container';
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    })();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    container.appendChild(toast);
    const t = setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 200);
    }, 4000);
    toast._timeout = t;
}

/** Domo-safe confirmation dialog. Returns a Promise<boolean>. */
export function domoConfirm(message, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay confirm-modal-overlay';
        overlay.style.display = 'flex';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Confirm action');
        overlay.innerHTML =
            '<div class="modal-content confirm-modal-content">' +
                '<div class="confirm-modal-body">' +
                    '<p class="confirm-modal-message">' + message.replace(/</g, '&lt;') + '</p>' +
                '</div>' +
                '<div class="confirm-modal-actions">' +
                    '<button type="button" class="btn-secondary confirm-modal-cancel">' + (opts.cancelLabel || 'Cancel') + '</button>' +
                    '<button type="button" class="btn-danger confirm-modal-ok">' + (opts.confirmLabel || 'Confirm') + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        var cancelBtn = overlay.querySelector('.confirm-modal-cancel');
        var okBtn = overlay.querySelector('.confirm-modal-ok');
        function close(result) {
            if (typeof animateModalClose === 'function') {
                animateModalClose(overlay, function() { resolve(result); });
            } else {
                overlay.remove();
                resolve(result);
            }
        }
        cancelBtn.addEventListener('click', function() { close(false); });
        okBtn.addEventListener('click', function() { close(true); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });
        okBtn.focus();
    });
}

export function animateModalClose(modalEl, onDone) {
    if (!modalEl) { if (onDone) onDone(); return; }
    modalEl.classList.add('modal-closing');
    setTimeout(function() {
        modalEl.style.display = 'none';
        modalEl.classList.remove('modal-closing');
        if (onDone) onDone();
    }, 180);
}

export function showError(message, options) {
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
        if (btn && typeof window.init === 'function') {
            btn.addEventListener('click', function() { window.init(); });
        }
    }
}

export function debounce(fn, ms) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ---------- Date utilities ---------- */
export function parseLocalDateOnly(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date(trimmed);
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? null : date;
}

export function toNormalizedDateString(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        const part = value.trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
    }
    try {
        const d = value instanceof Date ? value : new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    } catch (e) { return ''; }
}

export function formatDate(dateString) {
    if (!dateString) return '';
    try {
        if (dateString instanceof Date) {
            const d = dateString;
            if (isNaN(d.getTime())) return '';
            const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
            return new Date(y, m, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        const s = String(dateString).trim();
        const dateOnly = s.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
            const [y, mo, d] = dateOnly.split('-').map(Number);
            const date = new Date(y, mo - 1, d);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        return dateString;
    }
}

export function isOverdue(dateString) {
    if (!dateString) return false;
    try {
        const date = new Date(dateString);
        return date < new Date() && date.getTime() !== new Date().setHours(0,0,0,0);
    } catch (e) {
        return false;
    }
}

/* ---------- Deal field accessors ---------- */
export function getDealLocation(deal) {
    if (!deal) return null;
    const location = deal.Location || deal.location ||
                    deal['Location Custom'] || deal.locationCustom ||
                    deal.customfieldsdisplayvalue || deal.custom_fields_display_value ||
                    deal.customfieldsenumvaluename || deal.custom_fields_enum_value_name ||
                    null;
    if (location && location !== 'Unknown' && location !== 'List' && location.trim() !== '') {
        return location.trim();
    }
    return null;
}

export function getDealState(deal) {
    const location = getDealLocation(deal);
    if (!location) return '';
    const stateMatch = location.match(/,\s*([A-Za-z]{2})$/);
    return stateMatch ? stateMatch[1].trim().toUpperCase() : '';
}

export function getDealProductType(deal) {
    if (!deal) return null;
    const productType = deal['Product Type'] || deal.productType ||
                       deal['Product Type Custom'] || deal.productTypeCustom ||
                       null;
    if (productType && productType !== 'List' && productType.trim() !== '') {
        return productType.trim();
    }
    return null;
}

/* ---------- Stage normalization ---------- */
export function normalizeStage(stage) {
    if (!stage) return 'Unknown';
    const stageStr = String(stage);
    const stageLower = stageStr.toLowerCase().trim();

    if (stageLower === 'start') return 'START';
    if (stageLower.includes('identified')) return 'Prospective';
    if (stageLower === 'loi') return 'Prospective';
    if (stageLower.includes('prospect')) return 'Prospective';
    if (stageLower.includes('under contract') || (stageLower.includes('contract') && !stageLower.includes('construction'))) return 'Under Contract';
    if (stageLower.includes('under construction') || (stageLower.includes('construction') && !stageLower.includes('contract'))) return 'Under Construction';
    if (stageLower.includes('started') && !stageLower.includes('construction')) return 'Under Construction';
    if (stageLower.includes('lease') && stageLower.includes('up')) return 'Lease-Up';
    if (stageLower.includes('stabiliz')) return 'Stabilized';
    if (stageLower.includes('liquidat')) return 'Liquidated';
    if (stageLower.includes('close') && !stageLower.includes('liquidat')) return 'Liquidated';
    if (stageLower.includes('commercial') && stageLower.includes('land') && stageLower.includes('listed')) {
        return 'Commercial Land - Listed';
    }
    if (stageLower === 'dead') return 'Dead';
    if (stageLower === 'other') return 'Other';
    if (stageLower.includes('under') && stageLower.includes('review')) return 'Under Review';
    if (stageLower.includes('rejected')) return 'Rejected';
    if (stageLower.includes('start') && !stageLower.includes('started') && !stageLower.includes('construction')) return 'START';

    const knownStages = ['Prospective', 'Under Contract', 'Under Construction', 'Lease-Up', 'Lease-up', 'Stabilized', 'Liquidated', 'Closed', 'Commercial Land Listed', 'Commercial Land - Listed', 'Dead', 'Other', 'START'];
    if (knownStages.includes(stageStr)) {
        if (stageStr === 'Lease-up') return 'Lease-Up';
        if (stageStr === 'Commercial Land Listed') return 'Commercial Land - Listed';
        return stageStr;
    }

    return stage;
}

/* ---------- Bank name normalization ---------- */
export function normalizeBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    let normalized = String(bank).trim().toLowerCase();
    normalized = normalized.replace(/[\s\-]+/g, '');
    const bankSuffixes = ['bank', 'banks', 'bancorp', 'bancshares', 'financial', 'group'];
    for (const suffix of bankSuffixes) {
        if (normalized.endsWith(suffix)) {
            const withoutSuffix = normalized.slice(0, -suffix.length);
            if (withoutSuffix.length >= 3) {
                normalized = withoutSuffix;
                break;
            }
        }
    }
    return normalized;
}

export function buildBankNameMap(deals) {
    const bankCounts = {};
    const normalizedToCanonical = {};

    deals.forEach(deal => {
        const bank = deal.Bank || deal.bank;
        if (bank && bank !== 'Unknown') {
            const normalized = normalizeBankName(bank);
            if (!bankCounts[normalized]) {
                bankCounts[normalized] = {};
            }
            const original = bank.trim();
            bankCounts[normalized][original] = (bankCounts[normalized][original] || 0) + 1;
        }
    });

    Object.keys(bankCounts).forEach(normalized => {
        const variants = bankCounts[normalized];
        let maxCount = 0;
        let canonical = '';
        Object.keys(variants).forEach(variant => {
            if (variants[variant] > maxCount) {
                maxCount = variants[variant];
                canonical = variant;
            }
        });
        normalizedToCanonical[normalized] = canonical;
    });

    return normalizedToCanonical;
}

export function getCanonicalBankName(bank, bankNameMap) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    const normalized = normalizeBankName(bank);
    return (bankNameMap && bankNameMap[normalized]) || bank.trim();
}

/* ---------- Notes parsing ---------- */
export function parseNotes(notes) {
    if (!notes) return {};
    const parsed = {};
    const lines = notes.split('\n').map(l => l.trim()).filter(l => l);

    const lenderIndex = lines.findIndex(line => line.toLowerCase().startsWith('lender:'));
    if (lenderIndex >= 0) {
        const lenderLine = lines[lenderIndex];
        const sameLineMatch = lenderLine.match(/lender:\s*(.+)/i);
        if (sameLineMatch && sameLineMatch[1].trim()) {
            const bankName = sameLineMatch[1].trim();
            if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                parsed.bank = bankName;
            }
        } else if (lenderIndex + 1 < lines.length) {
            const nextLine = lines[lenderIndex + 1].trim();
            if (!nextLine.includes(':') && nextLine.length > 0) {
                let bankName = nextLine;
                bankName = bankName.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/, '').trim();
                const nameMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[A-Z][a-z]+\s+[A-Z])/);
                if (nameMatch) {
                    bankName = nameMatch[1].trim();
                } else {
                    const simpleMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[a-z])/);
                    if (simpleMatch) {
                        bankName = simpleMatch[1].trim();
                    } else {
                        bankName = bankName.trim();
                    }
                }
                if (bankName && !['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        }
    }

    lines.forEach((line) => {
        if (line.toLowerCase().startsWith('location:')) {
            parsed.location = line.replace(/^location:\s*/i, '').trim();
        } else if (line.toLowerCase().startsWith('units:')) {
            const match = line.match(/units:\s*(\d+)/i);
            if (match) parsed.units = match[1];
        } else if (line.toLowerCase().includes('bank') && !parsed.bank) {
            const match = line.match(/bank[:\s]+([^,\n]+)/i);
            if (match) {
                const bankName = match[1].trim();
                if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        } else if (line.toLowerCase().includes('product') || (line.toLowerCase().includes('type') && !line.toLowerCase().includes('bank'))) {
            const match = line.match(/(?:product|type)[:\s]+([^,\n]+)/i);
            if (match) parsed.productType = match[1].trim();
        } else if ((line.toLowerCase().includes('pre') && line.toLowerCase().includes('con')) ||
                 line.toLowerCase().includes('preconstruction')) {
            const managerMatch = line.match(/(?:pre[- ]?con|preconstruction)[\s-]*(?:manager|coordinator)?[:\s]+([A-Za-z\s]+)/i);
            if (managerMatch) {
                parsed.preCon = managerMatch[1].trim();
            } else {
                const simpleMatch = line.match(/pre[- ]?con[:\s]+([^,\n]+)/i);
                if (simpleMatch && !simpleMatch[1].toLowerCase().includes('manager') &&
                    !simpleMatch[1].toLowerCase().includes('checklist') &&
                    !simpleMatch[1].toLowerCase().includes('insure')) {
                    parsed.preCon = simpleMatch[1].trim();
                }
            }
        }
    });

    if (!parsed.units) {
        const unitMatch = notes.match(/units?[:\s]+(\d+)/i);
        if (unitMatch) parsed.units = unitMatch[1];
    }

    if (!parsed.location && lines.length > 0) {
        const firstLine = lines[0];
        if (firstLine.includes(',') && firstLine.length < 100) {
            parsed.location = firstLine;
        }
    }

    return parsed;
}

export function determineStage(name, notes, completed, color) {
    const nameLower = (name || '').toLowerCase();
    const notesLower = (notes || '').toLowerCase();
    const combined = nameLower + ' ' + notesLower;

    if (nameLower.match(/^start\s+\d+/)) return 'START';
    if (completed === true || completed === 'true') return 'Closed';
    if (combined.includes('closed') || combined.includes('closing')) return 'Closed';
    if (combined.includes('under contract') || combined.includes('contract')) return 'Under Contract';
    if (combined.includes('started') || combined.includes('construction')) return 'Started';
    if (combined.includes('stabilized') || combined.includes('stabiliz')) return 'Stabilized';
    if (combined.includes('prospect')) return 'Prospective';

    if (color) {
        const colorMap = {
            'purple': 'Prospective', 'blue': 'Under Contract', 'red': 'Started',
            'yellow': 'Stabilized', 'green': 'Closed', 'orange': 'START', 'yellow-green': 'Prospective'
        };
        return colorMap[color.toLowerCase()] || 'Prospective';
    }

    return 'Prospective';
}

/* ---------- State abbreviations ---------- */
export function extractStateAbbreviation(address, stateInput) {
    const STATE_ABBREVIATIONS = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
        'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
        'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
        'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
        'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
        'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
        'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
        'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
        'district of columbia': 'DC'
    };

    if (stateInput && /^[A-Z]{2}$/.test(stateInput.trim().toUpperCase())) {
        return stateInput.trim().toUpperCase();
    }
    if (address) {
        const stateMatch = address.match(/\b([A-Z]{2})\b/);
        if (stateMatch) return stateMatch[1].toUpperCase();
        const addressLower = address.toLowerCase();
        for (const [stateName, abbrev] of Object.entries(STATE_ABBREVIATIONS)) {
            if (addressLower.includes(stateName)) return abbrev;
        }
    }
    if (stateInput) {
        const stateLower = stateInput.toLowerCase().trim();
        if (STATE_ABBREVIATIONS[stateLower]) return STATE_ABBREVIATIONS[stateLower];
    }
    return null;
}

/** Remove duplicate deals by DealPipelineId */
export function deduplicateDbDealsByDealPipelineId(dbDeals) {
    if (!dbDeals || !Array.isArray(dbDeals)) return [];
    const seen = new Set();
    return dbDeals.filter(function(d) {
        const id = d.DealPipelineId;
        if (id == null || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

/** Fuzzy match project names */
export function fuzzyMatchProjectName(projName, procoreName) {
    const proj = (projName || '').trim().toLowerCase();
    const procore = (procoreName || '').trim().toLowerCase();

    if (!proj || !procore) return false;
    if (proj === procore) return true;

    const normalize = (str) => {
        return str
            .replace(/^the\s+/i, '')
            .replace(/\s+at\s+/gi, ' ')
            .replace(/\s+apartments\s*/gi, '')
            .replace(/\s+phase\s+two\s*/gi, '')
            .replace(/\s+phase\s+2\s*/gi, '')
            .replace(/\s+llc\s*/gi, '')
            .replace(/[,\.\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const projNorm = normalize(proj);
    const procoreNorm = normalize(procore);

    if (projNorm === procoreNorm) return true;

    const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
    const getKeyWords = (str) => {
        return str.split(/\s+/)
            .filter(w => w.length > 2 && !commonWords.has(w))
            .map(w => w.replace(/[^a-z0-9]/g, ''))
            .filter(w => w.length > 0);
    };

    const projWords = getKeyWords(projNorm);
    const procoreWords = getKeyWords(procoreNorm);

    if (projNorm.includes(procoreNorm) || procoreNorm.includes(projNorm)) {
        if (projNorm.includes(procoreNorm)) {
            const extraInDeal = projWords.filter(w => !procoreWords.includes(w) && w.length > 3);
            if (extraInDeal.length >= 1) {
                const procoreHasExtra = extraInDeal.some(w => procoreNorm.includes(w));
                if (!procoreHasExtra) return false;
            }
        }
        return true;
    }

    const dealHasExtraNotInProcore = projWords.length > procoreWords.length &&
        projWords.some(w => w.length > 3 && !procoreWords.includes(w) && !procoreNorm.includes(w));

    let matchScore = 0;
    let totalWords = Math.max(projWords.length, procoreWords.length);

    projWords.forEach(pw => {
        procoreWords.forEach(cw => {
            if (pw === cw) {
                matchScore += 2;
            } else if (pw.includes(cw) || cw.includes(pw)) {
                matchScore += 1.5;
            } else if (pw.length > 4 && cw.length > 4) {
                const minLen = Math.min(pw.length, cw.length);
                const maxLen = Math.max(pw.length, cw.length);
                if (minLen / maxLen >= 0.6 && (pw.includes(cw.substring(0, Math.min(4, cw.length))) || cw.includes(pw.substring(0, Math.min(4, pw.length))))) {
                    matchScore += 1;
                }
            }
        });
    });

    const normalizedScore = totalWords > 0 ? (matchScore / (totalWords * 2)) * 100 : 0;

    if (normalizedScore >= 50) {
        if (dealHasExtraNotInProcore) return false;
        return true;
    }

    const matchingWords = projWords.filter(w => procoreWords.includes(w));
    if (matchingWords.length >= 2 && matchingWords.some(w => w.length > 3)) {
        if (dealHasExtraNotInProcore) return false;
        const commonPrefixWords = new Set(['waters', 'heights', 'flats', 'palms', 'lofts']);
        const projLocationWords = projWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
        const procoreLocationWords = procoreWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
        if (projLocationWords.length > 0 && procoreLocationWords.length > 0) {
            const locationMatch = projLocationWords.some(w => procoreLocationWords.includes(w));
            if (locationMatch) return true;
        } else {
            return true;
        }
    }

    const significantProjWords = projWords.filter(w => w.length > 4);
    const significantProcoreWords = procoreWords.filter(w => w.length > 4);
    if (significantProjWords.length > 0 && significantProcoreWords.length > 0) {
        const matching = significantProjWords.some(w => significantProcoreWords.includes(w));
        if (matching && normalizedScore >= 40 && !dealHasExtraNotInProcore) return true;
    }

    const longProjWords = projWords.filter(w => w.length > 6);
    const longProcoreWords = procoreWords.filter(w => w.length > 6);

    let longWordMatches = 0;
    for (const pw of longProjWords) {
        if (procoreNorm.includes(pw)) longWordMatches++;
    }
    for (const cw of longProcoreWords) {
        if (projNorm.includes(cw)) longWordMatches++;
    }

    if (longWordMatches >= 2 && !dealHasExtraNotInProcore) return true;

    const commonPrefixWords = new Set(['waters', 'heights', 'flats', 'palms', 'lofts']);
    const locationWords = [...projWords, ...procoreWords]
        .filter(w => w.length > 5 && !commonPrefixWords.has(w));
    const uniqueLocationWords = locationWords.filter((w, i, arr) => arr.indexOf(w) === i);

    for (const locWord of uniqueLocationWords) {
        if (projNorm.includes(locWord) && procoreNorm.includes(locWord)) {
            if (dealHasExtraNotInProcore) return false;
            const otherWordsProj = projWords.filter(w => w !== locWord && w.length > 3);
            const otherWordsProcore = procoreWords.filter(w => w !== locWord && w.length > 3);
            const otherMatches = otherWordsProj.filter(w => otherWordsProcore.includes(w));
            if (otherMatches.length >= 1) {
                return true;
            }
        }
    }

    return false;
}

/** Process Asana custom fields data */
export function processCustomFieldsData(rawData) {
    const tasksMap = {};

    rawData.forEach(item => {
        const taskGid = item.gid;
        const customFieldName = item.customfieldsname || item.custom_fields_name;
        const customFieldType = item.customfieldstype || item.custom_fields_type;
        const projectId = item.projectid || item.project_id || item.projectsgid || item.projects_gid;
        const resourceType = item.resourcetype || item.resource_type || '';

        if (resourceType === 'project' || (item.resourcesubtype || item.resource_subtype) === 'project') return;

        if (!tasksMap[taskGid]) {
            tasksMap[taskGid] = { ...item };
            tasksMap[taskGid]._customFields = {};
        }

        if (projectId && !tasksMap[taskGid].projectid && !tasksMap[taskGid].project_id) {
            tasksMap[taskGid].projectid = projectId;
            tasksMap[taskGid].project_id = projectId;
        }

        const projectName = item.ProjectName || item['Project Name'] || item.projectsname || item.projects_name;
        if (projectName && projectName !== 'Unknown' && projectName.trim() !== '') {
            tasksMap[taskGid].ProjectName = projectName;
            tasksMap[taskGid]['Project Name'] = projectName;
        }

        if (customFieldName) {
            let value = null;

            if (customFieldType === 'text') {
                value = item.customfieldstextvalue || item.custom_fields_text_value || null;
            } else if (customFieldType === 'enum') {
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                const enumValueName = item.customfieldsenumvaluename || item.custom_fields_enum_value_name;
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (enumValueName && enumValueName !== 'List' && enumValueName.trim() !== '') {
                    value = enumValueName;
                }
            } else if (customFieldType === 'multi_enum') {
                const multiEnum = item.customfieldsmultienumvalues || item.custom_fields_multi_enum_values;
                const displayValue = item.customfieldsdisplayvalue || item.custom_fields_display_value;
                if (displayValue && displayValue !== 'List' && displayValue.trim() !== '') {
                    value = displayValue;
                } else if (multiEnum && typeof multiEnum === 'string') {
                    if (multiEnum === 'List' || multiEnum.trim() === 'List') {
                        value = null;
                    } else {
                        try {
                            const parsed = JSON.parse(multiEnum);
                            value = Array.isArray(parsed) ? parsed.map(v => v.name || v).join(', ') : (multiEnum !== 'List' ? multiEnum : null);
                        } catch {
                            value = (multiEnum !== 'List' ? multiEnum : null);
                        }
                    }
                } else if (Array.isArray(multiEnum)) {
                    value = multiEnum.map(v => v.name || v).join(', ');
                }
            } else if (customFieldType === 'people') {
                const people = item.customfieldspeoplevalue || item.custom_fields_people_value;
                if (people && typeof people === 'string') {
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
                }
            } else if (customFieldType === 'date') {
                value = item.customfieldsdatevaluedate || item.custom_fields_date_value_date ||
                        item.customfieldsdatevalue || item.custom_fields_date_value || null;
            } else if (customFieldType === 'number') {
                value = item.customfieldsnumbervalue || item.custom_fields_number_value || null;
            }

            if (value !== null && value !== '') {
                tasksMap[taskGid]._customFields[customFieldName] = value;
            }
        }
    });

    return Object.values(tasksMap).map(task => {
        if (task._customFields) {
            if (task._customFields['Bank']) task.Bank = task._customFields['Bank'];
            if (task._customFields['Location']) {
                task.Location = task._customFields['Location'];
                task.location = task._customFields['Location'];
            }
            if (task._customFields['Pre-Con Manager']) {
                task['Pre-Con Manager'] = task._customFields['Pre-Con Manager'];
                task.PreConManager = task._customFields['Pre-Con Manager'];
                task.preConManager = task._customFields['Pre-Con Manager'];
            }
            if (task._customFields['Unit Count']) task['Unit Count Custom'] = task._customFields['Unit Count'];
            if (task._customFields['Start Date']) task['Start Date Custom'] = task._customFields['Start Date'];
            if (task._customFields['Product Type']) task['Product Type Custom'] = task._customFields['Product Type'];
            if (task._customFields['Stage']) {
                task.Stage = task._customFields['Stage'];
                task.stage = task._customFields['Stage'];
                task['Stage Custom'] = task._customFields['Stage'];
            }
        }
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
