"""Street context from the assessor's street photographs.

Each house photograph was read for the road in front of it (centre line:
double, single, none) and for utility poles and overhead wires (a pole on the
house's side of the street or across it; wires in view). A house belongs to
the street of its address, at the nearest point of that street's centreline.
Per mapped road piece (physical id):

- Centre line: a local street's is cleared when its houses' photographs show
  the road without one at least twice as often as with one, and when no
  photograph shows its road at all, since the town's photographed residential
  streets are almost all unmarked. An arterial or collector keeps its lines
  unless at least three of its own photographs show none and none shows one.
- Poles: they stand on the side the photographs place them; a street whose
  photographs show neither poles nor wires anywhere (buried service) has none.

Writes data/derived/town/street-context.json. Only the per-street results are
kept; the reads are scripts/measured_roofs/facade-reads.json.
"""
import collections, gzip, json, math, re
from pathlib import Path
import numpy as np

SITE = Path(__file__).resolve().parents[2]
SUF = {'ST': 'STREET', 'ST.': 'STREET', 'RD': 'ROAD', 'AVE': 'AVENUE', 'DR': 'DRIVE', 'LN': 'LANE', 'CT': 'COURT', 'TER': 'TERRACE',
       'PKWY': 'PARKWAY', 'CIR': 'CIRCLE', 'PL': 'PLACE', 'HWY': 'HIGHWAY', 'SQ': 'SQUARE'}


def ranges(ids):
    """Sorted ids as a compact list of runs, "13-22,25,30-31"."""
    ids = sorted(set(ids)); out = []
    for i in ids:
        if out and i == out[-1][1] + 1: out[-1][1] = i
        else: out.append([i, i])
    return ','.join(f'{a}-{b}' if b > a else str(a) for a, b in out)


def main():
    net = json.load(gzip.open(SITE / 'data/derived/town/engine-network.json.gz'))
    pieces = {}
    for e in net['edges']:
        pid = int(e['physical_id'])
        if pid in pieces and int(e.get('direction', 1)) != 1: continue
        pieces[pid] = e
    by_name = collections.defaultdict(list)
    for pid, e in pieces.items(): by_name[e['name']].append(pid)
    names = set(by_name)

    def street(addr):
        parts = (addr or '').upper().replace(',', ' ').split()
        while parts and re.match(r'^[0-9][0-9A-Z\-/]*$', parts[0]): parts.pop(0)
        if not parts: return None
        ext = parts[-1] in ('EXT', 'EXTENSION')
        if ext: parts = parts[:-1]
        if parts and parts[-1] in SUF: parts[-1] = SUF[parts[-1]]
        cand = ' '.join(parts)
        for c in ([cand + ' EXTENSION'] if ext else []) + [cand]:
            if c in names: return c
        return None

    def nearest(pid, x, n):
        """Distance to the piece, and whether (x, n) lies on its geographic
        positive side (north of an east-west run, east of a north-south run)."""
        pts = np.asarray(pieces[pid]['points'])[:, :2]
        a, b = pts[:-1], pts[1:]; d = b - a; L2 = (d ** 2).sum(1) + 1e-12
        t = np.clip(((np.array([x, n]) - a) * d).sum(1) / L2, 0, 1)
        q = a + d * t[:, None]; dist = np.hypot(q[:, 0] - x, q[:, 1] - n); i = int(np.argmin(dist))
        tx, tn = d[i] / math.sqrt(L2[i]); ox, on = -tn, tx
        left = (x - q[i][0]) * ox + (n - q[i][1]) * on > 0
        positive = on > 0 if abs(tx) >= abs(tn) else ox > 0
        return float(dist[i]), (left == positive)

    idx = json.load(open(SITE / 'data/derived/town/residential-evidence-index.json'))
    homes = {}
    for t, a in idx['tiles'].items():
        for r in json.load(open(str(SITE / 'public') + a['url']))['buildings']: homes[r['id']] = r
    reads = json.load(open(SITE / 'scripts/measured_roofs/facade-reads.json'))
    centre = collections.defaultdict(collections.Counter); poles = collections.defaultdict(collections.Counter)
    street_centre = collections.defaultdict(collections.Counter); street_poles = collections.defaultdict(collections.Counter)
    for hid, r in reads.items():
        h = homes.get(hid)
        if not h: continue
        name = street(h.get('address'))
        if not name: continue
        xs = [p[0] for p in h['outline']]; ns = [p[1] for p in h['outline']]
        x, n = sum(xs) / len(xs), sum(ns) / len(ns)
        best = min(((nearest(pid, x, n), pid) for pid in by_name[name]), key=lambda v: v[0][0])
        (dist, positive), pid = best
        if dist > 70: continue
        if r.get('cl') in ('double', 'single'): centre[pid]['line'] += 1; street_centre[name]['line'] += 1
        elif r.get('cl') == 'none': centre[pid]['none'] += 1; street_centre[name]['none'] += 1
        pl = r.get('pl')
        if pl in ('house', 'far'):
            side = 1 if (pl == 'house') == positive else -1
            poles[pid]['pos' if side > 0 else 'neg'] += 1; street_poles[name]['seen'] += 1
        elif pl == 'none':
            poles[pid]['bare' if not r.get('wr') else 'wires'] += 1
            street_poles[name]['bare' if not r.get('wr') else 'wires'] += 1
        if r.get('wr'): street_poles[name]['seen'] += 0

    clear, keep = [], []
    for pid, e in pieces.items():
        t = int(e['road_type'])
        if t in (3, 4):
            # A through road keeps its lines unless several of its own photographs show none and none shows one.
            c = centre.get(pid, collections.Counter())
            (clear if c['none'] >= 3 and not c['line'] else keep).append(pid)
            continue
        if t != 5: continue
        c = centre.get(pid) or street_centre.get(e['name']) or collections.Counter()
        none, line = c['none'], c['line']
        if none or line: (clear if none >= 2 * line else keep).append(pid)
        else: clear.append(pid)
    side, bare = {}, []
    for pid, e in pieces.items():
        v = poles.get(pid, collections.Counter())
        if v['pos'] != v['neg']: side[str(pid)] = 1 if v['pos'] > v['neg'] else -1
        s = street_poles.get(e['name'], collections.Counter())
        # Buried service: several photographs along the street, none with a pole or wires.
        if s['bare'] >= 4 and not s['seen'] and not s['wires']: bare.append(pid)
    out = {'version': 2,
           # physical ids as ranges "a-b,c": cleared centre lines; poles north or east of the street, south or west; no poles
           'centreCleared': ranges(clear), 'polesPositive': ranges(int(k) for k, v in side.items() if v > 0),
           'polesNegative': ranges(int(k) for k, v in side.items() if v < 0), 'poleFree': ranges(bare)}
    (SITE / 'data/derived/town/street-context.json').write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(json.dumps({'pieces': len(pieces), 'centreCleared': len(clear), 'centreKept': len(keep), 'poleSide': len(side), 'poleFree': len(bare)}))


if __name__ == '__main__':
    main()
