"""Names as a reader would write them. The EPA permit system and the USGS water-system list keep most names in
capitals; tidy() puts them in ordinary case, keeping acronyms, initials and state codes in capitals."""
import re

ACRONYMS = set('''LLC LP LLP DBA FKA USA US II III IV VI WWTP WWTF WTP STP IWTP WPCP POTW CAFO BASF ADM PPG GE GM BP JBS CHS PCS UFP ICI
MDWASA MWRA WASA MUD SUD PUD UD CWA HOA KOA SA
DSM AMD USB PECO AOC BAE UOP CII ASU ATI CRDA GFCC TWRA OSB GAF ICG LNG RV MMC CF VP ACI MCC CRT AES NRG TVA USDA USDI USFWS NPS
BLM NASA USAF AFB PVC MDNR DNR DEQ DEC DOE APAC IMI GWCU POET FMC IMC CMC SSAB USG ICL PCA NAS USS ARS NWR NFH CBM MHP VFC SRM
DTM UOP 3M'''.split())
ABBREV = set('''MTN PLT PLNT MFG QRY RD ST MT BR CRK FT CTR BLDG LQD TRMT BLVD HWY STA DIV FAC IND PROD OPR ENG NATL INTL REG AMER
COMM COMP PROP CHEM AGG AGRI JR SR DR LN CT FK CK CR LK TRIB UNT'''.split())
STATES_UP = set('''PA NY NJ NC SC TX FL GA TN KY WV VA MD MN WI IA KS ND SD WY NM AZ UT NV CA AK NH VT RI DC MS AR IL MI'''.split())
SMALL = {'OF', 'AND', 'THE', 'AT', 'IN', 'ON', 'FOR', 'TO', 'BY', 'A', 'AN', 'OR', 'VIA'}

def _cap(p):
    """Capitalised word, with Mc and O' names"""
    out = p[:1].upper() + p[1:].lower()
    if p.upper().startswith('MC') and len(p) > 3 and p[2].isalpha(): out = 'Mc' + p[2].upper() + p[3:].lower()
    if p.upper().startswith("O'") and len(p) > 2: out = "O'" + p[2].upper() + p[3:].lower()
    return out

def _core(c, first):
    if not c or not any(ch.isalpha() for ch in c): return c
    u = c.upper()
    if re.fullmatch(r'(?:[A-Z]\.)+[A-Z]?\.?', u): return u
    if any(ch.isdigit() for ch in c):
        m = re.match(r'NO\.?(?=\d)', u)
        return ('No.' + u[m.end():]) if m else u
    if '&' in c: return u
    if u in ACRONYMS: return u
    if u in ABBREV: return _cap(c)
    if u in STATES_UP: return u
    if u in SMALL and not first: return c.lower()
    if not any(ch in 'AEIOUY' for ch in u) and len(u) >= 2: return u
    return _cap(c)

def _token(w, first):
    # keep punctuation around the word; hyphens, slashes and commas without a space join words
    parts = re.split(r'([-/,])', w)
    out = []
    for k, part in enumerate(parts):
        if part in ('-', '/', ','): out.append(part); continue
        m = re.match(r'^([^A-Za-z0-9&]*)(.*?)([^A-Za-z0-9&.]*)$', part)
        lead, core, trail = m.groups()
        # an abbreviation's full stop stays with it ("CO." -> "Co.")
        dot = core.endswith('.') and not re.fullmatch(r'(?:[A-Za-z]\.)+', core)
        if dot: core = core[:-1]
        out.append(lead + _core(core, first and k == 0) + ('.' if dot else '') + trail)
    return ''.join(out)

def unentity(s):
    """'&AMP;', '&AMP;AMP;' and '& AMP' (an ampersand escaped once or twice for the web, as some EPA records keep it) -> '&'"""
    while True:
        t = re.sub(r'&\s*AMP\b;?', '&', s, flags=re.I)
        if t == s: return s
        s = t

def tidy(s, st=None):
    """s in ordinary case; st, a state code, stays in capitals where it ends the name ('... HANCEVILLE AL')"""
    s = re.sub(r'\s+', ' ', unentity((s or '').strip()))
    if not s or any(c.islower() for c in s): return s
    words = s.split(' ')
    out = [_token(w, i == 0) for i, w in enumerate(words)]
    if st and len(words) > 1 and words[-1] == st: out[-1] = st
    return ' '.join(out)

def sentence(s):
    s = (s or '').strip()
    return s[:1].upper() + s[1:].lower() if s else s

def system_name(s):
    """a water system's name: 'DETROIT CITY OF' / 'EWING, VILLAGE OF' -> 'City of Detroit' / 'Village of Ewing'"""
    s = re.sub(r'\s+', ' ', (s or '').strip())
    if not any(c.islower() for c in s):
        m = re.match(r'^(.*?),?\s+(CITY|TOWN|VILLAGE|BOROUGH|TOWNSHIP|COUNTY) OF$', s)
        if m and m.group(1): s = f'{m.group(2)} OF {m.group(1)}'
    t = tidy(s)
    return t[:1].upper() + t[1:]
