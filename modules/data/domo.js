// modules/data/domo.js — Domo SDK integration and Procore matching
import { state, STATE_ABBREVIATIONS } from '../core/state.js';
import { _dpLog, _dpInfo, _dpWarn, _dpError } from '../core/utils.js';

const $ = (sel, root) => (root || document).querySelector(sel);

/* ---------- Domo object access ---------- */

export function getDomoQuick() {
    try {
        if (typeof window !== 'undefined' && window.domo) return window.domo;
    } catch (e) {}
    try {
        if (typeof window !== 'undefined') {
            const hasDomo = Object.prototype.hasOwnProperty.call(window, 'domo');
            if (hasDomo) return window.domo;
        }
    } catch (e) {}
    return null;
}

export async function waitForDomo(maxWait = 5000) {
    let waited = 0;
    const interval = 100;
    while (waited < maxWait) {
        const domoObj = getDomoQuick();
        if (domoObj) { _dpLog('Domo object found after', waited, 'ms'); return domoObj; }
        await new Promise(resolve => setTimeout(resolve, interval));
        waited += interval;
    }
    _dpWarn('Domo object not found after', maxWait, 'ms');
    return null;
}

export async function getAlias(name) {
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (host === 'localhost' || host === '127.0.0.1') return [];

    let domoObj = state.DOMO;
    if (!domoObj) {
        domoObj = getDomoQuick();
        if (domoObj) state.DOMO = domoObj;
    }
    if (!domoObj) {
        try {
            if (typeof domo !== 'undefined' && domo) { domoObj = domo; state.DOMO = domo; }
        } catch (e) {}
    }
    if (!domoObj) {
        _dpWarn(`domo object not available - cannot load alias "${name}".`);
        return [];
    }
    try {
        _dpLog(`Loading alias "${name}" from Domo...`);
        const response = await domoObj.get(`/data/v2/${name}?limit=10000`);
        return response || [];
    } catch (error) {
        _dpError(`Error loading alias "${name}":`, error);
        return [];
    }
}

/* ---------- Domo user (SSO) ---------- */

export function getDomoUserFromUrlParams() {
    try {
        const qs = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
        if (!qs) return null;
        const params = new URLSearchParams(qs);
        const email = params.get('userEmail') || params.get('email') || null;
        const name = params.get('userName') || params.get('name') || null;
        const userId = params.get('userId') || null;
        if (!email || !email.trim()) return null;
        const user = { email: email.trim() };
        if (name && name.trim()) user.name = name.trim();
        if (userId && userId.trim()) user.userId = userId.trim();
        return user;
    } catch (e) { return null; }
}

export async function getDomoCurrentUser() {
    const urlUser = getDomoUserFromUrlParams();
    if (urlUser && urlUser.email) { _dpInfo('[Domo SSO] User from URL params:', urlUser.email); return urlUser; }

    const domoObj = state.DOMO || getDomoQuick();
    if (!domoObj) { _dpInfo('[Domo SSO] No Domo object and no URL params'); return null; }
    try {
        const userId = (domoObj.env && domoObj.env.userId) ? String(domoObj.env.userId) : null;
        if (!userId) { _dpInfo('[Domo SSO] No domo.env.userId'); return null; }
        const user = { userId };
        if (domoObj.env) {
            const envEmail = domoObj.env.email || domoObj.env.userEmail || domoObj.env.UserEmail;
            if (envEmail && envEmail.trim()) user.email = envEmail.trim();
            if (domoObj.env.name) user.name = domoObj.env.name;
        }
        if (!user.email) {
            try {
                const profile = await domoObj.get(`/api/content/v1/users/${userId}`);
                if (profile && typeof profile === 'object') {
                    if (profile.email) user.email = profile.email;
                    if (profile.name) user.name = profile.name;
                }
            } catch (profileErr) {
                _dpInfo('[Domo SSO] User profile fetch failed:', profileErr && profileErr.message ? profileErr.message : profileErr);
            }
        }
        if (!user.email || !user.email.trim()) {
            _dpInfo('[Domo SSO] No email from Domo – SSO skipped.');
            return null;
        }
        return user;
    } catch (e) {
        _dpWarn('[Domo SSO] getDomoCurrentUser failed:', e);
        return null;
    }
}

/* ---------- Procore matching ---------- */

export function extractStateAbbreviation(address, stateInput) {
    if (stateInput && /^[A-Z]{2}$/.test(stateInput.trim().toUpperCase())) return stateInput.trim().toUpperCase();
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

export function fuzzyMatchProjectName(projName, procoreName) {
    const proj = (projName || '').trim().toLowerCase();
    const procore = (procoreName || '').trim().toLowerCase();
    if (!proj || !procore) return false;
    if (proj === procore) return true;
    const normalize = (str) => str
        .replace(/^the\s+/i, '').replace(/\s+at\s+/gi, ' ')
        .replace(/\s+apartments\s*/gi, '').replace(/\s+phase\s+two\s*/gi, '')
        .replace(/\s+phase\s+2\s*/gi, '').replace(/\s+llc\s*/gi, '')
        .replace(/[,\.\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const projNorm = normalize(proj);
    const procoreNorm = normalize(procore);
    if (projNorm === procoreNorm) return true;
    const commonWords = new Set(['the','at','of','and','project','construction','apartments','apartment','llc','inc','corp']);
    const getKeyWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0);
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
    const totalWords = Math.max(projWords.length, procoreWords.length);
    projWords.forEach(pw => {
        procoreWords.forEach(cw => {
            if (pw === cw) matchScore += 2;
            else if (pw.includes(cw) || cw.includes(pw)) matchScore += 1.5;
            else if (pw.length > 4 && cw.length > 4) {
                const minLen = Math.min(pw.length, cw.length);
                const maxLen = Math.max(pw.length, cw.length);
                if (minLen / maxLen >= 0.6 && (pw.includes(cw.substring(0, Math.min(4, cw.length))) || cw.includes(pw.substring(0, Math.min(4, pw.length))))) matchScore += 1;
            }
        });
    });
    const normalizedScore = totalWords > 0 ? (matchScore / (totalWords * 2)) * 100 : 0;
    if (normalizedScore >= 50) { if (dealHasExtraNotInProcore) return false; return true; }
    const matchingWords = projWords.filter(w => procoreWords.includes(w));
    if (matchingWords.length >= 2 && matchingWords.some(w => w.length > 3)) {
        if (dealHasExtraNotInProcore) return false;
        const commonPrefixWords = new Set(['waters','heights','flats','palms','lofts']);
        const projLocationWords = projWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
        const procoreLocationWords = procoreWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
        if (projLocationWords.length > 0 && procoreLocationWords.length > 0) {
            if (projLocationWords.some(w => procoreLocationWords.includes(w))) return true;
        } else { return true; }
    }
    const significantProjWords = projWords.filter(w => w.length > 4);
    const significantProcoreWords = procoreWords.filter(w => w.length > 4);
    if (significantProjWords.length > 0 && significantProcoreWords.length > 0) {
        if (significantProjWords.some(w => significantProcoreWords.includes(w)) && normalizedScore >= 40 && !dealHasExtraNotInProcore) return true;
    }
    const longProjWords = projWords.filter(w => w.length > 6);
    const longProcoreWords = procoreWords.filter(w => w.length > 6);
    let longWordMatches = 0;
    for (const pw of longProjWords) { if (procoreNorm.includes(pw)) longWordMatches++; }
    for (const cw of longProcoreWords) { if (projNorm.includes(cw)) longWordMatches++; }
    if (longWordMatches >= 2 && !dealHasExtraNotInProcore) return true;
    const commonPrefixWords2 = new Set(['waters','heights','flats','palms','lofts']);
    const locationWords = [...projWords, ...procoreWords].filter(w => w.length > 5 && !commonPrefixWords2.has(w));
    const uniqueLocationWords = locationWords.filter((w, i, arr) => arr.indexOf(w) === i);
    for (const locWord of uniqueLocationWords) {
        if (projNorm.includes(locWord) && procoreNorm.includes(locWord)) {
            if (dealHasExtraNotInProcore) return false;
            const otherWordsProj = projWords.filter(w => w !== locWord && w.length > 3);
            const otherWordsProcore = procoreWords.filter(w => w !== locWord && w.length > 3);
            if (otherWordsProj.filter(w => otherWordsProcore.includes(w)).length >= 1) return true;
        }
    }
    return false;
}

export function isProcoreStartDateOverride(actualStartDateStr) {
    if (!actualStartDateStr || typeof actualStartDateStr !== 'string') return false;
    try {
        const d = new Date(actualStartDateStr.trim());
        if (isNaN(d.getTime())) return false;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        return d <= cutoff;
    } catch (e) { return false; }
}

export function buildProcoreMatches(procoreData, dbDeals) {
    if (!window.PROCORE_MATCHES) window.PROCORE_MATCHES = new Map();
    window.PROCORE_MATCHES.clear();
    for (const procoreProject of procoreData) {
        const procoreName = (procoreProject.name || procoreProject.Name || procoreProject.projectName || procoreProject.ProjectName || '').trim();
        if (!procoreName) continue;
        let bestMatch = null, bestMatchScore = 0;
        for (const dbDeal of dbDeals) {
            const dealName = (dbDeal.ProjectName || '').trim();
            if (!dealName) continue;
            if (fuzzyMatchProjectName(dealName, procoreName)) {
                const dl = dealName.toLowerCase(), pl = procoreName.toLowerCase();
                let score = 25;
                if (dl === pl) score = 100;
                else if (dl.includes(pl) || pl.includes(dl)) score = 50;
                if (score > bestMatchScore) { bestMatchScore = score; bestMatch = dbDeal; }
            }
        }
        if (bestMatch) {
            const procoreCity = procoreProject.city || null;
            const procoreAddress = procoreProject.address || null;
            const procoreState = extractStateAbbreviation(procoreAddress, procoreProject.state || null);
            window.PROCORE_MATCHES.set(bestMatch.ProjectId, {
                hasProcore: true,
                actualStartDate: procoreProject.actualstartdate || null,
                actualCompletionDate: procoreProject.actualcompletiondate || null,
                projectedFinishDate: procoreProject.projectedfinishdate || null,
                city: procoreCity, state: procoreState,
                region: procoreProject.region || null,
                address: procoreAddress,
                latitude: procoreProject.latitude || null,
                longitude: procoreProject.longitude || null,
                squarefeet: procoreProject.squarefeet || null,
                unitCount: null,
                isActual: !!procoreProject.actualstartdate
            });
        }
    }
}

export async function syncProcoreDataToDatabase(procoreData, dbDeals) {
    if (!state.isAuthenticated || !procoreData || !procoreData.length || !dbDeals || !dbDeals.length) return;
    _dpLog('Starting Procore data sync to database...');
    const updates = [];
    for (const procoreProject of procoreData) {
        const procoreName = (procoreProject.name || procoreProject.Name || procoreProject.projectName || procoreProject.ProjectName || '').trim();
        if (!procoreName) continue;
        let bestMatch = null, bestMatchScore = 0;
        for (const dbDeal of dbDeals) {
            const dealName = (dbDeal.ProjectName || '').trim();
            if (!dealName) continue;
            if (fuzzyMatchProjectName(dealName, procoreName)) {
                const dl = dealName.toLowerCase(), pl = procoreName.toLowerCase();
                let score = 25;
                if (dl === pl) score = 100;
                else if (dl.includes(pl) || pl.includes(dl)) score = 50;
                if (score > bestMatchScore) { bestMatchScore = score; bestMatch = dbDeal; }
            }
        }
        if (!bestMatch) continue;
        const projectId = bestMatch.ProjectId;
        const dealPipelineId = bestMatch.DealPipelineId;
        const updateData = {};
        const dealPipelineUpdates = {};
        let hasDealPipelineUpdates = false;
        if (procoreProject.actualstartdate && isProcoreStartDateOverride(procoreProject.actualstartdate)) {
            let formattedDate = procoreProject.actualstartdate;
            if (formattedDate.includes('T')) formattedDate = formattedDate.split('T')[0];
            updateData.EstimatedConstructionStartDate = formattedDate;
            if (dealPipelineId) { dealPipelineUpdates.StartDate = formattedDate; hasDealPipelineUpdates = true; }
            const asanaTaskGid = bestMatch.AsanaTaskGid || null;
            if (asanaTaskGid && typeof API !== 'undefined' && typeof API.updateAsanaTaskStartDate === 'function') {
                updates.push(API.updateAsanaTaskStartDate(asanaTaskGid, formattedDate).catch(err => { _dpWarn('Procore sync: Asana start date update failed:', err); return null; }));
            }
        }
        const procoreCity = procoreProject.city || null;
        const procoreAddress = procoreProject.address || null;
        const procoreState = extractStateAbbreviation(procoreAddress, procoreProject.state || null);
        if (procoreCity && !(bestMatch.City != null && String(bestMatch.City).trim() !== '')) { updateData.City = procoreCity; if (dealPipelineId) { dealPipelineUpdates.City = procoreCity; hasDealPipelineUpdates = true; } }
        if (procoreState && !(bestMatch.State != null && String(bestMatch.State).trim() !== '')) { updateData.State = procoreState; if (dealPipelineId) { dealPipelineUpdates.State = procoreState; hasDealPipelineUpdates = true; } }
        if (procoreProject.region && !(bestMatch.Region != null && String(bestMatch.Region).trim() !== '')) { updateData.Region = procoreProject.region; if (dealPipelineId) { dealPipelineUpdates.Region = procoreProject.region; hasDealPipelineUpdates = true; } }
        const coordSource = (bestMatch.CoordinateSource || '').trim();
        const coordsFromKmz = coordSource.toLowerCase() === 'kmz';
        const procoreStartDateOk = procoreProject.actualstartdate && isProcoreStartDateOverride(procoreProject.actualstartdate);
        if (dealPipelineId && !coordsFromKmz && procoreStartDateOk && procoreProject.latitude && procoreProject.longitude) {
            const lat = parseFloat(procoreProject.latitude), lng = parseFloat(procoreProject.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                const currentLat = bestMatch.Latitude ? parseFloat(bestMatch.Latitude) : null;
                const currentLng = bestMatch.Longitude ? parseFloat(bestMatch.Longitude) : null;
                const latDiff = currentLat !== null ? Math.abs(currentLat - lat) : 1;
                const lngDiff = currentLng !== null ? Math.abs(currentLng - lng) : 1;
                if (latDiff > 0.0001 || lngDiff > 0.0001) { dealPipelineUpdates.Latitude = lat; dealPipelineUpdates.Longitude = lng; hasDealPipelineUpdates = true; }
            }
        }
        if (hasDealPipelineUpdates) {
            updates.push(API.updateDealPipeline(dealPipelineId, dealPipelineUpdates).catch(err => {
                if (err && err.message && String(err.message).toLowerCase().includes('no fields to update')) return null;
                _dpError(`Error syncing DealPipeline data for deal ${dealPipelineId}:`, err); return null;
            }));
        }
        if (Object.keys(updateData).length > 0) {
            updates.push(API.updateProject(projectId, updateData).catch(err => {
                if (err && err.message && String(err.message).toLowerCase().includes('no fields to update')) return null;
                _dpError(`Error syncing Procore data for project ${projectId}:`, err); return null;
            }));
        }
    }
    if (updates.length > 0) await Promise.all(updates);
}
