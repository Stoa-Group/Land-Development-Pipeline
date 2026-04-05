// modules/core/state.js — All mutable global state for deal pipeline dashboard
// Import this in every module: import { state } from '../core/state.js';

/**
 * All mutable global state. Centralised here so modules never reach into each
 * other's closures. Mutate via direct property assignment: state.allDeals = [...].
 */
export const state = {
  // Domo SDK object (set after bootstrap)
  DOMO: null,

  // Core data arrays
  allDeals: [],
  procoreProjectMap: {}, // Map of project name -> { actualstartdate, ... }

  // View/filter/sort state
  currentView: 'overview',
  currentFilters: {
    stages: [], // Multi-select stage filter; [] = all (with default exclusions on non-overview)
    location: '',
    bank: '',
    product: '',
    state: '', // State filter
    search: '',
    year: '',
    timelineStartDate: null,
    timelineEndDate: null,
    dateAddedRange: (function() {
      try {
        const saved = localStorage.getItem('dealPipeline_dateAddedDefault');
        if (saved && ['3m','6m','1y','2y','unlimited'].includes(saved)) return saved;
      } catch (e) { /* ignore */ }
      return '1y';
    })()
  },
  currentSort: { by: 'date', order: 'asc' },
  blockSort: { by: 'date', order: 'asc' },
  listViewMode: 'location', // 'location' | 'stage' | 'product' | 'bank'

  // Map instances
  mapInstance: null,
  contactsMapInstance: null,
  mapMarkers: [],
  visibleDealsForMap: [],
  allMapMarkers: [],
  isCityView: false,
  currentCityView: null,

  // Authentication and Edit Mode
  isAuthenticated: false,
  isEditMode: false,
  currentUser: null,
  currentEditingDeal: null,

  // Presence
  presenceHeartbeatId: null,
  presencePollId: null,

  // Timeline scroll
  timelineScrollPosition: 0,

  // Bank name map
  bankNameMap: {},

  // Contacts
  landDevelopmentContacts: [],
  landDevelopmentContactFilters: { type: '', city: '', state: '', q: '', upcomingOnly: false },
  contactsViewMode: 'list',
};

// Stage configuration with colors
export const STAGE_CONFIG = {
  'Prospective': { class: 'prospective', color: '#c026d3' },
  'Under Review': { class: 'under-review', color: '#9333ea' },
  'Under Contract': { class: 'under-contract', color: '#dc2626' },
  'Under Construction': { class: 'under-construction', color: '#ea580c' },
  'Started': { class: 'started', color: '#ea580c' },
  'Lease-Up': { class: 'lease-up', color: '#eab308' },
  'Lease-up': { class: 'lease-up', color: '#eab308' },
  'Stabilized': { class: 'stabilized', color: '#22c55e' },
  'Liquidated': { class: 'liquidated', color: '#ffffff', borderColor: '#000000' },
  'Closed': { class: 'closed', color: '#ffffff', borderColor: '#000000' },
  'Commercial Land Listed': { class: 'commercial-land-listed', color: '#14b8a6' },
  'Commercial Land - Listed': { class: 'commercial-land-listed', color: '#14b8a6' },
  'Rejected': { class: 'rejected', color: '#6b7280' },
  'Dead': { class: 'dead', color: '#374151', borderColor: '#1f2937' },
  'Other': { class: 'other', color: '#78716c' },
  'START': { class: 'start', color: '#f97316' }
};

export const STAGE_DISPLAY_ORDER = [
  'Prospective',
  'Under Review',
  'Under Contract',
  'Under Construction',
  'Lease-Up',
  'Stabilized',
  'Liquidated',
  'Commercial Land - Listed',
  'Rejected',
  'Dead'
];

export const UNIT_SUMMARY_STAGE_ORDER = [
  'Under Contract',
  'Under Construction',
  'Lease-Up',
  'Stabilized',
  'Liquidated',
  'Commercial Land - Listed',
  'Dead'
];

export const DEFAULT_EXCLUDED_STAGES = ['Prospective', 'Under Review', 'Rejected'];

export const STATE_ABBREVIATIONS = {
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
