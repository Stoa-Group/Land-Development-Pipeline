// modules/data/loaders.js — Data fetching from API + Domo datasets
import { state } from '../core/state.js';
import { _dpLog, _dpWarn, _dpError } from '../core/utils.js';
import { buildProcoreMatches, syncProcoreDataToDatabase, getAlias, waitForDomo, getDomoQuick } from './domo.js';
import { deduplicateDbDealsByDealPipelineId, mapDealPipelineDataToDeal, buildBankNameMap, normalizeStage, computeYieldOnCostForDeals } from './transforms.js';

const $ = (sel, root) => (root || document).querySelector(sel);

/**
 * Load all deals from API, including loans and banks for lender resolution.
 * Returns { allDeals, loansMap, banksMap } or throws.
 */
export async function loadAllDeals(opts = {}) {
    const response = await API.getAllDealPipelines(opts);
    if (!response.success) throw new Error(response.error?.message || 'Failed to load deals');
    const dbDeals = response.data || [];

    let loansMap = {}, banksMap = {};
    try {
        const loansResponse = await API.getAllLoans();
        if (loansResponse.success) {
            (loansResponse.data || []).forEach(loan => {
                if (loan.ProjectId) {
                    if (!loansMap[loan.ProjectId]) loansMap[loan.ProjectId] = [];
                    loansMap[loan.ProjectId].push(loan);
                }
            });
        }
    } catch (e) { console.warn('Failed to load loans:', e); }

    try {
        const banksResponse = await API.getAllBanks();
        if (banksResponse.success) {
            (banksResponse.data || []).forEach(bank => { if (bank.BankId) banksMap[bank.BankId] = bank; });
        }
    } catch (e) { console.warn('Failed to load banks:', e); }

    const procoreData = window.PROCORE_DATA || [];
    if (procoreData.length > 0 && dbDeals.length > 0) buildProcoreMatches(procoreData, dbDeals);

    const uniqueDbDeals = deduplicateDbDealsByDealPipelineId(dbDeals);
    const allDeals = uniqueDbDeals
        .map(deal => mapDealPipelineDataToDeal(deal, loansMap, banksMap))
        .filter(deal => deal !== null)
        .filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
        });

    return { allDeals, loansMap, banksMap };
}

/**
 * Refresh all deals from the live API (bypass any caching). Re-builds state.allDeals.
 * Returns the updated allDeals array.
 */
export async function refreshDealsFromApi() {
    const [response, loansResponse, banksResponse] = await Promise.all([
        API.getAllDealPipelines({ forceApi: true }),
        API.getAllLoans().catch(() => ({ success: false })),
        API.getAllBanks().catch(() => ({ success: false }))
    ]);
    if (!response.success) throw new Error('Failed to refresh deals');
    const dbDeals = response.data || [];
    let loansMap = {}, banksMap = {};
    if (loansResponse.success && loansResponse.data) {
        loansResponse.data.forEach(loan => {
            if (loan.ProjectId) {
                if (!loansMap[loan.ProjectId]) loansMap[loan.ProjectId] = [];
                loansMap[loan.ProjectId].push(loan);
            }
        });
    }
    if (banksResponse.success && banksResponse.data) {
        banksResponse.data.forEach(bank => { if (bank.BankId) banksMap[bank.BankId] = bank; });
    }
    const uniqueDbDeals = deduplicateDbDealsByDealPipelineId(dbDeals);
    const mapped = uniqueDbDeals
        .map(deal => mapDealPipelineDataToDeal(deal, loansMap, banksMap))
        .filter(deal => deal !== null)
        .filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return stage !== 'HoldCo' && stage.toLowerCase() !== 'holdco';
        });
    // Mutate in-place so references remain valid (don't reassign window.allDeals — proxy getter returns state.allDeals)
    state.allDeals.length = 0;
    mapped.forEach(d => state.allDeals.push(d));
    buildBankNameMap(state.allDeals);
    return { allDeals: state.allDeals, loansMap, banksMap };
}

/**
 * Load Procore data from Domo datasets.
 */
export async function loadProcoreData() {
    let DOMO = state.DOMO || getDomoQuick();
    if (!DOMO) DOMO = await waitForDomo(5000);
    state.DOMO = DOMO;
    if (!DOMO) {
        console.log('Domo not available - Procore sync will be skipped.');
        window.PROCORE_DATA = [];
        return [];
    }
    try {
        const procoreData = await getAlias('procoreProjectInfo');
        window.PROCORE_DATA = procoreData;
        return procoreData;
    } catch (e) {
        console.warn('Failed to load Procore data from Domo:', e);
        window.PROCORE_DATA = [];
        return [];
    }
}
