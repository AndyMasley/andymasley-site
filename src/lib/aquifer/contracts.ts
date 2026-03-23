export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D';

export type SourceType =
  | 'direct_source'
  | 'direct_source_aggregate'
  | 'official_proxy_estimate'
  | 'heuristic_estimate'
  | 'low_confidence_estimate';

export type MetricMode = 'stress' | 'categories' | 'industry';

export interface DisplayAquifer {
  display_aquifer_id: string;
  display_name: string;
  short_name: string;
  sort_order: number;
  region_label: string;
  description_short: string;
  description_long: string;
  geometry_source: string;
  geometry_notes: string;
  source_aquifer_codes: string[];
  is_grouped_system: boolean;
  default_year: number;
  default_units: string;
  methodology_version: string;
  status: 'active' | 'draft' | 'excluded';
  confidence_summary?: string;
}

export interface DisplayAquiferCollection {
  version: string;
  generated_at: string;
  methodology_version: string;
  build_status: 'ready' | 'pending_source_ingest' | 'partial';
  aquifers: DisplayAquifer[];
}

export interface GeometryMetadata {
  display_aquifer_id: string;
  geometry_version: string;
  source_dataset: string;
  source_scale_note: string;
  is_simplified: boolean;
  topology_valid: boolean;
  bbox: [number, number, number, number];
  feature_area_sqkm: number;
  display_zoom_min: number;
  display_zoom_max: number;
  geometry_method: 'usgs_principal_aquifer_polygon' | 'county_footprint_fallback';
  county_footprint_count: number | null;
}

export interface MetricValue {
  value: number;
  units: string;
  is_estimate: boolean;
  confidence_grade: ConfidenceGrade;
  source_type: SourceType;
  methodology_key: string;
  methodology_version: string;
  notes: string;
}

export interface RechargeStressMetrics {
  estimated_natural_recharge: MetricValue;
  net_withdrawal_minus_recharge: MetricValue;
  withdrawal_to_recharge_ratio: MetricValue;
  balance_index: MetricValue;
}

export interface CategoryBreakdown {
  display_aquifer_id: string;
  year: number;
  category_key: string;
  category_label: string;
  value: number;
  units: string;
  share_of_total: number;
  confidence_grade: ConfidenceGrade;
  source_type: SourceType;
  methodology_key: string;
}

export interface IndustryEstimate {
  display_aquifer_id: string;
  year: number;
  parent_category_key: string;
  industry_subtype_key: string;
  industry_subtype_label: string;
  naics_codes: string[];
  value: number;
  units: string;
  allocation_basis: string;
  allocation_geo_level: string;
  confidence_grade: ConfidenceGrade;
  is_modeled: boolean;
  methodology_key: string;
  source_ids: string[];
  notes: string;
}

export interface AquiferMetricRecord {
  display_aquifer_id: string;
  year: number;
  total_withdrawal: MetricValue;
  recharge_stress: RechargeStressMetrics;
  categories: CategoryBreakdown[];
  industry_estimates: IndustryEstimate[];
  provenance_source_ids: string[];
  methodology_summary: string;
  caveats: string[];
}

export interface AquiferMetricsCollection {
  version: string;
  generated_at: string;
  methodology_version: string;
  build_status: 'ready' | 'pending_source_ingest' | 'partial';
  records: AquiferMetricRecord[];
}

export interface ProvenanceRecord {
  source_id: string;
  title: string;
  publisher: string;
  year: number | null;
  dataset_or_report: string;
  doi_or_identifier: string;
  retrieved_at: string | null;
  license: string;
  usage_notes: string;
}

export interface ProvenanceCollection {
  version: string;
  generated_at: string;
  sources: ProvenanceRecord[];
}

export type Position = [number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type DisplayGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface DisplayAquiferFeature {
  type: 'Feature';
  properties: GeometryMetadata & {
    display_name: string;
    short_name: string;
    region_label: string;
  };
  geometry: DisplayGeometry;
}

export interface DisplayAquiferFeatureCollection {
  type: 'FeatureCollection';
  features: DisplayAquiferFeature[];
}

export interface AquiferDataBundle {
  collection: DisplayAquiferCollection;
  geometry: DisplayAquiferFeatureCollection;
  metrics: AquiferMetricsCollection;
  provenance: ProvenanceCollection;
}
