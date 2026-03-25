import csv
import json
import math
import os
import re
import tempfile
import warnings
import zipfile
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

import geopandas as gpd
import shapefile
import rasterio
from rasterio.mask import mask
from rasterio.warp import transform, transform_geom
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform as shapely_transform

from etl.config.constants import (
    CATEGORY_COLUMNS,
    COUNTY_BOUNDARY_SOURCE_PATH,
    CROSSWALK_PATH,
    DATA_DICTIONARY_PATH,
    DERIVED_DIR,
    DISPLAY_AQUIFER_TARGET_COUNT,
    DISPLAY_AQUIFER_VERSION,
    DISPLAY_COLLECTION_PATH,
    DISPLAY_GEOMETRY_PATH,
    DISPLAY_GEOMETRY_QA_PATH,
    EXCLUDED_SOURCE_CODES,
    EXPECTED_SOURCE_FILES,
    GEOMETRY_SOURCE_PATH,
    GLHYMPS_DIRECT_DOWNLOAD_URL,
    GLHYMPS_LAYER_NAME,
    GLHYMPS_SOURCE_PATH,
    INDUSTRY_ESTIMATES_PATH,
    MAX_ACCESSIBLE_GROUNDWATER_DEPTH_METERS,
    METHOD_CODES_PATH,
    METHODOLOGY_VERSION,
    RECHARGE_SOURCE_PATH,
    NON_MAINLAND_EXCLUDED_SOURCE_CODES,
    PROVENANCE_PATH,
    RESIDUAL_EXCLUDED_SOURCE_CODES,
    STORAGE_SAMPLE_POINT_TARGET,
    STORAGE_WTD_SOURCE_URL,
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
COUNTY_BOUNDARY_SOURCE_LABEL = "2015 Census cartographic county boundaries (5m)"
COUNTY_BOUNDARY_SCALE_NOTE = (
    "County-footprint fallback geometry is for national visualization only. It shows the counties carrying "
    "withdrawal rows for a source aquifer when the USGS principal-aquifer shapefile does not expose a standalone polygon."
)
RECHARGE_SOURCE_LABEL = (
    "USGS estimated mean annual natural groundwater recharge grid for the conterminous United States "
    "(ScienceBase item 63140610d34e36012efa3838)"
)
RECHARGE_NOTES = (
    "Recharge values come from the USGS 1-kilometer mean annual natural groundwater recharge raster. "
    "The grid reflects broad long-term regional patterns for the conterminous United States, not site-scale conditions."
)
RECHARGE_METHOD_KEY = "overlay_usgs_recharge_grid_on_display_aquifer_v1"
STORAGE_WTD_SOURCE_LABEL = (
    "Ma et al. 2026 modeled conterminous-U.S. mean water-table depth raster "
    "(Princeton HydroFrame public COG viewer endpoint)"
)
STORAGE_POROSITY_SOURCE_LABEL = (
    "GLHYMPS 2.0 global hydrogeology map porosity polygons "
    "(Borealis datafile 72026)"
)
STORAGE_NOTES = (
    "Storage values are modeled estimates, not direct USGS aquifer-storage totals. They combine the 2026 Princeton "
    "mean water-table depth surface with sampled GLHYMPS porosity values and assume a 392-meter accessible "
    "groundwater column for national comparison."
)
STORAGE_METHOD_KEY = "sampled_ma2026_wtd_glhymps_porosity_accessible_storage_v1"
OFFICIAL_GEOMETRY_METHOD = "usgs_principal_aquifer_polygon"
COUNTY_FOOTPRINT_METHOD = "county_footprint_fallback"
RESIDUAL_EXCLUDED_DISPLAY_ID = "excluded_other_aquifers_bucket"
NON_MAINLAND_EXCLUDED_DISPLAY_ID = "excluded_non_mainland_scope"

SOURCE_NAME_OVERRIDES = {
    "N400BISCYN": "Biscayne aquifer",
    "S100SURFCL": "Surficial aquifer system",
    "S400FLORDN": "Floridan aquifer system",
    "N400KNGSHL": "Kingshill aquifer (Virgin Islands)",
    "N400NCSTLM": "North Coast Limestone aquifer system (Puerto Rico)",
    "N300STHCST": "South Coast aquifer (Puerto Rico)",
    "N100PCFNWV": "Pacific Northwest volcanic-rock aquifers",
    "N600HIVLCC": "Hawaii volcanic-rock aquifers",
}

GEOMETRY_NAME_OVERRIDES = {
    "pacific northwest volcanic-rock aquifer": "Pacific Northwest basaltic-rock aquifers",
    "kingshill aquifer virgin islands": "Kingshill aquifer",
    "north coast limestone aquifer system puerto rico": "Puerto Rico North Coast Limestone aquifer system",
    "south coast aquifer puerto rico": "Puerto Rico south coast aquifer",
    "hawaii volcanic-rock aquifer": "Hawaiian Volcanic-rock aquifers",
}

COUNTY_PREFIX_PATTERN = re.compile(
    r"^(.*?(?:County|Parish|Borough|Census Area|Municipio|Municipality|District))-(.+)$",
    flags=re.IGNORECASE,
)

LONLAT_TO_EQUAL_AREA = Transformer.from_crs("EPSG:4326", "ESRI:54034", always_xy=True)
EQUAL_AREA_TO_LONLAT = Transformer.from_crs("ESRI:54034", "EPSG:4326", always_xy=True)


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


def _normalize_name(value: str) -> str:
    normalized = value.lower()
    normalized = normalized.replace("&", "and")
    normalized = re.sub(r"[(),.]", "", normalized)
    normalized = normalized.replace("systems", "system").replace("aquifers", "aquifer")
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


def _signed_round(value: float) -> float:
    return round(value, 2)


def _recharge_label(balance_index: float) -> str:
    if balance_index >= 1:
        return "Withdrawals far exceed recharge"
    if balance_index >= 0.25:
        return "Withdrawals exceed recharge"
    if balance_index >= -0.25:
        return "Withdrawals sit near recharge balance"
    if balance_index >= -0.75:
        return "Recharge exceeds withdrawals"
    return "Recharge strongly exceeds withdrawals"


def _format_percentage_sentence(value: float) -> str:
    percentage = value * 100
    if abs(percentage) >= 10:
        return f"{round(percentage)} percent"
    if abs(percentage) >= 1:
        return f"{round(percentage, 1)} percent"
    return f"{round(percentage, 2)} percent"


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


def _perpendicular_distance(point: list[float], start: list[float], end: list[float]) -> float:
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


def _simplify_geometry(geometry: dict[str, Any], tolerance: float) -> dict[str, Any]:
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


def _calculate_recharge_stats(
    raster: rasterio.io.DatasetReader,
    geometry: dict[str, Any],
) -> dict[str, float]:
    projected_geometry = transform_geom("EPSG:4326", raster.crs, geometry)
    data, _ = mask(raster, [projected_geometry], crop=True, filled=False)
    valid_cells = data[0].compressed()
    if not valid_cells.size:
        raise SystemExit("Recharge raster overlay produced no valid cells for a displayed aquifer")

    cell_area_sq_m = abs(raster.transform.a * raster.transform.e)
    mm_to_mgal_per_day = (
        cell_area_sq_m * 0.001 * 264.1720523581484 / 1_000_000 / 365.25
    )
    total_recharge_mgald = float(valid_cells.sum()) * mm_to_mgal_per_day
    mean_recharge_mm_per_year = float(valid_cells.mean())

    return {
        "cell_count": int(valid_cells.size),
        "mean_recharge_mm_per_year": round(mean_recharge_mm_per_year, 2),
        "total_recharge_mgald": round(total_recharge_mgald, 2),
    }


def _mgald_to_cubic_km_per_year(value: float) -> float:
    return value * 365.25 * 3_785.411784 / 1_000_000_000


def _resolve_glhymps_source() -> Path:
    env_path = os.environ.get("AQUIFER_GLHYMPS_SOURCE")
    candidates = [
        Path(env_path).expanduser() if env_path else None,
        GLHYMPS_SOURCE_PATH,
        GLHYMPS_SOURCE_PATH.with_suffix(".gdb"),
        GLHYMPS_SOURCE_PATH.parent / "GLHYMPS" / "GLHYMPS.gdb",
        Path("/tmp/GLHYMPS/GLHYMPS/GLHYMPS.gdb"),
        Path("/tmp/GLHYMPS.zip"),
    ]

    seen: set[str] = set()
    for candidate in candidates:
        if candidate is None:
            continue
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if candidate.exists():
            return candidate

    raise SystemExit(
        "GLHYMPS porosity source not found. Set AQUIFER_GLHYMPS_SOURCE or place GLHYMPS.zip / "
        "GLHYMPS.gdb under data/source or /tmp."
    )


@contextmanager
def _open_glhymps_geodatabase() -> Iterator[Path]:
    source_path = _resolve_glhymps_source()

    if source_path.is_file() and source_path.suffix.lower() == ".zip":
        with tempfile.TemporaryDirectory() as tmp_dir:
            with zipfile.ZipFile(source_path) as archive:
                archive.extractall(tmp_dir)
            geodatabases = sorted(Path(tmp_dir).rglob("*.gdb"))
            if not geodatabases:
                raise SystemExit("GLHYMPS zip did not contain a geodatabase")
            yield geodatabases[0]
        return

    if source_path.is_dir() and source_path.name.endswith(".gdb"):
        yield source_path
        return

    if source_path.is_dir():
        geodatabases = sorted(source_path.rglob("*.gdb"))
        if geodatabases:
            yield geodatabases[0]
            return

    raise SystemExit(f"Unsupported GLHYMPS source path: {source_path}")


def _build_storage_sample_plan(geometry: dict[str, Any]) -> dict[str, Any]:
    equal_area_geometry = shapely_transform(LONLAT_TO_EQUAL_AREA.transform, shape(geometry))
    if not equal_area_geometry.is_valid:
        equal_area_geometry = equal_area_geometry.buffer(0)
    if equal_area_geometry.is_empty:
        raise SystemExit("Storage sampling received an empty projected geometry")
    area_sq_m = float(equal_area_geometry.area)
    minx, miny, maxx, maxy = equal_area_geometry.bounds
    spacing = math.sqrt(max(area_sq_m, 1.0) / STORAGE_SAMPLE_POINT_TARGET)

    points_equal_area: list[Point] = []
    y = miny + (spacing / 2)
    while y <= maxy and len(points_equal_area) < STORAGE_SAMPLE_POINT_TARGET * 3:
        x = minx + (spacing / 2)
        while x <= maxx and len(points_equal_area) < STORAGE_SAMPLE_POINT_TARGET * 3:
            point = Point(x, y)
            if equal_area_geometry.covers(point):
                points_equal_area.append(point)
            x += spacing
        y += spacing

    if not points_equal_area:
        points_equal_area = [equal_area_geometry.representative_point()]

    if len(points_equal_area) > STORAGE_SAMPLE_POINT_TARGET:
        points_equal_area = points_equal_area[:STORAGE_SAMPLE_POINT_TARGET]

    points_lonlat = [
        EQUAL_AREA_TO_LONLAT.transform(point.x, point.y)
        for point in points_equal_area
    ]

    return {
        "area_sq_m": area_sq_m,
        "bbox_equal_area": (minx, miny, maxx, maxy),
        "points_equal_area": points_equal_area,
        "points_lonlat": points_lonlat,
    }


def _sample_porosity_stats(
    glhymps_geodatabase: Path,
    sample_points_equal_area: list[Point],
    bbox_equal_area: tuple[float, float, float, float],
) -> dict[str, float]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        porosity_polygons = gpd.read_file(
            glhymps_geodatabase,
            layer=GLHYMPS_LAYER_NAME,
            bbox=bbox_equal_area,
            engine="pyogrio",
        )[["Porosity", "geometry"]]

    if porosity_polygons.empty:
        raise SystemExit("GLHYMPS porosity lookup returned no polygons for a displayed aquifer")

    sample_gdf = gpd.GeoDataFrame(
        {"geometry": sample_points_equal_area},
        crs="ESRI:54034",
    )
    joined = gpd.sjoin(sample_gdf, porosity_polygons, how="left", predicate="within")
    porosity_values = joined["Porosity"].dropna()
    if porosity_values.empty:
        raise SystemExit("GLHYMPS porosity lookup returned no valid sampled values for a displayed aquifer")

    return {
        "sample_count": float(len(sample_points_equal_area)),
        "coverage_fraction": round(float(joined["Porosity"].notna().mean()), 3),
        "mean_porosity": round(float(porosity_values.mean()), 4),
    }


def _calculate_storage_stats(
    water_table_raster: rasterio.io.DatasetReader,
    geometry: dict[str, Any],
    glhymps_geodatabase: Path,
) -> dict[str, float]:
    sample_plan = _build_storage_sample_plan(geometry)
    porosity_stats = _sample_porosity_stats(
        glhymps_geodatabase,
        sample_plan["points_equal_area"],
        sample_plan["bbox_equal_area"],
    )

    longitudes = [point[0] for point in sample_plan["points_lonlat"]]
    latitudes = [point[1] for point in sample_plan["points_lonlat"]]
    xs, ys = transform("EPSG:4326", water_table_raster.crs, longitudes, latitudes)
    sampled_values = [
        float(value[0]) for value in water_table_raster.sample(list(zip(xs, ys)))
    ]
    valid_values = [
        value
        for value in sampled_values
        if math.isfinite(value)
        and value < 1e20
        and (water_table_raster.nodata is None or value != float(water_table_raster.nodata))
    ]
    if not valid_values:
        raise SystemExit("Water-table raster lookup returned no valid sampled values for a displayed aquifer")

    saturated_thicknesses = [
        max(MAX_ACCESSIBLE_GROUNDWATER_DEPTH_METERS - value, 0.0)
        for value in valid_values
    ]
    mean_water_table_depth_m = sum(valid_values) / len(valid_values)
    mean_saturated_thickness_m = sum(saturated_thicknesses) / len(saturated_thicknesses)
    remaining_fraction = mean_saturated_thickness_m / MAX_ACCESSIBLE_GROUNDWATER_DEPTH_METERS
    modeled_storage_km3 = (
        sample_plan["area_sq_m"]
        * mean_saturated_thickness_m
        * porosity_stats["mean_porosity"]
        / 1_000_000_000
    )
    if modeled_storage_km3 <= 0:
        raise SystemExit("Storage model produced a nonpositive value for a displayed aquifer")

    return {
        "sample_count": len(valid_values),
        "porosity_coverage_fraction": porosity_stats["coverage_fraction"],
        "mean_porosity": round(porosity_stats["mean_porosity"], 4),
        "mean_water_table_depth_m": round(mean_water_table_depth_m, 2),
        "mean_saturated_thickness_m": round(mean_saturated_thickness_m, 2),
        "remaining_fraction": round(remaining_fraction, 4),
        "modeled_storage_km3": round(modeled_storage_km3, 2),
    }


def _common_suffix(token_lists: list[list[str]]) -> list[str]:
    if not token_lists:
        return []
    reversed_lists = [list(reversed(tokens)) for tokens in token_lists if tokens]
    suffix: list[str] = []
    for tokens in zip(*reversed_lists):
        if len(set(tokens)) != 1:
            break
        suffix.append(tokens[0])
    return list(reversed(suffix))


def _derive_source_name(code: str, token_lists: list[list[str]]) -> str:
    if code in SOURCE_NAME_OVERRIDES:
        return SOURCE_NAME_OVERRIDES[code]

    suffix = _common_suffix(token_lists)
    label = "-".join(suffix).strip() if suffix else "-".join(token_lists[0]).strip()
    prefix_match = COUNTY_PREFIX_PATTERN.match(label)
    if prefix_match:
        return prefix_match.group(2).strip()
    return label


def _load_withdrawal_rows() -> tuple[str, dict[str, dict[str, Any]]]:
    citation = ""
    by_code: defaultdict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "total": 0.0,
            "states": defaultdict(float),
            "categories": defaultdict(float),
            "counties": set(),
            "name_tokens": [],
        }
    )

    with WITHDRAWALS_SOURCE_PATH.open(newline="", encoding="cp1252") as handle:
        reader = csv.reader(handle)
        citation = next(reader)[0]
        header = next(reader)

        for row in reader:
            record = dict(zip(header, row))
            state_fips, county_fips, source_code = record["CountyAquifer"].split("-")
            county_geoid = f"{state_fips.zfill(2)}{county_fips.zfill(3)}"
            total_value = record.get("TO-WGWTo", "--")
            total = 0.0 if total_value in ("--", "") else float(total_value)

            payload = by_code[source_code]
            payload["total"] += total
            payload["states"][record["State"]] += total
            payload["counties"].add(county_geoid)
            payload["name_tokens"].append(record["CountyAquifer Name"].split("-")[1:])

            for category_key, (_, column_name) in CATEGORY_COLUMNS.items():
                value = record.get(column_name, "--")
                if value not in ("--", ""):
                    payload["categories"][category_key] += float(value)

    finalized: dict[str, dict[str, Any]] = {}
    for source_code, payload in by_code.items():
        source_name = _derive_source_name(source_code, payload["name_tokens"])
        finalized[source_code] = {
            "source_aquifer_code": source_code,
            "source_aquifer_name": source_name,
            "total": payload["total"],
            "states": dict(payload["states"]),
            "categories": dict(payload["categories"]),
            "counties": sorted(payload["counties"]),
        }

    return citation, finalized


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


def _load_county_records() -> dict[str, Any]:
    county_records: dict[str, Any] = {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        with zipfile.ZipFile(COUNTY_BOUNDARY_SOURCE_PATH) as archive:
            archive.extractall(tmp_dir)
        reader = shapefile.Reader(str(Path(tmp_dir) / "cb_2015_us_county_5m.shp"))
        for shape_record in reader.iterShapeRecords():
            county_records[shape_record.record["GEOID"]] = shape_record

    return county_records


def _resolve_geometry_name(
    source_name: str, geometry_by_normalized_name: dict[str, str]
) -> Optional[str]:
    normalized_name = _normalize_name(source_name)
    override_name = GEOMETRY_NAME_OVERRIDES.get(normalized_name)
    if override_name:
        return override_name
    return geometry_by_normalized_name.get(normalized_name)


def _select_display_systems(
    withdrawal_data: dict[str, dict[str, Any]],
    geometry_by_normalized_name: dict[str, str],
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    used_display_ids: set[str] = set()

    for source_code, payload in sorted(
        withdrawal_data.items(), key=lambda item: item[1]["total"], reverse=True
    ):
        if source_code in EXCLUDED_SOURCE_CODES:
            continue

        source_name = payload["source_aquifer_name"]
        geometry_name = _resolve_geometry_name(source_name, geometry_by_normalized_name)
        display_name = geometry_name or source_name
        display_id = _slugify(display_name)
        if display_id in used_display_ids:
            display_id = f"{display_id}_{source_code.lower()}"
        used_display_ids.add(display_id)

        selected.append(
            {
                "display_aquifer_id": display_id,
                "display_name": display_name,
                "source_aquifer_code": source_code,
                "source_name": source_name,
                "geometry_name": geometry_name,
                "geometry_method": (
                    OFFICIAL_GEOMETRY_METHOD if geometry_name else COUNTY_FOOTPRINT_METHOD
                ),
            }
        )

    return selected


def _write_crosswalk(
    selected_systems: list[dict[str, Any]],
    withdrawal_data: dict[str, dict[str, Any]],
) -> None:
    selected_lookup = {
        item["source_aquifer_code"]: item for item in selected_systems
    }
    rows: list[list[str]] = []

    for source_code in sorted(withdrawal_data):
        payload = withdrawal_data[source_code]
        selection = selected_lookup.get(source_code)

        if selection:
            note_parts: list[str] = []
            reviewer_note = ""

            if selection["source_name"] != selection["display_name"]:
                note_parts.append(
                    f"Mapped source label '{selection['source_name']}' to display geometry label "
                    f"'{selection['display_name']}'."
                )
                reviewer_note = "Display label normalized to the published geometry label."

            if selection["geometry_method"] == COUNTY_FOOTPRINT_METHOD:
                note_parts.append(
                    "No standalone polygon was available in the USGS principal-aquifer shapefile, so the "
                    "display layer uses a county-footprint fallback built from 2015 county boundaries carrying "
                    "withdrawal rows for this source aquifer."
                )
                reviewer_note = "Review county-footprint fallback before any local-scale interpretation."

            rows.append(
                [
                    source_code,
                    payload["source_aquifer_name"],
                    selection["display_aquifer_id"],
                    "1.0",
                    selection["geometry_method"],
                    " ".join(note_parts),
                    reviewer_note,
                ]
            )
            continue

        rows.append(
            [
                source_code,
                payload["source_aquifer_name"],
                (
                    NON_MAINLAND_EXCLUDED_DISPLAY_ID
                    if source_code in NON_MAINLAND_EXCLUDED_SOURCE_CODES
                    else RESIDUAL_EXCLUDED_DISPLAY_ID
                ),
                "1.0",
                (
                    "excluded_non_mainland_public_scope"
                    if source_code in NON_MAINLAND_EXCLUDED_SOURCE_CODES
                    else "excluded_other_aquifers_residual_bucket"
                ),
                (
                    "Excluded from the public conterminous-U.S. view because this aquifer sits outside the recharge study area used in the stress map."
                    if source_code in NON_MAINLAND_EXCLUDED_SOURCE_CODES
                    else "Residual 'Other aquifers' rows remain excluded from the public map because they do not identify a single principal aquifer."
                ),
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
    withdrawal_data: dict[str, dict[str, Any]],
    geometry_records: dict[str, list[Any]],
    county_records: dict[str, Any],
    generated_at: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    aquifers: list[dict[str, Any]] = []
    features: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    qa_features: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory() as recharge_tmp_dir, _open_glhymps_geodatabase() as glhymps_geodatabase:
        with zipfile.ZipFile(RECHARGE_SOURCE_PATH) as archive:
            archive.extractall(recharge_tmp_dir)

        with rasterio.open(str(Path(recharge_tmp_dir) / "rech48grd")) as recharge_raster, rasterio.open(
            STORAGE_WTD_SOURCE_URL
        ) as storage_wtd_raster:
            for sort_order, item in enumerate(selected_systems, start=1):
                source_code = item["source_aquifer_code"]
                payload = withdrawal_data[source_code]
                source_name = item["source_name"]
                display_name = item["display_name"]
                display_id = item["display_aquifer_id"]
                total = payload["total"]
                state_totals = dict(payload["states"])
                category_totals = {key: payload["categories"].get(key, 0.0) for key in CATEGORY_COLUMNS}
                dominant_category_key, dominant_category_total = max(
                    category_totals.items(), key=lambda pair: pair[1]
                )
                dominant_category_label = CATEGORY_COLUMNS[dominant_category_key][0]
                dominant_share = dominant_category_total / total if total else 0.0
                state_label = _state_label(state_totals)
                state_sentence = _state_sentence(state_totals)
                county_count = len(payload["counties"])

                if item["geometry_method"] == OFFICIAL_GEOMETRY_METHOD:
                    raw_geometry = _combine_shape_records(geometry_records[item["geometry_name"]])
                    simplified_geometry = _simplify_geometry(raw_geometry, tolerance=0.025)
                    geometry_source = GEOMETRY_SOURCE_LABEL
                    geometry_note = (
                        "USGS principal aquifer geometry shown for national-scale display only. It represents the "
                        "shallowest principal aquifer extent and not the full underground system."
                    )
                    geometry_scale_note = GEOMETRY_SCALE_NOTE
                    geometry_source_ids = ["usgs_principal_aquifers_geometry"]
                else:
                    missing_counties = [geoid for geoid in payload["counties"] if geoid not in county_records]
                    if missing_counties:
                        raise SystemExit(
                            f"County-footprint fallback missing county geometry for {source_code}: {missing_counties[:6]}"
                        )
                    raw_geometry = _combine_shape_records(
                        [county_records[geoid] for geoid in payload["counties"]]
                    )
                    simplified_geometry = _simplify_geometry(raw_geometry, tolerance=0.08)
                    geometry_source = COUNTY_BOUNDARY_SOURCE_LABEL
                    geometry_note = (
                        f"County-footprint fallback shown for national display only. The USGS principal-aquifer "
                        f"shapefile does not expose a standalone polygon for this source aquifer, so the map uses the "
                        f"{county_count} counties that carry 2015 withdrawal rows instead."
                    )
                    geometry_scale_note = COUNTY_BOUNDARY_SCALE_NOTE
                    geometry_source_ids = ["census_cartographic_county_boundaries_2015"]

                recharge_stats = _calculate_recharge_stats(recharge_raster, raw_geometry)
                total_recharge = recharge_stats["total_recharge_mgald"]
                if total_recharge <= 0:
                    raise SystemExit(f"Recharge overlay produced a nonpositive value for {display_name}")
                storage_stats = _calculate_storage_stats(
                    storage_wtd_raster,
                    raw_geometry,
                    glhymps_geodatabase,
                )

                net_withdrawal_minus_recharge = total - total_recharge
                withdrawal_to_recharge_ratio = total / total_recharge
                balance_index = net_withdrawal_minus_recharge / total_recharge
                recharge_label = _recharge_label(balance_index)
                annual_withdrawal_share_of_storage = (
                    _mgald_to_cubic_km_per_year(total) / storage_stats["modeled_storage_km3"]
                )
                annual_net_balance_share_of_storage = (
                    _mgald_to_cubic_km_per_year(net_withdrawal_minus_recharge)
                    / storage_stats["modeled_storage_km3"]
                )

                bbox = _bbox_of_coordinates(raw_geometry["coordinates"])
                feature_area_sqkm = round(_geometry_area_sqkm(raw_geometry), 2)

                description_short = (
                    f"A principal aquifer where {dominant_category_label.lower()} drives most withdrawals across "
                    f"{state_sentence}. Modeled storage sampling suggests about "
                    f"{round(storage_stats['remaining_fraction'] * 100)} percent of the 392-meter accessible "
                    f"groundwater column remains saturated over the mapped footprint."
                )
                if item["geometry_method"] == COUNTY_FOOTPRINT_METHOD:
                    description_short += " The map uses a county-footprint fallback for display."

                balance_sentence = (
                    f"That leaves withdrawals about {_round_number(net_withdrawal_minus_recharge)} Mgal/d above "
                    "the long-term estimated natural recharge over the mapped footprint."
                    if net_withdrawal_minus_recharge >= 0
                    else f"That leaves estimated natural recharge about {_round_number(abs(net_withdrawal_minus_recharge))} Mgal/d "
                    "above withdrawals over the mapped footprint."
                )
                storage_sentence = (
                    f"Sampled storage modeling suggests about {round(storage_stats['remaining_fraction'] * 100)} percent "
                    f"of the 392-meter accessible groundwater column remains saturated, with annual withdrawals equal to "
                    f"about {_format_percentage_sentence(annual_withdrawal_share_of_storage)} of modeled current storage."
                )
                description_long = (
                    f"In 2015, the USGS estimated about {_round_number(total)} Mgal/d of groundwater withdrawals "
                    f"associated with the {display_name}. {dominant_category_label} accounted for about "
                    f"{round(dominant_share * 100)} percent of the total, with the largest shares concentrated in {state_sentence}. "
                    f"Overlaying the mapped aquifer footprint with the USGS mean annual natural recharge grid suggests "
                    f"about {_round_number(total_recharge)} Mgal/d of long-term natural recharge. {balance_sentence} "
                    f"{storage_sentence}"
                )
                if item["geometry_method"] == COUNTY_FOOTPRINT_METHOD:
                    description_long += (
                        f" Because the official principal-aquifer shapefile does not expose a standalone polygon for "
                        f"this aquifer, the map footprint shows the set of {county_count} counties attached to source rows."
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
                        "geometry_source": geometry_source,
                        "geometry_notes": geometry_note,
                        "source_aquifer_codes": [source_code],
                        "is_grouped_system": False,
                        "default_year": 2015,
                        "default_units": "Mgal/d",
                        "methodology_version": METHODOLOGY_VERSION,
                        "status": "active",
                        "confidence_summary": "A-C",
                    }
                )

                feature_properties = {
                    "display_aquifer_id": display_id,
                    "display_name": display_name,
                    "short_name": _short_name(display_name),
                    "region_label": state_label,
                    "geometry_version": DISPLAY_AQUIFER_VERSION,
                    "source_dataset": geometry_source,
                    "source_scale_note": geometry_scale_note,
                    "is_simplified": True,
                    "topology_valid": True,
                    "bbox": bbox,
                    "feature_area_sqkm": feature_area_sqkm,
                    "display_zoom_min": 2,
                    "display_zoom_max": 7,
                    "geometry_method": item["geometry_method"],
                    "county_footprint_count": county_count if item["geometry_method"] == COUNTY_FOOTPRINT_METHOD else None,
                }
                features.append(
                    {
                        "type": "Feature",
                        "properties": feature_properties,
                        "geometry": simplified_geometry,
                    }
                )
                qa_features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            **feature_properties,
                            "is_simplified": False,
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
                    "Broad sector totals come directly from the published 2015 USGS county-aquifer release.",
                    "Recharge-based stress values come from overlaying a USGS 1-kilometer long-term natural recharge raster on the mapped aquifer footprint.",
                    "Modeled storage values come from sampled water-table depth and sampled porosity, not from published aquifer-specific USGS storage totals.",
                    "The public percentage now reflects the modeled share of a 392-meter accessible groundwater column that remains saturated, not the share of original predevelopment storage remaining.",
                    "The storage-based pressure metric compares annual withdrawal or annual net balance to modeled current storage, which is a heuristic national comparison rather than a direct USGS depletion rate.",
                    "The recharge source reflects long-term mean natural recharge patterns, not current annual recharge or site-specific conditions.",
                    "Geometry is shown for national and regional visualization only; it does not represent the full underground extent of an aquifer.",
                    "Industry subtype estimates remain scaffolded but unpublished in this build to avoid false precision.",
                ]
                if source_name != display_name:
                    caveats.append(
                        f"The source withdrawal label '{source_name}' is mapped to the published display label '{display_name}'."
                    )
                if item["geometry_method"] == COUNTY_FOOTPRINT_METHOD:
                    caveats.append(
                        f"The map footprint is a fallback built from {county_count} counties with 2015 source rows because no standalone USGS polygon is published for this aquifer."
                    )

                methodology_summary = (
                    f"Totals aggregate all 2015 USGS county rows assigned to the {source_name}. Broad categories come "
                    f"directly from the published water-use fields. Recharge-based stress overlays the USGS 1-kilometer "
                    f"mean annual natural groundwater recharge grid on the mapped aquifer footprint and compares that "
                    f"long-term recharge volume to 2015 withdrawals using the balance metric (withdrawals - recharge) / recharge. "
                    f"Storage estimates sample the 2026 Princeton mean water-table depth raster and GLHYMPS porosity polygons "
                    f"across the mapped aquifer footprint, then estimate modeled current groundwater storage as mean saturated "
                    f"thickness times mean porosity across a 392-meter accessible groundwater column."
                )
                if item["geometry_method"] == OFFICIAL_GEOMETRY_METHOD:
                    methodology_summary += " The display geometry uses the published USGS principal-aquifer polygon."
                else:
                    methodology_summary += (
                        " The display geometry uses a county-footprint fallback built from 2015 Census cartographic "
                        "county boundaries because the official aquifer polygon is unavailable."
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
                        "storage_metrics": {
                            "modeled_current_storage": {
                                "value": storage_stats["modeled_storage_km3"],
                                "units": "km3",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    "Modeled current groundwater storage estimated from sampled mean saturated thickness "
                                    f"and sampled mean porosity over a {MAX_ACCESSIBLE_GROUNDWATER_DEPTH_METERS:.0f}-meter "
                                    "accessible groundwater column."
                                ),
                            },
                            "remaining_storage_fraction": {
                                "value": storage_stats["remaining_fraction"],
                                "units": "fraction",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    "Modeled share of the 392-meter accessible groundwater column that remains saturated "
                                    "after sampling local water-table depth."
                                ),
                            },
                            "annual_withdrawal_share_of_storage": {
                                "value": round(annual_withdrawal_share_of_storage, 6),
                                "units": "fraction_per_year",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": "Annual withdrawal volume divided by modeled current groundwater storage.",
                            },
                            "annual_net_balance_share_of_storage": {
                                "value": round(annual_net_balance_share_of_storage, 6),
                                "units": "fraction_per_year",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    "Annual net balance divided by modeled current groundwater storage. Positive values "
                                    "indicate annual withdrawals above recharge; negative values indicate recharge above withdrawals."
                                ),
                            },
                            "mean_water_table_depth": {
                                "value": storage_stats["mean_water_table_depth_m"],
                                "units": "m",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    f"Mean of {storage_stats['sample_count']} sampled water-table depth values from the "
                                    "Princeton modeled CONUS water-table depth surface."
                                ),
                            },
                            "mean_saturated_thickness": {
                                "value": storage_stats["mean_saturated_thickness_m"],
                                "units": "m",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    f"Modeled mean saturated thickness remaining within the {MAX_ACCESSIBLE_GROUNDWATER_DEPTH_METERS:.0f}-meter "
                                    "accessible groundwater column."
                                ),
                            },
                            "mean_porosity": {
                                "value": storage_stats["mean_porosity"],
                                "units": "fraction",
                                "is_estimate": True,
                                "confidence_grade": "C",
                                "source_type": "heuristic_estimate",
                                "methodology_key": STORAGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    f"Mean sampled GLHYMPS porosity across the mapped footprint with "
                                    f"{round(storage_stats['porosity_coverage_fraction'] * 100)} percent sample coverage."
                                ),
                            },
                        },
                        "recharge_stress": {
                            "estimated_natural_recharge": {
                                "value": _round_number(total_recharge),
                                "units": "Mgal/d",
                                "is_estimate": True,
                                "confidence_grade": "B",
                                "source_type": "official_proxy_estimate",
                                "methodology_key": RECHARGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    f"Area-weighted overlay of the USGS mean annual natural recharge raster across "
                                    f"{recharge_stats['cell_count']} one-kilometer cells with a mean recharge of "
                                    f"{recharge_stats['mean_recharge_mm_per_year']} mm/year."
                                ),
                            },
                            "net_withdrawal_minus_recharge": {
                                "value": _signed_round(net_withdrawal_minus_recharge),
                                "units": "Mgal/d",
                                "is_estimate": True,
                                "confidence_grade": "B",
                                "source_type": "official_proxy_estimate",
                                "methodology_key": RECHARGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": "Positive values indicate withdrawals above estimated natural recharge.",
                            },
                            "withdrawal_to_recharge_ratio": {
                                "value": round(withdrawal_to_recharge_ratio, 3),
                                "units": "ratio",
                                "is_estimate": True,
                                "confidence_grade": "B",
                                "source_type": "official_proxy_estimate",
                                "methodology_key": RECHARGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": "Dimensionless ratio of 2015 withdrawals to estimated natural recharge.",
                            },
                            "balance_index": {
                                "value": round(balance_index, 3),
                                "units": "fraction",
                                "is_estimate": True,
                                "confidence_grade": "B",
                                "source_type": "official_proxy_estimate",
                                "methodology_key": RECHARGE_METHOD_KEY,
                                "methodology_version": METHODOLOGY_VERSION,
                                "notes": (
                                    "Recharge-based balance index computed as (withdrawals - estimated natural recharge) / "
                                    "estimated natural recharge. Positive values indicate withdrawals above recharge."
                                ),
                            },
                        },
                        "categories": categories,
                        "industry_estimates": [],
                        "provenance_source_ids": [
                            "usgs_county_aquifer_withdrawals_2015",
                            "usgs_mean_annual_natural_recharge_conus",
                            "ma_2026_mean_water_table_depth_conus",
                            "glhymps_porosity",
                            *geometry_source_ids,
                        ],
                        "methodology_summary": methodology_summary,
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
                "source_id": "usgs_mean_annual_natural_recharge_conus",
                "title": "Estimated mean annual natural ground-water recharge in the conterminous United States",
                "publisher": "U.S. Geological Survey",
                "year": 2003,
                "dataset_or_report": "ScienceBase data release / Open-File Report 2003-311",
                "doi_or_identifier": "https://doi.org/10.3133/ofr03311",
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": RECHARGE_NOTES,
            },
            {
                "source_id": "ma_2026_mean_water_table_depth_conus",
                "title": "High resolution US water table depth estimates reveal quantity of accessible groundwater",
                "publisher": "Nature Communications Earth & Environment / Princeton HydroFrame",
                "year": 2026,
                "dataset_or_report": "Modeled mean water-table depth raster (public viewer COG)",
                "doi_or_identifier": STORAGE_WTD_SOURCE_URL,
                "retrieved_at": generated_at,
                "license": "Research / viewer endpoint",
                "usage_notes": STORAGE_NOTES,
            },
            {
                "source_id": "glhymps_porosity",
                "title": "GLobal HYdrogeology MaPS 2.0",
                "publisher": "GLHYMPS contributors / Borealis",
                "year": 2018,
                "dataset_or_report": "Global hydrogeology polygon dataset",
                "doi_or_identifier": GLHYMPS_DIRECT_DOWNLOAD_URL,
                "retrieved_at": generated_at,
                "license": "Open data",
                "usage_notes": (
                    "Porosity values are sampled as a national proxy layer for the modeled storage calculation. "
                    "This is not a published USGS aquifer-specific storage denominator."
                ),
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
                "doi_or_identifier": str(METHOD_CODES_PATH.name),
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": "Method-code definitions for the 2015 county-aquifer withdrawals release.",
            },
            {
                "source_id": "census_cartographic_county_boundaries_2015",
                "title": "2015 Cartographic Boundary County Shapefile",
                "publisher": "U.S. Census Bureau",
                "year": 2015,
                "dataset_or_report": "Cartographic boundary shapefile",
                "doi_or_identifier": str(COUNTY_BOUNDARY_SOURCE_PATH.name),
                "retrieved_at": generated_at,
                "license": "Public domain",
                "usage_notes": COUNTY_BOUNDARY_SCALE_NOTE,
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
    _write_json(DISPLAY_GEOMETRY_QA_PATH, {"type": "FeatureCollection", "features": []})
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
    county_records = _load_county_records()
    selected_systems = _select_display_systems(withdrawal_data, geometry_by_normalized_name)
    if len(selected_systems) != DISPLAY_AQUIFER_TARGET_COUNT:
        raise SystemExit(
            f"Expected {DISPLAY_AQUIFER_TARGET_COUNT} display aquifers, found {len(selected_systems)}"
        )

    _write_crosswalk(selected_systems, withdrawal_data)
    collection, geometry, geometry_qa, withdrawals, industry_estimates = _build_outputs(
        selected_systems,
        withdrawal_data,
        geometry_records,
        county_records,
        generated_at,
    )

    _write_json(DISPLAY_COLLECTION_PATH, collection)
    _write_json(DISPLAY_GEOMETRY_PATH, geometry, pretty=False)
    _write_json(DISPLAY_GEOMETRY_QA_PATH, geometry_qa, pretty=False)
    _write_json(WITHDRAWALS_PATH, withdrawals)
    _write_json(INDUSTRY_ESTIMATES_PATH, industry_estimates)
    _write_provenance(generated_at, citation)

    fallback_count = sum(
        1 for feature in geometry["features"] if feature["properties"]["geometry_method"] == COUNTY_FOOTPRINT_METHOD
    )
    print(
        f"Generated {len(collection['aquifers'])} display aquifers, "
        f"{fallback_count} county-footprint fallbacks, "
        f"{len(geometry['features'])} geometry features, and {len(withdrawals['records'])} metric records."
    )


if __name__ == "__main__":
    main()
