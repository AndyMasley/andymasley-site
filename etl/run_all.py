import csv
import json
import math
import re
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import shapefile

from etl.config.constants import (
    CATEGORY_COLUMNS,
    CROSSWALK_PATH,
    DATA_DICTIONARY_PATH,
    DERIVED_DIR,
    DISPLAY_AQUIFER_VERSION,
    DISPLAY_COLLECTION_PATH,
    DISPLAY_GEOMETRY_PATH,
    DISPLAY_GEOMETRY_QA_PATH,
    EXCLUDED_SOURCE_NAMES,
    EXPECTED_SOURCE_FILES,
    GEOMETRY_SOURCE_PATH,
    INDUSTRY_ESTIMATES_PATH,
    METHODOLOGY_VERSION,
    PROVENANCE_PATH,
    WITHDRAWALS_PATH,
    WITHDRAWALS_SOURCE_PATH,
)


GEOMETRY_SCALE_NOTE = (
    "USGS principal aquifer geometry is intended for national and regional visualization at publication scales "
    "around 1:2,500,000 or smaller, and does not represent the full underground extent."
)
GEOMETRY_SOURCE_LABEL = (
    "USGS principal aquifers shapefile (ScienceBase item 63140610d34e36012efa385d)"
)
WITHDRAWALS_SOURCE_LABEL = (
    "USGS county-aquifer groundwater withdrawals release for 2015 (ScienceBase item 5d4a3c3ee4b01d82ce8dedc6)"
)


def _source_file_is_valid(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 128:
        return False
    head = path.read_bytes()[:256]
    return b"The specified URL cannot be found" not in head


def _source_files_present() -> bool:
    return all(_source_file_is_valid(path) for path in EXPECTED_SOURCE_FILES)


def _write_json(path: Path, payload: Any, *, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        serialized = json.dumps(payload, indent=2) + "\n"
    else:
        serialized = json.dumps(payload, separators=(",", ":"))
    path.write_text(serialized, encoding="utf-8")


def _clean_source_name(full_name: str) -> str:
    parts = full_name.split("-", 2)
    return parts[2].strip() if len(parts) == 3 else full_name.strip()


def _normalize_name(value: str) -> str:
    normalized = value.lower().replace("(", "").replace(")", "")
    replacements = {
        "systems": "system",
        "aquifers": "aquifer",
        "volcanic-rock": "basaltic-rock",
        "dade county-biscayne aquifer": "biscayne aquifer",
        "northern rocky mountains intermontane basins aquifer systems": (
            "northern rocky mountains intermontane basins aquifer system"
        ),
    }
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    return " ".join(normalized.split())


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _short_name(display_name: str) -> str:
    for suffix in (" aquifer system", " aquifer", " aquifers"):
        if display_name.lower().endswith(suffix):
            return display_name[: -len(suffix)]
    return display_name


def _state_label(state_totals: dict[str, float]) -> str:
    top_states = [state for state, _ in sorted(state_totals.items(), key=lambda item: item[1], reverse=True)[:3]]
    return " · ".join(top_states)


def _state_sentence(state_totals: dict[str, float]) -> str:
    top_states = [state for state, _ in sorted(state_totals.items(), key=lambda item: item[1], reverse=True)[:3]]
    if not top_states:
        return "multiple states"
    if len(top_states) == 1:
        return top_states[0]
    if len(top_states) == 2:
        return f"{top_states[0]} and {top_states[1]}"
    return f"{top_states[0]}, {top_states[1]}, and {top_states[2]}"


def _round_number(value: float) -> float:
    return round(value, 2)


def _round_coords(obj: Any, digits: int = 4) -> Any:
    if isinstance(obj, (list, tuple)) and obj and isinstance(obj[0], (int, float)):
        return [round(obj[0], digits), round(obj[1], digits)]
    return [_round_coords(item, digits) for item in obj]


def _bbox_of_coordinates(coordinates: Any) -> list[float]:
    xs: list[float] = []
    ys: list[float] = []

    def walk(node: Any) -> None:
        if not node:
            return
        if isinstance(node[0], (int, float)):
            xs.append(node[0])
            ys.append(node[1])
            return
        for item in node:
            walk(item)

    walk(coordinates)
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


def _ring_area_sqkm(ring: list[list[float]]) -> float:
    if len(ring) < 4:
        return 0.0
    latitude_reference = math.radians(sum(point[1] for point in ring) / len(ring))
    projected_points: list[tuple[float, float]] = []
    for lon, lat in ring:
        x = lon * 111.320 * math.cos(latitude_reference)
        y = lat * 110.574
        projected_points.append((x, y))

    area = 0.0
    for (x1, y1), (x2, y2) in zip(projected_points, projected_points[1:]):
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _perpendicular_distance(
    point: list[float], start: list[float], end: list[float]
) -> float:
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    numerator = abs(
        (end[1] - start[1]) * point[0]
        - (end[0] - start[0]) * point[1]
        + end[0] * start[1]
        - end[1] * start[0]
    )
    denominator = math.hypot(end[1] - start[1], end[0] - start[0])
    return numerator / denominator


def _douglas_peucker(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points

    max_distance = 0.0
    max_index = 0
    start = points[0]
    end = points[-1]

    for index in range(1, len(points) - 1):
        distance = _perpendicular_distance(points[index], start, end)
        if distance > max_distance:
            max_distance = distance
            max_index = index

    if max_distance > tolerance:
        left = _douglas_peucker(points[: max_index + 1], tolerance)
        right = _douglas_peucker(points[max_index:], tolerance)
        return left[:-1] + right

    return [start, end]


def _simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(ring) <= 4:
        return [[round(point[0], 3), round(point[1], 3)] for point in ring]

    core = ring[:-1] if ring[0] == ring[-1] else ring
    simplified = _douglas_peucker(core, tolerance)
    if len(simplified) < 3:
        simplified = [core[0], core[len(core) // 2], core[-1]]
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return [[round(point[0], 3), round(point[1], 3)] for point in simplified]


def _simplify_geometry(geometry: dict[str, Any], tolerance: float = 0.025) -> dict[str, Any]:
    if geometry["type"] == "Polygon":
        return {
            "type": "Polygon",
            "coordinates": [_simplify_ring(ring, tolerance) for ring in geometry["coordinates"]],
        }
    return {
        "type": "MultiPolygon",
        "coordinates": [
            [_simplify_ring(ring, tolerance) for ring in polygon]
            for polygon in geometry["coordinates"]
        ],
    }


def _geometry_area_sqkm(geometry: dict[str, Any]) -> float:
    if geometry["type"] == "Polygon":
        total = 0.0
        for index, ring in enumerate(geometry["coordinates"]):
            total += (-1 if index else 1) * _ring_area_sqkm(ring)
        return abs(total)
    return sum(
        _geometry_area_sqkm({"type": "Polygon", "coordinates": polygon})
        for polygon in geometry["coordinates"]
    )


def _combine_shape_records(shape_records: list[Any]) -> dict[str, Any]:
    polygons: list[Any] = []
    for shape_record in shape_records:
        geometry = shape_record.shape.__geo_interface__
        if geometry["type"] == "Polygon":
            polygons.append(_round_coords(geometry["coordinates"]))
        elif geometry["type"] == "MultiPolygon":
            polygons.extend(_round_coords(geometry["coordinates"]))

    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def _load_withdrawal_rows() -> tuple[str, dict[str, Any]]:
    citation = ""
    source_name_totals: defaultdict[str, float] = defaultdict(float)
    source_name_state_totals: defaultdict[str, defaultdict[str, float]] = defaultdict(
        lambda: defaultdict(float)
    )
    source_name_category_totals: defaultdict[str, defaultdict[str, float]] = defaultdict(
        lambda: defaultdict(float)
    )
    source_name_codes: defaultdict[str, set[str]] = defaultdict(set)

    with WITHDRAWALS_SOURCE_PATH.open(newline="", encoding="cp1252") as handle:
        reader = csv.reader(handle)
        citation = next(reader)[0]
        header = next(reader)

        for row in reader:
            record = dict(zip(header, row))
            source_name = _clean_source_name(record["CountyAquifer Name"])
            source_code = record["CountyAquifer"].split("-")[-1]
            total_value = record.get("TO-WGWTo", "--")
            total = 0.0 if total_value in ("--", "") else float(total_value)

            source_name_totals[source_name] += total
            source_name_state_totals[source_name][record["State"]] += total
            source_name_codes[source_name].add(source_code)

            for category_key, (_, column_name) in CATEGORY_COLUMNS.items():
                value = record.get(column_name, "--")
                if value not in ("--", ""):
                    source_name_category_totals[source_name][category_key] += float(value)

    return citation, {
        "totals": source_name_totals,
        "states": source_name_state_totals,
        "categories": source_name_category_totals,
        "codes": source_name_codes,
    }


def _load_geometry_records() -> tuple[dict[str, list[Any]], dict[str, str]]:
    geometry_records: defaultdict[str, list[Any]] = defaultdict(list)
    geometry_by_normalized_name: dict[str, str] = {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        with zipfile.ZipFile(GEOMETRY_SOURCE_PATH) as archive:
            archive.extractall(tmp_dir)
        reader = shapefile.Reader(str(Path(tmp_dir) / "us_aquifers.shp"))
        for shape_record in reader.iterShapeRecords():
            geometry_name = shape_record.record["AQ_NAME"]
            geometry_records[geometry_name].append(shape_record)
            geometry_by_normalized_name[_normalize_name(geometry_name)] = geometry_name

    return geometry_records, geometry_by_normalized_name


def _select_display_systems(
    withdrawal_data: dict[str, Any],
    geometry_by_normalized_name: dict[str, str],
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    used_geometry_names: set[str] = set()

    for source_name, total in sorted(
        withdrawal_data["totals"].items(), key=lambda item: item[1], reverse=True
    ):
        if source_name in EXCLUDED_SOURCE_NAMES:
            continue
        geometry_name = geometry_by_normalized_name.get(_normalize_name(source_name))
        if not geometry_name or geometry_name in used_geometry_names:
            continue

        display_name = geometry_name
        display_id = _slugify(display_name)
        used_geometry_names.add(geometry_name)
        selected.append(
            {
                "display_aquifer_id": display_id,
                "display_name": display_name,
                "source_name": source_name,
                "geometry_name": geometry_name,
                "total": total,
            }
        )
        if len(selected) == 30:
            break

    return selected


def _write_crosswalk(
    selected_systems: list[dict[str, Any]],
    source_name_codes: dict[str, set[str]],
) -> None:
    selected_lookup = {item["source_name"]: item for item in selected_systems}
    rows: list[list[str]] = []

    for source_name in sorted(source_name_codes):
        selection = selected_lookup.get(source_name)
        for source_code in sorted(source_name_codes[source_name]):
            if selection:
                note = ""
                reviewer_note = ""
                if selection["source_name"] != selection["geometry_name"]:
                    note = (
                        f"Mapped source label '{selection['source_name']}' to geometry label "
                        f"'{selection['geometry_name']}' for the display layer."
                    )
                    reviewer_note = "Name normalized to the USGS geometry label."
                rows.append(
                    [
                        source_code,
                        source_name,
                        selection["display_aquifer_id"],
                        "1.0",
                        "top_30_matchable_principal_aquifers_2015",
                        note,
                        reviewer_note,
                    ]
                )
            else:
                reason = (
                    "Excluded from the v1 display layer because it is either outside the top 30 matched "
                    "aquifers by 2015 withdrawals or does not map cleanly to a single renderable principal-aquifer geometry."
                )
                rows.append(
                    [
                        source_code,
                        source_name,
                        "excluded_not_in_v1_display",
                        "1.0",
                        "excluded_from_v1_display_top_30",
                        reason,
                        "",
                    ]
                )

    with CROSSWALK_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "source_aquifer_code",
                "source_aquifer_name",
                "display_aquifer_id",
                "allocation_weight",
                "crosswalk_method",
                "crosswalk_notes",
                "reviewer_note",
            ]
        )
        writer.writerows(rows)


def _build_outputs(
    selected_systems: list[dict[str, Any]],
    withdrawal_data: dict[str, Any],
    geometry_records: dict[str, list[Any]],
    generated_at: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    aquifers: list[dict[str, Any]] = []
    features: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    qa_features: list[dict[str, Any]] = []

    for sort_order, item in enumerate(selected_systems, start=1):
        source_name = item["source_name"]
        display_name = item["display_name"]
        display_id = item["display_aquifer_id"]
        total = withdrawal_data["totals"][source_name]
        state_totals = dict(withdrawal_data["states"][source_name])
        category_totals = dict(withdrawal_data["categories"][source_name])
        dominant_category_key, dominant_category_total = max(
            category_totals.items(), key=lambda pair: pair[1]
        )
        dominant_category_label = CATEGORY_COLUMNS[dominant_category_key][0]
        dominant_share = dominant_category_total / total if total else 0.0
        state_label = _state_label(state_totals)
        state_sentence = _state_sentence(state_totals)
        raw_geometry = _combine_shape_records(geometry_records[item["geometry_name"]])
        geometry = _simplify_geometry(raw_geometry)
        bbox = _bbox_of_coordinates(raw_geometry["coordinates"])
        feature_area_sqkm = round(_geometry_area_sqkm(raw_geometry), 2)
        source_codes = sorted(withdrawal_data["codes"][source_name])

        geometry_note = (
            "USGS principal aquifer geometry shown for national-scale display only. "
            "It represents the shallowest principal aquifers and not the full underground extent."
        )
        description_short = (
            f"A major groundwater system with {dominant_category_label.lower()} dominating withdrawals "
            f"across {state_sentence}."
        )
        description_long = (
            f"In 2015, the USGS estimated about {_round_number(total)} Mgal/d of groundwater withdrawals "
            f"associated with the {display_name}. {dominant_category_label} accounted for about "
            f"{round(dominant_share * 100)} percent of the total, with the largest shares concentrated in {state_sentence}."
        )

        aquifers.append(
            {
                "display_aquifer_id": display_id,
                "display_name": display_name,
                "short_name": _short_name(display_name),
                "sort_order": sort_order,
                "region_label": state_label,
                "description_short": description_short,
                "description_long": description_long,
                "geometry_source": GEOMETRY_SOURCE_LABEL,
                "geometry_notes": geometry_note,
                "source_aquifer_codes": source_codes,
                "is_grouped_system": False,
                "default_year": 2015,
                "default_units": "Mgal/d",
                "methodology_version": METHODOLOGY_VERSION,
                "status": "active",
                "confidence_summary": "A",
            }
        )

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "display_aquifer_id": display_id,
                    "display_name": display_name,
                    "short_name": _short_name(display_name),
                    "region_label": state_label,
                    "geometry_version": DISPLAY_AQUIFER_VERSION,
                    "source_dataset": GEOMETRY_SOURCE_LABEL,
                    "source_scale_note": GEOMETRY_SCALE_NOTE,
                    "is_simplified": True,
                    "topology_valid": True,
                    "bbox": bbox,
                    "feature_area_sqkm": feature_area_sqkm,
                    "display_zoom_min": 2,
                    "display_zoom_max": 7,
                },
                "geometry": geometry,
            }
        )
        qa_features.append(
            {
                "type": "Feature",
                "properties": {
                    "display_aquifer_id": display_id,
                    "display_name": display_name,
                    "short_name": _short_name(display_name),
                    "region_label": state_label,
                    "geometry_version": DISPLAY_AQUIFER_VERSION,
                    "source_dataset": GEOMETRY_SOURCE_LABEL,
                    "source_scale_note": GEOMETRY_SCALE_NOTE,
                    "is_simplified": False,
                    "topology_valid": True,
                    "bbox": bbox,
                    "feature_area_sqkm": feature_area_sqkm,
                    "display_zoom_min": 2,
                    "display_zoom_max": 7,
                },
                "geometry": raw_geometry,
            }
        )

        categories = []
        for category_key, (category_label, _) in CATEGORY_COLUMNS.items():
            category_value = _round_number(category_totals.get(category_key, 0.0))
            categories.append(
                {
                    "display_aquifer_id": display_id,
                    "year": 2015,
                    "category_key": category_key,
                    "category_label": category_label,
                    "value": category_value,
                    "units": "Mgal/d",
                    "share_of_total": round(category_value / total if total else 0.0, 4),
                    "confidence_grade": "A",
                    "source_type": "direct_source_aggregate",
                    "methodology_key": "aggregate_usgs_2015_category_totals_v1",
                }
            )

        caveats = [
            "Geometry is shown for national and regional visualization only; it does not represent full underground extent.",
            "V1 defines the display layer as the 30 highest-withdrawal aquifer systems from the 2015 USGS release that map cleanly to principal-aquifer geometry.",
            "Industry subtype estimates are intentionally withheld in this release until proxy recipes are documented and validated.",
        ]
        if source_name != display_name:
            caveats.append(
                f"The source withdrawal label '{source_name}' is mapped to the geometry label '{display_name}' in the display crosswalk."
            )

        records.append(
            {
                "display_aquifer_id": display_id,
                "year": 2015,
                "total_withdrawal": {
                    "value": _round_number(total),
                    "units": "Mgal/d",
                    "is_estimate": True,
                    "confidence_grade": "A",
                    "source_type": "direct_source_aggregate",
                    "methodology_key": "aggregate_usgs_2015_county_aquifer_rows_v1",
                    "methodology_version": METHODOLOGY_VERSION,
                    "notes": (
                        "Aggregated from county-level principal-aquifer rows in the 2015 USGS release. "
                        "These are authoritative published estimates, not measured well-by-well withdrawals."
                    ),
                },
                "categories": categories,
                "industry_estimates": [],
                "provenance_source_ids": [
                    "usgs_county_aquifer_withdrawals_2015",
                    "usgs_principal_aquifers_geometry",
                ],
                "methodology_summary": (
                    f"Totals aggregate all 2015 USGS county rows assigned to the {display_name} through the "
                    "display-aquifer crosswalk. Categories come directly from the published broad water-use fields. "
                    "Industry subtype estimates remain scaffolded but unpublished in v1."
                ),
                "caveats": caveats,
            }
        )

    collection = {
        "version": DISPLAY_AQUIFER_VERSION,
        "generated_at": generated_at,
        "methodology_version": METHODOLOGY_VERSION,
        "build_status": "ready",
        "aquifers": aquifers,
    }
    geometry = {
        "type": "FeatureCollection",
        "features": features,
    }
    geometry_qa = {
        "type": "FeatureCollection",
        "features": qa_features,
    }
    withdrawals = {
        "version": DISPLAY_AQUIFER_VERSION,
        "generated_at": generated_at,
        "methodology_version": METHODOLOGY_VERSION,
        "build_status": "ready",
        "records": records,
    }
    industry_estimates = {
        "version": DISPLAY_AQUIFER_VERSION,
        "generated_at": generated_at,
        "methodology_version": METHODOLOGY_VERSION,
        "build_status": "ready",
        "records": [],
    }
    return collection, geometry, geometry_qa, withdrawals, industry_estimates


def _write_provenance(generated_at: str, citation: str) -> None:
    provenance = {
        "version": DISPLAY_AQUIFER_VERSION,
        "generated_at": generated_at,
        "sources": [
            {
                "source_id": "usgs_principal_aquifers_geometry",
                "title": "Principal Aquifers of the 48 Conterminous United States, Hawaii, Puerto Rico, and the U.S. Virgin Islands",
                "publisher": "U.S. Geological Survey",
                "year": 2022,
                "dataset_or_report": "ScienceBase data release",
                "doi_or_identifier": "ScienceBase item 63140610d34e36012efa385d",
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": GEOMETRY_SCALE_NOTE,
            },
            {
                "source_id": "usgs_county_aquifer_withdrawals_2015",
                "title": "Estimated Groundwater Withdrawals from Principal Aquifers in the United States - County-Level Data for 2015",
                "publisher": "U.S. Geological Survey",
                "year": 2020,
                "dataset_or_report": "ScienceBase data release",
                "doi_or_identifier": "https://doi.org/10.5066/P9EI0KMR",
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": citation,
            },
            {
                "source_id": "usgs_withdrawals_data_dictionary",
                "title": "County-aquifer withdrawals data dictionary",
                "publisher": "U.S. Geological Survey",
                "year": 2020,
                "dataset_or_report": "ScienceBase attachment",
                "doi_or_identifier": str(DATA_DICTIONARY_PATH.name),
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": "Field definitions for the 2015 county-aquifer withdrawals release.",
            },
            {
                "source_id": "usgs_withdrawals_method_codes",
                "title": "County-aquifer withdrawals method codes",
                "publisher": "U.S. Geological Survey",
                "year": 2020,
                "dataset_or_report": "ScienceBase attachment",
                "doi_or_identifier": str(Path("method_codes.csv")),
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": "Method-code definitions for the 2015 county-aquifer withdrawals release.",
            },
        ],
    }
    _write_json(PROVENANCE_PATH, provenance)


def _write_pending_placeholders(generated_at: str) -> None:
    _write_json(
        DISPLAY_COLLECTION_PATH,
        {
            "version": DISPLAY_AQUIFER_VERSION,
            "generated_at": generated_at,
            "methodology_version": METHODOLOGY_VERSION,
            "build_status": "pending_source_ingest",
            "aquifers": [],
        },
    )
    _write_json(DISPLAY_GEOMETRY_PATH, {"type": "FeatureCollection", "features": []})
    _write_json(
        WITHDRAWALS_PATH,
        {
            "version": DISPLAY_AQUIFER_VERSION,
            "generated_at": generated_at,
            "methodology_version": METHODOLOGY_VERSION,
            "build_status": "pending_source_ingest",
            "records": [],
        },
    )
    _write_json(
        INDUSTRY_ESTIMATES_PATH,
        {
            "version": DISPLAY_AQUIFER_VERSION,
            "generated_at": generated_at,
            "methodology_version": METHODOLOGY_VERSION,
            "build_status": "pending_source_ingest",
            "records": [],
        },
    )


def main() -> None:
    DERIVED_DIR.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat()

    if not _source_files_present():
        _write_pending_placeholders(generated_at)
        print("Source ingest is still pending. Placeholder derived files were refreshed.")
        print("Expected source files:")
        for source_path in EXPECTED_SOURCE_FILES:
            print(f" - {source_path}")
        return

    citation, withdrawal_data = _load_withdrawal_rows()
    geometry_records, geometry_by_normalized_name = _load_geometry_records()
    selected_systems = _select_display_systems(withdrawal_data, geometry_by_normalized_name)
    if len(selected_systems) != 30:
        raise SystemExit(f"Expected 30 display systems, found {len(selected_systems)}")

    _write_crosswalk(selected_systems, withdrawal_data["codes"])
    collection, geometry, geometry_qa, withdrawals, industry_estimates = _build_outputs(
        selected_systems,
        withdrawal_data,
        geometry_records,
        generated_at,
    )

    _write_json(DISPLAY_COLLECTION_PATH, collection)
    _write_json(DISPLAY_GEOMETRY_PATH, geometry, pretty=False)
    _write_json(DISPLAY_GEOMETRY_QA_PATH, geometry_qa, pretty=False)
    _write_json(WITHDRAWALS_PATH, withdrawals)
    _write_json(INDUSTRY_ESTIMATES_PATH, industry_estimates)
    _write_provenance(generated_at, citation)

    print(
        f"Generated {len(collection['aquifers'])} display aquifers, "
        f"{len(geometry['features'])} geometry features, and {len(withdrawals['records'])} metric records."
    )


if __name__ == "__main__":
    main()
