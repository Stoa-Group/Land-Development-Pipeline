/*
 * Deal Pipeline Tracker
 * Interactive dashboard for tracking construction deals
 */

/* ---------- DOMO Integration for Procore Data ---------- */
function getDomoQuick() {
    // In Domo apps, domo is available as a global variable from ryuu.js
    try {
        if (typeof window !== 'undefined' && window.domo) {
            return window.domo;
        }
    } catch(e) {
        // Ignore errors
    }
    
    try {
        if (typeof window !== 'undefined') {
            const hasDomo = Object.prototype.hasOwnProperty.call(window, 'domo');
            if (hasDomo) {
                return window.domo;
            }
        }
    } catch(e) {
        // Silently ignore - likely cross-origin security error
    }
    
    return null;
}

// Wait for domo.js to load if it's being loaded asynchronously
async function waitForDomo(maxWait = 5000) {
    let waited = 0;
    const interval = 100;
    
    while (waited < maxWait) {
        const domoObj = getDomoQuick();
        if (domoObj) {
            console.log('Domo object found after', waited, 'ms');
            return domoObj;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
        waited += interval;
    }
    
    console.warn('Domo object not found after', maxWait, 'ms');
    return null;
}

let DOMO = getDomoQuick();

async function getAlias(name) {
    // Try to get domo object fresh each time
    let domoObj = DOMO;
    if (!domoObj) {
        domoObj = getDomoQuick();
        if (domoObj) DOMO = domoObj;
    }
    
    if (!domoObj) {
        try {
            if (typeof domo !== 'undefined' && domo) {
                domoObj = domo;
                DOMO = domo;
                console.log('Found domo object via global variable');
            }
        } catch(e) {
            // Ignore
        }
    }
    
    if (!domoObj) {
        console.warn(`domo object not available - cannot load alias "${name}". Check if running in Domo environment.`);
        return [];
    }
    
    try {
        console.log(`Loading alias "${name}" from Domo...`);
        const response = await domoObj.get(`/data/v2/${name}?limit=10000`);
        return response || [];
    } catch (error) {
        console.error(`Error loading alias "${name}":`, error);
        return [];
    }
}

/**
 * Parse Domo user from iframe URL params (Domo injects userEmail, userName, userId when embedding).
 * @returns {{ userId?: string, email?: string, name?: string }|null}
 */
function getDomoUserFromUrlParams() {
    try {
        const qs = typeof window !== 'undefined' && window.location && window.location.search ? window.location.search : '';
        if (!qs) return null;
        const params = new URLSearchParams(qs);
        const email = params.get('userEmail') || params.get('email') || null;
        const name = params.get('userName') || params.get('name') || null;
        const userId = params.get('userId') || null;
        if (!email || !email.trim()) return null;
        const user = { email: email.trim() };
        if (name && typeof name === 'string' && name.trim()) user.name = name.trim();
        if (userId && typeof userId === 'string' && userId.trim()) user.userId = userId.trim();
        return user;
    } catch (e) {
        return null;
    }
}

/**
 * Get current Domo user for SSO - no second login when running inside Domo.
 * Backend requires email (lookup auth.[User] by Email).
 * 1) Tries iframe URL params (userEmail, userName, userId) – Domo passes these when embedding.
 * 2) Else uses domo.env and Domo User API when available.
 * @returns {Promise<{ userId?: string, email: string, name?: string }|null>} null if no email (required by backend)
 */
async function getDomoCurrentUser() {
    // 1) URL params – Domo often passes userEmail/userName/userId in the app iframe URL
    const urlUser = getDomoUserFromUrlParams();
    if (urlUser && urlUser.email) {
        if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] User from URL params:', urlUser.email);
        return urlUser;
    }

    const domoObj = DOMO || getDomoQuick();
    if (!domoObj) {
        if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] No Domo object and no URL params');
        return null;
    }
    try {
        const userId = (domoObj.env && domoObj.env.userId) ? String(domoObj.env.userId) : null;
        if (!userId) {
            if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] No domo.env.userId');
            return null;
        }
        const user = { userId };
        // Some Domo setups expose email in env
        if (domoObj.env) {
            const envEmail = domoObj.env.email || domoObj.env.userEmail || domoObj.env.UserEmail;
            if (envEmail && typeof envEmail === 'string' && envEmail.trim()) user.email = envEmail.trim();
            if (domoObj.env.name && typeof domoObj.env.name === 'string') user.name = domoObj.env.name;
        }
        // Fetch profile for email/name if not in env
        if (!user.email) {
            try {
                const profile = await domoObj.get(`/api/content/v1/users/${userId}`);
                if (profile && typeof profile === 'object') {
                    if (profile.email) user.email = profile.email;
                    if (profile.name) user.name = profile.name;
                }
            } catch (profileErr) {
                if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] User profile fetch failed (need email for backend):', profileErr && profileErr.message ? profileErr.message : profileErr);
            }
        }
        // Backend requires email to look up auth.[User]; skip SSO if we don't have it
        if (!user.email || !user.email.trim()) {
            if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] No email from Domo – SSO skipped. Backend needs email to log you in as admin.');
            return null;
        }
        return user;
    } catch (e) {
        console.warn('[Domo SSO] getDomoCurrentUser failed:', e);
        return null;
    }
}

// Store Procore match data globally
window.PROCORE_MATCHES = new Map(); // projectId -> { hasProcore: true, actualStartDate, city, state, region, latitude, longitude, ... }

// State name to abbreviation mapping
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

// Extract state abbreviation from address or state string
function extractStateAbbreviation(address, state) {
    // First, check if state is already an abbreviation (2 uppercase letters)
    if (state && /^[A-Z]{2}$/.test(state.trim().toUpperCase())) {
        return state.trim().toUpperCase();
    }
    
    // Try to extract from address (look for state abbreviation pattern)
    if (address) {
        // Look for patterns like ", FL " or ", FL," or " FL " or " FL,"
        const stateMatch = address.match(/\b([A-Z]{2})\b/);
        if (stateMatch) {
            return stateMatch[1].toUpperCase();
        }
        
        // Look for full state name in address
        const addressLower = address.toLowerCase();
        for (const [stateName, abbrev] of Object.entries(STATE_ABBREVIATIONS)) {
            if (addressLower.includes(stateName)) {
                return abbrev;
            }
        }
    }
    
    // Try to match full state name
    if (state) {
        const stateLower = state.toLowerCase().trim();
        if (STATE_ABBREVIATIONS[stateLower]) {
            return STATE_ABBREVIATIONS[stateLower];
        }
    }
    
    return null;
}

// Fuzzy match project names (similar to Banking Dashboard)
function fuzzyMatchProjectName(projName, procoreName) {
    const proj = (projName || '').trim().toLowerCase();
    const procore = (procoreName || '').trim().toLowerCase();
    
    if (!proj || !procore) return false;
    
    // Exact match
    if (proj === procore) return true;
    
    // Remove common prefixes/suffixes and normalize
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
    
    // Normalized exact match
    if (projNorm === procoreNorm) return true;
    
    // Extract key words (needed for "one contains the other" specificity check)
    const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
    const getKeyWords = (str) => {
        return str.split(/\s+/)
            .filter(w => w.length > 2 && !commonWords.has(w))
            .map(w => w.replace(/[^a-z0-9]/g, ''))
            .filter(w => w.length > 0);
    };
    
    const projWords = getKeyWords(projNorm);
    const procoreWords = getKeyWords(procoreNorm);
    
    // One contains the other — but avoid matching a short Procore name to a longer, more specific deal name
    // e.g. don't match Procore "The Heights" (Hammond) to deal "The Heights at Inverness" or "The Heights at Fort Walton Beach"
    if (projNorm.includes(procoreNorm) || procoreNorm.includes(projNorm)) {
        if (projNorm.includes(procoreNorm)) {
            // Deal name contains Procore name (e.g. deal="heights inverness", procore="heights")
            const extraInDeal = projWords.filter(w => !procoreWords.includes(w) && w.length > 3);
            if (extraInDeal.length >= 1) {
                // Deal has at least one extra distinguishing word (e.g. inverness, fort, walton, beach) — require Procore to contain at least one so we don't match "The Heights" to "The Heights at Inverness"
                const procoreHasExtra = extraInDeal.some(w => procoreNorm.includes(w));
                if (!procoreHasExtra) return false;
            }
        }
        return true;
    }
    
    // Deal has extra distinguishing word(s) not in Procore — avoid false match (e.g. "The Heights at Inverness" vs "The Heights")
    const dealHasExtraNotInProcore = projWords.length > procoreWords.length &&
        projWords.some(w => w.length > 3 && !procoreWords.includes(w) && !procoreNorm.includes(w));
    
    // Calculate similarity score
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
    
    // Word-by-word matching
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
    
    // Check for significant words
    const significantProjWords = projWords.filter(w => w.length > 4);
    const significantProcoreWords = procoreWords.filter(w => w.length > 4);
    if (significantProjWords.length > 0 && significantProcoreWords.length > 0) {
        const matching = significantProjWords.some(w => significantProcoreWords.includes(w));
        if (matching && normalizedScore >= 40 && !dealHasExtraNotInProcore) return true;
    }
    
    // Long word matching
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
    
    // Location word matching
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

/**
 * Start date is controlled by Deal Pipeline. Procore overrides only when its actual start date
 * is in the past by 60+ days and the project is in Procore.
 * @param {string} actualStartDateStr - Procore actualstartdate (ISO or YYYY-MM-DD)
 * @returns {boolean} true if Procore should override (date is 60+ days in the past)
 */
function isProcoreStartDateOverride(actualStartDateStr) {
    if (!actualStartDateStr || typeof actualStartDateStr !== 'string') return false;
    try {
        const d = new Date(actualStartDateStr.trim());
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 60);
        return d <= cutoff;
    } catch (e) {
        return false;
    }
}

// Build Procore matches (matches Procore projects to Deal Pipeline projects)
function buildProcoreMatches(procoreData, dbDeals) {
    // Clear previous matches
    if (!window.PROCORE_MATCHES) {
        window.PROCORE_MATCHES = new Map();
    }
    window.PROCORE_MATCHES.clear();
    
    // Match Procore projects to DB projects by name (fuzzy matching)
    // Use "name" field from procoreProjectInfo (manifest alias: "name")
    for (const procoreProject of procoreData) {
        // Use "name" field from procoreProjectInfo (manifest alias: "name")
        // Try multiple possible field names in case the data structure varies
        const procoreName = (procoreProject.name || procoreProject.Name || procoreProject.projectName || procoreProject.ProjectName || '').trim();
        if (!procoreName) {
            console.warn('[Procore Match] Skipping Procore project with no name field. Available keys:', Object.keys(procoreProject));
            continue;
        }
        
        // Find best match using fuzzy matching
        let bestMatch = null;
        let bestMatchScore = 0;
        let bestMatchName = null;
        
        for (const dbDeal of dbDeals) {
            const dealName = (dbDeal.ProjectName || '').trim();
            if (!dealName) continue;
            
            // Use fuzzy matching to find similar project names
            const matches = fuzzyMatchProjectName(dealName, procoreName);
            if (matches) {
                const dealLower = dealName.toLowerCase();
                const procoreLower = procoreName.toLowerCase();
                let score = 25;
                if (dealLower === procoreLower) {
                    score = 100;
                } else if (dealLower.includes(procoreLower) || procoreLower.includes(dealLower)) {
                    score = 50;
                }
                
                if (score > bestMatchScore) {
                    bestMatchScore = score;
                    bestMatch = dbDeal;
                    bestMatchName = dealName;
                }
            }
        }
        
        // Match found, continue processing
        
        if (bestMatch) {
            const projectId = bestMatch.ProjectId;
            
            // Extract city and state from Procore data
            const procoreCity = procoreProject.city || null;
            const procoreAddress = procoreProject.address || null;
            const procoreStateRaw = procoreProject.state || null;
            
            // Extract state abbreviation from address or state field
            const procoreState = extractStateAbbreviation(procoreAddress, procoreStateRaw);
            
            // Store Procore match data (using manifest field aliases - all lowercase)
            const procoreMatch = {
                hasProcore: true,
                actualStartDate: procoreProject.actualstartdate || null,
                actualCompletionDate: procoreProject.actualcompletiondate || null,
                projectedFinishDate: procoreProject.projectedfinishdate || null, // Not in manifest, but check anyway
                city: procoreCity,
                state: procoreState, // Extracted and converted to abbreviation
                region: procoreProject.region || null,
                address: procoreAddress,
                latitude: procoreProject.latitude || null,
                longitude: procoreProject.longitude || null,
                squarefeet: procoreProject.squarefeet || null, // Available in manifest
                unitCount: null, // Not directly available in manifest - would need to calculate from squarefeet
                isActual: !!procoreProject.actualstartdate
            };
            window.PROCORE_MATCHES.set(projectId, procoreMatch);
        }
    }
    
}

// Sync Procore data to database (runs in background)
async function syncProcoreDataToDatabase(procoreData, dbDeals) {
    if (!isAuthenticated) {
        console.log('Not authenticated - skipping Procore sync');
        return;
    }
    
    if (!procoreData || procoreData.length === 0) {
        console.log('No Procore data to sync');
        return;
    }
    
    if (!dbDeals || dbDeals.length === 0) {
        console.log('No database deals to sync with');
        return;
    }
    
    console.log('Starting Procore data sync to database...');
    const updates = [];
    
    // Match Procore projects to DB projects
    // Use "name" field from procoreProjectInfo (manifest alias: "name")
    for (const procoreProject of procoreData) {
        // Try multiple possible field names (name, Name, projectName, etc.)
        const procoreName = (procoreProject.name || procoreProject.Name || procoreProject.projectName || procoreProject.ProjectName || '').trim();
        if (!procoreName) continue;
        
        // Find best match
        let bestMatch = null;
        let bestMatchScore = 0;
        
        for (const dbDeal of dbDeals) {
            const dealName = (dbDeal.ProjectName || '').trim();
            if (!dealName) continue;
            
            const matches = fuzzyMatchProjectName(dealName, procoreName);
            if (matches) {
                const dealLower = dealName.toLowerCase();
                const procoreLower = procoreName.toLowerCase();
                let score = 25;
                if (dealLower === procoreLower) {
                    score = 100;
                } else if (dealLower.includes(procoreLower) || procoreLower.includes(dealLower)) {
                    score = 50;
                }
                
                if (score > bestMatchScore) {
                    bestMatchScore = score;
                    bestMatch = dbDeal;
                }
            }
        }
        
        if (bestMatch) {
            const projectId = bestMatch.ProjectId;
            const dealPipelineId = bestMatch.DealPipelineId;
            const updateData = {};
            const dealPipelineUpdates = {};
            let hasDealPipelineUpdates = false;
            
            // Procore start date overrides both database and Asana when: project is in Procore, has a start date, and that date is 60+ days in the past. No decision by DB or Asana—Procore is the only source of truth.
            if (procoreProject.actualstartdate && isProcoreStartDateOverride(procoreProject.actualstartdate)) {
                let formattedDate = procoreProject.actualstartdate;
                if (formattedDate.includes('T')) {
                    formattedDate = formattedDate.split('T')[0];
                }
                updateData.EstimatedConstructionStartDate = formattedDate;
                if (dealPipelineId) {
                    dealPipelineUpdates.StartDate = formattedDate;
                    hasDealPipelineUpdates = true;
                }
                const asanaTaskGid = bestMatch.AsanaTaskGid || (bestMatch.asanaTaskGid && String(bestMatch.asanaTaskGid).trim()) || null;
                if (asanaTaskGid && typeof API !== 'undefined' && typeof API.updateAsanaTaskStartDate === 'function' && formattedDate) {
                    updates.push(
                        API.updateAsanaTaskStartDate(asanaTaskGid, formattedDate).catch(err => {
                            console.warn('Procore sync: could not update Asana start date for task ' + asanaTaskGid + ':', err);
                            return null;
                        })
                    );
                }
            }
            
            // Extract city and state from Procore data
            const procoreCity = procoreProject.city || null;
            const procoreAddress = procoreProject.address || null;
            const procoreStateRaw = procoreProject.state || null;
            const procoreState = extractStateAbbreviation(procoreAddress, procoreStateRaw);
            
            // Only sync City/State/Region from Procore when DB has no value (avoid overwriting manual fixes, e.g. Heights at Inverness → Hoover AL)
            const dbHasCity = bestMatch.City != null && String(bestMatch.City).trim() !== '';
            const dbHasState = bestMatch.State != null && String(bestMatch.State).trim() !== '';
            const dbHasRegion = bestMatch.Region != null && String(bestMatch.Region).trim() !== '';
            
            if (procoreCity && !dbHasCity) {
                updateData.City = procoreCity;
                if (dealPipelineId) {
                    dealPipelineUpdates.City = procoreCity;
                    hasDealPipelineUpdates = true;
                }
            }
            
            if (procoreState && !dbHasState) {
                updateData.State = procoreState;
                if (dealPipelineId) {
                    dealPipelineUpdates.State = procoreState;
                    hasDealPipelineUpdates = true;
                }
            }
            
            if (procoreProject.region && !dbHasRegion) {
                updateData.Region = procoreProject.region;
                if (dealPipelineId) {
                    dealPipelineUpdates.Region = procoreProject.region;
                    hasDealPipelineUpdates = true;
                }
            }
            
            // Sync coordinates from Procore only when: (1) deal coords are not from KMZ, (2) Procore start date is 60+ days in past (Procore sync starts then)
            const coordSource = (bestMatch.CoordinateSource || bestMatch.coordinateSource || '').trim();
            const coordsFromKmz = coordSource.toLowerCase() === 'kmz';
            const procoreStartDateOk = procoreProject.actualstartdate && isProcoreStartDateOverride(procoreProject.actualstartdate);
            if (dealPipelineId && !coordsFromKmz && procoreStartDateOk && procoreProject.latitude && procoreProject.longitude) {
                const lat = parseFloat(procoreProject.latitude);
                const lng = parseFloat(procoreProject.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    const currentLat = bestMatch.Latitude ? parseFloat(bestMatch.Latitude) : null;
                    const currentLng = bestMatch.Longitude ? parseFloat(bestMatch.Longitude) : null;
                    const latDiff = currentLat !== null ? Math.abs(currentLat - lat) : 1;
                    const lngDiff = currentLng !== null ? Math.abs(currentLng - lng) : 1;
                    if (latDiff > 0.0001 || lngDiff > 0.0001) {
                        dealPipelineUpdates.Latitude = lat;
                        dealPipelineUpdates.Longitude = lng;
                        hasDealPipelineUpdates = true;
                    }
                }
            }
            
            // Unit Count is not directly in manifest, but squarefeet is available
            // We could calculate unit count from squarefeet if we know average unit size
            // For now, skip unit count sync since it's not in the manifest
            // Note: If unit count becomes available in Procore later, add it here
            
            // Update DealPipeline table if there are changes
            if (hasDealPipelineUpdates) {
                updates.push(
                    API.updateDealPipeline(dealPipelineId, dealPipelineUpdates)
                        .catch(err => {
                            // Backend may return "No fields to update" when values are already in sync; treat as success
                            if (err && err.message && String(err.message).toLowerCase().includes('no fields to update')) {
                                return null;
                            }
                            console.error(`Error syncing DealPipeline data for deal ${dealPipelineId}:`, err);
                            return null;
                        })
                );
            }
            
            // Update Project table if there are changes
            if (Object.keys(updateData).length > 0) {
                updates.push(
                    API.updateProject(projectId, updateData)
                        .then(() => {
                            return null;
                        })
                        .catch(err => {
                            if (err && err.message && String(err.message).toLowerCase().includes('no fields to update')) {
                                return null;
                            }
                            console.error(`✗ Error syncing Procore data for project ${projectId}:`, err);
                            return null;
                        })
                );
            }
        }
    }
    
    if (updates.length > 0) {
        await Promise.all(updates);
    }
}

// Stages hidden by default on list/by-stage/etc.; only shown in overview counts. User can add back via "Filter by Stage".
const DEFAULT_EXCLUDED_STAGES = ['Prospective', 'Under Review', 'Rejected'];

// Single source of truth for stage display order (overview, list-by-stage, filter dropdowns)
const STAGE_DISPLAY_ORDER = [
    'Prospective',
    'Under Review',
    'Under Contract',
    'Under Construction',
    'Stabilized',
    'Liquidated',
    'Commercial Land - Listed',
    'Rejected',
    'Dead'
];

// Lifecycle order for Unit Summary "Total Units by Stage" (active pipeline → end states)
const UNIT_SUMMARY_STAGE_ORDER = [
    'Under Contract',
    'Under Construction',
    'Lease-Up',
    'Stabilized',
    'Liquidated',
    'Commercial Land - Listed',
    'Dead'
];

// Stage configuration with colors (per user: map/list and legend)
const STAGE_CONFIG = {
    'Prospective': { class: 'prospective', color: '#c026d3' }, // magenta
    'Under Review': { class: 'under-review', color: '#9333ea' }, // purple
    'Under Contract': { class: 'under-contract', color: '#dc2626' }, // red
    'Under Construction': { class: 'under-construction', color: '#ea580c' }, // orange
    'Started': { class: 'started', color: '#ea580c' }, // Alias for Under Construction
    'Lease-Up': { class: 'lease-up', color: '#eab308' }, // yellow
    'Lease-up': { class: 'lease-up', color: '#eab308' }, // Alias for Lease-Up
    'Stabilized': { class: 'stabilized', color: '#22c55e' }, // green
    'Liquidated': { class: 'liquidated', color: '#ffffff', borderColor: '#000000' }, // white with black border
    'Closed': { class: 'closed', color: '#ffffff', borderColor: '#000000' }, // Alias for Liquidated
    'Commercial Land Listed': { class: 'commercial-land-listed', color: '#14b8a6' }, // turquoise
    'Commercial Land - Listed': { class: 'commercial-land-listed', color: '#14b8a6' }, // turquoise
    'Rejected': { class: 'rejected', color: '#6b7280' }, // grey
    'Dead': { class: 'dead', color: '#374151', borderColor: '#1f2937' }, // dark slate (distinct from Rejected)
    'Other': { class: 'other', color: '#78716c' },
    'START': { class: 'start', color: '#f97316' }
};

// Global state
let allDeals = [];
// Expose allDeals globally for inline handlers
window.allDeals = allDeals;
let procoreProjectMap = {}; // Map of project name -> { actualstartdate, ... }
let currentView = 'overview';
let currentFilters = {
    stages: [], // Multi-select stage filter; [] = all (with default exclusions on non-overview)
    location: '',
    bank: '',
    product: '',
    state: '', // State filter (extracted from location)
    search: '', // Search/filter text
    year: '', // Year filter (replaces exact date ranges)
    timelineStartDate: null, // For timeline date range filter (kept for timeline view)
    timelineEndDate: null    // null means no end date (unlimited)
};
let currentSort = { by: 'date', order: 'asc' }; // Default to ascending (oldest first)
let blockSort = { by: 'date', order: 'asc' }; // Sort within blocks (year/quarter groups)
let listViewMode = 'timeline'; // 'timeline' | 'stage' | 'product' | 'bank' - list view grouping
window.productTypeSort = window.productTypeSort || { by: 'name', order: 'asc' }; // Sort config for product type view
window.bankSort = window.bankSort || { by: 'name', order: 'asc' }; // Sort config for bank view
window.listViewSort = window.listViewSort || { by: 'name', order: 'asc' }; // Sort config for list view (stage groups)
window.dealFilesTableSort = window.dealFilesTableSort || { by: 'name', order: 'asc' }; // Sort config for Deal Files table
// Land Development Contacts state
window.landDevelopmentContacts = [];
window.landDevelopmentContactFilters = { type: '', city: '', state: '', q: '', upcomingOnly: false };
let mapInstance = null;
let mapMarkers = []; // Store markers with deal data
let visibleDealsForMap = []; // Deals currently visible on map
let allMapMarkers = []; // Store all markers (for city view toggle)
let isCityView = false; // Track if we're in city view mode
let currentCityView = null; // Store current city view data

// Authentication and Edit Mode State
let isAuthenticated = false;
let isEditMode = false;
let currentUser = null;
let currentEditingDeal = null;

// Normalize stage name for consistent grouping
function normalizeStage(stage) {
    if (!stage) return 'Unknown';
    const stageStr = String(stage);
    const stageLower = stageStr.toLowerCase().trim();
    
    // Map variations to standard stages
    if (stageLower === 'start') return 'START';
    if (stageLower.includes('identified')) return 'Prospective'; // Identified → Prospective
    if (stageLower === 'loi') return 'Prospective'; // LOI → Prospective
    if (stageLower.includes('prospect')) return 'Prospective';
    if (stageLower.includes('under contract') || (stageLower.includes('contract') && !stageLower.includes('construction'))) return 'Under Contract';
    if (stageLower.includes('under construction') || (stageLower.includes('construction') && !stageLower.includes('contract'))) return 'Under Construction';
    if (stageLower.includes('started') && !stageLower.includes('construction')) return 'Under Construction'; // Map "Started" to "Under Construction"
    if (stageLower.includes('lease') && stageLower.includes('up')) return 'Lease-Up';
    if (stageLower.includes('stabiliz')) return 'Stabilized';
    if (stageLower.includes('liquidat')) return 'Liquidated';
    if (stageLower.includes('close') && !stageLower.includes('liquidat')) return 'Liquidated'; // Map "Closed" to "Liquidated"
    if (stageLower.includes('commercial') && stageLower.includes('land') && stageLower.includes('listed')) {
        // Normalize to "Commercial Land - Listed" (with hyphen) for consistency
        return 'Commercial Land - Listed';
    }
    if (stageLower === 'dead') return 'Dead';
    if (stageLower === 'other') return 'Other';
    if (stageLower.includes('under') && stageLower.includes('review')) return 'Under Review';
    if (stageLower.includes('rejected')) return 'Rejected';
    if (stageLower.includes('start') && !stageLower.includes('started') && !stageLower.includes('construction')) return 'START';
    
    // Check if it's an exact match to a known stage
    const knownStages = ['Prospective', 'Under Contract', 'Under Construction', 'Lease-Up', 'Lease-up', 'Stabilized', 'Liquidated', 'Closed', 'Commercial Land Listed', 'Commercial Land - Listed', 'Dead', 'Other', 'START'];
    if (knownStages.includes(stageStr)) {
        // Normalize variations
        if (stageStr === 'Lease-up') return 'Lease-Up';
        if (stageStr === 'Commercial Land Listed') return 'Commercial Land - Listed';
        return stageStr;
    }
    
    return stage;
}

// Normalize bank name for fuzzy matching (remove spaces, hyphens, common suffixes, lowercase, etc.)
function normalizeBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    // Normalize: trim, convert to lowercase
    let normalized = String(bank).trim().toLowerCase();
    
    // First, remove all spaces and hyphens
    // This handles: "B1 Bank" = "b1bank", "Pen - Air" = "penair", etc.
    normalized = normalized.replace(/[\s\-]+/g, '');
    
    // Then remove common bank suffixes (bank, banks, etc.) - but only if the remaining part is meaningful
    // This handles: "Renasant Bank" = "renasant", "RenasantBank" = "renasant"
    // But keeps: "B1Bank" = "b1bank" (since "b1" is too short/not meaningful)
    const bankSuffixes = ['bank', 'banks', 'bancorp', 'bancshares', 'financial', 'group'];
    for (const suffix of bankSuffixes) {
        if (normalized.endsWith(suffix)) {
            const withoutSuffix = normalized.slice(0, -suffix.length);
            // Only remove suffix if what remains is at least 3 characters (meaningful name)
            // OR if the original had a space before the suffix (like "Renasant Bank")
            if (withoutSuffix.length >= 3) {
                normalized = withoutSuffix;
                break; // Only remove one suffix
            }
        }
    }
    
    return normalized;
}

// Map of normalized bank names to canonical display names
let bankNameMap = {};

// Build bank name mapping from all deals
function buildBankNameMap(deals) {
    const bankCounts = {};
    const normalizedToCanonical = {};
    
    // First pass: count occurrences of each bank name variant
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
    
    // Second pass: for each normalized name, pick the most common variant as canonical
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
    
    bankNameMap = normalizedToCanonical;
    return normalizedToCanonical;
}

// Get canonical bank name for display
function getCanonicalBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    const normalized = normalizeBankName(bank);
    return bankNameMap[normalized] || bank.trim();
}

// Parse a date-only string (YYYY-MM-DD) as local date to avoid timezone shift (e.g. Asana due_on)
function parseLocalDateOnly(dateStr) {
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

// Normalize to YYYY-MM-DD for comparison (handles ISO strings, Date, or plain YYYY-MM-DD so DB and Asana match when same calendar day).
function toNormalizedDateString(value) {
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

// Format date for display - always include year.
// Treats YYYY-MM-DD (and ISO date-only) as a calendar date so it doesn't shift to previous day in US timezones.
// Date instances (e.g. from calculateSummary) are treated as date-only using UTC parts so UTC midnight shows as that calendar day.
function formatDate(dateString) {
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
            const [y, m, d] = dateOnly.split('-').map(Number);
            const date = new Date(y, m - 1, d);
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

// Check if date is overdue
function isOverdue(dateString) {
    if (!dateString) return false;
    try {
        const date = new Date(dateString);
        return date < new Date() && date.getTime() !== new Date().setHours(0,0,0,0);
    } catch (e) {
        return false;
    }
}

// Get location from deal (checking all possible field variations)
function getDealLocation(deal) {
    if (!deal) return null;
    const location = deal.Location || deal.location || 
                    deal['Location Custom'] || deal.locationCustom ||
                    deal.customfieldsdisplayvalue || deal.custom_fields_display_value ||
                    deal.customfieldsenumvaluename || deal.custom_fields_enum_value_name ||
                    null;
    // Filter out invalid values
    if (location && location !== 'Unknown' && location !== 'List' && location.trim() !== '') {
        return location.trim();
    }
    return null;
}

// Get state from deal location (e.g. "Baton Rouge, LA" -> "LA")
function getDealState(deal) {
    const location = getDealLocation(deal);
    if (!location) return '';
    const stateMatch = location.match(/,\s*([A-Za-z]{2})$/);
    return stateMatch ? stateMatch[1].trim().toUpperCase() : '';
}

// Get product type from deal (checking all possible field variations)
function getDealProductType(deal) {
    if (!deal) return null;
    const productType = deal['Product Type'] || deal.productType || 
                       deal['Product Type Custom'] || deal.productTypeCustom ||
                       null;
    // Filter out invalid values
    if (productType && productType !== 'List' && productType.trim() !== '') {
        return productType.trim();
    }
    return null;
}

// Parse notes field to extract structured information
function parseNotes(notes) {
    if (!notes) return {};
    
    const parsed = {};
    const lines = notes.split('\n').map(l => l.trim()).filter(l => l);
    
    // First, try to find bank in "Lender:" format (bank name is usually on next line)
    const lenderIndex = lines.findIndex(line => line.toLowerCase().startsWith('lender:'));
    if (lenderIndex >= 0) {
        // Check if bank name is on same line
        const lenderLine = lines[lenderIndex];
        const sameLineMatch = lenderLine.match(/lender:\s*(.+)/i);
        if (sameLineMatch && sameLineMatch[1].trim()) {
            const bankName = sameLineMatch[1].trim();
            // Don't accept common product type names as banks
            if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                parsed.bank = bankName;
            }
        } else if (lenderIndex + 1 < lines.length) {
            // Bank name is likely on the next line (indented, like "    B1Bank")
            const nextLine = lines[lenderIndex + 1].trim();
            // Skip if it's another section header (like "Lender Counsel:")
            if (!nextLine.includes(':') && nextLine.length > 0) {
                // Extract bank name - stop at email addresses, lowercase words (likely names), or other indicators
                // Bank names are typically: "B1Bank", "Hancock Whitney", "First National Bank", etc.
                // Pattern: capture bank name, stop before email (@), or before lowercase word that looks like a name
                let bankName = nextLine;
                
                // Remove email addresses
                bankName = bankName.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/, '').trim();
                
                // If there's a space followed by a capitalized word (likely a person's name), stop there
                // e.g., "B1Bank Gregory Pogue" -> "B1Bank"
                const nameMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[A-Z][a-z]+\s+[A-Z])/);
                if (nameMatch) {
                    bankName = nameMatch[1].trim();
                } else {
                    // Otherwise, take the first part before any lowercase word (likely a name)
                    const simpleMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[a-z])/);
                    if (simpleMatch) {
                        bankName = simpleMatch[1].trim();
                    } else {
                        bankName = bankName.trim();
                    }
                }
                
                // Don't accept common product type names as banks
                if (bankName && !['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        }
    }
    
    lines.forEach((line, index) => {
        // Location: [city, state]
        if (line.toLowerCase().startsWith('location:')) {
            parsed.location = line.replace(/^location:\s*/i, '').trim();
        }
        // Units: [number]
        else if (line.toLowerCase().startsWith('units:')) {
            const match = line.match(/units:\s*(\d+)/i);
            if (match) parsed.units = match[1];
        }
        // Bank information (fallback - might be in various formats)
        else if (line.toLowerCase().includes('bank') && !parsed.bank) {
            const match = line.match(/bank[:\s]+([^,\n]+)/i);
            if (match) {
                const bankName = match[1].trim();
                // Don't accept common product type names as banks
                if (!['prototype', 'heights/flats', 'heights', 'flats'].includes(bankName.toLowerCase())) {
                    parsed.bank = bankName;
                }
            }
        }
        // Product Type - look for explicit product type labels
        else if (line.toLowerCase().includes('product') || (line.toLowerCase().includes('type') && !line.toLowerCase().includes('bank'))) {
            const match = line.match(/(?:product|type)[:\s]+([^,\n]+)/i);
            if (match) parsed.productType = match[1].trim();
        }
        // Pre-Con Manager - look for "Pre-Con Manager:" or "Pre-Con:" or "Preconstruction Manager:"
        else if ((line.toLowerCase().includes('pre') && line.toLowerCase().includes('con')) || 
                 line.toLowerCase().includes('preconstruction')) {
            // Look for manager name after "Pre-Con Manager:" or similar
            const managerMatch = line.match(/(?:pre[- ]?con|preconstruction)[\s-]*(?:manager|coordinator)?[:\s]+([A-Za-z\s]+)/i);
            if (managerMatch) {
                parsed.preCon = managerMatch[1].trim();
            } else {
                // Fallback: if line contains pre-con but no manager label, might be the manager name
                const simpleMatch = line.match(/pre[- ]?con[:\s]+([^,\n]+)/i);
                if (simpleMatch && !simpleMatch[1].toLowerCase().includes('manager') && 
                    !simpleMatch[1].toLowerCase().includes('checklist') &&
                    !simpleMatch[1].toLowerCase().includes('insure')) {
                    parsed.preCon = simpleMatch[1].trim();
                }
            }
        }
    });
    
    // Also try regex patterns for units if not found
    if (!parsed.units) {
        const unitMatch = notes.match(/units?[:\s]+(\d+)/i);
        if (unitMatch) parsed.units = unitMatch[1];
    }
    
    // Extract location from first line if it's a city/state format
    if (!parsed.location && lines.length > 0) {
        const firstLine = lines[0];
        // Check if it looks like a location (city, state format)
        if (firstLine.includes(',') && firstLine.length < 100) {
            parsed.location = firstLine;
        }
    }
    
    return parsed;
}

// Determine stage from name and other indicators
function determineStage(name, notes, completed, color) {
    const nameLower = (name || '').toLowerCase();
    const notesLower = (notes || '').toLowerCase();
    const combined = nameLower + ' ' + notesLower;
    
    // Check for START stage (names like "Start 1", "Start 2", etc.)
    if (nameLower.match(/^start\s+\d+/)) {
        return 'START';
    }
    
    // Check if completed
    if (completed === true || completed === 'true') {
        return 'Closed';
    }
    
    // Check notes for stage indicators
    if (combined.includes('closed') || combined.includes('closing')) {
        return 'Closed';
    }
    if (combined.includes('under contract') || combined.includes('contract')) {
        return 'Under Contract';
    }
    if (combined.includes('started') || combined.includes('construction')) {
        return 'Started';
    }
    if (combined.includes('stabilized') || combined.includes('stabiliz')) {
        return 'Stabilized';
    }
    if (combined.includes('prospect')) {
        return 'Prospective';
    }
    
    // Default based on color if available
    if (color) {
        const colorMap = {
            'purple': 'Prospective',
            'blue': 'Under Contract',
            'red': 'Started',
            'yellow': 'Stabilized',
            'green': 'Closed',
            'orange': 'START',
            'yellow-green': 'Prospective' // Default for yellow-green
        };
        return colorMap[color.toLowerCase()] || 'Prospective';
    }
    
    return 'Prospective';
}

// Map database deal pipeline data to deal structure
function mapDealPipelineDataToDeal(dbDeal, loansMap = {}, banksMap = {}) {
    // Map database fields to the deal structure expected by the UI
    const stage = normalizeStage(dbDeal.Stage || 'Prospective');
    
    // Exclude START deals
    const stageStr = String(stage || '').trim();
    const stageLower = stageStr.toLowerCase();
    if (stageStr === 'START' || 
        stageLower === 'start' || 
        stageStr === 'S T A R T' ||
        stageLower === 's t a r t' ||
        stageStr.includes('START') ||
        (stageLower.includes('start') && !stageLower.includes('started'))) {
        return null;
    }
    
    // Check if this project has Procore data (Procore overrides database)
    const projectId = dbDeal.ProjectId;
    const procoreMatch = window.PROCORE_MATCHES?.get(projectId);
    const hasProcore = procoreMatch && procoreMatch.hasProcore;
    
    // Build location from City and State (Procore overrides if available)
    let location = null;
    let city = dbDeal.City;
    let state = dbDeal.State;
    let region = dbDeal.Region;
    
    if (hasProcore) {
        // Procore fills in only when database has no value (so DB remains source of truth after manual updates, e.g. Heights at Inverness → Hoover AL)
        if (procoreMatch.city && (city == null || String(city).trim() === '')) city = procoreMatch.city;
        if (procoreMatch.state && (state == null || String(state).trim() === '')) state = procoreMatch.state;
        if (procoreMatch.region && (region == null || String(region).trim() === '')) region = procoreMatch.region;
    }
    
    if (city && state) {
        location = `${city}, ${state}`;
    } else if (city) {
        location = city;
    }
    
    // Determine bank based on stage and financing
    let bankName = dbDeal.Bank || null;
    const projectLoans = loansMap[projectId] || [];
    
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
    
    // Start Date: controlled by Deal Pipeline. Procore overrides only if its actual start date is 60+ days in the past
    let startDate = dbDeal.StartDate || dbDeal.EstimatedConstructionStartDate || null;
    let dateSource = dbDeal.StartDate ? 'database' : (dbDeal.EstimatedConstructionStartDate ? 'core' : 'none');
    let procoreOverridesStartDate = false;
    if (hasProcore && procoreMatch.actualStartDate && isProcoreStartDateOverride(procoreMatch.actualStartDate)) {
        startDate = procoreMatch.actualStartDate;
        dateSource = 'procore';
        procoreOverridesStartDate = true;
    }
    
    // Unit Count: Procore overrides database
    let unitCount = dbDeal.UnitCount || dbDeal.Units || null;
    if (hasProcore && procoreMatch.unitCount) {
        unitCount = procoreMatch.unitCount;
    }
    
    // Coordinates: priority KMZ > Manual (db) > Procore. If from KMZ, never use Procore. Procore only syncs 60+ days after start date.
    const coordSource = (dbDeal.CoordinateSource || dbDeal.coordinateSource || '').trim();
    const fromKmz = coordSource.toLowerCase() === 'kmz';
    let latitude = dbDeal.Latitude != null ? parseFloat(dbDeal.Latitude) : null;
    let longitude = dbDeal.Longitude != null ? parseFloat(dbDeal.Longitude) : null;
    if (isNaN(latitude)) latitude = null;
    if (isNaN(longitude)) longitude = null;
    if (!fromKmz && (latitude === null || longitude === null) && hasProcore && procoreMatch.actualStartDate && isProcoreStartDateOverride(procoreMatch.actualStartDate)) {
        if (procoreMatch.latitude != null) latitude = parseFloat(procoreMatch.latitude);
        if (procoreMatch.longitude != null) longitude = parseFloat(procoreMatch.longitude);
    }
    
    return {
        Name: dbDeal.ProjectName || 'Unnamed Deal',
        ProjectName: dbDeal.ProjectName || 'Unnamed Deal', // Also include ProjectName for table rendering
        Stage: stage,
        'Unit Count': unitCount,
        UnitCount: unitCount, // Also include UnitCount for table rendering
        'Start Date': startDate,
        StartDate: startDate, // Also include StartDate for table rendering
        'Start Date Source': dateSource,
        Bank: bankName,
        'Product Type': dbDeal.ProductType || null,
        ProductType: dbDeal.ProductType || null, // Also include ProductType for table rendering
        Location: location,
        City: city, // Include City, State, Region for table rendering
        State: state,
        Region: region,
        'Pre-Con': dbDeal.PreConManagerName || dbDeal.PreConManager?.ManagerName || dbDeal.PreConManager?.FullName || dbDeal.ManagerName || null,
        PreConManagerId: dbDeal.PreConManagerId || null,
        Notes: dbDeal.Notes || null,
        ClosingNotes: dbDeal.ClosingNotes || null,
        Priority: dbDeal.Priority || null,
        commentsCount: null,
        Latitude: latitude,
        Longitude: longitude,
        latitude: latitude,
        longitude: longitude,
        // Store database ID and original data for editing
        DealPipelineId: dbDeal.DealPipelineId,
        ProjectId: dbDeal.ProjectId,
        _original: dbDeal,
        // Store Procore match info for UI display
        _hasProcore: hasProcore,
        _procoreMatch: procoreMatch,
        _procoreOverridesStartDate: procoreOverridesStartDate,
        // Include all other fields from dbDeal for table rendering
        Acreage: dbDeal.Acreage || null,
        LandPrice: dbDeal.LandPrice || null,
        SqFtPrice: dbDeal.SqFtPrice || null,
        ExecutionDate: dbDeal.ExecutionDate || null,
        DueDiligenceDate: dbDeal.DueDiligenceDate || null,
        ClosingDate: dbDeal.ClosingDate || null,
        ConstructionLoanClosingDate: dbDeal.ConstructionLoanClosingDate || null,
        PurchasingEntity: dbDeal.PurchasingEntity || null,
        Cash: dbDeal.Cash || false,
        OpportunityZone: dbDeal.OpportunityZone || false,
        // Land development pipeline attributes (optional)
        BrokerReferralContactId: dbDeal.BrokerReferralContactId || null,
        BrokerReferralName: (dbDeal.BrokerReferralContact && (dbDeal.BrokerReferralContact.Name || dbDeal.BrokerReferralContact.ManagerName)) || dbDeal.BrokerReferralSource || null,
        PriceRaw: dbDeal.PriceRaw ?? dbDeal.Price_raw ?? null,
        ListingStatus: dbDeal.ListingStatus || null,
        Zoning: dbDeal.Zoning || null,
        CountyParish: dbDeal.County || dbDeal.CountyParish || null
    };
}

// Map Asana data fields to deal structure (kept for backward compatibility if needed)
function mapAsanaDataToDeal(asanaItem) {
    const name = asanaItem.name || '';
    const notes = asanaItem.notes || '';
    const parsedNotes = parseNotes(notes);
    
    // Determine stage - prioritize Stage custom field if available
    let stage = null;
    // Check for Stage custom field in multiple possible locations
    if (asanaItem.Stage || asanaItem.stage || asanaItem['Stage Custom']) {
        // Use Stage custom field if available
        stage = asanaItem.Stage || asanaItem.stage || asanaItem['Stage Custom'];
        // Normalize the stage value
        stage = normalizeStage(stage);
    } else if (asanaItem.customfieldsname === 'Stage' || asanaItem.custom_fields_name === 'Stage') {
        // Check if this row has Stage custom field data directly
        const stageValue = asanaItem.customfieldsdisplayvalue || asanaItem.custom_fields_display_value ||
                          asanaItem.customfieldsenumvaluename || asanaItem.custom_fields_enum_value_name;
        if (stageValue && stageValue !== 'List' && stageValue.trim() !== '') {
            stage = normalizeStage(stageValue);
        }
    }
    
    // Fall back to determineStage() if no Stage custom field found
    if (!stage) {
        stage = determineStage(name, notes, asanaItem.completed, asanaItem.color);
    }
    
    // CRITICAL: If this is a START deal (in any form), return null to exclude it completely
    // Check for all variations: "START", "S T A R T", "start", etc.
    const stageStr = String(stage || '').trim();
    const stageLower = stageStr.toLowerCase();
    if (stageStr === 'START' || 
        stageLower === 'start' || 
        stageStr === 'S T A R T' ||
        stageLower === 's t a r t' ||
        stageStr.includes('START') ||
        (stageLower.includes('start') && !stageLower.includes('started'))) {
        // Return null to signal this deal should be excluded completely
        return null;
    }
    
    // Extract product type from name if it contains "Heights", "Flats", "Waters"
    let productType = parsedNotes.productType;
    if (!productType) {
        if (name.includes('Heights')) productType = 'Heights/Flats';
        else if (name.includes('Flats')) productType = 'Heights/Flats';
        else if (name.includes('Waters')) productType = 'Prototype';
        else if (name.match(/^Start\s+\d+/)) productType = null; // START items don't have product type
    }
    
    // Ensure bank is not a product type name
    let bank = parsedNotes.bank || null;
    if (bank) {
        const bankLower = bank.toLowerCase();
        if (['prototype', 'heights/flats', 'heights', 'flats'].includes(bankLower)) {
            bank = null; // Don't set bank if it's actually a product type
        }
    }
    
    // Check for Bank custom field from Domo (if it exists in the data)
    if (!bank && (asanaItem.Bank || asanaItem.bank)) {
        bank = asanaItem.Bank || asanaItem.bank;
    }
    
    // Check for Location custom field from Domo (if it exists in the data)
    // Check multiple possible field name variations from the new data format
    let location = parsedNotes.location || null;
    if (!location) {
        location = asanaItem.Location || asanaItem.location || 
                   asanaItem['Location Custom'] || asanaItem.locationCustom ||
                   asanaItem.customfieldsdisplayvalue || asanaItem.custom_fields_display_value ||
                   asanaItem.customfieldsenumvaluename || asanaItem.custom_fields_enum_value_name ||
                   null;
    }
    
    // Check for Pre-Con Manager custom field from Domo (prioritize custom field over parsed notes)
    let preCon = null;
    // First check custom field (this is the primary source)
    if (asanaItem['Pre-Con Manager'] || asanaItem.PreConManager || asanaItem.preConManager) {
        preCon = asanaItem['Pre-Con Manager'] || asanaItem.PreConManager || asanaItem.preConManager;
    }
    // Fall back to parsed notes if custom field not available
    if (!preCon) {
        preCon = parsedNotes.preCon || null;
    }
    
    // Check for Unit Count custom field (prefer custom field over parsed notes)
    if (asanaItem['Unit Count Custom']) {
        parsedNotes.units = asanaItem['Unit Count Custom'];
    }
    
    // Check for Start Date - prioritize Procore actualstartdate, then custom field, then due_on
    let startDate = null;
    let dateSource = 'none';
    const dealName = name || asanaItem.name || '';
    
    // First, check if we have a matching Procore project (exact match or fuzzy match)
    if (dealName) {
        // Try exact match first
        if (procoreProjectMap[dealName] && procoreProjectMap[dealName].actualstartdate) {
            startDate = procoreProjectMap[dealName].actualstartdate;
            dateSource = 'procore';
            console.log(`Using Procore actualstartdate for "${dealName}" (exact match): ${startDate}`);
        } else {
            // Try fuzzy matching - find Procore project that contains the deal name or vice versa
            const dealNameLower = dealName.toLowerCase().trim();
            let matchedProject = null;
            
            for (const [procoreName, procoreData] of Object.entries(procoreProjectMap)) {
                if (!procoreData.actualstartdate) continue;
                
                const procoreNameLower = procoreName.toLowerCase().trim();
                
                // Check if Asana name is contained in Procore name (e.g., "Settlers" in "The Waters at Settlers Trace")
                if (procoreNameLower.includes(dealNameLower)) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
                
                // Check if Procore name is contained in Asana name (e.g., "The Waters at Settlers Trace" in "Settlers Trace")
                if (dealNameLower.includes(procoreNameLower)) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
                
                // Check for key word matches (e.g., "Settlers" matches "Settlers Trace")
                const dealWords = dealNameLower.split(/\s+/).filter(w => w.length > 3); // Words longer than 3 chars
                const procoreWords = procoreNameLower.split(/\s+/).filter(w => w.length > 3);
                
                // If any significant word from deal name appears in Procore name, it's a match
                if (dealWords.length > 0 && dealWords.some(word => procoreWords.includes(word))) {
                    matchedProject = { name: procoreName, data: procoreData };
                    break;
                }
            }
            
            if (matchedProject) {
                startDate = matchedProject.data.actualstartdate;
                dateSource = 'procore';
                console.log(`Using Procore actualstartdate for "${dealName}" (fuzzy match to "${matchedProject.name}"): ${startDate}`);
            }
        }
    }
    
    // Fall back to Asana custom field
    if (!startDate && asanaItem['Start Date Custom']) {
        startDate = asanaItem['Start Date Custom'];
        dateSource = 'asana_custom';
    }
    
    // Finally, fall back to due_on
    if (!startDate) {
        startDate = asanaItem.dueon || asanaItem.due_on || asanaItem.dueAt || asanaItem.due_at || null;
        if (startDate) {
            dateSource = 'asana_due';
        }
    }
    
    // Log if we couldn't find a date for a deal
    if (!startDate && dealName) {
        console.warn(`No start date found for deal "${dealName}". Available Procore projects:`, Object.keys(procoreProjectMap));
    }
    
    // Check for Product Type custom field (prefer custom field over parsed/name-based)
    if (asanaItem['Product Type Custom']) {
        productType = asanaItem['Product Type Custom'];
    }
    
    // Procore coordinates only when start date is 60+ days in the past (Procore sync starts then)
    let latitude = null;
    let longitude = null;
    const procoreStartDateOk = startDate && isProcoreStartDateOverride(startDate);
    if (procoreStartDateOk && dealName && procoreProjectMap[dealName]) {
        latitude = procoreProjectMap[dealName].latitude;
        longitude = procoreProjectMap[dealName].longitude;
    } else if (procoreStartDateOk && dealName) {
        const dealNameLower = dealName.toLowerCase().trim();
        for (const [procoreName, procoreData] of Object.entries(procoreProjectMap)) {
            const procoreNameLower = procoreName.toLowerCase().trim();
            if (procoreNameLower.includes(dealNameLower) || dealNameLower.includes(procoreNameLower)) {
                latitude = procoreData.latitude;
                longitude = procoreData.longitude;
                break;
            }
        }
    }
    
    return {
        Name: name || 'Unnamed Deal',
        Stage: stage,
        'Unit Count': parsedNotes.units || null,
        'Start Date': startDate,
        'Start Date Source': dateSource, // Store source for tooltip
        Bank: bank,
        'Product Type': productType || null,
        Location: location,
        'Pre-Con': preCon,
        Notes: notes || null, // Include full notes
        commentsCount: asanaItem.numhearts || null,
        Latitude: latitude, // Store Procore latitude (capitalized for backward compatibility)
        Longitude: longitude, // Store Procore longitude (capitalized for backward compatibility)
        latitude: latitude, // Store Procore latitude (lowercase as user specified)
        longitude: longitude, // Store Procore longitude (lowercase as user specified)
        // Keep original data for reference
        _original: asanaItem
    };
}

// Apply filters to deals
// excludeStart: if true, exclude all START deals (default: true, except for timeline view)
// forOverview: if true, do not apply default stage exclusion (Prospective/Under Review) so overview shows full counts
function applyFilters(deals, excludeStart = true, forOverview = false) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    
    return deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const location = getDealLocation(deal) || '';
        const bank = deal.Bank || deal.bank || '';
        const product = getDealProductType(deal) || '';
        
        // Exclude START deals by default (they're placeholders, not real deals)
        // Only include them in timeline view
        if (excludeStart && stage === 'START') {
            return false;
        }
        
        // Always exclude HoldCo deals - they should not be displayed anywhere
        if (stage === 'HoldCo' || stage.toLowerCase() === 'holdco') {
            return false;
        }
        
        // Stage filter (never allow START to be filtered or shown)
        if (stage === 'START') {
            return false; // Always exclude START deals
        }
        // Never allow HoldCo to be filtered or shown
        if (stage === 'HoldCo' || stage.toLowerCase() === 'holdco') {
            return false;
        }
        // When no stage filter is selected, exclude default stages (except on overview)
        if (currentFilters.stages.length === 0 && !forOverview && DEFAULT_EXCLUDED_STAGES.includes(stage)) {
            return false;
        }
        // When stages are selected, show only those stages (normalize filter values so 4+ selections work reliably)
        if (currentFilters.stages.length > 0) {
            const selectedStages = Array.isArray(currentFilters.stages) ? currentFilters.stages : [];
            const normalizedSelected = new Set(selectedStages.map(s => normalizeStage(String(s).trim())));
            if (normalizedSelected.size > 0 && !normalizedSelected.has(stage)) return false;
        }
        
        // Location filter
        if (currentFilters.location && location !== currentFilters.location) return false;
        
        // State filter (extract state from location, e.g., "Baton Rouge, LA" -> "LA")
        if (currentFilters.state) {
            const stateMatch = location.match(/,\s*([A-Z]{2})$/);
            const dealState = stateMatch ? stateMatch[1] : '';
            if (dealState !== currentFilters.state) return false;
        }
        
        // Bank filter (use normalized names for comparison)
        if (currentFilters.bank) {
            const filterBankNormalized = normalizeBankName(currentFilters.bank);
            const dealBankNormalized = normalizeBankName(bank);
            if (filterBankNormalized !== dealBankNormalized) return false;
        }
        
        // Product filter
        if (currentFilters.product && product !== currentFilters.product) return false;
        
        // Year filter
        if (currentFilters.year) {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) {
                try {
                    const date = new Date(startDate);
                    if (!isNaN(date.getTime())) {
                        const dealYear = date.getFullYear().toString();
                        if (dealYear !== currentFilters.year) return false;
                    } else {
                        return false; // No valid date, exclude if year filter is set
                    }
                } catch (e) {
                    return false; // Date parsing failed, exclude if year filter is set
                }
            } else {
                return false; // No date, exclude if year filter is set
            }
        }
        
        // Search filter
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            const name = (deal.Name || deal.name || '').toLowerCase();
            const dealLocation = location.toLowerCase();
            const dealBank = bank.toLowerCase();
            const dealProduct = product.toLowerCase();
            const notes = (deal.Notes || deal.notes || '').toLowerCase();
            
            if (!name.includes(searchLower) && 
                !dealLocation.includes(searchLower) && 
                !dealBank.includes(searchLower) && 
                !dealProduct.includes(searchLower) && 
                !notes.includes(searchLower)) {
                return false;
            }
        }
        
        // START deals are automatically excluded in all views except timeline
        // No additional filtering needed
        if (!excludeStart && stage === 'START') {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) {
                try {
                    const date = new Date(startDate);
                    if (!isNaN(date.getTime()) && date < sixMonthsAgo) {
                        return false; // Filter out old START items
                    }
                } catch (e) {
                    // If date parsing fails, keep the item
                }
            }
        }
        
        return true;
    });
}

// Helper function to sort a single deal comparison
function sortDeal(a, b, sortConfig) {
    let aVal, bVal;
    
    switch(sortConfig.by) {
        case 'name':
            aVal = (a.Name || a.name || '').toLowerCase();
            bVal = (b.Name || b.name || '').toLowerCase();
            break;
        case 'stage':
            aVal = normalizeStage(a.Stage || a.stage);
            bVal = normalizeStage(b.Stage || b.stage);
            break;
        case 'units':
            aVal = parseInt(a['Unit Count'] || a.unitCount || 0);
            bVal = parseInt(b['Unit Count'] || b.unitCount || 0);
            break;
        case 'date':
            // For date sorting, use Start Date (checking multiple sources like grouping does)
            const dateA = a['Start Date'] || a.startDate || 
                         a['Start Date Custom'] || 
                         a.dueon || a.due_on || 
                         a.dueAt || a.due_at ||
                         a._original?.dueon || a._original?.due_on ||
                         a._original?.dueAt || a._original?.due_at ||
                         null;
            const dateB = b['Start Date'] || b.startDate || 
                         b['Start Date Custom'] || 
                         b.dueon || b.due_on || 
                         b.dueAt || b.due_at ||
                         b._original?.dueon || b._original?.due_on ||
                         b._original?.dueAt || b._original?.due_at ||
                         null;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1; // Put null dates at the end
            if (!dateB) return -1; // Put null dates at the end
            aVal = new Date(dateA);
            bVal = new Date(dateB);
            break;
        case 'location':
            aVal = (a.Location || a.location || '').toLowerCase();
            bVal = (b.Location || b.location || '').toLowerCase();
            break;
        case 'bank':
            aVal = (a.Bank || a.bank || '').toLowerCase();
            bVal = (b.Bank || b.bank || '').toLowerCase();
            break;
        case 'notes':
            aVal = (a.Notes || a.notes || '').toLowerCase();
            bVal = (b.Notes || b.notes || '').toLowerCase();
            break;
        case 'product':
        case 'productType':
            aVal = (a['Product Type'] || a.productType || '').toLowerCase();
            bVal = (b['Product Type'] || b.productType || '').toLowerCase();
            break;
        default:
            return 0;
    }
    
    if (aVal < bVal) return sortConfig.order === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.order === 'asc' ? 1 : -1;
    return 0;
}

// Apply sorting to deals (for non-grouped views)
function applySorting(deals) {
    const sorted = [...deals];
    sorted.sort((a, b) => sortDeal(a, b, currentSort));
    return sorted;
}

// Render a single deal row
function renderDealRow(deal) {
    const stage = normalizeStage(deal.Stage || deal.stage);
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const dealName = deal.Name || deal.name || 'Unnamed Deal';
    const dealId = deal.DealPipelineId || '';
    
    return `
        <tr class="deal-row" data-deal-name="${dealName}" data-deal-id="${dealId}" style="cursor: pointer;">
            <td class="deal-name" data-label="Name">
                ${deal.commentsCount ? `<span class="comments-count">${deal.commentsCount}</span>` : ''}
                ${deal.Name || deal.name || 'Unnamed Deal'}
            </td>
            <td class="deal-cell" data-label="Stage">
                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
            </td>
            <td class="deal-cell unit-count" data-label="Unit Count">${deal['Unit Count'] || deal.unitCount || deal.units || '-'}</td>
            <td class="deal-cell date-display ${isOverdue(deal['Start Date'] || deal.startDate) ? 'overdue' : ''}" data-label="Start Date" title="${(() => {
                const source = deal['Start Date Source'] || 'unknown';
                const sourceText = source === 'procore' ? 'From Procore (actual start 60+ days in past)' : 
                                  source === 'database' ? 'From Database' :
                                  source === 'asana_custom' ? 'From Asana Custom Field' : 
                                  source === 'asana_due' ? 'From Asana Due Date' : 
                                  'Unknown source';
                const startDate = deal['Start Date'] || deal.startDate || deal['Start Date Custom'] || deal.dueon || deal.due_on || deal._original?.dueon || deal._original?.due_on || 'No date';
                const dateStr = typeof startDate === 'string' ? startDate : (startDate ? new Date(startDate).toISOString() : 'No date');
                return `${sourceText}\nRaw date: ${dateStr}`;
            })()}">
                ${formatDate(deal['Start Date'] || deal.startDate) || '-'}${(deal._procoreOverridesStartDate || (deal['Start Date Source'] && String(deal['Start Date Source']).toLowerCase() === 'procore')) ? ' <span class="date-source-procore" title="Start date controlled by Procore">(Procore)</span>' : ''}
            </td>
            <td class="deal-cell secondary" data-label="Bank">${deal.Bank || deal.bank || '-'}</td>
            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
            <td class="deal-cell" data-label="Location">
                ${(() => {
                    const location = getDealLocation(deal);
                    return location ? 
                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                        '-';
                })()}
            </td>
            <td class="deal-cell notes-cell clickable" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}" style="cursor: pointer;">
                ${deal.Notes || deal.notes ? 
                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                    '-'
                }
            </td>
            ${isAuthenticated && isEditMode ? `<td class="deal-cell actions-cell" data-label="Actions">
                <button class="deal-edit-btn-small" data-deal-id="${dealId}" onclick="event.stopPropagation(); (function() { const deal = window.allDeals.find(d => d.DealPipelineId === ${dealId}); if (deal) window.openDealEditModal(deal); })();">Edit</button>
            </td>` : ''}
        </tr>
    `;
}

// Render a stage group
function renderStageGroup(stage, deals) {
    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
    const stageClass = stageConfig.class;
    
    const dealsHtml = deals.map(deal => renderDealRow(deal)).join('');
    const actionsHeader = isAuthenticated && isEditMode ? '<th>Actions</th>' : '';
    
    // Get current sort for list view
    const listSortConfig = window.listViewSort || { by: 'name', order: 'asc' };
    
    return `
        <div class="stage-group">
            <div class="stage-group-header ${stageClass}">
                <span class="stage-group-toggle">-</span>
                <span class="clickable" data-stage="${stage}">${stage}</span>
                <span class="stage-group-count">${deals.length}</span>
            </div>
            <div class="stage-group-content">
                <div class="stage-group-table-wrapper">
                    <table class="deal-list-table list-view-table">
                        <thead>
                            <tr>
                                <th class="sortable-header col-name ${listSortConfig.by === 'name' ? 'sorted' : ''}" data-sort-by="name" data-sort-order="${listSortConfig.by === 'name' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Name ${listSortConfig.by === 'name' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-stage ${listSortConfig.by === 'stage' ? 'sorted' : ''}" data-sort-by="stage" data-sort-order="${listSortConfig.by === 'stage' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Stage ${listSortConfig.by === 'stage' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-units ${listSortConfig.by === 'units' ? 'sorted' : ''}" data-sort-by="units" data-sort-order="${listSortConfig.by === 'units' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Unit Count ${listSortConfig.by === 'units' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-date ${listSortConfig.by === 'date' ? 'sorted' : ''}" data-sort-by="date" data-sort-order="${listSortConfig.by === 'date' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Start Date ${listSortConfig.by === 'date' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-bank ${listSortConfig.by === 'bank' ? 'sorted' : ''}" data-sort-by="bank" data-sort-order="${listSortConfig.by === 'bank' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Bank ${listSortConfig.by === 'bank' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-product ${listSortConfig.by === 'product' ? 'sorted' : ''}" data-sort-by="product" data-sort-order="${listSortConfig.by === 'product' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Product Type ${listSortConfig.by === 'product' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-location ${listSortConfig.by === 'location' ? 'sorted' : ''}" data-sort-by="location" data-sort-order="${listSortConfig.by === 'location' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Location ${listSortConfig.by === 'location' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                <th class="sortable-header col-notes ${listSortConfig.by === 'notes' ? 'sorted' : ''}" data-sort-by="notes" data-sort-order="${listSortConfig.by === 'notes' ? (listSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                    Notes ${listSortConfig.by === 'notes' ? (listSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                </th>
                                ${actionsHeader}
                            </tr>
                        </thead>
                        <tbody>
                            ${dealsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Group deals by stage
function groupDealsByStage(deals) {
    const grouped = {};
    
    deals.forEach(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (!grouped[stage]) {
            grouped[stage] = [];
        }
        grouped[stage].push(deal);
    });
    
    // Use single source of truth for stage order
    const sorted = {};
    STAGE_DISPLAY_ORDER.forEach(stage => {
        if (grouped[stage]) {
            sorted[stage] = grouped[stage];
        }
    });
    // Add any remaining stages not in STAGE_DISPLAY_ORDER (e.g. Lease-Up, Other)
    Object.keys(grouped).forEach(stage => {
        if (!sorted[stage]) {
            sorted[stage] = grouped[stage];
        }
    });
    return sorted;
}

// Group deals by year/quarter with reserved slots for START items
function groupDealsByYear(deals) {
    const grouped = {};
    
    deals.forEach(deal => {
        // Try multiple sources for start date
        const startDate = deal['Start Date'] || deal.startDate || 
                         deal['Start Date Custom'] || 
                         deal.dueon || deal.due_on || 
                         deal.dueAt || deal.due_at ||
                         deal._original?.dueon || deal._original?.due_on ||
                         deal._original?.dueAt || deal._original?.due_at ||
                         null;
        let year = 'Unknown';
        let quarter = '';
        
        if (startDate) {
            try {
                const date = new Date(startDate);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                    quarter = Math.floor(date.getMonth() / 3) + 1;
                } else {
                    // Try parsing as string if Date constructor failed
                    const dateStr = String(startDate);
                    const parsed = new Date(dateStr);
                    if (!isNaN(parsed.getTime())) {
                        year = parsed.getFullYear();
                        quarter = Math.floor(parsed.getMonth() / 3) + 1;
                    }
                }
            } catch (e) {
                // Keep as Unknown - log for debugging
                console.warn(`Could not parse date for deal "${deal.Name || deal.name}":`, startDate, e);
            }
        } else {
            // Log deals without dates for debugging
            console.warn(`Deal "${deal.Name || deal.name}" has no start date. Available fields:`, {
                'Start Date': deal['Start Date'],
                'startDate': deal.startDate,
                'Start Date Custom': deal['Start Date Custom'],
                'dueon': deal.dueon,
                'due_on': deal.due_on,
                '_original.dueon': deal._original?.dueon,
                '_original.due_on': deal._original?.due_on
            });
        }
        
        // Format period key as "Q1 2027" style (like timeline) instead of "2027 Q1"
        const periodKey = quarter ? `Q${quarter} ${year}` : `${year}`;
        if (!grouped[periodKey]) {
            grouped[periodKey] = { start: [], other: [] };
        }
        
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (stage === 'START') {
            grouped[periodKey].start.push(deal);
        } else {
            grouped[periodKey].other.push(deal);
        }
    });
    
    // Sort periods based on current sort order (move entire blocks)
    // Handle both formats: "Q1 2027" (new) and "2027 Q1" (old/fallback)
    // Always put "Unknown" at the end
    const sortedPeriods = Object.keys(grouped).sort((a, b) => {
        // Always put "Unknown" at the end
        if (a === 'Unknown' && b !== 'Unknown') return 1;
        if (b === 'Unknown' && a !== 'Unknown') return -1;
        if (a === 'Unknown' && b === 'Unknown') return 0;
        
        // Check if format is "Q1 2027" (starts with Q) or "2027 Q1" (starts with year)
        const isNewFormatA = a.startsWith('Q');
        const isNewFormatB = b.startsWith('Q');
        
        let yearA, yearB, qA, qB;
        
        if (isNewFormatA) {
            // Format: "Q1 2027"
            const partsA = a.split(' ');
            qA = parseInt(partsA[0].replace('Q', '')) || 0;
            yearA = parseInt(partsA[1]) || 0;
        } else {
            // Format: "2027 Q1" or "2027"
            const partsA = a.split(' ');
            yearA = parseInt(partsA[0]) || 0;
            qA = parseInt(partsA[1]?.replace('Q', '')) || 0;
        }
        
        if (isNewFormatB) {
            // Format: "Q1 2027"
            const partsB = b.split(' ');
            qB = parseInt(partsB[0].replace('Q', '')) || 0;
            yearB = parseInt(partsB[1]) || 0;
        } else {
            // Format: "2027 Q1" or "2027"
            const partsB = b.split(' ');
            yearB = parseInt(partsB[0]) || 0;
            qB = parseInt(partsB[1]?.replace('Q', '')) || 0;
        }
        
        if (yearA !== yearB) {
            // Sort by year based on current sort order
            return currentSort.order === 'asc' ? yearA - yearB : yearB - yearA;
        }
        // Sort by quarter based on current sort order
        return currentSort.order === 'asc' ? qA - qB : qB - qA;
    });
    
    // Sort items within each period based on blockSort
    sortedPeriods.forEach(period => {
        // Sort START items
        grouped[period].start.sort((a, b) => {
            return sortDeal(a, b, blockSort);
        });
        // Sort other items by stage, then within stage by blockSort
        grouped[period].other.sort((a, b) => {
            return sortDeal(a, b, blockSort);
        });
    });
    
    return { grouped, sortedPeriods };
}

// Render the deal list - switches between timeline-style and stage-based views
async function renderDealList(deals) {
    const container = document.getElementById('deal-list-container');
    
    if (!deals || deals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <img src="Logos/STOA20-Logo-Mark-Grey.jpg" alt="STOA" class="stoa-logo" />
                <div class="empty-state-text">No deals found</div>
                <div class="empty-state-subtext">Try adjusting your filters</div>
            </div>
        `;
        return;
    }
    
    // Show toggle when on list view and update active state
    const toggle = document.getElementById('list-view-toggle');
    if (toggle && currentView === 'list') {
        toggle.style.display = 'flex';
        // Update active state
        toggle.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === listViewMode);
        });
    }
    
    if (listViewMode === 'timeline') {
        renderDealListByTimeline(deals);
    } else if (listViewMode === 'stage') {
        renderDealListByStage(deals);
    } else if (listViewMode === 'product') {
        container.innerHTML = renderByProductType(deals);
    } else if (listViewMode === 'bank') {
        const html = await renderByBank(deals);
        container.innerHTML = html;
    }
    
    // Add click handlers for drill-down
    setupDrillDownHandlers();
}

// Render list by quarter/year (timeline-style)
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

    // Quick filter dropdown change handlers (state, product, year)
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
            }
            
            updateFiltersUI();
            switchView(currentView, allDeals);
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
            if (mode && (mode === 'timeline' || mode === 'stage' || mode === 'product' || mode === 'bank')) {
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

// Calculate summary statistics
function calculateSummary(deals, excludeStart = true) {
    // Filter out START deals by default (they're placeholders)
    // Use multiple checks to be absolutely sure START and HoldCo are excluded
    const filteredDeals = excludeStart ? deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage.toLowerCase() !== 'start' && !stage.includes('START') &&
               stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    }) : deals.filter(deal => {
        // Even if excludeStart is false, still exclude HoldCo
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    });
    
    const summary = {
        total: filteredDeals.length,
        byStage: {},
        totalUnits: 0,
        byProductType: {},
        byLocation: {},
        byBank: {},
        byState: {}, // Add state breakdown
        byYear: {}, // Add year breakdown
        upcomingDates: [],
        pastDates: []
    };
    
    filteredDeals.forEach(deal => {
        // By stage (never include START)
        const stage = normalizeStage(deal.Stage || deal.stage);
        
        // Skip all processing for START deals
        if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) {
            return; // Skip this deal entirely
        }
        
        summary.byStage[stage] = (summary.byStage[stage] || 0) + 1;
        
        // Get units once for use throughout
        const units = parseInt(deal['Unit Count'] || deal.unitCount || 0);
        
        // Total units
        if (units) {
            summary.totalUnits += units;
            if (!summary.byStage[stage + '_units']) {
                summary.byStage[stage + '_units'] = 0;
            }
            summary.byStage[stage + '_units'] += units;
        }
        
        // By product type
        const productType = deal['Product Type'] || deal.productType || 'Other';
        summary.byProductType[productType] = (summary.byProductType[productType] || 0) + 1;
        
        // By location
        const location = getDealLocation(deal) || 'Unknown';
        if (!summary.byLocation[location]) {
            summary.byLocation[location] = { count: 0, units: 0 };
        }
        summary.byLocation[location].count++;
        if (units) summary.byLocation[location].units += units;
        
        // By bank (use normalized name for grouping)
        const bank = deal.Bank || deal.bank || 'Unknown';
        const normalizedBank = normalizeBankName(bank);
        const canonicalBank = getCanonicalBankName(bank);
        // Use canonical name for display, but group by normalized name
        if (!summary.byBank[canonicalBank]) {
            summary.byBank[canonicalBank] = 0;
        }
        summary.byBank[canonicalBank] = (summary.byBank[canonicalBank] || 0) + 1;
        
        // By state (extract from location)
        const stateMatch = location.match(/,\s*([A-Z]{2})$/);
        const state = stateMatch ? stateMatch[1] : 'Unknown';
        if (!summary.byState[state]) {
            summary.byState[state] = { count: 0, units: 0 };
        }
        summary.byState[state].count++;
        if (units) summary.byState[state].units += units;
        
        // By year
        const dealStartDate = deal['Start Date'] || deal.startDate;
        if (dealStartDate) {
            const date = new Date(dealStartDate);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear().toString();
                if (!summary.byYear[year]) {
                    summary.byYear[year] = 0;
                }
                summary.byYear[year]++;
            }
        }
        
        // Dates (exclude START deals from dates)
        if (stage !== 'START') {
            const startDate = deal['Start Date'] || deal.startDate;
            if (startDate) {
                const date = new Date(startDate);
                if (!isNaN(date.getTime())) {
                    const dateItem = {
                        name: deal.Name || deal.name,
                        date: date,
                        dateType: 'Start date',
                        stage: stage,
                        location: getDealLocation(deal),
                        units: deal['Unit Count'] || deal.unitCount,
                        bank: deal.Bank || deal.bank
                    };
                    if (date >= new Date()) {
                        summary.upcomingDates.push(dateItem);
                    } else {
                        summary.pastDates.push(dateItem);
                    }
                }
            }
        }
    });
    
    // Sort dates
    summary.upcomingDates.sort((a, b) => a.date - b.date);
    summary.pastDates.sort((a, b) => b.date - a.date);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations - check all keys
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || (key.toLowerCase() === 'start' && !key.includes('_units'))) {
            delete summary.byStage[key];
        }
        // Remove HoldCo from stage summaries
        if (key === 'HoldCo' || (key.toLowerCase() === 'holdco' && !key.includes('_units'))) {
            delete summary.byStage[key];
        }
    });
    
    return summary;
}

// Render Overview
function renderOverview(deals) {
    // Get filter options from ALL deals (so dropdowns show all available options)
    // First filter out START deals before calculating summary
    const dealsWithoutStart = deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START';
    });
    const allDealsSummary = calculateSummary(dealsWithoutStart, true);
    const states = Object.keys(allDealsSummary.byState).filter(s => s !== 'Unknown').sort();
    const years = Object.keys(allDealsSummary.byYear).sort((a, b) => parseInt(b) - parseInt(a)); // Most recent first
    // Completely exclude START from stages; order by STAGE_DISPLAY_ORDER
    const stageKeys = Object.keys(allDealsSummary.byStage)
        .filter(k => !k.includes('_units'))
        .filter(k => k !== 'START')
        .filter(k => k.toLowerCase() !== 'start')
        .filter(k => !k.includes('START'));
    const stages = [...STAGE_DISPLAY_ORDER.filter(s => stageKeys.includes(s)), ...stageKeys.filter(s => !STAGE_DISPLAY_ORDER.includes(s)).sort()];
    const productTypes = Object.keys(allDealsSummary.byProductType).sort();
    
    // Apply filters for overview: include all stages (Prospective, Under Review) so overview shows full deal counts
    const filteredDeals = applyFilters(deals, true, true);
    // Calculate summary from filtered deals for the stats
    const summary = calculateSummary(filteredDeals, true);
    
    // Absolutely ensure START is removed from byStage (in case it somehow got through)
    if (summary.byStage['START']) {
        delete summary.byStage['START'];
    }
    if (summary.byStage['START_units']) {
        delete summary.byStage['START_units'];
    }
    // Also remove any variations
    Object.keys(summary.byStage).forEach(key => {
        if (key === 'START' || key.toLowerCase() === 'start' || key.includes('START')) {
            delete summary.byStage[key];
        }
    });
    
    return `
        <div class="overview-container">
            <div class="overview-header">
                <img src="Logos/STOA20-Logo-Mark-Green.jpg" alt="STOA" class="stoa-logo-overview" />
                <div class="beta-badge">BETA</div>
            </div>
            
            <!-- Quick Filters -->
            <div class="quick-filters">
                <div class="quick-filter-group">
                    <label for="state-filter-dropdown">Filter by State:</label>
                    <select id="state-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All States</option>
                        ${states.map(state => `
                            <option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group overview-stage-filter-group">
                    <label>Filter by Stage:</label>
                    <div class="stage-filter-dropdown-wrap overview-stage-dropdown-wrap">
                        <button type="button" class="stage-filter-trigger overview-stage-filter-trigger" id="overview-stage-filter-trigger" aria-haspopup="true" aria-expanded="false" onclick="event.preventDefault(); event.stopPropagation(); window.toggleOverviewStageDropdown && window.toggleOverviewStageDropdown();">${(currentFilters.stages && currentFilters.stages.length > 0) ? (currentFilters.stages.length <= 2 ? currentFilters.stages.join(', ') : currentFilters.stages.length + ' stages') : 'All Stages'}</button>
                        <div class="stage-filter-dropdown-panel overview-stage-filter-dropdown-panel" id="overview-stage-filter-dropdown-panel" role="menu" aria-hidden="true" style="display: none;">
                            <div class="stage-filter-checkboxes" id="overview-stage-filter-checkboxes">
                                ${stages
                                    .filter(s => s !== 'START' && s.toLowerCase() !== 'start' && !s.includes('START'))
                                    .map(s => {
                                        const checked = (currentFilters.stages && currentFilters.stages.includes(s)) ? ' checked' : '';
                                        const safe = s.replace(/"/g, '&quot;');
                                        return `<label class="stage-filter-checkbox-label"><input type="checkbox" class="stage-filter-checkbox" value="${safe}"${checked}> ${s}</label>`;
                                    })
                                    .join('')}
                            </div>
                            <button type="button" class="stage-filter-clear-btn overview-stage-clear-btn">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="quick-filter-group">
                    <label for="product-filter-dropdown">Filter by Product Type:</label>
                    <select id="product-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Types</option>
                        ${productTypes.map(product => `
                            <option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="quick-filter-group">
                    <label for="year-filter-dropdown">Filter by Year:</label>
                    <select id="year-filter-dropdown" class="quick-filter-dropdown">
                        <option value="">All Years</option>
                        ${years.map(year => `
                            <option value="${year}" ${currentFilters.year === year ? 'selected' : ''}>${year}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            
            <div class="overview-filter-actions">
                <button class="clear-filters-btn-overview" onclick="clearFilters()">Clear All Filters</button>
            </div>
            
            ${renderActiveFilters()}
            
            <div class="overview-stats">
                <div class="stat-card clickable" data-drill="list">
                    <div class="stat-value">${summary.total}</div>
                    <div class="stat-label">Total Deals</div>
                </div>
                <div class="stat-card clickable" data-drill="units">
                    <div class="stat-value">${summary.totalUnits.toLocaleString()}</div>
                    <div class="stat-label">Total Units</div>
                </div>
                <div class="stat-card clickable" data-drill="location">
                    <div class="stat-value">${Object.keys(summary.byLocation).filter(l => l !== 'Unknown').length}</div>
                    <div class="stat-label">Locations</div>
                </div>
                <div class="stat-card clickable" data-drill="bank">
                    <div class="stat-value">${Object.keys(summary.byBank).filter(b => b !== 'Unknown').length}</div>
                    <div class="stat-label">Banks</div>
                </div>
            </div>
            
            <div class="overview-sections">
                <div class="overview-section">
                    <h3>Deals by Stage (Click to Filter)</h3>
                    <div class="stage-breakdown">
                        ${(() => {
                            // Define stage order (Dead and Other should be last)
                            const stageOrder = [
                                'Prospective',
                                'Under Review',
                                'Under Contract',
                                'Under Construction',
                                'Lease-up',
                                'Stabilized',
                                'Liquidated',
                                'Commercial Land Listed',
                                'Rejected',
                                'Dead',
                                'Other'
                            ];
                            
                            // Get all stages from summary, excluding START and unit counts
                            const allStages = Object.keys(summary.byStage)
                            .filter(k => !k.includes('_units'))
                            .filter(k => k !== 'START')
                            .filter(k => k.toLowerCase() !== 'start')
                                .filter(k => !k.includes('START'));
                            
                            // Normalize stage names for matching (handle variations)
                            const normalizeStageName = (stage) => {
                                const normalized = stage.toLowerCase().trim();
                                if (normalized.includes('lease') && normalized.includes('up')) return 'Lease-up';
                                if (normalized.includes('under') && normalized.includes('construction')) return 'Under Construction';
                                if (normalized.includes('under') && normalized.includes('contract')) return 'Under Contract';
                                if (normalized.includes('commercial') && normalized.includes('land') && normalized.includes('listed')) return 'Commercial Land Listed';
                                return stage;
                            };
                            
                            // Sort stages: first by defined order, then any remaining stages alphabetically, with Dead and Other at the end
                            const sortedStages = allStages.sort((a, b) => {
                                const aNormalized = normalizeStageName(a);
                                const bNormalized = normalizeStageName(b);
                                const aIndex = stageOrder.indexOf(aNormalized);
                                const bIndex = stageOrder.indexOf(bNormalized);
                                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                                if (aIndex !== -1) return -1;
                                if (bIndex !== -1) return 1;
                                const aIsDeadOrOther = a === 'Dead' || a === 'Other';
                                const bIsDeadOrOther = b === 'Dead' || b === 'Other';
                                if (aIsDeadOrOther && !bIsDeadOrOther) return 1;
                                if (!aIsDeadOrOther && bIsDeadOrOther) return -1;
                                return a.localeCompare(b);
                            });
                            
                            return sortedStages.map(stage => {
                                if (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START')) return '';
                                const count = summary.byStage[stage];
                                const units = summary.byStage[stage + '_units'] || 0;
                                const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                return `
                                    <div class="breakdown-item clickable" data-stage="${stage}" style="cursor: pointer; width: 100%;">
                                        <span class="stage-badge ${stageConfig.class}">${stage}</span>
                                        <span class="breakdown-count">${count} deals</span>
                                        ${units > 0 ? `<span class="breakdown-units">${units.toLocaleString()} units</span>` : ''}
                                    </div>
                                `;
                            }).filter(html => html !== '').join('');
                        })()}
                    </div>
                </div>
                
                <div class="overview-section">
                    <h3>Upcoming Dates (Next 10)</h3>
                    <div class="upcoming-dates">
                        ${summary.upcomingDates.slice(0, 10).map(item => `
                            <div class="date-item clickable" data-drill-timeline="${item.name}" style="cursor: pointer;">
                                <span class="date-value">${formatDate(item.date)}</span>
                                <span class="date-name">${item.name}</span>
                                <span class="stage-badge clickable ${STAGE_CONFIG[item.stage]?.class || ''}" data-stage="${item.stage}">${item.stage}</span>
                            </div>
                        `).join('')}
                        ${summary.upcomingDates.length === 0 ? '<div class="no-data">No upcoming dates</div>' : ''}
                    </div>  
                </div>
            </div>
        </div>
    `;
}

// Normalize for Asana/deal name comparison (trim, lowercase, collapse spaces, ignore apostrophes)
function asanaNormalizeName(str) {
    return String(str || '').trim().toLowerCase()
        .replace(/['\u2019\u2018\u0027]/g, '')
        .replace(/\s+/g, ' ');
}
// Two key words match if equal or one is a prefix of the other (handles truncation e.g. "East Ba" vs "East Bay")
function asanaWordMatches(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (a.length >= 2 && b.startsWith(a)) || (b.length >= 2 && a.startsWith(b));
}
// Match Asana project/task name to deal name with disambiguation so generic names don't match specific deals.
// e.g. Asana "The Heights" must not match deal "The Heights at Inverness" unless Asana name contains "inverness".
// Ignores apostrophes (e.g. "Settler's" matches "Settlers") and allows word-overlap match when names are very similar.
function asanaProjectNameMatchesDeal(projectName, dealName) {
    if (!projectName || !dealName) return false;
    const p = asanaNormalizeName(projectName);
    const d = asanaNormalizeName(dealName);
    if (!p || !d) return false;
    if (p === d) return true;
    const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
    const getKeyWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0);
    const pWords = getKeyWords(p);
    const dWords = getKeyWords(d);
    if (d.indexOf(p) !== -1) {
        const extraInDeal = dWords.filter(w => !pWords.includes(w) && w.length > 3);
        if (extraInDeal.length >= 2) {
            const asanaHasExtra = extraInDeal.some(w => p.indexOf(w) !== -1);
            if (!asanaHasExtra) return false;
        }
        return true;
    }
    if (p.indexOf(d) !== -1) {
        const extraInAsana = pWords.filter(w => !dWords.includes(w) && w.length > 3);
        if (extraInAsana.length >= 2) {
            const dealHasExtra = extraInAsana.some(w => d.indexOf(w) !== -1);
            if (!dealHasExtra) return false;
        }
        return true;
    }
    // Word-overlap fallback: e.g. "The Waters at Settler's Trace" vs "Waters at Settlers Trace" – same key words
    if (pWords.length >= 2 && dWords.length >= 2) {
        const pSet = new Set(pWords);
        const dSet = new Set(dWords);
        const overlap = pWords.filter(w => dSet.has(w)).length;
        const minWords = Math.min(pWords.length, dWords.length);
        if (overlap >= minWords || (overlap >= 2 && overlap >= minWords * 0.8)) return true;
    }
    return false;
}
// Return a score for match quality (higher = better). Used to pick the best Asana task when multiple match.
function asanaMatchQuality(asanaName, dealName) {
    if (!asanaName || !dealName) return 0;
    const p = asanaNormalizeName(asanaName);
    const d = asanaNormalizeName(dealName);
    if (!p || !d) return 0;
    if (p === d) return 100;
    if (d.indexOf(p) !== -1 || p.indexOf(d) !== -1) {
        if (!asanaProjectNameMatchesDeal(asanaName, dealName)) return 0;
        const lenMatch = Math.min(p.length, d.length) / Math.max(p.length, d.length);
        return 50 + Math.round(lenMatch * 40);
    }
    if (asanaProjectNameMatchesDeal(asanaName, dealName)) {
        const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
        const getKeyWords = (str) => str.split(/\s+/).filter(w => w.length > 2 && !commonWords.has(w)).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 0);
        const pWords = getKeyWords(p);
        const dWords = getKeyWords(d);
        const overlap = pWords.filter(w => dWords.includes(w)).length;
        const minWords = Math.min(pWords.length, dWords.length);
        if (minWords > 0) return 40 + Math.round((overlap / minWords) * 50);
    }
    return 0;
}

// Upcoming Dates view – land development: deal start dates, key dates, and Asana tasks (view-only, matched by project name)
function renderUpcomingDatesView(deals) {
    const filtered = applyFilters(deals, true);
    const summary = calculateSummary(filtered, true);
    const upcoming = (summary.upcomingDates || []).slice().sort((a, b) => a.date - b.date);
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
                            <th>Date Type</th>
                            <th>Date</th>
                            <th>Days from today</th>
                            <th>Deal</th>
                            <th>Stage</th>
                            <th>Location</th>
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
    }).catch(function() { /* Asana unavailable: keep deal-only rows */ });
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
    
    // Try to extract city and state
    const match = location.match(/([^,]+),\s*([A-Z]{2})/);
    if (match) {
        const city = match[1].trim();
        const state = match[2];
        
        // Try partial match
        for (const [key, coords] of Object.entries(cityStateMap)) {
            if (key.includes(city) || key.includes(state)) {
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
            console.warn('Geocoding unavailable (network/CSP). Add https://nominatim.openstreetmap.org to connect-src if needed. First failure:', location, error);
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
    
    // Actions header (only show if authenticated and in edit mode)
    const actionsHeader = (isAuthenticated && isEditMode) ? '<th>Actions</th>' : '';
    
    return headerHtml + locations.map(location => {
        const locationDeals = grouped[location];
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
                        <table class="deal-list-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Stage</th>
                                    <th>Unit Count</th>
                                    <th>Start Date</th>
                                    <th>Bank</th>
                                    <th>Product Type</th>
                                    <th>Location</th>
                                    <th>Notes</th>
                                    ${actionsHeader}
                                </tr>
                            </thead>
                            <tbody>
                                ${locationDeals.map(deal => renderDealRow(deal)).join('')}
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
        <div class="map-view-panel view-split" id="map-view-panel">
            <div id="map-controls-container" class="map-controls">
                <div class="map-view-toggle" role="group" aria-label="Map, split, or list view">
                    <button type="button" class="map-view-toggle-btn" id="map-view-map-btn" data-view="map" aria-pressed="false">Map</button>
                    <button type="button" class="map-view-toggle-btn active" id="map-view-split-btn" data-view="split" aria-pressed="true">Split</button>
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
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
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
        const popupContent = `<div style="min-width: 140px;"><strong>${name}</strong><br/>${stage}<br/>${units ? units + ' units' : ''}<br/><button type="button" class="map-popup-btn map-popup-view-deal-btn" data-deal-name="${nameEsc}" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-green); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; width: 100%;">View deal</button></div>`;
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
    
    // Fit map to show all filtered markers
    if (mapMarkers.length > 0) {
        const group = new L.featureGroup(mapMarkers.map(m => m.marker));
        mapInstance.fitBounds(group.getBounds().pad(0.1));
    } else {
        // If no markers (all filtered out), stay on continental US
        mapInstance.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }
    
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
        console.error('map-table-container not found in DOM');
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
    } finally {
        mapInitInProgress = false;
    }
}

// Focus map on city from marker popup (uses marker data directly)
function focusMapOnCityFromMarker(cityName, location) {
    if (!mapInstance) return;
    
    // Find the marker data for this location
    const markerData = allMapMarkers.find(m => m.location === location || m.city === cityName);
    
    if (!markerData) {
        console.warn(`No marker found for city: ${cityName}`);
        return;
    }
    
    const cityDeals = markerData.deals;
    
    if (cityDeals.length === 0) {
        console.warn(`No deals found for city: ${cityName}`);
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
        console.warn(`No deals with valid coordinates found for city: ${cityName}, showing deals in table only`);
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
    
    // Restore mapMarkers to all city markers
    mapMarkers = [...allMapMarkers];
    
    // Fit map to show all markers, or default US view if none (e.g. city had no coords)
    var defaultCenter = [39.5, -98.5];
    var defaultZoom = 4;
    if (mapMarkers.length > 0) {
        try {
            var group = new L.featureGroup(mapMarkers.map(function(m) { return m.marker; }).filter(Boolean));
            if (group.getLayers().length > 0) {
                var bounds = group.getBounds();
                var valid = bounds && (typeof bounds.isValid !== 'function' || bounds.isValid());
                if (valid) {
                    mapInstance.fitBounds(bounds.pad(0.1));
                } else {
                    var center = mapMarkers[0].coords || (mapMarkers[0].marker && mapMarkers[0].marker.getLatLng && mapMarkers[0].marker.getLatLng());
                    if (center && (Array.isArray(center) || (center.lat != null && center.lng != null))) {
                        var lat = Array.isArray(center) ? center[0] : center.lat;
                        var lng = Array.isArray(center) ? center[1] : center.lng;
                        mapInstance.setView([lat, lng], 6);
                    } else {
                        mapInstance.setView(defaultCenter, defaultZoom);
                    }
                }
            } else {
                mapInstance.setView(defaultCenter, defaultZoom);
            }
        } catch (err) {
            if (mapMarkers[0] && (mapMarkers[0].coords || mapMarkers[0].marker)) {
                var c = mapMarkers[0].coords || (mapMarkers[0].marker.getLatLng && mapMarkers[0].marker.getLatLng());
                if (c) mapInstance.setView(Array.isArray(c) ? c : [c.lat, c.lng], 6);
            } else {
                mapInstance.setView(defaultCenter, defaultZoom);
            }
        }
    } else {
        mapInstance.setView(defaultCenter, defaultZoom);
    }
    if (mapInstance.invalidateSize) mapInstance.invalidateSize();
    
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
        if (mapInstance) setTimeout(function() { mapInstance.invalidateSize(); }, 150);
        window.addEventListener('keydown', onFullscreenKeydown);
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
        if (mapInstance) setTimeout(function() { mapInstance.invalidateSize(); }, 150);
        window.removeEventListener('keydown', onFullscreenKeydown);
    }

    function onFullscreenKeydown(e) {
        if (e.key === 'Escape' && mapCanvasContainer && mapCanvasContainer.classList.contains('is-fullscreen')) {
            exitMapFullscreen();
        }
    }

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
            if (!mapInstance || mapMarkers.length === 0) return;
            const group = new L.featureGroup(mapMarkers.map(m => m.marker));
            mapInstance.fitBounds(group.getBounds().pad(0.1));
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
        console.warn(`No deals found for city: ${cityName}`);
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

// Render by Bank (filter out START deals, pull bank data from bank database)
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
                    <span class="bank-name-clickable" data-bank-name="${bankName}" data-bank-id="${bankRecord?.BankId || ''}" style="cursor: pointer; text-decoration: underline; color: var(--primary-green);">
                        <span class="bank-icon">Bank:</span> ${bankName}
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
                                    <th class="sortable-header ${bankSortConfig.by === 'notes' ? 'sorted' : ''}" data-sort-by="notes" data-sort-order="${bankSortConfig.by === 'notes' ? (bankSortConfig.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Notes ${bankSortConfig.by === 'notes' ? (bankSortConfig.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                    ${isAuthenticated && isEditMode ? '<th>Actions</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${bankDeals.map(deal => {
                                    // Create a version without Bank column for this view
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row" data-deal-name="${deal.Name || deal.name}">
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
                                            <td class="deal-cell secondary" data-label="Product Type">${deal['Product Type'] || deal.productType || '-'}</td>
                                            <td class="deal-cell" data-label="Location">
                                                ${(() => {
                                                    const location = getDealLocation(deal);
                                                    return location ? 
                                                        `<span class="location-badge clickable" data-location="${location}">${location}</span>` : 
                                                        '-';
                                                })()}
                                            </td>
                                            <td class="deal-cell" data-label="Pre-Con">
                                                ${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M'] ? 
                                                    `<span class="precon-badge">${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M']}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            ${isAuthenticated && isEditMode ? `
                                                <td class="deal-cell" data-label="Actions">
                                                    <button class="deal-edit-btn-small" onclick="window.openDealEditModal(window.allDeals.find(d => (d.Name || d.name) === '${(deal.Name || deal.name || '').replace(/'/g, "\\'")}'))">Edit</button>
                                                </td>
                                            ` : ''}
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
                                    <th class="sortable-header ${productTypeSort.by === 'notes' ? 'sorted' : ''}" data-sort-by="notes" data-sort-order="${productTypeSort.by === 'notes' ? (productTypeSort.order === 'asc' ? 'desc' : 'asc') : 'asc'}" style="cursor: pointer;">
                                        Notes ${productTypeSort.by === 'notes' ? (productTypeSort.order === 'asc' ? '↑' : '↓') : ''}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${typeDeals.map(deal => {
                                    // Create a version without Product Type column for this view
                                    const stage = normalizeStage(deal.Stage || deal.stage);
                                    const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                                    return `
                                        <tr class="deal-row">
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
                                            <td class="deal-cell" data-label="Pre-Con">
                                                ${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M'] ? 
                                                    `<span class="precon-badge">${deal['Pre-Con'] || deal.preCon || deal['Pre-Con M']}</span>` : 
                                                    '-'
                                                }
                                            </td>
                                            <td class="deal-cell notes-cell" data-label="Notes" title="${(deal.Notes || deal.notes || '').replace(/"/g, '&quot;')}">
                                                ${deal.Notes || deal.notes ? 
                                                    `<span class="notes-preview">${(deal.Notes || deal.notes).substring(0, 100)}${(deal.Notes || deal.notes).length > 100 ? '...' : ''}</span>` : 
                                                    '-'
                                                }
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

// Render Deal Files view – list of deals with link to view files (opens deal popup)
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
            <p class="deal-files-desc">Click "View deal & files" to open a deal and see its attached files. Everyone can view and download; only admins can upload, rename, or delete.</p>
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
                <div class="contacts-filters">
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
            <div class="contacts-list" id="contacts-list">
                ${!(contacts && contacts.length) ? '<p class="contacts-empty">No contacts yet. Add a contact or adjust filters.</p>' : contacts.map(c => {
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
    container.querySelector('#contacts-filter-type')?.addEventListener('change', applyFiltersAndRefresh);
    container.querySelector('#contacts-filter-city')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-state')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-q')?.addEventListener('input', debounce(applyFiltersAndRefresh, 400));
    container.querySelector('#contacts-filter-upcoming')?.addEventListener('change', applyFiltersAndRefresh);
    container.querySelector('#contacts-add-btn')?.addEventListener('click', () => showContactModal(null));
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
                alert('Cannot delete: invalid contact id.');
                return;
            }
            if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
            try {
                const api = typeof API !== 'undefined' && API.deleteLandDevelopmentContact ? API : null;
                if (!api) throw new Error('Contacts API not loaded. Ensure api-client is loaded and includes deleteLandDevelopmentContact.');
                await api.deleteLandDevelopmentContact(id);
                switchView('contacts', typeof allDeals !== 'undefined' ? allDeals : []);
            } catch (err) {
                alert(err?.message || err?.error?.message || 'Delete failed.');
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
                    <p class="contact-scheduled-reminder-text">When the follow-up date is reached, we'll send a reminder so <em>you</em> remember to reach out to this contact (e.g. &quot;You need to reach out to [contact] — it's been X days&quot;). The <strong>Remind</strong> button on the contact card sends an immediate email to the contact.</p>
                    <label for="contact-reminder-select-input">Send reminder to (contact)</label>
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
    const close = () => { modal.remove(); };

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
        close = () => { document.removeEventListener('click', closeDropdown); origClose(); };
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
        if (!name) { alert('Name is required.'); return; }
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
            alert(err.message || 'Save failed.');
        }
    });
    document.addEventListener('keydown', function escapeContactModal(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escapeContactModal); }
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
            <p class="contacts-reminder-desc">Send an immediate email reminder. Search contacts and select one or more, or enter an email address not in the list.</p>
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
            alert('Select at least one contact or enter an email address.');
            return;
        }
        const msg = (modal.querySelector('#reminder-message')?.value || '').trim();
        const send = typeof API !== 'undefined' && API.sendLandDevelopmentContactReminder;
        if (!send) {
            alert('Contacts API not loaded. Ensure api-client is loaded and includes sendLandDevelopmentContactReminder.');
            return;
        }
        const results = { sent: 0, failed: [] };
        try {
            for (const id of contactIds) {
                try {
                    await API.sendLandDevelopmentContactReminder({ contactId: id, message: msg || undefined });
                    results.sent += 1;
                } catch (err) {
                    results.failed.push({ id, label: `Contact ${id}`, error: err.message || String(err) });
                }
            }
            if (emailVal) {
                try {
                    await API.sendLandDevelopmentContactReminder({ email: emailVal, message: msg || undefined });
                    results.sent += 1;
                } catch (err) {
                    results.failed.push({ id: null, label: emailVal, error: err.message || String(err) });
                }
            }
            close();
            if (results.failed.length === 0) {
                alert(results.sent === 1 ? 'Reminder sent.' : `Reminder(s) sent to ${results.sent} recipient(s).`);
            } else {
                const failMsg = results.failed.map(f => `${f.label}: ${f.error}`).join('\n');
                alert(`Sent to ${results.sent} recipient(s). Failed:\n${failMsg}`);
            }
        } catch (err) {
            alert(err.message || 'Failed to send reminder.');
        }
    });
    document.addEventListener('keydown', function escapeReminderModal(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escapeReminderModal); }
    });
}

// Render Timeline (board-style with year/quarter columns)
// Timeline is the only view that includes START deals (they're placeholders for timeline)
function renderTimeline(deals) {
    const filtered = applyFilters(deals, false); // Don't exclude START in timeline
    const summary = calculateSummary(filtered, false); // Include START in timeline calculations
    
    const now = new Date();
    const allDates = [...summary.upcomingDates, ...summary.pastDates];
    
    // Get available years for timeline filter (from ALL deals, not just filtered ones)
    // Calculate years from the original allDeals array to show all available years
    // This ensures all years are visible even when other filters are applied
    const sourceDeals = window.allDeals || allDeals || deals;
    const allYearsFromAllDeals = [...new Set(sourceDeals.map(deal => {
        try {
            const startDate = deal['Start Date'] || deal.startDate || deal._original?.StartDate || deal._original?.startDate;
            if (startDate) {
                const itemDate = new Date(startDate);
                if (!isNaN(itemDate.getTime())) {
                    return itemDate.getFullYear().toString();
                }
            }
        } catch (e) {
            // Skip invalid dates
        }
        return null;
    }).filter(y => y !== null))].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Also get years from the current filtered dates as a fallback
    const allYearsFromFiltered = [...new Set(allDates.map(item => {
        try {
            const itemDate = new Date(item.date);
            if (!isNaN(itemDate.getTime())) {
                return itemDate.getFullYear().toString();
            }
        } catch (e) {
            console.warn('Invalid date in timeline:', item.date);
        }
        return null;
    }).filter(y => y !== null))].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Use the union of both to ensure we have all years
    const allYears = [...new Set([...allYearsFromAllDeals, ...allYearsFromFiltered])].sort((a, b) => parseInt(b) - parseInt(a));
    
    // Don't filter by year - show all dates (timeline shows all years, just scrolls to current year)
    const filteredDates = allDates;
    
    // Group by year/quarter
    const groupedByPeriod = {};
    filteredDates.forEach(item => {
        try {
        const date = new Date(item.date);
            if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        const periodKey = `Q${quarter} ${year}`;
        
        if (!groupedByPeriod[periodKey]) {
            groupedByPeriod[periodKey] = [];
        }
        groupedByPeriod[periodKey].push(item);
            }
        } catch (e) {
            console.warn('Error processing date in timeline:', item.date);
        }
    });
    
    // Sort periods chronologically (oldest to newest for left-to-right display)
    let periods = Object.keys(groupedByPeriod).sort((a, b) => {
        const [qA, yA] = a.split(' ').map(v => v.replace('Q', ''));
        const [qB, yB] = b.split(' ').map(v => v.replace('Q', ''));
        if (yA !== yB) return parseInt(yA) - parseInt(yB);
        return parseInt(qA) - parseInt(qB);
    });
    
    // Don't filter by year - show all periods
    
    // Check if we should highlight a specific deal
    const highlightDeal = window.highlightDealInTimeline;
    if (highlightDeal) {
        delete window.highlightDealInTimeline;
    }
    
    // Ensure we have years to display (fallback to current year if none found)
    const yearsToDisplay = allYears.length > 0 ? allYears : [new Date().getFullYear().toString()];
    
    return `
        <div class="timeline-board-container">
            ${renderActiveFilters()}
            <div class="timeline-board-header">
                <h3>Timeline View - Organized by Quarter</h3>
                <div class="timeline-year-filter">
                    <label>Filter by Year:</label>
                    <div class="quick-filter-buttons">
                        <button class="quick-filter-btn ${!currentFilters.year ? 'active' : ''}" data-filter-type="year" data-filter-value="" style="cursor: pointer; padding: 8px 16px; margin: 4px;">All Years</button>
                        ${yearsToDisplay.map(year => `
                            <button class="quick-filter-btn ${currentFilters.year === year ? 'active' : ''}" data-filter-type="year" data-filter-value="${year}" style="cursor: pointer; padding: 8px 16px; margin: 4px;">${year}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="timeline-board-columns">
                ${periods.map(period => {
                    const periodDeals = groupedByPeriod[period].sort((a, b) => a.date - b.date);
                    const [, year] = period.split(' ').map(v => v.replace('Q', ''));
                    return `
                        <div class="timeline-column" data-period="${period}" data-year="${year}">
                            <div class="timeline-column-header">
                                <span class="timeline-period">${period}</span>
                                <span class="timeline-count">${periodDeals.length}</span>
                            </div>
                            <div class="timeline-column-content">
                                ${periodDeals.map(item => {
                                    const stageConfig = STAGE_CONFIG[item.stage] || STAGE_CONFIG['Prospective'];
                                    const daysUntil = Math.ceil((item.date - now) / (1000 * 60 * 60 * 24));
                                    const isHighlighted = highlightDeal && item.name === highlightDeal;
                                    return `
                                        <div class="timeline-card ${isHighlighted ? 'highlighted' : ''}" data-deal-name="${item.name}">
                                            <div class="timeline-card-date">${formatDate(item.date)}</div>
                                            <div class="timeline-card-name">${item.name}</div>
                                            <div class="timeline-card-details">
                                                <span class="stage-badge clickable ${stageConfig.class}" data-stage="${item.stage}">${item.stage}</span>
                                                ${item.location ? `<span class="location-badge clickable" data-location="${item.location}">${item.location}</span>` : ''}
                                                ${item.units ? `<span class="units-info">${item.units} units</span>` : ''}
                                                ${item.bank ? `<span class="bank-info">${item.bank}</span>` : ''}
                                            </div>
                                            ${daysUntil >= 0 ? 
                                                `<div class="timeline-card-time">${daysUntil} day${daysUntil !== 1 ? 's' : ''} away</div>` :
                                                `<div class="timeline-card-time past">${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''} ago</div>`
                                            }
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Render Unit Summary
function renderUnitSummary(deals) {
    const filtered = applyFilters(deals, true); // Exclude START deals
    const summary = calculateSummary(filtered);
    
    return `
        ${renderActiveFilters()}
        <div class="unit-summary-container">
            <div class="summary-section">
                <h3>Total Units by Stage</h3>
                <div class="unit-breakdown">
                    ${(function () {
                        const stageKeys = Object.keys(summary.byStage).filter(k => !k.includes('_units') && k !== 'START');
                        const order = UNIT_SUMMARY_STAGE_ORDER;
                        const sorted = [...stageKeys].sort((a, b) => {
                            const ai = order.indexOf(a);
                            const bi = order.indexOf(b);
                            if (ai !== -1 && bi !== -1) return ai - bi;
                            if (ai !== -1) return -1;
                            if (bi !== -1) return 1;
                            return a.localeCompare(b);
                        });
                        return sorted.map(stage => {
                            const units = summary.byStage[stage + '_units'] || 0;
                            const count = summary.byStage[stage];
                            const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG['Prospective'];
                            const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                            return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span class="stage-badge clickable ${stageConfig.class}" data-stage="${stage}">${stage}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: ${stageConfig.color};"></div>
                                </div>
                                <div class="unit-count">${count} deals</div>
                            </div>
                        `;
                        }).join('');
                    })()}
                </div>
            </div>
            
            <div class="summary-section">
                <h3>Total Units by Product Type</h3>
                <div class="unit-breakdown">
                    ${Object.keys(summary.byProductType).map(productType => {
                        const typeDeals = filtered.filter(d => (d['Product Type'] || d.productType || 'Other') === productType);
                        const units = typeDeals.reduce((sum, d) => sum + parseInt(d['Unit Count'] || d.unitCount || 0), 0);
                        const percentage = summary.totalUnits > 0 ? ((units / summary.totalUnits) * 100).toFixed(1) : 0;
                        return `
                            <div class="unit-breakdown-item">
                                <div class="unit-breakdown-header">
                                    <span>${productType}</span>
                                    <span class="unit-value">${units.toLocaleString()} units</span>
                                    <span class="unit-percentage">${percentage}%</span>
                                </div>
                                <div class="unit-bar">
                                    <div class="unit-bar-fill" style="width: ${percentage}%; background-color: var(--primary-green);"></div>
                                </div>
                                <div class="unit-count">${summary.byProductType[productType]} deals</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// Update filter UI
function updateFiltersUI() {
    // Exclude START deals before calculating summary
    const dealsWithoutStart = allDeals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        return stage !== 'START' && stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
    });
    const summary = calculateSummary(dealsWithoutStart, true);
    
    // Build valid stages list (exclude START)
    const validStageKeys = Object.keys(summary.byStage)
        .filter(k => !k.includes('_units'))
        .filter(k => k !== 'START')
        .filter(k => k.toLowerCase() !== 'start')
        .filter(k => !k.includes('START'));
    const validStages = [...STAGE_DISPLAY_ORDER.filter(s => validStageKeys.includes(s)), ...validStageKeys.filter(s => !STAGE_DISPLAY_ORDER.includes(s)).sort()];
    const selectedStages = Array.isArray(currentFilters.stages) ? currentFilters.stages : [];

    // Update stage filter checkboxes (list view filter-controls)
    const stageCheckboxesContainer = document.getElementById('stage-filter-checkboxes');
    if (stageCheckboxesContainer) {
        stageCheckboxesContainer.innerHTML = validStages.map(s => {
            const checked = selectedStages.includes(s) ? ' checked' : '';
            const safe = s.replace(/"/g, '&quot;');
            return `<label class="stage-filter-checkbox-label"><input type="checkbox" class="stage-filter-checkbox" value="${safe}"${checked}> ${s}</label>`;
        }).join('');
    }

    // Update stage filter trigger button label
    const stageTrigger = document.getElementById('stage-filter-trigger');
    if (stageTrigger) {
        if (selectedStages.length === 0) stageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) stageTrigger.textContent = selectedStages.join(', ');
        else stageTrigger.textContent = selectedStages.length + ' stages';
    }
    // Overview stage dropdown trigger label (when on Overview page)
    const overviewStageTrigger = document.getElementById('overview-stage-filter-trigger');
    if (overviewStageTrigger) {
        if (selectedStages.length === 0) overviewStageTrigger.textContent = 'All Stages';
        else if (selectedStages.length <= 2) overviewStageTrigger.textContent = selectedStages.join(', ');
        else overviewStageTrigger.textContent = selectedStages.length + ' stages';
    }
    
    // Update quick filter dropdowns on overview page (state, product, year)
    const stateDropdown = document.getElementById('state-filter-dropdown');
    if (stateDropdown) stateDropdown.value = currentFilters.state || '';
    // Overview stage checkboxes are rendered in renderOverview; sync checked state if container exists
    const overviewStageCheckboxes = document.querySelectorAll('#overview-stage-filter-checkboxes .stage-filter-checkbox');
    overviewStageCheckboxes.forEach(cb => {
        cb.checked = selectedStages.includes(cb.value);
    });
    
    const productDropdown = document.getElementById('product-filter-dropdown');
    if (productDropdown) {
        productDropdown.value = currentFilters.product || '';
    }
    
    const yearDropdown = document.getElementById('year-filter-dropdown');
    if (yearDropdown) {
        yearDropdown.value = currentFilters.year || '';
    }
    
    // Update state filter (Filter by State)
    const stateFilter = document.getElementById('state-filter');
    if (stateFilter) {
        const states = Object.keys(summary.byState || {}).filter(s => s !== 'Unknown').sort();
        stateFilter.innerHTML = '<option value="">All States</option>' +
            states.map(state =>
                `<option value="${state}" ${currentFilters.state === state ? 'selected' : ''}>${state}</option>`
            ).join('');
    }
    
    // Update bank filter
    const bankFilter = document.getElementById('bank-filter');
    if (bankFilter) {
        bankFilter.innerHTML = '<option value="">All Banks</option>' +
            Object.keys(summary.byBank).filter(b => b !== 'Unknown').sort().map(bank => 
                `<option value="${bank}" ${currentFilters.bank === bank ? 'selected' : ''}>${bank}</option>`
            ).join('');
    }
    
    // Update product filter
    const productFilter = document.getElementById('product-filter');
    if (productFilter) {
        productFilter.innerHTML = '<option value="">All Types</option>' +
            Object.keys(summary.byProductType).sort().map(product => 
                `<option value="${product}" ${currentFilters.product === product ? 'selected' : ''}>${product}</option>`
            ).join('');
    }
    
    // hideStart filter removed - START deals are automatically excluded
}

// Update sort UI to reflect current sort settings
function updateSortUI() {
    const sortBy = document.getElementById('sort-by');
    const sortOrder = document.getElementById('sort-order');
    
    if (sortBy) {
        sortBy.value = currentSort.by;
    }
    
    if (sortOrder) {
        sortOrder.value = currentSort.order;
    }
}

// Get active filters for display
function getActiveFilters() {
    const active = [];
    if (currentFilters.stages && currentFilters.stages.length > 0) active.push({ label: 'Stage', value: currentFilters.stages.join(', ') });
    if (currentFilters.state) active.push({ label: 'State', value: currentFilters.state });
    if (currentFilters.bank) active.push({ label: 'Bank', value: currentFilters.bank });
    if (currentFilters.product) active.push({ label: 'Product Type', value: currentFilters.product });
    if (currentFilters.state) active.push({ label: 'State', value: currentFilters.state });
    if (currentFilters.year) active.push({ label: 'Year', value: currentFilters.year });
    if (currentFilters.search) active.push({ label: 'Search', value: currentFilters.search });
    return active;
}

// Render active filters display
function renderActiveFilters() {
    const active = getActiveFilters();
    if (active.length === 0) return '';
    
    return `
        <div class="active-filters-container">
            <div class="active-filters-label">Active Filters:</div>
            <div class="active-filters-list">
                ${active.map(filter => `
                    <span class="active-filter-badge">
                        <span class="filter-label">${filter.label}:</span>
                        <span class="filter-value">${filter.value}</span>
                    </span>
                `).join('')}
            </div>
            <button class="clear-filters-btn-top" onclick="clearFilters()">Clear All Filters</button>
        </div>
    `;
}

// Clear filters
function clearFilters() {
    currentFilters = {
        stages: [],
        location: '',
        bank: '',
        product: '',
        state: '',
        search: '', // Clear search
        year: '', // Clear year filter
        timelineStartDate: null,
        timelineEndDate: null
    };
    // Clear search input
    const searchInput = document.getElementById('search-filter');
    if (searchInput) searchInput.value = '';
    
    // Update year filter buttons if on timeline view
    if (currentView === 'timeline') {
        const timelineYearFilter = document.querySelector('.timeline-year-filter');
        if (timelineYearFilter) {
            timelineYearFilter.querySelectorAll('.quick-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filterValue === '');
            });
        }
        // Force re-render timeline to show all years
        const container = document.getElementById('deal-list-container');
        if (container) {
            container.innerHTML = renderTimeline(allDeals);
            setupDrillDownHandlers();
        }
    }
    
    updateFiltersUI();
    // Only switch view if not already on timeline (to avoid double render)
    if (currentView !== 'timeline') {
    switchView(currentView, allDeals);
    }
}

// Make clearFilters globally accessible
window.clearFilters = clearFilters;

// Asana sync: other custom fields (Unit Count, Stage, Bank, Product Type, Location, Pre-Con Manager). Both directions: DB ↔ Asana.
var ASANA_OTHER_FIELDS_CONFIG = [
    { key: 'unit_count', label: 'Unit Count', getDb: function(d) { var v = d['Unit Count'] || d.unitCount; return v != null && v !== '' ? String(v).trim() : ''; }, getAsana: function(t) { var v = t.unit_count != null ? t.unit_count : (t.custom_fields && t.custom_fields.unit_count != null ? t.custom_fields.unit_count : null); return v != null ? String(v).trim() : ''; }, same: function(a, b) { var na = parseInt(a, 10), nb = parseInt(b, 10); if (!isNaN(na) && !isNaN(nb)) return na === nb; return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'stage', label: 'Stage', getDb: function(d) { return (normalizeStage(d.Stage || d.stage) || '').trim(); }, getAsana: function(t) { var v = t.stage != null ? t.stage : (t.custom_fields && t.custom_fields.stage != null ? t.custom_fields.stage : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'bank', label: 'Bank', getDb: function(d) { return (d.Bank || d.bank || '').toString().trim(); }, getAsana: function(t) { var v = t.bank != null ? t.bank : (t.custom_fields && t.custom_fields.bank != null ? t.custom_fields.bank : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'product_type', label: 'Product Type', getDb: function(d) { return (getDealProductType(d) || (d['Product Type'] || d.productType) || '').toString().trim(); }, getAsana: function(t) { var v = t.product_type != null ? t.product_type : (t.custom_fields && t.custom_fields.product_type != null ? t.custom_fields.product_type : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'location', label: 'Location', getDb: function(d) { return (getDealLocation(d) || d.Location || d.location || '').toString().trim(); }, getAsana: function(t) { var v = t.location != null ? t.location : (t.custom_fields && t.custom_fields.location != null ? t.custom_fields.location : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
    { key: 'precon_manager', label: 'Pre-Con Manager', getDb: function(d) { return (d['Pre-Con'] || d.preCon || d['Pre-Con Manager'] || '').toString().trim(); }, getAsana: function(t) { var v = t.precon_manager != null ? t.precon_manager : (t.custom_fields && t.custom_fields.precon_manager != null ? t.custom_fields.precon_manager : null); return (v || '').toString().trim(); }, same: function(a, b) { return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase(); } },
];

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
                        // Refetch deals from API and re-render list so the list shows the saved date
                        (function refetchDealsAfterDateOverride() {
                            if (typeof API.getAllDealPipelines !== 'function') return;
                            API.getAllDealPipelines().then(function(refreshResponse) {
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
    const notes = deal.Notes || deal.notes || '';
    
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
    modal.className = 'deal-detail-modal';
    modal.innerHTML = `
        <div class="deal-detail-overlay"></div>
        <div class="deal-detail-content">
            <div class="deal-detail-header">
                <div class="deal-detail-nav">
                    <button type="button" class="deal-detail-nav-btn deal-detail-prev" ${nav.prev ? '' : ' disabled'} aria-label="Previous deal">‹ Previous</button>
                    <span class="deal-detail-nav-position">${navPosition}</span>
                    <button type="button" class="deal-detail-nav-btn deal-detail-next" ${nav.next ? '' : ' disabled'} aria-label="Next deal">Next ›</button>
                </div>
                <h2>${deal.Name || deal.name || 'Unnamed Deal'}</h2>
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
                            <span class="stage-badge ${stageConfig.class}">${stage}</span>
                        </div>
                        ${location ? `
                        <div class="deal-detail-item">
                            <label>Location</label>
                            <span>${location}</span>
                        </div>
                        ` : ''}
                        ${address ? `
                        <div class="deal-detail-item">
                            <label>Address</label>
                            <span>${address}</span>
                        </div>
                        ` : ''}
                        ${productType ? `
                        <div class="deal-detail-item">
                            <label>Product Type</label>
                            <span>${productType}</span>
                        </div>
                        ` : ''}
                        ${units ? `
                        <div class="deal-detail-item">
                            <label>Unit Count</label>
                            <span>${units} units</span>
                        </div>
                        ` : ''}
                        ${bank ? `
                        <div class="deal-detail-item">
                            <label>Bank</label>
                            <span>${bank}</span>
                        </div>
                        ` : ''}
                        ${preCon ? `
                        <div class="deal-detail-item">
                            <label>Pre-Con Manager</label>
                            <span>${preCon}</span>
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
                ${notes ? `
                <div class="deal-detail-section">
                    <h3>Notes</h3>
                    <div class="deal-detail-notes">
                        <pre>${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </div>
                </div>
                ` : ''}
                ${deal._original ? `
                <div class="deal-detail-section">
                    <h3>Additional Information</h3>
                    <div class="deal-detail-grid">
                        ${(() => {
                            const orig = deal._original;
                            const additionalFields = [];
                            
                            // Land development pipeline attributes
                            if (deal.BrokerReferralName || orig.BrokerReferralSource) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Broker/Referral</label><span>${(deal.BrokerReferralName || orig.BrokerReferralSource || '').replace(/</g, '&lt;')}</span></div>`);
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
                            if (orig.Region && orig.Region !== location) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Region</label><span>${orig.Region}</span></div>`);
                            }
                            
                            // City and State (if not already shown in location)
                            if (orig.City && !location.includes(orig.City)) {
                                additionalFields.push(`<div class="deal-detail-item"><label>City</label><span>${orig.City}</span></div>`);
                            }
                            if (orig.State && !location.includes(orig.State)) {
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
                            
                            // Sq Ft Price
                            if (orig.SqFtPrice) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Sq Ft Price</label><span>$${parseFloat(orig.SqFtPrice).toLocaleString()}</span></div>`);
                            }
                            
                            // Execution Date
                            if (orig.ExecutionDate) {
                                additionalFields.push(`<div class="deal-detail-item"><label>Execution Date</label><span>${formatDate(orig.ExecutionDate)}</span></div>`);
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
                <div class="deal-detail-section deal-detail-files-section" id="deal-detail-files-section" data-deal-pipeline-id="${deal.DealPipelineId || deal._original?.DealPipelineId || ''}">
                    <h3>Files</h3>
                    <p class="deal-detail-files-desc">${typeof isAuthenticated !== 'undefined' && isAuthenticated ? 'View, download, upload, rename, or delete files. Organize by section (Land, Design and Permits, etc.).' : 'View and download files. Only admins can upload, rename, or delete.'}</p>
                    <div class="deal-detail-files-message" id="deal-detail-files-message" role="status" aria-live="polite"></div>
                    <input type="file" id="deal-detail-file-version-input" accept="*" style="display: none;" />
                    <div class="deal-detail-files-subsections" id="deal-detail-files-subsections">
                        <div class="deal-detail-files-subsection" data-section="Land">
                            <h4 class="deal-detail-files-subsection-title">Land</h4>
                            <div class="deal-detail-files-upload" id="deal-detail-files-upload-wrap" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Land" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Land">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Land"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Design and Permits">
                            <h4 class="deal-detail-files-subsection-title">Design and Permits</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Design and Permits" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Design and Permits">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Design and Permits"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Comp Validation">
                            <h4 class="deal-detail-files-subsection-title">Comp Validation</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Comp Validation" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Comp Validation">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Comp Validation"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Contractor">
                            <h4 class="deal-detail-files-subsection-title">Contractor</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Contractor" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Contractor">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Contractor"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Legal">
                            <h4 class="deal-detail-files-subsection-title">Legal</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Legal" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Legal">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Legal"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Underwriting">
                            <h4 class="deal-detail-files-subsection-title">Underwriting</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Underwriting" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Underwriting">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Underwriting"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                        <div class="deal-detail-files-subsection" data-section="Other">
                            <h4 class="deal-detail-files-subsection-title">Other</h4>
                            <div class="deal-detail-files-upload" style="${typeof isAuthenticated !== 'undefined' && isAuthenticated ? '' : 'display: none;'}">
                                <input type="file" class="deal-detail-file-input" data-section="Other" multiple />
                                <button type="button" class="deal-detail-upload-btn" data-section="Other">Upload</button>
                            </div>
                            <div class="deal-detail-files-list-section" data-section="Other"><span class="deal-detail-files-loading">Loading…</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const dealPipelineId = deal.DealPipelineId || deal._original?.DealPipelineId;
    const filesSection = modal.querySelector('#deal-detail-files-section');
    const filesMessageEl = modal.querySelector('#deal-detail-files-message');
    var DEAL_PIPELINE_FILE_SECTIONS = ['Land', 'Design and Permits', 'Comp Validation', 'Contractor', 'Legal', 'Underwriting'];
    var sectionKeys = DEAL_PIPELINE_FILE_SECTIONS.concat('Other');
    
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
                var sec = displaySectionForAttachment(a, list);
                bySection[sec].push(a);
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
                    var versionLabel = versionCount > 1 ? ' <span class="deal-detail-file-version-badge">Version ' + versionCount + ' (current)</span>' : '';
                    var uploadNewVersionBtn = canEdit
                        ? ' <button type="button" class="deal-detail-file-upload-version-btn" data-parent-id="' + latest.DealPipelineAttachmentId + '" title="Upload new version">Upload new version</button>'
                        : '';
                    var viewableLatest = isViewableFile(latest.FileName, latest.ContentType);
                    var viewBtnLatest = viewableLatest
                        ? '<button type="button" class="deal-detail-file-view-btn" data-attachment-id="' + latest.DealPipelineAttachmentId + '" data-file-name="' + fileNameAttr + '" title="View in browser">View</button>'
                        : '';
                    html += '<div class="deal-detail-file-doc" data-parent-id="' + latest.DealPipelineAttachmentId + '"><div class="deal-detail-file-item" data-attachment-id="' + latest.DealPipelineAttachmentId + '"><span class="deal-detail-file-name" title="' + fileNameAttr + '">' + fileName + '</span>' + versionLabel + '<span class="deal-detail-file-meta">' + sizeKb + ' KB · ' + dateStr + '</span><div class="deal-detail-file-actions">' + renameBtn + viewBtnLatest + '<button type="button" class="deal-detail-file-download-btn" data-attachment-id="' + latest.DealPipelineAttachmentId + '" data-file-name="' + fileNameAttr + '" title="Download">Download</button>' + deleteBtn + uploadNewVersionBtn + '</div></div>';
                    if (versions.length > 1) {
                        html += '<div class="deal-detail-file-version-history">';
                        versions.slice(1).forEach(function (a, i) {
                            var vNum = versions.length - i;
                            var vDate = a.CreatedAt ? formatDate(a.CreatedAt) : '—';
                            var vName = (a.FileName || '').replace(/"/g, '&quot;');
                            var viewableVer = isViewableFile(a.FileName, a.ContentType);
                            var viewBtnVer = viewableVer
                                ? '<button type="button" class="deal-detail-file-view-btn" data-attachment-id="' + a.DealPipelineAttachmentId + '" data-file-name="' + vName + '" title="View in browser">View</button>'
                                : '';
                            html += '<div class="deal-detail-file-version-row"><span class="deal-detail-file-version-label">Version ' + vNum + '</span><span class="deal-detail-file-meta">' + vDate + '</span>' + viewBtnVer + '<button type="button" class="deal-detail-file-download-btn" data-attachment-id="' + a.DealPipelineAttachmentId + '" data-file-name="' + vName + '" title="Download">Download</button></div>';
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
    
    // Close on Escape key (must remove listener when modal closes in any way)
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', escapeHandler);
            modal.remove();
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    const closeModal = () => {
        document.removeEventListener('keydown', escapeHandler);
        modal.remove();
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
function showNotesModal(dealName, notes) {
    // Remove existing modal if any
    const existingModal = document.getElementById('notes-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'notes-modal';
    modal.className = 'notes-modal';
    modal.innerHTML = `
        <div class="notes-modal-overlay"></div>
        <div class="notes-modal-content">
            <div class="notes-modal-header">
                <h3>${dealName}</h3>
                <button class="notes-modal-close" onclick="this.closest('#notes-modal').remove()">&times;</button>
            </div>
            <div class="notes-modal-body">
                <pre>${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on overlay click
    modal.querySelector('.notes-modal-overlay').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

// Store timeline scroll position
let timelineScrollPosition = 0;

// Switch view
async function switchView(view, deals) {
    // Save timeline scroll position if leaving timeline view
    if (currentView === 'timeline') {
        const timelineColumns = document.querySelector('.timeline-board-columns');
        if (timelineColumns) {
            timelineScrollPosition = timelineColumns.scrollLeft;
        }
    }
    
    currentView = view;
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
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.dataset.view === view) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // Show/hide filter and sort controls (contacts has its own inline filters)
    if (view === 'list' || view === 'location' || view === 'files' || view === 'upcoming-dates') {
        if (filterControls) filterControls.style.display = 'flex';
        if (sortControls) sortControls.style.display = 'flex';
        // Update filter UI when showing controls
        updateFiltersUI();
        // Update sort UI to reflect current sort settings
        updateSortUI();
    } else {
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
            // Apply filters before initializing map; delay so layout (min-height) is applied before Leaflet measures the div
            const filteredForMap = applyFilters(deals, true);
            setTimeout(async () => {
                await initMap(filteredForMap);
                setupDrillDownHandlers();
                setupMapViewControls();
                if (mapInstance) mapInstance.invalidateSize();
            }, 350);
            break;
        case 'upcoming-dates':
            container.innerHTML = renderUpcomingDatesView(deals);
            setupDrillDownHandlers();
            break;
        case 'files':
            container.innerHTML = renderDealFilesView(deals);
            setupDrillDownHandlers();
            // Bind "View deal & files" buttons to open deal popup
            document.querySelectorAll('.deal-files-view-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const dealName = this.dataset.dealName;
                    const deal = (typeof allDeals !== 'undefined' ? allDeals : deals).find(d => (d.Name || d.name) === dealName);
                    if (deal) showDealDetail(deal);
                });
            });
            // Bind sortable column headers in Deal Files table
            document.querySelectorAll('.deal-files-table .sortable-header').forEach(header => {
                header.addEventListener('click', function() {
                    const sortBy = this.getAttribute('data-sort-by');
                    const sortOrder = this.getAttribute('data-sort-order');
                    if (sortBy && sortOrder) {
                        window.dealFilesTableSort = { by: sortBy, order: sortOrder };
                        switchView('files', typeof allDeals !== 'undefined' ? allDeals : deals);
                    }
                });
            });
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
                } catch (e) {
                    container.innerHTML = `<div class="contacts-view"><p class="contacts-error">Could not load contacts: ${(e.message || e).toString()}. Check that the Land Development Contacts API is available.</p></div>`;
                }
            })();
            break;
        case 'timeline':
            // Don't filter by year - show all years, but auto-scroll to current year
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
function updateVisibleDealCount(deals) {
    const source = deals != null ? deals : (typeof allDeals !== 'undefined' ? allDeals : []);
    const filtered = Array.isArray(source) && source.length > 0 ? applyFilters(source, true) : [];
    const count = filtered.length;
    const badge = document.getElementById('visible-deal-count-badge');
    if (badge) {
        badge.textContent = count === 1 ? '1 deal' : count + ' deals';
        badge.style.display = '';
    }
}

// Handle errors
function showError(message) {
    const container = document.getElementById('deal-list-container');
    container.innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${message}
        </div>
    `;
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
            if (typeof switchView === 'function' && typeof currentView !== 'undefined' && typeof allDeals !== 'undefined') switchView(currentView, allDeals);
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
function updateMobileState() {
    const m = window.matchMedia && window.matchMedia('(max-width: 768px)').matches || ('ontouchstart' in window && window.innerWidth <= 768);
    document.documentElement.setAttribute('data-mobile', m ? 'true' : 'false');
    window.IS_MOBILE = m;
}
var _mobileResizeT;
function debouncedMobileResize() {
    clearTimeout(_mobileResizeT);
    _mobileResizeT = setTimeout(updateMobileState, 100);
}
async function init() {
    // Mobile: keep data-mobile in sync on resize/rotate
    updateMobileState();
    window.addEventListener('resize', debouncedMobileResize);
    // One-time: stage filter dropdown so "All Stages" and overview stage dropdown work
    initStageFilterDropdowns();
    // One-time: map fullscreen button (delegated so it works in Domo/iframe and after re-render)
    initMapFullscreenDelegation();
    // Show loading state
    const container = document.getElementById('deal-list-container');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    
    // Initialize authentication UI
    initAuthUI();
    
    // Check for stored auth token
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
        API.setAuthToken(storedToken);
        try {
            const verifyResult = await API.verifyAuth();
            if (verifyResult.success) {
                isAuthenticated = true;
                currentUser = verifyResult.data.user;
                updateAuthUI();
            } else {
                localStorage.removeItem('authToken');
                API.clearAuthToken();
            }
        } catch (error) {
            console.warn('Stored token invalid:', error);
            localStorage.removeItem('authToken');
            API.clearAuthToken();
        }
    }
    
    // Load Procore data from Domo (if available) - do this first
    let procoreData = [];
    try {
        // Wait for domo.js to load if it's not available yet
        if (!DOMO) {
            DOMO = await waitForDomo(5000);
        }
        
        if (DOMO) {
            procoreData = await getAlias('procoreProjectInfo');
            window.PROCORE_DATA = procoreData;
        } else {
            console.log('Domo not available - running outside Domo environment. Procore sync will be skipped.');
            window.PROCORE_DATA = [];
        }
    } catch (error) {
        console.warn('Failed to load Procore data from Domo:', error);
        window.PROCORE_DATA = [];
    }
    
    // If not yet authenticated but running in Domo, try Domo SSO (backend requires email)
    if (!isAuthenticated && DOMO) {
        try {
            const domoUser = await getDomoCurrentUser();
            if (domoUser && domoUser.email) {
                if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] Calling backend with email:', domoUser.email);
                const result = await API.loginWithDomo(domoUser);
                if (result.success && result.data && result.data.token) {
                    isAuthenticated = true;
                    currentUser = result.data.user || { username: domoUser.email, email: domoUser.email, fullName: domoUser.name };
                    localStorage.setItem('authToken', result.data.token);
                    updateAuthUI();
                    if (typeof console !== 'undefined' && console.info) console.info('[Domo SSO] Success – you should see ADMIN badge and Deal Pipeline / Edit Mode.');
                } else {
                    if (typeof console !== 'undefined' && console.warn) console.warn('[Domo SSO] Backend did not return a token:', result && result.error ? result.error.message : result);
                }
            }
        } catch (err) {
            console.warn('[Domo SSO] Login skipped or failed:', err);
        }
    }
    // Refresh auth UI so Login button shows when Domo isn't available (or SSO didn't run)
    updateAuthUI();

    // Load deals from database API
    try {
        const response = await API.getAllDealPipelines();
        
        if (!response.success) {
            throw new Error(response.error?.message || 'Failed to load deals');
        }
        
        const dbDeals = response.data || [];
        
        // Sync Procore data to database in background (if authenticated)
        if (procoreData.length > 0 && isAuthenticated) {
            // Run sync in background (don't wait for it)
            syncProcoreDataToDatabase(procoreData, dbDeals).catch(err => {
                console.error('Error syncing Procore data:', err);
            });
        }
        
        // Fetch loans and banks to determine correct lender
        let loansMap = {}; // Map of ProjectId -> array of loans
        let banksMap = {}; // Map of BankId -> bank object
        
        try {
            // Fetch all loans
            const loansResponse = await API.getAllLoans();
            if (loansResponse.success) {
                const allLoans = loansResponse.data || [];
                // Group loans by ProjectId
                allLoans.forEach(loan => {
                    if (loan.ProjectId) {
                        if (!loansMap[loan.ProjectId]) {
                            loansMap[loan.ProjectId] = [];
                        }
                        loansMap[loan.ProjectId].push(loan);
                    }
                });
            }
        } catch (error) {
            console.warn('Failed to load loans:', error);
        }
        
        try {
            // Fetch all banks
            const banksResponse = await API.getAllBanks();
            if (banksResponse.success) {
                const allBanks = banksResponse.data || [];
                // Create map of BankId -> bank
                allBanks.forEach(bank => {
                    if (bank.BankId) {
                        banksMap[bank.BankId] = bank;
                    }
                });
            }
        } catch (error) {
            console.warn('Failed to load banks:', error);
        }
        
        // Build Procore matches BEFORE mapping deals (so matches are available for mapDealPipelineDataToDeal)
        if (procoreData && procoreData.length > 0 && dbDeals && dbDeals.length > 0) {
            buildProcoreMatches(procoreData, dbDeals);
        }
        
        // Map database deals to UI format with loans and banks data
        // This uses window.PROCORE_MATCHES which was just built above
        allDeals = dbDeals
            .map(deal => mapDealPipelineDataToDeal(deal, loansMap, banksMap))
            .filter(deal => deal !== null) // Filter out null deals (START deals)
            .filter(deal => {
                // Filter out HoldCo deals - they should not be displayed anywhere
                const stage = normalizeStage(deal.Stage || deal.stage);
                return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
            });
        
        // Update global reference
        window.allDeals = allDeals;
        
        // Build bank name mapping
        buildBankNameMap(allDeals);
        
        if (allDeals.length > 0) {
            // Set up navigation
            document.querySelectorAll('.nav-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const view = this.dataset.view;
                    switchView(view, allDeals);
                });
            });
            
            // Set up back button
            const backToNavBtn = document.getElementById('back-to-nav-btn');
            if (backToNavBtn) {
                backToNavBtn.addEventListener('click', function() {
                    // Navigate back to list view (default view)
                    switchView('list', allDeals);
                });
            }
            
            // Set up search input handler
            const searchInput = document.getElementById('search-filter');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    currentFilters.search = this.value.trim();
                    switchView(currentView, allDeals);
                });
            }
            
            // Set up filter event listeners (stage is handled by stage-filter-checkbox delegation above)
            const filterControlsContainer = document.getElementById('filter-controls');
            if (filterControlsContainer) {
                filterControlsContainer.addEventListener('change', function(e) {
                    if (e.target.id === 'state-filter') {
                        currentFilters.state = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'bank-filter') {
                        currentFilters.bank = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'product-filter') {
                        currentFilters.product = e.target.value;
                        switchView(currentView, allDeals);
                    }
                });
            }
            // Stage filter dropdown: trigger toggle, clear button, close on outside click
            const stageTrigger = document.getElementById('stage-filter-trigger');
            const stagePanel = document.getElementById('stage-filter-dropdown-panel');
            const stageClearBtn = document.getElementById('stage-filter-clear-btn');
            if (stageTrigger && stagePanel) {
                stageTrigger.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const open = stagePanel.getAttribute('aria-hidden') !== 'true';
                    stagePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
                    stageTrigger.setAttribute('aria-expanded', !open);
                    stagePanel.style.display = open ? 'block' : 'none';
                });
                document.addEventListener('click', function closeStagePanel(e) {
                    if (!stagePanel.contains(e.target) && e.target !== stageTrigger) {
                        stagePanel.setAttribute('aria-hidden', 'true');
                        stageTrigger.setAttribute('aria-expanded', 'false');
                        stagePanel.style.display = 'none';
                    }
                });
            }
            if (stageClearBtn) {
                stageClearBtn.addEventListener('click', function() {
                    currentFilters.stages = [];
                    updateFiltersUI();
                    if (stagePanel) { stagePanel.setAttribute('aria-hidden', 'true'); stagePanel.style.display = 'none'; }
                    if (stageTrigger) stageTrigger.setAttribute('aria-expanded', 'false');
                    switchView(currentView, allDeals);
                });
            }
            
            // Set up sort event listeners
            const sortControlsContainer = document.getElementById('sort-controls');
            if (sortControlsContainer) {
                sortControlsContainer.addEventListener('change', function(e) {
                    if (e.target.id === 'sort-by') {
                        currentSort.by = e.target.value;
                        switchView(currentView, allDeals);
                    } else if (e.target.id === 'sort-order') {
                        currentSort.order = e.target.value;
                        switchView(currentView, allDeals);
                    }
                });
            }
            
            // Initialize filter UI and sort UI
            updateFiltersUI();
            updateSortUI();
            
            // Render initial view
            switchView(currentView, allDeals);
        } else {
            showError('No deals found in the database.');
        }
    } catch (error) {
        console.error('Error loading deals:', error);
        showError(`Failed to load deals: ${error.message || 'Unknown error'}`);
    }
}

// ============================================================
// AUTHENTICATION AND EDIT MODE FUNCTIONS
// ============================================================

function initAuthUI() {
    // Show header actions (export button is always visible)
    const headerActions = document.getElementById('header-actions');
    if (headerActions) {
        headerActions.style.display = 'flex';
    }
    
    // Initialize Pre-Con Manager modal
    initPreConManagerModal();
    // Initialize Broker/Referral create modal
    initBrokerReferralModal();
    
    // auth-actions visibility is set by updateAuthUI (admin: show Deal Pipeline / Edit; non-admin: hidden, no login)
    
    // Setup export pipeline button (always available)
    const exportBtn = document.getElementById('export-pipeline-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPipelineToExcel);
    }
    
    // Login button
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            document.getElementById('login-modal').style.display = 'flex';
        });
    }
    
    // Edit mode button
    const editModeBtn = document.getElementById('edit-mode-btn');
    if (editModeBtn) {
        editModeBtn.addEventListener('click', toggleEditMode);
    }
    
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Modal close buttons
    const closeLoginModal = document.getElementById('close-login-modal');
    const cancelLogin = document.getElementById('cancel-login');
    if (closeLoginModal) {
        closeLoginModal.addEventListener('click', () => {
            document.getElementById('login-modal').style.display = 'none';
        });
    }
    if (cancelLogin) {
        cancelLogin.addEventListener('click', () => {
            document.getElementById('login-modal').style.display = 'none';
        });
    }
    
    // Deal edit modal
    const closeDealModal = document.getElementById('close-deal-modal');
    const cancelDealEdit = document.getElementById('cancel-deal-edit');
    if (closeDealModal) {
        closeDealModal.addEventListener('click', closeDealEditModal);
    }
    if (cancelDealEdit) {
        cancelDealEdit.addEventListener('click', closeDealEditModal);
    }
    
    // Deal edit form
    const dealEditForm = document.getElementById('deal-edit-form');
    if (dealEditForm) {
        dealEditForm.addEventListener('submit', handleDealSave);
    }
    
    // Delete deal button
    const deleteDealBtn = document.getElementById('delete-deal-btn');
    if (deleteDealBtn) {
        deleteDealBtn.addEventListener('click', handleDealDelete);
    }
    
    // Deal Pipeline button
    const dealPipelineBtn = document.getElementById('deal-pipeline-btn');
    if (dealPipelineBtn) {
        dealPipelineBtn.addEventListener('click', showDealPipelineView);
    }
    
    // Exit Deal Pipeline button
    const exitDealPipelineBtn = document.getElementById('exit-deal-pipeline-btn');
    if (exitDealPipelineBtn) {
        exitDealPipelineBtn.addEventListener('click', hideDealPipelineView);
    }
    
    // Add Deal Pipeline button
    const addDealPipelineBtn = document.getElementById('add-deal-pipeline-btn');
    if (addDealPipelineBtn) {
        addDealPipelineBtn.addEventListener('click', () => {
            // Add a new empty row to the table for creating a new deal
            addNewDealRow();
        });
    }
    
    // Deal Pipeline search
    const dealPipelineSearch = document.getElementById('deal-pipeline-search');
    if (dealPipelineSearch) {
        dealPipelineSearch.addEventListener('input', (e) => {
            filterDealPipelineTable(e.target.value);
        });
    }
    
    // Save All button
    const saveAllBtn = document.getElementById('save-all-deals-btn');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', saveAllDealPipelineRows);
    }
    
    // Close modal on overlay click
    document.getElementById('login-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'login-modal') {
            e.target.style.display = 'none';
        }
    });
    
    document.getElementById('bank-details-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'bank-details-modal') {
            e.target.style.display = 'none';
        }
    });
    document.getElementById('deal-edit-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'deal-edit-modal') {
            closeDealEditModal();
        }
    });
    
    // Set initial auth UI (admin badge + auth-actions only when logged in; otherwise just Export)
    updateAuthUI();
    
    // Bank name click handlers (using event delegation)
    document.addEventListener('click', async (e) => {
        const bankNameEl = e.target.closest('.bank-name-clickable');
        if (bankNameEl) {
            e.preventDefault();
            const bankName = bankNameEl.dataset.bankName;
            const bankId = bankNameEl.dataset.bankId;
            await showBankDetails(bankName, bankId);
        }
    });
}

function updateAuthUI() {
    const adminBadge = document.getElementById('admin-badge');
    const authActions = document.getElementById('auth-actions');
    const loginBtn = document.getElementById('login-btn');
    const dealPipelineBtn = document.getElementById('deal-pipeline-btn');
    const editModeBtn = document.getElementById('edit-mode-btn');
    
    if (isAuthenticated) {
        // Admin: show "ADMIN logged in" and Deal Pipeline / Edit Mode (auth synced with Domo – no logout button)
        if (adminBadge) adminBadge.style.display = 'inline-flex';
        if (authActions) authActions.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';
        if (dealPipelineBtn) dealPipelineBtn.style.display = 'inline-block';
        if (editModeBtn) editModeBtn.style.display = 'inline-block';
    } else {
        // Not authenticated: hide admin badge and Deal Pipeline / Edit Mode
        if (adminBadge) adminBadge.style.display = 'none';
        if (dealPipelineBtn) dealPipelineBtn.style.display = 'none';
        if (editModeBtn) editModeBtn.style.display = 'none';
        isEditMode = false;
        updateEditModeUI();
        document.body.classList.remove('deal-pipeline-open');
        const dealPipelineView = document.getElementById('deal-pipeline-view');
        if (dealPipelineView) {
            dealPipelineView.style.display = 'none';
            dealPipelineView.classList.remove('active');
        }
        // Show Login button when not authenticated so user can log in (local or Domo SSO fallback)
        if (authActions) authActions.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'inline-block';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    try {
        const result = await API.login(username, password);
        if (result.success) {
            isAuthenticated = true;
            currentUser = result.data.user;
            localStorage.setItem('authToken', result.data.token);
            updateAuthUI();
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('login-form').reset();
        } else {
            throw new Error(result.error?.message || 'Login failed');
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    }
}

function toggleEditMode() {
    if (!isAuthenticated) {
        alert('Please login first to enable edit mode.');
        return;
    }
    isEditMode = !isEditMode;
    updateEditModeUI();
    // Refresh the view to show/hide edit buttons
    switchView(currentView, allDeals);
}

function updateEditModeUI() {
    const editModeBtn = document.getElementById('edit-mode-btn');
    const dealPipelineBtn = document.getElementById('deal-pipeline-btn');
    
    if (editModeBtn) {
        if (isEditMode) {
            editModeBtn.textContent = 'Exit Edit Mode';
            editModeBtn.classList.add('active');
        } else {
            editModeBtn.textContent = 'Edit Mode';
            editModeBtn.classList.remove('active');
        }
    }
    
    // Show Deal Pipeline button only when in edit mode
    if (dealPipelineBtn) {
        dealPipelineBtn.style.display = (isAuthenticated && isEditMode) ? 'inline-block' : 'none';
    }
    
    // If exiting edit mode and Deal Pipeline view is open, hide it
    if (!isEditMode) {
        hideDealPipelineView();
    }
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Parse the rejection reason from deal Notes. Looks for "Rejection reason:" or "Rejected reason:"
 * and returns the text on the same line after the colon, or the line(s) after until a blank line.
 * @param {string} notes - Full notes text
 * @returns {string} Extracted reason or ''
 */
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
        alert('Please log in to edit deals.');
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
    
    // Load Pre-Con Managers for dropdown (using direct API call since api-client doesn't have this function)
    let preConManagers = [];
    try {
        const response = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`);
        const managersResponse = await response.json();
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
    document.getElementById('edit-units').value = deal['Unit Count'] || original.Units || '';
    document.getElementById('edit-unit-count').value = original.UnitCount || deal['Unit Count'] || '';
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
    const sqftPriceField = document.getElementById('edit-sqft-price');
    if (sqftPriceField) {
        sqftPriceField.value = original.SqFtPrice || '';
        sqftPriceField.classList.add('auto-calculated-field');
        sqftPriceField.setAttribute('data-source', 'Auto-calculated');
        sqftPriceField.style.cursor = 'not-allowed';
        sqftPriceField.title = 'Read-only: Auto-calculated from Land Price and Acreage. Update those fields to recalculate.';
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
    
    // Auto-calculate SqFtPrice if Acreage and LandPrice are present
    const acreage = parseFloat(original.Acreage || '');
    const landPrice = parseFloat(original.LandPrice || '');
    if (acreage > 0 && landPrice > 0) {
        const sqFtPrice = (landPrice / (acreage * 43560)).toFixed(2);
        document.getElementById('edit-sqft-price').value = sqFtPrice;
    }
    
    // Add listeners for auto-calculation
    const acreageField = document.getElementById('edit-acreage');
    const landPriceField = document.getElementById('edit-land-price');
    if (acreageField) {
        acreageField.removeEventListener('input', calculateSqFtPrice);
        acreageField.addEventListener('input', calculateSqFtPrice);
    }
    if (landPriceField) {
        landPriceField.removeEventListener('input', calculateSqFtPrice);
        landPriceField.addEventListener('input', calculateSqFtPrice);
    }
    
    // Show/hide rejection reason when stage is Rejected
    const editStageSelect = document.getElementById('edit-stage');
    const editRejectionWrap = document.getElementById('edit-rejection-reason-wrap');
    const editRejectionInput = document.getElementById('edit-rejection-reason');
    function toggleRejectionReason() {
        const isRejected = editStageSelect && editStageSelect.value === 'Rejected';
        if (editRejectionWrap) editRejectionWrap.style.display = isRejected ? 'block' : 'none';
        if (editRejectionInput && !isRejected) editRejectionInput.value = '';
    }
    editStageSelect.removeEventListener('change', toggleRejectionReason);
    editStageSelect.addEventListener('change', toggleRejectionReason);
    
    modal.style.display = 'flex';
}

function calculateSqFtPrice() {
    const acreage = parseFloat(document.getElementById('edit-acreage')?.value || 0);
    const landPrice = parseFloat(document.getElementById('edit-land-price')?.value || 0);
    const sqFtPriceField = document.getElementById('edit-sqft-price');
    
    if (sqFtPriceField && acreage > 0 && landPrice > 0) {
        const sqFtPrice = (landPrice / (acreage * 43560)).toFixed(2);
        sqFtPriceField.value = sqFtPrice;
    } else if (sqFtPriceField) {
        sqFtPriceField.value = '';
    }
}

function closeDealEditModal() {
    document.getElementById('deal-edit-modal').style.display = 'none';
    currentEditingDeal = null;
    document.getElementById('deal-edit-error').style.display = 'none';
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
        Units: form['edit-units'].value ? parseInt(form['edit-units'].value) : null,
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
            // Reload deals
            await init();
            // If Core Data Management (pipeline) view is visible, refresh the table so edits show
            const pipelineView = document.getElementById('deal-pipeline-view');
            if (pipelineView && pipelineView.style.display !== 'none') {
                renderDealPipelineTable();
            }
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
        alert('You must be logged in and in edit mode to delete deals.');
        return;
    }
    
    if (!currentEditingDeal || !currentEditingDeal.DealPipelineId) {
        alert('Cannot delete: Deal ID not found.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${currentEditingDeal.Name}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const result = await API.deleteDealPipeline(currentEditingDeal.DealPipelineId);
        if (result.success) {
            closeDealEditModal();
            // Reload deals
            await init();
        } else {
            throw new Error(result.error?.message || 'Failed to delete deal');
        }
    } catch (error) {
        alert(`Failed to delete deal: ${error.message || 'Unknown error'}`);
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

function showDealPipelineView() {
    if (!isAuthenticated) {
        alert('Please login to access Deal Pipeline management.');
        return;
    }
    
    // Require Edit Mode to be on before opening Deal Pipeline
    if (!isEditMode) {
        alert('Please click "Edit Mode" first to access Deal Pipeline management.');
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

async function renderDealPipelineTable() {
    const container = document.getElementById('deal-pipeline-table-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div></div>';
    
    try {
        // Get all deals
        const response = await API.getAllDealPipelines();
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
        
        // Get Pre-Con Managers for dropdown (using direct API call since api-client doesn't have this function)
        let preConManagers = [];
        try {
            const response = await fetch(`${window.API_BASE_URL || 'https://stoagroupdb-ddre.onrender.com'}/api/core/precon-managers`);
            const managersResponse = await response.json();
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
        alert('You must be logged in and in edit mode to save changes.');
        return;
    }
    
    const changedRows = document.querySelectorAll('.deal-pipeline-table tr.has-changes');
    if (changedRows.length === 0) {
        alert('No changes to save.');
        return;
    }
    
    const confirmMessage = `Are you sure you want to save changes to ${changedRows.length} deal${changedRows.length !== 1 ? 's' : ''}?`;
    if (!confirm(confirmMessage)) {
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
        alert(`Successfully saved ${successCount} deal${successCount !== 1 ? 's' : ''}!`);
        
        // Refresh data from database
        // Refresh the deal pipeline table (fetches fresh data from API)
        await renderDealPipelineTable();
        
        // Also refresh the main allDeals array for other views
        try {
            const refreshResponse = await API.getAllDealPipelines();
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
        const errorMsg = `Saved ${successCount} deal${successCount !== 1 ? 's' : ''}, but ${errorCount} error${errorCount !== 1 ? 's' : ''} occurred:\n\n${errors.join('\n')}`;
        alert(errorMsg);
        // Still refresh even if there were some errors
        await renderDealPipelineTable();
    }
}

// Make saveAllDealPipelineRows globally accessible
window.saveAllDealPipelineRows = saveAllDealPipelineRows;

// Initialize searchable select dropdowns for Pre-Con Manager
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
                        alert('Error: Could not find Pre-Con Manager ID. Please try selecting again or refresh the page.');
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
        modal.style.display = 'none';
        modal._inputElement = null;
        modal._dropdownElement = null;
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
            alert('Name is required.');
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
    
    // Close modal handlers
    const closeModal = () => {
        modal.style.display = 'none';
        modal._inputElement = null;
        modal._wrapperElement = null;
        modal._dropdownElement = null;
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
            alert('Full Name is required.');
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
                    alert(`A Pre-Con Manager with the name "${duplicateName.FullName || duplicateName.ManagerName}" already exists. Please use the existing manager or choose a different name.`);
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
                        alert(`A Pre-Con Manager with the email "${duplicateEmail.Email}" already exists (${duplicateEmail.FullName || duplicateEmail.ManagerName}). Please use a different email address.`);
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
                        alert(`A Pre-Con Manager with the phone number "${duplicatePhone.PhoneNumber || duplicatePhone.Phone}" already exists (${duplicatePhone.FullName || duplicatePhone.ManagerName}). Please use a different phone number.`);
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
                
                alert(`Pre-Con Manager "${fullName}" created successfully! The PreConManagerId (${newManager.PreConManagerId}) has been set. Please save the deal to persist this change.`);
            } else {
                console.error('Failed to create Pre-Con Manager:', result);
                throw new Error(result.error?.message || 'Failed to create Pre-Con Manager');
            }
        } catch (error) {
            alert(`Failed to create Pre-Con Manager: ${error.message}`);
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
        alert('You must be logged in to save changes. Please log in and try again.');
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
        alert('Could not find deal row to save.');
        return;
    }
    
    const fields = row.querySelectorAll('.deal-pipeline-field');
    const data = {};
    
    // Validate required fields (use the row we're actually saving)
    const projectNameField = row.querySelector('[data-field="ProjectName"]');
    if (!projectNameField || !projectNameField.value.trim()) {
        alert('Project Name is required. Enter a name in the Project Name column for this row.');
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
                        alert('State must be exactly 2 letters (e.g., CA, TX, NY).');
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
                alert('Deal created successfully!');
            }
        } else {
            // Update existing deal
            result = await API.updateDealPipeline(parseInt(dealId), data);
            if (result.success) {
                row.classList.remove('has-changes');
                updateSaveAllButtonVisibility();
                alert('Deal updated successfully!');
            }
        }
        
        if (!result.success) {
            const errorMsg = result.error?.message || 'Unknown error';
            alert(`Failed to ${isNewDeal ? 'create' : 'update'} deal: ${errorMsg}`);
            console.error('Deal save failed:', result.error);
        }
        
        if (result.success) {
            // Update row data attributes if it was a new deal
            if (isNewDeal && result.data) {
                row.dataset.dealId = result.data.DealPipelineId || '';
                row.dataset.projectId = result.data.ProjectId || '';
            }
            
            // Refresh data from database
            // Refresh the deal pipeline table (fetches fresh data from API)
            await renderDealPipelineTable();
            
            // Also refresh the main allDeals array for other views
            try {
                const refreshResponse = await API.getAllDealPipelines();
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
        alert(`Failed to ${isNewDeal ? 'create' : 'update'} deal: ${error.message}`);
    }
};

window.deleteDealPipelineRow = async function(dealId) {
    if (!isAuthenticated || !isEditMode) {
        alert('You must be logged in and in edit mode to delete deals.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this deal? This action cannot be undone.')) {
        return;
    }
    
    try {
        const result = await API.deleteDealPipeline(dealId);
        if (result.success) {
            alert('Deal deleted successfully!');
            // Refresh the table
            await renderDealPipelineTable();
        } else {
            throw new Error(result.error?.message || 'Failed to delete deal');
        }
    } catch (error) {
        alert(`Failed to delete deal: ${error.message}`);
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
async function exportPipelineToExcel() {
    try {
        // Check if ExcelJS is loaded
        if (typeof ExcelJS === 'undefined') {
            alert('Excel library not loaded. Please refresh the page and try again.');
            return;
        }

        // Show stage selection modal first
        showExportStageModal();
    } catch (error) {
        console.error('Error starting export:', error);
        alert('Failed to start export. Please try again. Error: ' + error.message);
    }
}

// Show export stage selection modal
function showExportStageModal() {
    const modal = document.getElementById('export-stage-modal');
    const checkboxesContainer = document.getElementById('export-stage-checkboxes');
    
    if (!modal || !checkboxesContainer) {
        alert('Export modal not found. Please refresh the page.');
        return;
    }
    
    // Use single source of truth for stage order (add Lease-Up, Other if needed for export)
    const stages = [...STAGE_DISPLAY_ORDER];
    if (!stages.includes('Lease-Up')) stages.push('Lease-Up');
    if (!stages.includes('Other')) stages.push('Other');
    
    // Populate checkboxes
    checkboxesContainer.innerHTML = stages.map(stage => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
            <input type="checkbox" value="${stage}" class="export-stage-checkbox" style="width: auto;">
            <span>${stage}</span>
        </label>
    `).join('');
    
    // Show modal
    modal.style.display = 'flex';
    
    // Setup event listeners
    const updateContinueButton = () => {
        const continueBtn = document.getElementById('continue-export-stage-btn');
        if (continueBtn) {
            const checked = checkboxesContainer.querySelectorAll('.export-stage-checkbox:checked');
            continueBtn.disabled = checked.length === 0;
        }
    };
    
    // Use event delegation for checkboxes
    checkboxesContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('export-stage-checkbox')) {
            updateContinueButton();
        }
    });
    
    // Get button references
    const continueBtn = document.getElementById('continue-export-stage-btn');
    const cancelBtn = document.getElementById('cancel-export-stage-btn');
    const closeBtn = document.getElementById('close-export-stage-modal');
    
    // Remove any existing listeners by removing and re-adding
    const handleContinueClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (continueBtn && continueBtn.disabled) {
            return;
        }
        
        const selectedStages = Array.from(checkboxesContainer.querySelectorAll('.export-stage-checkbox:checked'))
            .map(cb => cb.value);
        
        if (selectedStages.length === 0) {
            alert('Please select at least one stage to export.');
            return;
        }
        
        modal.style.display = 'none';
        showExportTypeModal(selectedStages);
    };
    
    const handleCancelClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'none';
    };
    
    // Remove old listeners if they exist
    if (continueBtn && continueBtn._exportHandler) {
        continueBtn.removeEventListener('click', continueBtn._exportHandler);
    }
    if (cancelBtn && cancelBtn._exportHandler) {
        cancelBtn.removeEventListener('click', cancelBtn._exportHandler);
    }
    if (closeBtn && closeBtn._exportHandler) {
        closeBtn.removeEventListener('click', closeBtn._exportHandler);
    }
    
    // Add new listeners
    if (continueBtn) {
        continueBtn._exportHandler = handleContinueClick;
        continueBtn.addEventListener('click', handleContinueClick);
    }
    if (cancelBtn) {
        cancelBtn._exportHandler = handleCancelClick;
        cancelBtn.addEventListener('click', handleCancelClick);
    }
    if (closeBtn) {
        closeBtn._exportHandler = handleCancelClick;
        closeBtn.addEventListener('click', handleCancelClick);
    }
    
    updateContinueButton();
}

// Show export type selection modal
function showExportTypeModal(selectedStages) {
    const modal = document.getElementById('export-type-modal');
    
    if (!modal) {
        alert('Export type modal not found. Please refresh the page.');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Get button references
    const continueBtn = document.getElementById('continue-export-type-btn');
    const cancelBtn = document.getElementById('cancel-export-type-btn');
    const closeBtn = document.getElementById('close-export-type-modal');
    
    const handleContinueClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const exportType = document.querySelector('input[name="export-type"]:checked')?.value || 'internal';
        modal.style.display = 'none';
        performExport(selectedStages, exportType);
    };
    
    const handleCancelClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'none';
    };
    
    // Remove old listeners if they exist
    if (continueBtn && continueBtn._exportHandler) {
        continueBtn.removeEventListener('click', continueBtn._exportHandler);
    }
    if (cancelBtn && cancelBtn._exportHandler) {
        cancelBtn.removeEventListener('click', cancelBtn._exportHandler);
    }
    if (closeBtn && closeBtn._exportHandler) {
        closeBtn.removeEventListener('click', closeBtn._exportHandler);
    }
    
    // Add new listeners
    if (continueBtn) {
        continueBtn._exportHandler = handleContinueClick;
        continueBtn.addEventListener('click', handleContinueClick);
    }
    if (cancelBtn) {
        cancelBtn._exportHandler = handleCancelClick;
        cancelBtn.addEventListener('click', handleCancelClick);
    }
    if (closeBtn) {
        closeBtn._exportHandler = handleCancelClick;
        closeBtn.addEventListener('click', handleCancelClick);
    }
}

// Perform the actual export
async function performExport(selectedStages, exportType) {
    try {

        // Show loading indicator
        const exportBtn = document.getElementById('export-pipeline-btn');
        const originalText = exportBtn ? exportBtn.textContent : '';
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Refreshing data...';
        }

        try {
            // Refresh data from API before exporting
            console.log('Refreshing deal pipeline data before export...');
            
            // Fetch fresh deals from database
            const response = await API.getAllDealPipelines();
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to refresh deals');
            }
            
            const dbDeals = response.data || [];
            console.log(`Refreshed ${dbDeals.length} deals from database`);
            
            // Fetch loans and banks to determine correct lender
            let loansMap = {};
            let banksMap = {};
            
            try {
                const loansResponse = await API.getAllLoans();
                if (loansResponse.success) {
                    const allLoans = loansResponse.data || [];
                    allLoans.forEach(loan => {
                        if (loan.ProjectId) {
                            if (!loansMap[loan.ProjectId]) {
                                loansMap[loan.ProjectId] = [];
                            }
                            loansMap[loan.ProjectId].push(loan);
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch loans:', error);
            }
            
            try {
                const banksResponse = await API.getAllBanks();
                if (banksResponse.success) {
                    const allBanks = banksResponse.data || [];
                    allBanks.forEach(bank => {
                        if (bank.BankId) {
                            banksMap[bank.BankId] = bank;
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch banks:', error);
            }
            
            // Process and map the fresh data
            const refreshedDeals = [];
            dbDeals.forEach(dbDeal => {
                const deal = mapDealPipelineDataToDeal(dbDeal, loansMap, banksMap);
                if (deal) {
                    refreshedDeals.push(deal);
                }
            });
            
            // Update global allDeals with fresh data
            window.allDeals = refreshedDeals;
            console.log(`Updated allDeals with ${refreshedDeals.length} deals`);
            
        } catch (error) {
            console.warn('Failed to refresh data, using cached data:', error);
            // Continue with existing allDeals if refresh fails
        } finally {
            // Restore button state
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
        }

        // Filter deals by selected stages
        const dealsToExport = allDeals.filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return selectedStages.includes(stage);
        }).sort((a, b) => {
            // Sort by start date
            const aDate = new Date(a['Start Date'] || a.startDate || 0);
            const bDate = new Date(b['Start Date'] || b.startDate || 0);
            return aDate - bDate;
        });

        if (dealsToExport.length === 0) {
            alert('No deals found to export for the selected stages.');
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
            return;
        }

        // Group deals by stage (in the order they appear in overview)
        const stageOrder = [
            'Prospective',
            'Under Review',
            'Under Contract',
            'Under Construction',
            'Lease-Up',
            'Stabilized',
            'Liquidated',
            'Commercial Land - Listed',
            'Rejected',
            'Dead',
            'Other'
        ];
        
        const dealsByStage = {};
        dealsToExport.forEach(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            if (!dealsByStage[stage]) {
                dealsByStage[stage] = [];
            }
            dealsByStage[stage].push(deal);
        });
        
        // Sort each stage group by start date
        Object.keys(dealsByStage).forEach(stage => {
            dealsByStage[stage].sort((a, b) => {
                const aDate = new Date(a['Start Date'] || a.startDate || 0);
                const bDate = new Date(b['Start Date'] || b.startDate || 0);
                return aDate - bDate;
            });
        });

        // Define columns based on export type
        const allColumns = [
            'Project Name',
            'Stage',
            'City',
            'State',
            'Region',
            'Units',
            'Product Type',
            'Bank',
            'Start Date',
            'Due Diligence Date',
            'Closing Date',
            'Acreage',
            'Land Price',
            'Sq Ft Price',
            'Opportunity Zone',
            'Location'
        ];
        
        const investorExcludedColumns = ['Due Diligence Date', 'Land Price', 'Sq Ft Price', 'Opportunity Zone'];
        const columnsToInclude = exportType === 'investors' 
            ? allColumns.filter(col => !investorExcludedColumns.includes(col))
            : allColumns;

        // Helper function to create Google Maps URL
        const createLocationLink = (deal) => {
            const original = deal._original || {};
            const lat = deal.Latitude || original.Latitude;
            const lng = deal.Longitude || original.Longitude;
            
            if (lat && lng) {
                return `https://www.google.com/maps?q=${lat},${lng}`;
            }
            
            const address = deal.Location || '';
            if (address) {
                return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
            }
            
            const city = original.City || '';
            const state = original.State || '';
            if (city || state) {
                const location = `${city}, ${state}`.replace(/^,\s*|,\s*$/g, '').trim();
                if (location) {
                    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
                }
            }
            
            return null;
        };

        // Helper function to prepare data for a stage
        const prepareStageData = (stageDeals) => {
            return stageDeals.map(deal => {
                const original = deal._original || {};
                const startDate = deal['Start Date'] || original.StartDate || '';
                const closingDate = original.ClosingDate || '';
                const dueDiligenceDate = original.DueDiligenceDate || '';
                
                const locationLink = createLocationLink(deal);
                const locationText = deal.Location || `${original.City || ''}, ${original.State || ''}`.replace(/^,\s*|,\s*$/g, '');
                
                const row = {
                    'Project Name': deal.Name || original.ProjectName || '',
                    'Stage': deal.Stage || original.Stage || '',
                    'City': original.City || '',
                    'State': original.State || '',
                    'Region': original.Region || '',
                    'Units': deal['Unit Count'] || original.Units || original.UnitCount || '',
                    'Product Type': deal['Product Type'] || original.ProductType || '',
                    'Bank': deal.Bank || '',
                    'Start Date': startDate ? new Date(startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Due Diligence Date': dueDiligenceDate ? new Date(dueDiligenceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Closing Date': closingDate ? new Date(closingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Acreage': original.Acreage || '',
                    'Land Price': original.LandPrice ? `$${parseFloat(original.LandPrice).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '',
                    'Sq Ft Price': original.SqFtPrice ? `$${parseFloat(original.SqFtPrice).toFixed(2)}` : '',
                    'Opportunity Zone': original.OpportunityZone ? 'Yes' : 'No',
                    'Location': locationText,
                    '_locationLink': locationLink // Store link separately for Excel hyperlink
                };
                
                return row;
            });
        };
        
        // STOA Brand Colors (ExcelJS uses ARGB format)
        const brandColors = {
            primaryGreen: 'FF7E8A6B',      // #7e8a6b (dark green text)
            secondaryGreen: 'FFA6AD8A',     // #a6ad8a (light green background for header)
            secondaryGrey: 'FFEFEFF1',      // #efeff1 (light grey for banded rows)
            white: 'FFFFFFFF',             // #ffffff
            underContractBlue: 'FF2563EB', // #2563eb (Under Contract stage color)
            textPrimary: 'FF1F2937',       // #1f2937
            textSecondary: 'FF6B7280',      // #6b7280
            borderColor: 'FFE5E7EB',      // #e5e7eb
            darkGrey: 'FFD3D3D3'          // #d3d3d3 (darker grey for total row)
        };
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        
        // Helper function to create a worksheet for a stage
        const createStageWorksheet = (stage, stageDeals) => {
            const excelData = prepareStageData(stageDeals);
            
            // Filter columns based on export type
            const filteredData = excelData.map(row => {
                const filteredRow = {};
                columnsToInclude.forEach(col => {
                    filteredRow[col] = row[col];
                });
                // Keep location link for hyperlink
                filteredRow._locationLink = row._locationLink;
                return filteredRow;
            });
            
            // Calculate totals
            const totalUnits = stageDeals.reduce((sum, deal) => {
                const units = parseInt(deal['Unit Count'] || deal._original?.Units || deal._original?.UnitCount || 0);
                return sum + (isNaN(units) ? 0 : units);
            }, 0);
            
            const totalLandPrice = stageDeals.reduce((sum, deal) => {
                const price = parseFloat(deal._original?.LandPrice || 0);
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            
            const totalAcreage = stageDeals.reduce((sum, deal) => {
                const acreage = parseFloat(deal._original?.Acreage || 0);
                return sum + (isNaN(acreage) ? 0 : acreage);
            }, 0);
            
            // Create total row
            const totalRow = {};
            columnsToInclude.forEach(col => {
                if (col === 'Project Name') {
                    totalRow[col] = 'TOTAL';
                } else if (col === 'Units') {
                    totalRow[col] = totalUnits;
                } else if (col === 'Acreage') {
                    totalRow[col] = totalAcreage > 0 ? totalAcreage.toFixed(2) : '';
                } else if (col === 'Land Price') {
                    totalRow[col] = totalLandPrice > 0 ? `$${totalLandPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '';
                } else {
                    totalRow[col] = '';
                }
            });
            
            const worksheet = workbook.addWorksheet(stage);
            const columnKeys = columnsToInclude;
            const numColumns = columnKeys.length;
            
            // Find location column index
            const locationColIndex = columnKeys.indexOf('Location');
            
            // Add title row (row 1)
            const titleRow = worksheet.addRow(['STOA Group - Deal Pipeline Report']);
            worksheet.mergeCells(1, 1, 1, numColumns);
            titleRow.getCell(1).font = { name: 'Arial', size: 24, bold: true, color: { argb: brandColors.white } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.primaryGreen } };
            titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            titleRow.height = 30;
            
            // Add subtitle row (row 2)
            const subtitleRow = worksheet.addRow([`${stage} Deals`]);
            worksheet.mergeCells(2, 1, 2, numColumns);
            subtitleRow.getCell(1).font = { name: 'Arial', size: 18, bold: true, color: { argb: brandColors.primaryGreen } };
            subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.white } };
            subtitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            subtitleRow.height = 22;
            
            // Add date row (row 3)
            const dateRow = worksheet.addRow([`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]);
            worksheet.mergeCells(3, 1, 3, numColumns);
            dateRow.getCell(1).font = { name: 'Arial', size: 11, color: { argb: brandColors.textSecondary } };
            dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.white } };
            dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            dateRow.height = 18;
            
            // Add blank row (row 4)
            worksheet.addRow([]);
            worksheet.getRow(4).height = 5;
            
            // Add header row (row 5)
            const headerRow = worksheet.addRow(columnKeys);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.secondaryGreen } };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: brandColors.borderColor } },
                    bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                    left: { style: 'thin', color: { argb: brandColors.borderColor } },
                    right: { style: 'thin', color: { argb: brandColors.borderColor } }
                };
            });
            headerRow.height = 25;
            
            // Add data rows
            filteredData.forEach((rowData, rowIndex) => {
                const rowValues = columnKeys.map(key => rowData[key]);
                const row = worksheet.addRow(rowValues);
                const isEvenRow = rowIndex % 2 === 0;
                const bgColor = isEvenRow ? brandColors.white : brandColors.secondaryGrey;
                
                row.eachCell((cell, colNumber) => {
                    cell.font = { name: 'Arial', size: 10, color: { argb: brandColors.textPrimary } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.alignment = { 
                        horizontal: colNumber === 1 ? 'left' : 'center', 
                        vertical: 'middle',
                        wrapText: true
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: brandColors.borderColor } },
                        bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                        left: { style: 'thin', color: { argb: brandColors.borderColor } },
                        right: { style: 'thin', color: { argb: brandColors.borderColor } }
                    };
                    
                    // Add hyperlink to Location column
                    if (colNumber === locationColIndex + 1 && rowData._locationLink) {
                        cell.value = { text: rowData['Location'], hyperlink: rowData._locationLink };
                        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0000FF' }, underline: true };
                    }
                });
                row.height = 20;
            });
            
            // Add total row
            const totalRowValues = columnKeys.map(key => totalRow[key]);
            const totalRowData = worksheet.addRow(totalRowValues);
            totalRowData.eachCell((cell) => {
                cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: brandColors.textPrimary } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.darkGrey } };
                cell.alignment = { 
                    horizontal: cell.col === 1 ? 'left' : 'center', 
                    vertical: 'middle',
                    wrapText: true
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: brandColors.borderColor } },
                    bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                    left: { style: 'thin', color: { argb: brandColors.borderColor } },
                    right: { style: 'thin', color: { argb: brandColors.borderColor } }
                };
            });
            totalRowData.height = 20;
            
            // Set column widths
            const minWidths = {
                'Project Name': 25,
                'City': 15,
                'State': 8,
                'Region': 15,
                'Bank': 20,
                'Start Date': 15,
                'Due Diligence Date': 20,
                'Closing Date': 15,
                'Land Price': 18,
                'Sq Ft Price': 12,
                'Location': 25
            };
            
            columnKeys.forEach((key, index) => {
                let maxWidth = 0;
                const colNumber = index + 1;
                
                const headerCell = headerRow.getCell(colNumber);
                if (headerCell.value) {
                    maxWidth = Math.max(maxWidth, String(headerCell.value).length);
                }
                
                filteredData.forEach(rowData => {
                    const value = rowData[key];
                    if (value !== null && value !== undefined) {
                        maxWidth = Math.max(maxWidth, String(value).length);
                    }
                });
                
                const totalValue = totalRow[key];
                if (totalValue !== null && totalValue !== undefined) {
                    maxWidth = Math.max(maxWidth, String(totalValue).length);
                }
                
                const minWidth = minWidths[key] || 12;
                const finalWidth = Math.max(minWidth, Math.min(maxWidth + 2, 60));
                worksheet.getColumn(colNumber).width = finalWidth;
            });
            
            // Freeze header row
            worksheet.views = [{ state: 'frozen', ySplit: 5 }];
            
            return worksheet;
        };
        
        // Create worksheets for each selected stage (in order)
        const orderedStages = stageOrder.filter(s => selectedStages.includes(s) && dealsByStage[s]);
        orderedStages.forEach(stage => {
            createStageWorksheet(stage, dealsByStage[stage]);
        });
        
        // Generate filename with date
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const exportTypeLabel = exportType === 'investors' ? 'Investors' : 'Internal';
        const filename = `STOA_Deal_Pipeline_${exportTypeLabel}_${dateStr}.xlsx`;

        // Write file using FileSaver
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);

        // Show success message
        const stageCount = orderedStages.length;
        const stageLabel = stageCount === 1 ? 'stage' : 'stages';
        const message = `Successfully exported ${dealsToExport.length} deal(s) across ${stageCount} ${stageLabel} to ${filename}`;
        console.log(message);
        
        // Create a temporary toast notification
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 24px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-weight: 500;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        
        // Restore button state
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }

    } catch (error) {
        console.error('Error exporting pipeline:', error);
        alert('Failed to export pipeline. Please try again or contact support. Error: ' + error.message);
        
        // Restore button state on error
        const exportBtn = document.getElementById('export-pipeline-btn');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export Pipeline';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
