"use strict";
/* =========================================================
   Banking Dashboard — Full CRUD with API Integration
   • Loads data from Render API (Azure) and Domo manifest (Procore/MMR)
   • Three main views: By Property, Search by Bank, Search by Equity
   • Edit mode with change tracking and API updates
   • Expandable detail views with context-aware tabs
   ========================================================= */

/* ---------- DOMO bootstrap ---------- */
function getDomoQuick() {
  // In Domo apps, domo is available as a global variable from ryuu.js
  // Check window.domo directly (it's loaded in the same page context)
  try {
    // Check window.domo first (safest - no cross-origin issues)
    if (typeof window !== 'undefined' && window.domo) {
      return window.domo;
    }
  } catch(e) {
    // Ignore errors
  }
  
  // Try global domo variable (from ryuu.js)
  // This is wrapped in try-catch to prevent SecurityError from propagating
  try {
    // Use a safe property check
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
  // Try to get domo object fresh each time (in case it wasn't available at init)
  let domoObj = DOMO;
  if (!domoObj) {
    domoObj = getDomoQuick();
    if (domoObj) DOMO = domoObj; // Cache it
  }
  
  // Last attempt: try direct global access (domo is a global variable from ryuu.js)
  if (!domoObj) {
    try {
      // In Domo, 'domo' is available as a global variable from ryuu.js
      if (typeof domo !== 'undefined' && domo) {
        domoObj = domo;
        DOMO = domo; // Cache it
        console.log('Found domo object via global variable');
      }
    } catch(e) {
      // Ignore
    }
  }
  
  if (!domoObj) {
    console.warn(`domo object not available - cannot load alias "${name}". Check if running in Domo environment.`);
    console.warn(`Available globals:`, {
      'typeof domo': typeof domo,
      'window.domo': !!window.domo,
      'window.parent.domo': !!(window.parent && window.parent.domo)
    });
    return [];
  }
  
  try {
    console.log(`Attempting to load alias "${name}" from Domo...`);
    console.log(`domo object type:`, typeof domoObj);
    console.log(`domo.get available:`, typeof domoObj.get === 'function');
    
    // Use the correct Domo API endpoint: /data/v2/alias?limit=10000
    // According to Domo docs, domo.get() returns a promise that resolves with the data directly
    const response = await domoObj.get(`/data/v2/${name}?limit=10000`);
    
    // The response should be an array directly (per Domo documentation)
    let result = response;
    
    // Handle different response formats (just in case)
    if (Array.isArray(response)) {
      result = response;
    } else if (response && Array.isArray(response.data)) {
      result = response.data;
    } else if (response && response.rows) {
      result = response.rows;
    } else if (response && Array.isArray(response)) {
      result = response;
    } else {
      console.warn(`Unexpected response format for "${name}":`, typeof response, response);
      result = [];
    }
    
    // console.log(`Successfully loaded ${result.length} records from alias "${name}"`);
    // if (result.length > 0) {
    //   console.log(`Sample data from "${name}":`, result.slice(0, 2));
    //   console.log(`Sample record keys:`, Object.keys(result[0]));
    // }
    return result;
  } catch(e) {
    console.error(`Error loading alias "${name}":`, e);
    console.warn(`Could not load alias "${name}":`, e.message || e);
    if (e.stack) {
      console.warn(`Error stack:`, e.stack);
    }
    return [];
  }
}

/* ---------- Helpers ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function num(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[$,%,"\u00a0,]/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

const fmtInt       = n => Number.isFinite(+n) ? Math.round(+n).toLocaleString() : "0";
const fmtCurrency0 = n => Number.isFinite(+n) ? "$" + Math.round(+n).toLocaleString() : "$0";
const fmtCurrency  = n => Number.isFinite(+n) ? "$" + Math.round(+n).toLocaleString() : "$0";

function fmtPctSmart(v, maxDecimals=2) {
  if (v == null || v === "") return "—";
  let x = num(v);
  if (!Number.isFinite(x)) return "—";
  // Treat 0.5 (or 50%) as empty for Spread
  if (Math.abs(x - 0.5) < 0.01 || Math.abs(x - 50) < 1) return "—";
  if (Math.abs(x) <= 1.5) x *= 100;
  const d = Math.max(0, maxDecimals);
  const s = x.toFixed(d).replace(/\.0+$/,"").replace(/(\.\d*?)0+$/,"$1");
  return s + "%";
}

function parseWhen(v) { const t = new Date(v||0).getTime(); return Number.isFinite(t)?t:0; }

// Check if IO maturity is upcoming and return flag info
function getIOMaturityFlag(ioMaturityDate, hasPermanentFinancing = false) {
  if (!ioMaturityDate) return null;
  
  const maturityDate = new Date(ioMaturityDate);
  if (!Number.isFinite(maturityDate.getTime())) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  maturityDate.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.ceil((maturityDate - today) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    // Past maturity - check if permanent financing exists
    if (hasPermanentFinancing) {
      // Transferred to permanent financing - this is good!
      return { text: "To Perm", class: "io-maturity-flag transferred", days: daysDiff };
    }
    // Past maturity - always show
    return { text: `Past (${Math.abs(daysDiff)}d)`, class: "io-maturity-flag past", days: daysDiff };
  } else if (daysDiff === 0) {
    // Today - urgent
    return { text: "Today", class: "io-maturity-flag urgent", days: 0 };
  } else if (daysDiff <= 30) {
    // Within 30 days - urgent
    return { text: `${daysDiff}d`, class: "io-maturity-flag urgent", days: daysDiff };
  } else if (daysDiff <= 60) {
    // Within 60 days - warning
    return { text: `${daysDiff}d`, class: "io-maturity-flag warning", days: daysDiff };
  } else if (daysDiff <= 90) {
    // Within 90 days - upcoming
    return { text: `${daysDiff}d`, class: "io-maturity-flag upcoming", days: daysDiff };
  }
  
  return null; // More than 90 days away, no flag
}

function fmtDate(v) {
  if (v == null || v === "") return "—";

  // Handle Excel serial dates
  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.round(v) * 86400000;
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const y = d.getFullYear();
      return `${m}-${dd}-${y}`;
    }
  }

  // Handle string dates (parse various formats)
  if (typeof v === "string") {
    const s = v.trim();

    // Handle ISO date strings FIRST (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ss.fffZ)
    // This handles cases like "2020-03-12T00:00:00.000Z" - extract just the date part
    // Match YYYY-MM-DD followed by optional T and time, or end of string, or whitespace
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*|$|\s)/);
    if (isoMatch) {
      return `${isoMatch[2]}-${isoMatch[3]}-${isoMatch[1]}`;
    }
    
    // Handle MM/DD format
    let m = s.match(/^\s*(\d{1,2})\/(\d{1,2})\s*$/);
    if (m) {
      const mm = String(Math.min(Math.max(+m[1],1),12)).padStart(2,'0');
      const dd = String(Math.min(Math.max(+m[2],1),31)).padStart(2,'0');
      const currentYear = new Date().getFullYear();
      return `${mm}-${dd}-${currentYear}`;
    }

    // Handle MM/DD/YY or MM/DD/YYYY format
    m = s.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/);
    if (m) {
      const yy = +m[3];
      const fullYear = yy <= 49 ? 2000 + yy : (yy < 100 ? 1900 + yy : yy);
      const mm = String(Math.min(Math.max(+m[1],1),12)).padStart(2,'0');
      const dd = String(Math.min(Math.max(+m[2],1),31)).padStart(2,'0');
      return `${mm}-${dd}-${fullYear}`;
    }
  }

  // Handle Date objects or other date formats
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "—";
  
  // Extract date components (ignore time)
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

function convertDateToInput(v) {
  if (!v || v === "") return "";
  if (typeof v === "string") {
    // Handle ISO timestamp format "2020-10-19T00:00:00.000Z" or "2020-10-19 13:00:00+00:00"
    // Extract just the date part (YYYY-MM-DD)
    const isoMatch = v.match(/^(\d{4}-\d{2}-\d{2})(?:T|$|\s)/);
    if (isoMatch) return isoMatch[1];
    // Handle "May-23" format
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const match = v.match(/^([A-Za-z]{3})-(\d{2})$/);
    if (match) {
      const monthIdx = monthNames.findIndex(m => m.toLowerCase() === match[1].toLowerCase());
      if (monthIdx >= 0) {
        const year = 2000 + parseInt(match[2]);
        return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
      }
    }
    // Handle MM/DD/YYYY
    const dateMatch = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dateMatch) {
      const m = String(parseInt(dateMatch[1])).padStart(2, '0');
      const d = String(parseInt(dateMatch[2])).padStart(2, '0');
      return `${dateMatch[3]}-${m}-${d}`;
    }
  }
  const d = new Date(v);
  if (Number.isFinite(d.getTime())) {
    const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return "";
}

/* ---------- Global State ---------- */
let BANKING = [];
let MMR = [];
let CURRENT_ROWS = [];
let expandedKeys = new Set();
let expandedBanks = new Set();
let expandedEquity = new Set();
let currentView = "construction"; // construction, permanent, equity
let currentTab = "by-property"; // by-property, by-bank, by-equity
let sortKey = null;
let sortDir = 1;

// Filter state
let statusOptions = [];
let selectedStatuses = new Set();

// Global edit mode state (requires authentication)
let globalEditMode = false;
let currentUser = null;
let editModeState = new Map(); // propertyKey -> { originalData, changedFields } - for tracking changes per property

// Expanded equity commitments by partner (for consolidated view)
let expandedEquityPartners = new Set(); // Set of partner names that are expanded

// Global data storage
window.PROJECTS_DATA = [];
window.LOANS_DATA = [];
window.PEOPLE_DATA = [];
window.GUARANTES_DATA = [];
window.PARTICIPATIONS_DATA = [];
window.COVENANTS_DATA = [];
window.EQUITY_COMMITMENTS_DATA = [];
window.EQUITY_PARTNERS_DATA = [];
window.BANKS_DATA = [];
window.IMS_DATA = []; // IMS data for equity/investor information

// Cache for API name resolutions
const apiNameCache = new Map();

/* ---------- Data Transformation ---------- */
function transformRelationalToBanking(projects, loans, participations, guarantees, covenants, dscrTests, liquidityReqs, bankTargets, equityCommitments, equityPartners, persons, banks) {
  const banking = [];
  
  for (const proj of projects) {
    const projLoans = loans.filter(l => l.ProjectId === proj.ProjectId);
    // CRITICAL: Always prioritize LoanPhase over BirthOrder to prevent mixing construction and permanent loans
    // Only use LoanPhase to identify loans - this ensures we get the correct loan type
    const constructionLoan = projLoans.find(l => l.LoanPhase === "Construction");
    const permanentLoan = projLoans.find(l => l.LoanPhase === "Permanent");
    
    const projParts = participations.filter(p => p.ProjectId === proj.ProjectId);
    const projGuarantees = guarantees.filter(g => g.ProjectId === proj.ProjectId);
    const projCovenants = covenants.filter(c => c.ProjectId === proj.ProjectId);
    const projDSCR = dscrTests.filter(d => d.ProjectId === proj.ProjectId);
    const projLiquidity = liquidityReqs.filter(l => l.ProjectId === proj.ProjectId);
    
    // Get equity commitments from API
    let projEquity = equityCommitments.filter(e => e.ProjectId === proj.ProjectId);
    
    // Merge with IMS data for equity/investor information
    const imsData = window.IMS_DATA || [];
    const projIMS = imsData.filter(ims => {
      const imsProperty = String(ims.Property || ims.ProjectName || "").toLowerCase().trim();
      const projName = String(proj.ProjectName || "").toLowerCase().trim();
      return imsProperty === projName || imsProperty.includes(projName) || projName.includes(imsProperty);
    });
    
    // If IMS data exists, merge it with equity commitments
    for (const ims of projIMS) {
      if (ims.EquityPartner || ims.Investor || ims.EquityPartnerName || ims.InvestorName) {
        const partnerName = ims.EquityPartner || ims.Investor || ims.EquityPartnerName || ims.InvestorName;
        const amount = num(ims.EquityAmount || ims.InvestorAmount || ims.Amount || 0);
        
        if (partnerName && amount > 0) {
          // Check if we already have this commitment from API
          const existingCommitment = projEquity.find(e => {
            const partner = equityPartners.find(p => p.EquityPartnerId === e.EquityPartnerId);
            return partner?.PartnerName === partnerName && Math.abs(num(e.Amount) - amount) < 1;
          });
          
          if (!existingCommitment) {
            // Find or create partner
            let partner = equityPartners.find(p => p.PartnerName === partnerName);
            let partnerId = partner?.EquityPartnerId;
            
            if (!partnerId) {
              // Use synthetic ID for IMS partners
              partnerId = `ims-${partnerName}`;
            }
            
            // Create a synthetic equity commitment from IMS data
            projEquity.push({
              EquityCommitmentId: `ims-${proj.ProjectId}-${partnerId}`,
              ProjectId: proj.ProjectId,
              EquityPartnerId: partnerId,
              EquityType: ims.EquityType || ims.Type || "Pref",
              Amount: amount,
              FundingDate: ims.FundingDate || ims.Date || null,
              _fromIMS: true, // Flag to indicate this came from IMS
              _partnerName: partnerName
            });
          }
        }
      }
    }
    
    const bank = banks.find(b => b.BankId === constructionLoan?.LenderId);
    
    // Calculate term for permanent loan (years from close date to maturity)
    let permanentTerm = null;
    if (permanentLoan?.PermanentCloseDate && permanentLoan?.PermPhaseMaturity) {
      const closeDate = new Date(permanentLoan.PermanentCloseDate);
      const maturityDate = new Date(permanentLoan.PermPhaseMaturity);
      if (!isNaN(closeDate.getTime()) && !isNaN(maturityDate.getTime())) {
        permanentTerm = Math.round((maturityDate - closeDate) / (365.25 * 24 * 60 * 60 * 1000));
      }
    }
    
    // Calculate construction IO term (months from closing to maturity)
    let constructionIOTerm = null;
    if (constructionLoan?.LoanClosingDate && (constructionLoan?.MaturityDate || constructionLoan?.IOMaturityDate)) {
      const closeDate = new Date(constructionLoan.LoanClosingDate);
      const maturityDate = new Date(constructionLoan.MaturityDate || constructionLoan.IOMaturityDate);
      if (!isNaN(closeDate.getTime()) && !isNaN(maturityDate.getTime())) {
        const months = Math.round((maturityDate - closeDate) / (30.44 * 24 * 60 * 60 * 1000));
        if (months > 0) {
          const years = Math.floor(months / 12);
          const remainingMonths = months % 12;
          if (years > 0 && remainingMonths > 0) {
            constructionIOTerm = `${years}y ${remainingMonths}m`;
          } else if (years > 0) {
            constructionIOTerm = `${years}y`;
          } else {
            constructionIOTerm = `${months}m`;
          }
        }
      }
    }
    
    const permanentBank = permanentLoan?.LenderId ? banks.find(b => b.BankId === permanentLoan.LenderId) : null;
    
    const bankingRow = {
      Row: proj.ProjectId,
      Property: proj.ProjectName || "", // For display
      ProjectName: proj.ProjectName || "",
      City: proj.City || "",
      State: proj.State || "",
      Region: proj.Region || "",
      Units: proj.Units || 0,
      ProductType: proj.ProductType || "",
      Stage: proj.Stage || null,
      Status: proj.Stage || null, // Use Stage as Status
      
      // Construction Financing View Fields (per guide)
      ConstructionFinancingLender: bank?.BankName || "",
      ConstructionLoanClosing: constructionLoan?.LoanClosingDate || null,
      ConstructionLoanAmount: constructionLoan?.LoanAmount || 0,
      ConstructionLoanLTCOriginal: null, // Calculated: LoanAmount / ProjectCost (requires external data)
      ConstructionIOTerm: constructionIOTerm,
      ConstructionIOMaturity: constructionLoan?.MaturityDate || constructionLoan?.IOMaturityDate || null,
      Index: constructionLoan?.IndexName || "",
      Spread: constructionLoan?.Spread || null,
      
      // Permanent Financing View Fields (per guide)
      PermanentFinancingLender: permanentBank?.BankName || "",
      PermanentFinancingCloseDate: permanentLoan?.PermanentCloseDate || permanentLoan?.LoanClosingDate || null,
      PermanentFinancingLoanAmount: permanentLoan?.PermanentLoanAmount || permanentLoan?.LoanAmount || 0,
      PermanentFinancingLTV: null, // Calculated: PermanentLoanAmount / PropertyValue (requires external data)
      Term: permanentTerm,
      MaturityDate: permanentLoan?.PermPhaseMaturity || permanentLoan?.MaturityDate || null,
      PermanentInterestRate: permanentLoan?.PermPhaseInterestRate || permanentLoan?.InterestRate || "",
      
      // Legacy fields (kept for compatibility)
      Lender: bank?.BankName || "",
      LenderId: constructionLoan?.LenderId || null,
      LoanId: constructionLoan?.LoanId || null,
      Borrower: constructionLoan?.Borrower || "",
      LoanType: constructionLoan?.LoanType || "",
      LoanPhase: constructionLoan?.LoanPhase || "",
      LoanAmount: constructionLoan?.LoanAmount || 0,
      LoanClosingDate: constructionLoan?.LoanClosingDate || null,
      IOMaturityDate: constructionLoan?.IOMaturityDate || null,
      FixedOrFloating: constructionLoan?.FixedOrFloating || "",
      IndexName: constructionLoan?.IndexName || "",
      InterestRate: constructionLoan?.InterestRate || "",
      MiniPermMaturity: constructionLoan?.MiniPermMaturity || null,
      MiniPermInterestRate: constructionLoan?.MiniPermInterestRate || null, // Can be string or number
      PermPhaseMaturity: constructionLoan?.PermPhaseMaturity || null,
      PermPhaseInterestRate: constructionLoan?.PermPhaseInterestRate || "",
      ConstructionCompletionDate: constructionLoan?.ConstructionCompletionDate || null,
      LeaseUpCompletedDate: constructionLoan?.LeaseUpCompletedDate || null,
      
      // Permanent loan legacy fields
      PermanentLoanId: permanentLoan?.LoanId || null,
      PermanentCloseDate: permanentLoan?.PermanentCloseDate || permanentLoan?.LoanClosingDate || null,
      PermanentLoanAmount: permanentLoan?.PermanentLoanAmount || permanentLoan?.LoanAmount || 0,
      
      // Equity View Fields (per guide - most are external, showing what we have)
      LeadPrefGroup: null, // External source
      FundingDate: projEquity.length > 0 ? projEquity[0].FundingDate : null, // First funding date
      PrefAmount: null, // External source
      CommonEquityRequirement: null, // External source
      InterestRate: null, // External source (different from loan interest rate)
      AnnualMonthly: null, // External source
      BackendKicker: null, // External source
      PrefLastDollar: null, // Calculated: PrefAmount / ProjectCost (requires external data)
      CommonEquityLastDollar: null, // Calculated: CommonEquityRequirement / ProjectCost (requires external data)
      
      // Related data
      Participations: projParts,
      Guarantees: projGuarantees,
      Covenants: projCovenants,
      DSCRTests: projDSCR,
      LiquidityRequirements: projLiquidity,
      EquityCommitments: projEquity,
      
      // Store raw data for edit mode
      _project: proj,
      _constructionLoan: constructionLoan,
      _permanentLoan: permanentLoan,
    };
    
    banking.push(bankingRow);
  }
  
  return banking;
}

function buildJoin(MMRrows, BankingRows) {
  const joined = [];
  const usedBankingKeys = new Set();
  const usedMMRKeys = new Set();
  const seenSignatures = new Set(); // Track unique row signatures to prevent duplicates
  
  // First pass: match MMR with Banking
  for (const mmr of MMRrows) {
    // Skip if we've already processed this MMR row
    const mmrKey = mmr.Row || mmr.Property || `mmr_${MMRrows.indexOf(mmr)}`;
    if (usedMMRKeys.has(mmrKey)) {
      continue;
    }
    
    const match = BankingRows.find(b => {
      if (usedBankingKeys.has(b.Row)) return false; // Skip already used banking rows
      const bName = String(b.ProjectName || "").toLowerCase().trim();
      const mName = String(mmr.Property || "").toLowerCase().trim();
      if (!bName || !mName) return false;
      // Prefer exact matches, then substring matches
      return bName === mName || (bName.length > 3 && mName.length > 3 && (bName.includes(mName) || mName.includes(bName)));
    });
    
    if (match) {
      usedBankingKeys.add(match.Row);
      usedMMRKeys.add(mmrKey);
      
      // Create a unique signature for this joined row
      const signature = `${match.Row}_${mmrKey}`;
      if (seenSignatures.has(signature)) {
        console.warn(`Duplicate signature detected: ${signature} for ${mmr.Property || match.ProjectName}`);
        continue;
      }
      seenSignatures.add(signature);
      
      joined.push({
        ...mmr,
        ...match,
        Property: mmr.Property || match.ProjectName || "", // Ensure Property is set
        ProjectName: match.ProjectName || mmr.Property || "", // Ensure ProjectName is set
        Row: match.Row || mmr.Row, // Use banking Row as primary
        _mmr: mmr,
        _banking: match,
      });
    } else {
      usedMMRKeys.add(mmrKey);
      
      // Create signature for MMR-only row
      const signature = `mmr_${mmrKey}`;
      if (seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);
      
      joined.push({
        ...mmr,
        Property: mmr.Property || "", // Ensure Property is set
        ProjectName: mmr.Property || "", // Use Property as ProjectName if no match
        Status: mmr.Status || null,
        Row: mmr.Row || `mmr_${joined.length}`, // Ensure Row is set
        _mmr: mmr,
        _banking: null,
      });
    }
  }
  
  // Second pass: add Banking-only properties
  for (const bd of BankingRows) {
    if (!usedBankingKeys.has(bd.Row)) {
      const signature = `banking_${bd.Row}`;
      if (seenSignatures.has(signature)) {
        continue;
      }
      seenSignatures.add(signature);
      
      joined.push({
        Property: bd.ProjectName || "", // Ensure Property is set
        ProjectName: bd.ProjectName || "", // Ensure ProjectName is set
        Status: bd.Stage || null, // Use Stage from Azure as Status
        Row: bd.Row, // Ensure Row is set
        ...bd,
        _mmr: null,
        _banking: bd,
      });
    }
  }
  
  console.log(`buildJoin: Created ${joined.length} joined rows from ${MMRrows.length} MMR + ${BankingRows.length} Banking (deduplicated)`);
  
  return joined;
}

/* ---------- Filtering & Sorting ---------- */
function passFilters(r, f) {
  const q = f.q || "";
  if (q) {
    const searchable = [
      r.Property || r.ProjectName || "",
      r.City || "",
      r.State || "",
      r.Lender || "",
      r.ProductType || "",
    ].join(" ").toLowerCase();
    if (!searchable.includes(q)) return false;
  }
  
  if (f.statuses && f.statuses.size > 0) {
    // Use core Stage attribute from projects table, not MMR Status
    const coreStage = r.Stage || r._banking?.Stage || "";
    const status = String(coreStage).trim();
    if (!f.statuses.has(status)) return false;
  }
  
  return true;
}

function applySort(rows) {
  if (!sortKey) return rows;
  
  // Fields that should always be sorted as text (alphabetically)
  const textFields = new Set([
    "Property", "ProjectName", "BankName", "InvestorName", "PartnerName",
    "City", "State", "Region", "Lender", "PermanentFinancingLender",
    "Status", "Stage", "ProductType", "Borrower", "LoanType", "LoanPhase",
    "FixedOrFloating", "IndexName", "InterestRate", "PermanentInterestRate",
    "ConstructionCompletionDate", "LeaseUpCompletedDate"
  ]);
  
  // Fields that should be sorted as numbers
  const numericFields = new Set([
    "Units", "LoanAmount", "PermanentLoanAmount", "Exposure", "DealCount",
    "Positioning", "EstimatedHoldLimit", "EstimatedCapacity", "DebtYield",
    "LastDollar", "LTC", "Spread", "CommitmentAmount", "BirthOrder"
  ]);
  
  const sorted = [...rows].sort((a, b) => {
    // Helper function to get value from row, checking nested properties
    function getValue(row, key) {
      // First try direct property
      let val = row[key];
      
      // If not found or empty, try alternative field names
      if (val === undefined || val === null || val === "") {
        if (key === "Property") {
          val = row.ProjectName || row.Property || "";
        } else if (key === "BankName") {
          val = row.BankName || row.Lender || row._banking?.BankName || "";
        } else if (key === "InvestorName") {
          val = row.InvestorName || row.PartnerName || "";
        } else if (key === "City") {
          val = row.City || row._banking?.City || row._mmr?.City || "";
        } else if (key === "State") {
          val = row.State || row._banking?.State || row._mmr?.State || "";
        } else if (key === "Units") {
          val = row.Units || row._banking?.Units || row._mmr?.Units || 0;
        } else if (key === "BirthOrder") {
          // Return null if BirthOrder is missing (will be sorted to end)
          val = row.BirthOrder ?? row._mmr?.BirthOrder ?? row._banking?.BirthOrder ?? null;
        } else if (key === "Lender") {
          val = row.Lender || row._banking?.Lender || "";
        } else if (key === "PermanentFinancingLender") {
          val = row.PermanentFinancingLender || row._banking?.PermanentFinancingLender || "";
        } else if (key === "Status") {
          val = row.Status || row.Stage || row._banking?.Stage || row._mmr?.Status || "";
        } else {
          // Try nested properties
          val = row._banking?.[key] || row._mmr?.[key] || row[key] || "";
        }
      }
      
      return val;
    }
    
    let av = getValue(a, sortKey);
    let bv = getValue(b, sortKey);
    
    // Determine sort type based on field name
    const isDateField = sortKey.includes("Date") || sortKey.includes("Maturity") || sortKey.includes("Closing");
    const isTextField = textFields.has(sortKey);
    const isNumericField = numericFields.has(sortKey);
    
    // Sort as date
    if (isDateField) {
      av = parseWhen(av);
      bv = parseWhen(bv);
      // Handle invalid dates
      if (isNaN(av) && isNaN(bv)) return 0;
      if (isNaN(av)) return 1; // Invalid dates go to end
      if (isNaN(bv)) return -1;
      
      // Special handling for IO Maturity: past dates first, then future dates ascending
      if (sortKey === "ConstructionIOMaturity" || sortKey === "IOMaturityDate") {
        const today = new Date().setHours(0, 0, 0, 0);
        const aIsPast = av < today;
        const bIsPast = bv < today;
        
        // Past dates come first
        if (aIsPast && !bIsPast) return -1;
        if (!aIsPast && bIsPast) return 1;
        
        // Both past or both future: sort ascending (soonest first)
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
      }
      
      // Standard date sorting
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    }
    
    // Sort as text (alphabetically)
    if (isTextField) {
      // Convert to strings and handle empty values
      av = String(av || "").trim().toLowerCase();
      bv = String(bv || "").trim().toLowerCase();
      // Empty strings go to end
      if (av === "" && bv === "") return 0;
      if (av === "") return 1;
      if (bv === "") return -1;
      // Alphabetical comparison
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    }
    
    // Sort as number
    if (isNumericField || (!isTextField && !isDateField)) {
      // Special handling for BirthOrder: missing values and "Under Contract" go to end
      if (sortKey === "BirthOrder") {
        // Get stage/status for both rows
        const aStage = (a.Stage || a._banking?.Stage || a.Status || "").toLowerCase();
        const bStage = (b.Stage || b._banking?.Stage || b.Status || "").toLowerCase();
        const aIsUnderContract = aStage === "under contract";
        const bIsUnderContract = bStage === "under contract";
        
        // "Under Contract" deals ALWAYS go to end (regardless of BirthOrder)
        if (aIsUnderContract && !bIsUnderContract) return 1; // a goes to end
        if (!aIsUnderContract && bIsUnderContract) return -1; // b goes to end
        if (aIsUnderContract && bIsUnderContract) {
          // Both Under Contract: keep their relative order (don't sort by BirthOrder)
          return 0;
        }
        
        // Neither is Under Contract: sort by BirthOrder
        const aHasValue = av !== null && av !== undefined && av !== "" && num(av) > 0;
        const bHasValue = bv !== null && bv !== undefined && bv !== "" && num(bv) > 0;
        
        // Both missing: equal
        if (!aHasValue && !bHasValue) return 0;
        // a missing: goes to end (but before Under Contract)
        if (!aHasValue) return 1;
        // b missing: goes to end (but before Under Contract)
        if (!bHasValue) return -1;
        // Both have values: sort normally
        av = num(av);
        bv = num(bv);
        if (av < bv) return -sortDir;
        if (av > bv) return sortDir;
        return 0;
      }
      
      // Standard numeric sorting for other fields
      av = num(av);
      bv = num(bv);
      // Handle NaN values
      if (isNaN(av) && isNaN(bv)) return 0;
      if (isNaN(av)) return 1; // NaN values go to end
      if (isNaN(bv)) return -1;
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    }
    
    // Fallback: treat as text
    av = String(av || "").trim().toLowerCase();
    bv = String(bv || "").trim().toLowerCase();
    if (av === "" && bv === "") return 0;
    if (av === "") return 1;
    if (bv === "") return -1;
    if (av < bv) return -sortDir;
    if (av > bv) return sortDir;
    return 0;
  });
  return sorted;
}

/* ---------- KPI Calculation ---------- */
function updateKPI(rows, view = currentView) {
  const kpiGrid = $("#kpiGrid");
  if (!kpiGrid) return;
  
  let kpis = [];
  
  if (view === "construction") {
    const totalLoan = rows.reduce((sum, r) => sum + num(r.LoanAmount || 0), 0);
    const totalUnits = rows.reduce((sum, r) => sum + num(r.Units || 0), 0);
    const avgLTC = rows.length > 0 ? rows.reduce((sum, r) => {
      const loan = num(r.LoanAmount || 0);
      const cost = num(r.TotalCost || 0);
      return sum + (cost > 0 ? loan / cost : 0);
    }, 0) / rows.length : 0;
    
    kpis = [
      { label: "Total Loan Amount", value: fmtCurrency(totalLoan) },
      { label: "Total Units", value: fmtInt(totalUnits) },
      { label: "Avg LTC", value: fmtPctSmart(avgLTC * 100) },
      { label: "Active Deals", value: fmtInt(rows.length) },
    ];
  } else if (view === "permanent") {
    const totalPerm = rows.reduce((sum, r) => sum + num(r.PermanentLoanAmount || 0), 0);
    const totalUnits = rows.reduce((sum, r) => sum + num(r.Units || 0), 0);
    
    kpis = [
      { label: "Total Permanent Financing", value: fmtCurrency(totalPerm) },
      { label: "Total Units", value: fmtInt(totalUnits) },
      { label: "Active Deals", value: fmtInt(rows.length) },
    ];
  } else if (view === "equity") {
    const totalEquity = rows.reduce((sum, r) => {
      const equity = r.EquityCommitments || [];
      return sum + equity.reduce((s, e) => s + num(e.Amount || 0), 0);
    }, 0);
    
    kpis = [
      { label: "Total Equity", value: fmtCurrency(totalEquity) },
      { label: "Active Deals", value: fmtInt(rows.length) },
    ];
  }
  
  kpiGrid.innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>
  `).join("");
}

/* ---------- Table Rendering ---------- */
// Column preferences storage
let columnPreferences = {
  widths: {},
  order: {}
};

// Load column preferences from localStorage
function loadColumnPreferences() {
  try {
    const saved = localStorage.getItem('columnPreferences');
    if (saved) {
      columnPreferences = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load column preferences:', e);
  }
}

// Save column preferences to localStorage
function saveColumnPreferences() {
  try {
    localStorage.setItem('columnPreferences', JSON.stringify(columnPreferences));
  } catch (e) {
    console.warn('Failed to save column preferences:', e);
  }
}

// Get column width preference or calculate auto-fit
function getColumnWidth(colKey, headerText, sampleData) {
  // Check for saved preference
  if (columnPreferences.widths && columnPreferences.widths[colKey]) {
    return columnPreferences.widths[colKey];
  }
  
  // Auto-fit: calculate based on content
  const headerWidth = headerText.length * 10 + 40; // Approximate character width
  let maxDataWidth = 0;
  
  // Check sample data (first 10 rows)
  const samples = sampleData.slice(0, 10);
  samples.forEach(row => {
    const value = String(row[colKey] || '');
    const width = value.length * 8 + 20; // Approximate character width for data
    if (width > maxDataWidth) maxDataWidth = width;
  });
  
  // Return the larger of header or data width, with min/max constraints
  const calculatedWidth = Math.max(headerWidth, maxDataWidth, 80);
  return Math.min(calculatedWidth, 400); // Max width of 400px
}

function renderTableHeaders(columns, sampleData = []) {
  const thead = $("#listHead");
  const tfoot = $("#listFoot");
  if (!thead) return;
  
  // Load preferences
  loadColumnPreferences();
  
  // Get column order preference or use default
  const viewKey = `${currentTab}-${currentView}`;
  let orderedColumns = columns;
  if (columnPreferences.order && columnPreferences.order[viewKey]) {
    const savedOrder = columnPreferences.order[viewKey];
    orderedColumns = savedOrder.map(key => columns.find(c => c.key === key)).filter(Boolean);
    // Add any new columns that weren't in saved order
    columns.forEach(col => {
      if (!orderedColumns.find(c => c.key === col.key)) {
        orderedColumns.push(col);
      }
    });
  }
  
  // Helper function to create a header cell
  const createHeaderCell = (col) => {
    const th = document.createElement("th");
    th.className = `th-sort ${col.num ? "num" : ""} col-${col.key}`;
    th.setAttribute("data-key", col.key);
    th.setAttribute("data-column-key", col.key);
    th.setAttribute("title", col.label);
    th.setAttribute("draggable", "true");
    th.style.position = "relative";
    
    // Calculate and set width
    const width = getColumnWidth(col.key, col.label, sampleData);
    th.style.width = `${width}px`;
    th.style.minWidth = `${width}px`;
    th.style.maxWidth = `${width}px`;
    
    // Header content
    const headerContent = document.createElement("span");
    headerContent.className = "header-content";
    headerContent.textContent = col.label;
    th.appendChild(headerContent);
    
    // Sort icon
    if (col.sortable !== false) {
      const sortIcon = document.createElement("i");
      sortIcon.className = "sort";
      th.appendChild(sortIcon);
    }
    
    // Resize handle
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "resize-handle";
    resizeHandle.setAttribute("data-column", col.key);
    th.appendChild(resizeHandle);
    
    return th;
  };
  
  // Render top headers
  thead.innerHTML = "";
  const trTop = document.createElement("tr");
  trTop.className = "resizable-headers";
  
  for (const col of orderedColumns) {
    trTop.appendChild(createHeaderCell(col));
  }
  
  thead.appendChild(trTop);
  
  // Render bottom headers (footer)
  if (tfoot) {
    tfoot.innerHTML = "";
    const trBottom = document.createElement("tr");
    trBottom.className = "resizable-headers footer-headers";
    
    for (const col of orderedColumns) {
      const th = createHeaderCell(col);
      // Footer headers don't need sort functionality, but keep the same structure
      trBottom.appendChild(th);
    }
    
    tfoot.appendChild(trBottom);
  }
  
  // Setup column resizing and reordering after a short delay
  requestAnimationFrame(() => {
    setupColumnResizing();
    setupColumnReordering();
    autoFitColumns(orderedColumns, sampleData);
  });
}

// Setup column resizing functionality
function setupColumnResizing() {
  const resizeHandles = document.querySelectorAll('.resize-handle');
  
  resizeHandles.forEach(handle => {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let columnKey = '';
    
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.pageX;
      const th = handle.closest('th');
      columnKey = th.dataset.columnKey;
      startWidth = th.offsetWidth;
      
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const diff = e.pageX - startX;
      const newWidth = Math.max(50, startWidth + diff); // Min width 50px
      
      const th = handle.closest('th');
      const allCells = document.querySelectorAll(`.col-${columnKey}`);
      
      allCells.forEach(cell => {
        cell.style.width = `${newWidth}px`;
        cell.style.minWidth = `${newWidth}px`;
        cell.style.maxWidth = `${newWidth}px`;
      });
      
      // Save preference
      if (!columnPreferences.widths) columnPreferences.widths = {};
      columnPreferences.widths[columnKey] = newWidth;
      saveColumnPreferences();
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  });
}

// Setup column reordering functionality
function setupColumnReordering() {
  const headers = document.querySelectorAll('.resizable-headers th[draggable="true"]');
  let draggedElement = null;
  let draggedIndex = -1;
  
  headers.forEach((header, index) => {
    header.addEventListener('dragstart', (e) => {
      draggedElement = header;
      draggedIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
      header.classList.add('dragging');
      header.style.opacity = '0.5';
    });
    
    header.addEventListener('dragend', () => {
      if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement.style.opacity = '';
        draggedElement = null;
        draggedIndex = -1;
      }
    });
    
    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (draggedElement && draggedElement !== header) {
        const afterElement = getDragAfterElement(header.parentElement, e.clientX);
        const parent = header.parentElement;
        
        if (afterElement == null) {
          parent.appendChild(draggedElement);
        } else {
          parent.insertBefore(draggedElement, afterElement);
        }
      }
    });
    
    header.addEventListener('drop', (e) => {
      e.preventDefault();
      
      if (!draggedElement || draggedElement === header) return;
      
      // Save new column order
      const viewKey = `${currentTab}-${currentView}`;
      if (!columnPreferences.order) columnPreferences.order = {};
      
      const newOrder = Array.from(header.parentElement.querySelectorAll('th[draggable="true"]'))
        .map(th => th.dataset.columnKey);
      columnPreferences.order[viewKey] = newOrder;
      saveColumnPreferences();
      
      // Re-render to apply new order to both headers and cells
      renderAll();
    });
  });
}

// Helper function for drag and drop
function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll('th[draggable="true"]:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Auto-fit columns to content
function autoFitColumns(columns, sampleData) {
  if (!sampleData || sampleData.length === 0) return;
  
  columns.forEach(col => {
    // Skip if user has manually resized
    if (columnPreferences.widths && columnPreferences.widths[col.key]) {
      return;
    }
    
    const header = document.querySelector(`th[data-column-key="${col.key}"]`);
    if (!header) return;
    
    // Calculate width based on header and data
    const headerWidth = header.textContent.length * 10 + 60;
    let maxDataWidth = 0;
    
    sampleData.slice(0, 20).forEach(row => {
      const cell = document.querySelector(`.col-${col.key}`);
      if (cell) {
        const text = cell.textContent || '';
        const width = text.length * 8 + 30;
        if (width > maxDataWidth) maxDataWidth = width;
      }
    });
    
    const calculatedWidth = Math.max(headerWidth, maxDataWidth, 80);
    const finalWidth = Math.min(calculatedWidth, 400);
    
    const allCells = document.querySelectorAll(`.col-${col.key}`);
    allCells.forEach(cell => {
      cell.style.width = `${finalWidth}px`;
      cell.style.minWidth = `${finalWidth}px`;
      cell.style.maxWidth = `${finalWidth}px`;
    });
  });
}

// Global variables for regions and product types
let regionsData = [];
let productTypesData = [];

// Load regions and product types from API
async function loadRegionsAndProductTypes() {
  try {
    // Since api-client.js uses export but is loaded as a script, we need to access functions differently
    // Try direct call first, then window, then throw error
    let getAllRegionsFn, getAllProductTypesFn;
    
    if (typeof getAllRegions !== 'undefined') {
      getAllRegionsFn = getAllRegions;
    } else if (typeof window !== 'undefined' && window.getAllRegions) {
      getAllRegionsFn = window.getAllRegions;
    } else {
      // Fallback: use apiRequest directly
      getAllRegionsFn = () => apiRequest('/api/core/regions');
    }
    
    if (typeof getAllProductTypes !== 'undefined') {
      getAllProductTypesFn = getAllProductTypes;
    } else if (typeof window !== 'undefined' && window.getAllProductTypes) {
      getAllProductTypesFn = window.getAllProductTypes;
    } else {
      // Fallback: use apiRequest directly
      getAllProductTypesFn = () => apiRequest('/api/core/product-types');
    }
    
    const [regionsRes, productTypesRes] = await Promise.all([
      getAllRegionsFn(),
      getAllProductTypesFn()
    ]);
    
    regionsData = (regionsRes?.data || regionsRes || []).filter(r => r.IsActive !== false);
    productTypesData = (productTypesRes?.data || productTypesRes || []).filter(pt => pt.IsActive !== false);
    
    // Sort by DisplayOrder if available, otherwise by name
    regionsData.sort((a, b) => {
      if (a.DisplayOrder != null && b.DisplayOrder != null) return a.DisplayOrder - b.DisplayOrder;
      return (a.RegionName || '').localeCompare(b.RegionName || '');
    });
    
    productTypesData.sort((a, b) => {
      if (a.DisplayOrder != null && b.DisplayOrder != null) return a.DisplayOrder - b.DisplayOrder;
      return (a.ProductTypeName || '').localeCompare(b.ProductTypeName || '');
    });
  } catch (error) {
    console.error('Error loading regions and product types:', error);
    // Fallback to default values
    regionsData = [{ RegionName: 'Gulf Coast' }, { RegionName: 'Carolinas' }];
    productTypesData = [{ ProductTypeName: 'Prototype' }, { ProductTypeName: 'Heights' }, { ProductTypeName: 'Flats' }, { ProductTypeName: 'Other' }];
  }
}

// Fuzzy match project names (better matching algorithm)
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
      .replace(/\s+at\s+/gi, ' ')  // "The Waters at Robinwood" -> "waters robinwood"
      .replace(/\s+apartments\s*/gi, '')
      .replace(/\s+phase\s+two\s*/gi, '')
      .replace(/\s+phase\s+2\s*/gi, '')
      .replace(/\s+llc\s*/gi, '')
      .replace(/[,\.\-]/g, ' ')  // Replace dashes and punctuation with spaces
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  const projNorm = normalize(proj);
  const procoreNorm = normalize(procore);
  
  // Normalized exact match
  if (projNorm === procoreNorm) return true;
  
  // One contains the other (after normalization)
  if (projNorm.includes(procoreNorm) || procoreNorm.includes(projNorm)) return true;
  
  // Extract key words (remove common words)
  const commonWords = new Set(['the', 'at', 'of', 'and', 'project', 'construction', 'apartments', 'apartment', 'llc', 'inc', 'corp']);
  const getKeyWords = (str) => {
    return str.split(/\s+/)
      .filter(w => w.length > 2 && !commonWords.has(w))
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 0);
  };
  
  const projWords = getKeyWords(projNorm);
  const procoreWords = getKeyWords(procoreNorm);
  
  // Calculate similarity score
  let matchScore = 0;
  let totalWords = Math.max(projWords.length, procoreWords.length);
  
  // Check for word matches (exact and partial)
  projWords.forEach(pw => {
    procoreWords.forEach(cw => {
      // Exact word match
      if (pw === cw) {
        matchScore += 2;
      }
      // One word contains the other (e.g., "heights" matches "height")
      else if (pw.includes(cw) || cw.includes(pw)) {
        matchScore += 1.5;
      }
      // Partial match (e.g., "waterpointe" vs "water")
      else if (pw.length > 4 && cw.length > 4) {
        const minLen = Math.min(pw.length, cw.length);
        const maxLen = Math.max(pw.length, cw.length);
        // Check if shorter word is at least 60% of longer word and appears in it
        if (minLen / maxLen >= 0.6 && (pw.includes(cw.substring(0, Math.min(4, cw.length))) || cw.includes(pw.substring(0, Math.min(4, pw.length))))) {
          matchScore += 1;
        }
      }
    });
  });
  
  // Normalize score (0-100)
  const normalizedScore = totalWords > 0 ? (matchScore / (totalWords * 2)) * 100 : 0;
  
  // More strict matching: require higher score to avoid false matches
  // For "The Waters at X" projects, we need the location word (X) to match, not just "Waters"
  // Only accept if score >= 50 (was 25, too lenient)
  if (normalizedScore >= 50) return true;
  
  // Word-by-word matching: require at least 2 significant words to match (not just 1)
  // This prevents "The Waters at Robinwood" from matching "The Waters at Bartlett"
  const matchingWords = projWords.filter(w => procoreWords.includes(w));
  if (matchingWords.length >= 2 && matchingWords.some(w => w.length > 3)) {
    // Additional check: if both have location names, they must match
    const commonPrefixWords = new Set(['waters', 'heights', 'flats', 'palms', 'lofts']);
    const projLocationWords = projWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
    const procoreLocationWords = procoreWords.filter(w => w.length > 5 && !commonPrefixWords.has(w));
    
    // If both have location words, they must match
    if (projLocationWords.length > 0 && procoreLocationWords.length > 0) {
      const locationMatch = projLocationWords.some(w => procoreLocationWords.includes(w));
      if (locationMatch) return true;
    } else {
      // If no location words, allow the match if 2+ words match
      return true;
    }
  }
  
  // Check for significant words (length > 4) that appear in both
  const significantProjWords = projWords.filter(w => w.length > 4);
  const significantProcoreWords = procoreWords.filter(w => w.length > 4);
  if (significantProjWords.length > 0 && significantProcoreWords.length > 0) {
    const matching = significantProjWords.some(w => significantProcoreWords.includes(w));
    // Only return true if there's a location word match OR if it's a very high similarity
    if (matching && normalizedScore >= 40) return true;
  }
  
  // More strict substring matching: require longer words and multiple matches
  // This prevents "The Waters at Robinwood" from matching "The Waters at Bartlett" just because both have "waters"
  const longProjWords = projWords.filter(w => w.length > 6);
  const longProcoreWords = procoreWords.filter(w => w.length > 6);
  
  // Count how many long words match
  let longWordMatches = 0;
  for (const pw of longProjWords) {
    if (procoreNorm.includes(pw)) longWordMatches++;
  }
  for (const cw of longProcoreWords) {
    if (projNorm.includes(cw)) longWordMatches++;
  }
  
  // Require at least 2 long word matches to avoid false positives
  if (longWordMatches >= 2) return true;
  
  // Special case: if both contain a unique location name (like "robinwood"), match them
  // Extract location names (words that are likely place names - longer words, not common words)
  // These are typically the last word or a distinctive word that's not "waters", "heights", "flats", etc.
  const commonPrefixWords = new Set(['waters', 'heights', 'flats', 'palms', 'lofts']);
  const locationWords = [...projWords, ...procoreWords]
    .filter(w => w.length > 5 && !commonPrefixWords.has(w));
  const uniqueLocationWords = locationWords.filter((w, i, arr) => arr.indexOf(w) === i);
  
  for (const locWord of uniqueLocationWords) {
    if (projNorm.includes(locWord) && procoreNorm.includes(locWord)) {
      // If both have this location word, it's a strong match (location names are unique identifiers)
      // But also check that they have at least one other matching word to avoid false positives
      const otherWordsProj = projWords.filter(w => w !== locWord && w.length > 3);
      const otherWordsProcore = procoreWords.filter(w => w !== locWord && w.length > 3);
      const otherMatches = otherWordsProj.filter(w => otherWordsProcore.includes(w));
      // Require at least one other matching word (like "waters" or "heights")
      if (otherMatches.length >= 1) {
        return true;
      }
    }
  }
  
  return false;
}

// Store Procore match data globally
window.PROCORE_MATCHES = new Map(); // projectId -> { hasProcore: true, actualStartDate, city, state, isActual: true/false }

// Sync data from Procore to DB (start date and address)
async function syncEstimatedConstructionStartDateFromProcore() {
  if (!window.PROCORE_DATA || window.PROCORE_DATA.length === 0) {
    console.log('No Procore data available to sync');
    return;
  }
  
  if (!window.PROJECTS_DATA || window.PROJECTS_DATA.length === 0) {
    console.log('No projects data available to sync');
    return;
  }
  
  // Clear previous matches
  window.PROCORE_MATCHES.clear();
  
  const updates = [];
  
  // Match Procore projects to DB projects by name (fuzzy matching)
  // Note: ProcoreProjects is the dataset alias, and "name" is the column field alias
  let matchCount = 0;
  let attemptedMatches = [];
  
  // console.log('Starting Procore matching...');
  // console.log(`Procore projects: ${window.PROCORE_DATA.length}, DB projects: ${window.PROJECTS_DATA.length}`);
  
  // TEMPORARY: Log ALL Procore project data
  // console.log('=== ALL PROCORE PROJECTS (Full Data) ===');
  // window.PROCORE_DATA.forEach((proj, idx) => {
  //   const name = proj.name || proj.Name || proj.projectName || proj.ProjectName || 'NO NAME';
  //   console.log(`${idx + 1}. "${name}"`, {
  //     name: name,
  //     city: proj.city || 'N/A',
  //     state: proj.state || 'N/A', // State is now in manifest with alias "state"
  //     region: proj.region || 'N/A',
  //     address: proj.address || 'N/A',
  //     actualstartdate: proj.actualstartdate || 'N/A',
  //     actualcompletiondate: proj.actualcompletiondate || 'N/A',
  //     projectedfinishdate: proj.projectedfinishdate || 'N/A',
  //     allKeys: Object.keys(proj)
  //   });
  // });
  
  // TEMPORARY: Log ALL DB project names
  // console.log('=== ALL DB PROJECTS ===');
  // window.PROJECTS_DATA.forEach((proj, idx) => {
  //   const name = proj.ProjectName || 'NO NAME';
  //   console.log(`${idx + 1}. "${name}" (ID: ${proj.ProjectId || proj.Row || 'N/A'}, City: ${proj.City || 'N/A'}, State: ${proj.State || 'N/A'})`);
  // });
  // console.log('=== END PROJECT LISTS ===');
  
  for (const procoreProject of window.PROCORE_DATA) {
    // Try multiple possible field names for the project name
    const procoreName = (procoreProject.name || procoreProject.Name || procoreProject.projectName || procoreProject.ProjectName || '').trim();
    
    if (!procoreName) {
      // console.log('Skipping Procore project with no name field. Available keys:', Object.keys(procoreProject));
      continue;
    }
    
    // console.log(`Attempting to match Procore project: "${procoreName}"`);
    // console.log(`  Procore data:`, {
    //   name: procoreName,
    //   actualstartdate: procoreProject.actualstartdate,
    //   actualcompletiondate: procoreProject.actualcompletiondate,
    //   city: procoreProject.city,
    //   state: procoreProject.state,
    //   region: procoreProject.region,
    //   allKeys: Object.keys(procoreProject) // Show all available keys for debugging
    // });
    
    // Find matching project in DB using fuzzy matching
    // Try to find the best match by checking all projects
    let bestMatch = null;
    let bestMatchScore = 0;
    
    // Special debug for "The Waters at Robinwood"
    const isRobinwood = procoreName.toLowerCase().includes('robinwood');
    // if (isRobinwood) {
    //   console.log(`🔍 DEBUG: Attempting to match Procore project: "${procoreName}"`);
    //   console.log(`  Checking against ${window.PROJECTS_DATA.length} DB projects...`);
    // }
    
    for (const proj of window.PROJECTS_DATA) {
      const projName = (proj.ProjectName || '').trim();
      if (!projName) continue;
      
      // Special debug for Robinwood - show all potential matches
      // if (isRobinwood) {
      //   const projLower = projName.toLowerCase();
      //   if (projLower.includes('robinwood') || projLower.includes('waters')) {
      //     console.log(`  Checking: "${projName}"`);
      //     const testMatch = fuzzyMatchProjectName(projName, procoreName);
      //     console.log(`    Match result: ${testMatch}`);
      //   }
      // }
      
      const matches = fuzzyMatchProjectName(projName, procoreName);
      if (matches) {
        // Calculate a match score (exact = 100, contains = 50, word match = 25)
        const projLower = projName.toLowerCase();
        const procoreLower = procoreName.toLowerCase();
        let score = 25; // Default score for fuzzy match
        if (projLower === procoreLower) {
          score = 100;
        } else if (projLower.includes(procoreLower) || procoreLower.includes(projLower)) {
          score = 50;
        }
        
        // Keep the best match (highest score)
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = proj;
        }
      }
    }
    
    // if (isRobinwood && !bestMatch) {
    //   console.log(`  ✗ No match found for "${procoreName}"`);
    //   console.log(`  DB projects with "robinwood" or "waters":`, 
    //     window.PROJECTS_DATA
    //       .filter(p => {
    //         const name = (p.ProjectName || '').toLowerCase();
    //         return name.includes('robinwood') || name.includes('waters');
    //       })
    //       .map(p => p.ProjectName)
    //   );
    // }
    
    const matchingProject = bestMatch;
    
    if (matchingProject) {
      matchCount++;
      // console.log(`✓ Matched: "${procoreName}" → "${matchingProject.ProjectName}" (score: ${bestMatchScore})`);
      // Ensure projectId is consistently stored as a number for reliable lookup
      const projectId = Number(matchingProject.ProjectId || matchingProject.Row);
      
      // Special debug for "The Waters at Robinwood"
      // if (procoreName.toLowerCase().includes('waters') && procoreName.toLowerCase().includes('robinwood')) {
      //   console.log(`🔍 DEBUG: Found "The Waters at Robinwood" match!`);
      //   console.log(`  Procore name: "${procoreName}"`);
      //   console.log(`  DB name: "${matchingProject.ProjectName}"`);
      //   console.log(`  ProjectId (as number): ${projectId}`);
      //   console.log(`  ProjectId type: ${typeof projectId}`);
      //   console.log(`  actualcompletiondate: ${procoreProject.actualcompletiondate}`);
      //   console.log(`  projectedfinishdate: ${procoreProject.projectedfinishdate}`);
      // }
      
      // Determine completion date: use projectedfinishdate if in the future, otherwise actualcompletiondate
      let completionDate = null;
      const todayForCompletion = new Date();
      todayForCompletion.setHours(0, 0, 0, 0);
      
      if (procoreProject.projectedfinishdate) {
        let projectedDate = new Date(procoreProject.projectedfinishdate);
        projectedDate.setHours(0, 0, 0, 0);
        // If projected date is in the future, use it
        if (projectedDate >= todayForCompletion) {
          completionDate = procoreProject.projectedfinishdate;
        }
      }
      
      // If no future projected date, use actual completion date if available
      if (!completionDate && procoreProject.actualcompletiondate) {
        completionDate = procoreProject.actualcompletiondate;
      }
      
      // Store Procore match data
      const procoreMatch = {
        hasProcore: true,
        actualStartDate: procoreProject.actualstartdate || null,
        actualCompletionDate: procoreProject.actualcompletiondate || null,
        projectedFinishDate: procoreProject.projectedfinishdate || null,
        completionDate: completionDate, // The date to use (projected if future, actual otherwise)
        city: procoreProject.city || null,
        state: procoreProject.state || null,
        region: procoreProject.region || null,
        address: procoreProject.address || null,
        isActual: !!procoreProject.actualstartdate
      };
      window.PROCORE_MATCHES.set(projectId, procoreMatch);
      
      // Debug: Log when storing Bluebonnet specifically
      // if (matchingProject.ProjectName && matchingProject.ProjectName.includes('Bluebonnet')) {
      //   console.log(`🔍 STORING PROCORE_MATCHES for Bluebonnet:`, {
      //     projectId,
      //     projectIdType: typeof projectId,
      //     storedKey: projectId,
      //     city: procoreMatch.city,
      //     state: procoreMatch.state,
      //     region: procoreMatch.region,
      //     mapSize: window.PROCORE_MATCHES.size,
      //     hasKey: window.PROCORE_MATCHES.has(projectId),
      //     verifyGet: window.PROCORE_MATCHES.get(projectId) ? 'FOUND' : 'NOT FOUND'
      //   });
      // }
      
      // Prepare update object for auto-sync
      const updateData = {};
      
      // Sync actual start date if available
      if (procoreProject.actualstartdate) {
        let formattedDate = procoreProject.actualstartdate;
        if (formattedDate.includes('T')) {
          formattedDate = formattedDate.split('T')[0];
        }
        
        const currentDate = matchingProject.EstimatedConstructionStartDate;
        if (currentDate !== formattedDate) {
          updateData.EstimatedConstructionStartDate = formattedDate;
        }
      }
      
      // Sync completion date (Construction Completion Date) - ALWAYS use projectedfinishdate if available and in future, otherwise actualcompletiondate
      let completionDateToSync = null;
      const todayForSync = new Date();
      todayForSync.setHours(0, 0, 0, 0);
      
      // First, check projectedfinishdate - use it if it exists and is in the future
      if (procoreProject.projectedfinishdate) {
        let projectedDate = new Date(procoreProject.projectedfinishdate);
        projectedDate.setHours(0, 0, 0, 0);
        // Use projected date if it's in the future OR if there's no actual completion date
        if (projectedDate >= todayForSync || !procoreProject.actualcompletiondate) {
          completionDateToSync = procoreProject.projectedfinishdate;
          // console.log(`  Found projected finish date in Procore: ${completionDateToSync} for project ${matchingProject.ProjectName} (${projectedDate >= todayForSync ? 'future' : 'past but using since no actual date'})`);
        }
      }
      
      // If no projected date (or it's in the past and we have an actual date), use actual completion date if available
      if (!completionDateToSync && procoreProject.actualcompletiondate) {
        completionDateToSync = procoreProject.actualcompletiondate;
        // console.log(`  Found actual completion date in Procore: ${completionDateToSync} for project ${matchingProject.ProjectName}`);
      }
      
      if (completionDateToSync) {
        // Extract just YYYY-MM-DD from any date format (handles timestamps, ISO dates, etc.)
        let formattedDate = completionDateToSync;
        // Handle ISO format with T (2027-08-11T22:00:00+00:00)
        if (formattedDate.includes('T')) {
          formattedDate = formattedDate.split('T')[0];
        }
        // Handle space-separated format (2027-08-11 22:00:00+00:00)
        else if (formattedDate.includes(' ')) {
          formattedDate = formattedDate.split(' ')[0];
        }
        // Extract YYYY-MM-DD pattern if it exists
        const dateMatch = formattedDate.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          formattedDate = dateMatch[1];
        }
        
        // Find the construction loan for this project
        const constructionLoan = window.LOANS_DATA?.find(loan => 
          loan.ProjectId === projectId && 
          (loan.LoanType?.toLowerCase().includes('construction') || loan.LoanPhase === 'Construction')
        );
        
        if (constructionLoan) {
          const currentCompletionDate = constructionLoan.ConstructionCompletionDate;
          // Normalize current date for comparison (extract YYYY-MM-DD if it has time)
          let normalizedCurrent = currentCompletionDate || '';
          if (normalizedCurrent && normalizedCurrent.includes(' ')) {
            normalizedCurrent = normalizedCurrent.split(' ')[0];
          }
          if (normalizedCurrent && normalizedCurrent.includes('T')) {
            normalizedCurrent = normalizedCurrent.split('T')[0];
          }
          
          // console.log(`  Found construction loan ${constructionLoan.LoanId}, current completion date: ${currentCompletionDate}`);
          if (normalizedCurrent !== formattedDate) {
            // console.log(`  Updating completion date from ${currentCompletionDate} to ${formattedDate}`);
            // Update the loan's ConstructionCompletionDate (send only YYYY-MM-DD)
            updates.push(
              updateLoan(constructionLoan.LoanId, { ConstructionCompletionDate: formattedDate })
                .then(() => {
                  // console.log(`  ✓ Successfully synced completion date for loan ${constructionLoan.LoanId}`);
                  return null;
                })
                .catch(err => {
                  console.error(`  ✗ Error syncing completion date for loan ${constructionLoan.LoanId}:`, err);
                  return null;
                })
            );
          } else {
            // console.log(`  Completion date already matches (${formattedDate}), skipping update`);
          }
        } else {
          // console.log(`  ⚠ No construction loan found for project ${matchingProject.ProjectName} (ProjectId: ${projectId})`);
          // console.log(`  Available loans for this project:`, window.LOANS_DATA?.filter(l => l.ProjectId === projectId).map(l => ({
          //   LoanId: l.LoanId,
          //   LoanType: l.LoanType,
          //   LoanPhase: l.LoanPhase
          // })));
        }
      } else {
        // console.log(`  No completion date in Procore for "${procoreName}" (checked projectedfinishdate and actualcompletiondate)`);
      }
      
      // Sync City if available in Procore
      if (procoreProject.city) {
        const currentCity = matchingProject.City;
        if (currentCity !== procoreProject.city) {
          updateData.City = procoreProject.city;
        }
        
        // If city is being synced, also sync state and region if available in Procore
        // (City, State, and Region typically come together from Procore)
        if (procoreProject.state != null && procoreProject.state !== '') {
          const currentState = matchingProject.State;
          if (currentState !== procoreProject.state) {
            updateData.State = procoreProject.state;
          }
        }
        
        // Sync Region if available in Procore
        if (procoreProject.region != null && procoreProject.region !== '') {
          const currentRegion = matchingProject.Region;
          if (currentRegion !== procoreProject.region) {
            updateData.Region = procoreProject.region;
          }
        }
        
        // Sync Address if available in Procore
        if (procoreProject.address != null && procoreProject.address !== '') {
          const currentAddress = matchingProject.Address || matchingProject.FullAddress || '';
          if (currentAddress !== procoreProject.address) {
            // Try Address first, if that field doesn't exist in DB, it will be ignored
            updateData.Address = procoreProject.address;
          }
        }
      } else {
        // Even if city isn't available, sync state, region, and address if they're available
        if (procoreProject.state != null && procoreProject.state !== '') {
          const currentState = matchingProject.State;
          if (currentState !== procoreProject.state) {
            updateData.State = procoreProject.state;
          }
        }
        
        // Sync Region if available in Procore
        if (procoreProject.region != null && procoreProject.region !== '') {
          const currentRegion = matchingProject.Region;
          if (currentRegion !== procoreProject.region) {
            updateData.Region = procoreProject.region;
          }
        }
        
        // Sync Address if available in Procore
        if (procoreProject.address != null && procoreProject.address !== '') {
          const currentAddress = matchingProject.Address || matchingProject.FullAddress || '';
          if (currentAddress !== procoreProject.address) {
            // Try Address first, if that field doesn't exist in DB, it will be ignored
            updateData.Address = procoreProject.address;
          }
        }
      }
      
      // Always sync all available Procore data when a match is found (auto-sync)
      // This ensures City, State, Region, Address, and EstimatedConstructionStartDate are kept in sync
      if (Object.keys(updateData).length > 0) {
        // console.log(`🔄 Auto-syncing Procore data for ${matchingProject.ProjectName}:`, updateData);
        updates.push(
          updateProject(projectId, updateData)
            .then(() => {
              // console.log(`  ✓ Successfully synced Procore data for project ${projectId} (${matchingProject.ProjectName})`);
              return null;
            })
            .catch(err => {
              console.error(`  ✗ Error syncing Procore data for project ${projectId}:`, err);
              return null; // Continue with other updates
            })
        );
      } else {
        // console.log(`  ℹ No Procore data changes needed for ${matchingProject.ProjectName} (already in sync)`);
      }
    } else {
      // Log failed match attempts for debugging
      // TEMPORARY: Log unmatched Procore projects with full details
      // console.log(`✗ NO MATCH for Procore project: "${procoreName}"`);
      // console.log(`  Full Procore data:`, {
      //   name: procoreName,
      //   city: procoreProject.city || 'N/A',
      //   state: procoreProject.state || 'N/A',
      //   actualstartdate: procoreProject.actualstartdate || 'N/A',
      //   actualcompletiondate: procoreProject.actualcompletiondate || 'N/A',
      //   projectedfinishdate: procoreProject.projectedfinishdate || 'N/A'
      // });
      // console.log(`  Tried matching against ${window.PROJECTS_DATA.length} DB projects`);
      // Show all DB project names for comparison
      // console.log(`  All DB project names:`, window.PROJECTS_DATA.map(p => `"${p.ProjectName}"`));
      
      attemptedMatches.push({
        procoreName: procoreName,
        city: procoreProject.city,
        state: procoreProject.state,
        triedAgainst: window.PROJECTS_DATA.map(p => p.ProjectName) // All projects we tried
      });
    }
  }
  
  // console.log(`Procore matching complete: ${matchCount} matches found out of ${window.PROCORE_DATA.length} Procore projects`);
  // console.log(`Unmatched Procore projects: ${window.PROCORE_DATA.length - matchCount}`);
  // if (attemptedMatches.length > 0) {
  //   console.log(`=== ALL UNMATCHED PROCORE PROJECTS (${attemptedMatches.length}) ===`);
  //   attemptedMatches.forEach((attempt, idx) => {
  //     console.log(`${idx + 1}. "${attempt.procoreName}" (City: ${attempt.city || 'N/A'}, State: ${attempt.state || 'N/A'})`);
  //   });
  //   console.log('=== END UNMATCHED LIST ===');
  // }
  
  if (updates.length > 0) {
    // console.log(`Syncing ${updates.length} projects with Procore data...`);
    await Promise.all(updates);
    // console.log('Completed syncing Procore data');
    
    // Reload projects and loans data to get updated values
    const [projectsRes, loansRes] = await Promise.all([
      getAllProjects(),
      getAllLoans()
    ]);
    window.PROJECTS_DATA = projectsRes?.data || projectsRes || [];
    window.LOANS_DATA = loansRes?.data || loansRes || [];
    
    // Rebuild matches after reload - use the SAME algorithm as syncEstimatedConstructionStartDateFromProcore
    // to ensure consistency and find the BEST match, not just the first match
    window.PROCORE_MATCHES.clear();
    for (const procoreProject of window.PROCORE_DATA) {
      const procoreName = (procoreProject.name || '').trim();
      if (!procoreName) continue;
      
      // Use the same best-match algorithm as the main sync function
      let bestMatch = null;
      let bestMatchScore = 0;
      
      for (const proj of window.PROJECTS_DATA) {
        const projName = (proj.ProjectName || '').trim();
        if (!projName) continue;
        
        const matches = fuzzyMatchProjectName(projName, procoreName);
        if (matches) {
          const projLower = projName.toLowerCase();
          const procoreLower = procoreName.toLowerCase();
          let score = 25;
          if (projLower === procoreLower) {
            score = 100;
          } else if (projLower.includes(procoreLower) || procoreLower.includes(projLower)) {
            score = 50;
          }
          
          if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatch = proj;
          }
        }
      }
      
      if (bestMatch) {
        // Use Number format to match the main sync function
        const projectId = Number(bestMatch.ProjectId || bestMatch.Row);
        
        // Determine completion date: use projectedfinishdate if in the future, otherwise actualcompletiondate
        let completionDate = null;
        const todayForRebuild = new Date();
        todayForRebuild.setHours(0, 0, 0, 0);
        
        if (procoreProject.projectedfinishdate) {
          let projectedDate = new Date(procoreProject.projectedfinishdate);
          projectedDate.setHours(0, 0, 0, 0);
          // If projected date is in the future, use it
          if (projectedDate >= todayForRebuild) {
            completionDate = procoreProject.projectedfinishdate;
          }
        }
        
        // If no future projected date, use actual completion date if available
        if (!completionDate && procoreProject.actualcompletiondate) {
          completionDate = procoreProject.actualcompletiondate;
        }
        
        window.PROCORE_MATCHES.set(projectId, {
          hasProcore: true,
          actualStartDate: procoreProject.actualstartdate || null,
          actualCompletionDate: procoreProject.actualcompletiondate || null,
          projectedFinishDate: procoreProject.projectedfinishdate || null,
          completionDate: completionDate, // The date to use (projected if future, actual otherwise)
          city: procoreProject.city || null,
          state: procoreProject.state || null,
          region: procoreProject.region || null,
          address: procoreProject.address || null,
          isActual: !!procoreProject.actualstartdate
        });
      }
    }
  } else {
    console.log('No Procore data updates needed');
  }
}

// Render Deal Pipeline view (Admin only - Core deal attributes)
async function renderDealPipeline() {
  if (!isAdmin() || !globalEditMode) {
    const container = $("#dealPipelineTableContainer");
    if (container) {
      container.innerHTML = "<div class='empty'>Admin access required. Please log in as an admin.</div>";
    }
    return;
  }
  
  // Debug: Log PROCORE_MATCHES state at start of renderDealPipeline
  // console.log(`🔍 renderDealPipeline: PROCORE_MATCHES state:`, {
  //   exists: !!window.PROCORE_MATCHES,
  //   size: window.PROCORE_MATCHES?.size || 0,
  //   has26: window.PROCORE_MATCHES?.has(26) || false,
  //   has47: window.PROCORE_MATCHES?.has(47) || false,
  //   entry26: window.PROCORE_MATCHES?.get(26) ? 'EXISTS' : 'null',
  //   entry47: window.PROCORE_MATCHES?.get(47) ? 'EXISTS' : 'null',
  //   allKeys: window.PROCORE_MATCHES ? Array.from(window.PROCORE_MATCHES.keys()).slice(0, 5) : []
  // });
  
  // Rebuild Procore matches if not already done (in case PROCORE_MATCHES wasn't initialized)
  // NOTE: This should rarely be needed since syncEstimatedConstructionStartDateFromProcore() should populate it
  // But if it's empty, rebuild it with the same format as the main sync function
  if (!window.PROCORE_MATCHES || window.PROCORE_MATCHES.size === 0) {
    if (window.PROCORE_DATA && window.PROCORE_DATA.length > 0 && window.PROJECTS_DATA && window.PROJECTS_DATA.length > 0) {
      window.PROCORE_MATCHES = new Map();
      for (const procoreProject of window.PROCORE_DATA) {
        const procoreName = (procoreProject.name || '').trim();
        if (!procoreName) continue;
        
        // Find matching project using fuzzy matching
        let bestMatch = null;
        let bestMatchScore = 0;
        
        for (const proj of window.PROJECTS_DATA) {
          const projName = (proj.ProjectName || '').trim();
          if (!projName) continue;
          
          const matches = fuzzyMatchProjectName(projName, procoreName);
          if (matches) {
            const projLower = projName.toLowerCase();
            const procoreLower = procoreName.toLowerCase();
            let score = 25;
            if (projLower === procoreLower) {
              score = 100;
            } else if (projLower.includes(procoreLower) || procoreLower.includes(projLower)) {
              score = 50;
            }
            
            if (score > bestMatchScore) {
              bestMatchScore = score;
              bestMatch = proj;
            }
          }
        }
        
        if (bestMatch) {
          // Use Number format to match the main sync function
          const projectId = Number(bestMatch.ProjectId || bestMatch.Row);
          
          // Determine completion date (same logic as main sync)
          let completionDate = null;
          const todayForCompletion = new Date();
          todayForCompletion.setHours(0, 0, 0, 0);
          
          if (procoreProject.projectedfinishdate) {
            let projectedDate = new Date(procoreProject.projectedfinishdate);
            projectedDate.setHours(0, 0, 0, 0);
            if (projectedDate >= todayForCompletion) {
              completionDate = procoreProject.projectedfinishdate;
            }
          }
          
          if (!completionDate && procoreProject.actualcompletiondate) {
            completionDate = procoreProject.actualcompletiondate;
          }
          
          // Store with same format as main sync function
          window.PROCORE_MATCHES.set(projectId, {
            hasProcore: true,
            actualStartDate: procoreProject.actualstartdate || null,
            actualCompletionDate: procoreProject.actualcompletiondate || null,
            projectedFinishDate: procoreProject.projectedfinishdate || null,
            completionDate: completionDate,
            city: procoreProject.city || null,
            state: procoreProject.state || null,
            region: procoreProject.region || null,
            address: procoreProject.address || null,
            isActual: !!procoreProject.actualstartdate
          });
        }
      }
    }
  }
  
  // Load regions and product types
  await loadRegionsAndProductTypes();
  
  const container = $("#dealPipelineTableContainer");
  if (!container) return;
  
  // Get all projects (deals)
  const projects = window.PROJECTS_DATA || [];
  
  if (projects.length === 0) {
    container.innerHTML = "<div class='empty'>No deals found</div>";
    return;
  }
  
  // Exact options for dropdowns as specified
  const stageOptions = [
    "Prospective",
    "Under Contract",
    "Under Construction",
    "Lease-Up",
    "Stabilized",
    "Liquidated",
    "Other",
    "Dead"
  ];
  
  // Get region names from API data
  const regionOptions = regionsData.map(r => r.RegionName || r.Region).filter(Boolean);
  
  // Get product type names from API data
  const productTypeOptions = productTypesData.map(pt => pt.ProductTypeName || pt.ProductType).filter(Boolean);
  
  // Core deal attributes that can be edited (EstimatedConstructionStartDate comes from Procore, not editable)
  const coreFields = [
    { key: "ProjectName", label: "Project Name", required: true },
    { key: "City", label: "City", required: false },
    { key: "State", label: "State", required: false },
    { key: "Region", label: "Region", required: false, type: "select", options: regionOptions },
    { key: "Units", label: "Units", required: false, type: "number" },
    { key: "ProductType", label: "Product Type", required: false, type: "select", options: productTypeOptions },
    { key: "Stage", label: "Stage", required: false, type: "select", options: stageOptions }
  ];
  
  let html = `<div class="data-table deal-pipeline-table">
    <table>
      <thead>
        <tr>
          <th class="text-left" style="min-width: 200px;">Project Name</th>`;
  
  coreFields.slice(1).forEach(field => {
    html += `<th class="text-left" style="min-width: 120px;">${field.label}</th>`;
  });
  
  // Add Construction Start Date column (from Procore if available, otherwise editable)
  html += `<th class="text-left" style="min-width: 220px;">Construction Start Date</th>`;
  
  html += `<th class="text-center" style="min-width: 100px;">Actions</th>
        </tr>
      </thead>
      <tbody>`;
  
  projects.forEach(project => {
    const projectId = project.ProjectId || project.Row;
    html += `<tr data-project-id="${projectId}">`;
    
    // Project Name (editable)
    const projectNameValue = (project.ProjectName || '').toString().replace(/"/g, '&quot;');
    html += `<td class="text-left sticky">
      <input type="text" 
             id="deal-${projectId}-ProjectName" 
             data-project-id="${projectId}" 
             data-field="ProjectName"
             data-original="${projectNameValue}"
             value="${projectNameValue}"
             class="form-input deal-pipeline-input"
             required
             placeholder="Required" 
             style="font-weight: 600;" />
    </td>`;
    
    // Check if this project has Procore data
    // Try to get procoreMatch with both number and string keys (projectId might be stored as number)
    let procoreMatch = window.PROCORE_MATCHES?.get(projectId);
    if (!procoreMatch && projectId) {
      const projectIdNum = Number(projectId);
      if (!isNaN(projectIdNum)) {
        procoreMatch = window.PROCORE_MATCHES?.get(projectIdNum);
      }
      if (!procoreMatch) {
        procoreMatch = window.PROCORE_MATCHES?.get(String(projectId));
      }
    }
    
    // If still not found, try to find by project name (fallback)
    if (!procoreMatch && project.ProjectName && window.PROCORE_MATCHES) {
      // This is a fallback - we'll try to match by name if ID lookup fails
      // This shouldn't be necessary but helps with edge cases
      const projectNameLower = project.ProjectName.toLowerCase();
      for (const [key, match] of window.PROCORE_MATCHES.entries()) {
        // We can't match by name directly, but we can check if the projectId matches in any format
        const keyNum = Number(key);
        const keyStr = String(key);
        if (keyNum === Number(projectId) || keyStr === String(projectId) || key === projectId) {
          procoreMatch = match;
          break;
        }
      }
    }
    
    // Debug logging for projects that should have Procore data
    if (project.ProjectName && (project.ProjectName.includes('Bluebonnet') || project.ProjectName.includes('Settlers'))) {
      // Try all possible lookups
      const projectIdNum = Number(projectId);
      const projectIdStr = String(projectId);
      const lookup1 = window.PROCORE_MATCHES?.get(projectId);
      const lookup2 = window.PROCORE_MATCHES?.get(projectIdNum);
      const lookup3 = window.PROCORE_MATCHES?.get(projectIdStr);
      
      // Also try to find by iterating through all entries
      let foundMatch = null;
      let foundKey = null;
      if (window.PROCORE_MATCHES) {
        for (const [key, value] of window.PROCORE_MATCHES.entries()) {
          const keyNum = Number(key);
          const keyStr = String(key);
          if (keyNum === projectIdNum || keyStr === projectIdStr || key === projectId || 
              keyNum === projectId || keyStr === String(projectIdNum)) {
            foundMatch = value;
            foundKey = key;
            break;
          }
        }
      }
      
      // Check if Bluebonnet (26) exists in the map
      // const bluebonnetCheck = project.ProjectName.includes('Bluebonnet') ? 
      //   window.PROCORE_MATCHES?.get(26) || window.PROCORE_MATCHES?.get('26') : null;
      
      // console.log(`🔍 DEBUG Deal Pipeline for ${project.ProjectName}:`, {
      //   projectId,
      //   projectIdType: typeof projectId,
      //   projectIdNum,
      //   projectIdStr,
      //   lookup1: lookup1 ? 'FOUND' : 'null',
      //   lookup2: lookup2 ? 'FOUND' : 'null',
      //   lookup3: lookup3 ? 'FOUND' : 'null',
      //   foundMatch: foundMatch ? 'FOUND' : 'null',
      //   foundKey: foundKey,
      //   bluebonnetCheck: bluebonnetCheck ? 'EXISTS' : 'null',
      //   procoreMatch: procoreMatch ? {
      //     hasProcore: procoreMatch.hasProcore,
      //     city: procoreMatch.city,
      //     state: procoreMatch.state,
      //     region: procoreMatch.region,
      //     actualStartDate: procoreMatch.actualStartDate
      //   } : null,
      //   allKeys: window.PROCORE_MATCHES ? Array.from(window.PROCORE_MATCHES.keys()).slice(0, 10).map(k => ({key: k, type: typeof k})) : [],
      //   hasKey26: window.PROCORE_MATCHES ? (window.PROCORE_MATCHES.has(26) || window.PROCORE_MATCHES.has('26')) : false,
      //   entry26: window.PROCORE_MATCHES ? (window.PROCORE_MATCHES.get(26) || window.PROCORE_MATCHES.get('26')) : null
      // });
      
      // Use foundMatch if procoreMatch is still null
      if (!procoreMatch && foundMatch) {
        procoreMatch = foundMatch;
        // console.log(`  ✓ Using foundMatch for ${project.ProjectName} with key ${foundKey}`);
      }
    }
    
    // Final fallback: if still not found, try one more comprehensive search
    if (!procoreMatch && projectId && window.PROCORE_MATCHES) {
      const projectIdNum = Number(projectId);
      // Try every possible key format
      for (const [key, value] of window.PROCORE_MATCHES.entries()) {
        const keyNum = typeof key === 'number' ? key : Number(key);
        const keyStr = String(key);
        if (!isNaN(keyNum) && keyNum === projectIdNum) {
          procoreMatch = value;
          // console.log(`  ✓ Found match for ${project.ProjectName} using comprehensive search with key ${key} (${typeof key})`);
          break;
        }
      }
    }
    
    // CRITICAL: If still null for Bluebonnet, force a direct lookup and log everything
    if (!procoreMatch && project.ProjectName && project.ProjectName.includes('Bluebonnet')) {
      console.error(`❌ CRITICAL: Bluebonnet procoreMatch is still null after all lookups!`);
      console.error(`  projectId: ${projectId} (${typeof projectId})`);
      console.error(`  PROCORE_MATCHES size: ${window.PROCORE_MATCHES?.size || 0}`);
      console.error(`  All keys in PROCORE_MATCHES:`, window.PROCORE_MATCHES ? Array.from(window.PROCORE_MATCHES.keys()) : []);
      console.error(`  Direct get(26):`, window.PROCORE_MATCHES?.get(26));
      console.error(`  Direct get('26'):`, window.PROCORE_MATCHES?.get('26'));
      console.error(`  Direct has(26):`, window.PROCORE_MATCHES?.has(26));
      
      // Try to find ANY entry that might be Bluebonnet by matching city/state/region
      if (window.PROCORE_MATCHES) {
        for (const [key, value] of window.PROCORE_MATCHES.entries()) {
          if (value.city === 'Baton Rouge' && value.state === 'Louisiana' && value.region === 'Gulf Coast') {
            console.error(`  Found potential Bluebonnet match with key ${key} (${typeof key}):`, value);
            procoreMatch = value;
            break;
          }
        }
      }
    }
    
    // Check if Procore data exists (must have actual values, not just empty strings)
    const hasProcoreCity = procoreMatch?.city && String(procoreMatch.city).trim() !== '' && procoreMatch.city !== 'N/A';
    const hasProcoreState = procoreMatch?.state && String(procoreMatch.state).trim() !== '' && procoreMatch.state !== 'N/A';
    const hasProcoreRegion = procoreMatch?.region && String(procoreMatch.region).trim() !== '' && procoreMatch.region !== 'N/A';
    const hasProcoreStartDate = procoreMatch?.actualStartDate && String(procoreMatch.actualStartDate).trim() !== '';
    const isActualStartDate = procoreMatch?.isActual;
    
    // Editable core fields
    coreFields.slice(1).forEach(field => {
      const value = project[field.key] || '';
      const fieldId = `deal-${projectId}-${field.key}`;
      const inputType = field.type || 'text';
      let inputValue = value;
      
      // Check if this field should be read-only (City/State/Region from Procore)
      const isReadOnly = (field.key === 'City' && hasProcoreCity) || 
                        (field.key === 'State' && hasProcoreState) ||
                        (field.key === 'Region' && hasProcoreRegion);
      
      if (inputType === 'date' && value) {
        // Format date for input field
        if (value.includes('T')) {
          inputValue = value.split('T')[0];
        } else {
          inputValue = value;
        }
      }
      
      html += `<td class="text-left">`;
      
      if (isReadOnly) {
        // Display read-only value with Procore indicator
        // For Region, show the Procore value if available, otherwise show DB value
        const displayValue = (field.key === 'Region' && hasProcoreRegion) 
          ? (procoreMatch.region || value || '—')
          : (value || '—');
        html += `<span style="opacity: 0.7; font-style: italic;" title="From Procore (read-only)">${displayValue} <small>(from Procore)</small></span>`;
      } else {
        // Render dropdown for select fields
        if (inputType === 'select' && field.options) {
          html += `<select 
                 id="${fieldId}" 
                 data-project-id="${projectId}" 
                 data-field="${field.key}"
                 data-original="${(value || '').toString().replace(/"/g, '&quot;')}"
                 class="form-input deal-pipeline-input deal-pipeline-select"
                 ${field.required ? 'required' : ''}>
            <option value="">Select ${field.label}...</option>`;
          
          field.options.forEach(option => {
            const optionValue = String(option || '');
            const isSelected = optionValue === String(value || '');
            html += `<option value="${optionValue.replace(/"/g, '&quot;')}" ${isSelected ? 'selected' : ''}>${optionValue}</option>`;
          });
          
          html += `</select>`;
        } else {
          // Render regular input for other field types
          html += `<input type="${inputType}" 
                 id="${fieldId}" 
                 data-project-id="${projectId}" 
                 data-field="${field.key}"
                 data-original="${(value || '').toString().replace(/"/g, '&quot;')}"
                 value="${(inputValue || '').toString().replace(/"/g, '&quot;')}"
                 class="form-input deal-pipeline-input"
                 ${field.required ? 'required' : ''}
                 placeholder="${field.required ? 'Required' : 'Optional'}" />`;
        }
      }
      
      html += `</td>`;
    });
    
    // Construction Start Date (from Procore if available, otherwise editable)
    const estimatedStartDate = project.EstimatedConstructionStartDate || '';
    let displayDate = ''; // Use empty string for date inputs (not "—")
    let displayDateText = '—'; // For display text
    let dateLabel = '';
    
    if (estimatedStartDate) {
      if (estimatedStartDate.includes('T')) {
        displayDate = estimatedStartDate.split('T')[0];
        displayDateText = displayDate;
      } else {
        displayDate = estimatedStartDate;
        displayDateText = estimatedStartDate;
      }
    }
    
    if (hasProcoreStartDate) {
      // From Procore - read-only with "Actual" label
      dateLabel = isActualStartDate ? ' (Actual from Procore)' : ' (Estimated from Procore)';
      html += `<td class="text-left" style="opacity: 0.7; font-style: italic;" title="Synced from Procore${dateLabel}">
        ${displayDateText || '—'}<br><small style="font-size: 0.85em;">${isActualStartDate ? 'Actual' : 'Estimated'}</small>
      </td>`;
    } else {
      // Not in Procore - editable
      html += `<td class="text-left">
        <input type="date" 
               id="deal-${projectId}-EstimatedConstructionStartDate" 
               data-project-id="${projectId}" 
               data-field="EstimatedConstructionStartDate"
               data-original="${(estimatedStartDate || '').toString().replace(/"/g, '&quot;')}"
               value="${displayDate}"
               class="form-input deal-pipeline-input"
               placeholder="Enter estimated date" />
        <br><small style="font-size: 0.85em; opacity: 0.7;">Estimated (manual)</small>
      </td>`;
    }
    
    // Actions column
    html += `<td class="text-center">
      <button class="btn btn-sm save-deal-btn" 
              onclick="saveDealPipelineChanges(${projectId})"
              disabled
              data-project-id="${projectId}">
        Save
      </button>
      <button class="btn btn-xs btn-danger" 
              onclick="deleteDealConfirm(${projectId})"
              data-project-id="${projectId}"
              style="margin-left: 8px; opacity: 0.6; font-size: 11px; padding: 4px 8px;"
              title="Delete this deal (permanent)">
        ×
      </button>
    </td>`;
    
    html += `</tr>`;
  });
  
  html += `</tbody>
    </table>
  </div>`;
  
  container.innerHTML = html;
  
  // Update result count
  const resultCount = $("#dealPipelineResultCount");
  if (resultCount) {
    resultCount.textContent = `${projects.length} ${projects.length === 1 ? 'deal' : 'deals'}`;
  }
  
  // Bind change listeners to track changes
  bindDealPipelineInputs();
  
  // Setup exit button
  const exitBtn = $("#exitDealPipelineBtn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      exitDealPipeline();
    });
  }
  
  // Setup search filter (after table is rendered)
  setupDealPipelineSearch();
  
  // Tab switching removed (Reference Data tab removed)
}

// Setup search filter for deal pipeline
function setupDealPipelineSearch() {
  const searchInput = $("#dealPipelineSearch");
  if (!searchInput) return;
  
  // Clear any existing listeners
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);
  
  // Add input event listener for real-time filtering
  newSearchInput.addEventListener("input", (e) => {
    const searchTerm = (e.target.value || '').trim().toLowerCase();
    filterDealPipelineTable(searchTerm);
  });
  
  // Add clear button on focus
  newSearchInput.addEventListener("focus", () => {
    if (newSearchInput.value) {
      // Show clear button or allow ESC to clear
    }
  });
}

// Filter deal pipeline table based on search term
function filterDealPipelineTable(searchTerm) {
  const table = document.querySelector('.deal-pipeline-table table');
  if (!table) return;
  
  const rows = table.querySelectorAll('tbody tr');
  let visibleCount = 0;
  
  if (!searchTerm) {
    // Show all rows
    rows.forEach(row => {
      row.style.display = '';
      visibleCount++;
    });
  } else {
    // Filter rows based on search term
    rows.forEach(row => {
      const projectId = row.dataset.projectId;
      if (!projectId) {
        row.style.display = 'none';
        return;
      }
      
      // Get all text content from the row
      const cells = row.querySelectorAll('td');
      let rowText = '';
      cells.forEach(cell => {
        // Get text from inputs, selects, or text content
        const input = cell.querySelector('input, select');
        if (input) {
          rowText += (input.value || '').toLowerCase() + ' ';
        } else {
          rowText += (cell.textContent || '').toLowerCase() + ' ';
        }
      });
      
      // Check if search term matches
      if (rowText.includes(searchTerm)) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });
  }
  
  // Update result count
  const resultCount = $("#dealPipelineResultCount");
  if (resultCount) {
    const totalCount = rows.length;
    if (searchTerm) {
      resultCount.textContent = `${visibleCount} of ${totalCount} deals`;
    } else {
      resultCount.textContent = `${totalCount} ${totalCount === 1 ? 'deal' : 'deals'}`;
    }
  }
}

// Setup Deal Pipeline tab switching (using event delegation)
function setupDealPipelineTabs() {
  // Use event delegation to avoid issues with multiple listeners
  const tabsContainer = document.querySelector('.deal-pipeline-tabs');
  if (!tabsContainer) return;
  
  // Remove any existing listeners by using a named function we can remove
  if (window._dealPipelineTabHandler) {
    tabsContainer.removeEventListener('click', window._dealPipelineTabHandler);
  }
  
  // Create a named handler function
  window._dealPipelineTabHandler = (e) => {
    const tab = e.target.closest('.deal-pipeline-tab');
    if (tab && !tab.disabled && !e.target.closest('button, a, input, select')) {
      const tabName = tab.dataset.pipelineTab;
      if (tabName) {
        switchDealPipelineTab(tabName);
      }
    }
  };
  
  // Add the event listener
  tabsContainer.addEventListener('click', window._dealPipelineTabHandler);
}

// Switch Deal Pipeline tabs (Reference Data tab removed)
function switchDealPipelineTab(tabName) {
  $$('.deal-pipeline-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.pipelineTab === tabName) {
      tab.classList.add('active');
    }
  });
  
  $$('.deal-pipeline-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  if (tabName === 'deals') {
    const dealsTab = $('#deal-pipeline-deals-tab');
    if (dealsTab) {
      dealsTab.style.display = '';
    }
    renderDealPipeline();
  }
  // Reference Data tab removed
}

// Render Reference Data tables (Regions and Product Types)
async function renderReferenceData() {
  await loadRegionsAndProductTypes();
  renderRegionsTable();
  renderProductTypesTable();
}

// Render Regions table
function renderRegionsTable() {
  const container = $("#regionsTableContainer");
  if (!container) return;
  
  if (regionsData.length === 0) {
    container.innerHTML = "<div class='empty'>No regions found. Click 'Add Region' to create one.</div>";
    return;
  }
  
  let html = `<div class="data-table">
    <table>
      <thead>
        <tr>
          <th class="text-left">Region Name</th>
          <th class="text-center">Display Order</th>
          <th class="text-center">Actions</th>
        </tr>
      </thead>
      <tbody>`;
  
  regionsData.forEach(region => {
    const regionName = (region.RegionName || region.Region || '—').replace(/'/g, "&#39;");
    html += `<tr data-region-id="${region.RegionId}">
      <td class="text-left"><strong>${region.RegionName || region.Region || '—'}</strong></td>
      <td class="text-center">${region.DisplayOrder != null ? region.DisplayOrder : '—'}</td>
      <td class="text-center">
        <button class="btn btn-sm" onclick="window.showEditRegionModal(${region.RegionId})" style="margin-right: 8px;">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteRegionConfirm(${region.RegionId}, '${regionName}')">Delete</button>
      </td>
    </tr>`;
  });
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Render Product Types table
function renderProductTypesTable() {
  const container = $("#productTypesTableContainer");
  if (!container) return;
  
  if (productTypesData.length === 0) {
    container.innerHTML = "<div class='empty'>No product types found. Click 'Add Product Type' to create one.</div>";
    return;
  }
  
  let html = `<div class="data-table">
    <table>
      <thead>
        <tr>
          <th class="text-left">Product Type Name</th>
          <th class="text-center">Display Order</th>
          <th class="text-center">Actions</th>
        </tr>
      </thead>
      <tbody>`;
  
  productTypesData.forEach(productType => {
    const productTypeName = (productType.ProductTypeName || productType.ProductType || '—').replace(/'/g, "&#39;");
    html += `<tr data-product-type-id="${productType.ProductTypeId}">
      <td class="text-left"><strong>${productType.ProductTypeName || productType.ProductType || '—'}</strong></td>
      <td class="text-center">${productType.DisplayOrder != null ? productType.DisplayOrder : '—'}</td>
      <td class="text-center">
        <button class="btn btn-sm" onclick="window.showEditProductTypeModal(${productType.ProductTypeId})" style="margin-right: 8px;">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteProductTypeConfirm(${productType.ProductTypeId}, '${productTypeName}')">Delete</button>
      </td>
    </tr>`;
  });
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// Bind input change listeners for deal pipeline
function bindDealPipelineInputs() {
  $$('.deal-pipeline-input').forEach(input => {
    // Remove existing listeners by cloning
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    // Use 'change' event for select elements, 'input' for text inputs
    const eventType = newInput.tagName === 'SELECT' ? 'change' : 'input';
    
    newInput.addEventListener(eventType, () => {
      const projectId = newInput.dataset.projectId;
      const fieldKey = newInput.dataset.field;
      const originalValue = newInput.dataset.original || '';
      const currentValue = newInput.value;
      
      // Find the save button for this row
      const saveBtn = document.querySelector(`.save-deal-btn[data-project-id="${projectId}"]`);
      if (saveBtn) {
        // Check if any field in this row has changed
        const row = newInput.closest('tr');
        const hasChanges = Array.from(row.querySelectorAll('.deal-pipeline-input')).some(inp => {
          const orig = inp.dataset.original || '';
          return inp.value !== orig;
        });
        
        saveBtn.disabled = !hasChanges;
        if (hasChanges) {
          saveBtn.classList.add('has-changes');
    } else {
          saveBtn.classList.remove('has-changes');
        }
      }
    });
  });
}

// Save deal pipeline changes with validation (make globally accessible)
window.saveDealPipelineChanges = async function(projectId) {
  if (!isAdmin() || !globalEditMode) {
    alert('Admin access required to save deal pipeline changes.');
    return;
  }
  
  const row = document.querySelector(`tr[data-project-id="${projectId}"]`);
  if (!row) return;
  
  // Check if this project has Procore data
  // Try to get procoreMatch with both number and string keys (projectId might be stored as number)
  let procoreMatch = window.PROCORE_MATCHES?.get(projectId);
  if (!procoreMatch && projectId) {
    const projectIdNum = Number(projectId);
    if (!isNaN(projectIdNum)) {
      procoreMatch = window.PROCORE_MATCHES?.get(projectIdNum);
    }
    if (!procoreMatch) {
      procoreMatch = window.PROCORE_MATCHES?.get(String(projectId));
    }
  }
  const hasProcoreCity = procoreMatch?.city;
  const hasProcoreState = procoreMatch?.state;
  const hasProcoreRegion = procoreMatch?.region;
  const hasProcoreStartDate = procoreMatch?.actualStartDate;
  
  // Collect all changed fields
  const inputs = row.querySelectorAll('.deal-pipeline-input');
  const changes = {};
  const validationErrors = [];
  
  inputs.forEach(input => {
    const fieldKey = input.dataset.field;
    
    // Skip Location field completely - don't even process it
    if (!fieldKey || fieldKey.toLowerCase() === 'location') {
      return; // Skip Location field entirely
    }
    
    // Skip fields that are not in PROJECT_FIELD_MAP
    if (!PROJECT_FIELD_MAP[fieldKey]) {
      return; // Skip this field
    }
    
    // Skip City/State/Region if they come from Procore (read-only)
    if ((fieldKey === 'City' && hasProcoreCity) || 
        (fieldKey === 'State' && hasProcoreState) ||
        (fieldKey === 'Region' && hasProcoreRegion)) {
      console.log(`Skipping ${fieldKey} - comes from Procore (read-only)`);
      return; // Skip this field
    }
    
    // Skip EstimatedConstructionStartDate if it comes from Procore (read-only)
    if (fieldKey === 'EstimatedConstructionStartDate' && hasProcoreStartDate) {
      console.log(`Skipping EstimatedConstructionStartDate - comes from Procore (read-only)`);
      return; // Skip this field
    }
    
    const originalValue = input.dataset.original || '';
    const currentValue = input.value.trim();
    
    if (currentValue !== originalValue) {
      // Validate required fields
      if (fieldKey === 'ProjectName' && !currentValue) {
        validationErrors.push('Project Name is required');
      }
      
      // Get the mapped field name
      const mappedField = PROJECT_FIELD_MAP[fieldKey];
      
      // Double-check: skip if mapped field is Location (case-insensitive)
      if (mappedField && mappedField.toLowerCase() === 'location') {
        console.warn('Skipping Location field:', fieldKey, mappedField);
        return;
      }
      
      // Type conversion
      if (fieldKey === 'Units') {
        changes[mappedField] = currentValue ? parseInt(currentValue, 10) : null;
      } else if (fieldKey.includes('Date')) {
        changes[mappedField] = currentValue || null;
    } else {
        changes[mappedField] = currentValue || null;
      }
    }
  });
  
  // Show validation errors
  if (validationErrors.length > 0) {
    alert('Validation errors:\n' + validationErrors.join('\n'));
    return;
  }
  
  // Final safety check: Filter out Location from changes object (case-insensitive)
  const filteredChanges = {};
  for (const key in changes) {
    const lowerKey = key.toLowerCase();
    if (lowerKey !== 'location' && !lowerKey.includes('location')) {
      filteredChanges[key] = changes[key];
    } else {
      console.warn('Filtered out Location key from changes:', key);
    }
  }
  
  // Debug: Log what we're about to send
  console.log('Sending changes to API:', filteredChanges);
  console.log('Keys being sent:', Object.keys(filteredChanges));
  
  // Final safety: Remove Location one more time just before sending
  if ('Location' in filteredChanges) delete filteredChanges.Location;
  if ('location' in filteredChanges) delete filteredChanges.location;
  if ('LOCATION' in filteredChanges) delete filteredChanges.LOCATION;
  
  // Check for any key containing "location" (case-insensitive)
  const finalFiltered = {};
  for (const key in filteredChanges) {
    if (key.toLowerCase().indexOf('location') === -1) {
      finalFiltered[key] = filteredChanges[key];
    } else {
      console.error('WARNING: Found Location key that should have been filtered:', key);
    }
  }
  
  if (Object.keys(finalFiltered).length === 0) {
    alert('No changes to save.');
    return;
  }
  
  // Show confirmation with warning
  const changeCount = Object.keys(finalFiltered).length;
  const projectName = row.querySelector('td:first-child strong')?.textContent || 'this deal';
  const confirmMessage = `⚠️ WARNING: You are about to update ${changeCount} core attribute(s) for "${projectName}".\n\n` +
    `These changes will affect this deal across ALL departments.\n\n` +
    `Are you absolutely sure you want to proceed?`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  // Double confirmation
  if (!confirm('This is your final confirmation. Changes will be saved immediately. Continue?')) {
    return;
  }
  
  // Final check before sending - create a completely clean object
  const cleanPayload = {};
  for (const key in finalFiltered) {
    const lowerKey = key.toLowerCase();
    // Absolutely no Location in any form
    if (lowerKey !== 'location' && !lowerKey.includes('location')) {
      cleanPayload[key] = finalFiltered[key];
    } else {
      console.error('CRITICAL: Location key found in finalFiltered:', key);
    }
  }
  
  // One more pass to ensure no Location
  const ultraCleanPayload = {};
  const allowedFields = ['ProjectName', 'City', 'State', 'Region', 'Units', 'ProductType', 'Stage', 'EstimatedConstructionStartDate'];
  for (const key of allowedFields) {
    if (cleanPayload.hasOwnProperty(key)) {
      ultraCleanPayload[key] = cleanPayload[key];
    }
  }
  
  console.log('Final payload being sent to API:', ultraCleanPayload);
  console.log('Payload keys:', Object.keys(ultraCleanPayload));
  
  if (Object.keys(ultraCleanPayload).length === 0) {
    alert('No valid changes to save.');
    return;
  }
  
  try {
    await updateProject(projectId, ultraCleanPayload);
    
    // Update original values in dataset
    inputs.forEach(input => {
      if (ultraCleanPayload[PROJECT_FIELD_MAP[input.dataset.field]] !== undefined) {
        input.dataset.original = input.value;
      }
    });
    
    // Disable save button
    const saveBtn = row.querySelector('.save-deal-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.remove('has-changes');
    }
    
    showSuccessMessage(`Core deal attributes updated successfully for "${projectName}"!`);
    
    // Reload page after a delay to show success message
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error("Error saving deal pipeline changes:", error);
    alert(`Error: ${error.message}`);
  }
}

// Show Add Deal Modal
window.showAddDealModal = function() {
  if (!isAdmin() || !globalEditMode) {
    alert('Admin access required to add deals.');
    return;
  }
  
  const modal = $("#addDealModal");
  const form = $("#addDealForm");
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  
  // Populate region dropdown
  const regionSelect = $("#newDealRegion");
  if (regionSelect) {
    regionSelect.innerHTML = '<option value="">-- Select Region --</option>';
    const regionOptions = regionsData.map(r => r.RegionName || r.Region).filter(Boolean);
    regionOptions.forEach(region => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      regionSelect.appendChild(option);
    });
  }
  
  // Populate product type dropdown
  const productTypeSelect = $("#newDealProductType");
  if (productTypeSelect) {
    productTypeSelect.innerHTML = '<option value="">-- Select Product Type --</option>';
    const productTypeOptions = productTypesData.map(pt => pt.ProductTypeName || pt.ProductType).filter(Boolean);
    productTypeOptions.forEach(productType => {
      const option = document.createElement("option");
      option.value = productType;
      option.textContent = productType;
      productTypeSelect.appendChild(option);
    });
  }
  
  // Show modal
  modal.style.display = "flex";
};

// Setup Add Deal Modal
function setupAddDealModal() {
  const modal = $("#addDealModal");
  const form = $("#addDealForm");
  const cancelBtn = $("#cancelAddDealModalBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!isAdmin() || !globalEditMode) {
      alert('Admin access required to add deals.');
      return;
    }
    
    const projectName = $("#newDealProjectName").value.trim();
    if (!projectName) {
      alert("Project Name is required");
      return;
    }
    
    const newDealData = {
      ProjectName: projectName,
      City: $("#newDealCity").value.trim() || null,
      State: $("#newDealState").value.trim() || null,
      Region: $("#newDealRegion").value || null,
      Units: $("#newDealUnits").value ? parseInt($("#newDealUnits").value, 10) : null,
      ProductType: $("#newDealProductType").value || null,
      Stage: $("#newDealStage").value || null
      // Note: EstimatedConstructionStartDate is synced from Procore automatically, not set manually
    };
    
    try {
      await createProject(newDealData);
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      showSuccessMessage(`Deal "${projectName}" added successfully!`);
      
      // Reload page after a delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Error adding deal:", error);
      alert(`Error: ${error.message}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  });
}

// Delete Deal with Confirmation Modal
window.deleteDealConfirm = function(projectId) {
  if (!isAdmin() || !globalEditMode) {
    alert('Admin access required to delete deals.');
    return;
  }
  
  const row = document.querySelector(`tr[data-project-id="${projectId}"]`);
  if (!row) return;
  
  const projectName = row.querySelector('td:first-child strong')?.textContent || 'this deal';
  
  // Show delete confirmation modal
  const modal = document.getElementById('deleteDealModal');
  const messageEl = document.getElementById('deleteDealMessage');
  const confirmInput = document.getElementById('deleteConfirmInput');
  const confirmBtn = document.getElementById('confirmDeleteDealBtn');
  const cancelBtn = document.getElementById('cancelDeleteDealBtn');
  
  if (!modal || !messageEl || !confirmInput || !confirmBtn || !cancelBtn) {
    console.error('Delete deal modal elements not found');
    return;
  }
  
  // Set message
  messageEl.textContent = `You are about to delete the deal "${projectName}".`;
  
  // Reset input and button state
  confirmInput.value = '';
  confirmBtn.disabled = true;
  confirmBtn.style.opacity = '0.5';
  confirmBtn.style.cursor = 'not-allowed';
  
  // Show modal
  modal.style.display = 'flex';
  
  // Focus input
  setTimeout(() => confirmInput.focus(), 100);
  
  // Handle input change - enable/disable delete button based on "DELETE" text
  const handleInputChange = () => {
    const inputValue = confirmInput.value.trim().toUpperCase();
    if (inputValue === 'DELETE') {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    } else {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }
  };
  
  // Handle Enter key in input
  const handleInputKeyPress = (e) => {
    if (e.key === 'Enter' && confirmInput.value.trim().toUpperCase() === 'DELETE') {
      e.preventDefault();
      confirmBtn.click();
    }
  };
  
  // Remove old listeners and add new ones
  confirmInput.removeEventListener('input', handleInputChange);
  confirmInput.removeEventListener('keypress', handleInputKeyPress);
  confirmBtn.removeEventListener('click', handleConfirmDelete);
  cancelBtn.removeEventListener('click', handleCancelDelete);
  
  confirmInput.addEventListener('input', handleInputChange);
  confirmInput.addEventListener('keypress', handleInputKeyPress);
  
  // Handle confirm button click
  function handleConfirmDelete() {
    const inputValue = confirmInput.value.trim().toUpperCase();
    if (inputValue !== 'DELETE') {
      alert('Please type "DELETE" exactly to confirm deletion.');
      return;
    }
    
    // Hide modal
    modal.style.display = 'none';
    
    // Clean up listeners
    confirmInput.removeEventListener('input', handleInputChange);
    confirmInput.removeEventListener('keypress', handleInputKeyPress);
    confirmBtn.removeEventListener('click', handleConfirmDelete);
    cancelBtn.removeEventListener('click', handleCancelDelete);
    
    // Proceed with deletion
    deleteDeal(projectId);
  }
  
  // Handle cancel button click
  function handleCancelDelete() {
    modal.style.display = 'none';
    
    // Clean up listeners
    confirmInput.removeEventListener('input', handleInputChange);
    confirmInput.removeEventListener('keypress', handleInputKeyPress);
    confirmBtn.removeEventListener('click', handleConfirmDelete);
    cancelBtn.removeEventListener('click', handleCancelDelete);
  }
  
  confirmBtn.addEventListener('click', handleConfirmDelete);
  cancelBtn.addEventListener('click', handleCancelDelete);
  
  // Close modal when clicking outside
  const handleModalClick = (e) => {
    if (e.target === modal) {
      handleCancelDelete();
      modal.removeEventListener('click', handleModalClick);
    }
  };
  modal.addEventListener('click', handleModalClick);
};

// Delete Deal
async function deleteDeal(projectId) {
  try {
    await deleteProject(projectId);
    
    showSuccessMessage("Deal deleted successfully!");
    
    // Reload page after a delay to show success message
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  } catch (error) {
    console.error("Error deleting deal:", error);
    alert(`Error: ${error.message}`);
  }
}

// Setup Reference Data Modals (Regions and Product Types)
function setupReferenceDataModals() {
  // Region Modal
  const regionForm = $("#regionForm");
  const cancelRegionBtn = $("#cancelRegionModalBtn");
  
  if (regionForm) {
    regionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const regionId = $("#regionId")?.value;
      const data = {
        RegionName: $("#regionName")?.value.trim(),
        DisplayOrder: $("#regionDisplayOrder")?.value ? parseInt($("#regionDisplayOrder").value, 10) : null,
        Notes: $("#regionNotes")?.value.trim() || null
      };
      
      if (!data.RegionName) {
        alert('Region Name is required');
        return;
      }
      
      try {
        if (regionId) {
          await updateRegion(parseInt(regionId, 10), data);
          showSuccessMessage('Region updated successfully!');
    } else {
          await createRegion(data);
          showSuccessMessage('Region created successfully!');
        }
        hideRegionModal();
        await renderReferenceData();
        await loadRegionsAndProductTypes();
        if (document.querySelector('.deal-pipeline-tab.active')?.dataset.pipelineTab === 'deals') {
          renderDealPipeline();
        }
      } catch (error) {
        console.error('Error saving region:', error);
        alert(`Error: ${error.message}`);
      }
    });
  }
  
  if (cancelRegionBtn) {
    cancelRegionBtn.addEventListener('click', hideRegionModal);
  }
  
  // Product Type Modal
  const productTypeForm = $("#productTypeForm");
  const cancelProductTypeBtn = $("#cancelProductTypeModalBtn");
  
  if (productTypeForm) {
    productTypeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productTypeId = $("#productTypeId")?.value;
      const data = {
        ProductTypeName: $("#productTypeName")?.value.trim(),
        DisplayOrder: $("#productTypeDisplayOrder")?.value ? parseInt($("#productTypeDisplayOrder").value, 10) : null,
        Notes: $("#productTypeNotes")?.value.trim() || null
      };
      
      if (!data.ProductTypeName) {
        alert('Product Type Name is required');
        return;
      }
      
      try {
        if (productTypeId) {
          await updateProductType(parseInt(productTypeId, 10), data);
          showSuccessMessage('Product Type updated successfully!');
    } else {
          await createProductType(data);
          showSuccessMessage('Product Type created successfully!');
        }
        hideProductTypeModal();
        await renderReferenceData();
        await loadRegionsAndProductTypes();
        if (document.querySelector('.deal-pipeline-tab.active')?.dataset.pipelineTab === 'deals') {
          renderDealPipeline();
        }
      } catch (error) {
        console.error('Error saving product type:', error);
        alert(`Error: ${error.message}`);
      }
    });
  }
  
  if (cancelProductTypeBtn) {
    cancelProductTypeBtn.addEventListener('click', hideProductTypeModal);
  }
}

// Show Add Region Modal
function showAddRegionModal() {
  const modal = $("#addRegionModal");
  const form = $("#regionForm");
  if (modal && form) {
    form.reset();
    $("#regionId").value = '';
    $("#regionModalTitle").textContent = 'Add Region';
    modal.style.display = 'flex';
  }
}

// Show Edit Region Modal
async function showEditRegionModal(regionId) {
  await loadRegionsAndProductTypes();
  const region = regionsData.find(r => r.RegionId === regionId);
  if (!region) {
    alert('Region not found');
    return;
  }
  
  const modal = $("#addRegionModal");
  const form = $("#regionForm");
  if (modal && form) {
    $("#regionId").value = regionId;
    $("#regionName").value = region.RegionName || region.Region || '';
    $("#regionDisplayOrder").value = region.DisplayOrder != null ? region.DisplayOrder : '';
    $("#regionNotes").value = region.Notes || '';
    $("#regionModalTitle").textContent = 'Edit Region';
    modal.style.display = 'flex';
  }
}

// Hide Region Modal
function hideRegionModal() {
  const modal = $("#addRegionModal");
  if (modal) {
    modal.style.display = 'none';
  }
}

// Delete Region Confirmation
async function deleteRegionConfirm(regionId, regionName) {
  if (!confirm(`Are you sure you want to delete "${regionName}"? This will deactivate the region.`)) {
    return;
  }
  
  try {
    await deleteRegion(regionId);
    showSuccessMessage('Region deleted successfully!');
    await renderReferenceData();
    await loadRegionsAndProductTypes();
    if (document.querySelector('.deal-pipeline-tab.active')?.dataset.pipelineTab === 'deals') {
      renderDealPipeline();
    }
  } catch (error) {
    console.error('Error deleting region:', error);
    alert(`Error: ${error.message}`);
  }
}

// Show Add Product Type Modal
function showAddProductTypeModal() {
  const modal = $("#addProductTypeModal");
  const form = $("#productTypeForm");
  if (modal && form) {
    form.reset();
    $("#productTypeId").value = '';
    $("#productTypeModalTitle").textContent = 'Add Product Type';
    modal.style.display = 'flex';
  }
}

// Show Edit Product Type Modal
async function showEditProductTypeModal(productTypeId) {
  await loadRegionsAndProductTypes();
  const productType = productTypesData.find(pt => pt.ProductTypeId === productTypeId);
  if (!productType) {
    alert('Product Type not found');
    return;
  }
  
  const modal = $("#addProductTypeModal");
  const form = $("#productTypeForm");
  if (modal && form) {
    $("#productTypeId").value = productTypeId;
    $("#productTypeName").value = productType.ProductTypeName || productType.ProductType || '';
    $("#productTypeDisplayOrder").value = productType.DisplayOrder != null ? productType.DisplayOrder : '';
    $("#productTypeNotes").value = productType.Notes || '';
    $("#productTypeModalTitle").textContent = 'Edit Product Type';
    modal.style.display = 'flex';
  }
}

// Hide Product Type Modal
function hideProductTypeModal() {
  const modal = $("#addProductTypeModal");
  if (modal) {
    modal.style.display = 'none';
  }
}

// Delete Product Type Confirmation
async function deleteProductTypeConfirm(productTypeId, productTypeName) {
  if (!confirm(`Are you sure you want to delete "${productTypeName}"? This will deactivate the product type.`)) {
    return;
  }
  
  try {
    await deleteProductType(productTypeId);
    showSuccessMessage('Product Type deleted successfully!');
    await renderReferenceData();
    await loadRegionsAndProductTypes();
    if (document.querySelector('.deal-pipeline-tab.active')?.dataset.pipelineTab === 'deals') {
      renderDealPipeline();
    }
  } catch (error) {
    console.error('Error deleting product type:', error);
    alert(`Error: ${error.message}`);
  }
}

function renderPropertyView() {
  // Column definitions per guide specifications
  const columns = currentView === "construction" ? [
    { key: "Property", label: "Property Name", sortable: true },
    { key: "ConstructionFinancingLender", label: "Construction Financing Lender", sortable: true },
    { key: "ConstructionLoanClosing", label: "Construction Loan Closing", sortable: true },
    { key: "ConstructionLoanAmount", label: "Construction Loan Amount", num: true, sortable: true },
    { key: "ConstructionLoanLTCOriginal", label: "Construction Loan LTC (Original)", num: true, sortable: true },
    { key: "ConstructionIOTerm", label: "Construction (I/O) Term", sortable: true },
    { key: "ConstructionIOMaturity", label: "Construction (I/O) Maturity", sortable: true },
    { key: "Index", label: "Index", sortable: true },
    { key: "Spread", label: "Spread", num: true, sortable: true },
  ] : currentView === "permanent" ? [
    { key: "Property", label: "Property Name", sortable: true },
    { key: "PermanentFinancingLender", label: "Permanent Financing Lender", sortable: true },
    { key: "PermanentFinancingCloseDate", label: "Permanent Financing Close Date", sortable: true },
    { key: "PermanentFinancingLoanAmount", label: "Permanent Financing Loan Amount", num: true, sortable: true },
    { key: "PermanentFinancingLTV", label: "Permanent Financing LTV", num: true, sortable: true },
    { key: "Term", label: "Term", sortable: true },
    { key: "MaturityDate", label: "Maturity Date", sortable: true },
    { key: "PermanentInterestRate", label: "Permanent Interest Rate", sortable: true },
  ] : [
    { key: "Property", label: "Property Name", sortable: true },
    { key: "LeadPrefGroup", label: "Lead Pref Group", sortable: true },
    { key: "FundingDate", label: "Funding Date", sortable: true },
    { key: "PrefAmount", label: "Pref Amount", num: true, sortable: true },
    { key: "CommonEquityRequirement", label: "Common Equity Requirement", num: true, sortable: true },
    { key: "InterestRate", label: "Interest Rate", sortable: true },
    { key: "AnnualMonthly", label: "Annual/Monthly", sortable: true },
    { key: "BackendKicker", label: "Back-end Kicker", sortable: true },
    { key: "PrefLastDollar", label: "Pref Last Dollar", num: true, sortable: true },
    { key: "CommonEquityLastDollar", label: "Common Equity Last Dollar", num: true, sortable: true },
  ];
  
  const f = {
    q: ($("#q")?.value || "").toLowerCase().trim(),
    statuses: selectedStatuses,
  };
  
  // Filter rows based on current view (per guide specifications)
  // console.log(`renderPropertyView: CURRENT_ROWS.length = ${CURRENT_ROWS.length}, selectedStatuses.size = ${selectedStatuses.size}, statuses =`, Array.from(selectedStatuses));
  let filtered = CURRENT_ROWS.filter(r => passFilters(r, f));
  // console.log(`renderPropertyView: After passFilters, filtered.length = ${filtered.length}`);
  
  // Render headers with sample data for auto-fit
  renderTableHeaders(columns, filtered);
  
  // View-specific filtering removed - only stage controls what shows up
  
  const sorted = applySort(filtered);
  // console.log(`renderPropertyView: sorted.length = ${sorted.length}`);
  // if (sorted.length > 0) {
  //   console.log(`renderPropertyView: First 3 rows:`, sorted.slice(0, 3).map(r => ({
  //     property: r.Property || r.ProjectName,
  //     lender: r.ConstructionFinancingLender,
  //     stage: r.Stage || r._banking?.Stage
  //   })));
  // }
  
  const tbody = $("#listBody");
  if (!tbody) return;
  
  // Get column order preference
  const viewKey = `${currentTab}-${currentView}`;
  let orderedColumns = columns;
  if (columnPreferences.order && columnPreferences.order[viewKey]) {
    const savedOrder = columnPreferences.order[viewKey];
    orderedColumns = savedOrder.map(key => columns.find(c => c.key === key)).filter(Boolean);
    // Add any new columns that weren't in saved order
    columns.forEach(col => {
      if (!orderedColumns.find(c => c.key === col.key)) {
        orderedColumns.push(col);
      }
    });
  }
  
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td class="empty" colspan="${orderedColumns.length}">No properties match your filters.</td></tr>`;
    return;
  }
  
  // Check for actual duplicate rows (same data)
  const rowSignatures = new Map();
  const duplicates = [];
  sorted.forEach((r, idx) => {
    const signature = `${r.ProjectName || r.Property}_${r.ConstructionFinancingLender}_${r.ConstructionLoanAmount}_${r.Row || idx}`;
    if (rowSignatures.has(signature)) {
      duplicates.push({ index: idx, signature, row: r, originalIndex: rowSignatures.get(signature) });
    } else {
      rowSignatures.set(signature, idx);
    }
  });
  if (duplicates.length > 0) {
    console.warn(`Found ${duplicates.length} duplicate rows in sorted data (same property + lender + amount):`, duplicates.slice(0, 5));
  }
  
  // Check for duplicate keys (same ProjectName/Property but different data)
  const keysSeen = new Map();
  const duplicateKeys = [];
  sorted.forEach((r, idx) => {
    const key = r.ProjectName || r.Property || "";
    if (key && keysSeen.has(key)) {
      duplicateKeys.push({ index: idx, key, currentRow: r, originalIndex: keysSeen.get(key) });
    } else if (key) {
      keysSeen.set(key, idx);
    }
  });
  if (duplicateKeys.length > 0) {
    console.warn(`Found ${duplicateKeys.length} rows with duplicate keys (same property name but potentially different data):`, duplicateKeys.slice(0, 5).map(d => ({
      index: d.index,
      key: d.key,
      lender: d.currentRow.ConstructionFinancingLender,
      amount: d.currentRow.ConstructionLoanAmount
    })));
  }
  
  const rowsHtml = sorted.map((r, index) => {
    const baseKey = r.ProjectName || r.Property || "";
    // Use Row ID or index to ensure uniqueness for display
    const displayKey = baseKey ? `${baseKey}_${r.Row || index}` : `row_${index}`;
    const isExpanded = expandedKeys.has(baseKey);
    const rowClass = isExpanded ? "expanded" : "";
    
    // Debug first 5 rows
    // if (index < 5) {
    //   console.log(`Row ${index}:`, {
    //     baseKey,
    //     displayKey,
    //     property: r.Property || r.ProjectName,
    //     lender: r.ConstructionFinancingLender,
    //     amount: r.ConstructionLoanAmount,
    //     stage: r.Stage || r._banking?.Stage,
    //     row: r.Row,
    //     hasBanking: !!r._banking,
    //     hasMMR: !!r._mmr,
    //     _bankingRow: r._banking?.Row,
    //     _mmrProperty: r._mmr?.Property
    //   });
    // }
    
    const cells = orderedColumns.map(col => {
      let val = "";
      // Special handling for Property column - check both Property and ProjectName
      if (col.key === "Property") {
        val = r.Property || r.ProjectName || "";
      } else {
        // Try direct property first, then check nested sources
        val = r[col.key];
        if (val === undefined || val === null || val === "") {
          // Try _banking source
          val = r._banking?.[col.key];
          if (val === undefined || val === null || val === "") {
            // Try _mmr source
            val = r._mmr?.[col.key] || "";
          }
        }
      }
      
      // Format values
      if (val == null || val === "") {
        val = "—";
      } else if (col.num && val !== "—") {
        if (col.key === "Spread" || col.key.includes("LTC") || col.key.includes("LTV") || col.key.includes("LastDollar")) {
          val = fmtPctSmart(val);
        } else if (col.key.includes("Amount") || col.key.includes("Loan")) {
          val = fmtCurrency(val);
    } else {
          val = fmtInt(val);
        }
      } else if (col.key.includes("Date") || col.key.includes("Maturity") || col.key.includes("Closing") || col.key === "FundingDate") {
        val = fmtDate(val);
      } else {
        val = String(val || "");
      }
      
      // Add IO maturity flag for ConstructionIOMaturity column
      let flagHtml = "";
      if (col.key === "ConstructionIOMaturity" && val !== "—") {
        // Check if permanent financing exists
        const hasPermanentFinancing = !!(r._permanentLoan || r.PermanentLoanAmount > 0 || r.PermanentFinancingLoanAmount > 0 || (r.PermanentFinancingLender && r.PermanentFinancingLender.trim() !== ""));
        const flag = getIOMaturityFlag(r.ConstructionIOMaturity || r.IOMaturityDate, hasPermanentFinancing);
        if (flag) {
          const titleText = flag.class.includes("transferred") 
            ? "Transferred to Permanent Financing" 
            : `IO Maturity: ${flag.days} day${flag.days !== 1 ? 's' : ''} ${flag.days < 0 ? 'overdue' : 'away'}`;
          flagHtml = ` <span class="${flag.class}" title="${titleText}">${flag.text}</span>`;
        }
      }
      
      // Get column width preference
      let columnWidth = null;
      if (columnPreferences.widths && columnPreferences.widths[col.key]) {
        columnWidth = columnPreferences.widths[col.key];
      }
      
      const widthStyle = columnWidth ? `style="width: ${columnWidth}px; min-width: ${columnWidth}px; max-width: ${columnWidth}px;"` : '';
      return `<td class="${col.num ? "num" : ""} ${col.key === "Property" ? "sticky" : ""} col-${col.key}" ${widthStyle}>${val}${flagHtml}</td>`;
    }).join("");
    
    return `
      <tr class="data-row ${rowClass}" data-key="${baseKey}" data-display-key="${displayKey}">
        ${cells}
      </tr>
      ${isExpanded ? `<tr class="detail-row"><td colspan="${columns.length}"><div class="detail"></div></td></tr>` : ""}
    `;
  }).join("");
  
  // Calculate totals for numeric columns
  const totals = {};
  columns.forEach(col => {
    if (col.num) {
      totals[col.key] = sorted.reduce((sum, r) => {
        let val = r[col.key] || 0;
        if (col.key.includes("Amount") || col.key.includes("Loan")) {
          return sum + num(val);
        } else if (col.key === "Units") {
          return sum + num(val);
        }
        return sum;
      }, 0);
    }
  });
  
  // Build total row
  const totalCells = columns.map(col => {
    if (col.key === "Property") {
      return `<td class="sticky"><strong>Total</strong></td>`;
    } else if (col.num && totals[col.key] !== undefined) {
      let val = "—";
      if (col.key.includes("Amount") || col.key.includes("Loan")) {
        val = fmtCurrency(totals[col.key]);
      } else if (col.key === "Units") {
        val = fmtInt(totals[col.key]);
      } else {
        val = "—";
      }
      return `<td class="num"><strong>${val}</strong></td>`;
    } else {
      return `<td>—</td>`;
    }
  }).join("");
  
  tbody.innerHTML = rowsHtml + `<tr class="total-row">${totalCells}</tr>`;
  
  // Add "Add Permanent Financing" button if on permanent view
  // Remove any existing button first
  const existingBtn = document.querySelector("#addPermanentFinancingBtn");
  if (existingBtn) existingBtn.remove();
  
  if (currentView === "permanent" && currentTab === "by-property") {
    const panelHead = document.querySelector("#view-by-property .panel-head");
    if (panelHead) {
      const inlineControls = panelHead.querySelector(".inline-controls");
      if (inlineControls) {
        const addBtn = document.createElement("button");
        addBtn.id = "addPermanentFinancingBtn";
        addBtn.className = "btn";
        addBtn.textContent = "+ Add Permanent Financing";
        addBtn.onclick = () => showAddPermanentFinancingModal();
        // Insert before the result count badge
        inlineControls.insertBefore(addBtn, inlineControls.firstChild);
      } else {
        // Fallback: append to panel-head if inline-controls doesn't exist
        const addBtn = document.createElement("button");
        addBtn.id = "addPermanentFinancingBtn";
        addBtn.className = "btn";
        addBtn.textContent = "+ Add Permanent Financing";
        addBtn.onclick = () => showAddPermanentFinancingModal();
        panelHead.appendChild(addBtn);
      }
    }
  }
  
  // Bind row toggle handlers
  $$(".data-row").forEach(row => {
    row.addEventListener("click", (e) => {
      // Don't toggle if clicking on a sortable header
      if (e.target.closest(".th-sort")) return;
      if (e.target.closest("button, a, input")) return;
      const key = row.dataset.key;
      if (!key) return;
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
    } else {
        expandedKeys.add(key);
      }
      renderPropertyView();
      // After rendering, find the detail row and build details
      if (expandedKeys.has(key)) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          const newRow = document.querySelector(`tr.data-row[data-key="${key}"]`);
          if (newRow) {
            const detailRow = newRow.nextElementSibling;
            if (detailRow && detailRow.classList.contains("detail-row")) {
              const detail = detailRow.querySelector(".detail");
              if (detail) {
                const rowData = sorted.find(r => (r.ProjectName || r.Property) === key);
                if (rowData) {
                  buildDetails(rowData);
                  adjustDetailWidth(detailRow);
                }
              }
            }
      }
        });
      }
    });
  });
  
  $("#resultCount").textContent = `${sorted.length} ${sorted.length === 1 ? "result" : "results"}`;
  updateKPI(sorted, currentView);
}

/* ---------- Detail View ---------- */
function adjustDetailWidth(detailRow) {
  if (!detailRow) return;
  const detail = detailRow.querySelector(".detail");
  if (!detail) return;
  
  const tableWrap = detailRow.closest(".table-wrap");
  const table = detailRow.closest("table");
  if (!tableWrap || !table) return;
  
  const tableRect = table.getBoundingClientRect();
  const leftOffset = tableRect.left;
  
  detail.style.width = "100vw";
  detail.style.marginLeft = `-${leftOffset}px`;
  
  tableWrap.classList.add("has-detail-row");
}

function buildPanes(r, editMode = false) {
  // Use global edit mode instead of parameter
  editMode = globalEditMode;
  const panes = [];
  
  // Construction Financing - only show in construction view or by-property tab (but not in equity view)
  if (currentView === "construction" || (currentTab === "by-property" && currentView !== "equity" && currentView !== "permanent")) {
    panes.push({
      id: "construction",
      label: "Construction Financing",
      content: `
        <div class="pane-grid">
          ${cell("Property Name", r.ProjectName, "ProjectName", editMode, r)}
          ${cell("Borrower", r.Borrower || r._constructionLoan?.Borrower, "Borrower", editMode, r)}
          ${cell("Loan Type", r.LoanType || r._constructionLoan?.LoanType, "LoanType", editMode, r)}
          ${cell("Loan Phase", r.LoanPhase || r._constructionLoan?.LoanPhase, "LoanPhase", editMode, r)}
          ${cell("City", r.City, "City", editMode, r)}
          ${cell("State", r.State, "State", editMode, r)}
          ${cell("Region", r.Region, "Region", editMode, r)}
          ${cell("Units", r.Units, "Units", editMode, r)}
          ${cell("Product Type", r.ProductType, "ProductType", editMode, r)}
          ${cell("Stage", r.Stage, "Stage", editMode, r)}
          ${cell("Lender", r.Lender, "Lender", editMode, r)}
          ${cell("Loan Amount", r.LoanAmount, "LoanAmount", editMode, r)}
          ${cell("Loan Closing Date", r.LoanClosingDate, "LoanClosingDate", editMode, r)}
          ${cell("IO Maturity Date", r.IOMaturityDate, "IOMaturityDate", editMode, r)}
          ${cell("Fixed or Floating", r.FixedOrFloating, "FixedOrFloating", editMode, r)}
          ${cell("Index Name", r.IndexName, "IndexName", editMode, r)}
          ${cell("Spread (BPS)", r.Spread, "Spread", editMode, r, r.IndexName && (r.IndexName.toLowerCase().includes("prime") || r.IndexName.toLowerCase().includes("sofr") || editMode))}
          ${cell("Interest Rate", r.InterestRate, "InterestRate", editMode, r, r.FixedOrFloating === "Fixed")}
          ${cell("Mini-Perm Maturity", r.MiniPermMaturity, "MiniPermMaturity", editMode, r)}
          ${cell("Mini-Perm Rate", r.MiniPermInterestRate, "MiniPermInterestRate", editMode, r)}
          ${cell("Perm Phase Maturity", r.PermPhaseMaturity || r._constructionLoan?.PermPhaseMaturity, "PermPhaseMaturity", editMode, r)}
          ${cell("Perm Phase Interest Rate", r.PermPhaseInterestRate || r._constructionLoan?.PermPhaseInterestRate, "PermPhaseInterestRate", editMode, r)}
          ${cell("Construction Completion Date", r.ConstructionCompletionDate, "ConstructionCompletionDate", editMode, r)}
          ${cell("Lease-Up Completed Date", r.LeaseUpCompletedDate, "LeaseUpCompletedDate", editMode, r)}
        </div>
      `
    });
  }
  
  // Permanent Financing - only show in permanent view or by-property tab (but not in construction or equity view)
  if (currentView === "permanent" || (currentTab === "by-property" && currentView !== "equity" && currentView !== "construction")) {
    panes.push({
      id: "permanent",
      label: "Permanent Financing",
      content: `
        <div class="pane-grid">
          ${cell("Permanent Close Date", r.PermanentCloseDate, "PermanentCloseDate", editMode, r)}
          ${cell("Permanent Loan Amount", r.PermanentLoanAmount, "PermanentLoanAmount", editMode, r)}
          ${cell("Permanent Financing Lender", r.PermanentFinancingLender, "PermanentFinancingLender", editMode, r)}
          ${cell("Maturity Date", r.MaturityDate, "MaturityDate", editMode, r)}
          ${cell("Permanent Interest Rate", r.PermanentInterestRate, "PermanentInterestRate", editMode, r)}
          ${cell("Fixed or Floating (Perm)", r._permanentLoan?.FixedOrFloating, "PermFixedOrFloating", editMode, r)}
          ${cell("Index Name (Perm)", r._permanentLoan?.IndexName, "PermIndexName", editMode, r)}
          ${cell("Spread (Perm)", r._permanentLoan?.Spread, "PermSpread", editMode, r)}
        </div>
      `
    });
  }
  
  // Bank Participations
  panes.push({
    id: "participations",
    label: "Bank Participations",
    content: buildParticipationsByBank(r.Row || r._banking?.Row, r.LoanId || r._constructionLoan?.LoanId, editMode)
  });
  
  // Covenants
  panes.push({
    id: "covenants",
    label: "Covenants",
    content: buildAllCovenants(r.Row || r._banking?.Row, r.LoanId || r._constructionLoan?.LoanId, editMode)
  });
  
  // Personal Guarantees
  panes.push({
    id: "guarantees",
    label: "Personal Guarantees",
    content: buildPersonalGuarantees(r.Row || r._banking?.Row, editMode)
  });
  
  // Equity Commitments
  panes.push({
    id: "equity",
    label: "Equity Commitments",
    content: buildEquityCommitments(r.Row || r._banking?.Row, editMode)
  });
  
  return panes;
}

function cell(label, value, fieldKey, editMode, rowData, condition = true) {
  // If condition is false, don't render the cell
  if (!condition) {
    return '';
  }
  if (editMode) {
    return cellKVEditable(label, value, fieldKey, rowData);
  }
  return cellKV(label, value, fieldKey, false, rowData);
}

function cellKV(label, value, fieldKey = null, isCoreAttribute = false, rowData = null) {
  let val = "—";
  
  if (value != null && value !== "") {
    // Format currency amounts (loan amounts, permanent loan amounts, etc.)
    if (label.includes("Amount") || label.includes("Loan Amount") || label.includes("Permanent Loan Amount")) {
      const numVal = num(value);
      val = numVal > 0 ? fmtCurrency(numVal) : "—";
    } else if (label.includes("Spread") || fieldKey === "Spread" || fieldKey === "PermSpread") {
      // Format Spread as percentage
      val = fmtPctSmart(value);
    } else if (fieldKey && (fieldKey.includes("Date") || fieldKey.includes("Maturity"))) {
      // Format dates and maturities (remove time components)
      val = fmtDate(value);
    } else if (label.includes("Date") || label.includes("Maturity")) {
      // Also check label for date/maturity fields
      val = fmtDate(value);
    } else {
      val = String(value);
    }
  }
  
  // Check if this field comes from Procore - store in data attribute for hover display
  let procoreNote = '';
  let procoreNoteText = '';
  if (rowData && window.PROCORE_MATCHES) {
    const projectId = rowData.Row || rowData.ProjectId;
    const procoreMatch = window.PROCORE_MATCHES.get(projectId);
    
    if (procoreMatch) {
      // Check which fields come from Procore
      if (fieldKey === "EstimatedConstructionStartDate" && procoreMatch.actualStartDate) {
        const isActual = procoreMatch.isActual;
        procoreNoteText = isActual ? '(actual from Procore)' : '(estimated from Procore)';
      } else if (fieldKey === "City" && procoreMatch.city) {
        procoreNoteText = '(from Procore)';
      } else if (fieldKey === "State" && procoreMatch.state) {
        procoreNoteText = '(from Procore)';
      } else if (fieldKey === "ConstructionCompletionDate" && procoreMatch.completionDate) {
        const isProjected = procoreMatch.projectedFinishDate && procoreMatch.completionDate === procoreMatch.projectedFinishDate;
        procoreNoteText = isProjected ? '(projected from Procore)' : '(from Procore)';
      }
    }
  }
  
  // Get data source for tooltip
  const dataSource = fieldKey ? getDataSource(fieldKey) : null;
  let tooltipText = dataSource || "";
  if (isCoreAttribute) {
    tooltipText = tooltipText ? `${tooltipText} - Edit in Deal Pipeline` : "Core attribute - Edit in Deal Pipeline";
  }
  const tooltipAttr = tooltipText ? `title="${tooltipText}"` : "";
  
  // Store notes in data attributes for hover display
  const coreAttributeNoteText = isCoreAttribute ? '(edit in Deal Pipeline)' : '';
  const procoreDataAttr = procoreNoteText ? `data-procore-note="${procoreNoteText}"` : '';
  const coreDataAttr = coreAttributeNoteText ? `data-core-note="${coreAttributeNoteText}"` : '';
  
  return `
    <div class="cell" ${tooltipAttr}>
      <div class="cell-label" ${procoreDataAttr} ${coreDataAttr}>${label}</div>
      <div class="cell-value" ${isCoreAttribute ? 'style="opacity: 0.7;"' : ''}>${val}</div>
    </div>
  `;
}

function cellKVEditable(label, value, fieldKey, rowData) {
  // Special handling: Lender and PermanentFinancingLender are always editable (not core attributes)
  // Skip read-only check for these fields - they use dropdowns below
  if (fieldKey !== "Lender" && fieldKey !== "PermanentFinancingLender") {
    // Check if field is a core attribute (read-only in detail view, only editable in Deal Pipeline)
    const isCoreAttribute = CORE_ATTRIBUTES.has(fieldKey);
    
    // Check if Construction Completion Date comes from Procore
    // Try multiple ways to get projectId (it might be stored as number or string)
    const projectId = rowData.Row || rowData.ProjectId;
    const projectIdNum = projectId ? Number(projectId) : null;
    const projectIdStr = projectId ? String(projectId) : null;
    
    // Try to get Procore match with both number and string keys
    // Also try all entries to find a match by project name if ID lookup fails
    let procoreMatch = window.PROCORE_MATCHES?.get(projectId);
    if (!procoreMatch && projectIdNum) {
      procoreMatch = window.PROCORE_MATCHES?.get(projectIdNum);
    }
    if (!procoreMatch && projectIdStr) {
      procoreMatch = window.PROCORE_MATCHES?.get(projectIdStr);
    }
    
    // If still no match, try to find by project name (fallback)
    if (!procoreMatch && rowData.ProjectName && window.PROCORE_MATCHES) {
      // Iterate through all matches to find one that might match by name
      for (const [pid, match] of window.PROCORE_MATCHES.entries()) {
        // This is a fallback - we'll rely on the projectId match primarily
      }
    }
    
    // Check if this project has any Procore data (for Construction Completion Date)
    const hasProcoreData = procoreMatch?.hasProcore === true;
    // Use completionDate (which is projectedfinishdate if future, otherwise actualcompletiondate)
    // OR check if there's a projectedFinishDate or actualCompletionDate
    const hasProcoreCompletionDate = !!(procoreMatch?.completionDate || 
                                        procoreMatch?.projectedFinishDate || 
                                        procoreMatch?.actualCompletionDate);
    const isProcoreCompletionDate = fieldKey === "ConstructionCompletionDate" && hasProcoreData && hasProcoreCompletionDate;
    
    // Debug for "The Waters at Robinwood"
    if (rowData.ProjectName && rowData.ProjectName.toLowerCase().includes('waters') && rowData.ProjectName.toLowerCase().includes('robinwood') && fieldKey === "ConstructionCompletionDate") {
      console.log(`🔍 DEBUG ConstructionCompletionDate for Waters at Robinwood:`, {
        projectId,
        procoreMatch,
        hasProcoreCompletionDate,
        isProcoreCompletionDate,
        fieldKey,
        value,
        allMatches: Array.from(window.PROCORE_MATCHES?.entries() || [])
      });
    }
    
    // Check if field is read-only (from MMR/Procore or core attribute)
    const isReadOnly = isCoreAttribute || 
                       isProcoreCompletionDate ||
                       READ_ONLY_FIELDS.has(fieldKey) || 
                       (!PROJECT_FIELD_MAP[fieldKey] && 
                        !LOAN_FIELD_MAP[fieldKey] && 
                        !PERMANENT_LOAN_FIELD_MAP[fieldKey] &&
                        fieldKey !== "PermFixedOrFloating" &&
                        fieldKey !== "PermIndexName" &&
                        fieldKey !== "PermSpread");
    
    if (isReadOnly) {
      // For core attributes, show as read-only with note
      if (isCoreAttribute) {
        return cellKV(label, value, fieldKey, true, rowData); // Pass true to indicate it's a core attribute, and rowData for Procore check
      }
      // For Procore fields, show with Procore indicator (grayed out, read-only)
      if (isProcoreCompletionDate) {
        // Use the procoreMatch we already found above
        const completionDateToShow = procoreMatch?.completionDate || 
                                     procoreMatch?.projectedFinishDate || 
                                     procoreMatch?.actualCompletionDate || 
                                     value;
        const isProjected = procoreMatch?.projectedFinishDate && 
                           (procoreMatch?.completionDate === procoreMatch?.projectedFinishDate ||
                            completionDateToShow === procoreMatch?.projectedFinishDate);
        const sourceNote = isProjected ? '(projected from Procore)' : '(from Procore)';
        const displayDate = completionDateToShow ? fmtDate(completionDateToShow) : '—';
        return `
          <div class="cell">
            <div class="cell-label" data-procore-note="${sourceNote}">${label}</div>
            <div class="cell-value" style="opacity: 0.6; font-style: italic; color: #666;">${displayDate}</div>
          </div>
        `;
      }
      // Display as read-only (no input)
      return cellKV(label, value, fieldKey, false, rowData);
    }
  }
  
  const state = editModeState.get(rowData.ProjectName || rowData.Property);
  const isChanged = state?.changedFields?.has(fieldKey);
  const fieldClass = isChanged ? "field-changed" : "";
  
  // Determine input type
  let inputType = "text";
  let inputValue = value != null ? String(value) : "";
  let inputElement = "";
  
  // Special handling for Lender/LenderId - use dropdown
  if (fieldKey === "Lender" || fieldKey === "PermanentFinancingLender") {
    const banks = window.BANKS_DATA || [];
    const currentBankId = fieldKey === "Lender" 
      ? (rowData.LenderId || rowData._constructionLoan?.LenderId)
      : (rowData._permanentLoan?.LenderId);
    
    // Ensure currentBankId is converted to string for comparison
    const currentBankIdStr = currentBankId ? String(currentBankId) : "";
    inputElement = `
      <select data-field="${fieldKey}" 
              data-original="${currentBankIdStr}"
              class="edit-input">
        <option value="">-- Select Bank --</option>
        ${banks.map(bank => {
          const bankIdStr = String(bank.BankId);
          return `
          <option value="${bankIdStr}" ${bankIdStr === currentBankIdStr ? "selected" : ""}>
            ${bank.BankName}
          </option>
        `;
        }).join("")}
      </select>
    `;
  } else if (fieldKey === "Region") {
    // Dropdown for Region (read-only, core attribute - edit in Deal Pipeline)
    // regionsData is loaded in loadRegionsAndProductTypes and stored globally
    const regionOptions = (typeof regionsData !== 'undefined' && regionsData) ? 
      regionsData.map(r => r.RegionName || r.Region).filter(Boolean) : 
      ['Gulf Coast', 'Carolinas']; // Fallback
    inputElement = `
      <select data-field="${fieldKey}" 
              data-original="${value || ""}"
              class="edit-input"
              disabled
              style="opacity: 0.7; cursor: not-allowed;"
              title="Core attribute - Edit in Deal Pipeline">
        <option value="">-- Select Region --</option>
        ${regionOptions.map(region => `
          <option value="${region}" ${value === region ? "selected" : ""}>${region}</option>
        `).join("")}
      </select>
    `;
  } else if (fieldKey === "FixedOrFloating" || fieldKey === "PermFixedOrFloating") {
    // Dropdown for Fixed/Floating (both construction and permanent)
    inputElement = `
      <select data-field="${fieldKey}" 
              data-original="${value || ""}"
              class="edit-input">
        <option value="">-- Select --</option>
        <option value="Fixed" ${value === "Fixed" ? "selected" : ""}>Fixed</option>
        <option value="Floating" ${value === "Floating" ? "selected" : ""}>Floating</option>
      </select>
    `;
  } else if (fieldKey === "IndexName" || fieldKey === "PermIndexName") {
    // Dropdown for Index Name (Prime or SOFR)
    // Normalize value for comparison (case-insensitive)
    const normalizedValue = value ? String(value).trim() : "";
    const isPrime = normalizedValue.toLowerCase().includes("prime");
    const isSOFR = normalizedValue.toLowerCase().includes("sofr");
    const selectedValue = isPrime ? "Prime" : (isSOFR ? "SOFR" : "");
    
    inputElement = `
      <select data-field="${fieldKey}" 
              data-original="${value || ""}"
              class="edit-input">
        <option value="">-- Select --</option>
        <option value="Prime" ${selectedValue === "Prime" ? "selected" : ""}>Prime</option>
        <option value="SOFR" ${selectedValue === "SOFR" ? "selected" : ""}>SOFR</option>
      </select>
    `;
  } else if (fieldKey === "LoanPhase") {
    // Dropdown for Loan Phase
    inputElement = `
      <select data-field="${fieldKey}" 
              data-original="${value || ""}"
              class="edit-input">
        <option value="">-- Select --</option>
        <option value="Construction" ${value === "Construction" ? "selected" : ""}>Construction</option>
        <option value="Permanent" ${value === "Permanent" ? "selected" : ""}>Permanent</option>
      </select>
    `;
  } else if (fieldKey === "LoanType") {
    // Text input for Loan Type (LOC - Construction, RLOC - Land, etc.)
    inputType = "text";
    inputValue = value != null ? String(value) : "";
    inputElement = `<input type="${inputType}" 
                           data-field="${fieldKey}" 
                           data-original="${value != null ? String(value) : ""}"
                           value="${inputValue}"
                           class="edit-input" />`;
    } else {
    // CRITICAL: Check if ConstructionCompletionDate comes from Procore BEFORE creating input
    // This is a second check to ensure we catch it even if the earlier check failed
    if (fieldKey === "ConstructionCompletionDate") {
      const projectId = rowData.Row || rowData.ProjectId;
      const projectIdNum = projectId ? Number(projectId) : null;
      
      // Try to get Procore match - prioritize number lookup since we store as number
      let procoreMatch = null;
      if (projectIdNum) {
        procoreMatch = window.PROCORE_MATCHES?.get(projectIdNum);
      }
      if (!procoreMatch && projectId) {
        procoreMatch = window.PROCORE_MATCHES?.get(projectId);
      }
      if (!procoreMatch && projectId) {
        procoreMatch = window.PROCORE_MATCHES?.get(String(projectId));
      }
      
      // If Procore data exists, make it read-only (no input field)
      if (procoreMatch?.hasProcore === true && (procoreMatch?.completionDate || procoreMatch?.projectedFinishDate || procoreMatch?.actualCompletionDate)) {
        const completionDateToShow = procoreMatch?.completionDate || 
                                     procoreMatch?.projectedFinishDate || 
                                     procoreMatch?.actualCompletionDate || 
                                     value;
        const isProjected = procoreMatch?.projectedFinishDate && 
                           (procoreMatch?.completionDate === procoreMatch?.projectedFinishDate ||
                            completionDateToShow === procoreMatch?.projectedFinishDate);
        const sourceNote = isProjected ? '(projected from Procore)' : '(from Procore)';
        const displayDate = completionDateToShow ? fmtDate(completionDateToShow) : '—';
        
        // Return read-only display (no input)
        return `
          <div class="cell">
            <div class="cell-label">${label} <small style="opacity: 0.7;">${sourceNote}</small></div>
            <div class="cell-value" style="opacity: 0.6; font-style: italic; color: #666; cursor: not-allowed;">${displayDate}</div>
          </div>
        `;
      }
    }
    
    // Standard input handling
    if (fieldKey.includes("Date") || fieldKey.includes("Maturity")) {
      inputType = "date";
      inputValue = convertDateToInput(value);
    } else if (fieldKey === "Units" || fieldKey.includes("Amount")) {
      inputType = "number";
      inputValue = value != null ? num(value) : "";
    } else if (fieldKey === "Spread") {
      inputType = "text";
      inputValue = value != null ? String(value).replace("%", "") : "";
    } else if (fieldKey === "Stage") {
      // Text input for Stage
      inputType = "text";
      inputValue = value != null ? String(value) : "";
    }
    
    // Special handling for MiniPermInterestRate (can be string)
    if (fieldKey === "MiniPermInterestRate" || fieldKey === "PermPhaseInterestRate" || fieldKey === "InterestRate" || fieldKey === "PermanentInterestRate") {
      inputType = "text";
      inputValue = value != null ? String(value) : "";
    }
    
    inputElement = `<input type="${inputType}" 
                           data-field="${fieldKey}" 
                           data-original="${value != null ? String(value) : ""}"
                           value="${inputValue}"
                           class="edit-input" />`;
  }
  
  // Get data source for tooltip
  const dataSource = getDataSource(fieldKey);
  const tooltipAttr = dataSource ? `title="${dataSource}"` : "";
  
  // Add data attribute for Interest Rate field to enable toggling
  const dataAttr = fieldKey === "InterestRate" ? 'data-field-type="interest-rate"' : '';
  
  return `
    <div class="cell ${fieldClass}" ${tooltipAttr} ${dataAttr}>
      <div class="cell-label">${label}</div>
      <div class="cell-value">
        ${inputElement}
      </div>
    </div>
  `;
}

function buildDetailsForNested(r, detailElement, context = null) {
  // Build details directly into the provided element
  if (!detailElement) {
    console.warn("buildDetailsForNested: No detail element provided");
    return;
  }
  
  const propertyKey = r.ProjectName || r.Property;
  if (!propertyKey) {
    console.warn("buildDetailsForNested: No property key found", r);
    return;
  }
  
  buildDetailsContent(r, detailElement, propertyKey, context);
}

function buildDetails(r, context = null) {
  const propertyKey = r.ProjectName || r.Property;
  if (!propertyKey) {
    console.warn("buildDetails: No property key found", r);
    return;
  }
  
  // Try multiple ways to find the detail element
  let detail = null;
  const dataRow = document.querySelector(`tr.data-row[data-key="${propertyKey}"]`);
  if (dataRow) {
    const detailRow = dataRow.nextElementSibling;
    if (detailRow && detailRow.classList.contains("detail-row")) {
      detail = detailRow.querySelector(".detail");
    }
  }
  
  // Fallback: try the original method
  if (!detail) {
    const fallbackRow = document.querySelector(`tr[data-key="${propertyKey}"]`);
    if (fallbackRow) {
      const detailRow = fallbackRow.nextElementSibling;
      if (detailRow && detailRow.classList.contains("detail-row")) {
        detail = detailRow.querySelector(".detail");
      }
    }
  }
  
  // Also try deal-detail for nested views
  if (!detail) {
    const dealRow = document.querySelector(`tr.deal-row[data-deal-key="${propertyKey}"]`);
    if (dealRow) {
      const detailRow = dealRow.nextElementSibling;
      if (detailRow && detailRow.classList.contains("deal-detail-row")) {
        detail = detailRow.querySelector(".deal-detail");
      }
    }
  }
  
  if (!detail) {
    console.warn("buildDetails: Could not find detail element for:", propertyKey);
    return;
  }
  
  buildDetailsContent(r, detail, propertyKey, context);
}

function buildDetailsContent(r, detail, propertyKey, context = null) {
  
  // Initialize state if it doesn't exist
  let state = editModeState.get(propertyKey);
  if (!state) {
    state = { originalData: null, changedFields: new Set() };
    editModeState.set(propertyKey, state);
  }
  if (!state.changedFields) {
    state.changedFields = new Set();
  }
  
  const isEditMode = globalEditMode; // Use global edit mode (requires authentication)
  
  const panes = buildPanes(r, globalEditMode);
  
  // Determine tab order and default active tab based on current view
  let tabOrder = [];
  let defaultActiveTab = null;
  
  if (currentView === "construction") {
    // Construction view: show construction first, then others (no permanent tab)
    tabOrder = ["construction", "participations", "covenants", "guarantees", "equity"];
    defaultActiveTab = "construction";
  } else if (currentView === "permanent") {
    // Permanent view: show permanent first, then others (no construction tab)
    tabOrder = ["permanent", "participations", "covenants", "guarantees", "equity"];
    defaultActiveTab = "permanent";
  } else if (currentView === "equity" && currentTab === "by-property") {
    // Equity view in by-property tab: show equity first, then others (no construction or permanent tabs)
    tabOrder = ["equity", "participations", "covenants", "guarantees"];
    defaultActiveTab = "equity";
  } else if (context === "bank") {
    // Bank context: show participations first
    tabOrder = ["participations", "construction", "permanent", "covenants", "guarantees", "equity"];
    defaultActiveTab = "participations";
  } else if (currentTab === "by-bank") {
    // If we're on the by-bank tab, always show participations first (even if context is not "bank")
    tabOrder = ["participations", "construction", "permanent", "covenants", "guarantees", "equity"];
    defaultActiveTab = "participations";
  } else if (context === "equity") {
    // Equity context: show equity first
    tabOrder = ["equity", "construction", "permanent", "participations", "covenants", "guarantees"];
    defaultActiveTab = "equity";
  } else if (currentTab === "by-equity") {
    // If we're on the by-equity tab, always show equity first (even if context is not "equity")
    tabOrder = ["equity", "construction", "permanent", "participations", "covenants", "guarantees"];
    defaultActiveTab = "equity";
  } else {
    // Default: show all tabs in standard order
    tabOrder = ["construction", "permanent", "participations", "covenants", "guarantees", "equity"];
    defaultActiveTab = "construction";
  }
  
  const orderedPanes = tabOrder.map(id => panes.find(p => p.id === id)).filter(Boolean);
  
  // Set active tab: use stored tab if available and valid, otherwise use default
  // BUT: if we're on by-equity tab, always force equity tab to be active
  let activeTab = defaultActiveTab || orderedPanes[0]?.id || panes[0]?.id;
  const storedTab = sessionStorage.getItem(`tab-${propertyKey}`);
  
  // If we're on the by-equity tab, default to equity tab but allow user to switch
  if (currentTab === "by-equity") {
    // Only set default if no stored tab exists, otherwise use stored tab
    if (!storedTab || !orderedPanes.find(p => p.id === storedTab)) {
      activeTab = "equity";
      sessionStorage.setItem(`tab-${propertyKey}`, "equity");
    } else {
      activeTab = storedTab;
    }
  } else if (currentTab === "by-bank") {
    // Only set default to participations if no stored tab exists, otherwise use stored tab
    // This allows user to switch tabs after initial load
    if (!storedTab || !orderedPanes.find(p => p.id === storedTab)) {
      activeTab = "participations";
      sessionStorage.setItem(`tab-${propertyKey}`, "participations");
    } else {
      activeTab = storedTab;
    }
  } else {
    // Check if stored tab is valid for current view
    if (storedTab && orderedPanes.find(p => p.id === storedTab)) {
      activeTab = storedTab;
    } else {
      // If stored tab is not valid for this view, clear it and use default
      if (storedTab) {
        sessionStorage.removeItem(`tab-${propertyKey}`);
      }
      activeTab = defaultActiveTab || orderedPanes[0]?.id || panes[0]?.id;
    }
  }
  
  // Get change count for save button
  const hasChanges = state.changedFields.size > 0;
  const changeCount = state.changedFields.size;
  
  const editButton = isEditMode ? `
    <div class="edit-message">Edit mode enabled. Changes may take up to 15 minutes to display.</div>
  ` : `
    <div class="edit-message" style="color: var(--text-secondary);">Click "Edit Mode" in the header to enable editing.</div>
  `;
  
  // Escape propertyKey for use in HTML attributes
  const escapedPropertyKey = String(propertyKey).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  const saveButton = isEditMode ? `
    <button class="btn btn-primary save-property-btn" 
            onclick="savePropertyChanges('${escapedPropertyKey}')"
            ${!hasChanges ? 'disabled' : ''}
            style="margin-left: 12px;">
      ${hasChanges ? `Save Changes (${changeCount})` : 'Save Changes'}
    </button>
  ` : '';
  
  detail.innerHTML = `
    <div class="detail-inner">
      <div class="detail-header">
        <div class="detail-tabs">
          ${orderedPanes.map(p => `
            <button class="detail-tab ${p.id === activeTab ? "active" : ""}" 
                    data-tab="${p.id}" 
                    onclick="switchDetailTab('${propertyKey}', '${p.id}')">
              ${p.label}
            </button>
          `).join("")}
        </div>
        <div class="detail-actions">
          ${editButton}
          ${saveButton}
        </div>
      </div>
      <div class="detail-content">
        ${orderedPanes.find(p => p.id === activeTab)?.content || ""}
      </div>
        </div>
      `;
  
  // Bind input/select change listeners for edit mode
  if (isEditMode) {
    const detailSelector = detail.classList.contains("deal-detail") ? ".deal-detail" : ".detail";
    $$(`${detailSelector} input[data-field], ${detailSelector} select[data-field]`, detail.closest(".detail-inner") || detail).forEach(input => {
      const eventType = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventType, () => {
        const fieldKey = input.dataset.field;
        const original = input.dataset.original || "";
        const current = input.value || "";
        
        if (!state.changedFields) state.changedFields = new Set();
        
        // Normalize both values to strings for comparison (especially important for Lender dropdown)
        const originalStr = String(original);
        const currentStr = String(current);
        
        if (currentStr !== originalStr) {
          state.changedFields.add(fieldKey);
        } else {
          state.changedFields.delete(fieldKey);
        }
        
        editModeState.set(propertyKey, state);
        updateChangedFieldsHighlight(detail, state.changedFields);
        
        // Handle FixedOrFloating change to show/hide Interest Rate
        if (fieldKey === "FixedOrFloating") {
          toggleInterestRateField(detail, current === "Fixed");
        }
      });
    });
    
    // Set initial Interest Rate visibility based on FixedOrFloating value
    if (isEditMode) {
      const fixedOrFloatingSelect = detail.querySelector('select[data-field="FixedOrFloating"]');
      if (fixedOrFloatingSelect) {
        const initialValue = fixedOrFloatingSelect.value;
        toggleInterestRateField(detail, initialValue === "Fixed");
      }
    }
  }
}

// Toggle Interest Rate field visibility based on Fixed/Floating selection
function toggleInterestRateField(detailElement, show) {
  // Find Interest Rate cell by data attribute
  const interestRateCell = detailElement.querySelector('.cell[data-field-type="interest-rate"]');
  if (interestRateCell) {
    interestRateCell.style.display = show ? '' : 'none';
  } else {
    // Fallback: Try to find by label text (for construction Interest Rate, not Mini-Perm or Perm Phase)
    const cells = detailElement.querySelectorAll('.cell');
    cells.forEach(cell => {
      const label = cell.querySelector('.cell-label');
      const input = cell.querySelector('input[data-field="InterestRate"]');
      if (label && input && label.textContent.trim() === 'Interest Rate') {
        cell.style.display = show ? '' : 'none';
      }
    });
  }
}

function switchDetailTab(propertyKey, tabId) {
  sessionStorage.setItem(`tab-${propertyKey}`, tabId);
  const row = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
  if (row) {
    const state = editModeState.get(propertyKey) || { isEditing: false };
    buildDetails(row, state.context);
  }
}

// Edit mode is now global - no per-property toggle needed
// These functions are kept for compatibility but redirect to global edit mode
function toggleEditMode(propertyKey) {
  if (!globalEditMode) {
    showLoginModal();
  }
  // Edit mode is already global, just refresh the view
  const row = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
  if (row) {
    buildDetails(row);
  }
}

function cancelEditMode(propertyKey) {
  // Clear changes for this property
  const state = editModeState.get(propertyKey);
  if (state) {
    state.changedFields = new Set();
    editModeState.set(propertyKey, state);
  }
  
  const row = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
  if (row) {
    buildDetails(row);
  }
}

function updateChangedFieldsHighlight(detail, changedFields) {
  const saveBtn = detail.querySelector(`.save-property-btn`);
  if (saveBtn) {
    const count = changedFields?.size || 0;
    saveBtn.textContent = count > 0 ? `Save Changes (${count})` : "Save Changes";
    saveBtn.disabled = count === 0;
    if (count > 0) {
      saveBtn.classList.add('has-changes');
    } else {
      saveBtn.classList.remove('has-changes');
    }
  }
  
  $$(".field-changed", detail).forEach(el => el.classList.remove("field-changed"));
  changedFields?.forEach(fieldKey => {
    $$(`input[data-field="${fieldKey}"]`, detail).forEach(input => {
      input.closest(".cell")?.classList.add("field-changed");
    });
  });
}

// Field mapping for API - Database fields (editable)
const PROJECT_FIELD_MAP = {
  ProjectName: "ProjectName",
  City: "City",
  State: "State",
  Region: "Region",
  Units: "Units",
  ProductType: "ProductType",
  Stage: "Stage",
  EstimatedConstructionStartDate: "EstimatedConstructionStartDate", // Editable if not in Procore
};

const LOAN_FIELD_MAP = {
  LoanAmount: "LoanAmount",
  LoanClosingDate: "LoanClosingDate",
  IOMaturityDate: "IOMaturityDate",
  FixedOrFloating: "FixedOrFloating",
  IndexName: "IndexName",
  Spread: "Spread",
  InterestRate: "InterestRate",
  MiniPermMaturity: "MiniPermMaturity",
  MiniPermInterestRate: "MiniPermInterestRate",
  ConstructionCompletionDate: "ConstructionCompletionDate",
  LeaseUpCompletedDate: "LeaseUpCompletedDate",
  Borrower: "Borrower",
  LoanType: "LoanType",
  LoanPhase: "LoanPhase",
  LenderId: "LenderId", // Special handling - convert from Lender name
  MaturityDate: "MaturityDate",
  PermPhaseMaturity: "PermPhaseMaturity",
  PermPhaseInterestRate: "PermPhaseInterestRate",
};

const PERMANENT_LOAN_FIELD_MAP = {
  PermanentCloseDate: "LoanClosingDate", // Maps to LoanClosingDate for permanent loan
  PermanentLoanAmount: "LoanAmount", // Maps to LoanAmount for permanent loan
  PermanentFinancingLender: "LenderId", // Special handling - convert from Lender name
  MaturityDate: "MaturityDate",
  PermanentInterestRate: "InterestRate",
  // Note: FixedOrFloating, IndexName, Spread for permanent loan are handled separately
  // They use the same field names but are applied to the permanent loan
};

// Read-only fields from MMR/Procore (cannot be edited)
// Core attributes that can only be edited in Deal Pipeline (read-only in detail view)
const CORE_ATTRIBUTES = new Set([
  "ProjectName", // Property Name
  "City",
  "State",
  "Region",
  "Units",
  "ProductType",
  "Stage",
  "EstimatedConstructionStartDate", // Synced from Procore
]);

const READ_ONLY_FIELDS = new Set([
  // MMR fields
  "Property", // MMR property name (read-only, use ProjectName from database)
  "FullAddress", // MMR
  "Latitude", // MMR
  "Longitude", // MMR
  "LatestConstructionStatus", // MMR
  // Procore fields
  "actualstartdate",
  "actualcompletiondate",
  "projectedfinishdate",
  "schedulepercentcompletion",
  "schedulelastupdated",
]);

// Data source mapping for tooltips
function getDataSource(fieldKey) {
  // Azure/API fields (editable)
  if (PROJECT_FIELD_MAP[fieldKey] || LOAN_FIELD_MAP[fieldKey] || PERMANENT_LOAN_FIELD_MAP[fieldKey] ||
      fieldKey === "PermFixedOrFloating" || fieldKey === "PermIndexName" || fieldKey === "PermSpread") {
    return "Azure Database (Editable)";
  }
  
  // MMR fields (read-only)
  if (fieldKey === "Property" || fieldKey === "FullAddress" || fieldKey === "Latitude" || 
      fieldKey === "Longitude" || fieldKey === "LatestConstructionStatus") {
    return "MMR Data (Read-only)";
  }
  
  // Procore fields (read-only)
  if (fieldKey === "actualstartdate" || fieldKey === "actualcompletiondate" || 
      fieldKey === "projectedfinishdate" || fieldKey === "schedulepercentcompletion" || 
      fieldKey === "schedulelastupdated") {
    return "Procore (Read-only)";
  }
  
  // IMS fields (for equity/investor data)
  if (fieldKey.includes("Equity") || fieldKey.includes("Investor") || fieldKey.includes("Partner")) {
    return "IMS Data";
  }
  
  // Default for unknown fields
  return "Unknown Source";
}

// Optimized function to update only the changed data without full reload
async function updateSinglePropertyData(projectId, loanId, permanentLoanId, refreshRelated = false) {
  try {
    // Fetch only the updated project and loans (always fetch loans to get latest data)
    const fetchPromises = [
      getProjectById(projectId),
      getLoansByProject(projectId)
    ];
    
    // Optionally fetch related data if requested (for participations, covenants, etc.)
    if (refreshRelated) {
      fetchPromises.push(
        getParticipationsByProject(projectId),
        getCovenantsByProject(projectId),
        getGuaranteesByProject(projectId),
        getEquityCommitmentsByProject(projectId)
      );
    }
    
    const results = await Promise.all(fetchPromises);
    const projectRes = results[0];
    const loansRes = results[1];
    
    const updatedProject = projectRes?.data || projectRes;
    const updatedLoans = loansRes?.data || loansRes || [];
    
    if (!updatedProject) {
      console.warn("Could not fetch updated project:", projectId);
      return null;
    }
    
    // Update global data stores
    const projectIndex = window.PROJECTS_DATA.findIndex(p => p.ProjectId === projectId);
    if (projectIndex >= 0) {
      window.PROJECTS_DATA[projectIndex] = { ...window.PROJECTS_DATA[projectIndex], ...updatedProject };
    } else {
      window.PROJECTS_DATA.push(updatedProject);
    }
    
    // Update loans - replace all loans for this project
    window.LOANS_DATA = window.LOANS_DATA.filter(l => l.ProjectId !== projectId);
    window.LOANS_DATA.push(...updatedLoans);
    
    // Update related data if fetched
    if (refreshRelated && results.length > 2) {
      const participationsRes = results[2];
      const covenantsRes = results[3];
      const guaranteesRes = results[4];
      const equityCommitmentsRes = results[5];
      
      const updatedParticipations = participationsRes?.data || participationsRes || [];
      const updatedCovenants = covenantsRes?.data || covenantsRes || [];
      const updatedGuarantees = guaranteesRes?.data || guaranteesRes || [];
      const updatedEquityCommitments = equityCommitmentsRes?.data || equityCommitmentsRes || [];
      
      // Replace related data for this project
      window.PARTICIPATIONS_DATA = window.PARTICIPATIONS_DATA.filter(p => p.ProjectId !== projectId);
      window.PARTICIPATIONS_DATA.push(...updatedParticipations);
      
      window.COVENANTS_DATA = window.COVENANTS_DATA.filter(c => c.ProjectId !== projectId);
      window.COVENANTS_DATA.push(...updatedCovenants);
      
      window.GUARANTES_DATA = window.GUARANTES_DATA.filter(g => g.ProjectId !== projectId);
      window.GUARANTES_DATA.push(...updatedGuarantees);
      
      window.EQUITY_COMMITMENTS_DATA = window.EQUITY_COMMITMENTS_DATA.filter(e => e.ProjectId !== projectId);
      window.EQUITY_COMMITMENTS_DATA.push(...updatedEquityCommitments);
    }
    
    // Rebuild the banking row for this project
    const bankingRows = transformRelationalToBanking(
      [updatedProject],
      updatedLoans,
      refreshRelated ? (window.PARTICIPATIONS_DATA.filter(p => p.ProjectId === projectId)) : (window.PARTICIPATIONS_DATA.filter(p => p.ProjectId === projectId)),
      refreshRelated ? (window.GUARANTES_DATA.filter(g => g.ProjectId === projectId)) : (window.GUARANTES_DATA.filter(g => g.ProjectId === projectId)),
      refreshRelated ? (window.COVENANTS_DATA.filter(c => c.ProjectId === projectId)) : (window.COVENANTS_DATA.filter(c => c.ProjectId === projectId)),
      (window.DSCR_TESTS_DATA || []).filter(d => d.ProjectId === projectId),
      (window.LIQUIDITY_REQS_DATA || []).filter(l => l.ProjectId === projectId),
      (window.BANK_TARGETS_DATA || []).filter(bt => bt.ProjectId === projectId),
      refreshRelated ? (window.EQUITY_COMMITMENTS_DATA.filter(e => e.ProjectId === projectId)) : (window.EQUITY_COMMITMENTS_DATA.filter(e => e.ProjectId === projectId)),
      window.EQUITY_PARTNERS_DATA,
      window.PEOPLE_DATA,
      window.BANKS_DATA
    );
    
    const bankingRow = bankingRows[0];
    if (!bankingRow) return null;
    
    // Find and update the row in CURRENT_ROWS
    const rowIndex = CURRENT_ROWS.findIndex(r => (r.Row || r._banking?.Row) === projectId);
    if (rowIndex >= 0) {
      const existingRow = CURRENT_ROWS[rowIndex];
      const mmrData = existingRow._mmr || null;
      
      // Rebuild joined row
      const updatedJoinedRow = {
        ...(mmrData || {}),
        ...bankingRow,
        Property: mmrData?.Property || bankingRow.ProjectName || "",
        ProjectName: bankingRow.ProjectName || mmrData?.Property || "",
        Row: bankingRow.Row || projectId,
        _mmr: mmrData,
        _banking: bankingRow,
      };
      
      CURRENT_ROWS[rowIndex] = updatedJoinedRow;
      return updatedJoinedRow;
    }
    
    return null;
  } catch (error) {
    console.error("Error updating single property data:", error);
    return null;
  }
}

// Helper function to preserve and restore expansion state after save operations
// This works for all views: main property view, bank view, and equity view
// OPTIMIZED: Now uses partial updates instead of full reload
async function preserveAndRestoreExpansion(propertyKey, afterLoadCallback = null) {
  if (!propertyKey) return;
  
  // Get context from editModeState to know which view we're in
  const state = editModeState.get(propertyKey);
  const context = state?.context || null;
  
  // Find the current row to get IDs
  const currentRow = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
  if (!currentRow) {
    console.warn("Could not find current row for:", propertyKey);
    // Fallback to full reload if row not found
    await loadAll();
    await renderAll();
    return;
  }
  
  const projectId = currentRow.Row || currentRow._banking?.Row;
  const loanId = currentRow.LoanId || currentRow._constructionLoan?.LoanId;
  const permanentLoanId = currentRow.PermanentLoanId || currentRow._permanentLoan?.LoanId;
  
  // Preserve expansion state
  expandedKeys.add(propertyKey);
  
  // Also preserve bank/equity expansion if we're in those views
  if (context === "bank") {
    // Find which bank this property belongs to
    const bankRow = document.querySelector(`tr.deal-row[data-deal-key="${propertyKey}"]`)?.closest('tr.data-row[data-bank-id]');
    if (bankRow) {
      const bankId = parseInt(bankRow.dataset.bankId);
      if (bankId) {
        expandedBanks.add(bankId);
      }
    }
  } else if (context === "equity") {
    // Find which investor this property belongs to
    const equityRow = document.querySelector(`tr.deal-row[data-deal-key="${propertyKey}"]`)?.closest('tr.data-row[data-equity-name]');
    if (equityRow) {
      const equityName = equityRow.dataset.equityName;
      if (equityName) {
        expandedEquity.add(equityName);
      }
    }
  }
  
  // OPTIMIZED: Update only the changed property data instead of full reload
  // For property changes, we don't need to refresh related data (participations, covenants, etc.)
  const updatedRow = await updateSinglePropertyData(projectId, loanId, permanentLoanId, false);
  
  if (updatedRow) {
    // Re-render only the affected row instead of entire view
    await renderAll();
    
    // After rendering, expand and build details for the saved property
    requestAnimationFrame(() => {
      const sorted = applySort(CURRENT_ROWS);
      const rowData = sorted.find(r => (r.ProjectName || r.Property) === propertyKey);
      if (!rowData) {
        console.warn("Could not find rowData after save for:", propertyKey);
        return;
      }
      
      // Try to find the row in main property view first
      let newRow = document.querySelector(`tr.data-row[data-key="${propertyKey}"]`);
      let detailRow = null;
      let detail = null;
      
      if (newRow) {
        // Main property view
        detailRow = newRow.nextElementSibling;
        if (detailRow && detailRow.classList.contains("detail-row")) {
          detail = detailRow.querySelector(".detail");
          if (detail) {
            buildDetails(rowData);
            adjustDetailWidth(detailRow);
            if (afterLoadCallback) afterLoadCallback(detail, detailRow);
            return;
          }
        }
      }
      
      // If not found in main view, try nested views (bank/equity)
      const dealRow = document.querySelector(`tr.deal-row[data-deal-key="${propertyKey}"]`);
      if (dealRow) {
        detailRow = dealRow.nextElementSibling;
        if (detailRow && detailRow.classList.contains("deal-detail-row")) {
          detail = detailRow.querySelector(".deal-detail");
          if (detail) {
            // Use buildDetailsForNested with the context
            buildDetailsForNested(rowData, detail, context);
            adjustDetailWidth(detailRow);
            if (afterLoadCallback) afterLoadCallback(detail, detailRow);
            return;
          }
        }
      }
      
      console.warn("Could not find detail element after save for:", propertyKey, "context:", context);
    });
  } else {
    // Fallback to full reload if partial update failed
    await loadAll();
    await renderAll();
  }
}

// Helper function to populate detail after save
function populateDetailAfterSave(propertyKey, detailRow, activeTab) {
  const detail = detailRow.querySelector(".detail");
  if (!detail) {
    console.warn("Could not find detail element after save for:", propertyKey);
    return;
  }
  
  // Find the row data from CURRENT_ROWS (which has been filtered/sorted by renderAll)
  const freshRow = CURRENT_ROWS.find(r => {
    const key = r.ProjectName || r.Property;
    return key === propertyKey;
  });
  
  if (!freshRow) {
    console.warn("Could not find fresh row after save for:", propertyKey);
    return;
  }
  
  // Build the detail content directly into the existing detail element
  buildDetailsContent(freshRow, detail, propertyKey, null);
  
  // Adjust detail width
  adjustDetailWidth(detailRow);
  
  // Restore active tab if it was set
  if (activeTab) {
    requestAnimationFrame(() => {
      const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
      if (tabButton) {
        tabButton.click();
      }
    });
  }
}

async function savePropertyChanges(propertyKey) {
  const state = editModeState.get(propertyKey);
  if (!state || !state.changedFields || state.changedFields.size === 0) {
    console.warn(`No changes to save for ${propertyKey}`);
    return;
  }
  
  const row = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
  if (!row) {
    console.warn(`Row not found for propertyKey: ${propertyKey}`);
    return;
  }
  
  const detail = document.querySelector(`tr[data-key="${propertyKey}"]`)?.nextElementSibling?.querySelector(".detail");
  if (!detail) return;
  
  // Collect changed values from inputs
  const changedProjectFields = {};
  const changedLoanFields = {};
  const changedPermanentLoanFields = {};
  
  state.changedFields.forEach(fieldKey => {
    const input = detail.querySelector(`input[data-field="${fieldKey}"], select[data-field="${fieldKey}"]`);
    if (!input) {
      console.warn(`No input found for field: ${fieldKey}`);
      return;
    }
    
    // For select elements, don't trim (empty string is valid for clearing)
    let value = input.tagName === "SELECT" ? input.value : input.value.trim();
    
    // Handle Lender dropdown FIRST (before checking LOAN_FIELD_MAP, since "Lender" is not in that map)
    if (fieldKey === "Lender") {
      const lenderId = value && value !== "" ? parseInt(value, 10) : null;
      // Always set LenderId, even if null (to allow clearing the lender)
      changedLoanFields["LenderId"] = lenderId ? String(lenderId) : null;
      return; // Skip the rest of the loop iteration
    }
    
    // Type conversion
    if (PROJECT_FIELD_MAP[fieldKey]) {
      if (fieldKey === "Units") {
        value = value ? parseInt(value, 10) : null;
      } else if (fieldKey.includes("Date")) {
        value = value || null;
  } else {
        value = value || null;
      }
      changedProjectFields[PROJECT_FIELD_MAP[fieldKey]] = value;
    } else if (LOAN_FIELD_MAP[fieldKey]) {
      if (fieldKey === "Spread") {
        const numVal = parseFloat(value);
        if (isNaN(numVal) || numVal === 0.5) {
          return; // Skip if empty or default 50%
        }
        value = `${numVal}%`;
        changedLoanFields[LOAN_FIELD_MAP[fieldKey]] = value;
      } else if (fieldKey === "MiniPermInterestRate" || fieldKey === "PermPhaseInterestRate" || fieldKey === "InterestRate") {
        // Keep as string (can be "SOFR + 2.35% - 30yr am" or number)
        value = value || null;
        changedLoanFields[LOAN_FIELD_MAP[fieldKey]] = value;
      } else if (fieldKey.includes("Amount")) {
        value = value ? parseFloat(value) : null;
        changedLoanFields[LOAN_FIELD_MAP[fieldKey]] = value;
      } else if (fieldKey.includes("Date") || fieldKey.includes("Maturity")) {
        value = value || null;
        changedLoanFields[LOAN_FIELD_MAP[fieldKey]] = value;
      } else {
        value = value || null;
        changedLoanFields[LOAN_FIELD_MAP[fieldKey]] = value;
      }
    } else if (PERMANENT_LOAN_FIELD_MAP[fieldKey]) {
      if (fieldKey === "PermanentFinancingLender") {
        // Convert dropdown selection to LenderId (as string)
        const lenderId = value && value.trim() ? parseInt(value, 10) : null;
        // Always set LenderId, even if null (to allow clearing the lender)
        changedPermanentLoanFields["LenderId"] = lenderId ? String(lenderId) : null;
      } else if (fieldKey === "PermanentInterestRate") {
        value = value || null;
        changedPermanentLoanFields[PERMANENT_LOAN_FIELD_MAP[fieldKey]] = value;
      } else if (fieldKey.includes("Amount")) {
        value = value ? parseFloat(value) : null;
        changedPermanentLoanFields[PERMANENT_LOAN_FIELD_MAP[fieldKey]] = value;
      } else if (fieldKey.includes("Date") || fieldKey === "MaturityDate") {
        value = value || null;
        changedPermanentLoanFields[PERMANENT_LOAN_FIELD_MAP[fieldKey]] = value;
      } else {
        value = value || null;
        changedPermanentLoanFields[PERMANENT_LOAN_FIELD_MAP[fieldKey]] = value;
      }
    } else if (fieldKey === "PermFixedOrFloating" || fieldKey === "PermIndexName" || fieldKey === "PermSpread") {
      // Permanent loan specific fields
      if (fieldKey === "PermSpread") {
        const numVal = parseFloat(value);
        if (isNaN(numVal) || numVal === 0.5) {
          return; // Skip if empty or default 50%
        }
        value = `${numVal}%`;
        changedPermanentLoanFields["Spread"] = value;
      } else if (fieldKey === "PermFixedOrFloating") {
        changedPermanentLoanFields["FixedOrFloating"] = value || null;
      } else if (fieldKey === "PermIndexName") {
        changedPermanentLoanFields["IndexName"] = value || null;
      }
    }
  });
  
  // No need to confirm - user already clicked the save button
  try {
    const projectId = row.Row || row._banking?.Row;
    const loanId = row.LoanId || row._constructionLoan?.LoanId;
    const permanentLoanId = row.PermanentLoanId || row._permanentLoan?.LoanId;
    
    const updates = [];
    
    // Update project
    if (Object.keys(changedProjectFields).length > 0 && projectId) {
      updates.push(updateProject(projectId, changedProjectFields));
    }
    
    // Update construction loan
    // CRITICAL: Always use updateLoanByProject with LoanPhase to ensure we update the correct loan type
    // This prevents accidentally updating the permanent loan when we mean to update construction (and vice versa)
    if (Object.keys(changedLoanFields).length > 0) {
      if (projectId) {
        // Always use updateLoanByProject with LoanPhase: 'Construction' to ensure correct loan is updated
        const constructionUpdate = (async () => {
          try {
            return await updateLoanByProject(projectId, {
              LoanPhase: 'Construction', // CRITICAL: Always specify LoanPhase
              ...changedLoanFields
            });
          } catch (error) {
            // If loan doesn't exist, create it (as per guide)
            if (error.message && error.message.includes('No Construction loan found')) {
              console.log('Construction loan not found, creating new loan...');
              try {
                return await createLoan({
                  ProjectId: projectId,
                  LoanPhase: 'Construction',
                  ...changedLoanFields
                });
              } catch (createError) {
                // If creation fails due to database trigger issue, provide helpful error
                if (createError.message && createError.message.includes('OUTPUT clause')) {
                  throw new Error('Unable to create construction loan due to database configuration issue. Please contact support or try updating an existing loan instead.');
                }
                throw createError;
              }
            }
            throw error;
          }
        })();
        updates.push(constructionUpdate);
      } else {
        console.warn(`Cannot update construction loan: missing projectId. changedLoanFields:`, changedLoanFields);
      }
    }
    
    // Update permanent loan
    // CRITICAL: Always use updateLoanByProject with LoanPhase to ensure we update the correct loan type
    // This prevents accidentally updating the construction loan when we mean to update permanent (and vice versa)
    if (Object.keys(changedPermanentLoanFields).length > 0) {
      if (projectId) {
        // Always use updateLoanByProject with LoanPhase: 'Permanent' to ensure correct loan is updated
        const permanentUpdate = (async () => {
          try {
            return await updateLoanByProject(projectId, {
              LoanPhase: 'Permanent', // CRITICAL: Always specify LoanPhase
              ...changedPermanentLoanFields
            });
          } catch (error) {
            // If loan doesn't exist, create it (as per guide)
            if (error.message && error.message.includes('No Permanent loan found')) {
              console.log('Permanent loan not found, creating new loan...');
              try {
                return await createLoan({
                  ProjectId: projectId,
                  LoanPhase: 'Permanent',
                  ...changedPermanentLoanFields
                });
              } catch (createError) {
                // If creation fails due to database trigger issue, provide helpful error
                if (createError.message && createError.message.includes('OUTPUT clause')) {
                  throw new Error('Unable to create permanent loan due to database configuration issue. Please contact support or try updating an existing loan instead.');
                }
                throw createError;
              }
            }
            throw error;
          }
        })();
        updates.push(permanentUpdate);
      } else {
        console.warn(`Cannot update permanent loan: missing projectId. changedPermanentLoanFields:`, changedPermanentLoanFields);
      }
    }
    
    await Promise.all(updates);
    
    // Clear changed fields for this property after successful save
    const state = editModeState.get(propertyKey);
    if (state) {
      state.changedFields = new Set();
      editModeState.set(propertyKey, state);
    }
    
    // Show success message
    showSuccessMessage("Changes saved successfully!");
    
    // Reload data and preserve expanded state for this property
    // Use the helper function that handles all views
    await preserveAndRestoreExpansion(propertyKey, (detail, detailRow) => {
      // Restore active tab if it was set
      const activeTab = sessionStorage.getItem(`tab-${propertyKey}`);
      if (activeTab && detail) {
        const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
        if (tabButton) {
          tabButton.click();
        }
      }
    });
  } catch (error) {
    console.error("Save error:", error);
    alert(`Error saving changes: ${error.message}`);
  }
}

/* ---------- Participation, Covenant, Guarantee, Equity Functions ---------- */
function buildParticipationsByBank(projectId, loanId, isEditMode = false) {
  if (!projectId) return "<div class='empty'>No project data</div>";
  
  // Use global edit mode if available, otherwise use parameter
  const editMode = globalEditMode || isEditMode;
  
  // Get all participations for this project
  let parts = window.PARTICIPATIONS_DATA.filter(p => p.ProjectId === projectId);
  
  // Filter by FinancingType based on current view
  // Construction view: show only Construction participations
  // Permanent view: show only Permanent participations
  // Equity view or other: show all participations
  if (currentView === "construction") {
    // Show only Construction participations (strict filtering)
    parts = parts.filter(p => {
      const financingType = (p.FinancingType || "").trim();
      return financingType === "Construction";
    });
  } else if (currentView === "permanent") {
    // Show only Permanent participations (strict filtering)
    parts = parts.filter(p => {
      const financingType = (p.FinancingType || "").trim();
      return financingType === "Permanent";
    });
  }
  // If currentView is "equity" or not set, show all participations (no filtering)
  
  // Try to filter by loanId if provided and participations exist for that loan
  if (loanId) {
    const loanSpecificParts = parts.filter(p => p.LoanId === loanId);
    if (loanSpecificParts.length > 0) {
      parts = loanSpecificParts;
    }
    // If no loan-specific participations, fall back to all project participations
    // This ensures we show all banks participating in the deal, not just for a specific loan
  }
  
  const banks = window.BANKS_DATA || [];
  
  // If no participations, show empty message and add button (if in edit mode)
  if (parts.length === 0) {
    if (editMode) {
    return `
        <div class='empty'>No participations found</div>
        <div style="margin-top: 16px;">
          <button class="btn btn-sm" onclick="showAddParticipationModal(${projectId}, ${loanId || 'null'})">+ Add Participation</button>
      </div>
    `;
  }
    return "<div class='empty'>No participations found</div>";
  }
  
  // Sort by bank name for better display
  parts = [...parts].sort((a, b) => {
    const bankA = banks.find(bk => bk.BankId === a.BankId);
    const bankB = banks.find(bk => bk.BankId === b.BankId);
    const nameA = bankA?.BankName || "";
    const nameB = bankB?.BankName || "";
    return nameA.localeCompare(nameB);
  });
  
  let html = "<div class='data-table'><table><thead><tr><th class='text-left'>Bank</th><th class='text-center'>Financing Type</th><th class='text-center'>Participation %</th><th class='text-center'>Exposure</th><th class='text-center'>Paid Off</th><th class='text-center'>Actions</th></tr></thead><tbody>";
  
  for (const part of parts) {
    const bank = banks.find(b => b.BankId === part.BankId);
    const bankName = bank?.BankName || `Bank ID ${part.BankId}`;
    const financingType = part.FinancingType || "—";
    const pct = fmtPctSmart(part.ParticipationPercent);
    const exposure = fmtCurrency(part.ExposureAmount || 0);
    const paidOff = part.PaidOff ? "Yes" : "No";
    
    html += `<tr>
      <td class="text-left">${bankName}</td>
      <td class="text-center">${financingType}</td>
      <td class="num text-center">${pct}</td>
      <td class="num text-center">${exposure}</td>
      <td class="text-center">${paidOff}</td>
      <td class="text-center">
        ${editMode ? `<button class="btn btn-sm" onclick="showEditParticipationModal(${part.ParticipationId}, ${projectId}, ${loanId || 'null'})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteParticipationById(${part.ParticipationId})">Delete</button>` : '—'}
      </td>
    </tr>`;
  }
  
  // Calculate totals
  const totalPct = parts.reduce((sum, p) => sum + num(p.ParticipationPercent || 0), 0);
  const totalExposure = parts.reduce((sum, p) => sum + num(p.ExposureAmount || 0), 0);
  
    html += `</tbody>
    <tfoot>
      <tr class="total-row">
        <td class="text-left"><strong>Total</strong></td>
        <td class="text-center">—</td>
        <td class="num text-center"><strong>${fmtPctSmart(totalPct)}</strong></td>
        <td class="num text-center"><strong>${fmtCurrency(totalExposure)}</strong></td>
        <td class="text-center">—</td>
        <td class="text-center">—</td>
      </tr>
    </tfoot>
  </table></div>`;
  
  // Show add button only in edit mode
  if (editMode) {
    html += `<button class="btn btn-sm" onclick="showAddParticipationModal(${projectId}, ${loanId || 'null'})" style="margin-top: 16px;">+ Add Participation</button>`;
  }
  
  return html;
}

function buildAllCovenants(projectId, loanId, isEditMode = false) {
  if (!projectId) return "<div class='empty'>No project data</div>";
  
  // Use global edit mode if available, otherwise use parameter
  const editMode = globalEditMode || isEditMode;
  
  // Filter by FinancingType based on current view (construction or permanent)
  // Map currentView to FinancingType: "construction" -> "Construction", "permanent" -> "Permanent"
  const financingType = currentView === "permanent" ? "Permanent" : "Construction";
  
  let covenants = window.COVENANTS_DATA.filter(c => {
    if (c.ProjectId !== projectId) return false;
    // Filter by FinancingType if it exists, otherwise show all (for backward compatibility)
    if (c.FinancingType) {
      return c.FinancingType === financingType;
    }
    // If FinancingType is not set, only show in construction view (default behavior)
    return currentView === "construction";
  });
  
  if (loanId) {
    covenants = covenants.filter(c => c.LoanId === loanId);
  }
  
  if (covenants.length === 0) {
    let emptyHtml = "<div class='empty'>No covenants found</div>";
    // Add button to add covenant if in edit mode
    if (editMode) {
      emptyHtml += `<div style="margin-top: 16px; text-align: center;">
        <button class="btn btn-sm" onclick="showAddCovenantModal(${projectId}, ${loanId || 'null'})">+ Add Covenant</button>
      </div>`;
    }
    return emptyHtml;
  }
  
  let html = "<div class='data-table'><table><thead><tr><th class='text-left'>Type</th><th class='text-center'>Date</th><th class='text-center'>Requirement/Details</th><th class='text-center'>Projected Value</th><th class='text-center'>Actions</th></tr></thead><tbody>";
  
  for (const cov of covenants) {
    // Get type-specific display values
    let dateDisplay = "—";
    let requirementDisplay = "—";
    let projectedDisplay = "—";
    
    if (cov.CovenantType === 'DSCR') {
      dateDisplay = fmtDate(cov.DSCRTestDate) || "—";
      requirementDisplay = cov.DSCRRequirement || "—";
      projectedDisplay = cov.ProjectedDSCR || "—";
      if (cov.ProjectedInterestRate) {
        requirementDisplay = `${requirementDisplay}${requirementDisplay !== "—" ? " / " : ""}Rate: ${cov.ProjectedInterestRate}`;
      }
    } else if (cov.CovenantType === 'Occupancy') {
      dateDisplay = fmtDate(cov.OccupancyCovenantDate) || "—";
      requirementDisplay = cov.OccupancyRequirement || "—";
      projectedDisplay = cov.ProjectedOccupancy || "—";
    } else if (cov.CovenantType === 'Liquidity Requirement') {
      dateDisplay = "—";
      requirementDisplay = cov.LiquidityRequirementLendingBank ? fmtCurrency(cov.LiquidityRequirementLendingBank) : "—";
      projectedDisplay = "—";
    } else if (cov.CovenantType === 'Other') {
      dateDisplay = fmtDate(cov.CovenantDate) || "—";
      requirementDisplay = cov.Requirement || "—";
      projectedDisplay = cov.ProjectedValue || "—";
    } else {
      // Fallback for unknown types
      dateDisplay = fmtDate(cov.CovenantDate) || "—";
      requirementDisplay = cov.Requirement || "—";
      projectedDisplay = cov.ProjectedValue || "—";
    }
    
    // Check if covenant has notes
    const hasNotes = cov.Notes && cov.Notes.trim().length > 0;
    // Use data attribute to avoid escaping issues
    const notesDataAttr = hasNotes ? `data-notes="${(cov.Notes || "").replace(/"/g, '&quot;').replace(/'/g, '&#39;')}"` : '';
    
    html += `<tr>
      <td class="text-left">${cov.CovenantType || "—"}</td>
      <td class="text-center">${dateDisplay}</td>
      <td class="text-center">${requirementDisplay}</td>
      <td class="text-center">${projectedDisplay}</td>
      <td class="text-center">
        ${hasNotes ? `<button class="btn btn-sm" onclick="showCovenantNotesFromButton(this)" ${notesDataAttr} style="margin-right: 8px;">View Notes</button>` : ''}
        ${editMode ? `<button class="btn btn-sm" onclick="showEditCovenantModal(${cov.CovenantId}, ${projectId}, ${loanId || 'null'})" style="margin-right: 8px;">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCovenantById(${cov.CovenantId})" style="padding: 4px 8px; font-size: 11px;">Delete</button>` : ''}
      </td>
    </tr>`;
  }
  
  html += "</tbody></table></div>";
  
  // Show Add button only in edit mode
  if (editMode) {
    html += `<div style="margin-top: 16px;">
      <button class="btn btn-sm" onclick="showAddCovenantModal(${projectId}, ${loanId || 'null'})">+ Add Covenant</button>
    </div>`;
  }
    
    return html;
}

function buildPersonalGuarantees(projectId, isEditMode = false) {
  // Use global edit mode instead of parameter
  isEditMode = globalEditMode;
  
  if (!projectId) return "<div class='empty'>No project data</div>";
  
  // Filter by FinancingType based on current view (construction or permanent)
  // Map currentView to FinancingType: "construction" -> "Construction", "permanent" -> "Permanent"
  const financingType = currentView === "permanent" ? "Permanent" : "Construction";
  
  const guarantees = window.GUARANTES_DATA.filter(g => {
    if (g.ProjectId !== projectId) return false;
    // Filter by FinancingType if it exists, otherwise show all (for backward compatibility)
    if (g.FinancingType) {
      return g.FinancingType === financingType;
    }
    // If FinancingType is not set, only show in construction view (default behavior)
    return currentView === "construction";
  });
  const people = window.PEOPLE_DATA || [];
  
  if (guarantees.length === 0) {
    let emptyHtml = "<div class='empty'>No personal guarantees found</div>";
    // Add button to add guarantee if in edit mode
    if (isEditMode) {
      emptyHtml += `<div style="margin-top: 16px; text-align: center;">
        <button class="btn btn-sm" onclick="showAddGuaranteeModal(${projectId})">+ Add Guarantee</button>
      </div>`;
    }
    return emptyHtml;
  }
  
  // Build table header - include Actions column only in edit mode
  let html = "<div class='data-table'><table><thead><tr><th class='text-left'>Person</th><th class='text-center'>Guarantee %</th><th class='text-center'>Amount</th>";
  if (isEditMode) {
    html += "<th class='text-center'>Actions</th>";
  }
  html += "</tr></thead><tbody>";
  
  for (const guar of guarantees) {
    const person = people.find(p => p.PersonId === guar.PersonId);
    const personName = person?.FullName || `Person ID ${guar.PersonId}`;
    const pct = fmtPctSmart(guar.GuaranteePercent);
    const amount = fmtCurrency(guar.GuaranteeAmount || 0);
    const personNameEscaped = personName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const guaranteePercent = guar.GuaranteePercent || 0;
    const guaranteeAmount = guar.GuaranteeAmount || 0;
    
    html += `<tr>
      <td class="text-left">${personName}</td>
      <td class="num text-center">${pct}</td>
      <td class="num text-center">${amount}</td>`;
    
    if (isEditMode) {
      html += `<td class="text-center">
        <button class="btn btn-sm" onclick="showEditGuaranteeModal(${guar.GuaranteeId}, ${projectId}, ${guar.PersonId}, '${personNameEscaped}', ${guaranteePercent}, ${guaranteeAmount})" style="margin-right: 8px;">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteGuaranteeById(${guar.GuaranteeId})">Delete</button>
      </td>`;
    }
    
    html += `</tr>`;
  }
  
  // Calculate totals
  const totalPct = guarantees.reduce((sum, g) => sum + num(g.GuaranteePercent || 0), 0);
  const totalAmount = guarantees.reduce((sum, g) => sum + num(g.GuaranteeAmount || 0), 0);
  
  html += `</tbody>
    <tfoot>
      <tr class="total-row">
        <td class="text-left"><strong>Total</strong></td>
        <td class="num text-center"><strong>${fmtPctSmart(totalPct)}</strong></td>
        <td class="num text-center"><strong>${fmtCurrency(totalAmount)}</strong></td>`;
  
  if (isEditMode) {
    html += `<td class="text-center">—</td>`;
  }
  
  html += `</tr>
    </tfoot>
  </table></div>`;
  
  // Show Add button only in edit mode
  if (isEditMode) {
    html += `<div style="margin-top: 16px;">
      <button class="btn btn-sm" onclick="showAddGuaranteeModal(${projectId})">+ Add Guarantee</button>
    </div>`;
  }
  
  return html;
}

function buildEquityCommitments(projectId, isEditMode = false) {
  if (!projectId) return "<div class='empty'>No project data</div>";
  
  // Get project name to match with IMS data
  const project = window.PROJECTS_DATA.find(p => p.ProjectId === projectId);
  const projectName = project?.ProjectName || "";
  
  // Get equity commitments from API
  let commitments = window.EQUITY_COMMITMENTS_DATA.filter(e => e.ProjectId === projectId);
  const partners = window.EQUITY_PARTNERS_DATA || [];
  const imsData = window.IMS_DATA || [];
  
  // Create a lookup map for investor IDs to names from IMS data
  const imsInvestorMap = new Map();
  for (const ims of imsData) {
    const investorId = ims.InvestorId || ims.EquityPartnerId;
    const investorName = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
    if (investorId && investorName && investorId !== investorName) {
      imsInvestorMap.set(String(investorId), investorName);
    }
  }
  
  // Helper function to resolve investor name from ID
  function resolveInvestorName(partnerId, commit) {
    if (commit._partnerName) {
      return commit._partnerName;
    }
    const partner = partners.find(p => 
      p.EquityPartnerId === partnerId || 
      String(p.EquityPartnerId) === String(partnerId)
    );
    if (partner?.PartnerName) {
      return partner.PartnerName;
    }
    const imsName = imsInvestorMap.get(String(partnerId));
    if (imsName) {
      return imsName;
    }
    for (const ims of imsData) {
      const imsId = ims.InvestorId || ims.EquityPartnerId;
      if (String(imsId) === String(partnerId)) {
        const name = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
        if (name && name !== String(partnerId)) {
          return name;
        }
      }
    }
    return null;
  }
  
  // Helper function to get investor rep details from equity partner
  function getInvestorRepDetails(partnerId) {
    if (!partnerId) return null;
    const partner = partners.find(p => 
      p.EquityPartnerId === partnerId || 
      String(p.EquityPartnerId) === String(partnerId)
    );
    if (!partner) return null;
    
    // First try to get contact from InvestorRepId (new way - populated from core.Person)
    // The API returns InvestorRepName, InvestorRepEmail, InvestorRepPhone from the joined Person table
    if (partner.InvestorRepId) {
      // Check if we have the populated fields from the API
      if (partner.InvestorRepName || partner.InvestorRepEmail || partner.InvestorRepPhone) {
        return {
          name: partner.InvestorRepName || null,
          email: partner.InvestorRepEmail || null,
          phone: partner.InvestorRepPhone || null
        };
      }
      // Fallback: look up in PEOPLE_DATA if populated fields not available
      const contacts = window.PEOPLE_DATA || [];
      const contact = contacts.find(c => c.PersonId === partner.InvestorRepId);
      if (contact) {
        return {
          name: contact.FullName || null,
          email: contact.Email || null,
          phone: contact.Phone || null
        };
      }
    }
    
    // Fallback to legacy individual fields (for backward compatibility)
    return {
      name: partner.InvestorRepName || null,
      email: partner.InvestorRepEmail || null,
      phone: partner.InvestorRepPhone || null
    };
  }
  
  // Helper function to format investor rep details HTML
  function formatInvestorRepHtml(repDetails, label = "Investor Rep", uniqueId = null) {
    if (!repDetails || (!repDetails.name && !repDetails.email && !repDetails.phone)) {
      return "";
    }
    const id = uniqueId || `rep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return `<div class="investor-rep-container" style="margin-top: 8px;">
      <div class="investor-rep-header" onclick="toggleInvestorRep('${id}')" style="cursor: pointer; padding: 6px 8px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; user-select: none;">
        <span class="rep-toggle-icon" id="rep-toggle-${id}" style="font-size: 10px; transition: transform 0.2s;">▶</span>
        <span>${label}</span>
        </div>
      <div class="investor-rep-content" id="rep-content-${id}" style="display: none; padding: 8px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 12px; line-height: 1.6; margin-top: 4px;">
        ${repDetails.name ? `<div style="margin-bottom: 4px;"><strong>Name:</strong> ${repDetails.name}</div>` : ''}
        ${repDetails.email ? `<div style="margin-bottom: 4px;"><strong>Email:</strong> <a href="mailto:${repDetails.email}" style="color: var(--stoa-green); text-decoration: none;">${repDetails.email}</a></div>` : ''}
        ${repDetails.phone ? `<div><strong>Phone:</strong> <a href="tel:${repDetails.phone}" style="color: var(--stoa-green); text-decoration: none;">${repDetails.phone}</a></div>` : ''}
      </div>
    </div>`;
  }
  
  // Helper function to format related parties HTML
  function formatRelatedPartiesHtml(commitment, uniqueId = null) {
    const relatedParties = commitment.RelatedParties || [];
    if (relatedParties.length === 0) {
      return "";
    }
    
    const id = uniqueId || `related-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let relatedPartiesHtml = `<div class="related-parties-container" style="margin-top: 8px;">
      <div class="related-parties-header" onclick="toggleRelatedParties('${id}')" style="cursor: pointer; padding: 6px 8px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; user-select: none;">
        <span class="related-toggle-icon" id="related-toggle-${id}" style="font-size: 10px; transition: transform 0.2s;">▶</span>
        <span>Related Parties (${relatedParties.length})</span>
      </div>
      <div class="related-parties-content" id="related-content-${id}" style="display: none; padding: 8px; background: var(--surface-2); border-radius: var(--radius-sm); font-size: 12px; line-height: 1.6; margin-top: 4px;">`;
    
    for (const relatedParty of relatedParties) {
      const partyName = relatedParty.PartnerName || resolveInvestorName(relatedParty.EquityPartnerId, {}) || `Partner ID ${relatedParty.EquityPartnerId}`;
      const repDetails = getInvestorRepDetails(relatedParty.EquityPartnerId);
      
      relatedPartiesHtml += `<div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line);">
        <div style="font-weight: 600; margin-bottom: 4px; color: var(--ink);">${partyName}</div>`;
      
      if (repDetails && (repDetails.name || repDetails.email || repDetails.phone)) {
        relatedPartiesHtml += `<div style="margin-left: 12px; font-size: 11px; color: var(--ink-soft);">
          ${repDetails.name ? `<div><strong>Rep:</strong> ${repDetails.name}</div>` : ''}
          ${repDetails.email ? `<div><strong>Email:</strong> <a href="mailto:${repDetails.email}" style="color: var(--stoa-green); text-decoration: none;">${repDetails.email}</a></div>` : ''}
          ${repDetails.phone ? `<div><strong>Phone:</strong> <a href="tel:${repDetails.phone}" style="color: var(--stoa-green); text-decoration: none;">${repDetails.phone}</a></div>` : ''}
        </div>`;
      }
      
      relatedPartiesHtml += `</div>`;
    }
    
    relatedPartiesHtml += `</div></div>`;
    return relatedPartiesHtml;
  }
  
  // Also get IMS data for this project
  const projIMS = imsData.filter(ims => {
    const imsProperty = String(ims.Property || ims.ProjectName || "").toLowerCase().trim();
    const projName = String(projectName).toLowerCase().trim();
    return imsProperty === projName || imsProperty.includes(projName) || projName.includes(imsProperty);
  });
  
  // Merge IMS equity data
  for (const ims of projIMS) {
    const investorId = ims.InvestorId || ims.EquityPartnerId;
    const investorName = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
    const amount = num(ims.EquityAmount || ims.InvestorAmount || ims.Amount || 0);
    
    if ((investorId || investorName) && amount > 0) {
      const partnerId = investorId || `ims-${investorName}`;
      const partnerName = investorName || imsInvestorMap.get(String(investorId));
      
      // Check if we already have this commitment from API
      const existing = commitments.find(c => {
        const cPartnerId = c.EquityPartnerId;
        const cPartnerName = resolveInvestorName(cPartnerId, c);
        return (String(cPartnerId) === String(partnerId) || cPartnerName === partnerName) &&
               Math.abs(num(c.Amount) - amount) < 1;
      });
      
      if (!existing) {
        commitments.push({
          EquityCommitmentId: `ims-${projectId}-${partnerId}`,
          ProjectId: projectId,
          EquityPartnerId: partnerId,
          _partnerId: investorId,
          _partnerName: partnerName || investorName,
          EquityType: ims.EquityType || ims.Type || "Pref",
          Amount: amount,
          FundingDate: ims.FundingDate || ims.Date || null,
          _fromIMS: true
        });
      }
    }
  }
  
  if (commitments.length === 0) {
    return "<div class='empty'>No equity commitments found</div>";
  }
  
  // Group commitments by partner name
  const partnerGroups = new Map();
  let totalAmount = 0;
  
  for (const commit of commitments) {
    const partnerId = commit.EquityPartnerId || commit._partnerId;
    const partnerName = resolveInvestorName(partnerId, commit) || commit._partnerName;
    
    // Skip if we can't resolve a name and the ID looks like a code
    if (!partnerName && partnerId && /^\d+$/.test(String(partnerId))) {
      continue; // Skip unresolved numeric IDs
    }
    
    const displayName = partnerName || `Unknown Investor (${partnerId})`;
    
    if (!partnerGroups.has(displayName)) {
      partnerGroups.set(displayName, {
        partnerName: displayName,
        partnerId: partnerId,
        commitments: [],
        totalAmount: 0,
        hasIMS: false
      });
    }
    
    const group = partnerGroups.get(displayName);
    group.commitments.push(commit);
    group.totalAmount += num(commit.Amount || 0);
    if (commit._fromIMS) group.hasIMS = true;
    totalAmount += num(commit.Amount || 0);
  }
  
  // Sort commitments within each group by funding date (most recent first)
  for (const group of partnerGroups.values()) {
    group.commitments.sort((a, b) => {
      const dateA = new Date(a.FundingDate || 0).getTime();
      const dateB = new Date(b.FundingDate || 0).getTime();
      return dateB - dateA; // Descending
    });
  }
  
  // Build table with consolidated view
  const uniqueKey = `equity-${projectId}`;
  let html = `<div class='data-table equity-commitments-table' data-project-id="${projectId}">
    <table>
      <thead>
        <tr>
          <th class="text-left col-partner">Equity Partner</th>
          <th class="text-center col-type">Type</th>
          <th class="text-right col-amount">Amount</th>
          <th class="text-right col-date">Funding Date</th>
          <th class="text-center col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>`;
  
  // Helper function to get investor rep details from equity partner
  function getInvestorRepDetails(partnerId) {
    if (!partnerId) return null;
    const partner = partners.find(p => 
      p.EquityPartnerId === partnerId || 
      String(p.EquityPartnerId) === String(partnerId)
    );
    if (!partner) return null;
    
    // First try to get contact from InvestorRepId (new way - populated from core.Person)
    // The API returns InvestorRepName, InvestorRepEmail, InvestorRepPhone from the joined Person table
    if (partner.InvestorRepId) {
      // Check if we have the populated fields from the API
      if (partner.InvestorRepName || partner.InvestorRepEmail || partner.InvestorRepPhone) {
        return {
          name: partner.InvestorRepName || null,
          email: partner.InvestorRepEmail || null,
          phone: partner.InvestorRepPhone || null
        };
      }
      // Fallback: look up in PEOPLE_DATA if populated fields not available
      const contacts = window.PEOPLE_DATA || [];
      const contact = contacts.find(c => c.PersonId === partner.InvestorRepId);
      if (contact) {
        return {
          name: contact.FullName || null,
          email: contact.Email || null,
          phone: contact.Phone || null
        };
      }
    }
    
    // Fallback to legacy individual fields (for backward compatibility)
    return {
      name: partner.InvestorRepName || null,
      email: partner.InvestorRepEmail || null,
      phone: partner.InvestorRepPhone || null
    };
  }
  
  // Render consolidated partner rows
  for (const [partnerName, group] of partnerGroups.entries()) {
    const isExpanded = expandedEquityPartners.has(`${uniqueKey}-${partnerName}`);
    const commitmentCount = group.commitments.length;
    const hasMultiple = commitmentCount > 1;
    
    // Main consolidated row
    const partnerNameEscaped = partnerName.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const firstCommit = group.commitments[0];
    const isFromIMS = firstCommit._fromIMS || false;
    
    // Get investor rep details for lead investor
    const leadPartnerId = firstCommit.EquityPartnerId || group.partnerId;
    const investorRep = getInvestorRepDetails(leadPartnerId);
    
    // Get related parties for the first commitment (for consolidated view, show related parties from first commitment)
    // For individual commitments, we'll show their own related parties
    const repId = `rep-${projectId}-${leadPartnerId}-${partnerNameEscaped}`;
    const relatedId = `related-${projectId}-${leadPartnerId}-${partnerNameEscaped}`;
    const relatedPartiesHtml = formatRelatedPartiesHtml(firstCommit, relatedId);
    const investorRepHtml = formatInvestorRepHtml(investorRep, "Investor Rep", repId);
    
    // For single commitments, show Edit/Delete buttons only in edit mode
    // For multiple commitments, show Bulk Edit button
    let actionsHtml = "";
    if (hasMultiple && isEditMode) {
      // Bulk edit button for multiple commitments (only for non-IMS commitments)
      const nonIMSCommitments = group.commitments.filter(c => !c._fromIMS);
      if (nonIMSCommitments.length > 0) {
        const commitmentIds = nonIMSCommitments.map(c => c.EquityCommitmentId);
        const editableCount = commitmentIds.length;
        const totalCount = group.commitments.length;
        const titleText = editableCount === totalCount 
          ? `Bulk edit equity type for all ${editableCount} commitments`
          : `Bulk edit equity type for ${editableCount} of ${totalCount} commitments (${totalCount - editableCount} are read-only from IMS)`;
        const partnerNameEscapedForJS = partnerNameEscaped.replace(/'/g, "\\'");
        actionsHtml = `<td class="text-center col-actions">
          <button class="btn btn-sm" onclick="bulkEditEquityType([${commitmentIds.join(',')}], '${partnerNameEscapedForJS}')" title="${titleText}">Bulk Edit</button>
        </td>`;
  } else {
        // All commitments are from IMS
        actionsHtml = `<td class="text-center col-actions"><span class="text-muted">Read-only (IMS)</span></td>`;
      }
    } else if (!hasMultiple && !isFromIMS && isEditMode) {
      const equityTypeEscaped = (firstCommit.EquityType || "").replace(/'/g, "\\'");
      const fundingDateEscaped = (firstCommit.FundingDate || "").replace(/'/g, "\\'");
      actionsHtml = `<td class="text-center col-actions">
        <button class="btn btn-sm" onclick="showEditEquityCommitmentModal(${firstCommit.EquityCommitmentId}, ${firstCommit.ProjectId}, ${firstCommit.EquityPartnerId || 'null'}, '${equityTypeEscaped}', ${firstCommit.Amount || 0}, '${fundingDateEscaped}')" style="margin-right: 8px;">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEquityCommitmentById(${firstCommit.EquityCommitmentId})">Delete</button>
      </td>`;
    } else if (isFromIMS) {
      actionsHtml = `<td class="text-center col-actions"><span class="text-muted">Read-only (IMS)</span></td>`;
  } else {
      actionsHtml = `<td class="text-center col-actions">—</td>`;
    }
    
    // Collect all unique equity types for this partner
    const equityTypes = new Set();
    group.commitments.forEach(commit => {
      if (commit.EquityType && commit.EquityType.trim()) {
        equityTypes.add(commit.EquityType.trim());
      }
    });
    const equityTypesArray = Array.from(equityTypes).sort();
    const equityTypesDisplay = equityTypesArray.length > 0 
      ? equityTypesArray.join(", ") 
      : (firstCommit.EquityType || "—");
    
    html += `<tr class="partner-row ${isExpanded ? 'expanded' : ''}" data-partner="${partnerNameEscaped}" data-project="${projectId}">
      <td class="text-left col-partner" title="${partnerName}">
        ${hasMultiple ? `<span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>` : '<span class="expand-icon-placeholder"></span>'}
        <span class="partner-name-text">${partnerName}</span>
        ${isEditMode && leadPartnerId && !isFromIMS ? `<button class="btn btn-xs" onclick="showEditEquityPartnerModal(${leadPartnerId})" style="margin-left: 8px; padding: 2px 6px; font-size: 10px;" title="Edit investor rep details">Edit Rep</button>` : ''}
        ${group.hasIMS ? '<span class="ims-badge">(IMS)</span>' : ''}
        ${hasMultiple ? `<span class="commitment-count">(${commitmentCount})</span>` : ''}
        ${investorRepHtml}
        ${relatedPartiesHtml}
      </td>
      <td class="text-center col-type">${equityTypesDisplay}</td>
      <td class="text-right num col-amount"><strong>${fmtCurrency(group.totalAmount)}</strong></td>
      <td class="text-right col-date">${fmtDate(firstCommit.FundingDate)}</td>
      ${actionsHtml}
    </tr>`;
    
    // Expanded detail rows (individual commitments)
    if (isExpanded && hasMultiple) {
      for (const commit of group.commitments) {
        const amount = fmtCurrency(commit.Amount || 0);
        const fundingDate = fmtDate(commit.FundingDate);
        const commitIsFromIMS = commit._fromIMS || false;
        
        // Get investor rep and related parties for this individual commitment
        const commitPartnerId = commit.EquityPartnerId;
        const commitInvestorRep = getInvestorRepDetails(commitPartnerId);
        const commitRepId = `rep-${projectId}-${commit.EquityCommitmentId}-${commitPartnerId}`;
        const commitRelatedId = `related-${projectId}-${commit.EquityCommitmentId}-${commitPartnerId}`;
        const commitInvestorRepHtml = formatInvestorRepHtml(commitInvestorRep, "Investor Rep", commitRepId);
        const commitRelatedPartiesHtml = formatRelatedPartiesHtml(commit, commitRelatedId);
        
        html += `<tr class="commitment-detail-row ${commitIsFromIMS ? 'ims-data' : ''}">
          <td class="text-left col-partner indent">
            <span class="detail-indicator">└─</span>
            <span class="text-muted">Individual commitment</span>
            ${commitInvestorRepHtml}
            ${commitRelatedPartiesHtml}
          </td>
          <td class="text-center col-type">${commit.EquityType || "—"}</td>
          <td class="text-right num col-amount">${amount}</td>
          <td class="text-right col-date">${fundingDate}</td>`;
        // Show Edit/Delete buttons only in edit mode for non-IMS commitments
        if (!commitIsFromIMS && isEditMode) {
          const equityTypeEscaped = (commit.EquityType || "").replace(/'/g, "\\'");
          const fundingDateEscaped = (commit.FundingDate || "").replace(/'/g, "\\'");
          html += `<td class="text-center col-actions">
            <button class="btn btn-sm" onclick="showEditEquityCommitmentModal(${commit.EquityCommitmentId}, ${commit.ProjectId}, ${commit.EquityPartnerId || 'null'}, '${equityTypeEscaped}', ${commit.Amount || 0}, '${fundingDateEscaped}')" style="margin-right: 8px;">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteEquityCommitmentById(${commit.EquityCommitmentId})">Delete</button>
          </td>`;
        } else if (commitIsFromIMS) {
          html += `<td class="text-center col-actions"><span class="text-muted">Read-only (IMS)</span></td>`;
        } else {
          html += `<td class="text-center col-actions">—</td>`;
        }
        html += `</tr>`;
      }
    }
  }
  
  // Add total row
  html += `</tbody>
      <tfoot>
        <tr class="total-row">
          <td class="text-left col-partner"><strong>Total</strong></td>
          <td class="text-center col-type">—</td>
          <td class="text-right num col-amount"><strong>${fmtCurrency(totalAmount)}</strong></td>
          <td class="text-right col-date">—</td>
          <td class="text-center col-actions">—</td>
        </tr>
      </tfoot>
    </table>
  </div>`;
  
  // Note: Expand/collapse is handled via event delegation in bindEvents()
  
  html += `</div>`;
  
  // Only show Add button in edit mode (separate from table container)
  if (isEditMode) {
    html += `<div class="equity-add-button-container" style="margin-top: 16px;">
      <button class="btn btn-sm" onclick="showAddEquityCommitmentModal(${projectId})">+ Add Equity Commitment</button>
    </div>`;
  }
  
  return html;
}

/* ---------- Participation Modal Functions ---------- */
function showAddParticipationModal(projectId, loanId) {
  const modal = $("#addParticipationModal");
  const form = $("#participationForm");
  const bankSearch = $("#participationBankSearch");
  const bankDropdown = $("#participationBankDropdown");
  const bankSelect = $("#participationBankSelect");
  const title = $("#participationModalTitle");
  
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  form.dataset.mode = "add";
  form.dataset.projectId = projectId;
  form.dataset.loanId = loanId || "";
  title.textContent = "Add Participation";
  
  // Clear search input
  if (bankSearch) bankSearch.value = "";
  if (bankDropdown) bankDropdown.style.display = "none";
  
  // Set default FinancingType based on current view
  const financingTypeSelect = $("#participationFinancingType");
  if (financingTypeSelect) {
    if (currentView === "construction") {
      financingTypeSelect.value = "Construction";
    } else if (currentView === "permanent") {
      financingTypeSelect.value = "Permanent";
    } else {
      financingTypeSelect.value = "";
    }
  }
  
  // Setup searchable bank dropdown
  const banks = window.BANKS_DATA || [];
  if (bankSearch && bankDropdown && bankSelect) {
    // Sort banks alphabetically for better UX
    const sortedBanks = [...banks].sort((a, b) => {
      const nameA = (a.BankName || '').toLowerCase();
      const nameB = (b.BankName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    setupSearchableBankDropdown(
      "#participationBankSearch",
      "#participationBankDropdown",
      "#participationBankSelect",
      sortedBanks,
      (bankId, bankName) => {
        // Optional callback when bank is selected
      }
    );
  }
  
  // Show modal
  modal.style.display = "flex";
}

function showEditParticipationModal(participationId, projectId, loanId) {
  const modal = $("#addParticipationModal");
  const form = $("#participationForm");
  const bankSearch = $("#participationBankSearch");
  const bankDropdown = $("#participationBankDropdown");
  const bankSelect = $("#participationBankSelect");
  const title = $("#participationModalTitle");
  const percentInput = $("#participationPercent");
  const exposureInput = $("#participationExposure");
  const paidOffSelect = $("#participationPaidOff");
  
  if (!modal || !form) return;
  
  // Find the participation
  const participations = window.PARTICIPATIONS_DATA || [];
  const participation = participations.find(p => p.ParticipationId === participationId);
  
  if (!participation) {
    alert("Participation not found");
    return;
  }
  
  // Reset form
  form.reset();
  form.dataset.mode = "edit";
  form.dataset.participationId = participationId;
  form.dataset.projectId = projectId;
  form.dataset.loanId = loanId || "";
  title.textContent = "Edit Participation";
  
  // Populate form fields
  if (bankSelect) bankSelect.value = participation.BankId || "";
  if (bankSearch) {
    const banks = window.BANKS_DATA || [];
    const bank = banks.find(b => b.BankId === participation.BankId);
    bankSearch.value = bank?.BankName || "";
  }
  
  // Populate form fields - calculate percentage from exposure and loan amount
  if (exposureInput) {
    exposureInput.value = participation.ExposureAmount || "";
    
    // Calculate and display percentage when editing
    const loans = window.LOANS_DATA || [];
    let loanAmount = 0;
    
    if (loanId) {
      const loan = loans.find(l => l.LoanId === loanId);
      loanAmount = loan?.LoanAmount || loan?.PermanentLoanAmount || 0;
      } else {
      const projectLoans = loans.filter(l => l.ProjectId === projectId);
      const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
      const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
      loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
    }
    
    if (loanAmount && loanAmount > 0 && participation.ExposureAmount) {
      const calculatedPercent = (participation.ExposureAmount / loanAmount) * 100;
      if (percentInput) percentInput.value = calculatedPercent.toFixed(2);
    } else {
      // Fallback to stored value if calculation not possible
      const pctValue = String(participation.ParticipationPercent || "").replace('%', '');
      if (percentInput) percentInput.value = parseFloat(pctValue) || "";
    }
  }
  
  if (paidOffSelect) paidOffSelect.value = participation.PaidOff ? "true" : "false";
  
  // Populate FinancingType field
  const financingTypeSelect = $("#participationFinancingType");
  if (financingTypeSelect) {
    financingTypeSelect.value = participation.FinancingType || "";
  }
  
  // Setup searchable bank dropdown
  const banks = window.BANKS_DATA || [];
  if (bankSearch && bankDropdown && bankSelect) {
    // Sort banks alphabetically for better UX
    const sortedBanks = [...banks].sort((a, b) => {
      const nameA = (a.BankName || '').toLowerCase();
      const nameB = (b.BankName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    setupSearchableBankDropdown(
      "#participationBankSearch",
      "#participationBankDropdown",
      "#participationBankSelect",
      sortedBanks,
      (bankId, bankName) => {
        // Optional callback when bank is selected
      }
    );
  }
  
  // Add real-time calculation of percentage when exposure amount changes
  const exposureInputForCalc = $("#participationExposure");
  const percentInputForCalc = $("#participationPercent");
  
  if (exposureInputForCalc && percentInputForCalc) {
    // Remove any existing listeners by cloning the input
    const newExposureInput = exposureInputForCalc.cloneNode(true);
    exposureInputForCalc.parentNode.replaceChild(newExposureInput, exposureInputForCalc);
    
    newExposureInput.addEventListener("input", () => {
      const amount = parseFloat(newExposureInput.value);
      if (isNaN(amount) || amount <= 0) {
        if (percentInputForCalc) percentInputForCalc.value = "";
      return;
    }
      
      // Get loan amount for this project
      const loans = window.LOANS_DATA || [];
      let loanAmount = 0;
      
      if (loanId) {
        const loan = loans.find(l => l.LoanId === loanId);
        loanAmount = loan?.LoanAmount || loan?.PermanentLoanAmount || 0;
      } else {
        const projectLoans = loans.filter(l => l.ProjectId === projectId);
        const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
        const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
        loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
      }
      
      if (loanAmount && loanAmount > 0) {
        const calculatedPercent = (amount / loanAmount) * 100;
        if (percentInputForCalc) percentInputForCalc.value = calculatedPercent.toFixed(2);
      } else {
        if (percentInputForCalc) percentInputForCalc.value = "";
      }
    });
  }
  
  // Show modal
  modal.style.display = "flex";
}

// Handle participation form submission
function setupParticipationModal() {
  const modal = $("#addParticipationModal");
  const form = $("#participationForm");
  const cancelBtn = $("#cancelParticipationModalBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const mode = form.dataset.mode || "add";
    const projectId = parseInt(form.dataset.projectId);
    const loanId = form.dataset.loanId ? parseInt(form.dataset.loanId) : null;
    
    // Get bank ID from hidden select (updated by searchable dropdown)
    const bankSelect = $("#participationBankSelect");
    const bankSearch = $("#participationBankSearch");
    let bankId = null;
    
    // Try to get bank ID from select first
    if (bankSelect && bankSelect.value) {
      bankId = parseInt(bankSelect.value);
    }
    
    // If select doesn't have value, try to find bank by name from search input
    if (!bankId && bankSearch && bankSearch.value) {
      const banks = window.BANKS_DATA || [];
      const bankName = bankSearch.value.trim();
      const matchedBank = banks.find(b => 
        (b.BankName || '').toLowerCase() === bankName.toLowerCase()
      );
      if (matchedBank) {
        bankId = matchedBank.BankId;
        // Update the select for consistency
        if (bankSelect) bankSelect.value = bankId;
      }
    }
    
    const exposureAmount = parseFloat($("#participationExposure").value);
    const financingType = $("#participationFinancingType").value;
    const paidOff = $("#participationPaidOff").value === "true";
    
    if (!bankId || isNaN(bankId)) {
      alert("Please select a bank");
      return;
    }

    if (!financingType) {
      alert("Please select a financing type (Construction or Permanent Financing)");
      return;
    }

    if (isNaN(exposureAmount) || exposureAmount < 0) {
      alert("Please enter a valid exposure amount");
      return;
    }
    
    // Calculate participation percentage automatically based on loan amount
    const loans = window.LOANS_DATA || [];
    let loanAmount = 0;
    
    if (loanId) {
      // If we have a specific loan ID, use that loan's amount
      const loan = loans.find(l => l.LoanId === loanId);
      loanAmount = loan?.LoanAmount || loan?.PermanentLoanAmount || 0;
    } else {
      // Otherwise, get the construction or permanent loan for this project
      const projectLoans = loans.filter(l => l.ProjectId === projectId);
      const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
      const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
      loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
    }
    
    if (!loanAmount || loanAmount === 0) {
      alert("Cannot calculate participation percentage: No loan amount found. Please ensure the project has a construction or permanent loan.");
      return;
    }
    
    // Calculate percentage: (exposureAmount / loanAmount) * 100
    const participationPercent = (exposureAmount / loanAmount) * 100;
    
    try {
      const data = {
        BankId: bankId,
        FinancingType: financingType,
        ParticipationPercent: `${participationPercent}%`,
        ExposureAmount: exposureAmount,
        PaidOff: paidOff
      };
      
      if (mode === "edit") {
        const participationId = parseInt(form.dataset.participationId);
        await updateParticipation(participationId, data);
    } else {
        // Add mode
        if (loanId) {
          data.ProjectId = projectId;
          data.LoanId = loanId;
          await createParticipation(data);
        } else {
          await createParticipationByProject(projectId, data);
        }
      }
      
      // Automatically set lead bank based on participation percentage
      await updateLeadBankForProject(projectId, loanId, financingType);
      
      // Get property key for preserving expansion
      const propertyKey = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property;
      const activeTab = propertyKey ? sessionStorage.getItem(`tab-${propertyKey}`) : null;
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Optimized update with related data refresh for participations
      if (propertyKey) {
        const currentRow = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
        const projectId = currentRow?.Row || currentRow?._banking?.Row;
        const loanId = currentRow?.LoanId || currentRow?._constructionLoan?.LoanId;
        const permanentLoanId = currentRow?.PermanentLoanId || currentRow?._permanentLoan?.LoanId;
        
        const updatedRow = await updateSinglePropertyData(projectId, loanId, permanentLoanId, true);
        if (updatedRow) {
          await renderAll();
          requestAnimationFrame(() => {
            const detail = document.querySelector(`tr[data-key="${propertyKey}"]`)?.nextElementSibling?.querySelector(".detail");
            if (detail && activeTab) {
              const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
              if (tabButton) {
                tabButton.click();
              }
            }
          });
        } else {
          await preserveAndRestoreExpansion(propertyKey);
        }
      } else {
        await loadAll();
        renderAll();
      }
      
      showSuccessMessage(mode === "edit" ? "Participation updated successfully!" : "Participation added successfully!");
    } catch (error) {
      console.error("Error saving participation:", error);
      alert(`Error: ${error.message}`);
    }
  });
}

/**
 * Automatically sets the lead bank for a project/loan based on participation percentage.
 * The bank with the highest participation % becomes the lead, all others are set to participant.
 * @param {number} projectId - Project ID
 * @param {number|null} loanId - Loan ID (optional)
 * @param {string|null} financingType - FinancingType to filter by (optional)
 */
async function updateLeadBankForProject(projectId, loanId = null, financingType = null) {
  try {
    // Get all participations for this project
    let participations = window.PARTICIPATIONS_DATA || [];
    participations = participations.filter(p => p.ProjectId === projectId);
    
    // Filter by FinancingType if provided
    if (financingType) {
      participations = participations.filter(p => (p.FinancingType || "").trim() === financingType.trim());
    }
    
    // Filter by LoanId if provided
    if (loanId) {
      const loanSpecificParts = participations.filter(p => p.LoanId === loanId);
      if (loanSpecificParts.length > 0) {
        participations = loanSpecificParts;
      }
    }
    
    // If no participations, nothing to update
    if (participations.length === 0) {
      return;
    }
    
    // Find the participation with the highest participation percentage
    let leadParticipation = null;
    let maxParticipation = -1;
    
    for (const part of participations) {
      // Parse participation percentage (handle both "50%" and "50" formats)
      const pctStr = String(part.ParticipationPercent || "0").replace('%', '').trim();
      const pct = parseFloat(pctStr);
      
      if (!isNaN(pct) && pct > maxParticipation) {
        maxParticipation = pct;
        leadParticipation = part;
      }
    }
    
    // If we found a lead participation, update all participations
    if (leadParticipation) {
      const updatePromises = [];
      
      for (const part of participations) {
        const isLead = part.ParticipationId === leadParticipation.ParticipationId;
        const currentIsLead = part.IsLead || false;
        
        // Only update if the IsLead status has changed
        if (currentIsLead !== isLead) {
          updatePromises.push(
            updateParticipation(part.ParticipationId, { IsLead: isLead })
          );
        }
      }
      
      // Update all participations in parallel
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`Updated lead bank for project ${projectId}: Bank ${leadParticipation.BankId} is now lead (${maxParticipation}% participation)`);
        
        // Refresh participations data to reflect the changes
        try {
          const response = await getAllParticipations();
          if (response.success && response.data) {
            window.PARTICIPATIONS_DATA = response.data;
          }
        } catch (refreshError) {
          console.error("Error refreshing participations data:", refreshError);
          // Non-critical error, continue
        }
      }
    }
  } catch (error) {
    console.error("Error updating lead bank for project:", error);
    // Don't throw - this is a background operation, don't block the user
  }
}

async function addParticipation(projectId, loanId, data) {
  try {
    if (loanId) {
      data.ProjectId = projectId;
      data.LoanId = loanId;
      await createParticipation(data);
    } else {
      await createParticipationByProject(projectId, data);
    }
    await loadAll();
    renderAll();
  } catch (error) {
    console.error("Error adding participation:", error);
    alert(`Error: ${error.message}`);
  }
}

async function deleteParticipationById(participationId) {
  if (!confirm("Are you sure you want to delete this participation?")) return;
  try {
    // Find property key before deletion
    const participation = window.PARTICIPATIONS_DATA?.find(p => String(p.ParticipationId) === String(participationId));
    const projectId = participation?.ProjectId;
    const loanId = participation?.LoanId;
    const financingType = participation?.FinancingType;
    const propertyKey = projectId ? (CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property) : null;
    
    await deleteParticipation(participationId);
    
    // Automatically update lead bank after deletion
    if (projectId) {
      await updateLeadBankForProject(projectId, loanId, financingType);
    }
    
    // Preserve and restore expansion using helper function
    if (propertyKey) {
      await preserveAndRestoreExpansion(propertyKey);
    } else {
      await loadAll();
      renderAll();
    }
    
    showSuccessMessage("Participation deleted successfully!");
  } catch (error) {
    console.error("Error deleting participation:", error);
    alert(`Error: ${error.message}`);
  }
}

function showAddCovenantModal(projectId, loanId) {
  const modal = $("#addCovenantModal");
  const form = $("#covenantForm");
  const title = $("#covenantModalTitle");
  
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  form.dataset.mode = "add";
  form.dataset.projectId = projectId;
  form.dataset.loanId = loanId || "";
  
  // Hide all conditional fields
  const dscrFields = $("#dscrFields");
  const occupancyFields = $("#occupancyFields");
  const liquidityFields = $("#liquidityFields");
  const otherFields = $("#otherFields");
  if (dscrFields) dscrFields.style.display = 'none';
  if (occupancyFields) occupancyFields.style.display = 'none';
  if (liquidityFields) liquidityFields.style.display = 'none';
  if (otherFields) otherFields.style.display = 'none';
  
  // Set title
  title.textContent = "Add Covenant";
  
  // Show modal
  modal.style.display = "flex";
}

async function showEditCovenantModal(covenantId, projectId, loanId) {
  const modal = $("#addCovenantModal");
  const form = $("#covenantForm");
  const title = $("#covenantModalTitle");
  
  if (!modal || !form) return;
  
  // Set form mode
  form.dataset.mode = "edit";
  form.dataset.covenantId = covenantId;
  form.dataset.projectId = projectId;
  form.dataset.loanId = loanId || "";
  
  // Set title
  title.textContent = "Edit Covenant";
  
  // Fetch full covenant data
  try {
    const covenant = window.COVENANTS_DATA.find(c => c.CovenantId === covenantId);
    if (!covenant) {
      // Try to fetch from API if not in local data
      const result = await getCovenantById(covenantId);
      if (result && result.success && result.data) {
        await populateCovenantForm(result.data);
      } else {
        alert("Covenant not found");
        return;
      }
    } else {
      await populateCovenantForm(covenant);
    }
    
    // Show modal
    modal.style.display = "flex";
  } catch (error) {
    console.error("Error loading covenant:", error);
    alert("Error loading covenant: " + error.message);
  }
}

// Populate covenant form with data
function populateCovenantForm(covenant) {
  const typeInput = $("#covenantType");
  if (!typeInput) return;
  
  // Set covenant type first
  typeInput.value = covenant.CovenantType || "";
  
  // Trigger change event to show correct fields
  const changeEvent = new Event('change', { bubbles: true });
  typeInput.dispatchEvent(changeEvent);
  
  // Helper to format date for input
  function formatDateForInput(dateValue) {
    if (!dateValue) return "";
    if (typeof dateValue === 'string') {
      if (dateValue.includes('T')) {
        return dateValue.split('T')[0];
      } else if (dateValue.includes('/')) {
        const parts = dateValue.split('/');
        if (parts.length === 3) {
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          let year = parts[2];
          if (year.length === 2) {
            year = '20' + year;
          }
          return `${year}-${month}-${day}`;
        }
      }
      return dateValue;
    }
    return "";
  }
  
  // Populate fields based on type
  if (covenant.CovenantType === 'DSCR') {
    const dscrTestDate = $("#dscrTestDate");
    const projectedInterestRate = $("#projectedInterestRate");
    const dscrRequirement = $("#dscrRequirement");
    const projectedDSCR = $("#projectedDSCR");
    
    if (dscrTestDate) dscrTestDate.value = formatDateForInput(covenant.DSCRTestDate) || "";
    if (projectedInterestRate) projectedInterestRate.value = covenant.ProjectedInterestRate || "";
    if (dscrRequirement) dscrRequirement.value = covenant.DSCRRequirement || "";
    if (projectedDSCR) projectedDSCR.value = covenant.ProjectedDSCR || "";
  } else if (covenant.CovenantType === 'Occupancy') {
    const occupancyCovenantDate = $("#occupancyCovenantDate");
    const occupancyRequirement = $("#occupancyRequirement");
    const projectedOccupancy = $("#projectedOccupancy");
    
    if (occupancyCovenantDate) occupancyCovenantDate.value = formatDateForInput(covenant.OccupancyCovenantDate) || "";
    if (occupancyRequirement) occupancyRequirement.value = covenant.OccupancyRequirement || "";
    if (projectedOccupancy) projectedOccupancy.value = covenant.ProjectedOccupancy || "";
  } else if (covenant.CovenantType === 'Liquidity Requirement') {
    const liquidityRequirementLendingBank = $("#liquidityRequirementLendingBank");
    if (liquidityRequirementLendingBank) {
      liquidityRequirementLendingBank.value = covenant.LiquidityRequirementLendingBank || "";
    }
  } else if (covenant.CovenantType === 'Other') {
    const covenantDate = $("#covenantDate");
    const covenantRequirement = $("#covenantRequirement");
    const covenantProjected = $("#covenantProjected");
    
    if (covenantDate) covenantDate.value = formatDateForInput(covenant.CovenantDate) || "";
    if (covenantRequirement) covenantRequirement.value = covenant.Requirement || "";
    if (covenantProjected) covenantProjected.value = covenant.ProjectedValue || "";
  }
  
  // Populate notes (always visible)
  const notesInput = $("#covenantNotes");
  if (notesInput) notesInput.value = covenant.Notes || "";
}

async function addCovenant(projectId, loanId, data) {
  try {
    if (loanId) {
      data.ProjectId = projectId;
      data.LoanId = loanId;
      await createCovenant(data);
      } else {
      await createCovenantByProject(projectId, data);
      }
    await loadAll();
      renderAll();
  } catch (error) {
    console.error("Error adding covenant:", error);
    alert(`Error: ${error.message}`);
  }
}

// Handle covenant type change to show/hide conditional fields
function setupCovenantTypeChange() {
  const covenantTypeSelect = $("#covenantType");
  if (!covenantTypeSelect) return;
  
  covenantTypeSelect.addEventListener("change", function(e) {
    const covenantType = e.target.value;
    
    // Get all field containers
    const dscrFields = $("#dscrFields");
    const occupancyFields = $("#occupancyFields");
    const liquidityFields = $("#liquidityFields");
    const otherFields = $("#otherFields");
    
    // Hide all conditional fields
    if (dscrFields) dscrFields.style.display = 'none';
    if (occupancyFields) occupancyFields.style.display = 'none';
    if (liquidityFields) liquidityFields.style.display = 'none';
    if (otherFields) otherFields.style.display = 'none';
    
    // Remove required attributes from all conditional inputs
    const allConditionalInputs = document.querySelectorAll('#dscrFields input, #occupancyFields input, #liquidityFields input, #otherFields input');
    allConditionalInputs.forEach(input => {
      input.removeAttribute('required');
      input.value = ''; // Clear values when switching types
    });
    
    // Show relevant fields based on type
    if (covenantType === 'DSCR') {
      if (dscrFields) {
        dscrFields.style.display = 'block';
        const dscrInputs = dscrFields.querySelectorAll('input');
        dscrInputs.forEach(input => {
          if (input.id === 'dscrTestDate') input.setAttribute('required', 'required');
        });
      }
    } else if (covenantType === 'Occupancy') {
      if (occupancyFields) {
        occupancyFields.style.display = 'block';
        const occupancyInputs = occupancyFields.querySelectorAll('input');
        occupancyInputs.forEach(input => {
          if (input.id === 'occupancyCovenantDate') input.setAttribute('required', 'required');
        });
      }
    } else if (covenantType === 'Liquidity Requirement') {
      if (liquidityFields) liquidityFields.style.display = 'block';
    } else if (covenantType === 'Other') {
      if (otherFields) {
        otherFields.style.display = 'block';
        const otherInputs = otherFields.querySelectorAll('input');
        otherInputs.forEach(input => {
          if (input.id === 'covenantDate') input.setAttribute('required', 'required');
        });
      }
    }
  });
}

// Build covenant payload based on type
function buildCovenantPayload(projectId) {
  const covenantType = $("#covenantType")?.value || "";
  // Determine FinancingType based on current view (construction or permanent)
  // Map currentView to FinancingType: "construction" -> "Construction", "permanent" -> "Permanent"
  const financingType = currentView === "permanent" ? "Permanent" : "Construction";
  
  const payload = {
    ProjectId: projectId,
    CovenantType: covenantType,
    FinancingType: financingType, // CRITICAL: Always specify FinancingType to separate Construction vs Permanent
    Notes: $("#covenantNotes")?.value?.trim() || null
  };
  
  // Add fields based on type
  if (covenantType === 'DSCR') {
    const dscrTestDate = $("#dscrTestDate")?.value || null;
    const projectedInterestRate = $("#projectedInterestRate")?.value?.trim() || null;
    const dscrRequirement = $("#dscrRequirement")?.value?.trim() || null;
    const projectedDSCR = $("#projectedDSCR")?.value?.trim() || null;
    
    payload.DSCRTestDate = dscrTestDate;
    payload.ProjectedInterestRate = projectedInterestRate;
    payload.DSCRRequirement = dscrRequirement;
    payload.ProjectedDSCR = projectedDSCR;
  } else if (covenantType === 'Occupancy') {
    const occupancyCovenantDate = $("#occupancyCovenantDate")?.value || null;
    const occupancyRequirement = $("#occupancyRequirement")?.value?.trim() || null;
    const projectedOccupancy = $("#projectedOccupancy")?.value?.trim() || null;
    
    payload.OccupancyCovenantDate = occupancyCovenantDate;
    payload.OccupancyRequirement = occupancyRequirement;
    payload.ProjectedOccupancy = projectedOccupancy;
  } else if (covenantType === 'Liquidity Requirement') {
    const liquidityValue = $("#liquidityRequirementLendingBank")?.value;
    payload.LiquidityRequirementLendingBank = liquidityValue ? parseFloat(liquidityValue) : null;
  } else if (covenantType === 'Other') {
    const covenantDate = $("#covenantDate")?.value || null;
    const requirement = $("#covenantRequirement")?.value?.trim() || null;
    const projectedValue = $("#covenantProjected")?.value?.trim() || null;
    
    payload.CovenantDate = covenantDate;
    payload.Requirement = requirement;
    payload.ProjectedValue = projectedValue;
  }
  
  return payload;
}

// Handle covenant form submission
function setupCovenantModal() {
  const modal = $("#addCovenantModal");
  const form = $("#covenantForm");
  const cancelBtn = $("#cancelCovenantModalBtn");
  
  if (!modal || !form) return;
  
  // Setup covenant type change handler
  setupCovenantTypeChange();
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
    // Hide all conditional fields
    const dscrFields = $("#dscrFields");
    const occupancyFields = $("#occupancyFields");
    const liquidityFields = $("#liquidityFields");
    const otherFields = $("#otherFields");
    if (dscrFields) dscrFields.style.display = 'none';
    if (occupancyFields) occupancyFields.style.display = 'none';
    if (liquidityFields) liquidityFields.style.display = 'none';
    if (otherFields) otherFields.style.display = 'none';
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const mode = form.dataset.mode || "add";
    const projectId = parseInt(form.dataset.projectId);
    const loanId = form.dataset.loanId ? parseInt(form.dataset.loanId) : null;
    const covenantType = $("#covenantType")?.value || "";
    
    if (!covenantType) {
      alert("Please select a Covenant Type");
      return;
    }
    
    // Build payload based on type
    const covenantData = buildCovenantPayload(projectId);
    
    try {
      // Get property key for preserving expansion
      const propertyKey = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property;
      const activeTab = propertyKey ? sessionStorage.getItem(`tab-${propertyKey}`) : null;
      
      if (mode === "edit") {
        const covenantId = parseInt(form.dataset.covenantId);
        await updateCovenant(covenantId, covenantData);
      } else {
        await addCovenant(projectId, loanId, covenantData);
      }
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Hide all conditional fields
      const dscrFields = $("#dscrFields");
      const occupancyFields = $("#occupancyFields");
      const liquidityFields = $("#liquidityFields");
      const otherFields = $("#otherFields");
      if (dscrFields) dscrFields.style.display = 'none';
      if (occupancyFields) occupancyFields.style.display = 'none';
      if (liquidityFields) liquidityFields.style.display = 'none';
      if (otherFields) otherFields.style.display = 'none';
      
      // Preserve and restore expansion using helper function
      if (propertyKey) {
        await preserveAndRestoreExpansion(propertyKey, (detail, detailRow) => {
          // Restore active tab if it was set
          if (activeTab && detail) {
            const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
            if (tabButton) {
              tabButton.click();
            }
          }
        });
      } else {
        // Fallback if propertyKey not found
        await loadAll();
        renderAll();
      }
      
      showSuccessMessage(mode === "edit" ? "Covenant updated successfully!" : "Covenant added successfully!");
    } catch (error) {
      console.error(`Error ${mode === "edit" ? "updating" : "adding"} covenant:`, error);
      alert(`Error: ${error.message || `Failed to ${mode === "edit" ? "update" : "add"} covenant`}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
      // Hide all conditional fields
      const dscrFields = $("#dscrFields");
      const occupancyFields = $("#occupancyFields");
      const liquidityFields = $("#liquidityFields");
      const otherFields = $("#otherFields");
      if (dscrFields) dscrFields.style.display = 'none';
      if (occupancyFields) occupancyFields.style.display = 'none';
      if (liquidityFields) liquidityFields.style.display = 'none';
      if (otherFields) otherFields.style.display = 'none';
    }
  });
}

// Show covenant notes in a modal (called from button with data attribute)
function showCovenantNotesFromButton(button) {
  const notes = button.getAttribute('data-notes');
  if (!notes || !notes.trim()) {
    alert("No notes available for this covenant.");
    return;
  }

  // Unescape HTML entities
  const unescapedNotes = notes
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  
  // Create a simple modal to display notes
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h3>Covenant Notes</h3>
      <div style="padding: 16px; background: var(--surface-2); border-radius: var(--radius-sm); margin: 16px 0; white-space: pre-wrap; word-wrap: break-word; max-height: 400px; overflow-y: auto; border: 1px solid var(--line); line-height: 1.5;">
        ${unescapedNotes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="this.closest('.modal').remove()">Close</button>
      </div>
    </div>
  `;
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  document.body.appendChild(modal);
}

async function deleteCovenantById(covenantId) {
  if (!confirm("Are you sure you want to delete this covenant?")) return;
  try {
    // Find property key before deletion
    const covenant = window.COVENANTS_DATA?.find(c => String(c.CovenantId) === String(covenantId));
    const projectId = covenant?.ProjectId;
    const propertyKey = projectId ? (CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property) : null;
    
    await deleteCovenant(covenantId);
    
    // Preserve and restore expansion using helper function
    if (propertyKey) {
      await preserveAndRestoreExpansion(propertyKey);
    } else {
      await loadAll();
      renderAll();
    }
    
    showSuccessMessage("Covenant deleted successfully!");
  } catch (error) {
    console.error("Error deleting covenant:", error);
    alert(`Error: ${error.message}`);
  }
}

function showAddGuaranteeModal(projectId) {
  const modal = $("#addGuaranteeModal");
  const form = $("#guaranteeForm");
  const title = $("#guaranteeModalTitle");
  const personSelect = $("#guaranteePersonSelect");
  const amountInput = $("#guaranteeAmount");
  const percentInput = $("#guaranteePercent");
  
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  form.dataset.mode = "add";
  form.dataset.projectId = projectId;
  
  // Set title
  title.textContent = "Add Personal Guarantee";
  
  // Populate persons dropdown
  personSelect.innerHTML = '<option value="">-- Select Person --</option>';
  const people = window.PEOPLE_DATA || [];
  people.forEach(person => {
    const option = document.createElement("option");
    option.value = person.PersonId;
    option.textContent = person.FullName || `Person ${person.PersonId}`;
    personSelect.appendChild(option);
  });
  
  // Add real-time calculation of percentage when amount changes
  if (amountInput && percentInput) {
    // Remove any existing listeners by cloning the input
    const newAmountInput = amountInput.cloneNode(true);
    amountInput.parentNode.replaceChild(newAmountInput, amountInput);
    
    newAmountInput.addEventListener("input", () => {
      const amount = parseFloat(newAmountInput.value);
      if (isNaN(amount) || amount <= 0) {
        if (percentInput) percentInput.value = "";
      return;
    }
      
      // Get loan amount for this project
      const loans = window.LOANS_DATA || [];
      const projectLoans = loans.filter(l => l.ProjectId === projectId);
      const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
      const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
      const loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
      
      if (loanAmount && loanAmount > 0) {
        const calculatedPercent = (amount / loanAmount) * 100;
        if (percentInput) percentInput.value = calculatedPercent.toFixed(2);
      } else {
        if (percentInput) percentInput.value = "";
      }
    });
  }
  
  // Show modal
  modal.style.display = "flex";
}

function showEditGuaranteeModal(guaranteeId, projectId, personId, personName, guaranteePercent, guaranteeAmount) {
  if (!globalEditMode) {
    alert("Please enable Edit Mode to edit guarantees.");
      return;
    }
  
  const modal = $("#addGuaranteeModal");
  const form = $("#guaranteeForm");
  const title = $("#guaranteeModalTitle");
  const personSelect = $("#guaranteePersonSelect");
  const percentInput = $("#guaranteePercent");
  const amountInput = $("#guaranteeAmount");
  
  if (!modal || !form) return;
  
  // Set form mode
  form.dataset.mode = "edit";
  form.dataset.guaranteeId = guaranteeId;
  form.dataset.projectId = projectId;
  
  // Set title
  title.textContent = "Edit Personal Guarantee";
  
  // Populate persons dropdown
  personSelect.innerHTML = '<option value="">-- Select Person --</option>';
  const people = window.PEOPLE_DATA || [];
  people.forEach(person => {
    const option = document.createElement("option");
    option.value = person.PersonId;
    option.textContent = person.FullName || `Person ${person.PersonId}`;
    if (person.PersonId === personId) {
      option.selected = true;
    }
    personSelect.appendChild(option);
  });
  
  // Populate form fields
  if (amountInput) {
    amountInput.value = guaranteeAmount || "";
    // Calculate and display percentage when editing
    const loans = window.LOANS_DATA || [];
    const projectLoans = loans.filter(l => l.ProjectId === projectId);
    const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
    const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
    const loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
    
    if (loanAmount && loanAmount > 0 && guaranteeAmount) {
      const calculatedPercent = (guaranteeAmount / loanAmount) * 100;
      if (percentInput) percentInput.value = calculatedPercent.toFixed(2);
    } else if (percentInput) {
      percentInput.value = guaranteePercent || "";
    }
  }
  
  // Add real-time calculation of percentage when amount changes
  if (amountInput && percentInput) {
    // Remove any existing listeners by cloning the input
    const newAmountInput = amountInput.cloneNode(true);
    amountInput.parentNode.replaceChild(newAmountInput, amountInput);
    
    newAmountInput.addEventListener("input", () => {
      const amount = parseFloat(newAmountInput.value);
      if (isNaN(amount) || amount <= 0) {
        if (percentInput) percentInput.value = "";
    return;
  }

      // Get loan amount for this project
      const loans = window.LOANS_DATA || [];
      const projectLoans = loans.filter(l => l.ProjectId === projectId);
      const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
      const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
      const loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
      
      if (loanAmount && loanAmount > 0) {
        const calculatedPercent = (amount / loanAmount) * 100;
        if (percentInput) percentInput.value = calculatedPercent.toFixed(2);
      } else {
        if (percentInput) percentInput.value = "";
      }
    });
  }
  
  // Show modal
  modal.style.display = "flex";
}

async function addGuarantee(projectId, data) {
  try {
    await createGuaranteeByProject(projectId, data);
    await loadAll();
    renderAll();
  } catch (error) {
    console.error("Error adding guarantee:", error);
    alert(`Error: ${error.message}`);
  }
}

// Handle guarantee form submission
function setupGuaranteeModal() {
  const modal = $("#addGuaranteeModal");
  const form = $("#guaranteeForm");
  const cancelBtn = $("#cancelGuaranteeModalBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const mode = form.dataset.mode || "add";
    const projectId = parseInt(form.dataset.projectId);
    const personId = parseInt($("#guaranteePersonSelect").value);
    const guaranteeAmount = parseFloat($("#guaranteeAmount").value);
    
    if (!personId) {
      alert("Please select a person");
    return;
  }

    if (isNaN(guaranteeAmount) || guaranteeAmount < 0) {
      alert("Please enter a valid guarantee amount");
      return;
    }
    
    // Calculate guarantee percentage automatically based on loan amount
    const loans = window.LOANS_DATA || [];
    const projectLoans = loans.filter(l => l.ProjectId === projectId);
    const constructionLoan = projectLoans.find(l => l.LoanPhase === "Construction" || l.BirthOrder === 1) || projectLoans[0];
    const permanentLoan = projectLoans.find(l => l.LoanPhase === "Permanent" || l.BirthOrder > 1);
    
    // Use construction loan amount first, fallback to permanent loan amount
    const loanAmount = constructionLoan?.LoanAmount || permanentLoan?.LoanAmount || permanentLoan?.PermanentLoanAmount || 0;
    
    if (!loanAmount || loanAmount === 0) {
      alert("Cannot calculate guarantee percentage: No loan amount found for this project. Please ensure the project has a construction or permanent loan.");
      return;
    }
    
    // Calculate percentage: (guaranteeAmount / loanAmount) * 100
    const guaranteePercent = (guaranteeAmount / loanAmount) * 100;
    
    // Determine FinancingType based on current view (construction or permanent)
    // Map currentView to FinancingType: "construction" -> "Construction", "permanent" -> "Permanent"
    const financingType = currentView === "permanent" ? "Permanent" : "Construction";
    
    const guaranteeData = {
      PersonId: personId,
      FinancingType: financingType, // CRITICAL: Always specify FinancingType to separate Construction vs Permanent
      GuaranteePercent: guaranteePercent,
      GuaranteeAmount: guaranteeAmount
    };
    
    try {
      // Get property key for preserving expansion
      const propertyKey = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property;
      const activeTab = propertyKey ? sessionStorage.getItem(`tab-${propertyKey}`) : null;
      
      if (mode === "edit") {
        const guaranteeId = parseInt(form.dataset.guaranteeId);
        await updateGuarantee(guaranteeId, guaranteeData);
    } else {
        await addGuarantee(projectId, guaranteeData);
      }
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Optimized update with related data refresh for guarantees
      if (propertyKey) {
        const currentRow = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
        const projectId = currentRow?.Row || currentRow?._banking?.Row;
        const loanId = currentRow?.LoanId || currentRow?._constructionLoan?.LoanId;
        const permanentLoanId = currentRow?.PermanentLoanId || currentRow?._permanentLoan?.LoanId;
        
        const updatedRow = await updateSinglePropertyData(projectId, loanId, permanentLoanId, true);
        if (updatedRow) {
          await renderAll();
          requestAnimationFrame(() => {
            const detail = document.querySelector(`tr[data-key="${propertyKey}"]`)?.nextElementSibling?.querySelector(".detail");
            if (detail && activeTab) {
              const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
              if (tabButton) {
                tabButton.click();
              }
            }
          });
        } else {
          await preserveAndRestoreExpansion(propertyKey);
        }
      } else {
        await loadAll();
        renderAll();
      }
      
      showSuccessMessage(mode === "edit" ? "Guarantee updated successfully!" : "Guarantee added successfully!");
    } catch (error) {
      console.error(`Error ${mode === "edit" ? "updating" : "adding"} guarantee:`, error);
      alert(`Error: ${error.message || `Failed to ${mode === "edit" ? "update" : "add"} guarantee`}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  });
}

async function deleteGuaranteeById(guaranteeId) {
  if (!globalEditMode) {
    alert("Please enable Edit Mode to delete guarantees.");
    return;
  }
  
  if (!confirm("Are you sure you want to delete this guarantee?")) return;
  try {
    // Preserve expanded state
    const expandedKeysCopy = new Set(expandedKeys);
    
    await deleteGuarantee(guaranteeId);
    await loadAll();
    
    // Restore expanded state
    expandedKeys = expandedKeysCopy;
    
    renderAll();
    
    showSuccessMessage("Guarantee deleted successfully!");
  } catch (error) {
    console.error("Error deleting guarantee:", error);
    alert(`Error: ${error.message}`);
  }
}

function showAddEquityCommitmentModal(projectId) {
  const modal = $("#addEquityCommitmentModal");
  const form = $("#equityCommitmentForm");
  const title = $("#equityModalTitle");
  const projectSelect = $("#equityProjectSelect");
  const partnerSelect = $("#equityPartnerSelect");
  const newPartnerBtn = $("#createNewPartnerBtn");
  const newPartnerFields = $("#newPartnerFields");
  const newPartnerName = $("#newPartnerName");
  
  // Set title
  title.textContent = "Add Equity Commitment";
  
  // Reset form
  form.reset();
  newPartnerFields.style.display = "none";
  form.dataset.mode = "add";
  form.dataset.projectId = projectId || "";
  
  // Populate projects dropdown (all deals from by-property view)
  projectSelect.innerHTML = '<option value="">-- Select Deal --</option>';
  const allProjects = window.PROJECTS_DATA || [];
  allProjects.forEach(proj => {
    const option = document.createElement("option");
    option.value = proj.ProjectId;
    option.textContent = proj.ProjectName || `Project ${proj.ProjectId}`;
    if (projectId && proj.ProjectId === projectId) {
      option.selected = true;
    }
    projectSelect.appendChild(option);
  });
  
  // Populate equity partners dropdown
  partnerSelect.innerHTML = '<option value="">-- Select Partner --</option>';
  const partners = window.EQUITY_PARTNERS_DATA || [];
  partners.forEach(partner => {
    const option = document.createElement("option");
    option.value = partner.EquityPartnerId;
    option.textContent = partner.PartnerName || `Partner ${partner.EquityPartnerId}`;
    partnerSelect.appendChild(option);
  });
  
  // Setup searchable related parties dropdown
  const relatedPartiesSearch = $("#equityRelatedPartiesSearch");
  const relatedPartiesDropdown = $("#equityRelatedPartiesDropdown");
  const relatedPartiesSelect = $("#equityRelatedParties");
  const relatedPartiesChips = $("#equityRelatedPartiesChips");
  
  if (relatedPartiesSearch && relatedPartiesDropdown && relatedPartiesSelect && relatedPartiesChips) {
    // Clear chips and search
    relatedPartiesChips.innerHTML = '';
    relatedPartiesSearch.value = '';
    relatedPartiesSelect.innerHTML = '';
    
    // Setup searchable dropdown (exclude partner will be set when partner is selected)
    // We'll set it up initially without exclusion, then update when partner changes
    setupSearchableRelatedPartiesDropdown(
      "#equityRelatedPartiesSearch",
      "#equityRelatedPartiesDropdown",
      "#equityRelatedParties",
      "#equityRelatedPartiesChips",
      partners,
      null, // No exclusion initially
      null
    );
    
    // Update exclusion when partner changes
    partnerSelect.addEventListener('change', () => {
      const selectedPartnerId = partnerSelect.value ? parseInt(partnerSelect.value) : null;
      const relatedPartiesContainer = $("#equityRelatedPartiesContainer");
      const relatedPartiesFormGroup = relatedPartiesContainer?.closest('.form-group');
      
      if (selectedPartnerId) {
        // Check if selected partner is an Individual
        const selectedPartner = partners.find(p => p.EquityPartnerId === selectedPartnerId);
        const isIndividual = selectedPartner && selectedPartner.PartnerType === 'Individual';
        
        if (isIndividual) {
          // Hide related parties for Individuals
          if (relatedPartiesFormGroup) {
            relatedPartiesFormGroup.style.display = 'none';
          }
          // Clear any selected related parties
          const relatedPartiesHandler = window.equityRelatedPartiesHandler;
          if (relatedPartiesHandler) {
            relatedPartiesHandler.setSelectedIds([]);
          }
    } else {
          // Show related parties for Entities
          if (relatedPartiesFormGroup) {
            relatedPartiesFormGroup.style.display = 'block';
          }
          // Re-setup with exclusion
          setupSearchableRelatedPartiesDropdown(
            "#equityRelatedPartiesSearch",
            "#equityRelatedPartiesDropdown",
            "#equityRelatedParties",
            "#equityRelatedPartiesChips",
            partners,
            selectedPartnerId,
            null
          );
        }
      } else {
        // No partner selected - show related parties field
        if (relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'block';
        }
      }
    });
  }
  
  // Populate investor rep dropdown for new partner (async, but don't await - populate in background)
  populateInvestorRepDropdown("newPartnerRepSelect", "newPartnerRepFields", "newPartnerRepName", "newPartnerRepEmail", "newPartnerRepPhone").catch(err => {
    console.error("Error populating investor rep dropdown:", err);
  });
  
  // Show modal
  modal.style.display = "flex";
}

async function showEditEquityCommitmentModal(commitmentId, projectId, partnerId, equityType, amount, fundingDate) {
  const modal = $("#addEquityCommitmentModal");
  const form = $("#equityCommitmentForm");
  const title = $("#equityModalTitle");
  const projectSelect = $("#equityProjectSelect");
  const partnerSelect = $("#equityPartnerSelect");
  const newPartnerBtn = $("#createNewPartnerBtn");
  const newPartnerFields = $("#newPartnerFields");
  const equityTypeSelect = $("#equityType");
  const amountInput = $("#equityAmount");
  const fundingDateInput = $("#equityFundingDate");
  const relatedPartiesSelect = $("#equityRelatedParties");
  
  // Set title
  title.textContent = "Edit Equity Commitment";
  
  // Set form mode
  form.dataset.mode = "edit";
  form.dataset.commitmentId = commitmentId;
  
  // Populate projects dropdown
  projectSelect.innerHTML = '<option value="">-- Select Deal --</option>';
  const allProjects = window.PROJECTS_DATA || [];
  allProjects.forEach(proj => {
    const option = document.createElement("option");
    option.value = proj.ProjectId;
    option.textContent = proj.ProjectName || `Project ${proj.ProjectId}`;
    // Use string comparison to handle type mismatches
    if (String(proj.ProjectId) === String(projectId)) {
      option.selected = true;
    }
    projectSelect.appendChild(option);
  });
  
  // Populate equity partners dropdown
  partnerSelect.innerHTML = '<option value="">-- Select Partner --</option>';
  const partners = window.EQUITY_PARTNERS_DATA || [];
  partners.forEach(partner => {
    const option = document.createElement("option");
    option.value = partner.EquityPartnerId;
    option.textContent = partner.PartnerName || `Partner ${partner.EquityPartnerId}`;
    // Use string comparison to handle type mismatches
    if (String(partner.EquityPartnerId) === String(partnerId)) {
      option.selected = true;
    }
    partnerSelect.appendChild(option);
  });
  
  // Setup searchable related parties dropdown
  const relatedPartiesSearch = $("#equityRelatedPartiesSearch");
  const relatedPartiesDropdown = $("#equityRelatedPartiesDropdown");
  const relatedPartiesChips = $("#equityRelatedPartiesChips");
  
  if (relatedPartiesSearch && relatedPartiesDropdown && relatedPartiesSelect && relatedPartiesChips) {
    // Clear chips and search
    relatedPartiesChips.innerHTML = '';
    relatedPartiesSearch.value = '';
    relatedPartiesSelect.innerHTML = '';
    
    // Fetch existing related parties first
    let existingRelatedPartyIds = [];
    try {
      // Access the function from window.API (exposed by api-client.js)
      if (typeof window !== 'undefined' && window.API && typeof window.API.getRelatedPartiesByCommitment === 'function') {
        const relatedPartiesRes = await window.API.getRelatedPartiesByCommitment(commitmentId);
        const relatedParties = relatedPartiesRes?.data || relatedPartiesRes || [];
        existingRelatedPartyIds = relatedParties.map(rp => rp.EquityPartnerId).filter(id => id);
      }
    } catch (error) {
      console.error("Error fetching related parties:", error);
    }
    
    // Setup searchable dropdown with exclusion of lead partner
    const excludePartnerId = partnerId ? parseInt(partnerId) : null;
    const dropdownHandler = setupSearchableRelatedPartiesDropdown(
      "#equityRelatedPartiesSearch",
      "#equityRelatedPartiesDropdown",
      "#equityRelatedParties",
      "#equityRelatedPartiesChips",
      partners,
      excludePartnerId,
      null
    );
    
    // Check if the current partner is an Individual - if so, hide related parties
    const currentPartner = partners.find(p => p.EquityPartnerId === partnerId);
    const isIndividual = currentPartner && currentPartner.PartnerType === 'Individual';
    const relatedPartiesContainer = $("#equityRelatedPartiesContainer");
    const relatedPartiesFormGroup = relatedPartiesContainer?.closest('.form-group');
    
    if (isIndividual) {
      // Hide related parties for Individuals
      if (relatedPartiesFormGroup) {
        relatedPartiesFormGroup.style.display = 'none';
      }
      // Clear any existing related parties
      existingRelatedPartyIds = [];
    } else {
      // Show related parties for Entities
      if (relatedPartiesFormGroup) {
        relatedPartiesFormGroup.style.display = 'block';
      }
      // Set existing related parties
      if (existingRelatedPartyIds.length > 0 && dropdownHandler) {
        dropdownHandler.setSelectedIds(existingRelatedPartyIds);
      }
    }
    
    // Update exclusion when partner changes
    partnerSelect.addEventListener('change', () => {
      const selectedPartnerId = partnerSelect.value ? parseInt(partnerSelect.value) : null;
      const currentSelectedIds = dropdownHandler ? dropdownHandler.getSelectedIds() : existingRelatedPartyIds;
      
      // Check if selected partner is an Individual
      const selectedPartner = partners.find(p => p.EquityPartnerId === selectedPartnerId);
      const isIndividual = selectedPartner && selectedPartner.PartnerType === 'Individual';
      const relatedPartiesContainer = $("#equityRelatedPartiesContainer");
      const relatedPartiesFormGroup = relatedPartiesContainer?.closest('.form-group');
      
      // Hide/disable related parties field if partner is an Individual
      if (isIndividual) {
        if (relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'none';
        }
        // Clear any selected related parties
        if (dropdownHandler) {
          dropdownHandler.setSelectedIds([]);
        }
      } else {
        // Show related parties field for Entities
        if (relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'block';
        }
        
        // Re-setup with new exclusion
        const newHandler = setupSearchableRelatedPartiesDropdown(
          "#equityRelatedPartiesSearch",
          "#equityRelatedPartiesDropdown",
          "#equityRelatedParties",
          "#equityRelatedPartiesChips",
          partners,
          selectedPartnerId,
          null
        );
        
        // Restore selected IDs (excluding the new lead partner)
        if (currentSelectedIds.length > 0 && newHandler) {
          const filteredIds = currentSelectedIds.filter(id => id !== selectedPartnerId);
          newHandler.setSelectedIds(filteredIds);
        }
      }
    });
  } else {
    // Fallback to old multi-select if new elements not found
    if (relatedPartiesSelect) {
      relatedPartiesSelect.innerHTML = '<option value="">-- Select Related Parties (hold Ctrl/Cmd to select multiple) --</option>';
      partners.forEach(partner => {
        // Exclude the lead partner from related parties
        if (String(partner.EquityPartnerId) !== String(partnerId)) {
          const option = document.createElement("option");
          option.value = partner.EquityPartnerId;
          option.textContent = partner.PartnerName || `Partner ${partner.EquityPartnerId}`;
          relatedPartiesSelect.appendChild(option);
        }
      });
      
      // Fetch existing related parties
      try {
        // Access the function from window.API (exposed by api-client.js)
        if (typeof window !== 'undefined' && window.API && typeof window.API.getRelatedPartiesByCommitment === 'function') {
          const relatedPartiesRes = await window.API.getRelatedPartiesByCommitment(commitmentId);
          const relatedParties = relatedPartiesRes?.data || relatedPartiesRes || [];
          relatedParties.forEach(relatedParty => {
            const relatedPartnerId = relatedParty.EquityPartnerId;
            const option = Array.from(relatedPartiesSelect.options).find(opt => 
              String(opt.value) === String(relatedPartnerId)
            );
            if (option) {
              option.selected = true;
            }
          });
        } else {
          console.warn("getRelatedPartiesByCommitment function not available, skipping related parties pre-selection");
        }
      } catch (error) {
        console.warn("Could not load related parties:", error);
        // Continue without pre-selecting related parties
      }
    }
  }
  
  // Set values - map backend equity type to frontend value
  equityTypeSelect.value = mapEquityTypeToFrontend(equityType);
  amountInput.value = amount || "";
  fundingDateInput.value = fundingDate ? fundingDate.split('T')[0] : "";
  
  // Hide new partner fields
  newPartnerFields.style.display = "none";
  
  // Show modal
  modal.style.display = "flex";
}

// Helper function to map frontend equity type values to backend values
function mapEquityTypeToBackend(frontendValue) {
  if (!frontendValue) return null;
  const mapping = {
    "Pref": "Preferred Equity",
    "Common": "Common Equity",
    "Profits Interest": "Profits Interest",
    "Stoa Loan": "Stoa Loan",
    "Other": null // Backend doesn't accept "Other", so return null
  };
  return mapping[frontendValue] || null;
}

// Helper function to map backend equity type values to frontend values
function mapEquityTypeToFrontend(backendValue) {
  if (!backendValue) return "";
  const mapping = {
    "Preferred Equity": "Pref",
    "Common Equity": "Common",
    "Profits Interest": "Profits Interest",
    "Stoa Loan": "Stoa Loan"
  };
  return mapping[backendValue] || backendValue; // Return as-is if not in mapping
}

// Handle equity commitment form submission
function setupEquityCommitmentModal() {
  const modal = $("#addEquityCommitmentModal");
  const form = $("#equityCommitmentForm");
  const cancelBtn = $("#cancelEquityModalBtn");
  const createPartnerBtn = $("#createNewPartnerBtn");
  const newPartnerFields = $("#newPartnerFields");
  const partnerSelect = $("#equityPartnerSelect");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
    newPartnerFields.style.display = "none";
  });
  
  // Create new partner button
  createPartnerBtn?.addEventListener("click", () => {
    const isShowing = newPartnerFields.style.display !== "none";
    newPartnerFields.style.display = isShowing ? "none" : "block";
    const newPartnerNameInput = $("#newPartnerName");
    const relatedPartiesContainer = $("#equityRelatedPartiesContainer");
    const relatedPartiesFormGroup = relatedPartiesContainer?.closest('.form-group');
    
    if (!isShowing) {
      // Showing the fields
      partnerSelect.value = "";
      // Set default partner type to Entity
      const newPartnerTypeSelect = $("#newPartnerType");
      if (newPartnerTypeSelect) {
        newPartnerTypeSelect.value = "Entity";
      }
      // Show investor rep group (default is Entity)
      const newPartnerRepGroup = $("#newPartnerRepGroup");
      if (newPartnerRepGroup) {
        newPartnerRepGroup.style.display = "block";
      }
      // Populate investor rep dropdown when showing new partner fields (async, but don't await)
      populateInvestorRepDropdown("newPartnerRepSelect", "newPartnerRepFields", "newPartnerRepName", "newPartnerRepEmail", "newPartnerRepPhone").catch(err => {
        console.error("Error populating investor rep dropdown:", err);
      });
      // Add required attribute when visible
      if (newPartnerNameInput) {
        newPartnerNameInput.required = true;
      }
      // Hide related parties when creating new partner (will show if they select Entity type)
      if (relatedPartiesFormGroup) {
        relatedPartiesFormGroup.style.display = 'none';
      }
    } else {
      // Hiding the fields - remove required to prevent HTML5 validation error
      if (newPartnerNameInput) {
        newPartnerNameInput.required = false;
      }
      // Show related parties again if a partner is selected
      const selectedPartnerId = partnerSelect.value ? parseInt(partnerSelect.value) : null;
      if (selectedPartnerId) {
        const partners = window.EQUITY_PARTNERS_DATA || [];
        const selectedPartner = partners.find(p => p.EquityPartnerId === selectedPartnerId);
        if (selectedPartner && selectedPartner.PartnerType !== 'Individual' && relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'block';
        }
      }
    }
  });
  
  // Handle new partner type change to show/hide investor rep
  const newPartnerTypeSelect = $("#newPartnerType");
  const newPartnerRepGroup = $("#newPartnerRepGroup");
  const newPartnerRepFields = $("#newPartnerRepFields");
  const newPartnerRepSelect = $("#newPartnerRepSelect");
  
  newPartnerTypeSelect?.addEventListener('change', () => {
    const partnerType = newPartnerTypeSelect.value;
    if (partnerType === "Individual") {
      // Hide investor rep section for Individuals
      if (newPartnerRepGroup) newPartnerRepGroup.style.display = "none";
      if (newPartnerRepFields) newPartnerRepFields.style.display = "none";
      // Clear any selected rep
      if (newPartnerRepSelect) newPartnerRepSelect.value = "";
      if ($("#newPartnerRepName")) $("#newPartnerRepName").value = "";
      if ($("#newPartnerRepEmail")) $("#newPartnerRepEmail").value = "";
      if ($("#newPartnerRepPhone")) $("#newPartnerRepPhone").value = "";
    } else {
      // Show investor rep section for Entities
      if (newPartnerRepGroup) newPartnerRepGroup.style.display = "block";
    }
  });
  
  // Handle partner select change to show/hide related parties based on PartnerType
  partnerSelect?.addEventListener('change', () => {
    const selectedPartnerId = partnerSelect.value ? parseInt(partnerSelect.value) : null;
    const relatedPartiesContainer = $("#equityRelatedPartiesContainer");
    const relatedPartiesFormGroup = relatedPartiesContainer?.closest('.form-group');
    
    if (selectedPartnerId) {
      const partners = window.EQUITY_PARTNERS_DATA || [];
      const selectedPartner = partners.find(p => p.EquityPartnerId === selectedPartnerId);
      const isIndividual = selectedPartner && selectedPartner.PartnerType === 'Individual';
      
      if (isIndividual) {
        // Hide related parties for Individuals
        if (relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'none';
        }
        // Clear any selected related parties
        const relatedPartiesHandler = window.equityRelatedPartiesHandler;
        if (relatedPartiesHandler) {
          relatedPartiesHandler.setSelectedIds([]);
        }
      } else {
        // Show related parties for Entities
        if (relatedPartiesFormGroup) {
          relatedPartiesFormGroup.style.display = 'block';
        }
      }
    }
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const mode = form.dataset.mode;
    const projectId = parseInt($("#equityProjectSelect").value);
    const partnerId = $("#equityPartnerSelect").value;
    const newPartnerNameInput = $("#newPartnerName");
    const newPartnerName = newPartnerNameInput ? newPartnerNameInput.value.trim() : "";
    const equityTypeFrontend = $("#equityType").value;
    let equityType = mapEquityTypeToBackend(equityTypeFrontend); // Map to backend value
    
    // If mapping returns null but we have a frontend value, check if it's already a backend value
    if (!equityType && equityTypeFrontend) {
      // Check if the frontend value is already a valid backend value
      const validBackendValues = ["Preferred Equity", "Common Equity", "Profits Interest", "Stoa Loan"];
      if (validBackendValues.includes(equityTypeFrontend)) {
        equityType = equityTypeFrontend; // Use as-is if it's already a backend value
      }
    }
    
    // Debug logging for equity type mapping
    console.log("Equity Type Debug:", {
      frontendValue: equityTypeFrontend,
      mappedValue: equityType,
      rawValue: $("#equityType").value
    });
    const amount = parseFloat($("#equityAmount").value);
    const fundingDate = $("#equityFundingDate").value || null;
    
    if (!projectId) {
      alert("Please select a deal/property");
      return;
    }
    
    let finalPartnerId = partnerId;
    
    // Validate new partner name if creating new partner
    if (newPartnerFields.style.display !== "none") {
      if (!newPartnerName) {
        alert("Please enter a partner name");
        if (newPartnerNameInput) newPartnerNameInput.focus();
        return;
      }
    }
    
    // Create new partner if needed
    if (newPartnerFields.style.display !== "none" && newPartnerName) {
      try {
        const newPartnerType = $("#newPartnerType")?.value || "Entity";
        const newPartnerData = {
          PartnerName: newPartnerName,
          PartnerType: newPartnerType
        };
        
        // Only handle investor rep if partner type is Entity (Individuals don't have investor reps)
        if (newPartnerType === "Entity") {
          // Handle investor rep (contact) - either select existing or create new
          const repSelect = $("#newPartnerRepSelect");
          const repSelectValue = repSelect ? repSelect.value : "";
          
          if (repSelectValue === "__new__") {
            // This should not happen - modal should have been used to create contact
            // If it does, show an error
            alert("Please complete the contact creation in the modal that appeared, or select an existing contact.");
            return;
          } else if (repSelectValue && repSelectValue !== "") {
            // Use existing contact (InvestorRepId is PersonId from core.Person table)
            newPartnerData.InvestorRepId = parseInt(repSelectValue);
          }
        }
        
        // Check for duplicates and create or use existing partner
        const partnerResult = await createOrFindEquityPartner(newPartnerData);
        finalPartnerId = partnerResult.partnerId;
        
        // Show message if duplicate was found
        if (partnerResult.isDuplicate) {
          const duplicateMsg = `Equity partner "${newPartnerName}" already exists. Using existing partner.`;
          console.log(duplicateMsg);
          showSuccessMessage(duplicateMsg, 3000);
        }
      } catch (error) {
        console.error("Error creating partner:", error);
        alert(`Error creating partner: ${error.message}`);
        return;
      }
    }
    
    if (!finalPartnerId) {
      alert("Please select or create an equity partner");
      return;
    }
    
    if (!amount || isNaN(amount)) {
      alert("Please enter a valid amount");
      return;
    }
    
    // Validate foreign keys before sending
    if (!projectId || isNaN(projectId)) {
      alert("Invalid project ID. Please select a valid deal/property.");
      return;
    }
    
    const partnerIdInt = parseInt(finalPartnerId);
    if (!partnerIdInt || isNaN(partnerIdInt)) {
      alert("Invalid partner ID. Please select or create a valid equity partner.");
      return;
    }
    
    // Verify project exists
    const projectExists = window.PROJECTS_DATA.some(p => p.ProjectId === projectId);
    if (!projectExists) {
      alert("Selected project does not exist. Please refresh and try again.");
      return;
    }
    
    // Verify partner exists
    const partnerExists = window.EQUITY_PARTNERS_DATA.some(p => p.EquityPartnerId === partnerIdInt);
    if (!partnerExists) {
      alert("Selected partner does not exist. Please refresh and try again.");
      return;
    }
    
    // Get selected related parties
    const relatedPartiesSelect = $("#equityRelatedParties");
    let relatedPartyIds = [];
    if (relatedPartiesSelect) {
      const selectedOptions = Array.from(relatedPartiesSelect.selectedOptions);
      relatedPartyIds.push(...selectedOptions.map(opt => parseInt(opt.value)).filter(id => !isNaN(id) && id > 0));
    }
    
    // Check if the selected partner is an Individual - if so, clear related parties
    const selectedPartner = window.EQUITY_PARTNERS_DATA.find(p => p.EquityPartnerId === partnerIdInt);
    const isIndividual = selectedPartner && selectedPartner.PartnerType === 'Individual';
    
    if (isIndividual) {
      // Individuals can't have related parties
      relatedPartyIds = [];
    }
    
    // Validate related party IDs exist
    const validRelatedPartyIds = relatedPartyIds.filter(id => 
      window.EQUITY_PARTNERS_DATA.some(p => p.EquityPartnerId === id)
    );
    
    if (relatedPartyIds.length !== validRelatedPartyIds.length) {
      console.warn("Some related party IDs are invalid, filtering them out");
    }
    
    // Get property key before saving
    const propertyKey = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.ProjectName || CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === projectId)?.Property;
    const activeTab = propertyKey ? sessionStorage.getItem(`tab-${propertyKey}`) : null;
    
    try {
      if (mode === "edit") {
        const commitmentId = parseInt(form.dataset.commitmentId);
        
        // Double-check that projectId and partnerIdInt are valid integers
        if (!Number.isInteger(projectId) || projectId <= 0) {
          alert(`Invalid ProjectId: ${projectId}. Please select a valid deal/property.`);
          return;
        }
        
        if (!Number.isInteger(partnerIdInt) || partnerIdInt <= 0) {
          alert(`Invalid EquityPartnerId: ${partnerIdInt}. Please select a valid equity partner.`);
          return;
        }
        
        // Verify project exists in PROJECTS_DATA (use ProjectId, not Row)
        const project = window.PROJECTS_DATA.find(p => p.ProjectId === projectId);
        if (!project) {
          console.error("Project validation failed:", {
            projectId,
            availableProjectIds: window.PROJECTS_DATA.map(p => p.ProjectId).slice(0, 10)
          });
          alert(`Project ID ${projectId} not found in database. Please refresh and try again.`);
          return;
        }
        
        // Verify partner exists
        const partner = window.EQUITY_PARTNERS_DATA.find(p => p.EquityPartnerId === partnerIdInt);
        if (!partner) {
          console.error("Partner validation failed:", {
            partnerIdInt,
            availablePartnerIds: window.EQUITY_PARTNERS_DATA.map(p => p.EquityPartnerId).slice(0, 10)
          });
          alert(`Equity Partner ID ${partnerIdInt} not found in database. Please refresh and try again.`);
          return;
        }
        
        // For updates, always include ProjectId and EquityPartnerId
        // The backend requires these fields and will set them to NULL if not provided
        // Even if they haven't changed, we must include them to prevent NULL constraint violations
        // Ensure EquityType is sent correctly - don't send null if a value was selected
        // Handle "Stoa Loan" explicitly to ensure it's sent correctly
        let equityTypeToSend = null;
        if (equityType && equityType.trim()) {
          equityTypeToSend = equityType.trim();
        } else if (equityTypeFrontend && equityTypeFrontend.trim()) {
          // Fallback: if mapping failed but we have a frontend value, check if it's "Stoa Loan"
          const trimmed = equityTypeFrontend.trim();
          if (trimmed === "Stoa Loan") {
            equityTypeToSend = "Stoa Loan";
          }
        }
        
        const data = {
          ProjectId: projectId,
          EquityPartnerId: partnerIdInt,
          EquityType: equityTypeToSend,
          Amount: amount,
          FundingDate: fundingDate || null,
          RelatedPartyIds: validRelatedPartyIds
        };
        
        // Log the data being sent for debugging
        console.log("Updating equity commitment:", {
          commitmentId,
          data,
          equityTypeToSend: equityTypeToSend,
          equityTypeOriginal: equityType,
          equityTypeFrontend: equityTypeFrontend,
          projectExists: !!project,
          partnerExists: !!partner,
          validRelatedPartyIdsCount: validRelatedPartyIds.length
        });
        
        // Log the exact JSON that will be sent
        console.log("Payload JSON:", JSON.stringify(data));
        
        await updateEquityCommitmentById(commitmentId, data);
      } else {
        // For new commitments, include all required fields
        // Ensure EquityType is sent correctly - don't send null if a value was selected
        const equityTypeToSend = equityType && equityType.trim() ? equityType.trim() : null;
        
        const newCommitmentData = {
          ProjectId: projectId,
          EquityPartnerId: partnerIdInt,
          EquityType: equityTypeToSend,
          Amount: amount,
          FundingDate: fundingDate || null,
          RelatedPartyIds: validRelatedPartyIds
        };
        await addEquityCommitment(projectId, newCommitmentData);
      }
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      newPartnerFields.style.display = "none";
      
      // Optimized update with related data refresh for equity commitments
      if (propertyKey) {
        const currentRow = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === propertyKey);
        const currentProjectId = currentRow?.Row || currentRow?._banking?.Row;
        const loanId = currentRow?.LoanId || currentRow?._constructionLoan?.LoanId;
        const permanentLoanId = currentRow?.PermanentLoanId || currentRow?._permanentLoan?.LoanId;
        
        // Update with related data refresh (equity commitments are related data)
        const updatedRow = await updateSinglePropertyData(currentProjectId, loanId, permanentLoanId, true);
        if (updatedRow) {
          await renderAll();
          requestAnimationFrame(() => {
            // Find the row in main property view
            let detailRow = document.querySelector(`tr[data-key="${propertyKey}"]`)?.nextElementSibling;
            let detail = null;
            
            if (detailRow && detailRow.classList.contains("detail-row")) {
              detail = detailRow.querySelector(".detail");
              if (detail) {
                // Rebuild details with updated data
                const sorted = applySort(CURRENT_ROWS);
                const rowData = sorted.find(r => (r.ProjectName || r.Property) === propertyKey);
                if (rowData) {
                  buildDetails(rowData);
                  adjustDetailWidth(detailRow);
                  
                  // Restore active tab
                  if (activeTab) {
                    const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
                    if (tabButton) {
                      tabButton.click();
                    }
                  }
                }
              }
            } else {
              // Try nested views (bank/equity)
              const dealRow = document.querySelector(`tr.deal-row[data-deal-key="${propertyKey}"]`);
              if (dealRow) {
                detailRow = dealRow.nextElementSibling;
                if (detailRow && detailRow.classList.contains("deal-detail-row")) {
                  detail = detailRow.querySelector(".deal-detail");
                  if (detail) {
                    const sorted = applySort(CURRENT_ROWS);
                    const rowData = sorted.find(r => (r.ProjectName || r.Property) === propertyKey);
                    const state = editModeState.get(propertyKey);
                    const context = state?.context || null;
                    if (rowData) {
                      buildDetailsForNested(rowData, detail, context);
                      adjustDetailWidth(detailRow);
                      
                      // Restore active tab
                      if (activeTab) {
                        const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
                        if (tabButton) {
                          tabButton.click();
                        }
                      }
                    }
                  }
                }
              }
            }
          });
        } else {
          // Fallback to full reload if partial update failed
          await preserveAndRestoreExpansion(propertyKey, (detail, detailRow) => {
            if (activeTab && detail) {
              const tabButton = detail.querySelector(`[data-tab="${activeTab}"]`);
              if (tabButton) {
                tabButton.click();
              }
            }
          });
        }
      } else {
        // Fallback if propertyKey not found
        await loadAll();
        renderAll();
      }
      
      showSuccessMessage(mode === "edit" ? "Equity commitment updated successfully!" : "Equity commitment added successfully!");
    } catch (error) {
      console.error("Error saving equity commitment:", error);
      alert(`Error: ${error.message}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
      newPartnerFields.style.display = "none";
    }
  });
}

// Helper function to get all unique investor reps from equity partners
function getAllInvestorReps() {
  const partners = window.EQUITY_PARTNERS_DATA || [];
  const repMap = new Map();
  
  partners.forEach(partner => {
    if (partner.InvestorRepName) {
      const key = `${partner.InvestorRepName}|${partner.InvestorRepEmail || ''}|${partner.InvestorRepPhone || ''}`;
      if (!repMap.has(key)) {
        repMap.set(key, {
          name: partner.InvestorRepName,
          email: partner.InvestorRepEmail || '',
          phone: partner.InvestorRepPhone || ''
        });
      }
    }
  });
  
  return Array.from(repMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Helper function to populate investor rep dropdown from contacts/persons table
async function populateInvestorRepDropdown(selectId, fieldsContainerId, nameInputId, emailInputId, phoneInputId, selectedInvestorRepId = null) {
  // Ensure selectId has # prefix if it's just an ID
  const selectSelector = selectId.startsWith("#") ? selectId : `#${selectId}`;
  let select = $(selectSelector);
  
  // Try fallback if not found
  if (!select) {
    // Try with just the ID (in case $() handles it differently)
    select = $(selectId);
  }
  
  if (!select) {
    console.warn("Investor rep select element not found:", selectSelector, "or", selectId);
    return;
  }
  
  const fieldsContainer = $(fieldsContainerId);
  const nameInput = $(nameInputId);
  const emailInput = $(emailInputId);
  const phoneInput = $(phoneInputId);
  
  // Get all contacts from PEOPLE_DATA (contacts table) or fetch if not available
  let contacts = window.PEOPLE_DATA || [];
  
  // If PEOPLE_DATA is empty, try to fetch from API
  if (contacts.length === 0) {
    try {
      const personsRes = await getAllPersons();
      contacts = personsRes?.data || personsRes || [];
      window.PEOPLE_DATA = contacts; // Cache for future use
      console.log("Fetched contacts from API:", contacts.length);
    } catch (error) {
      console.error("Error fetching persons:", error);
      contacts = [];
    }
  }
  
  console.log("Using contacts:", contacts.length, contacts);
  
  // Store the current value if any (before clearing)
  const savedValue = selectedInvestorRepId ? String(selectedInvestorRepId) : select.value;
  
  // Clear and populate dropdown
  select.innerHTML = '<option value="">-- Select Existing Contact or Create New --</option>';
  select.innerHTML += '<option value="__new__">+ Create New Contact</option>';
  
  if (contacts.length === 0) {
    // Add a placeholder if no contacts exist
    const noContactsOption = document.createElement("option");
    noContactsOption.value = "";
    noContactsOption.textContent = "No existing contacts found";
    noContactsOption.disabled = true;
    select.appendChild(noContactsOption);
  } else {
    contacts.forEach(contact => {
      const option = document.createElement("option");
      const displayText = `${contact.FullName || 'Unnamed'}${contact.Email ? ` (${contact.Email})` : ''}`;
      option.value = String(contact.PersonId); // Use PersonId as the value (ensure string)
      option.textContent = displayText;
      option.dataset.personId = contact.PersonId;
      option.dataset.repName = contact.FullName || "";
      option.dataset.repEmail = contact.Email || "";
      option.dataset.repPhone = contact.Phone || "";
      select.appendChild(option);
    });
  }
  
  // Set selected value if provided or restore previous value
  const valueToSet = selectedInvestorRepId ? String(selectedInvestorRepId) : savedValue;
  if (valueToSet) {
    const optionExists = Array.from(select.options).some(opt => opt.value === valueToSet);
    if (optionExists) {
      select.value = valueToSet;
    } else {
      console.warn("Selected InvestorRepId not found in dropdown options:", valueToSet);
    }
  }
  
  // Remove existing change listeners by cloning (to avoid duplicates)
  // Store the value again before cloning
  const currentValueBeforeClone = select.value;
  
  // Clone to remove old event listeners
  const oldSelect = select;
  const newSelect = oldSelect.cloneNode(true);
  oldSelect.parentNode.replaceChild(newSelect, oldSelect);
  
  // Restore the value after cloning
  if (currentValueBeforeClone) {
    const restoredSelect = $(selectSelector) || $(selectId);
    if (restoredSelect) {
      restoredSelect.value = currentValueBeforeClone;
    }
  }
  
  // Re-get references after replacement
  const finalSelect = $(selectSelector) || $(selectId);
  const finalFieldsContainer = $(fieldsContainerId);
  const finalNameInput = $(nameInputId);
  const finalEmailInput = $(emailInputId);
  const finalPhoneInput = $(phoneInputId);
  
  if (!finalSelect) {
    console.warn("Could not find select element after cloning:", selectSelector, "or", selectId);
    return;
  }
  
  // Handle selection change
  finalSelect.addEventListener("change", (e) => {
    const value = finalSelect.value;
    
    if (value === "__new__") {
      // Show "Add New Contact" modal instead of inline fields
      showAddNewContactModal("", (contactId) => {
        // Callback when contact is created - update the select
        const selectAfterCreate = $(selectSelector) || $(selectId);
        if (selectAfterCreate) {
          selectAfterCreate.value = String(contactId);
          // Trigger change event to update UI
          selectAfterCreate.dispatchEvent(new Event("change"));
        }
        // Hide "Create New Contact" fields (in case they were shown)
        if (finalFieldsContainer) finalFieldsContainer.style.display = "none";
        if (finalNameInput) finalNameInput.required = false;
      });
      // Reset select to empty to prevent form submission issues
      e.target.value = "";
    } else if (value && value !== "") {
      // Selected an existing contact - hide fields (we'll use ContactId)
      if (finalFieldsContainer) finalFieldsContainer.style.display = "none";
      if (finalNameInput) finalNameInput.required = false;
    } else {
      // No selection - hide fields
      if (finalFieldsContainer) finalFieldsContainer.style.display = "none";
      if (finalNameInput) finalNameInput.required = false;
    }
  });
}

// Show edit equity partner modal
function showEditEquityPartnerModal(partnerId) {
  const modal = $("#editEquityPartnerModal");
  const form = $("#editEquityPartnerForm");
  const partner = (window.EQUITY_PARTNERS_DATA || []).find(p => p.EquityPartnerId === partnerId);
  
  if (!modal || !form || !partner) {
    alert("Partner not found");
    return;
  }
  
  // Populate form
  $("#editPartnerId").value = partner.EquityPartnerId;
  $("#editPartnerName").value = partner.PartnerName || "";
  const partnerType = partner.PartnerType || "Entity";
  $("#editPartnerType").value = partnerType;
  
  // Show/hide investor rep based on partner type
  const repGroup = $("#editPartnerRepGroup");
  const repFields = $("#editPartnerRepFields");
  if (partnerType === "Individual") {
    if (repGroup) repGroup.style.display = "none";
    if (repFields) repFields.style.display = "none";
  } else {
    if (repGroup) repGroup.style.display = "block";
  }
  
  // Show modal first so elements are accessible
  modal.style.display = "flex";
  
  // Setup searchable investor rep dropdown only if Entity
  if (partnerType === "Entity") {
    setupSearchableInvestorRepDropdown(partner.InvestorRepId || null);
    
    // If there's an existing investor rep, populate their details for editing
    if (partner.InvestorRepId) {
      const contacts = window.PEOPLE_DATA || [];
      const contact = contacts.find(c => c.PersonId === partner.InvestorRepId);
      if (contact) {
        // Show the rep fields and populate them
        if (repFields) {
          repFields.style.display = "block";
          $("#editPartnerRepName").value = contact.FullName || "";
          $("#editPartnerRepEmail").value = contact.Email || "";
          $("#editPartnerRepPhone").value = contact.Phone || "";
        }
      }
    }
  }
}

// Setup edit equity partner modal
function setupEditEquityPartnerModal() {
  const modal = $("#editEquityPartnerModal");
  const form = $("#editEquityPartnerForm");
  const cancelBtn = $("#cancelEditPartnerModalBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
  });
  
  // Handle partner type change to show/hide investor rep
  const partnerTypeSelect = $("#editPartnerType");
  const repGroup = $("#editPartnerRepGroup");
  const repFields = $("#editPartnerRepFields");
  const repSelect = $("#editPartnerRepSelect");
  const repSearch = $("#editPartnerRepSearch");
  
  partnerTypeSelect?.addEventListener("change", () => {
    const partnerType = partnerTypeSelect.value;
    if (partnerType === "Individual") {
      // Hide investor rep section for Individuals
      if (repGroup) repGroup.style.display = "none";
      if (repFields) repFields.style.display = "none";
      // Clear any selected rep
      if (repSelect) repSelect.value = "";
      if (repSearch) repSearch.value = "";
      if ($("#editPartnerRepName")) $("#editPartnerRepName").value = "";
      if ($("#editPartnerRepEmail")) $("#editPartnerRepEmail").value = "";
      if ($("#editPartnerRepPhone")) $("#editPartnerRepPhone").value = "";
    } else {
      // Show investor rep section for Entities
      if (repGroup) repGroup.style.display = "block";
    }
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const partnerId = parseInt($("#editPartnerId").value);
    const partnerName = $("#editPartnerName").value.trim();
    const partnerType = $("#editPartnerType").value;
    
    if (!partnerName) {
      alert("Partner name is required");
      return;
    }
    
    if (!partnerType) {
      alert("Partner type is required");
      return;
    }
    
    const updateData = {
      PartnerName: partnerName,
      PartnerType: partnerType
    };
    
    // Only handle investor rep if partner type is Entity (Individuals don't have investor reps)
    if (partnerType === "Individual") {
      // Clear investor rep for Individuals
      updateData.InvestorRepId = null;
    } else {
      // Handle investor rep (contact) - either select existing, create new, or update existing
      const repSelect = $("#editPartnerRepSelect");
      const repFields = $("#editPartnerRepFields");
      const repSelectValue = repSelect ? repSelect.value : "";
      const isRepFieldsVisible = repFields && repFields.style.display !== "none";
    
      // Check if we're editing an existing contact (repFields visible and has a value in the select)
      const existingRepId = repSelectValue && repSelectValue !== "" && repSelectValue !== "__new__" 
        ? parseInt(repSelectValue) 
        : null;
      
      // If repFields are visible, we're either creating new or editing existing
      if (isRepFieldsVisible) {
      const repName = $("#editPartnerRepName").value.trim();
      if (!repName) {
        alert("Please enter a contact name");
        return;
      }
      
      const repEmail = $("#editPartnerRepEmail").value.trim();
      const repPhone = $("#editPartnerRepPhone").value.trim();
      
      try {
        if (existingRepId) {
          // Update existing contact
          const contactUpdateData = {
            FullName: repName
          };
          if (repEmail) contactUpdateData.Email = repEmail;
          if (repPhone) contactUpdateData.Phone = repPhone;
          
          await API.updatePerson(existingRepId, contactUpdateData);
          
          // Reload contacts
          const contactsRes = await API.getAllPersons();
          window.PEOPLE_DATA = contactsRes?.data || contactsRes || [];
          
          // Use the existing contact ID
          updateData.InvestorRepId = existingRepId;
        } else {
          // Create new contact
          const newContactData = {
            FullName: repName
          };
          if (repEmail) newContactData.Email = repEmail;
          if (repPhone) newContactData.Phone = repPhone;
          
          // Check for duplicates and create or use existing contact
          const contactResult = await createOrFindContact(newContactData);
          const contactId = contactResult.contactId;
          
          // Show message if duplicate was found
          if (contactResult.isDuplicate) {
            const duplicateMsg = repEmail 
              ? `Contact "${repName}" (${repEmail}) already exists. Using existing contact.`
              : `Contact "${repName}" already exists. Using existing contact.`;
            console.log(duplicateMsg);
            showSuccessMessage(duplicateMsg, 3000);
          }
          
          // Use InvestorRepId (PersonId from core.Person table)
          updateData.InvestorRepId = contactId;
        }
      } catch (error) {
        console.error("Error saving contact:", error);
        alert(`Error saving contact: ${error.message}`);
        return;
      }
      } else if (repSelectValue && repSelectValue !== "" && repSelectValue !== "__new__") {
        // Use existing contact selected from dropdown (InvestorRepId is PersonId from core.Person table)
        updateData.InvestorRepId = parseInt(repSelectValue);
      }
      // If repSelectValue is empty, we don't set InvestorRepId (allows clearing the contact)
    }
    
    try {
      await updateEquityPartner(partnerId, updateData);
      
      // Reload partners and contacts
      const partnersRes = await getAllEquityPartners();
      window.EQUITY_PARTNERS_DATA = partnersRes?.data || partnersRes || [];
      
      // Reload contacts if we updated one
      if (updateData.InvestorRepId) {
        const contactsRes = await API.getAllPersons();
        window.PEOPLE_DATA = contactsRes?.data || contactsRes || [];
      }
      
      // Find which property this partner is associated with
      // Look for a commitment with this partner to get the projectId
      const commitments = window.EQUITY_COMMITMENTS_DATA || [];
      const commitment = commitments.find(c => c.EquityPartnerId === partnerId);
      const projectId = commitment?.ProjectId;
      
      // Find the property key from the projectId
      let propertyKey = null;
      if (projectId) {
        const project = window.PROJECTS_DATA.find(p => p.ProjectId === projectId);
        if (project) {
          // Find the property in CURRENT_ROWS
          const currentRow = CURRENT_ROWS.find(r => 
            (r.Row || r._banking?.Row) === projectId
          );
          if (currentRow) {
            propertyKey = currentRow.ProjectName || currentRow.Property;
          }
        }
      }
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Refresh the Contacts & Partners view if we're on that tab
      if (currentTab === "contacts-partners") {
        await renderContactsPartnersView();
        showSuccessMessage("Partner updated successfully!", 3000);
        return; // Don't do property expansion if we're on contacts page
      }
      
      // If we found a property key, preserve expansion; otherwise do full reload
      if (propertyKey) {
        await preserveAndRestoreExpansion(propertyKey, (detail, detailRow) => {
          // Ensure the equity tab is active
          const tabButton = detailRow?.querySelector('button[data-tab="equity"]');
          if (tabButton) {
            tabButton.click();
          }
        });
      } else {
        // Fallback to full reload if we can't find the property
        await loadAll();
        await renderAll();
      }
      
      showSuccessMessage("Equity partner updated successfully!");
    } catch (error) {
      console.error("Error updating equity partner:", error);
      alert(`Error: ${error.message}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  });
}

/* ---------- Searchable Dropdown Helper Functions ---------- */

// Helper function to check for duplicate contacts by name or email
// Returns existing contact if duplicate found, null otherwise
function findDuplicateContact(name, email) {
  if (!name && !email) return null;
  
  const contacts = window.PEOPLE_DATA || [];
  const nameLower = (name || "").trim().toLowerCase();
  const emailLower = (email || "").trim().toLowerCase();
  
  // Check for duplicates by name or email
  const duplicate = contacts.find(c => {
    const contactName = (c.FullName || "").trim().toLowerCase();
    const contactEmail = (c.Email || "").trim().toLowerCase();
    
    // Match by exact name (case-insensitive)
    if (nameLower && contactName === nameLower) {
      return true;
    }
    
    // Match by exact email (case-insensitive) if email is provided
    if (emailLower && contactEmail && contactEmail === emailLower) {
      return true;
    }
    
    return false;
  });
  
  return duplicate || null;
}

// Helper function to check for duplicate equity partners by name
// Returns existing partner if duplicate found, null otherwise
function findDuplicateEquityPartner(partnerName) {
  if (!partnerName) return null;
  
  const partners = window.EQUITY_PARTNERS_DATA || [];
  const nameLower = partnerName.trim().toLowerCase();
  
  // Check for duplicates by exact name (case-insensitive)
  const duplicate = partners.find(p => {
    const partnerNameLower = (p.PartnerName || "").trim().toLowerCase();
    return partnerNameLower === nameLower;
  });
  
  return duplicate || null;
}

// Helper function to create or find existing contact (prevents duplicates)
// Returns { contactId, isDuplicate, existingContact }
async function createOrFindContact(contactData) {
  const name = (contactData.FullName || "").trim();
  const email = (contactData.Email || "").trim();
  
  if (!name) {
    throw new Error("Contact name is required");
  }
  
  // Check for duplicate before creating
  const duplicate = findDuplicateContact(name, email);
  
  if (duplicate) {
    // Duplicate found - return existing contact
    return {
      contactId: duplicate.PersonId,
      isDuplicate: true,
      existingContact: duplicate
    };
  }
  
  // No duplicate - create new contact
  try {
    const newContact = await createPerson(contactData);
    const contactId = newContact.data?.PersonId || newContact.PersonId;
    
    // Reload contacts to include the new one
    const contactsRes = await getAllPersons();
    window.PEOPLE_DATA = contactsRes?.data || contactsRes || [];
    
    return {
      contactId: contactId,
      isDuplicate: false,
      existingContact: null
    };
  } catch (error) {
    console.error("Error creating contact:", error);
    throw error;
  }
}

// Helper function to create or find existing equity partner (prevents duplicates)
// Returns { partnerId, isDuplicate, existingPartner }
async function createOrFindEquityPartner(partnerData) {
  const partnerName = (partnerData.PartnerName || "").trim();
  
  if (!partnerName) {
    throw new Error("Partner name is required");
  }
  
  // Check for duplicate before creating
  const duplicate = findDuplicateEquityPartner(partnerName);
  
  if (duplicate) {
    // Duplicate found - return existing partner
    return {
      partnerId: duplicate.EquityPartnerId,
      isDuplicate: true,
      existingPartner: duplicate
    };
  }
  
  // No duplicate - create new partner
  try {
    const newPartner = await createEquityPartner(partnerData);
    const partnerId = newPartner.data?.EquityPartnerId || newPartner.EquityPartnerId;
    
    // Reload partners to include the new one
    const partnersRes = await getAllEquityPartners();
    window.EQUITY_PARTNERS_DATA = partnersRes?.data || partnersRes || [];
    
    return {
      partnerId: partnerId,
      isDuplicate: false,
      existingPartner: null
    };
  } catch (error) {
    console.error("Error creating equity partner:", error);
    throw error;
  }
}

// Show "Add New Contact" modal
// callback: function(contactId) - called when contact is successfully created
function showAddNewContactModal(prefilledName = "", callback = null) {
  const modal = $("#addNewContactModal");
  const form = $("#addNewContactForm");
  const nameInput = $("#newContactName");
  const emailInput = $("#newContactEmail");
  const phoneInput = $("#newContactPhone");
  const cancelBtn = $("#cancelNewContactModalBtn");
  
  if (!modal || !form) {
    console.error("Add New Contact modal elements not found");
    return;
  }
  
  // Pre-fill name if provided
  if (nameInput && prefilledName) {
    nameInput.value = prefilledName;
  } else if (nameInput) {
    nameInput.value = "";
  }
  
  // Clear email and phone
  if (emailInput) emailInput.value = "";
  if (phoneInput) phoneInput.value = "";
  
  // Show modal
  modal.style.display = "flex";
  
  // Cancel button handler
  if (cancelBtn) {
    const cancelHandler = () => {
      modal.style.display = "none";
      form.reset();
      cancelBtn.removeEventListener("click", cancelHandler);
    };
    cancelBtn.addEventListener("click", cancelHandler);
  }
  
  // Form submission handler
  const submitHandler = async (e) => {
    e.preventDefault();
    
    const name = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const phone = phoneInput ? phoneInput.value.trim() : "";
    
    if (!name) {
      alert("Please enter a contact name");
      return;
    }
    
    try {
      const contactData = {
        FullName: name
      };
      if (email) contactData.Email = email;
      if (phone) contactData.Phone = phone;
      
      // Check for duplicates and create or use existing contact
      const contactResult = await createOrFindContact(contactData);
      const contactId = contactResult.contactId;
      
      // Show message if duplicate was found
      if (contactResult.isDuplicate) {
        const duplicateMsg = email 
          ? `Contact "${name}" (${email}) already exists. Using existing contact.`
          : `Contact "${name}" already exists. Using existing contact.`;
        console.log(duplicateMsg);
        showSuccessMessage(duplicateMsg, 3000);
      } else {
        showSuccessMessage(`Contact "${name}" created successfully.`, 2000);
      }
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Call callback with the contact ID
      if (callback && typeof callback === "function") {
        callback(contactId);
      }
      
      // Remove event listener
      form.removeEventListener("submit", submitHandler);
    } catch (error) {
      console.error("Error creating contact:", error);
      alert(`Error creating contact: ${error.message}`);
    }
  };
  
  form.addEventListener("submit", submitHandler);
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  });
}

// Setup searchable dropdown for investor rep (single select with "Add New Contact" option)
function setupSearchableInvestorRepDropdown(selectedInvestorRepId = null) {
  const searchInput = $("#editPartnerRepSearch");
  const dropdown = $("#editPartnerRepDropdown");
  const select = $("#editPartnerRepSelect");
  const fieldsContainer = $("#editPartnerRepFields");
  const nameInput = $("#editPartnerRepName");
  const emailInput = $("#editPartnerRepEmail");
  const phoneInput = $("#editPartnerRepPhone");
  
  if (!searchInput || !dropdown || !select || !fieldsContainer) return;
  
  // Get all contacts
  const contacts = window.PEOPLE_DATA || [];
  let selectedContactId = selectedInvestorRepId ? parseInt(selectedInvestorRepId) : null;
  
  // Function to update hidden select
  function updateHiddenSelect(contactId) {
    select.innerHTML = '';
    if (contactId) {
      const contact = contacts.find(c => c.PersonId === contactId);
      if (contact) {
        const option = document.createElement('option');
        option.value = contactId;
        option.textContent = contact.FullName || `Contact ${contactId}`;
        option.selected = true;
        select.appendChild(option);
        searchInput.value = contact.FullName || "";
      }
    } else {
      const option = document.createElement('option');
      option.value = "";
      option.textContent = "";
      select.appendChild(option);
      searchInput.value = "";
    }
  }
  
  // Function to show/hide "Create New Contact" fields
  function toggleCreateNewFields(show) {
    if (fieldsContainer) {
      fieldsContainer.style.display = show ? "block" : "none";
    }
    if (nameInput) {
      nameInput.required = show;
    }
  }
  
  // Function to render dropdown options
  function renderDropdown(contactList, showAddNew = false) {
    if (contactList.length === 0 && !showAddNew) {
      dropdown.innerHTML = '<div class="dropdown-item" style="padding: 12px; color: var(--muted);">No contacts found</div>';
      return;
    }
    
    let html = '';
    
    // Add matching contacts
    contactList.forEach(contact => {
      const contactId = contact.PersonId;
      const contactName = contact.FullName || `Contact ${contactId}`;
      const contactEmail = contact.Email || "";
      const displayText = contactEmail ? `${contactName} (${contactEmail})` : contactName;
      const escapedText = displayText.replace(/"/g, '&quot;');
      const isSelected = selectedContactId === contactId;
      
      if (!isSelected) {
        html += `
          <div class="dropdown-item" data-contact-id="${contactId}" data-contact-name="${escapedText}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border, #e0e0e0);">
            ${displayText}
          </div>
        `;
      }
    });
    
    // Add "Add New Contact" option at the bottom if search doesn't match
    if (showAddNew) {
      const searchQuery = searchInput.value.trim();
      html += `
        <div class="dropdown-item" data-action="add-new" style="padding: 10px 12px; cursor: pointer; border-top: 2px solid var(--border, #e0e0e0); background: var(--primary-light, #e3f2fd); font-weight: 500; color: var(--primary, #1976d2);">
          + Add New Contact: "${searchQuery}"
        </div>
      `;
    }
    
    dropdown.innerHTML = html;
    
    // Add click handlers
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.action === 'add-new') {
          // Show "Add New Contact" modal
          const searchQuery = searchInput.value.trim();
          showAddNewContactModal(searchQuery, (contactId) => {
            // Callback when contact is created - update the select and search input
            selectedContactId = contactId;
            updateHiddenSelect(contactId);
            toggleCreateNewFields(false);
            dropdown.style.display = 'none';
          });
        } else {
          const contactId = parseInt(item.dataset.contactId);
          if (contactId && !isNaN(contactId)) {
            selectedContactId = contactId;
            updateHiddenSelect(contactId);
            
            // Show fields and populate with contact data for editing
            const contact = contacts.find(c => c.PersonId === contactId);
            if (contact) {
              toggleCreateNewFields(true); // Show fields for editing
              if (nameInput) nameInput.value = contact.FullName || "";
              if (emailInput) emailInput.value = contact.Email || "";
              if (phoneInput) phoneInput.value = contact.Phone || "";
            } else {
              toggleCreateNewFields(false);
              // Clear fields
              if (nameInput) nameInput.value = "";
              if (emailInput) emailInput.value = "";
              if (phoneInput) phoneInput.value = "";
            }
            dropdown.style.display = 'none';
          }
        }
      });
    });
  }
  
  // Initial setup - pre-select if InvestorRepId exists
  if (selectedContactId) {
    const contact = contacts.find(c => c.PersonId === selectedContactId);
    if (contact) {
      updateHiddenSelect(selectedContactId);
      // Show fields and populate with contact data for editing
      toggleCreateNewFields(true);
      if (nameInput) nameInput.value = contact.FullName || "";
      if (emailInput) emailInput.value = contact.Email || "";
      if (phoneInput) phoneInput.value = contact.Phone || "";
    } else {
      // Contact not found - might be legacy data, show fields with populated data
      const partner = window.EQUITY_PARTNERS_DATA.find(p => p.InvestorRepId === selectedContactId);
      if (partner && partner.InvestorRepName) {
        toggleCreateNewFields(true);
        if (nameInput) nameInput.value = partner.InvestorRepName || "";
        if (emailInput) emailInput.value = partner.InvestorRepEmail || "";
        if (phoneInput) phoneInput.value = partner.InvestorRepPhone || "";
        updateHiddenSelect(null);
      }
    }
  } else {
    toggleCreateNewFields(false);
    updateHiddenSelect(null);
  }
  
  // Initial render
  renderDropdown(contacts, false);
  
  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query === '') {
      renderDropdown(contacts, false);
      dropdown.style.display = contacts.length > 0 ? 'block' : 'none';
    } else {
      const filtered = contacts.filter(c => {
        const name = (c.FullName || '').toLowerCase();
        const email = (c.Email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      });
      
      // Check if any match
      const hasMatch = filtered.some(c => c.PersonId !== selectedContactId);
      
      // Show "Add New Contact" if search doesn't match any contacts
      renderDropdown(filtered, !hasMatch && query.length > 0);
      dropdown.style.display = (filtered.length > 0 || !hasMatch) ? 'block' : 'none';
    }
  });
  
  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') {
      renderDropdown(contacts, false);
    } else {
      const filtered = contacts.filter(c => {
        const name = (c.FullName || '').toLowerCase();
        const email = (c.Email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      });
      const hasMatch = filtered.some(c => c.PersonId !== selectedContactId);
      renderDropdown(filtered, !hasMatch && query.length > 0);
    }
    dropdown.style.display = 'block';
  });
  
  // Hide dropdown when clicking outside
  let clickOutsideHandler = (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target) && !fieldsContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', clickOutsideHandler);
  
  // Update select when value changes
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== searchInput && !dropdown.contains(document.activeElement) && !fieldsContainer.contains(document.activeElement)) {
        dropdown.style.display = 'none';
      }
    }, 200);
  });
}

// Setup searchable multi-select for related parties (equity partners)
function setupSearchableRelatedPartiesDropdown(searchInputId, dropdownId, selectId, chipsContainerId, partners, excludePartnerId = null, onSelect = null) {
  const searchInput = $(searchInputId);
  const dropdown = $(dropdownId);
  const select = $(selectId);
  const chipsContainer = $(chipsContainerId);
  
  if (!searchInput || !dropdown || !select || !chipsContainer) {
    console.warn("setupSearchableRelatedPartiesDropdown: Missing required elements", { searchInputId, dropdownId, selectId, chipsContainerId });
    return null;
  }
  
  // Remove any existing event listeners by cloning the input (this removes all listeners)
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);
  const finalSearchInput = newSearchInput;
  
  // Filter out the lead partner (excludePartnerId) from available options
  const availablePartners = partners.filter(p => p.EquityPartnerId !== excludePartnerId);
  
  // Track selected partner IDs
  const selectedPartnerIds = new Set();
  
  // Load existing selections from hidden select
  Array.from(select.options).forEach(opt => {
    const id = parseInt(opt.value);
    if (id && !isNaN(id)) {
      selectedPartnerIds.add(id);
    }
  });
  
  // Function to render chips for selected partners
  function renderChips() {
    if (selectedPartnerIds.size === 0) {
      chipsContainer.innerHTML = '';
      return;
    }
    
    const chipsHtml = Array.from(selectedPartnerIds).map(partnerId => {
      const partner = partners.find(p => p.EquityPartnerId === partnerId);
      const partnerName = partner ? (partner.PartnerName || `Partner ${partnerId}`) : `Partner ${partnerId}`;
      const escapedName = partnerName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
        <span class="chip" data-partner-id="${partnerId}" style="display: inline-flex; align-items: center; gap: 6px; background: var(--primary-light, #e3f2fd); color: var(--primary, #1976d2); padding: 4px 10px; border-radius: 16px; font-size: 13px;">
          ${partnerName}
          <button type="button" onclick="removeRelatedParty(${partnerId})" style="background: none; border: none; color: var(--primary, #1976d2); cursor: pointer; padding: 0; margin: 0; font-size: 16px; line-height: 1; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">×</button>
        </span>
      `;
    }).join('');
    
    chipsContainer.innerHTML = chipsHtml;
  }
  
  // Function to update hidden select
  function updateHiddenSelect() {
    // Clear existing options
    select.innerHTML = '';
    
    // Add selected options
    Array.from(selectedPartnerIds).forEach(partnerId => {
      const partner = partners.find(p => p.EquityPartnerId === partnerId);
      const partnerName = partner ? (partner.PartnerName || `Partner ${partnerId}`) : `Partner ${partnerId}`;
      const option = document.createElement('option');
      option.value = partnerId;
      option.textContent = partnerName;
      option.selected = true;
      select.appendChild(option);
    });
  }
  
  // Function to add a partner
  window.addRelatedParty = function(partnerId) {
    if (selectedPartnerIds.has(partnerId)) return; // Already selected
    selectedPartnerIds.add(partnerId);
    renderChips();
    updateHiddenSelect();
    finalSearchInput.value = '';
    dropdown.style.display = 'none';
    if (onSelect) onSelect(partnerId);
  };
  
  // Function to remove a partner
  window.removeRelatedParty = function(partnerId) {
    selectedPartnerIds.delete(partnerId);
    renderChips();
    updateHiddenSelect();
  };
  
  // Function to render dropdown options
  function renderDropdown(partnerList, showAddNew = false) {
    if (partnerList.length === 0 && !showAddNew) {
      dropdown.innerHTML = '<div class="dropdown-item" style="padding: 12px; color: var(--muted);">No partners found</div>';
      return;
    }
    
    let html = '';
    
    // Add matching partners
    partnerList.forEach(partner => {
      const partnerId = partner.EquityPartnerId;
      const partnerName = partner.PartnerName || `Partner ${partnerId}`;
      const isSelected = selectedPartnerIds.has(partnerId);
      const escapedName = partnerName.replace(/"/g, '&quot;');
      
      if (!isSelected) {
        html += `
          <div class="dropdown-item" data-partner-id="${partnerId}" data-partner-name="${escapedName}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border, #e0e0e0);">
            ${partnerName}
          </div>
        `;
      }
    });
    
    // Add "Add New Contact" option at the bottom if search doesn't match
    if (showAddNew) {
      const searchQuery = finalSearchInput.value.trim();
      html += `
        <div class="dropdown-item" data-action="add-new" style="padding: 10px 12px; cursor: pointer; border-top: 2px solid var(--border, #e0e0e0); background: var(--primary-light, #e3f2fd); font-weight: 500; color: var(--primary, #1976d2);">
          + Add New Contact: "${searchQuery}"
        </div>
      `;
    }
    
    dropdown.innerHTML = html;
    
    // Add click handlers
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.action === 'add-new') {
          // Handle adding new partner
          const searchQuery = finalSearchInput.value.trim();
          if (!searchQuery) {
            alert("Please enter a partner name to add");
    return;
  }
  
          // Show modal or prompt to add new partner
          // For now, we'll create it directly via API
          (async () => {
            try {
              const newPartnerData = {
                PartnerName: searchQuery
              };
              
              // Check for duplicates and create or use existing partner
              const partnerResult = await createOrFindEquityPartner(newPartnerData);
              const partnerId = partnerResult.partnerId;
              
              // Show message if duplicate was found
              if (partnerResult.isDuplicate) {
                const duplicateMsg = `Equity partner "${searchQuery}" already exists. Using existing partner.`;
                console.log(duplicateMsg);
                showSuccessMessage(duplicateMsg, 3000);
              }
              
              // Add to selected (whether new or existing)
              window.addRelatedParty(partnerId);
              
              // Refresh dropdown
              const query = finalSearchInput.value.toLowerCase().trim();
              if (query === '') {
                renderDropdown(availablePartners, false);
              } else {
                const filtered = availablePartners.filter(p => 
                  (p.PartnerName || '').toLowerCase().includes(query)
                );
                renderDropdown(filtered, false);
              }
            } catch (error) {
              console.error("Error creating new partner:", error);
              alert(`Error creating new partner: ${error.message}`);
            }
          })();
        } else {
          const partnerId = parseInt(item.dataset.partnerId);
          if (partnerId && !isNaN(partnerId)) {
            window.addRelatedParty(partnerId);
          }
        }
      });
    });
  }
  
  // Initial render
  renderChips();
  renderDropdown(availablePartners, false);
  
  // Search input handler - use finalSearchInput instead of searchInput
  finalSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query === '') {
      renderDropdown(availablePartners, false);
      dropdown.style.display = availablePartners.length > 0 ? 'block' : 'none';
    } else {
      const filtered = availablePartners.filter(p => 
        (p.PartnerName || '').toLowerCase().includes(query)
      );
      
      // Check if any match
      const hasMatch = filtered.some(p => !selectedPartnerIds.has(p.EquityPartnerId));
      
      // Show "Add New Contact" if search doesn't match any unselected partners
      renderDropdown(filtered, !hasMatch && query.length > 0);
      dropdown.style.display = (filtered.length > 0 || !hasMatch) ? 'block' : 'none';
    }
  });
  
  // Also show dropdown on keydown (for better responsiveness)
  finalSearchInput.addEventListener('keydown', (e) => {
    // Don't interfere with arrow keys, enter, etc. when dropdown is visible
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
      return;
    }
    // Show dropdown when user starts typing
    if (dropdown.style.display === 'none') {
      const query = finalSearchInput.value.toLowerCase().trim();
      if (query === '') {
        renderDropdown(availablePartners, false);
      } else {
        const filtered = availablePartners.filter(p => 
          (p.PartnerName || '').toLowerCase().includes(query)
        );
        const hasMatch = filtered.some(p => !selectedPartnerIds.has(p.EquityPartnerId));
        renderDropdown(filtered, !hasMatch && query.length > 0);
      }
      dropdown.style.display = 'block';
    }
  });
  
  // Show dropdown on focus
  finalSearchInput.addEventListener('focus', () => {
    const query = finalSearchInput.value.toLowerCase().trim();
    if (query === '') {
      renderDropdown(availablePartners, false);
    } else {
      const filtered = availablePartners.filter(p => 
        (p.PartnerName || '').toLowerCase().includes(query)
      );
      const hasMatch = filtered.some(p => !selectedPartnerIds.has(p.EquityPartnerId));
      renderDropdown(filtered, !hasMatch && query.length > 0);
    }
    dropdown.style.display = 'block';
  });
  
  // Hide dropdown when clicking outside
  let clickOutsideHandler = (e) => {
    if (!finalSearchInput.contains(e.target) && !dropdown.contains(e.target) && !chipsContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', clickOutsideHandler);
  
  // Update select when value changes
  finalSearchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== finalSearchInput && !dropdown.contains(document.activeElement) && !chipsContainer.contains(document.activeElement)) {
        dropdown.style.display = 'none';
      }
    }, 200);
  });
  
  // Return cleanup function and methods
  return {
    cleanup: () => {
      document.removeEventListener('click', clickOutsideHandler);
    },
    getSelectedIds: () => Array.from(selectedPartnerIds),
    setSelectedIds: (ids) => {
      selectedPartnerIds.clear();
      ids.forEach(id => selectedPartnerIds.add(id));
      renderChips();
      updateHiddenSelect();
    }
  };
}

function setupSearchableBankDropdown(searchInputId, dropdownId, selectId, banks, onSelect) {
  const searchInput = $(searchInputId);
  const dropdown = $(dropdownId);
  const select = $(selectId);
  
  if (!searchInput || !dropdown || !select) return;
  
  let selectedBankId = null;
  let filteredBanks = [...banks];
  
  // Function to render dropdown options
  function renderDropdown(bankList) {
    if (bankList.length === 0) {
      dropdown.innerHTML = '<div class="dropdown-item" style="padding: 12px; color: var(--muted);">No banks found</div>';
    return;
  }
  
    dropdown.innerHTML = bankList.map(bank => `
      <div class="dropdown-item" data-bank-id="${bank.BankId}" data-bank-name="${(bank.BankName || '').replace(/"/g, '&quot;')}">
        ${bank.BankName || `Bank ${bank.BankId}`}
      </div>
    `).join("");
    
    // Add click handlers
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const bankId = parseInt(item.dataset.bankId);
        const bankName = item.dataset.bankName;
        selectedBankId = bankId;
        searchInput.value = bankName;
        
        // Ensure select has the option, then set value
        if (select) {
          // Clear existing options except the default
          const defaultOption = select.querySelector('option[value=""]');
          select.innerHTML = '';
          if (defaultOption) {
            const newDefault = document.createElement('option');
            newDefault.value = '';
            newDefault.textContent = '-- Select Bank --';
            select.appendChild(newDefault);
          }
          
          // Add the selected bank as an option
          const option = document.createElement('option');
          option.value = bankId;
          option.textContent = bankName;
          option.selected = true;
          select.appendChild(option);
          select.value = bankId;
        }
        
        dropdown.style.display = 'none';
        if (onSelect) onSelect(bankId, bankName);
      });
    });
  }
  
  // Initial render
  renderDropdown(filteredBanks);
  
  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query === '') {
      filteredBanks = [...banks];
    } else {
      filteredBanks = banks.filter(bank => 
        (bank.BankName || '').toLowerCase().includes(query)
      );
    }
    
    renderDropdown(filteredBanks);
    dropdown.style.display = filteredBanks.length > 0 ? 'block' : 'none';
  });
  
  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    // Reset to show all banks when focusing
    if (searchInput.value === '') {
      filteredBanks = [...banks];
      renderDropdown(filteredBanks);
    }
    dropdown.style.display = filteredBanks.length > 0 ? 'block' : 'none';
  });
  
  // Hide dropdown when clicking outside
  let clickOutsideHandler = (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', clickOutsideHandler);
  
  // Update select when value changes
  searchInput.addEventListener('blur', () => {
    // Keep dropdown open briefly to allow clicks
    setTimeout(() => {
      if (document.activeElement !== searchInput && !dropdown.contains(document.activeElement)) {
        dropdown.style.display = 'none';
      }
    }, 200);
  });
  
  // Return cleanup function
  return () => {
    document.removeEventListener('click', clickOutsideHandler);
  };
}

/* ---------- Permanent Financing Modal Functions ---------- */
function showAddPermanentFinancingModal() {
  const modal = $("#addPermanentFinancingModal");
  const form = $("#permanentFinancingForm");
  const projectSelect = $("#permanentProjectSelect");
  const lenderSearch = $("#permanentLenderSearch");
  const lenderDropdown = $("#permanentLenderDropdown");
  const lenderSelect = $("#permanentLenderSelect");
  
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  form.dataset.mode = "add";
  
  // Clear search input
  if (lenderSearch) lenderSearch.value = "";
  if (lenderDropdown) lenderDropdown.style.display = "none";
  
  // Populate projects dropdown
  projectSelect.innerHTML = '<option value="">-- Select Property --</option>';
  const projects = window.PROJECTS_DATA || [];
  projects.forEach(project => {
    const option = document.createElement("option");
    option.value = project.ProjectId;
    option.textContent = project.ProjectName || `Project ${project.ProjectId}`;
    projectSelect.appendChild(option);
  });
  
  // Setup searchable bank dropdown
  const banks = window.BANKS_DATA || [];
  if (lenderSearch && lenderDropdown && lenderSelect) {
    // Sort banks alphabetically for better UX
    const sortedBanks = [...banks].sort((a, b) => {
      const nameA = (a.BankName || '').toLowerCase();
      const nameB = (b.BankName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    setupSearchableBankDropdown(
      "#permanentLenderSearch",
      "#permanentLenderDropdown",
      "#permanentLenderSelect",
      sortedBanks,
      (bankId, bankName) => {
        // Optional callback when bank is selected
      }
    );
  }
  
  // Show modal
  modal.style.display = "flex";
}

// Handle permanent financing form submission
function setupPermanentFinancingModal() {
  const modal = $("#addPermanentFinancingModal");
  const form = $("#permanentFinancingForm");
  const cancelBtn = $("#cancelPermanentModalBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    form.reset();
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const projectId = parseInt($("#permanentProjectSelect").value);
    // Get lender ID from hidden select (updated by searchable dropdown)
    const lenderId = parseInt($("#permanentLenderSelect").value);
    const closeDate = $("#permanentCloseDate").value || null;
    const loanAmount = parseFloat($("#permanentLoanAmount").value) || null;
    const maturityDate = $("#permanentMaturityDate").value || null;
    const interestRate = $("#permanentInterestRate").value || null;
    const fixedOrFloating = $("#permanentFixedOrFloating").value || null;
    const indexName = $("#permanentIndexName").value || null;
    const spread = $("#permanentSpread").value ? parseFloat($("#permanentSpread").value) : null;
    
    if (!projectId) {
      alert("Please select a property");
    return;
  }
  
    if (!lenderId) {
      alert("Please select a lender");
      return;
    }
    
    if (!closeDate) {
      alert("Please enter a permanent close date");
      return;
    }
    
    if (!loanAmount || isNaN(loanAmount)) {
      alert("Please enter a valid loan amount");
      return;
    }
    
    if (!maturityDate) {
      alert("Please enter a maturity date");
    return;
  }
  
    // Prepare loan data for permanent financing
    const loanData = {
      ProjectId: projectId,
      LenderId: lenderId,
      LoanPhase: "Permanent",
      LoanClosingDate: closeDate,
      PermanentCloseDate: closeDate,
      LoanAmount: loanAmount,
      PermanentLoanAmount: loanAmount,
      MaturityDate: maturityDate,
      PermPhaseMaturity: maturityDate,
      PermPhaseInterestRate: interestRate || null,
      InterestRate: interestRate || null,
      FixedOrFloating: fixedOrFloating || null,
      IndexName: indexName || null,
      Spread: spread || null
    };
    
    try {
      // Preserve current view and expanded state
      const currentViewState = currentView;
      const currentTabState = currentTab;
      const expandedKeysCopy = new Set(expandedKeys);
      
      await createLoan(loanData);
      
      // Close modal
      modal.style.display = "none";
      form.reset();
      
      // Reload data
      await loadAll();
      
      // Restore view state
      currentView = currentViewState;
      currentTab = currentTabState;
      expandedKeys = expandedKeysCopy;
      
      renderAll();
      
      showSuccessMessage("Permanent financing added successfully!");
    } catch (error) {
      console.error("Error adding permanent financing:", error);
      alert(`Error: ${error.message || "Failed to add permanent financing"}`);
    }
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  });
}

async function addEquityCommitment(projectId, data) {
  try {
    data.ProjectId = projectId;
    await createEquityCommitment(data);
    await loadAll();
    // Don't call renderAll here - let the calling function handle it to preserve state
  } catch (error) {
    console.error("Error adding equity commitment:", error);
    throw error; // Re-throw so caller can handle
  }
}

async function updateEquityCommitmentById(commitmentId, data) {
  try {
    await updateEquityCommitment(commitmentId, data);
    await loadAll();
    // Don't call renderAll here - let the calling function handle it to preserve state
  } catch (error) {
    console.error("Error updating equity commitment:", error);
    throw error; // Re-throw so caller can handle
  }
}

async function deleteEquityCommitmentById(commitmentId) {
  if (!confirm("Are you sure you want to delete this equity commitment?")) return;
  try {
    // Preserve expanded state
    const expandedKeysCopy = new Set(expandedKeys);
    const expandedEquityPartnersCopy = new Set(expandedEquityPartners);
    
    await deleteEquityCommitment(commitmentId);
    await loadAll();
    
    // Restore expanded state
    expandedKeys = expandedKeysCopy;
    expandedEquityPartners = expandedEquityPartnersCopy;
    
    await renderAll();
    
    showSuccessMessage("Equity commitment deleted successfully!");
  } catch (error) {
    console.error("Error deleting equity commitment:", error);
    alert(`Error: ${error.message}`);
  }
}

// Bulk edit equity type for multiple commitments
async function bulkEditEquityType(commitmentIds, partnerName) {
  if (!commitmentIds || commitmentIds.length === 0) {
    alert("No commitments selected for bulk edit");
    return;
  }
  
  // Find the property key from the first commitment to preserve expansion
  const firstCommitment = window.EQUITY_COMMITMENTS_DATA.find(c => 
    commitmentIds.includes(c.EquityCommitmentId)
  );
  let propertyKey = null;
  if (firstCommitment && firstCommitment.ProjectId) {
    const project = window.PROJECTS_DATA.find(p => p.ProjectId === firstCommitment.ProjectId);
    if (project) {
      const currentRow = CURRENT_ROWS.find(r => 
        (r.Row || r._banking?.Row) === firstCommitment.ProjectId
      );
      if (currentRow) {
        propertyKey = currentRow.ProjectName || currentRow.Property;
      }
    }
  }
  
  // Show modal
  const modal = $("#bulkEditEquityTypeModal");
  const form = $("#bulkEditEquityTypeForm");
  const fieldSelect = $("#bulkEditFieldSelect");
  const equityTypeSelect = $("#bulkEditEquityTypeSelect");
  const equityTypeFields = $("#bulkEditEquityTypeFields");
  const relatedPartiesFields = $("#bulkEditRelatedPartiesFields");
  const countSpan = $("#bulkEditCommitmentCount");
  const cancelBtn = $("#cancelBulkEditModalBtn");
  
  if (!modal || !form || !fieldSelect) {
    alert("Bulk edit modal not found");
    return;
  }
  
  // Set commitment count
  if (countSpan) {
    countSpan.textContent = commitmentIds.length;
  }
  
  // Reset form
  fieldSelect.value = "";
  equityTypeSelect.value = "";
  form.dataset.commitmentIds = JSON.stringify(commitmentIds);
  form.dataset.propertyKey = propertyKey || "";
  
  // Hide all field groups initially
  if (equityTypeFields) equityTypeFields.style.display = "none";
  if (relatedPartiesFields) relatedPartiesFields.style.display = "none";
  
  // Show modal
  modal.style.display = "flex";
  
  // Setup form submission and field selector (only once)
  if (!form.dataset.setup) {
    form.dataset.setup = "true";
    
    // Field selector change handler
    fieldSelect.addEventListener("change", () => {
      const selectedField = fieldSelect.value;
      
      // Hide all fields
      if (equityTypeFields) equityTypeFields.style.display = "none";
      if (relatedPartiesFields) relatedPartiesFields.style.display = "none";
      
      // Show selected field
      if (selectedField === "equityType") {
        if (equityTypeFields) equityTypeFields.style.display = "block";
        if (equityTypeSelect) equityTypeSelect.required = true;
      } else if (selectedField === "relatedParties") {
        if (relatedPartiesFields) relatedPartiesFields.style.display = "block";
        // Setup searchable dropdown for related parties
        setupBulkEditRelatedPartiesDropdown(commitmentIds);
      }
    });
    
    // Cancel button
    cancelBtn?.addEventListener("click", () => {
      modal.style.display = "none";
      form.reset();
      if (equityTypeFields) equityTypeFields.style.display = "none";
      if (relatedPartiesFields) relatedPartiesFields.style.display = "none";
    });
    
    // Form submission
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const selectedField = fieldSelect.value;
      if (!selectedField) {
        alert("Please select what to edit");
        return;
      }
      
      const storedIds = form.dataset.commitmentIds;
      const storedPropertyKey = form.dataset.propertyKey;
      const ids = storedIds ? JSON.parse(storedIds) : commitmentIds;
      
      try {
        if (selectedField === "equityType") {
          const equityTypeFrontend = equityTypeSelect.value;
          if (!equityTypeFrontend) {
            alert("Please select an equity type");
            return;
          }
          
          // Map frontend value to backend value
          const equityType = mapEquityTypeToBackend(equityTypeFrontend);
          if (!equityType) {
            alert("Please select a valid equity type");
            return;
          }
          
          const confirmMessage = `Update ${ids.length} commitment(s) to "${equityTypeFrontend}"?`;
          if (!confirm(confirmMessage)) {
            return;
          }
          
          // Update all commitments with new equity type
          const updatePromises = ids.map(commitmentId => 
            updateEquityCommitment(commitmentId, { EquityType: equityType })
          );
          
          await Promise.all(updatePromises);
          
        } else if (selectedField === "relatedParties") {
          // Get selected related party IDs from hidden select
          const relatedPartiesSelect = $("#bulkEditRelatedParties");
          const relatedPartyIds = [];
          if (relatedPartiesSelect) {
            const selectedOptions = Array.from(relatedPartiesSelect.selectedOptions);
            relatedPartyIds.push(...selectedOptions.map(opt => parseInt(opt.value)).filter(id => !isNaN(id) && id > 0));
          }
          
          // Validate related party IDs exist
          const validRelatedPartyIds = relatedPartyIds.filter(id => 
            window.EQUITY_PARTNERS_DATA.some(p => p.EquityPartnerId === id)
          );
          
          const confirmMessage = `Update related parties for ${ids.length} commitment(s)?`;
          if (!confirm(confirmMessage)) {
            return;
          }
          
          // Update all commitments with new related parties
          const updatePromises = ids.map(commitmentId => {
            // Get the current commitment to preserve other fields
            const commitment = window.EQUITY_COMMITMENTS_DATA.find(c => c.EquityCommitmentId === commitmentId);
            if (!commitment) {
              console.warn("Commitment not found:", commitmentId);
              return Promise.resolve();
            }
            
            // Update with RelatedPartyIds (empty array clears, array with IDs sets them)
            return updateEquityCommitment(commitmentId, {
              ProjectId: commitment.ProjectId,
              EquityPartnerId: commitment.EquityPartnerId,
              RelatedPartyIds: validRelatedPartyIds
            });
          });
          
          await Promise.all(updatePromises);
        }
        
        // Close modal
        modal.style.display = "none";
        form.reset();
        if (equityTypeFields) equityTypeFields.style.display = "none";
        if (relatedPartiesFields) relatedPartiesFields.style.display = "none";
        
        // Use expansion preservation if we have a property key
        // Refresh related data (equity commitments) since we updated them
        if (storedPropertyKey) {
          const currentRow = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === storedPropertyKey);
          if (currentRow) {
            const projectId = currentRow.Row || currentRow._banking?.Row;
            const loanId = currentRow.LoanId || currentRow._constructionLoan?.LoanId;
            const permanentLoanId = currentRow.PermanentLoanId || currentRow._permanentLoan?.PermanentLoanId;
            
            // Update single property data with refreshRelated=true to get updated equity commitments
            const updatedRow = await updateSinglePropertyData(projectId, loanId, permanentLoanId, true);
            
            if (updatedRow) {
              await renderAll();
              
              // After rendering, expand and build details for the saved property
              requestAnimationFrame(() => {
                const sorted = applySort(CURRENT_ROWS);
                const rowData = sorted.find(r => (r.ProjectName || r.Property) === storedPropertyKey);
                if (!rowData) {
                  console.warn("Could not find rowData after bulk edit for:", storedPropertyKey);
                  return;
                }
                
                // Find the table row and expand it
                const tableRow = document.querySelector(`tr[data-key="${storedPropertyKey}"]`);
                if (tableRow) {
                  const detailRow = tableRow.nextElementSibling;
                  if (detailRow && detailRow.classList.contains('detail-row')) {
                    const detail = detailRow.querySelector('.detail');
                    if (detail) {
                      buildDetails(rowData);
                      adjustDetailWidth(detailRow);
                      // Ensure equity tab is active
                      const tabButton = detailRow.querySelector('button[data-tab="equity"]');
                      if (tabButton) {
                        tabButton.click();
                      }
                    }
                  }
                }
              });
        } else {
              await preserveAndRestoreExpansion(storedPropertyKey, (detail, detailRow) => {
                const tabButton = detailRow?.querySelector('button[data-tab="equity"]');
                if (tabButton) {
                  tabButton.click();
                }
              });
            }
          } else {
            await preserveAndRestoreExpansion(storedPropertyKey, (detail, detailRow) => {
              const tabButton = detailRow?.querySelector('button[data-tab="equity"]');
              if (tabButton) {
                tabButton.click();
              }
            });
          }
        } else {
          // Fallback to full reload if we can't find the property
          await loadAll();
          await renderAll();
        }
        
        showSuccessMessage(`Updated ${ids.length} commitment(s) successfully!`);
      } catch (error) {
        console.error("Error bulk updating:", error);
        alert(`Error: ${error.message}`);
      }
    });
  }
}

// Setup searchable dropdown for bulk edit related parties
function setupBulkEditRelatedPartiesDropdown(commitmentIds) {
  const searchInput = $("#bulkEditRelatedPartiesSearch");
  const dropdown = $("#bulkEditRelatedPartiesDropdown");
  const select = $("#bulkEditRelatedParties");
  const chipsContainer = $("#bulkEditRelatedPartiesChips");
  
  if (!searchInput || !dropdown || !select || !chipsContainer) return;
  
  // Get all partners (no exclusion for bulk edit - we'll handle exclusion per commitment)
  const partners = window.EQUITY_PARTNERS_DATA || [];
  
  // Track selected partner IDs
  const selectedPartnerIds = new Set();
  
  // Function to render chips for selected partners
  function renderChips() {
    if (selectedPartnerIds.size === 0) {
      chipsContainer.innerHTML = '';
      return;
    }
    
    const chipsHtml = Array.from(selectedPartnerIds).map(partnerId => {
      const partner = partners.find(p => p.EquityPartnerId === partnerId);
      const partnerName = partner ? (partner.PartnerName || `Partner ${partnerId}`) : `Partner ${partnerId}`;
      const escapedName = partnerName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `
        <span class="chip" data-partner-id="${partnerId}" style="display: inline-flex; align-items: center; gap: 6px; background: var(--primary-light, #e3f2fd); color: var(--primary, #1976d2); padding: 4px 10px; border-radius: 16px; font-size: 13px;">
          ${partnerName}
          <button type="button" onclick="removeBulkEditRelatedParty(${partnerId})" style="background: none; border: none; color: var(--primary, #1976d2); cursor: pointer; padding: 0; margin: 0; font-size: 16px; line-height: 1; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">×</button>
        </span>
      `;
    }).join('');
    
    chipsContainer.innerHTML = chipsHtml;
  }
  
  // Function to update hidden select
  function updateHiddenSelect() {
    select.innerHTML = '';
    Array.from(selectedPartnerIds).forEach(partnerId => {
      const partner = partners.find(p => p.EquityPartnerId === partnerId);
      const partnerName = partner ? (partner.PartnerName || `Partner ${partnerId}`) : `Partner ${partnerId}`;
      const option = document.createElement('option');
      option.value = partnerId;
      option.textContent = partnerName;
      option.selected = true;
      select.appendChild(option);
    });
  }
  
  // Function to add a partner
  window.addBulkEditRelatedParty = function(partnerId) {
    if (selectedPartnerIds.has(partnerId)) return;
    selectedPartnerIds.add(partnerId);
    renderChips();
    updateHiddenSelect();
    searchInput.value = '';
    dropdown.style.display = 'none';
  };
  
  // Function to remove a partner
  window.removeBulkEditRelatedParty = function(partnerId) {
    selectedPartnerIds.delete(partnerId);
    renderChips();
    updateHiddenSelect();
  };
  
  // Function to render dropdown options
  function renderDropdown(partnerList, showAddNew = false) {
    if (partnerList.length === 0 && !showAddNew) {
      dropdown.innerHTML = '<div class="dropdown-item" style="padding: 12px; color: var(--muted);">No partners found</div>';
      return;
    }
    
    let html = '';
    partnerList.forEach(partner => {
      const partnerId = partner.EquityPartnerId;
      const partnerName = partner.PartnerName || `Partner ${partnerId}`;
      const isSelected = selectedPartnerIds.has(partnerId);
      const escapedName = partnerName.replace(/"/g, '&quot;');
      
      if (!isSelected) {
        html += `
          <div class="dropdown-item" data-partner-id="${partnerId}" data-partner-name="${escapedName}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border, #e0e0e0);">
            ${partnerName}
          </div>
        `;
      }
    });
    
    if (showAddNew) {
      const searchQuery = searchInput.value.trim();
      html += `
        <div class="dropdown-item" data-action="add-new" style="padding: 10px 12px; cursor: pointer; border-top: 2px solid var(--border, #e0e0e0); background: var(--primary-light, #e3f2fd); font-weight: 500; color: var(--primary, #1976d2);">
          + Add New Contact: "${searchQuery}"
        </div>
      `;
    }
    
    dropdown.innerHTML = html;
    
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.action === 'add-new') {
          const searchQuery = searchInput.value.trim();
          if (!searchQuery) {
            alert("Please enter a partner name to add");
            return;
          }
          
          (async () => {
            try {
              const newPartnerData = { PartnerName: searchQuery };
              
              // Check for duplicates and create or use existing partner
              const partnerResult = await createOrFindEquityPartner(newPartnerData);
              const partnerId = partnerResult.partnerId;
              
              // Show message if duplicate was found
              if (partnerResult.isDuplicate) {
                const duplicateMsg = `Equity partner "${searchQuery}" already exists. Using existing partner.`;
                console.log(duplicateMsg);
                showSuccessMessage(duplicateMsg, 3000);
              }
              
              // Add to selected (whether new or existing)
              window.addBulkEditRelatedParty(partnerId);
              
              // Refresh dropdown
              const query = searchInput.value.toLowerCase().trim();
              if (query === '') {
                renderDropdown(partners, false);
                } else {
                const filtered = partners.filter(p => 
                  (p.PartnerName || '').toLowerCase().includes(query)
                );
                renderDropdown(filtered, false);
              }
            } catch (error) {
              console.error("Error creating new partner:", error);
              alert(`Error creating new partner: ${error.message}`);
            }
          })();
        } else {
          const partnerId = parseInt(item.dataset.partnerId);
          if (partnerId && !isNaN(partnerId)) {
            window.addBulkEditRelatedParty(partnerId);
          }
        }
      });
    });
  }
  
  // Initial render
  renderChips();
  renderDropdown(partners, false);
  
  // Search input handler
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query === '') {
      renderDropdown(partners, false);
      dropdown.style.display = partners.length > 0 ? 'block' : 'none';
    } else {
      const filtered = partners.filter(p => 
        (p.PartnerName || '').toLowerCase().includes(query)
      );
      const hasMatch = filtered.some(p => !selectedPartnerIds.has(p.EquityPartnerId));
      renderDropdown(filtered, !hasMatch && query.length > 0);
      dropdown.style.display = (filtered.length > 0 || !hasMatch) ? 'block' : 'none';
    }
  });
  
  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') {
      renderDropdown(partners, false);
    } else {
      const filtered = partners.filter(p => 
        (p.PartnerName || '').toLowerCase().includes(query)
      );
      const hasMatch = filtered.some(p => !selectedPartnerIds.has(p.EquityPartnerId));
      renderDropdown(filtered, !hasMatch && query.length > 0);
    }
    dropdown.style.display = 'block';
  });
  
  // Hide dropdown when clicking outside
  let clickOutsideHandler = (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target) && !chipsContainer.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', clickOutsideHandler);
  
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== searchInput && !dropdown.contains(document.activeElement) && !chipsContainer.contains(document.activeElement)) {
        dropdown.style.display = 'none';
      }
    }, 200);
  });
}

/* ---------- Bank View ---------- */
function aggregateBanks(rows) {
  const bankMap = new Map();
  const allParticipations = window.PARTICIPATIONS_DATA || [];
  const allBanks = window.BANKS_DATA || [];
  
  // First, collect all banks from both loans (as lenders) and participations
  for (const row of rows) {
    const projectId = row.Row || row._banking?.Row;
    if (!projectId) continue;
    
    // Process loans (bank as lender = lead)
    const lenderId = row.LenderId;
    if (lenderId) {
      if (!bankMap.has(lenderId)) {
        const bank = allBanks.find(b => b.BankId === lenderId);
        bankMap.set(lenderId, {
          BankId: lenderId,
          BankName: bank?.BankName || row.Lender || "",
          DealCount: 0,
          Exposure: 0,
          Positioning: "",
          EstimatedHoldLimit: bank?.HoldLimit || 0,
          EstimatedCapacity: 0,
          DebtYield: null, // External source
          LastDollar: null, // Calculated (requires external data)
          LTC: null, // Calculated (requires external data)
          Deals: [],
          ProjectIds: new Set()
        });
      }
      
      const bank = bankMap.get(lenderId);
      if (!bank.ProjectIds.has(projectId)) {
        bank.ProjectIds.add(projectId);
        bank.DealCount++;
        bank.Deals.push({
          ProjectId: projectId,
          ProjectName: row.ProjectName || row.Property || "",
          Exposure: num(row.LoanAmount || 0),
          LoanAmount: num(row.LoanAmount || 0),
          Status: row.Status || row.Stage || "",
          IsLead: true, // Bank is lender = lead
          Position: "Lead"
        });
        bank.Exposure += num(row.LoanAmount || 0);
      }
    }
    
    // Process participations (bank as participant)
    const projectParticipations = allParticipations.filter(p => p.ProjectId === projectId);
    for (const part of projectParticipations) {
      const bankId = part.BankId;
      if (!bankId) continue;
      
      if (!bankMap.has(bankId)) {
        const bank = allBanks.find(b => b.BankId === bankId);
        bankMap.set(bankId, {
          BankId: bankId,
          BankName: bank?.BankName || `Bank ID ${bankId}`,
          DealCount: 0,
          Exposure: 0,
          Positioning: "",
          EstimatedHoldLimit: bank?.HoldLimit || 0,
          EstimatedCapacity: 0,
          DebtYield: null,
          LastDollar: null,
          LTC: null,
          Deals: [],
          ProjectIds: new Set()
        });
      }
      
      const bank = bankMap.get(bankId);
      // Check if this bank is already in the deals list for this project (might be both lead and participant)
      const existingDeal = bank.Deals.find(d => d.ProjectId === projectId);
      if (existingDeal) {
        // Bank is already in deals (as lead), just update exposure from participation
        const participationAmount = num(part.ExposureAmount || part.Amount || 0);
        existingDeal.Exposure += participationAmount;
        bank.Exposure += participationAmount;
        // Update position to show both if applicable
        if (!existingDeal.IsLead) {
          existingDeal.Position = part.ParticipationType || "Participant";
        } else {
          existingDeal.Position = "Lead, " + (part.ParticipationType || "Participant");
        }
      } else if (!bank.ProjectIds.has(projectId)) {
        bank.ProjectIds.add(projectId);
        bank.DealCount++;
        
        // Check if this bank is already a lender (lead) for this project
        const isLead = lenderId === bankId;
        
        bank.Deals.push({
          ProjectId: projectId,
          ProjectName: row.ProjectName || row.Property || "",
          Exposure: num(part.ExposureAmount || 0),
          LoanAmount: num(row.LoanAmount || 0),
          Status: row.Status || row.Stage || "",
          IsLead: isLead,
          ParticipationPercent: part.ParticipationPercent,
          Position: isLead ? "Lead" : (part.ParticipationType || "Participant")
        });
        bank.Exposure += num(part.ExposureAmount || 0);
      } else {
        // Update existing deal's exposure if participation is higher
        const existingDeal = bank.Deals.find(d => d.ProjectId === projectId);
        if (existingDeal) {
          const partExposure = num(part.ExposureAmount || 0);
          if (partExposure > existingDeal.Exposure) {
            bank.Exposure = bank.Exposure - existingDeal.Exposure + partExposure;
            existingDeal.Exposure = partExposure;
          }
        }
      }
    }
  }
  
  // Calculate positioning and capacity for each bank
  const banks = Array.from(bankMap.values());
  for (const bank of banks) {
    // Determine positioning: if any deal is lead, bank is "Lead", otherwise check participation %
    const hasLeadDeal = bank.Deals.some(d => d.IsLead);
    if (hasLeadDeal) {
      bank.Positioning = "Lead";
    } else {
      // Check if this bank has the highest participation % for any of its deals
      let isLeadParticipant = false;
      for (const deal of bank.Deals) {
        const allPartsForProject = allParticipations.filter(p => p.ProjectId === deal.ProjectId);
        if (allPartsForProject.length > 0) {
          const maxParticipation = Math.max(...allPartsForProject.map(p => {
            const pct = parseFloat(String(p.ParticipationPercent || "0").replace('%', ''));
            return isNaN(pct) ? 0 : pct;
          }));
          const thisBankParticipation = parseFloat(String(deal.ParticipationPercent || "0").replace('%', ''));
          if (!isNaN(thisBankParticipation) && thisBankParticipation === maxParticipation && thisBankParticipation > 0) {
            isLeadParticipant = true;
            break;
          }
        }
      }
      bank.Positioning = isLeadParticipant ? "Lead Participant" : "Participant";
    }
    
    // Calculate capacity
    bank.EstimatedCapacity = bank.EstimatedHoldLimit > 0 ? bank.EstimatedHoldLimit - bank.Exposure : null;
    
    // Clean up temporary Set
    delete bank.ProjectIds;
  }
  
  return banks;
}

function renderBankView() {
  let banks = aggregateBanks(CURRENT_ROWS);
  
  // Apply search filter if query exists
  const searchQuery = ($("#q")?.value || "").toLowerCase().trim();
  if (searchQuery) {
    banks = banks.filter(bank => {
      const searchable = [
        bank.BankName || "",
        bank.Positioning || "",
        // Also search in deal names
        ...(bank.Deals || []).map(d => d.ProjectName || "").filter(Boolean)
      ].join(" ").toLowerCase();
      return searchable.includes(searchQuery);
    });
  }
  
  // Apply sorting if sortKey is set
  if (sortKey) {
    // Fields that should be sorted as text
    const textFields = new Set(["BankName", "Positioning"]);
    const numericFields = new Set(["DealCount", "Exposure", "EstimatedHoldLimit", "EstimatedCapacity", "DebtYield", "LastDollar", "LTC"]);
    
    banks = [...banks].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      
      const isDateField = sortKey.includes("Date") || sortKey.includes("Maturity");
      const isTextField = textFields.has(sortKey);
      const isNumericField = numericFields.has(sortKey);
      
      if (isDateField) {
        av = parseWhen(av);
        bv = parseWhen(bv);
        if (isNaN(av) && isNaN(bv)) return 0;
        if (isNaN(av)) return 1;
        if (isNaN(bv)) return -1;
      } else if (isTextField) {
        av = String(av || "").trim().toLowerCase();
        bv = String(bv || "").trim().toLowerCase();
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
      } else if (isNumericField || !isTextField) {
        av = num(av);
        bv = num(bv);
        if (isNaN(av) && isNaN(bv)) return 0;
        if (isNaN(av)) return 1;
        if (isNaN(bv)) return -1;
      } else {
        // Fallback: treat as text
        av = String(av || "").trim().toLowerCase();
        bv = String(bv || "").trim().toLowerCase();
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
      }
      
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }
  
  const tbody = $("#banksBody");
  if (!tbody) return;
  
  if (banks.length === 0) {
    tbody.innerHTML = "<tr><td class='empty' colspan='9'>No banks found</td></tr>";
    return;
  }
  
  // Calculate totals
  const totals = {
    DealCount: banks.reduce((sum, b) => sum + (b.DealCount || 0), 0),
    Exposure: banks.reduce((sum, b) => sum + num(b.Exposure || 0), 0),
    EstimatedHoldLimit: banks.reduce((sum, b) => sum + num(b.EstimatedHoldLimit || 0), 0),
    EstimatedCapacity: banks.reduce((sum, b) => sum + num(b.EstimatedCapacity || 0), 0),
  };
  
  const rowsHtml = banks.map(bank => {
    const key = `bank-${bank.BankId}`;
    const isExpanded = expandedBanks.has(bank.BankId);
    
    return `
      <tr class="data-row ${isExpanded ? "expanded" : ""}" data-bank-id="${bank.BankId}">
        <td class="sticky">${bank.BankName}</td>
      <td class="num">${fmtInt(bank.DealCount)}</td>
        <td class="num">${fmtCurrency(bank.Exposure)}</td>
        <td>${bank.Positioning || "—"}</td>
        <td class="num">${bank.EstimatedHoldLimit > 0 ? fmtCurrency(bank.EstimatedHoldLimit) : "—"}</td>
        <td class="num">${bank.EstimatedCapacity != null && bank.EstimatedCapacity > 0 ? fmtCurrency(bank.EstimatedCapacity) : "—"}</td>
        <td class="num">${bank.DebtYield != null ? fmtPctSmart(bank.DebtYield) : "—"}</td>
        <td class="num">${bank.LastDollar != null ? fmtCurrency(bank.LastDollar) : "—"}</td>
        <td class="num">${bank.LTC != null ? fmtPctSmart(bank.LTC) : "—"}</td>
      </tr>
      ${isExpanded ? `
        <tr class="detail-row"><td colspan="9">
          <div class="detail">
            <div class="detail-inner">
              <div class="detail-header">
                <h3>Deals for ${bank.BankName}</h3>
              </div>
              <div class="detail-content">
                <div class="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Position</th>
                        <th>Exposure</th>
                        <th>Loan Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${bank.Deals.map(deal => {
                        const dealKey = deal.ProjectName || deal.Property;
                        const isDealExpanded = expandedKeys.has(dealKey);
                        return `
                        <tr class="deal-row" data-deal-key="${deal.ProjectName || dealKey}">
                          <td>${deal.ProjectName || dealKey}</td>
                          <td>${deal.Position || (deal.IsLead ? "Lead" : "Participant")}</td>
                          <td class="num">${fmtCurrency(deal.Exposure || deal.LoanAmount || 0)}</td>
                          <td class="num">${fmtCurrency(deal.LoanAmount || 0)}</td>
                          <td>${deal.Status || "—"}</td>
                        </tr>
                        ${isDealExpanded ? `
                          <tr class="deal-detail-row"><td colspan="5">
                            <div class="deal-detail"></div>
                          </td></tr>
                        ` : ""}
                      `;
                      }).join("")}
                    </tbody>
                    <tfoot>
                      <tr class="total-row">
                        <td><strong>Total</strong></td>
          <td>—</td>
                        <td class="num"><strong>${fmtCurrency(bank.Deals.reduce((sum, d) => sum + num(d.Exposure || d.LoanAmount || 0), 0))}</strong></td>
                        <td class="num"><strong>${fmtCurrency(bank.Deals.reduce((sum, d) => sum + num(d.LoanAmount || 0), 0))}</strong></td>
          <td>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </td></tr>
      ` : ""}
    `;
  }).join("");
  
  // Add total row
  const totalRow = `
    <tr class="total-row">
      <td class="sticky"><strong>Total</strong></td>
      <td class="num"><strong>${fmtInt(totals.DealCount)}</strong></td>
      <td class="num"><strong>${fmtCurrency(totals.Exposure)}</strong></td>
          <td>—</td>
      <td class="num"><strong>${totals.EstimatedHoldLimit > 0 ? fmtCurrency(totals.EstimatedHoldLimit) : "—"}</strong></td>
      <td class="num"><strong>${totals.EstimatedCapacity > 0 ? fmtCurrency(totals.EstimatedCapacity) : "—"}</strong></td>
          <td>—</td>
          <td>—</td>
              <td>—</td>
    </tr>
  `;
  
  tbody.innerHTML = rowsHtml + totalRow;
  
  // Bind bank row toggle
  $$(".data-row[data-bank-id]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button, a, input")) return;
      const bankId = parseInt(row.dataset.bankId);
      if (expandedBanks.has(bankId)) {
        expandedBanks.delete(bankId);
                } else {
        expandedBanks.add(bankId);
      }
      renderBankView();
    });
  });
  
  // Bind deal row toggle
  $$(".deal-row").forEach(row => {
    row.addEventListener("click", (e) => {
        e.stopPropagation();
      const key = row.dataset.dealKey;
      if (!key) return;
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
            } else {
        expandedKeys.add(key);
      }
      renderBankView();
      if (expandedKeys.has(key)) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          const dealRow = document.querySelector(`tr.deal-row[data-deal-key="${key}"]`);
          if (dealRow) {
            const detailRow = dealRow.nextElementSibling;
            if (detailRow && detailRow.classList.contains("deal-detail-row")) {
              const detail = detailRow.querySelector(".deal-detail");
              if (detail) {
                const deal = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === key);
                if (deal) {
                  const state = editModeState.get(key) || { isEditing: false };
                  state.context = "bank";
                  editModeState.set(key, state);
                  // Build details in the nested detail element
                  buildDetailsForNested(deal, detail, "bank");
                  adjustDetailWidth(detailRow);
                }
              }
            }
            }
          });
        }
          });
  });
  
  $("#bankResultCount").textContent = `${banks.length} ${banks.length === 1 ? "bank" : "banks"}`;
  
  // Collapse All button
  $("#collapseAllBanksBtn")?.addEventListener("click", () => {
    expandedBanks.clear();
    expandedKeys.clear();
    renderBankView();
  });
}

/* ---------- Equity View ---------- */
async function aggregateEquity(rows) {
  const equityMap = new Map();
  const imsData = window.IMS_DATA || [];
  const equityPartners = window.EQUITY_PARTNERS_DATA || [];
  
  // Create a lookup map for investor IDs to names from IMS data
  const imsInvestorMap = new Map();
  for (const ims of imsData) {
    // IMS might have InvestorId/EquityPartnerId and InvestorName/EquityPartnerName
    const investorId = ims.InvestorId || ims.EquityPartnerId || ims.Investor || ims.EquityPartner;
    const investorName = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
    
    // If we have both ID and name, create a mapping
    if (investorId && investorName && investorId !== investorName) {
      imsInvestorMap.set(String(investorId), investorName);
    }
  }
  
  // Helper function to resolve investor name from ID (async for API calls)
  async function resolveInvestorName(partnerId, commit) {
    // First, try to get name from stored _partnerName
    if (commit._partnerName) {
      return commit._partnerName;
    }
    
    // Try to find in equity partners data
    const partner = equityPartners.find(p => 
      p.EquityPartnerId === partnerId || 
      String(p.EquityPartnerId) === String(partnerId)
    );
    if (partner?.PartnerName) {
      return partner.PartnerName;
    }
    
    // Try IMS investor map
    const imsName = imsInvestorMap.get(String(partnerId));
    if (imsName) {
      return imsName;
    }
    
    // Try to find in IMS data by matching ID
    for (const ims of imsData) {
      const imsId = ims.InvestorId || ims.EquityPartnerId;
      if (String(imsId) === String(partnerId)) {
        const name = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
        if (name && name !== String(partnerId)) {
          return name;
        }
      }
    }
    
    // If partnerId looks like an IMS ID (6+ digits), try API lookup
    if (partnerId && /^\d{6,}$/.test(String(partnerId))) {
      // Check cache first
      if (apiNameCache.has(String(partnerId))) {
        return apiNameCache.get(String(partnerId));
      }
      
      try {
        if (typeof getEquityPartnerByIMSId === 'function') {
          const result = await getEquityPartnerByIMSId(partnerId);
          if (result?.success && result?.data?.PartnerName) {
            const name = result.data.PartnerName;
            apiNameCache.set(String(partnerId), name);
            return name;
          }
        }
      } catch (error) {
        console.warn(`Failed to resolve investor name for IMS ID ${partnerId}:`, error);
        // Cache null to avoid repeated failed calls
        apiNameCache.set(String(partnerId), null);
      }
    }
    
    // Last resort: return null (we'll handle this below)
    return null;
  }
  
  for (const row of rows) {
    // Get equity commitments from API
    const commitments = row.EquityCommitments || [];
    
    // Also check IMS data for this property
    const propertyName = row.ProjectName || row.Property || "";
    const projIMS = imsData.filter(ims => {
      const imsProperty = String(ims.Property || ims.ProjectName || "").toLowerCase().trim();
      const rowProperty = String(propertyName).toLowerCase().trim();
      return imsProperty === rowProperty || imsProperty.includes(rowProperty) || rowProperty.includes(imsProperty);
    });
    
    // Combine API commitments with IMS data
    const allCommitments = [...commitments];
    
    // Add IMS equity data
    for (const ims of projIMS) {
      const investorId = ims.InvestorId || ims.EquityPartnerId;
      const investorName = ims.InvestorName || ims.EquityPartnerName || ims.Investor || ims.EquityPartner;
      const amount = num(ims.EquityAmount || ims.InvestorAmount || ims.Amount || 0);
      
      if ((investorId || investorName) && amount > 0) {
        // Use the ID if available, otherwise use name
        const partnerId = investorId || `ims-${investorName}`;
        const partnerName = investorName || (imsInvestorMap.get(String(investorId)) || null);
        
        // Check if we already have this commitment (synchronous check only)
        const existing = allCommitments.find(c => {
          const cPartnerId = c.EquityPartnerId || c._partnerId;
          const cPartnerName = c._partnerName;
          return (String(cPartnerId) === String(partnerId) || cPartnerName === partnerName) &&
                 Math.abs(num(c.Amount) - amount) < 1;
        });
        
        if (!existing) {
          allCommitments.push({
            EquityPartnerId: partnerId,
            _partnerId: investorId,
            _partnerName: partnerName || investorName,
            Amount: amount,
            EquityType: ims.EquityType || ims.Type || "Pref",
            FundingDate: ims.FundingDate || ims.Date || null,
            _fromIMS: true
          });
        }
      }
    }
    
    // Process all commitments (API + IMS)
    // First, resolve all investor names in parallel
    const nameResolutions = await Promise.all(
      allCommitments.map(async (commit) => {
        const partnerId = commit.EquityPartnerId || commit._partnerId;
        const partnerName = await resolveInvestorName(partnerId, commit);
        return { commit, partnerId, partnerName };
      })
    );
    
    // Now process with resolved names
    for (const { commit, partnerId, partnerName } of nameResolutions) {
      // Skip if we can't resolve a name and the ID looks like a code (numeric)
      if (!partnerName && partnerId && /^\d+$/.test(String(partnerId))) {
        console.warn(`Could not resolve investor name for ID: ${partnerId}`);
        continue; // Skip commitments with unresolved numeric IDs
      }
      
      // Use resolved name or fallback
      const displayName = partnerName || commit._partnerName || `Unknown Investor (${partnerId})`;
      
      // Use partner name as key for grouping (normalize for consistency)
      const key = displayName.toLowerCase().trim();
      
      if (!equityMap.has(key)) {
        equityMap.set(key, {
          EquityPartnerId: partnerId,
          InvestorName: displayName,
          DealCount: 0,
          Exposure: 0,
          LastDollar: 0,
          LTC: 0,
          Deals: []
        });
      }
      
      const investor = equityMap.get(key);
      const amount = num(commit.Amount || 0);
      const projectId = row.Row || row._banking?.Row;
      
      // Only count unique projects
      if (!investor.ProjectIds) {
        investor.ProjectIds = new Set();
      }
      
      if (!investor.ProjectIds.has(projectId)) {
        investor.ProjectIds.add(projectId);
        investor.DealCount++;
        investor.Deals.push({
          ProjectId: projectId,
          ProjectName: row.ProjectName || row.Property || "",
          Exposure: amount,
          Status: row.Status || row.Stage || "",
          CommitmentAmount: amount,
          EquityType: commit.EquityType || "",
          FundingDate: commit.FundingDate || null
        });
      }
      
      investor.Exposure += amount;
    }
  }
  
  // Clean up and format for display
  const investors = Array.from(equityMap.values());
  for (const investor of investors) {
    // Set calculated fields (require external data)
    investor.LastDollar = null; // Calculated: ProjectCost - TotalEquityInvested (requires external data)
    investor.LTC = null; // Calculated: TotalEquityInvested / ProjectCost (requires external data)
    
    // Create comma-separated deal names
    investor.DealNames = investor.Deals.map(d => d.ProjectName).join(", ");
    
    // Clean up temporary Set
    delete investor.ProjectIds;
  }
  
  return investors;
}

async function renderEquityView() {
  let investors = await aggregateEquity(CURRENT_ROWS);
  
  // Apply search filter if query exists
  const searchQuery = ($("#q")?.value || "").toLowerCase().trim();
  if (searchQuery) {
    const contacts = window.PEOPLE_DATA || [];
    const partners = window.EQUITY_PARTNERS_DATA || [];
    const commitments = window.EQUITY_COMMITMENTS_DATA || [];
    
    // Find matching contacts
    const matchingContacts = contacts.filter(contact => {
      const name = (contact.FullName || "").toLowerCase();
      const email = (contact.Email || "").toLowerCase();
      return name.includes(searchQuery) || email.includes(searchQuery);
    });
    
    // Find matching partners/LLCs
    const matchingPartners = partners.filter(partner => {
      const name = (partner.PartnerName || "").toLowerCase();
      return name.includes(searchQuery);
    });
    
    // Set to track all contact IDs that should be included
    const contactsToInclude = new Set();
    // Set to track all partner IDs that should be included
    const partnersToInclude = new Set();
    
    // If we found matching contacts, add them and find their related partners
    if (matchingContacts.length > 0) {
      matchingContacts.forEach(contact => {
        contactsToInclude.add(contact.PersonId);
        
        // Find all partners where this contact is the investor rep
        const partnersWithThisRep = partners.filter(p => 
          p.InvestorRepId === contact.PersonId || 
          String(p.InvestorRepId) === String(contact.PersonId)
        );
        partnersWithThisRep.forEach(p => partnersToInclude.add(p.EquityPartnerId));
        
        // Also find all commitments where a partner with this contact as rep is a related party
        // This will help us find the lead partners (like Stoa Holdings) when searching for Ryan
        for (const commit of commitments) {
          if (commit.RelatedParties && Array.isArray(commit.RelatedParties)) {
            for (const rp of commit.RelatedParties) {
              const rpPartnerId = rp.EquityPartnerId || rp;
              const rpPartner = partners.find(p => 
                (p.EquityPartnerId === rpPartnerId || String(p.EquityPartnerId) === String(rpPartnerId)) &&
                (p.InvestorRepId === contact.PersonId || String(p.InvestorRepId) === String(contact.PersonId))
              );
              
              if (rpPartner) {
                // This contact's partner is a related party, so add the lead partner
                const leadPartnerId = commit.EquityPartnerId;
                if (leadPartnerId) {
                  partnersToInclude.add(leadPartnerId);
                }
                // Also add the related party partner itself
                partnersToInclude.add(rpPartner.EquityPartnerId);
              }
            }
          }
        }
      });
    }
    
    // If we found matching partners, add them and find their related contacts
    if (matchingPartners.length > 0) {
      matchingPartners.forEach(partner => {
        partnersToInclude.add(partner.EquityPartnerId);
        
        // Find all commitments for this partner
        const partnerCommitments = commitments.filter(c => 
          c.EquityPartnerId === partner.EquityPartnerId ||
          String(c.EquityPartnerId) === String(partner.EquityPartnerId)
        );
        
        // For each commitment, find all related parties and their contacts
        for (const commit of partnerCommitments) {
          if (commit.RelatedParties && Array.isArray(commit.RelatedParties)) {
            for (const rp of commit.RelatedParties) {
              const rpPartnerId = rp.EquityPartnerId || rp;
              const rpPartner = partners.find(p => 
                p.EquityPartnerId === rpPartnerId || 
                String(p.EquityPartnerId) === String(rpPartnerId)
              );
              
              if (rpPartner) {
                // Add the related party partner
                partnersToInclude.add(rpPartner.EquityPartnerId);
                
                // If the related party has an investor rep, add that contact
                if (rpPartner.InvestorRepId) {
                  contactsToInclude.add(rpPartner.InvestorRepId);
                }
              }
            }
          }
        }
        
        // Also add the partner's investor rep if it exists
        if (partner.InvestorRepId) {
          contactsToInclude.add(partner.InvestorRepId);
        }
      });
    }
    
    // Now build the contact deals map for all contacts that should be included
    if (contactsToInclude.size > 0 || partnersToInclude.size > 0) {
      const contactDealsMap = new Map();
      
      // Process all contacts that should be included
      for (const contactId of contactsToInclude) {
        const contact = contacts.find(c => c.PersonId === contactId);
        if (!contact) continue;
        
        const contactName = contact.FullName || `Contact ${contactId}`;
        
        // Find all deals where this contact is involved
        const dealsSet = new Set();
        
        // 1. As investor rep for lead partner (direct investor role)
        const partnersWithThisRep = partners.filter(p => p.InvestorRepId === contactId);
        for (const partner of partnersWithThisRep) {
          const partnerCommitments = commitments.filter(c => c.EquityPartnerId === partner.EquityPartnerId);
          for (const commit of partnerCommitments) {
            const row = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === commit.ProjectId);
            if (row) {
              const dealKey = `${commit.ProjectId}-${row.ProjectName || row.Property || ""}`;
              if (!dealsSet.has(dealKey)) {
                dealsSet.add(dealKey);
                const dealInfo = {
                  ProjectId: commit.ProjectId,
                  ProjectName: row.ProjectName || row.Property || "",
                  Role: "Direct Investor",
                  PartnerName: partner.PartnerName || "",
                  LeadPartnerName: null, // Direct investors don't have a lead partner
                  CommitmentAmount: commit.Amount || 0,
                  EquityType: commit.EquityType || "",
                  FundingDate: commit.FundingDate || null,
                  Status: row.Status || row.Stage || ""
                };
                
                if (!contactDealsMap.has(contactId)) {
                  contactDealsMap.set(contactId, {
                    ContactId: contactId,
                    ContactName: contactName,
                    ContactEmail: contact.Email || "",
                    Roles: new Set(),
                    Deals: []
                  });
                }
                const contactInfo = contactDealsMap.get(contactId);
                contactInfo.Roles.add("Direct Investor");
                contactInfo.Deals.push(dealInfo);
              }
            }
          }
        }
        
        // 2. As related party - check all commitments where any related party has this contact as their investor rep
        for (const commit of commitments) {
          if (commit.RelatedParties && Array.isArray(commit.RelatedParties)) {
            for (const rp of commit.RelatedParties) {
              const rpPartnerId = rp.EquityPartnerId || rp;
              const rpPartner = partners.find(p => 
                p.EquityPartnerId === rpPartnerId || 
                String(p.EquityPartnerId) === String(rpPartnerId)
              );
              
              // Check if this related party has this contact as their investor rep
              if (rpPartner && (rpPartner.InvestorRepId === contactId || String(rpPartner.InvestorRepId) === String(contactId))) {
                const row = CURRENT_ROWS.find(r => (r.Row || r._banking?.Row) === commit.ProjectId);
                if (row) {
                  const dealKey = `${commit.ProjectId}-${row.ProjectName || row.Property || ""}`;
                  
                  // Ensure contactDealsMap entry exists
                  if (!contactDealsMap.has(contactId)) {
                    contactDealsMap.set(contactId, {
                      ContactId: contactId,
                      ContactName: contactName,
                      ContactEmail: contact.Email || "",
                      Roles: new Set(),
                      Deals: []
                    });
                  }
                  const contactInfo = contactDealsMap.get(contactId);
                  
                  // Check if we already added this deal (might be added as Direct Investor)
                  const existingDeal = contactInfo.Deals.find(d => 
                    d.ProjectId === commit.ProjectId && 
                    d.ProjectName === (row.ProjectName || row.Property || "")
                  );
                  
                  if (!existingDeal) {
                    // This is a new deal for this contact as Related Party
                    const leadPartner = partners.find(p => 
                      p.EquityPartnerId === commit.EquityPartnerId || 
                      String(p.EquityPartnerId) === String(commit.EquityPartnerId)
                    );
                    const dealInfo = {
                      ProjectId: commit.ProjectId,
                      ProjectName: row.ProjectName || row.Property || "",
                      Role: "Related Party",
                      PartnerName: rpPartner.PartnerName || "",
                      LeadPartnerName: leadPartner?.PartnerName || "",
                      CommitmentAmount: commit.Amount || 0,
                      EquityType: commit.EquityType || "",
                      FundingDate: commit.FundingDate || null,
                      Status: row.Status || row.Stage || ""
                    };
                    
                    contactInfo.Roles.add("Related Party");
                    contactInfo.Deals.push(dealInfo);
                    dealsSet.add(dealKey);
                  } else {
                    // Deal already exists, update role to show both if applicable
                    contactInfo.Roles.add("Related Party");
                    if (existingDeal.Role === "Direct Investor") {
                      existingDeal.Role = "Direct Investor, Related Party";
                    } else if (existingDeal.Role !== "Related Party" && !existingDeal.Role.includes("Related Party")) {
                      existingDeal.Role = existingDeal.Role + ", Related Party";
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Convert contact deals map to investor format
      const contactInvestors = Array.from(contactDealsMap.values()).map(contactInfo => {
        const uniqueDeals = [];
        const dealKeys = new Set();
        
        for (const deal of contactInfo.Deals) {
          const key = `${deal.ProjectId}-${deal.ProjectName}`;
          if (!dealKeys.has(key)) {
            dealKeys.add(key);
            uniqueDeals.push(deal);
          }
        }
        
        return {
          ContactId: contactInfo.ContactId,
          InvestorName: `${contactInfo.ContactName}${contactInfo.ContactEmail ? ` (${contactInfo.ContactEmail})` : ''}`,
          Roles: Array.from(contactInfo.Roles).join(", "),
          DealCount: uniqueDeals.length,
          Exposure: uniqueDeals.reduce((sum, d) => sum + num(d.CommitmentAmount || 0), 0),
          LastDollar: null,
          LTC: null,
          Deals: uniqueDeals.map(d => ({
            ProjectId: d.ProjectId,
            ProjectName: d.ProjectName,
            Exposure: d.CommitmentAmount,
            Status: d.Status,
            CommitmentAmount: d.CommitmentAmount,
            EquityType: d.EquityType,
            FundingDate: d.FundingDate,
            Role: d.Role,
            PartnerName: d.PartnerName,
            LeadPartnerName: d.LeadPartnerName
          })),
          IsContact: true // Flag to indicate this is a contact, not a partner
        };
      });
      
      // Also filter regular investors by the search query OR if they're in partnersToInclude
      const filteredInvestors = investors.filter(investor => {
        // Check if this investor's partner ID is in the set of partners to include
        if (investor.EquityPartnerId && partnersToInclude.has(investor.EquityPartnerId)) {
          return true;
        }
        
        // Otherwise, check if the name matches the search query
        const searchable = [
          investor.InvestorName || investor.PartnerName || "",
          ...(investor.Deals || []).map(d => d.ProjectName || "").filter(Boolean)
        ].join(" ").toLowerCase();
        return searchable.includes(searchQuery);
      });
      
      // Combine contact investors with filtered regular investors
      // Remove duplicates - if a regular investor is actually a contact that's already included, skip it
      const combinedInvestors = [...contactInvestors];
      const contactIdsInResults = new Set(contactInvestors.map(ci => ci.ContactId).filter(Boolean));
      
      for (const investor of filteredInvestors) {
        // Skip if this investor represents a contact that's already in the results
        let isDuplicate = false;
        
        // Check if this investor's partner has an investor rep that's already in contactInvestors
        if (investor.EquityPartnerId) {
          const partner = partners.find(p => p.EquityPartnerId === investor.EquityPartnerId);
          if (partner && partner.InvestorRepId && contactIdsInResults.has(partner.InvestorRepId)) {
            isDuplicate = true;
          }
        }
        
        // Also check by name to avoid exact duplicates
        if (!isDuplicate) {
          isDuplicate = contactInvestors.some(ci => 
            ci.InvestorName === investor.InvestorName ||
            (ci.ContactId && investor.EquityPartnerId && 
             contacts.find(c => c.PersonId === ci.ContactId)?.InvestorRepId === investor.EquityPartnerId)
          );
        }
        
        if (!isDuplicate) {
          combinedInvestors.push(investor);
        }
      }
      
      investors = combinedInvestors;
    } else {
      // No matching contacts or partners, just filter regular investors
      investors = investors.filter(investor => {
        const searchable = [
          investor.InvestorName || investor.PartnerName || "",
          ...(investor.Deals || []).map(d => d.ProjectName || "").filter(Boolean)
        ].join(" ").toLowerCase();
        return searchable.includes(searchQuery);
      });
    }
  }
  
  // Default to sorting by Exposure (amount invested) if no sort is set and we're on equity tab
  if (!sortKey && currentTab === "by-equity") {
    sortKey = "Exposure";
    sortDir = -1; // Descending (highest first)
  }
  
  // Apply sorting if sortKey is set
  if (sortKey) {
    // Fields that should be sorted as text
    const textFields = new Set(["InvestorName", "PartnerName"]);
    const numericFields = new Set(["DealCount", "Exposure", "LastDollar", "LTC"]);
    
    investors = [...investors].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      
      const isDateField = sortKey.includes("Date") || sortKey.includes("Maturity");
      const isTextField = textFields.has(sortKey);
      const isNumericField = numericFields.has(sortKey);
      
      if (isDateField) {
        av = parseWhen(av);
        bv = parseWhen(bv);
        if (isNaN(av) && isNaN(bv)) return 0;
        if (isNaN(av)) return 1;
        if (isNaN(bv)) return -1;
      } else if (isTextField) {
        av = String(av || "").trim().toLowerCase();
        bv = String(bv || "").trim().toLowerCase();
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
      } else if (isNumericField || !isTextField) {
        av = num(av);
        bv = num(bv);
        if (isNaN(av) && isNaN(bv)) return 0;
        if (isNaN(av)) return 1;
        if (isNaN(bv)) return -1;
      } else {
        // Fallback: treat as text
        av = String(av || "").trim().toLowerCase();
        bv = String(bv || "").trim().toLowerCase();
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
      }
      
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }
  
  const tbody = $("#equityBody");
  if (!tbody) return;
  
  if (investors.length === 0) {
    tbody.innerHTML = "<tr><td class='empty' colspan='5'>No investors found</td></tr>";
    return;
  }
  
  // Calculate totals
  const totals = {
    DealCount: investors.reduce((sum, i) => sum + (i.DealCount || 0), 0),
    Exposure: investors.reduce((sum, i) => sum + num(i.Exposure || 0), 0),
    InvestorCount: investors.length,
  };
  
  // Calculate unique deals (across all investors)
  const uniqueDealSet = new Set();
  investors.forEach(investor => {
    (investor.Deals || []).forEach(deal => {
      const dealKey = `${deal.ProjectId || deal.ProjectName || ''}-${deal.ProjectName || ''}`;
      if (dealKey) uniqueDealSet.add(dealKey);
    });
  });
  const uniqueDealCount = uniqueDealSet.size;
  
  // Calculate average exposure per investor
  const avgExposure = investors.length > 0 ? totals.Exposure / investors.length : 0;
  
  // Update KPI cards for equity view
  const equityKpiGrid = $("#equityKpiGrid");
  if (equityKpiGrid) {
    const kpis = [
      { label: "Total Exposure", value: fmtCurrency(totals.Exposure) },
      { label: "Investors/Contacts", value: fmtInt(totals.InvestorCount) },
      { label: "Total Deals", value: fmtInt(uniqueDealCount) },
      { label: "Avg Exposure", value: fmtCurrency(avgExposure) },
    ];
    
    equityKpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
      </div>
    `).join("");
  }
  
  const rowsHtml = investors.map(investor => {
    // Use InvestorName as key for expansion (more reliable than ID)
    const key = investor.InvestorName;
    const isExpanded = expandedEquity.has(key);
    const isContact = investor.IsContact || false;
    const roles = investor.Roles || "";
    
    return `
      <tr class="data-row ${isExpanded ? "expanded" : ""}" data-equity-name="${key}">
        <td class="sticky">
          ${investor.InvestorName}
          ${isContact && roles ? `<span style="font-size: 11px; color: var(--muted); margin-left: 8px;">(${roles})</span>` : ''}
              </td>
        <td class="num">${fmtInt(investor.DealCount)}</td>
        <td class="num">${fmtCurrency(investor.Exposure)}</td>
        <td class="num">${investor.LastDollar != null ? fmtCurrency(investor.LastDollar) : "—"}</td>
        <td class="num">${investor.LTC != null ? fmtPctSmart(investor.LTC) : "—"}</td>
      </tr>
      ${isExpanded ? `
        <tr class="detail-row"><td colspan="5">
          <div class="detail">
            <div class="detail-inner">
              <div class="detail-header">
                <h3>Deals for ${investor.InvestorName}${isContact && roles ? ` (${roles})` : ''}</h3>
              </div>
              <div class="detail-content">
                <div class="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Property</th>
                        ${isContact ? '<th>Role</th><th>Partner/LLC</th><th>Lead Partner/LLC</th>' : ''}
                        <th>Commitment Amount</th>
                        <th>Equity Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${investor.Deals.map(deal => `
                        <tr class="deal-row" data-deal-key="${deal.ProjectName || deal.Property}">
                          <td>${deal.ProjectName || deal.Property}</td>
                          ${isContact ? `
                            <td>${deal.Role || "—"}</td>
                            <td>${deal.PartnerName || "—"}</td>
                            <td>${deal.LeadPartnerName || "—"}</td>
                          ` : ''}
                          <td class="num">${fmtCurrency(deal.CommitmentAmount || 0)}</td>
                          <td>${deal.EquityType || "—"}</td>
                          <td>${deal.Status || "—"}</td>
                        </tr>
                        ${expandedKeys.has(deal.ProjectName || deal.Property) ? `
                          <tr class="deal-detail-row"><td colspan="${isContact ? '7' : '5'}">
                            <div class="deal-detail"></div>
                          </td></tr>
                        ` : ""}
                      `).join("")}
                    </tbody>
                    <tfoot>
                      <tr class="total-row">
                        <td><strong>Total</strong></td>
                        ${isContact ? '<td>—</td><td>—</td><td>—</td>' : ''}
                        <td class="num"><strong>${fmtCurrency(investor.Deals.reduce((sum, d) => sum + num(d.CommitmentAmount || 0), 0))}</strong></td>
              <td>—</td>
          <td>—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </td></tr>
      ` : ""}
    `;
  }).join("");
  
  // Add total row
  const totalRow = `
    <tr class="total-row">
      <td class="sticky"><strong>Total</strong></td>
      <td class="num"><strong>${fmtInt(totals.DealCount)}</strong></td>
      <td class="num"><strong>${fmtCurrency(totals.Exposure)}</strong></td>
              <td>—</td>
          <td>—</td>
    </tr>
  `;
  
  tbody.innerHTML = rowsHtml + totalRow;
  
  // Bind equity row toggle
  $$(".data-row[data-equity-name]").forEach(row => {
    row.addEventListener("click", async (e) => {
      // Don't toggle if clicking on a sortable header
      if (e.target.closest(".th-sort")) return;
      if (e.target.closest("button, a, input")) return;
      const equityName = row.dataset.equityName;
      if (!equityName) return;
      if (expandedEquity.has(equityName)) {
        expandedEquity.delete(equityName);
        } else {
        expandedEquity.add(equityName);
      }
      await renderEquityView();
    });
  });
  
  // Bind deal row toggle
  $$(".deal-row").forEach(row => {
    row.addEventListener("click", async (e) => {
                e.stopPropagation();
      const key = row.dataset.dealKey;
      if (!key) return;
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
      } else {
        expandedKeys.add(key);
      }
      await renderEquityView();
      if (expandedKeys.has(key)) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          const dealRow = document.querySelector(`tr.deal-row[data-deal-key="${key}"]`);
          if (dealRow) {
            const detailRow = dealRow.nextElementSibling;
            if (detailRow && detailRow.classList.contains("deal-detail-row")) {
              const detail = detailRow.querySelector(".deal-detail");
              if (detail) {
                // Find the deal in CURRENT_ROWS - need to match by property name
                const deal = CURRENT_ROWS.find(r => (r.ProjectName || r.Property) === key);
                if (deal) {
                  const state = editModeState.get(key) || { isEditing: false };
                  state.context = "equity";
                  editModeState.set(key, state);
                  // Build details in the nested detail element
                  buildDetailsForNested(deal, detail, "equity");
                  adjustDetailWidth(detailRow);
                } else {
                  console.warn("Could not find deal data for:", key);
                }
              }
            }
                }
              });
            }
          });
  });
  
  $("#equityResultCount").textContent = `${investors.length} ${investors.length === 1 ? "investor" : "investors"}`;
}

/* ---------- Contacts & Partners View ---------- */
async function renderContactsPartnersView() {
  const partners = window.EQUITY_PARTNERS_DATA || [];
  const commitments = window.EQUITY_COMMITMENTS_DATA || [];
  const contacts = window.PEOPLE_DATA || [];
  
  // Apply search filter if query exists
  const searchQuery = ($("#q")?.value || "").toLowerCase().trim();
  let filteredPartners = partners;
  
  if (searchQuery) {
    filteredPartners = partners.filter(partner => {
      const partnerName = (partner.PartnerName || "").toLowerCase();
      const partnerType = (partner.PartnerType || "").toLowerCase();
      
      // Also search in investor rep name
      let repName = "";
      if (partner.InvestorRepId) {
        const rep = contacts.find(c => c.PersonId === partner.InvestorRepId);
        if (rep) {
          repName = (rep.FullName || "").toLowerCase();
        }
      }
      
      return partnerName.includes(searchQuery) || 
             partnerType.includes(searchQuery) || 
             repName.includes(searchQuery);
    });
  }
  
  // Sort partners
  if (sortKey === "PartnerName") {
    filteredPartners.sort((a, b) => {
      const aVal = (a.PartnerName || "").toLowerCase();
      const bVal = (b.PartnerName || "").toLowerCase();
      return sortDir * aVal.localeCompare(bVal);
    });
  } else if (sortKey === "PartnerType") {
    filteredPartners.sort((a, b) => {
      const aVal = (a.PartnerType || "").toLowerCase();
      const bVal = (b.PartnerType || "").toLowerCase();
      return sortDir * aVal.localeCompare(bVal);
    });
  } else if (sortKey === "CommitmentCount") {
    filteredPartners.sort((a, b) => {
      const aCount = commitments.filter(c => c.EquityPartnerId === a.EquityPartnerId).length;
      const bCount = commitments.filter(c => c.EquityPartnerId === b.EquityPartnerId).length;
      return sortDir * (aCount - bCount);
    });
  }
  
  const tbody = $("#contactsPartnersBody");
  const countBadge = $("#contactsPartnersResultCount");
  
  if (!tbody) return;
  
  if (filteredPartners.length === 0) {
    tbody.innerHTML = `<tr><td class="empty" colspan="6">No partners found${searchQuery ? ` matching "${searchQuery}"` : ""}</td></tr>`;
    if (countBadge) countBadge.textContent = "0 partners";
    return;
  }
  
  if (countBadge) {
    countBadge.textContent = `${filteredPartners.length} partner${filteredPartners.length !== 1 ? 's' : ''}`;
  }
  
  // Helper function to get investor rep details
  function getRepDetails(partnerId) {
    const partner = partners.find(p => p.EquityPartnerId === partnerId);
    if (!partner || !partner.InvestorRepId) return null;
    const rep = contacts.find(c => c.PersonId === partner.InvestorRepId);
    if (!rep) return null;
    return {
      name: rep.FullName || "",
      email: rep.Email || "",
      phone: rep.Phone || ""
    };
  }
  
  // Helper function to get all unique related parties for a partner
  function getRelatedPartiesForPartner(partnerId) {
    const partnerCommitments = commitments.filter(c => c.EquityPartnerId === partnerId);
    const relatedPartyIds = new Set();
    const relatedPartiesMap = new Map();
    
    for (const commit of partnerCommitments) {
      if (commit.RelatedParties && Array.isArray(commit.RelatedParties)) {
        for (const rp of commit.RelatedParties) {
          const rpId = rp.EquityPartnerId || rp;
          if (rpId && !relatedPartyIds.has(rpId)) {
            relatedPartyIds.add(rpId);
            const rpPartner = partners.find(p => p.EquityPartnerId === rpId);
            if (rpPartner) {
              relatedPartiesMap.set(rpId, rpPartner.PartnerName || `Partner ${rpId}`);
            }
          }
        }
      }
    }
    
    return Array.from(relatedPartiesMap.entries()).map(([id, name]) => ({ id: parseInt(id), name }));
  }
  
  const rowsHtml = filteredPartners.map(partner => {
    const partnerId = partner.EquityPartnerId;
    const partnerName = partner.PartnerName || `Partner ${partnerId}`;
    const partnerType = partner.PartnerType || "—";
    const commitmentCount = commitments.filter(c => c.EquityPartnerId === partnerId).length;
    
    // Get investor rep details
    const repDetails = getRepDetails(partnerId);
    const repDisplay = repDetails 
      ? `${repDetails.name}${repDetails.email ? ` (${repDetails.email})` : ''}`
      : "—";
    
    // Get related parties
    const relatedParties = getRelatedPartiesForPartner(partnerId);
    const relatedPartiesDisplay = relatedParties.length > 0
      ? relatedParties.map(rp => rp.name).join(", ")
      : "—";
    
    return `
      <tr data-partner-id="${partnerId}">
        <td class="text-left">${partnerName}</td>
        <td class="text-center">${partnerType}</td>
        <td class="text-left">
          ${repDetails ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${repDisplay}</span>
              ${globalEditMode ? `<button class="btn btn-xs" onclick="showEditEquityPartnerModal(${partnerId})" style="padding: 2px 6px; font-size: 10px;">Edit Rep</button>` : ''}
            </div>
          ` : (
            globalEditMode ? `<button class="btn btn-xs" onclick="showEditEquityPartnerModal(${partnerId})" style="padding: 2px 6px; font-size: 10px;">Add Rep</button>` : "—"
          )}
          </td>
        <td class="text-left">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${relatedPartiesDisplay}</span>
            ${globalEditMode ? `
              <button class="btn btn-xs" onclick="showManageRelatedPartiesModal(${partnerId})" style="padding: 2px 6px; font-size: 10px;">${relatedParties.length > 0 ? 'Manage' : 'Add'}</button>
            ` : ""}
          </div>
        </td>
        <td class="text-center num">${commitmentCount}</td>
        <td class="text-center">
          ${globalEditMode ? `
            <button class="btn btn-sm" onclick="showEditEquityPartnerModal(${partnerId})" style="margin-right: 4px;">Edit</button>
            <button class="btn btn-sm" onclick="showManageRelatedPartiesModal(${partnerId})">Manage Related Parties</button>
          ` : "—"}
        </td>
      </tr>
    `;
  }).join("");
  
  tbody.innerHTML = rowsHtml;
}

/* ---------- Multi-Select Filter ---------- */
function initMulti(rootEl, options, defaultsChecked, onChange) {
  if (!rootEl) return;
  
  const btn = rootEl.querySelector(".multi-btn");
  const menu = rootEl.querySelector(".multi-menu");
  const list = rootEl.querySelector(".multi-list");
  const label = rootEl.querySelector(".multi-label");
  
  if (!btn || !menu || !list || !label) return;
  
  let selected = new Set(defaultsChecked || []);
  let isOpen = false;
  
  function render() {
    list.innerHTML = options.map(opt => {
      const checked = selected.has(opt);
      return `
        <label class="multi-item">
          <input type="checkbox" ${checked ? "checked" : ""} data-value="${opt}" />
          <span>${opt}</span>
        </label>
      `;
    }).join("");
  }
  
  function summarize() {
    if (selected.size === 0) {
      label.textContent = "No statuses selected";
    } else if (selected.size === options.length) {
      label.textContent = "All Statuses";
    } else if (selected.size === options.length - 2 && !selected.has("Other") && !selected.has("Liquidated")) {
      label.textContent = "All (except Other, Liquidated)";
    } else {
      label.textContent = `${selected.size} ${selected.size === 1 ? "status" : "statuses"}`;
    }
  }
  
  function toggleOpen(open) {
    isOpen = open !== undefined ? open : !isOpen;
    btn.setAttribute("aria-expanded", isOpen);
    menu.setAttribute("aria-hidden", !isOpen);
    menu.style.display = isOpen ? "block" : "none";
  }
  
  btn.addEventListener("click", (e) => {
            e.stopPropagation();
    toggleOpen();
  });
  
  list.addEventListener("change", (e) => {
    if (e.target.type === "checkbox") {
      const value = e.target.dataset.value;
      if (e.target.checked) {
        selected.add(value);
                } else {
        selected.delete(value);
      }
      summarize();
      onChange(selected);
    }
  });
  
  rootEl.querySelector("[data-act='all']")?.addEventListener("click", () => {
    selected = new Set(options);
    render();
    summarize();
    onChange(selected);
  });
  
  rootEl.querySelector("[data-act='none']")?.addEventListener("click", () => {
    selected.clear();
    render();
    summarize();
    onChange(selected);
  });
  
  document.addEventListener("click", (e) => {
    if (!rootEl.contains(e.target)) toggleOpen(false);
  });
  
  render();
  summarize();
}

/* ---------- Main Rendering ---------- */
async function renderAll() {
  // Don't mutate CURRENT_ROWS - it should remain the full joined dataset
  // The render functions will filter it themselves as needed
  if (currentTab === "by-property") {
    renderPropertyView();
  } else if (currentTab === "by-bank") {
    renderBankView();
  } else if (currentTab === "by-equity") {
    await renderEquityView();
  } else if (currentTab === "contacts-partners") {
    await renderContactsPartnersView();
  }
}

function switchView(viewName) {
  currentView = viewName;
  expandedKeys.clear(); // Collapse all when switching views
  
  // Clear all stored tabs when switching views so properties default to the correct tab
  // This ensures when properties are expanded, they show the relevant tab for the current view
  const keys = Object.keys(sessionStorage);
  keys.forEach(key => {
    if (key.startsWith('tab-')) {
      sessionStorage.removeItem(key);
    }
  });
  
  // Set default sort based on view
  if (viewName === "construction") {
    sortKey = "ConstructionLoanClosing";
    sortDir = -1; // Descending (most recent dates first)
  } else if (viewName === "equity") {
    sortKey = "FundingDate";
    sortDir = -1; // Descending (most recent dates first)
            } else {
    // Clear sort for other views
    sortKey = null;
    sortDir = 1;
  }
  
  $$(".th-sort .sort").forEach(icon => {
    icon.textContent = "";
  });
  
  renderAll();
  
  // Update sort indicator after rendering
  if (sortKey) {
    requestAnimationFrame(() => {
      const th = document.querySelector(`.th-sort[data-key="${sortKey}"]`);
      if (th) {
        const icon = th.querySelector(".sort");
        if (icon) {
          icon.textContent = sortDir > 0 ? "↑" : "↓";
        }
      }
    });
  }
}

async function switchTab(tabName) {
  currentTab = tabName;
  
  // Update search placeholder based on current tab
  const searchInput = $("#q");
  if (searchInput) {
    if (tabName === "by-property") {
      searchInput.placeholder = "Search properties, cities, states, lenders...";
    } else if (tabName === "by-bank") {
      searchInput.placeholder = "Search banks, positioning, or deal names...";
    } else if (tabName === "by-equity") {
      searchInput.placeholder = "Search investors or deal names...";
    } else if (tabName === "contacts-partners") {
      searchInput.placeholder = "Search partners, LLCs, contacts...";
    } else {
      searchInput.placeholder = "Search…";
    }
  }
  expandedKeys.clear();
  expandedBanks.clear();
  expandedEquity.clear();
  
  // Handle Deal Pipeline tab
  if (tabName === "deal-pipeline") {
    renderDealPipeline();
    return;
  }
  
  // Show/hide view switcher based on current tab
  const viewSwitcher = document.querySelector('.view-switcher');
  if (viewSwitcher) {
    if (tabName === "by-property") {
      viewSwitcher.style.display = '';
    } else {
      viewSwitcher.style.display = 'none';
    }
  }
  
  // Set default sort for equity tab (by Exposure descending), clear for others
  if (tabName === "by-equity") {
    sortKey = "Exposure";
    sortDir = -1; // Descending (highest first)
  } else {
    sortKey = null;
    sortDir = 1;
  }
  $$(".th-sort .sort").forEach(icon => {
    icon.textContent = "";
  });
  await renderAll();
  // Update sort indicator after rendering
  if (sortKey) {
    requestAnimationFrame(() => {
      const th = document.querySelector(`.th-sort[data-key="${sortKey}"]`);
      if (th) {
        const icon = th.querySelector(".sort");
        if (icon) {
          icon.textContent = sortDir > 0 ? "↑" : "↓";
        }
      }
    });
  }
}

/* ---------- Loading Overlay Functions ---------- */
function showLoadingOverlay() {
  const overlay = $("#loadingOverlay");
  if (overlay) {
    overlay.style.display = "flex";
    updateLoadingProgress(0, "Initializing...");
  }
}

function hideLoadingOverlay() {
  const overlay = $("#loadingOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

function updateLoadingProgress(percent, status) {
  const fill = $("#loadingProgressFill");
  const text = $("#loadingProgressText");
  const statusEl = $("#loadingStatus");
  
  if (fill) {
    fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
  if (text) {
    text.textContent = `${Math.round(percent)}%`;
  }
  if (statusEl && status) {
    statusEl.textContent = status;
  }
}

/* ---------- Data Loading ---------- */
async function loadAll() {
  try {
    showLoadingOverlay();
    
    // Load from API (Azure data)
    updateLoadingProgress(5, "Loading projects and loans...");
    const [
      projectsRes,
      loansRes,
      dscrTestsRes,
      covenantsRes,
      liquidityReqsRes,
      bankTargetsRes,
      participationsRes,
      banksRes,
      personsRes,
      guaranteesRes,
      equityCommitmentsRes,
      equityPartnersRes
    ] = await Promise.all([
      getAllProjects(),
      getAllLoans(),
      getAllDSCRTests(),
      getAllCovenants(),
      getAllLiquidityRequirements(),
      getAllBankTargets(),
      getAllParticipations(),
      getAllBanks(),
      getAllPersons(),
      getAllGuarantees(),
      getAllEquityCommitments(),
      getAllEquityPartners()
    ]);
    
    // Extract data from responses (handle both { data: [...] } and [...] formats)
    const projectsRaw = projectsRes?.data || projectsRes || [];
    const loansRaw = loansRes?.data || loansRes || [];
    const dscrTestsRaw = dscrTestsRes?.data || dscrTestsRes || [];
    const covenantsRaw = covenantsRes?.data || covenantsRes || [];
    const liquidityReqsRaw = liquidityReqsRes?.data || liquidityReqsRes || [];
    const bankTargetsRaw = bankTargetsRes?.data || bankTargetsRes || [];
    const participationsRaw = participationsRes?.data || participationsRes || [];
    const banksRaw = banksRes?.data || banksRes || [];
    const personsRaw = personsRes?.data || personsRes || [];
    const guaranteesRaw = guaranteesRes?.data || guaranteesRes || [];
    const equityCommitmentsRaw = equityCommitmentsRes?.data || equityCommitmentsRes || [];
    const equityPartnersRaw = equityPartnersRes?.data || equityPartnersRes || [];
    
    // console.log(`Loaded ${projectsRaw.length} projects, ${loansRaw.length} loans, ${dscrTestsRaw.length} DSCR tests, ${covenantsRaw.length} covenants, ${liquidityReqsRaw.length} liquidity requirements`);
    
    // Store globally
    window.PROJECTS_DATA = projectsRaw;
    window.LOANS_DATA = loansRaw;
    window.PEOPLE_DATA = personsRaw;
    window.GUARANTES_DATA = guaranteesRaw;
    window.PARTICIPATIONS_DATA = participationsRaw;
    window.COVENANTS_DATA = covenantsRaw;
    window.EQUITY_COMMITMENTS_DATA = equityCommitmentsRaw;
    window.EQUITY_PARTNERS_DATA = equityPartnersRaw;
    window.BANKS_DATA = banksRaw;
    
    updateLoadingProgress(40, "Loading external data sources...");
    
    // Load from Domo manifest (Procore, MMR, and IMS) BEFORE transformation
    // console.log('Loading data from Domo manifest...');
    
    // Wait for domo.js to load if it's not available yet (it's loaded from CDN)
    if (!DOMO) {
      // console.log('DOMO object not available at init, waiting for domo.js to load...');
      DOMO = await waitForDomo(5000);
    }
    
    // console.log('DOMO object available:', !!DOMO);
    // if (DOMO) {
    //   console.log('DOMO.get available:', typeof DOMO.get === 'function');
    // }
    
    const [mmrRaw, procoreRaw, imsRaw] = await Promise.all([
      getAlias("MMRData"),
      getAlias("ProcoreProjects"),
      getAlias("IMSData")
    ]);
    
    MMR = mmrRaw || [];
    window.IMS_DATA = imsRaw || [];
    window.PROCORE_DATA = procoreRaw || [];
    
    updateLoadingProgress(60, "Syncing Procore data...");
    
    // console.log(`Loaded ${window.IMS_DATA.length} IMS records for equity/investor data`);
    // console.log(`Loaded ${window.PROCORE_DATA.length} Procore project records`);
    // console.log(`Loaded ${MMR.length} MMR records`);
    
    // if (window.PROCORE_DATA.length === 0) {
    //   console.warn('⚠️ No Procore data loaded. Possible reasons:');
    //   console.warn('  1. Running locally (outside Domo) - DOMO object not available');
    //   console.warn('  2. Dataset "ProcoreProjects" is empty in Domo');
    //   console.warn('  3. Dataset alias "ProcoreProjects" not found in manifest');
    //   console.warn('  4. Error querying the dataset');
    //   if (!DOMO) {
    //     console.warn('  → DOMO object is not available (running outside Domo environment)');
    //   }
    // }
    
    // Debug: Log sample Procore data
    // if (window.PROCORE_DATA.length > 0) {
    //   console.log('Sample Procore projects:', window.PROCORE_DATA.slice(0, 3).map(p => ({
    //     name: p.name,
    //     actualstartdate: p.actualstartdate,
    //     city: p.city,
    //     state: p.state
    //   })));
    // }
    
    // Debug: Log sample DB project names
    // if (window.PROJECTS_DATA && window.PROJECTS_DATA.length > 0) {
    //   console.log('Sample DB project names:', window.PROJECTS_DATA.slice(0, 5).map(p => p.ProjectName));
    // }
    
    // Sync EstimatedConstructionStartDate from Procore to DB
    // Only sync automatically if user is logged in (requires auth token for write operations)
    const authToken = getAuthToken();
    if (authToken) {
      // console.log('User authenticated - syncing Procore data to database...');
      await syncEstimatedConstructionStartDateFromProcore();
    } else {
      // console.log('Procore data loaded but user not authenticated - skipping automatic sync. Login to enable automatic syncing.');
    }
    
    updateLoadingProgress(70, "Transforming and joining data...");
    
    // Transform to banking format (IMS data is now available for merging)
  BANKING = transformRelationalToBanking(
      projectsRaw,
      loansRaw,
      participationsRaw,
      guaranteesRaw,
      covenantsRaw,
      dscrTestsRaw,
      liquidityReqsRaw,
      bankTargetsRaw,
      equityCommitmentsRaw,
      equityPartnersRaw,
      personsRaw,
      banksRaw
    );
    
  // console.log(`Transformed to ${BANKING.length} banking records`);
  
    // Don't filter BANKING - we'll filter after joining based on core Stage attribute
    // console.log(`Transformed to ${BANKING.length} banking records`);
  
    updateLoadingProgress(85, "Processing and filtering data...");
    
    // Join MMR with Banking
    let joined = buildJoin(MMR, BANKING);
    // console.log(`Joined data: ${MMR.length} MMR rows + ${BANKING.length} Banking rows → ${joined.length} joined rows`);
    
    // Deduplicate joined results based on unique Row ID
    const uniqueRows = new Map();
    const duplicatesRemoved = [];
    for (const row of joined) {
      const rowId = row.Row || `${row.ProjectName || row.Property}_${row.ConstructionFinancingLender}_${row.ConstructionLoanAmount}`;
      if (uniqueRows.has(rowId)) {
        duplicatesRemoved.push(rowId);
        continue;
      }
      uniqueRows.set(rowId, row);
    }
    if (duplicatesRemoved.length > 0) {
      // console.warn(`Removed ${duplicatesRemoved.length} duplicate rows from joined data (same Row ID):`, duplicatesRemoved.slice(0, 10));
    }
    joined = Array.from(uniqueRows.values());
    // console.log(`After deduplication: ${joined.length} unique joined rows`);
    
    // Filter out "Prospective" and "Dead" deals from joined results using CORE Stage attribute
    // Core Stage comes from _banking.Stage (from projects table), not MMR Status
    // "Dead" deals should only appear in Deal Pipeline, not in banking dashboard
    const beforeJoinFilter = joined.length;
    joined = joined.filter(r => {
      // Get core Stage from banking/project data (core attribute), not MMR Status
      const coreStage = r.Stage || r._banking?.Stage || "";
      const stage = String(coreStage).trim().toLowerCase();
      const isProspective = stage === "prospective";
      const isDead = stage === "dead";
      // if (isProspective) {
      //   console.log(`Filtering out Prospective from joined: ${r.ProjectName || r.Property || "Unknown"} (Core Stage: "${coreStage}")`);
      // }
      if (isDead) {
        // console.log(`Filtering out Dead from joined: ${r.ProjectName || r.Property || "Unknown"} (Core Stage: "${coreStage}")`);
      }
      return !isProspective && !isDead;
    });
    const joinFilteredCount = beforeJoinFilter - joined.length;
    // console.log(`Filtered out ${joinFilteredCount} Prospective/Dead deals from joined results: ${joined.length} rows remaining`);
    
    // Debug: Check if Bartlett is in the results
    // const bartlett = joined.find(r => {
    //   const name = (r.ProjectName || r.Property || "").toLowerCase();
    //   return name.includes("bartlett");
    // });
    // if (bartlett) {
    //   console.log(`✓ Found Bartlett in joined results:`, {
    //     name: bartlett.ProjectName || bartlett.Property,
    //     coreStage: bartlett.Stage || bartlett._banking?.Stage || "(empty)",
    //     hasBanking: !!bartlett._banking,
    //     hasMMR: !!bartlett._mmr
    //   });
    // } else {
    //   console.log(`✗ Bartlett NOT found in joined results`);
    // }
    
    // Update filter options - exclude "Prospective" and "Dead" from options
    // Use core Stage from joined data (from projects table)
    // "Dead" deals should only appear in Deal Pipeline, not in banking dashboard
    statusOptions = Array.from(new Set(joined.map(r => r.Stage || r._banking?.Stage).filter(Boolean)))
      .filter(s => {
        const lower = s.toLowerCase();
        return lower !== "prospective" && lower !== "dead";
      })
      .sort();
    // Select statuses by default EXCEPT "Other", "Liquidated", and "Under Contract" (they should be unchecked)
    // Default to: Lease-Up, Stabilized, Under Construction
    selectedStatuses = new Set(statusOptions.filter(s => {
      const lower = s.toLowerCase();
      return lower !== "other" && lower !== "liquidated" && lower !== "under contract";
    }));
    
    // Initialize filter UI
    initMulti($("#statusMulti"), statusOptions, selectedStatuses, (set) => {
      selectedStatuses = set;
  renderAll();
    });
    
    // Set default sort to BirthOrder (ascending)
    sortKey = "BirthOrder";
    sortDir = 1;
    
    updateLoadingProgress(95, "Finalizing dashboard...");
    
    CURRENT_ROWS = joined;
    renderAll();
    
    updateLoadingProgress(100, "Complete!");
    
    // Hide loading overlay after a brief delay to show 100%
    setTimeout(() => {
      hideLoadingOverlay();
    }, 300);
  } catch (error) {
    console.error("Error loading data:", error);
    updateLoadingProgress(0, `Error: ${error.message}`);
    setTimeout(() => {
      hideLoadingOverlay();
    }, 2000);
    const tbody = $("#listBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td class="empty" colspan="10">Error loading data: ${error.message}</td></tr>`;
    }
  }
}

/* ---------- Success Message System ---------- */
function showSuccessMessage(message, duration = 3000) {
  const toast = $("#successToast");
  const toastMessage = $("#successToastMessage");
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.style.display = "flex";
  
  // Auto-hide after duration
  setTimeout(() => {
    toast.style.display = "none";
  }, duration);
}

/* ---------- Authentication & Global Edit Mode ---------- */
async function initializeAuth() {
  // Try to restore token from localStorage (check both getAuthToken and localStorage directly)
  let savedToken = getAuthToken();
  
  // If getAuthToken doesn't return a token, check localStorage directly
  if (!savedToken && typeof window !== 'undefined' && window.localStorage) {
    savedToken = window.localStorage.getItem('authToken');
    if (savedToken) {
      // Restore token to memory
      setAuthToken(savedToken);
    }
  }
  
  if (savedToken) {
    try {
      const verifyResult = await verifyAuth();
      if (verifyResult.success) {
        setAuthToken(savedToken); // Ensure token is set in memory
        // Also ensure it's in localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('authToken', savedToken);
        }
        currentUser = verifyResult.data.user;
        globalEditMode = true;
        updateEditModeUI();
        console.log('Auth restored from localStorage');
        return true;
      }
    } catch (error) {
      console.log('Token expired or invalid, clearing...', error);
      clearAuthToken();
      // Also clear from localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('authToken');
      }
      globalEditMode = false;
      currentUser = null;
      updateEditModeUI();
    }
  } else {
    console.log('No saved token found');
  }
  return false;
}

// Check if current user is admin
function isAdmin() {
  if (!currentUser) {
    console.log('isAdmin: No currentUser');
    return false;
  }
  
  // Log user object for debugging
  console.log('isAdmin: Checking user:', currentUser);
  
  // For now, allow any logged-in user to access Deal Pipeline
  // TODO: Make this more strict once we know the user object structure
  // Check for admin role - adjust based on your API response structure
  const isAdminUser = currentUser.role === 'admin' || 
         currentUser.isAdmin === true || 
         currentUser.userType === 'admin' ||
         (currentUser.email && currentUser.email.toLowerCase().includes('admin')) ||
         true; // TEMPORARY: Allow all logged-in users for testing
  
  console.log('isAdmin: Result:', isAdminUser);
  return isAdminUser;
}

function updateEditModeUI() {
  const editBtn = $("#editModeBtn");
  const editBtnText = $("#editModeBtnText");
  
  if (editBtn && editBtnText) {
    if (globalEditMode && currentUser) {
      editBtn.classList.add('active');
      editBtnText.textContent = `Edit Mode (${currentUser.username || currentUser.email || 'Logged In'})`;
      editBtn.title = `Logged in as ${currentUser.username || currentUser.email}`;
            } else {
      editBtn.classList.remove('active');
      editBtnText.textContent = 'Edit Mode';
      editBtn.title = 'Click to enable edit mode (login required)';
    }
  }
  
  // Show/hide admin-only elements (Deal Pipeline button and view)
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  const isUserAdmin = isAdmin();
  
  console.log('updateEditModeUI: Found', adminOnlyElements.length, 'admin-only elements');
  console.log('updateEditModeUI: isUserAdmin =', isUserAdmin, 'globalEditMode =', globalEditMode);
  
  adminOnlyElements.forEach(el => {
    if (isUserAdmin && globalEditMode) {
      console.log('updateEditModeUI: Showing admin element:', el);
      // For buttons in the header, use inline-block
      if (el.tagName === 'BUTTON' && el.closest('.controls')) {
        el.style.display = 'inline-block';
      } else if (el.tagName === 'BUTTON') {
        el.style.display = 'inline-block';
      } else {
        el.style.display = '';
      }
    } else {
      console.log('updateEditModeUI: Hiding admin element:', el);
      el.style.display = 'none';
    }
  });
  
  // Re-render all to show/hide edit buttons
  renderAll();
}

function showLoginModal() {
  const modal = $("#loginModal");
  const form = $("#loginForm");
  const errorDiv = $("#loginError");
  
  if (modal && form) {
    form.reset();
    if (errorDiv) errorDiv.style.display = 'none';
    modal.style.display = 'flex';
    $("#loginUsername")?.focus();
  }
}

function hideLoginModal() {
  const modal = $("#loginModal");
  if (modal) {
    modal.style.display = 'none';
  }
}

async function handleLogin(username, password) {
  try {
    const result = await login(username, password);
    if (result.success && result.data.token) {
      const token = result.data.token;
      setAuthToken(token);
      // Also save to localStorage for persistence across page refreshes
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('authToken', token);
        console.log('Token saved to localStorage');
      }
      currentUser = result.data.user;
      console.log('handleLogin: User logged in:', currentUser);
      globalEditMode = true;
      updateEditModeUI();
      hideLoginModal();
      return true;
    } else {
      throw new Error('Login failed: Invalid response');
    }
  } catch (error) {
    const errorDiv = $("#loginError");
    if (errorDiv) {
      // Provide more helpful error messages
      let errorMessage = 'Login failed. Please check your credentials.';
      if (error.message) {
        if (error.message.includes('not found') || error.message.includes('404')) {
          errorMessage = 'Login endpoint not found. Please contact the administrator.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = 'Invalid username or password.';
        } else if (error.message.includes('Network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      errorDiv.textContent = errorMessage;
      errorDiv.style.display = 'block';
    }
    console.error('Login error:', error);
    return false;
  }
}

function handleLogout() {
  logout();
  // Also clear from localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('authToken');
  }
  clearAuthToken();
  globalEditMode = false;
  currentUser = null;
  
  // Clear all edit mode states
  editModeState.clear();
  
  updateEditModeUI();
  renderAll();
}

function setupLoginModal() {
  const modal = $("#loginModal");
  const form = $("#loginForm");
  const cancelBtn = $("#cancelLoginBtn");
  
  if (!modal || !form) return;
  
  // Cancel button
  cancelBtn?.addEventListener("click", () => {
    hideLoginModal();
  });
  
  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("#loginUsername")?.value.trim();
    const password = $("#loginPassword")?.value;
    
    if (!username || !password) {
      const errorDiv = $("#loginError");
      if (errorDiv) {
        errorDiv.textContent = 'Please enter both username and password';
        errorDiv.style.display = 'block';
      }
      return;
    }
    
    await handleLogin(username, password);
  });
  
  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideLoginModal();
    }
  });
}

// Check if there are any unsaved changes across all properties
function hasUnsavedChanges() {
  for (const [propertyKey, state] of editModeState.entries()) {
    if (state.changedFields && state.changedFields.size > 0) {
      return true;
    }
  }
  return false;
}

// Get count of properties with unsaved changes
function getUnsavedChangesCount() {
  let count = 0;
  for (const [propertyKey, state] of editModeState.entries()) {
    if (state.changedFields && state.changedFields.size > 0) {
      count++;
    }
  }
  return count;
}

function exitDealPipeline() {
  // Hide Deal Pipeline view
  const dealPipelineView = $("#view-deal-pipeline");
  if (dealPipelineView) {
    dealPipelineView.classList.remove('active');
    dealPipelineView.style.display = 'none';
  }
  
  // Show the default view (By Property)
  const defaultView = $("#view-by-property");
  if (defaultView) {
    defaultView.classList.add('active');
    defaultView.style.display = '';
  }
  
  // Activate the By Property tab
  const byPropertyTab = document.querySelector('.main-tab[data-tab="by-property"]');
  if (byPropertyTab) {
    $$('.main-tab').forEach(tab => tab.classList.remove('active'));
    byPropertyTab.classList.add('active');
  }
  
  // Re-render the main view
  currentTab = 'by-property';
  renderAll();
}

function setupDealPipelineButton() {
  const dealPipelineBtn = $("#dealPipelineBtn");
  if (!dealPipelineBtn) return;
  
  dealPipelineBtn.addEventListener("click", () => {
    // Hide all main views
    $$('.view').forEach(view => {
      view.classList.remove('active');
      view.style.display = 'none';
    });
    
    // Show Deal Pipeline view
    const dealPipelineView = $("#view-deal-pipeline");
    if (dealPipelineView) {
      dealPipelineView.classList.add('active');
      dealPipelineView.style.display = '';
      
      // Show the deals tab by default
      $$('.deal-pipeline-tab-content').forEach(content => {
        content.style.display = 'none';
      });
      $('#deal-pipeline-deals-tab').style.display = '';
      
      // Setup tabs and render
      // Tab switching removed (Reference Data tab removed)
      renderDealPipeline();
    }
    
    // Remove active class from all main tabs
    $$('.main-tab').forEach(tab => {
      tab.classList.remove('active');
    });
  });
  
  // Setup exit button
  const exitBtn = $("#exitDealPipelineBtn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      exitDealPipeline();
    });
  }
}

function setupEditModeButton() {
  const editBtn = $("#editModeBtn");
  if (!editBtn) return;
  
  editBtn.addEventListener("click", () => {
    if (globalEditMode) {
      // Already in edit mode, check for unsaved changes before exiting
      if (hasUnsavedChanges()) {
        const unsavedCount = getUnsavedChangesCount();
        const message = `You have unsaved changes in ${unsavedCount} propert${unsavedCount === 1 ? 'y' : 'ies'}. Do you want to save before exiting edit mode?`;
        const shouldSave = confirm(message);
        if (shouldSave) {
          // Save all properties with changes
          const savePromises = [];
          for (const [propertyKey, state] of editModeState.entries()) {
            if (state.changedFields && state.changedFields.size > 0) {
              savePromises.push(savePropertyChanges(propertyKey));
            }
          }
          Promise.all(savePromises).then(() => {
            handleLogout();
          }).catch(error => {
            console.error("Error saving changes:", error);
            alert("Some changes could not be saved. Please review and try again.");
          });
          return;
        } else {
          // User chose not to save, confirm again
          if (confirm('Are you sure you want to discard all unsaved changes and exit edit mode?')) {
            handleLogout();
          }
          return;
        }
      }
      // No unsaved changes, just confirm logout
      if (confirm('Exit edit mode and logout?')) {
        handleLogout();
      }
    } else {
      // Not in edit mode, show login modal
      showLoginModal();
    }
  });
}

/* ---------- Event Binding ---------- */
function bindEvents() {
  // Setup authentication and edit mode
  setupLoginModal();
  setupEditModeButton();
  setupDealPipelineButton();
  setupReferenceDataModals();
  setupAddDealModal();
  
  // Make functions globally accessible for onclick handlers
  window.showAddRegionModal = showAddRegionModal;
  window.showEditRegionModal = showEditRegionModal;
  window.deleteRegionConfirm = deleteRegionConfirm;
  window.showAddProductTypeModal = showAddProductTypeModal;
  window.showEditProductTypeModal = showEditProductTypeModal;
  window.deleteProductTypeConfirm = deleteProductTypeConfirm;
  
  // Setup equity commitment modal
  setupEquityCommitmentModal();
  setupEditEquityPartnerModal();
  setupPermanentFinancingModal();
  setupCovenantModal();
  setupGuaranteeModal();
  setupParticipationModal();
  
  // Warn about unsaved changes when leaving the page
  window.addEventListener("beforeunload", (e) => {
    try {
      if (globalEditMode && hasUnsavedChanges && hasUnsavedChanges()) {
        const unsavedCount = getUnsavedChangesCount();
        const message = `You have unsaved changes in ${unsavedCount} propert${unsavedCount === 1 ? 'y' : 'ies'}. Are you sure you want to leave?`;
        e.preventDefault();
        e.returnValue = message; // For Chrome
        return message; // For Firefox
      }
    } catch (error) {
      console.error("Error in beforeunload handler:", error);
    }
  });
  
  // Search
  $("#q")?.addEventListener("input", renderAll);
  
  // Refresh
  $("#refreshBtn")?.addEventListener("click", () => {
    loadAll().catch(e => {
      console.error(e);
      alert("Refresh failed. Check console for details.");
    });
  });
  
  // Main tabs - use direct event listeners (more reliable)
  $$(".main-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      $$(".main-tab").forEach(t => t.classList.remove("active"));
      
      // Hide all views first - explicitly set display: none
      $$(".view").forEach(v => {
        v.classList.remove("active");
        v.style.display = 'none'; // Explicitly hide all views
      });
      
      // Exit Deal Pipeline if it's open
      const dealPipelineView = $("#view-deal-pipeline");
      if (dealPipelineView && dealPipelineView.style.display !== 'none') {
        exitDealPipeline();
      }
      
      tab.classList.add("active");
      const tabName = tab.dataset.tab;
      if (tabName) {
        // Show/hide view switcher based on tab
        const viewSwitcher = document.querySelector('.view-switcher');
        if (viewSwitcher) {
          if (tabName === "by-property") {
            viewSwitcher.style.display = '';
          } else {
            viewSwitcher.style.display = 'none';
          }
        }
        
        // Show the target view - explicitly set display and add active class
        const targetView = $(`#view-${tabName}`);
        if (targetView) {
          targetView.style.display = 'block'; // Explicitly show the target view
          targetView.classList.add("active"); // Also add active class for CSS consistency
        }
        
        // Now switch the tab (which will render content into the now-visible view)
        switchTab(tabName);
      }
    });
  });
  
  // View switcher (Construction/Permanent/Equity) - use event delegation
  // Use capture phase to run before other handlers
  document.addEventListener("click", (e) => {
    const viewSwitch = e.target.closest(".view-switch");
    if (viewSwitch) {
      $$(".view-switch").forEach(b => b.classList.remove("active"));
      viewSwitch.classList.add("active");
      const viewName = viewSwitch.dataset.view;
      if (viewName) {
        switchView(viewName);
      }
    }
  }, true); // Use capture phase
  
  // Sort headers - use event delegation to handle dynamically created headers
  // Use capture phase to ensure it runs before other handlers
  // Only bind once using a global flag
  if (!window.sortHandlerBound) {
    document.addEventListener("click", (e) => {
      // Don't interfere with tabs, buttons, or other interactive elements
      if (e.target.closest('.main-tab, .view-switch, .deal-pipeline-tab, button, a, input, select')) {
        return;
      }
      
      // Check if clicking on sort icon or header
      const clickedElement = e.target;
      const th = clickedElement.closest(".th-sort");
      
      if (!th) return;
      
      // Don't sort if clicking on a button, input, or link inside the header
      if (clickedElement.closest("button, a, input, select")) return;
      
      const key = th.dataset.key;
      if (!key) return;
      
      // Prevent default and stop propagation to avoid conflicts
      e.preventDefault();
      e.stopPropagation();
      
      if (sortKey === key) {
        sortDir *= -1;
      } else {
        sortKey = key;
        sortDir = 1;
      }
      
      // Update all sort indicators
      $$(".th-sort .sort").forEach(icon => {
        icon.textContent = "";
      });
      const icon = th.querySelector(".sort");
      if (icon) {
        icon.textContent = sortDir > 0 ? "↑" : "↓";
      }
      
      renderAll();
    }, true); // Use capture phase
    window.sortHandlerBound = true;
  }
  
  // Expand All
  $("#expandAllBtn")?.addEventListener("click", () => {
    const allExpanded = CURRENT_ROWS.every(r => {
      const key = r.ProjectName || r.Property || "";
      return key && expandedKeys.has(key);
    });
    if (allExpanded) {
      expandedKeys.clear();
      renderAll();
    } else {
      CURRENT_ROWS.forEach(r => {
        const key = r.ProjectName || r.Property || "";
        if (key) expandedKeys.add(key);
      });
    renderAll();
      // After rendering, build details for all expanded rows
      requestAnimationFrame(() => {
        const sorted = applySort(CURRENT_ROWS);
        expandedKeys.forEach(key => {
          const rowData = sorted.find(r => (r.ProjectName || r.Property) === key);
          if (rowData) {
            const newRow = document.querySelector(`tr.data-row[data-key="${key}"]`);
            if (newRow) {
              const detailRow = newRow.nextElementSibling;
              if (detailRow && detailRow.classList.contains("detail-row")) {
                const detail = detailRow.querySelector(".detail");
                if (detail) {
                  buildDetails(rowData);
                  adjustDetailWidth(detailRow);
                }
              }
            }
          }
        });
      });
    }
  });

  // Window resize
  window.addEventListener("resize", () => {
    $$(".detail-row").forEach(row => {
      adjustDetailWidth(row);
    });
  });
  
  // Event delegation for equity commitments partner row expand/collapse
  document.addEventListener("click", (e) => {
    // Don't interfere with tabs, buttons, or other interactive elements
    if (e.target.closest('.main-tab, .view-switch, .deal-pipeline-tab, button, a, input, select')) {
      return;
    }
    
    const partnerRow = e.target.closest(".partner-row");
    if (partnerRow && !e.target.closest("button") && !e.target.closest("a")) {
      e.preventDefault();
      e.stopPropagation();
      
      const partner = partnerRow.dataset.partner;
      const projectId = partnerRow.dataset.project;
      if (!partner || !projectId) return;
      
      const key = `equity-${projectId}-${partner}`;
      
      if (expandedEquityPartners.has(key)) {
        expandedEquityPartners.delete(key);
      } else {
        expandedEquityPartners.add(key);
      }
      
      // Find the equity commitments table and rebuild it
      const table = partnerRow.closest('.equity-commitments-table');
      if (table) {
        const projectIdAttr = parseInt(projectId);
        const propertyKey = table.closest('.detail')?.previousElementSibling?.dataset?.key || 
                           table.closest('[data-key]')?.dataset?.key;
        
        // Use global edit mode
        const editState = globalEditMode;
        
        // Rebuild only the table HTML (not the button)
        const fullHtml = buildEquityCommitments(projectIdAttr, globalEditMode);
        
        // Extract the table container and button container
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = fullHtml;
        const newTableContainer = tempDiv.querySelector('.equity-commitments-table');
        const newButtonContainer = tempDiv.querySelector('.equity-add-button-container');
        
        if (newTableContainer) {
          // Replace only the table container, preserve/update the button
          const parent = table.parentElement;
          if (parent) {
            // Check for existing button container BEFORE removing the table
            const existingButtonContainer = parent.querySelector('.equity-add-button-container');
            
            // Remove old table
            table.remove();
            
            // Handle button container - only update if needed
            // First, remove any duplicate button containers (should only be one)
            const allButtonContainers = parent.querySelectorAll('.equity-add-button-container');
            if (allButtonContainers.length > 1) {
              // Keep only the first one, remove the rest
              for (let i = 1; i < allButtonContainers.length; i++) {
                allButtonContainers[i].remove();
              }
            }
            
            const currentButtonContainer = parent.querySelector('.equity-add-button-container');
            
            if (editState && newButtonContainer) {
              if (currentButtonContainer) {
                // Button already exists, don't duplicate - just leave it as is
                // Only update if the project ID changed (unlikely but handle it)
                const currentProjectId = currentButtonContainer.querySelector('button')?.getAttribute('onclick')?.match(/showAddEquityCommitmentModal\((\d+)\)/)?.[1];
                const newProjectId = newButtonContainer.querySelector('button')?.getAttribute('onclick')?.match(/showAddEquityCommitmentModal\((\d+)\)/)?.[1];
                if (currentProjectId !== newProjectId) {
                  currentButtonContainer.outerHTML = newButtonContainer.outerHTML;
                }
              } else {
                // Button doesn't exist, add it
                parent.appendChild(newButtonContainer);
              }
            } else if (!editState && currentButtonContainer) {
              // Remove button if not in edit mode
              currentButtonContainer.remove();
            }
            
            // Insert new table before button (if it exists) or at the end
            const buttonContainer = parent.querySelector('.equity-add-button-container');
            if (buttonContainer) {
              parent.insertBefore(newTableContainer, buttonContainer);
            } else {
              parent.appendChild(newTableContainer);
            }
          } else {
            // Fallback: replace outerHTML if no parent
            table.outerHTML = newTableContainer.outerHTML;
          }
        }
      }
    }
  }, true);
}

/* ---------- Manage Related Parties Globally for Partner ---------- */
window.showManageRelatedPartiesModal = function(partnerId) {
  const modal = $("#manageRelatedPartiesModal");
  const form = $("#manageRelatedPartiesForm");
  const partnerIdInput = $("#manageRelatedPartiesPartnerId");
  const title = $("#manageRelatedPartiesTitle");
  const description = $("#manageRelatedPartiesDescription");
  const cancelBtn = $("#cancelManageRelatedPartiesBtn");
  const searchInput = $("#manageRelatedPartiesSearch");
  const dropdown = $("#manageRelatedPartiesDropdown");
  const select = $("#manageRelatedParties");
  const chipsContainer = $("#manageRelatedPartiesChips");
  const applyToAllCheckbox = $("#applyToAllCommitments");
  
  if (!modal || !form || !partnerIdInput) return;
  
  const partner = (window.EQUITY_PARTNERS_DATA || []).find(p => p.EquityPartnerId === partnerId);
  if (!partner) {
    alert("Partner not found");
    return;
  }
  
  partnerIdInput.value = partnerId;
  title.textContent = `Manage Related Parties for ${partner.PartnerName}`;
  description.textContent = `Select related parties to apply to all commitments for ${partner.PartnerName}.`;
  
  // Get all commitments for this partner
  const partnerCommitments = (window.EQUITY_COMMITMENTS_DATA || []).filter(c => c.EquityPartnerId === partnerId);
  
  // Collect all unique related party IDs from all commitments
  const allRelatedPartyIds = new Set();
  for (const commit of partnerCommitments) {
    if (commit.RelatedParties && Array.isArray(commit.RelatedParties)) {
      for (const rp of commit.RelatedParties) {
        const rpId = rp.EquityPartnerId || rp;
        if (rpId) {
          allRelatedPartyIds.add(parseInt(rpId));
        }
      }
    }
  }
  
  // Setup searchable dropdown
  const partners = window.EQUITY_PARTNERS_DATA || [];
  
  // Clean up any existing handler to prevent duplicate event listeners
  if (window.manageRelatedPartiesHandler && window.manageRelatedPartiesHandler.cleanup) {
    window.manageRelatedPartiesHandler.cleanup();
  }
  
  // Clear search input and dropdown
  if (searchInput) searchInput.value = '';
  if (dropdown) dropdown.innerHTML = '';
  if (chipsContainer) chipsContainer.innerHTML = '';
  if (select) select.innerHTML = '';
  
  const relatedPartiesHandler = setupSearchableRelatedPartiesDropdown(
    "#manageRelatedPartiesSearch",
    "#manageRelatedPartiesDropdown",
    "#manageRelatedParties",
    "#manageRelatedPartiesChips",
    partners,
    partnerId, // Exclude the current partner
    null
  );
  
  // Set existing related parties
  if (allRelatedPartyIds.size > 0 && relatedPartiesHandler) {
    relatedPartiesHandler.setSelectedIds(Array.from(allRelatedPartyIds));
  }
  
  // Store handler for form submission
  form.dataset.relatedPartiesHandler = "manageRelatedPartiesHandler";
  window.manageRelatedPartiesHandler = relatedPartiesHandler;
  
  // Show modal
  modal.style.display = "flex";
  
  // Focus the search input after a brief delay to ensure modal is visible
  setTimeout(() => {
    if (searchInput) {
      searchInput.focus();
    }
  }, 100);
  
  // Form submission
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const applyToAll = applyToAllCheckbox ? applyToAllCheckbox.checked : true;
    const relatedPartiesHandler = window.manageRelatedPartiesHandler;
    const selectedRelatedPartyIds = relatedPartiesHandler ? relatedPartiesHandler.getSelectedIds() : [];
    
    // Validate selected IDs
    const validRelatedPartyIds = selectedRelatedPartyIds.filter(id =>
      partners.some(p => p.EquityPartnerId === id)
    );
    
    if (applyToAll && partnerCommitments.length > 0) {
      const confirmMessage = `Update related parties for all ${partnerCommitments.length} commitment(s) for ${partner.PartnerName}?`;
      if (!confirm(confirmMessage)) return;
      
      // Update all commitments
      const updatePromises = partnerCommitments.map(commitment => {
        return updateEquityCommitment(commitment.EquityCommitmentId, {
          ProjectId: commitment.ProjectId,
          EquityPartnerId: commitment.EquityPartnerId,
          EquityType: commitment.EquityType,
          Amount: commitment.Amount,
          FundingDate: commitment.FundingDate,
          RelatedPartyIds: validRelatedPartyIds
        });
      });
      
      try {
        await Promise.all(updatePromises);
        
        // Reload data
        const commitmentsRes = await getAllEquityCommitments();
        window.EQUITY_COMMITMENTS_DATA = commitmentsRes?.data || commitmentsRes || [];
        
        // Refresh the view
        if (currentTab === "contacts-partners") {
          await renderContactsPartnersView();
        }
        
        showSuccessMessage(`Updated related parties for ${partnerCommitments.length} commitment(s)`, 3000);
        modal.style.display = "none";
        form.reset();
      } catch (error) {
        console.error("Error updating related parties:", error);
        alert(`Error updating related parties: ${error.message}`);
      }
    } else {
      // Just save the selection for future use (when creating new commitments)
      // For now, we'll show a message
      showSuccessMessage(`Related parties selection saved for ${partner.PartnerName}. They will be used when creating new commitments.`, 3000);
      modal.style.display = "none";
      form.reset();
    }
  };
  
  // Cancel button
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.style.display = "none";
      form.reset();
    };
  }
  
  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      form.reset();
    }
  };
  
  modal.style.display = "flex";
};

/* ---------- Toggle Functions for Investor Reps and Related Parties ---------- */

// Toggle investor rep details visibility
window.toggleInvestorRep = function(id) {
  const content = $(`#rep-content-${id}`);
  const icon = $(`#rep-toggle-${id}`);
  
  if (content && icon) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    icon.textContent = isVisible ? '▶' : '▼';
  }
};

// Toggle related parties visibility
window.toggleRelatedParties = function(id) {
  const content = $(`#related-content-${id}`);
  const icon = $(`#related-toggle-${id}`);
  
  if (content && icon) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    icon.textContent = isVisible ? '▶' : '▼';
  }
};

/* ---------- Initialization ---------- */
async function init() {
  DOMO = getDomoQuick();
  try {
    // Initialize authentication (restore token if available)
    await initializeAuth();
    
    await loadAll();
    
    // Set default sort to IO Maturity for construction view
    if (currentView === "construction") {
      sortKey = "ConstructionIOMaturity";
      sortDir = 1;
    }
  } catch (e) {
    console.error(e);
    const tbody = $("#listBody");
    if (tbody) {
      tbody.innerHTML = `<tr><td class="empty" colspan="10">Couldn't load data. Check console for details.</td></tr>`;
    }
  }
  renderAll();
  bindEvents();
  
  // Set initial search placeholder based on current tab
  const searchInput = $("#q");
  if (searchInput) {
    if (currentTab === "by-property") {
      searchInput.placeholder = "Search properties, cities, states, lenders...";
    } else if (currentTab === "by-bank") {
      searchInput.placeholder = "Search banks, positioning, or deal names...";
    } else if (currentTab === "by-equity") {
      searchInput.placeholder = "Search investors or deal names...";
    }
  }
  
  // Ensure view switcher is only visible in by-property view on initial load
  const viewSwitcher = document.querySelector('.view-switcher');
  if (viewSwitcher && currentTab !== "by-property") {
    viewSwitcher.style.display = 'none';
  }
}

document.addEventListener("DOMContentLoaded", init);
