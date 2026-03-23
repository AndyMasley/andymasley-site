export type ExplorerLayerMode =
  | 'regional_baseline'
  | 'current_local_conditions'
  | 'data_center_sources'
  | 'public_supply_dependence'
  | 'evidence';

export type LayerAvailability = 'published' | 'scoped';

export interface LayerModeMeta {
  key: ExplorerLayerMode;
  label: string;
  short_label: string;
  status_label: string;
  availability: LayerAvailability;
  description: string;
  map_caption: string;
  panel_title: string;
  panel_summary: string;
  published_now: string[];
  needs_next: string[];
}

export const EXPLORER_LAYER_MODES: LayerModeMeta[] = [
  {
    key: 'regional_baseline',
    label: 'Regional baseline',
    short_label: 'Baseline',
    status_label: 'Published now',
    availability: 'published',
    description:
      'Parent-system structural pressure using 2015 withdrawals and long-run recharge over mapped principal-aquifer footprints.',
    map_caption:
      'This is the parent-system context layer. It shows regional structural pressure, not a facility-level source conclusion.',
    panel_title: 'Regional structural pressure baseline',
    panel_summary:
      'Use this view to understand the parent aquifer context. It does not prove what a local campus or utility is actually pumping.',
    published_now: [
      '2015 direct-source withdrawal totals by principal aquifer',
      'Long-run recharge overlay across mapped aquifer footprints',
      'Geometry-state labeling for official polygons versus county-footprint fallbacks',
      'Category totals and provenance metadata',
    ],
    needs_next: [
      'Local aquifer frameworks and subaquifer overrides',
      'Facility, utility, and service-area routing',
      'Observed local groundwater conditions',
    ],
  },
  {
    key: 'current_local_conditions',
    label: 'Current local conditions',
    short_label: 'Local conditions',
    status_label: 'Scoped next',
    availability: 'scoped',
    description:
      'Recent groundwater levels, seasonal recharge, drought context, and other local indicators near the source area.',
    map_caption:
      'This layer will keep the regional baseline for context while adding local monitoring and seasonal conditions once those feeds are ingested.',
    panel_title: 'Current local conditions',
    panel_summary:
      'This layer is not yet published in the public build. The intended focus is observed local conditions rather than only long-run structural pressure.',
    published_now: [
      'Regional parent-aquifer baseline for context',
      'Geometry and provenance caveats that constrain local interpretation',
    ],
    needs_next: [
      'Nearby monitoring wells and groundwater-level anomalies',
      'Seasonal recharge, drought, and recent modeled water-use layers',
      'Local hydrogeologic overrides where national polygons are too coarse',
    ],
  },
  {
    key: 'data_center_sources',
    label: 'Data-center sources',
    short_label: 'Sources',
    status_label: 'Scoped next',
    availability: 'scoped',
    description:
      'Facility-to-utility-to-source attribution so campuses can be connected to direct wells, purchased groundwater, or blended systems.',
    map_caption:
      'This layer will keep the regional baseline as context while the facility source graph is built from direct wells, utilities, permits, and documented source inventories.',
    panel_title: 'Data-center source attribution',
    panel_summary:
      'This public build does not yet expose campus source routing. The next data step is a facility graph rather than a stronger national stress formula.',
    published_now: [
      'Regional parent aquifer context only',
      'Evidence and confidence metadata showing what is still unknown',
    ],
    needs_next: [
      'Campus registry with utility and direct-well links',
      'Service areas, CCRs, and source-water categories',
      'Permits, withdrawal reports, and vertical source intervals',
    ],
  },
  {
    key: 'public_supply_dependence',
    label: 'Public-supply dependence',
    short_label: 'Public supply',
    status_label: 'Scoped next',
    availability: 'scoped',
    description:
      'Groundwater delivered through community systems, with source-water categories and service-area evidence made explicit.',
    map_caption:
      'This layer will show where groundwater reaches users through utilities, but it is not yet published in the current build.',
    panel_title: 'Public-supply groundwater dependence',
    panel_summary:
      'The current build does not yet route campuses through utilities, even though municipal systems are often the real groundwater connector.',
    published_now: [
      'Regional aquifer baseline only',
      'A provenance registry that can carry future utility and source-water evidence',
    ],
    needs_next: [
      'EPA service-area boundaries and their modeled-geometry caveats',
      'Source-water type inventories and Consumer Confidence Reports',
      'Utility-specific groundwater share ranges instead of single-point guesses',
    ],
  },
  {
    key: 'evidence',
    label: 'Evidence',
    short_label: 'Evidence',
    status_label: 'Published now',
    availability: 'published',
    description:
      'A ledger view that makes visible what this build knows directly, what it infers, and what it still cannot prove.',
    map_caption:
      'The map remains the regional parent-system backdrop in this mode. The detail panel shifts to evidence type, confidence, geometry state, and known gaps.',
    panel_title: 'Evidence ledger',
    panel_summary:
      'This view is designed to keep unknowns visible. It centers evidence class, caveats, and what would be needed before making a local source claim.',
    published_now: [
      'Direct-source USGS aquifer withdrawals and broad categories',
      'Geometry method and fallback status for each displayed aquifer',
      'Confidence grades, methodology keys, and provenance records',
      'Caveats explaining what the map does not prove',
    ],
    needs_next: [
      'Facility and utility source chains',
      'Permit status and actual-reported pumping links',
      'Local monitoring, water quality, and vertical aquifer detail',
    ],
  },
];

export function explorerLayerMeta(mode: ExplorerLayerMode): LayerModeMeta {
  return EXPLORER_LAYER_MODES.find((entry) => entry.key === mode) ?? EXPLORER_LAYER_MODES[0];
}
