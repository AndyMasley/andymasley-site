#!/usr/bin/env python3
"""Build per-state air pollution JSON files from EPA NEI 2020 + Census 2024 population.

Inputs (downloaded separately to /tmp/nei/):
  - esg_cty_sector_23951.csv  (EPA 2020 NEI county-by-sector, all sectors)
  - co-est2024.csv            (Census 2024 county population estimates)

Outputs (under src/data/air-pollution/):
  - counties.json             (state + county lookup with population)
  - emissions/{ss}.json       (one file per state FIPS, county -> pollutant -> bucket -> tons)
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

NEI_CSV = Path("/tmp/nei/esg_cty_sector_23951.csv")
POP_CSV = Path("/tmp/nei/co-est2024.csv")
AQS_CSV = Path("/tmp/nei/annual_conc_by_monitor_2025.csv")
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "air-pollution"
EMIT_DIR = OUT_DIR / "emissions"

NAAQS = {
    # primary NAAQS standards as currently in effect
    "pm25_annual": {"value": 9.0, "unit": "µg/m³", "label": "annual mean"},
    "ozone_8hr":   {"value": 70.0, "unit": "ppb",   "label": "4th-max 8-hr daily, ppb"},
    "no2_annual":  {"value": 53.0, "unit": "ppb",   "label": "annual mean"},
}

POLLUTANTS = {"PM25-PRI": "pm25", "NOX": "nox", "VOC": "voc"}

SECTOR_BUCKETS = {
    "Mobile - On-Road Diesel Heavy Duty Vehicles": "On-road vehicles",
    "Mobile - On-Road Diesel Light Duty Vehicles": "On-road vehicles",
    "Mobile - On-Road non-Diesel Heavy Duty Vehicles": "On-road vehicles",
    "Mobile - On-Road non-Diesel Light Duty Vehicles": "On-road vehicles",

    "Mobile - Non-Road Equipment - Diesel": "Off-road equipment",
    "Mobile - Non-Road Equipment - Gasoline": "Off-road equipment",
    "Mobile - Non-Road Equipment - Other": "Off-road equipment",

    "Mobile - Aircraft": "Aircraft, ships, trains",
    "Mobile - Commercial Marine Vessels": "Aircraft, ships, trains",
    "Mobile - Locomotives": "Aircraft, ships, trains",

    "Fuel Comb - Electric Generation - Biomass": "Power plants",
    "Fuel Comb - Electric Generation - Coal": "Power plants",
    "Fuel Comb - Electric Generation - Natural Gas": "Power plants",
    "Fuel Comb - Electric Generation - Oil": "Power plants",
    "Fuel Comb - Electric Generation - Other": "Power plants",

    "Fuel Comb - Industrial Boilers, ICEs - Biomass": "Industrial fuel combustion",
    "Fuel Comb - Industrial Boilers, ICEs - Coal": "Industrial fuel combustion",
    "Fuel Comb - Industrial Boilers, ICEs - Natural Gas": "Industrial fuel combustion",
    "Fuel Comb - Industrial Boilers, ICEs - Oil": "Industrial fuel combustion",
    "Fuel Comb - Industrial Boilers, ICEs - Other": "Industrial fuel combustion",
    "Fuel Comb - Comm/Institutional - Biomass": "Industrial fuel combustion",
    "Fuel Comb - Comm/Institutional - Coal": "Industrial fuel combustion",
    "Fuel Comb - Comm/Institutional - Natural Gas": "Industrial fuel combustion",
    "Fuel Comb - Comm/Institutional - Oil": "Industrial fuel combustion",
    "Fuel Comb - Comm/Institutional - Other": "Industrial fuel combustion",

    "Fuel Comb - Residential - Natural Gas": "Residential heating",
    "Fuel Comb - Residential - Oil": "Residential heating",
    "Fuel Comb - Residential - Other": "Residential heating",
    "Fuel Comb - Residential - Wood": "Residential heating",

    "Industrial Processes - Cement Manuf": "Industrial processes",
    "Industrial Processes - Chemical Manuf": "Industrial processes",
    "Industrial Processes - Ferrous Metals": "Industrial processes",
    "Industrial Processes - Mining": "Industrial processes",
    "Industrial Processes - NEC": "Industrial processes",
    "Industrial Processes - Non-ferrous Metals": "Industrial processes",
    "Industrial Processes - Oil & Gas Production": "Oil & gas production",
    "Industrial Processes - Petroleum Refineries": "Industrial processes",
    "Industrial Processes - Pulp & Paper": "Industrial processes",
    "Industrial Processes - Storage and Transfer": "Industrial processes",

    "Fires - Wildfires": "Wildfires & prescribed burns",
    "Fires - Prescribed Fires": "Wildfires & prescribed burns",
    "Fires - Agricultural Field Burning": "Wildfires & prescribed burns",

    "Dust - Construction Dust": "Dust",
    "Dust - Paved Road Dust": "Dust",
    "Dust - Unpaved Road Dust": "Dust",

    "Agriculture - Crops & Livestock Dust": "Agriculture",
    "Agriculture - Livestock Waste": "Agriculture",
    "Agriculture - Fertilizer Application": "Agriculture",

    "Solvent - Consumer & Commercial Solvent Use": "Solvents & coatings",
    "Solvent - Degreasing": "Solvents & coatings",
    "Solvent - Dry Cleaning": "Solvents & coatings",
    "Solvent - Graphic Arts": "Solvents & coatings",
    "Solvent - Industrial Surface Coating & Solvent Use": "Solvents & coatings",
    "Solvent - Non-Industrial Surface Coating": "Solvents & coatings",

    "Bulk Gasoline Terminals": "Other",
    "Commercial Cooking": "Other",
    "Gas Stations": "Other",
    "Miscellaneous Non-Industrial NEC": "Other",
    "Waste Disposal": "Other",

    "Biogenics - Vegetation and Soil": "Natural background (trees & soil)",
}


def load_air_quality():
    """Aggregate AQS monitor data to county-level NAAQS-style design values.

    Returns {fips5: {"pm25_annual": x, "ozone_8hr": ppb, "no2_annual": ppb}}.
    Each metric uses the max across monitors in the county to match NAAQS
    primary-standard comparison.
    """
    out = {}
    with AQS_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            ss = row["State Code"].zfill(2)
            ccc = row["County Code"].zfill(3)
            if not ss.isdigit() or not ccc.isdigit():
                continue
            fips5 = ss + ccc
            pcode = row["Parameter Code"]
            pstd = row["Pollutant Standard"]
            metric = row["Metric Used"]
            dur = row["Sample Duration"]

            key = None
            value = None
            if pcode == "88101" and pstd == "PM25 Annual 2024" and metric == "Quarterly Means of Daily Means":
                key = "pm25_annual"
                value = float(row["Arithmetic Mean"])
            elif pcode == "44201" and pstd == "Ozone 8-hour 2015":
                key = "ozone_8hr"
                # 4th Max 8-hr (ppm) -> ppb
                v = row.get("4th Max Value") or row.get("1st Max Value")
                if v in (None, ""):
                    continue
                value = float(v) * 1000.0
            elif pcode == "42602" and pstd == "NO2 Annual 1971":
                key = "no2_annual"
                value = float(row["Arithmetic Mean"])

            if key is None or value is None:
                continue

            entry = out.setdefault(fips5, {})
            prev = entry.get(key)
            if prev is None or value > prev:
                entry[key] = value
    return out


def load_population():
    """Return {fips5: int_pop, ss: state_name} from Census 2024 estimates."""
    counties = {}
    states = {}
    with POP_CSV.open(encoding="latin-1") as f:
        for row in csv.DictReader(f):
            ss = row["STATE"].zfill(2)
            ccc = row["COUNTY"].zfill(3)
            pop = int(row["POPESTIMATE2024"])
            if ccc == "000":
                states[ss] = row["STNAME"]
            else:
                counties[ss + ccc] = pop
    return counties, states


def main():
    if not NEI_CSV.exists():
        sys.exit(f"missing {NEI_CSV}")
    if not POP_CSV.exists():
        sys.exit(f"missing {POP_CSV}")

    populations, state_names = load_population()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EMIT_DIR.mkdir(parents=True, exist_ok=True)

    unknown_sectors = set()
    # emissions[ss][fips5][pollutant][bucket] = tons
    emissions = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
    # county_meta[ss][fips5] = {"name": ..., "code": state_abbr}
    county_meta = defaultdict(dict)
    state_abbr_map = {}

    with NEI_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            code = row["pollutant code"]
            if code not in POLLUTANTS:
                continue
            if row["tribal name"]:
                continue  # fold tribal areas out for now
            ss = row["fips state code"].zfill(2)
            fips5 = row["fips code"].zfill(5)
            sector = row["sector"]
            bucket = SECTOR_BUCKETS.get(sector)
            if bucket is None:
                unknown_sectors.add(sector)
                continue
            tons = float(row["total emissions"])
            pollutant = POLLUTANTS[code]
            emissions[ss][fips5][pollutant][bucket] += tons
            if fips5 not in county_meta[ss]:
                county_meta[ss][fips5] = row["county"]
                state_abbr_map[ss] = row["state"]

    if unknown_sectors:
        sys.exit(f"Unknown sectors (update SECTOR_BUCKETS): {unknown_sectors}")

    air_quality = load_air_quality() if AQS_CSV.exists() else {}

    # National per-county averages: avg(tons/yr) and avg(tons/yr per 100K residents)
    # across all counties (including counties where bucket = 0, so we average over n_counties).
    bucket_set = set()
    for ss in emissions:
        for fips5 in emissions[ss]:
            for poll in emissions[ss][fips5]:
                for b in emissions[ss][fips5][poll]:
                    bucket_set.add(b)
    buckets = sorted(bucket_set)

    pollutants = ("pm25", "nox", "voc")
    total_raw = {p: {b: 0.0 for b in buckets} for p in pollutants}
    total_percap = {p: {b: 0.0 for b in buckets} for p in pollutants}
    n_counties = 0
    n_counties_with_pop = 0
    for ss, by_county in emissions.items():
        for fips5, by_poll in by_county.items():
            n_counties += 1
            pop = populations.get(fips5, 0)
            has_pop = pop > 0
            if has_pop:
                n_counties_with_pop += 1
            for p in pollutants:
                bv = by_poll.get(p, {})
                for b in buckets:
                    v = bv.get(b, 0.0)
                    total_raw[p][b] += v
                    if has_pop:
                        total_percap[p][b] += (v / pop) * 100000

    national_avg = {
        "n_counties": n_counties,
        "n_counties_with_pop": n_counties_with_pop,
        "raw": {p: {b: total_raw[p][b] / n_counties for b in buckets} for p in pollutants},
        "percap": {p: {b: total_percap[p][b] / n_counties_with_pop for b in buckets} for p in pollutants},
    }
    with (OUT_DIR / "national_avg.json").open("w") as f:
        json.dump(national_avg, f, separators=(",", ":"))

    # Air quality: per-county measurements + national means + NAAQS
    aq_means = {}
    if air_quality:
        for key in ("pm25_annual", "ozone_8hr", "no2_annual"):
            vals = [v[key] for v in air_quality.values() if key in v]
            if vals:
                aq_means[key] = sum(vals) / len(vals)

        aq_out = {
            "naaqs": NAAQS,
            "national_avg": aq_means,
            "n_monitored": {
                key: sum(1 for v in air_quality.values() if key in v)
                for key in ("pm25_annual", "ozone_8hr", "no2_annual")
            },
            "counties": {
                fips5: {k: round(v, 2) for k, v in metrics.items()}
                for fips5, metrics in air_quality.items()
            },
        }
        with (OUT_DIR / "air_quality.json").open("w") as f:
            json.dump(aq_out, f, separators=(",", ":"))

    # counties.json
    states_out = []
    counties_out = {}
    for ss in sorted(state_abbr_map):
        states_out.append({
            "fips": ss,
            "code": state_abbr_map[ss],
            "name": state_names.get(ss, state_abbr_map[ss]),
        })
        counties_out[ss] = [
            {
                "fips": fips5,
                "name": county_meta[ss][fips5],
                "pop": populations.get(fips5, 0),
            }
            for fips5 in sorted(county_meta[ss])
        ]

    with (OUT_DIR / "counties.json").open("w") as f:
        json.dump({"states": states_out, "counties": counties_out}, f, separators=(",", ":"))

    # emissions/{ss}.json — round to integer tons (or 1 decimal for very small)
    def round_emissions(v):
        if v >= 10:
            return round(v)
        if v >= 1:
            return round(v, 1)
        if v >= 0.01:
            return round(v, 2)
        return round(v, 3)

    for ss, by_county in emissions.items():
        out = {}
        for fips5, by_poll in by_county.items():
            out[fips5] = {
                p: {b: round_emissions(t) for b, t in sorted(buckets.items())}
                for p, buckets in by_poll.items()
            }
        with (EMIT_DIR / f"{ss}.json").open("w") as f:
            json.dump(out, f, separators=(",", ":"))

    print(f"Wrote {len(states_out)} states, {sum(len(v) for v in counties_out.values())} counties")
    total_size = sum(p.stat().st_size for p in EMIT_DIR.glob("*.json"))
    counties_size = (OUT_DIR / "counties.json").stat().st_size
    print(f"counties.json: {counties_size/1024:.1f} KB; emissions total: {total_size/1024:.1f} KB across {len(emissions)} files")


if __name__ == "__main__":
    main()
