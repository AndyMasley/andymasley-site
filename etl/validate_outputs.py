import csv
import json
from pathlib import Path

from etl.config.constants import (
    ALLOWED_CONFIDENCE,
    CROSSWALK_PATH,
    DISPLAY_COLLECTION_PATH,
    DISPLAY_GEOMETRY_PATH,
    INDUSTRY_ESTIMATES_PATH,
    PROVENANCE_PATH,
    WITHDRAWALS_PATH,
)


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    collection = _load_json(DISPLAY_COLLECTION_PATH)
    geometry = _load_json(DISPLAY_GEOMETRY_PATH)
    withdrawals = _load_json(WITHDRAWALS_PATH)
    industry_estimates = _load_json(INDUSTRY_ESTIMATES_PATH)
    provenance = _load_json(PROVENANCE_PATH)

    aquifer_ids = {record["display_aquifer_id"] for record in collection.get("aquifers", [])}
    feature_ids = {
        feature.get("properties", {}).get("display_aquifer_id")
        for feature in geometry.get("features", [])
        if feature.get("properties", {}).get("display_aquifer_id")
    }
    provenance_ids = {record["source_id"] for record in provenance.get("sources", [])}

    if geometry.get("type") != "FeatureCollection":
        raise SystemExit("display-aquifers.geojson must be a FeatureCollection")

    if collection.get("build_status") == "ready":
        if len(collection.get("aquifers", [])) != 30:
            raise SystemExit("Ready build must contain exactly 30 display aquifers")
        if len(geometry.get("features", [])) != len(collection.get("aquifers", [])):
            raise SystemExit("Ready build must have one geometry feature per display aquifer")
        if len(withdrawals.get("records", [])) != len(collection.get("aquifers", [])):
            raise SystemExit("Ready build must have one metric record per display aquifer")

    for record in withdrawals.get("records", []):
        if record["display_aquifer_id"] not in aquifer_ids:
            raise SystemExit(f"Unknown display_aquifer_id in withdrawals: {record['display_aquifer_id']}")
        if record["display_aquifer_id"] not in feature_ids:
            raise SystemExit(f"Missing geometry for display_aquifer_id: {record['display_aquifer_id']}")
        if record["total_withdrawal"]["value"] < 0:
            raise SystemExit(f"Negative total withdrawal for {record['display_aquifer_id']}")
        if record["total_withdrawal"]["confidence_grade"] not in ALLOWED_CONFIDENCE:
            raise SystemExit(f"Invalid confidence grade for {record['display_aquifer_id']}")

        share_sum = sum(category["share_of_total"] for category in record.get("categories", []))
        if record.get("categories") and not 0.99 <= share_sum <= 1.01:
            raise SystemExit(f"Category shares do not sum to ~1 for {record['display_aquifer_id']}: {share_sum}")

        for source_id in record.get("provenance_source_ids", []):
            if source_id not in provenance_ids:
                raise SystemExit(f"Unknown provenance source id: {source_id}")

        parent_sums = {}
        for estimate in record.get("industry_estimates", []):
            if estimate["confidence_grade"] not in ALLOWED_CONFIDENCE:
                raise SystemExit(f"Invalid industry confidence grade for {record['display_aquifer_id']}")
            parent_sums.setdefault(estimate["parent_category_key"], 0.0)
            parent_sums[estimate["parent_category_key"]] += estimate["value"]

        category_values = {category["category_key"]: category["value"] for category in record.get("categories", [])}
        for parent_key, parent_sum in parent_sums.items():
            if category_values.get(parent_key) is not None and parent_sum > category_values[parent_key] + 1e-6:
                raise SystemExit(
                    f"Industry subtype totals exceed parent category for {record['display_aquifer_id']} / {parent_key}"
                )

    if industry_estimates.get("build_status") == "ready" and industry_estimates.get("records") is None:
        raise SystemExit("Industry estimates file must contain a records array")

    if CROSSWALK_PATH.exists():
        with CROSSWALK_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        if collection.get("build_status") == "ready":
            mapped_ids = {row["display_aquifer_id"] for row in rows}
            missing = [aquifer_id for aquifer_id in aquifer_ids if aquifer_id not in mapped_ids]
            if missing:
                raise SystemExit(f"Display aquifers missing crosswalk rows: {missing}")

    print("Aquifer stress derived outputs validated.")


if __name__ == "__main__":
    main()
