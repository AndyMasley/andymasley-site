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
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "air-pollution"
EMIT_DIR = OUT_DIR / "emissions"

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
