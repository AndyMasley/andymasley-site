from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = PROJECT_ROOT / "data" / "source"
DERIVED_DIR = PROJECT_ROOT / "data" / "derived" / "aquifer-stress"

DISPLAY_AQUIFER_VERSION = "2026.03.1"
METHODOLOGY_VERSION = "v1.1"
DISPLAY_AQUIFER_TARGET_COUNT = 61

WITHDRAWALS_SOURCE_PATH = SOURCE_DIR / "uscopa2015v1.0.csv"
DATA_DICTIONARY_PATH = SOURCE_DIR / "data_dictionary.csv"
METHOD_CODES_PATH = SOURCE_DIR / "method_codes.csv"
GEOMETRY_SOURCE_PATH = SOURCE_DIR / "aquifers_us.zip"
COUNTY_BOUNDARY_SOURCE_PATH = SOURCE_DIR / "cb_2015_us_county_5m.zip"
RECHARGE_SOURCE_PATH = SOURCE_DIR / "rech48grd.zip"

DISPLAY_COLLECTION_PATH = DERIVED_DIR / "display-aquifers.json"
DISPLAY_GEOMETRY_PATH = DERIVED_DIR / "display-aquifers.geojson"
DISPLAY_GEOMETRY_QA_PATH = DERIVED_DIR / "display-aquifers.qa.geojson"
WITHDRAWALS_PATH = DERIVED_DIR / "withdrawals.by-aquifer.json"
INDUSTRY_ESTIMATES_PATH = DERIVED_DIR / "industry-estimates.by-aquifer.json"
PROVENANCE_PATH = DERIVED_DIR / "provenance.json"
CROSSWALK_PATH = SOURCE_DIR / "display-aquifer-crosswalk.csv"

EXPECTED_SOURCE_FILES = [
    WITHDRAWALS_SOURCE_PATH,
    DATA_DICTIONARY_PATH,
    METHOD_CODES_PATH,
    GEOMETRY_SOURCE_PATH,
    COUNTY_BOUNDARY_SOURCE_PATH,
    RECHARGE_SOURCE_PATH,
]

ALLOWED_CONFIDENCE = {"A", "B", "C", "D"}

RESIDUAL_EXCLUDED_SOURCE_CODES = {"N9999OTHER"}
NON_MAINLAND_EXCLUDED_SOURCE_CODES = {
    "N100AKUNCD",
    "N600HIVLCC",
    "N400NCSTLM",
    "N300STHCST",
    "N400KNGSHL",
}
EXCLUDED_SOURCE_CODES = RESIDUAL_EXCLUDED_SOURCE_CODES | NON_MAINLAND_EXCLUDED_SOURCE_CODES

CATEGORY_COLUMNS = {
    "public_supply": ("Public supply", "PS-WGWTo"),
    "domestic": ("Domestic", "DO-WGWFr"),
    "irrigation": ("Irrigation", "IT-WGWFr"),
    "thermoelectric_power": ("Thermoelectric power", "PT-WGWTo"),
    "industrial": ("Industrial", "IN-WGWTo"),
    "mining": ("Mining", "MI-WGWTo"),
    "livestock": ("Livestock", "LI-WGWFr"),
    "aquaculture": ("Aquaculture", "AQ-WGWTo"),
}
