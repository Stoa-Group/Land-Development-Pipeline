// modules/data/transforms.js — Data processing, mapping, and filtering
import { state, STAGE_CONFIG, STAGE_DISPLAY_ORDER, DEFAULT_EXCLUDED_STAGES } from '../core/state.js';
import { _dpLog, _dpWarn } from '../core/utils.js';
import { isProcoreStartDateOverride } from './domo.js';

const $ = (sel, root) => (root || document).querySelector(sel);

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
    if (stageLower.includes('commercial') && stageLower.includes('land') && stageLower.includes('listed')) return 'Commercial Land - Listed';
    if (stageLower === 'dead') return 'Dead';
    if (stageLower === 'other') return 'Other';
    if (stageLower.includes('under') && stageLower.includes('review')) return 'Under Review';
    if (stageLower.includes('rejected')) return 'Rejected';
    if (stageLower.includes('start') && !stageLower.includes('started') && !stageLower.includes('construction')) return 'START';
    const knownStages = ['Prospective','Under Contract','Under Construction','Lease-Up','Lease-up','Stabilized','Liquidated','Closed','Commercial Land Listed','Commercial Land - Listed','Dead','Other','START'];
    if (knownStages.includes(stageStr)) {
        if (stageStr === 'Lease-up') return 'Lease-Up';
        if (stageStr === 'Commercial Land Listed') return 'Commercial Land - Listed';
        return stageStr;
    }
    return stage;
}

/* ---------- Bank normalization ---------- */

export function normalizeBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    let normalized = String(bank).trim().toLowerCase().replace(/[\s\-]+/g, '');
    const bankSuffixes = ['bank','banks','bancorp','bancshares','financial','group'];
    for (const suffix of bankSuffixes) {
        if (normalized.endsWith(suffix)) {
            const withoutSuffix = normalized.slice(0, -suffix.length);
            if (withoutSuffix.length >= 3) { normalized = withoutSuffix; break; }
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
            if (!bankCounts[normalized]) bankCounts[normalized] = {};
            const original = bank.trim();
            bankCounts[normalized][original] = (bankCounts[normalized][original] || 0) + 1;
        }
    });
    Object.keys(bankCounts).forEach(normalized => {
        const variants = bankCounts[normalized];
        let maxCount = 0, canonical = '';
        Object.keys(variants).forEach(variant => { if (variants[variant] > maxCount) { maxCount = variants[variant]; canonical = variant; } });
        normalizedToCanonical[normalized] = canonical;
    });
    state.bankNameMap = normalizedToCanonical;
    return normalizedToCanonical;
}

export function getCanonicalBankName(bank) {
    if (!bank || bank === 'Unknown') return 'Unknown';
    const normalized = normalizeBankName(bank);
    return state.bankNameMap[normalized] || bank.trim();
}

/* ---------- Deal field accessors ---------- */

export function getDealLocation(deal) {
    if (!deal) return null;
    const location = deal.Location || deal.location ||
        deal['Location Custom'] || deal.locationCustom ||
        deal.customfieldsdisplayvalue || deal.custom_fields_display_value ||
        deal.customfieldsenumvaluename || deal.custom_fields_enum_value_name || null;
    if (location && location !== 'Unknown' && location !== 'List' && location.trim() !== '') return location.trim();
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
        deal['Product Type Custom'] || deal.productTypeCustom || null;
    if (productType && productType !== 'List' && productType.trim() !== '') return productType.trim();
    return null;
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
            if (!['prototype','heights/flats','heights','flats'].includes(bankName.toLowerCase())) parsed.bank = bankName;
        } else if (lenderIndex + 1 < lines.length) {
            const nextLine = lines[lenderIndex + 1].trim();
            if (!nextLine.includes(':') && nextLine.length > 0) {
                let bankName = nextLine.replace(/\s+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*$/, '').trim();
                const nameMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[A-Z][a-z]+\s+[A-Z])/);
                if (nameMatch) bankName = nameMatch[1].trim();
                else { const simpleMatch = bankName.match(/^([A-Za-z0-9\s&\.\-]+?)(?:\s+[a-z])/); if (simpleMatch) bankName = simpleMatch[1].trim(); }
                if (bankName && !['prototype','heights/flats','heights','flats'].includes(bankName.toLowerCase())) parsed.bank = bankName;
            }
        }
    }
    lines.forEach(line => {
        if (line.toLowerCase().startsWith('location:')) parsed.location = line.replace(/^location:\s*/i, '').trim();
        else if (line.toLowerCase().startsWith('units:')) { const match = line.match(/units:\s*(\d+)/i); if (match) parsed.units = match[1]; }
        else if (line.toLowerCase().includes('bank') && !parsed.bank) { const match = line.match(/bank[:\s]+([^,\n]+)/i); if (match && !['prototype','heights/flats','heights','flats'].includes(match[1].trim().toLowerCase())) parsed.bank = match[1].trim(); }
        else if (line.toLowerCase().includes('product') || (line.toLowerCase().includes('type') && !line.toLowerCase().includes('bank'))) { const match = line.match(/(?:product|type)[:\s]+([^,\n]+)/i); if (match) parsed.productType = match[1].trim(); }
        else if ((line.toLowerCase().includes('pre') && line.toLowerCase().includes('con')) || line.toLowerCase().includes('preconstruction')) {
            const managerMatch = line.match(/(?:pre[- ]?con|preconstruction)[\s-]*(?:manager|coordinator)?[:\s]+([A-Za-z\s]+)/i);
            if (managerMatch) parsed.preCon = managerMatch[1].trim();
            else { const simpleMatch = line.match(/pre[- ]?con[:\s]+([^,\n]+)/i); if (simpleMatch && !simpleMatch[1].toLowerCase().includes('manager') && !simpleMatch[1].toLowerCase().includes('checklist') && !simpleMatch[1].toLowerCase().includes('insure')) parsed.preCon = simpleMatch[1].trim(); }
        }
    });
    if (!parsed.units) { const unitMatch = notes.match(/units?[:\s]+(\d+)/i); if (unitMatch) parsed.units = unitMatch[1]; }
    if (!parsed.location && lines.length > 0) { const firstLine = lines[0]; if (firstLine.includes(',') && firstLine.length < 100) parsed.location = firstLine; }
    return parsed;
}

/* ---------- Deal deduplication ---------- */

export function deduplicateDbDealsByDealPipelineId(dbDeals) {
    if (!dbDeals || !Array.isArray(dbDeals)) return [];
    const seen = new Set();
    return dbDeals.filter(d => {
        const id = d.DealPipelineId;
        if (id == null || seen.has(id)) return false;
        seen.add(id); return true;
    });
}

/* ---------- Deal mapping ---------- */

export function mapDealPipelineDataToDeal(dbDeal, loansMap = {}, banksMap = {}) {
    const stage = normalizeStage(dbDeal.Stage || 'Prospective');
    const stageStr = String(stage || '').trim();
    const stageLower = stageStr.toLowerCase();
    if (stageStr === 'START' || stageLower === 'start' || stageStr === 'S T A R T' || stageLower === 's t a r t' || stageStr.includes('START') || (stageLower.includes('start') && !stageLower.includes('started'))) return null;

    const projectId = dbDeal.ProjectId;
    const procoreMatch = window.PROCORE_MATCHES?.get(projectId);
    const hasProcore = procoreMatch && procoreMatch.hasProcore;

    let city = dbDeal.City, stateVal = dbDeal.State, region = dbDeal.Region;
    if (hasProcore) {
        if (procoreMatch.city && (city == null || String(city).trim() === '')) city = procoreMatch.city;
        if (procoreMatch.state && (stateVal == null || String(stateVal).trim() === '')) stateVal = procoreMatch.state;
        if (procoreMatch.region && (region == null || String(region).trim() === '')) region = procoreMatch.region;
    }
    const location = city && stateVal ? `${city}, ${stateVal}` : city || null;

    let bankName = dbDeal.Bank || null;
    const projectLoans = loansMap[projectId] || [];
    if (projectLoans.length > 0) {
        const permanentLoan = projectLoans.find(l => l.LoanPhase === 'Permanent');
        const constructionLoan = projectLoans.find(l => l.LoanPhase === 'Construction');
        if (stage === 'Stabilized' && permanentLoan && permanentLoan.LenderId) { const b = banksMap[permanentLoan.LenderId]; if (b) bankName = b.BankName || bankName; }
        else if (constructionLoan && constructionLoan.LenderId) { const b = banksMap[constructionLoan.LenderId]; if (b) bankName = b.BankName || bankName; }
    }

    let startDate = dbDeal.StartDate || dbDeal.EstimatedConstructionStartDate || null;
    let dateSource = dbDeal.StartDate ? 'database' : (dbDeal.EstimatedConstructionStartDate ? 'core' : 'none');
    let procoreOverridesStartDate = false;
    if (hasProcore && procoreMatch.actualStartDate && isProcoreStartDateOverride(procoreMatch.actualStartDate)) {
        startDate = procoreMatch.actualStartDate; dateSource = 'procore'; procoreOverridesStartDate = true;
    }

    let unitCount = dbDeal.UnitCount || dbDeal.Units || null;
    if (hasProcore && procoreMatch.unitCount) unitCount = procoreMatch.unitCount;

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
        ProjectName: dbDeal.ProjectName || 'Unnamed Deal',
        Stage: stage,
        'Unit Count': unitCount, UnitCount: unitCount,
        'Start Date': startDate, StartDate: startDate,
        'Start Date Source': dateSource,
        Bank: bankName,
        'Product Type': dbDeal.ProductType || null, ProductType: dbDeal.ProductType || null,
        Location: location, City: city, State: stateVal, Region: region,
        'Pre-Con': dbDeal.PreConManagerName || (dbDeal.PreConManager && (dbDeal.PreConManager.ManagerName || dbDeal.PreConManager.FullName)) || dbDeal.ManagerName || null,
        PreConManagerId: dbDeal.PreConManagerId || null,
        Notes: dbDeal.Notes || null, ClosingNotes: dbDeal.ClosingNotes || null,
        Priority: dbDeal.Priority || null,
        commentsCount: null,
        Latitude: latitude, Longitude: longitude, latitude, longitude,
        DealPipelineId: dbDeal.DealPipelineId,
        ProjectId: dbDeal.ProjectId,
        _original: dbDeal,
        _hasProcore: hasProcore, _procoreMatch: procoreMatch,
        _procoreOverridesStartDate: procoreOverridesStartDate,
        Acreage: dbDeal.Acreage || null, LandPrice: dbDeal.LandPrice || null,
        SqFtPrice: dbDeal.SqFtPrice || null, ExecutionDate: dbDeal.ExecutionDate || null,
        DueDiligenceDate: dbDeal.DueDiligenceDate || null, ClosingDate: dbDeal.ClosingDate || null,
        ConstructionLoanClosingDate: dbDeal.ConstructionLoanClosingDate || null,
        PurchasingEntity: dbDeal.PurchasingEntity || null,
        Cash: dbDeal.Cash || false, OpportunityZone: dbDeal.OpportunityZone || false,
        BrokerReferralContactId: dbDeal.BrokerReferralContactId || null,
        BrokerReferralName: (dbDeal.BrokerReferralContact && (dbDeal.BrokerReferralContact.Name || dbDeal.BrokerReferralContact.ManagerName)) || dbDeal.BrokerReferralSource || null,
        PriceRaw: dbDeal.PriceRaw ?? dbDeal.Price_raw ?? null,
        ListingStatus: dbDeal.ListingStatus || null, Zoning: dbDeal.Zoning || null,
        CountyParish: dbDeal.County || dbDeal.CountyParish || null,
        CreatedAt: dbDeal.CreatedAt || dbDeal.createdAt || dbDeal.createdat || null,
        UpdatedAt: dbDeal.UpdatedAt || dbDeal.updatedAt || dbDeal.updatedat || null
    };
}

/* ---------- Filtering ---------- */

export function applyFilters(deals, excludeStart = true, forOverview = false, forTimeline = false) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    const { currentFilters } = state;
    return deals.filter(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const location = getDealLocation(deal) || '';
        const bank = deal.Bank || deal.bank || '';
        const product = getDealProductType(deal) || '';
        if (excludeStart && stage === 'START') return false;
        if (stage === 'HoldCo' || stage.toLowerCase() === 'holdco') return false;
        if (stage === 'START') return false;
        if (currentFilters.stages.length === 0 && !forOverview && DEFAULT_EXCLUDED_STAGES.includes(stage)) return false;
        if (currentFilters.stages.length > 0) {
            const normalizedSelected = new Set(currentFilters.stages.map(s => normalizeStage(String(s).trim())));
            if (normalizedSelected.size > 0 && !normalizedSelected.has(stage)) return false;
        }
        if (currentFilters.location && location !== currentFilters.location) return false;
        if (currentFilters.state) {
            const stateMatch = location.match(/,\s*([A-Z]{2})$/);
            if ((stateMatch ? stateMatch[1] : '') !== currentFilters.state) return false;
        }
        if (currentFilters.bank) { if (normalizeBankName(currentFilters.bank) !== normalizeBankName(bank)) return false; }
        if (currentFilters.product && product !== currentFilters.product) return false;
        if (!forTimeline && currentFilters.year) {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) {
                try {
                    const date = new Date(startDate);
                    if (!isNaN(date.getTime())) { if (date.getFullYear().toString() !== currentFilters.year) return false; }
                    else return false;
                } catch (e) { return false; }
            } else return false;
        }
        const dateAddedRange = currentFilters.dateAddedRange || '1y';
        if (dateAddedRange !== 'unlimited') {
            const createdAt = deal.CreatedAt || deal.createdAt || deal.createdat;
            if (createdAt) {
                try {
                    const added = new Date(createdAt);
                    const cutoff = new Date(now);
                    if (dateAddedRange === '3m') cutoff.setMonth(cutoff.getMonth() - 3);
                    else if (dateAddedRange === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
                    else if (dateAddedRange === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
                    else if (dateAddedRange === '2y') cutoff.setFullYear(cutoff.getFullYear() - 2);
                    if (!isNaN(added.getTime()) && added < cutoff) return false;
                } catch (e) {}
            }
        }
        if (currentFilters.search) {
            const searchLower = currentFilters.search.toLowerCase();
            const name = (deal.Name || deal.name || '').toLowerCase();
            const dealLocation = location.toLowerCase();
            const dealBank = bank.toLowerCase();
            const dealProduct = product.toLowerCase();
            const notes = (deal.Notes || deal.notes || '').toLowerCase();
            if (!name.includes(searchLower) && !dealLocation.includes(searchLower) && !dealBank.includes(searchLower) && !dealProduct.includes(searchLower) && !notes.includes(searchLower)) return false;
        }
        if (!excludeStart && stage === 'START') {
            const startDate = deal['Start Date'] || deal.startDate || deal.dueon || deal.due_on;
            if (startDate) { try { const d = new Date(startDate); if (!isNaN(d.getTime()) && d < sixMonthsAgo) return false; } catch (e) {} }
        }
        return true;
    });
}

/* ---------- Sorting ---------- */

export function sortDeal(a, b, sortConfig) {
    let aVal, bVal;
    switch (sortConfig.by) {
        case 'name': aVal = (a.Name || a.name || '').toLowerCase(); bVal = (b.Name || b.name || '').toLowerCase(); break;
        case 'stage': aVal = normalizeStage(a.Stage || a.stage); bVal = normalizeStage(b.Stage || b.stage); break;
        case 'units': aVal = parseInt(a['Unit Count'] || a.unitCount || 0); bVal = parseInt(b['Unit Count'] || b.unitCount || 0); break;
        case 'date': {
            const getDate = (d) => d['Start Date'] || d.startDate || d['Start Date Custom'] || d.dueon || d.due_on || d.dueAt || d.due_at || (d._original && (d._original.dueon || d._original.due_on || d._original.dueAt || d._original.due_at)) || null;
            const dA = getDate(a), dB = getDate(b);
            if (!dA && !dB) return 0; if (!dA) return 1; if (!dB) return -1;
            aVal = new Date(dA); bVal = new Date(dB); break;
        }
        case 'dateAdded': {
            const cA = a.CreatedAt || a.createdAt || a.createdat || null;
            const cB = b.CreatedAt || b.createdAt || b.createdat || null;
            if (!cA && !cB) return 0; if (!cA) return 1; if (!cB) return -1;
            aVal = new Date(cA); bVal = new Date(cB); break;
        }
        case 'location': aVal = (a.Location || a.location || '').toLowerCase(); bVal = (b.Location || b.location || '').toLowerCase(); break;
        case 'bank': aVal = (a.Bank || a.bank || '').toLowerCase(); bVal = (b.Bank || b.bank || '').toLowerCase(); break;
        case 'notes': aVal = (a.Notes || a.notes || '').toLowerCase(); bVal = (b.Notes || b.notes || '').toLowerCase(); break;
        case 'product': case 'productType': aVal = (a['Product Type'] || a.productType || '').toLowerCase(); bVal = (b['Product Type'] || b.productType || '').toLowerCase(); break;
        case 'yoc': aVal = (a._yieldOnCost != null && !isNaN(a._yieldOnCost)) ? a._yieldOnCost : -Infinity; bVal = (b._yieldOnCost != null && !isNaN(b._yieldOnCost)) ? b._yieldOnCost : -Infinity; break;
        case 'updated': {
            const uA = a.UpdatedAt || a.CreatedAt || null; const uB = b.UpdatedAt || b.CreatedAt || null;
            if (!uA && !uB) return 0; if (!uA) return 1; if (!uB) return -1;
            aVal = new Date(uA); bVal = new Date(uB); break;
        }
        default: return 0;
    }
    if (aVal < bVal) return sortConfig.order === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.order === 'asc' ? 1 : -1;
    return 0;
}

export function applySorting(deals) {
    return [...deals].sort((a, b) => sortDeal(a, b, state.currentSort));
}

/* ---------- Grouping ---------- */

export function groupDealsByStage(deals) {
    const grouped = {};
    deals.forEach(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (!grouped[stage]) grouped[stage] = [];
        grouped[stage].push(deal);
    });
    return grouped;
}

export function groupDealsByYear(deals) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const grouped = {};
    const allPeriods = new Set();
    // Add current year quarters
    for (let q = 1; q <= 4; q++) allPeriods.add(`Q${q} ${currentYear}`);
    deals.forEach(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        const startDate = deal['Start Date'] || deal.startDate || deal['Start Date Custom'] || deal.dueon || deal.due_on || (deal._original && (deal._original.dueon || deal._original.due_on)) || null;
        let period = 'No Date';
        if (startDate) {
            try {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) { const year = d.getFullYear(); const q = Math.floor(d.getMonth() / 3) + 1; period = `Q${q} ${year}`; }
            } catch (e) {}
        }
        if (!grouped[period]) grouped[period] = { start: [], other: [] };
        if (stage === 'START') grouped[period].start.push(deal);
        else grouped[period].other.push(deal);
        allPeriods.add(period);
    });
    // Ensure all periods have proper structure
    allPeriods.forEach(period => { if (!grouped[period]) grouped[period] = { start: [], other: [] }; });
    // Sort periods: Q1-Q4 within each year, 'No Date' at end
    const sortedPeriods = [...allPeriods].sort((a, b) => {
        if (a === 'No Date') return 1; if (b === 'No Date') return -1;
        const [qa, ya] = a.split(' '); const [qb, yb] = b.split(' ');
        const yearDiff = parseInt(ya) - parseInt(yb);
        if (yearDiff !== 0) return yearDiff;
        return parseInt(qa.slice(1)) - parseInt(qb.slice(1));
    });
    return { grouped, sortedPeriods };
}

/* ---------- Summary calculation ---------- */

export function calculateSummary(deals, excludeStart = true) {
    const summary = {
        total: 0, totalUnits: 0,
        byStage: {}, byLocation: {}, byBank: {}, byProductType: {}, byState: {}, byYear: {},
        upcomingDates: []
    };
    const today = new Date();
    deals.forEach(deal => {
        const stage = normalizeStage(deal.Stage || deal.stage);
        if (excludeStart && (stage === 'START' || stage.toLowerCase() === 'start' || stage.includes('START'))) return;
        summary.total++;
        const units = parseInt(deal['Unit Count'] || deal.unitCount || 0) || 0;
        summary.totalUnits += units;
        if (!summary.byStage[stage]) summary.byStage[stage] = 0;
        summary.byStage[stage]++;
        summary.byStage[stage + '_units'] = (summary.byStage[stage + '_units'] || 0) + units;
        const location = getDealLocation(deal) || 'Unknown';
        if (!summary.byLocation[location]) summary.byLocation[location] = 0;
        summary.byLocation[location]++;
        const stateStr = getDealState(deal) || 'Unknown';
        if (!summary.byState[stateStr]) summary.byState[stateStr] = 0;
        summary.byState[stateStr]++;
        const bank = deal.Bank || deal.bank || 'Unknown';
        if (!summary.byBank[bank]) summary.byBank[bank] = 0;
        summary.byBank[bank]++;
        const product = getDealProductType(deal) || 'Unknown';
        if (!summary.byProductType[product]) summary.byProductType[product] = 0;
        summary.byProductType[product]++;
        const startDate = deal['Start Date'] || deal.startDate || deal['Start Date Custom'] || deal.dueon || deal.due_on;
        if (startDate) {
            try {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) {
                    const yr = d.getFullYear().toString();
                    if (!summary.byYear[yr]) summary.byYear[yr] = 0;
                    summary.byYear[yr]++;
                    if (d >= today) {
                        summary.upcomingDates.push({ date: d, name: deal.Name || deal.name || 'Unknown', stage });
                    }
                }
            } catch (e) {}
        }
    });
    summary.upcomingDates.sort((a, b) => a.date - b.date);
    return summary;
}

/* ---------- Yield on Cost ---------- */

export async function computeYieldOnCostForDeals(deals, loansMap) {
    let projectsMap = {}, equityMap = {}, leasingMap = {};
    try {
        const [projRes, eqRes] = await Promise.all([
            API.getAllProjects(),
            (typeof API.getAllEquityCommitments === 'function') ? API.getAllEquityCommitments() : Promise.resolve({ success: false })
        ]);
        if (projRes.success && projRes.data) projRes.data.forEach(p => { if (p.ProjectId) projectsMap[p.ProjectId] = p; });
        if (eqRes.success && eqRes.data) eqRes.data.forEach(ec => { if (ec.ProjectId) { if (!equityMap[ec.ProjectId]) equityMap[ec.ProjectId] = []; equityMap[ec.ProjectId].push(ec); } });
    } catch (e) { console.warn('YoC: projects/equity fetch:', e); }
    try {
        const leasingRes = API.getLeasingDashboard ? await API.getLeasingDashboard() : { success: false };
        if (leasingRes && leasingRes.success && leasingRes.data) {
            const rows = Array.isArray(leasingRes.data) ? leasingRes.data : (leasingRes.data.properties || []);
            rows.forEach(r => { const prop = (r.Property || r.property || '').trim().toLowerCase(); if (prop) leasingMap[prop] = r; });
        }
    } catch (e) { console.warn('YoC: leasing fetch:', e); }
    for (const deal of deals) {
        const pid = deal.ProjectId;
        if (!pid) continue;
        const proj = projectsMap[pid];
        let totalCost = null;
        if (proj && proj.CostPerUnit && proj.Units && proj.CostPerUnit > 0 && proj.Units > 0) totalCost = proj.CostPerUnit * proj.Units;
        if (!totalCost) {
            let loanTotal = 0, equityTotal = 0;
            (loansMap[pid] || []).forEach(l => { if (l.LoanAmount) loanTotal += parseFloat(l.LoanAmount) || 0; });
            (equityMap[pid] || []).forEach(ec => { if (ec.Amount && !ec.IsPaidOff) equityTotal += parseFloat(ec.Amount) || 0; });
            if (loanTotal + equityTotal > 0) totalCost = loanTotal + equityTotal;
        }
        let annualizedNOI = null;
        const dealName = (deal.Name || '').trim().toLowerCase();
        if (dealName && leasingMap[dealName]) {
            const lr = leasingMap[dealName];
            const monthlyIncome = parseFloat(lr.CurrentMonthIncome || lr.currentMonthIncome || lr.BudgetedIncome || lr.budgetedIncome || 0);
            if (monthlyIncome > 0) annualizedNOI = monthlyIncome * 12;
        }
        deal._yieldOnCost = (totalCost && totalCost > 0 && annualizedNOI && annualizedNOI > 0) ? (annualizedNOI / totalCost) * 100 : null;
    }
}
