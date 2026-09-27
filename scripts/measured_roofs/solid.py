"""Closed house solids from measured roof sections (manifold3d CSG)."""
import math
import numpy as np
import manifold3d as mf
from shapely.geometry import Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
import shapely


def world_planes(sec):
    """Section planes as z <= a*u + b*v + c in the building frame (a wing set
    at an angle turns its planes with it)."""
    cu, cv, A, B, swap = sec['frame']
    out = []
    for a, b, c in sec['planes']:
        if swap: out.append((b, a, c - a * cv - b * cu))
        else: out.append((a, b, c - a * cu - b * cv))
    phi = sec.get('rot', 0.0)
    if phi:
        co, si = math.cos(phi), math.sin(phi)
        out = [(a * co - b * si, a * si + b * co, c) for a, b, c in out]
    return out


def section_solid(sec, base, top, grow=0.0):
    x0, y0, x1, y1 = sec['rect']
    x0, y0, x1, y1 = x0 - grow, y0 - grow, x1 + grow, y1 + grow
    if x1 - x0 < 0.05 or y1 - y0 < 0.05: return None
    solid = mf.Manifold.cube([x1 - x0, y1 - y0, top - base]).translate([x0, y0, base])
    if sec.get('rot'): solid = solid.rotate([0.0, 0.0, math.degrees(sec['rot'])])
    for a, b, c in world_planes(sec):
        n = np.array([a, b, -1.0]); L = np.linalg.norm(n)
        solid = solid.trim_by_plane((n / L).tolist(), -c / L)
    if solid.is_empty() or solid.volume() < 0.05: return None
    return solid


def section_box(sec):
    """A section's rectangle in the building frame, turned with its wing."""
    import shapely.affinity
    b = box(*sec['rect'])
    return shapely.affinity.rotate(b, sec['rot'], origin=(0, 0), use_radians=True) if sec.get('rot') else b


def cross_section(poly):
    poly = orient(poly, sign=1)
    loops = [list(poly.exterior.coords)[:-1]] + [list(i.coords)[:-1] for i in poly.interiors]
    return mf.CrossSection(loops, mf.FillRule.EvenOdd)


def house_solid(result, lpoly, base, lidar_pts=None):
    """Union of sections (+ flat fillers for uncovered plan), clipped to the plan."""
    secs = result['sections']
    peak = max(max(c for a, b, c in world_planes(s)) for s in secs) if secs else base + 3
    top = peak + 30
    parts = [s for s in (section_solid(sec, base, top) for sec in secs) if s is not None]
    covered = unary_union([section_box(s) for s in secs]) if secs else Polygon()
    leftover = lpoly.difference(covered.buffer(0.02, join_style=2))
    fillers = []
    geoms = [leftover] if leftover.geom_type == 'Polygon' else list(getattr(leftover, 'geoms', []))
    for g in geoms:
        if g.is_empty or g.area < 0.05: continue
        h = None
        if lidar_pts is not None:
            PL, Z = lidar_pts
            m = shapely.contains_xy(g.buffer(0.3), PL[:, 0], PL[:, 1])
            if m.sum() >= 3: h = float(np.median(Z[m]))
        if h is None:
            # the lowest neighbouring roof edge, else one storey
            h = base + 3.0
        h = max(h, base + 2.2)
        fillers.append({'poly': g, 'height': h})
        try:
            parts.append(cross_section(g.buffer(0.04, join_style=2)).extrude(h - base).translate([0, 0, base]))
        except Exception:
            pass
    if not parts: return None, fillers
    body = mf.Manifold.batch_boolean(parts, mf.OpType.Add) if len(parts) > 1 else parts[0]
    prism = cross_section(lpoly).extrude(top - base + 1).translate([0, 0, base - 0.5])
    body = body ^ prism
    body = body.set_tolerance(0.002)
    return body, fillers


def grown_union(result, fillers, lpoly, base, grow):
    """The same roof sections with every plan edge pushed out by `grow`: a
    subtrahend whose side faces never coincide with the house's own walls."""
    secs = result['sections']
    peak = max(max(c for a, b, c in world_planes(s)) for s in secs)
    top = peak + 30
    parts = [s for s in (section_solid(sec, base - 1, top, grow) for sec in secs) if s is not None]
    for f in fillers:
        try: parts.append(cross_section(f['poly'].buffer(0.04 + grow, join_style=2)).extrude(f['height'] - base + 1).translate([0, 0, base - 1]))
        except Exception: pass
    body = mf.Manifold.batch_boolean(parts, mf.OpType.Add) if len(parts) > 1 else parts[0]
    prism = cross_section(lpoly.buffer(grow, join_style=2)).extrude(top - base + 2).translate([0, 0, base - 1.5])
    return body ^ prism


def mesh_arrays(body):
    m = body.to_mesh()
    v = np.asarray(m.vert_properties, dtype='f8')[:, :3]
    f = np.asarray(m.tri_verts, dtype=np.int64)
    return v, f


def eaved_solid(full, grown, lpoly, base, inset=0.32, thickness=0.22, drop=0.1):
    """Walls stand `inset` inside the roofprint; the roof is a slab of
    `thickness` over the whole roofprint, so eaves and rakes overhang.
    No two operands share a face: the slab subtracts a grown copy, and the
    walls sink `drop` into the slab."""
    inner = lpoly.buffer(-inset, join_style=2)
    if inner.is_empty or inner.area < 4: return full
    if inner.geom_type != 'Polygon': inner = max(inner.geoms, key=lambda g: g.area)
    bb = full.bounding_box()
    walls = (full ^ cross_section(inner).extrude(bb[5] - base + 2).translate([0, 0, base - 0.5])).translate([0, 0, -drop])
    shell = full - grown.translate([0, 0, -thickness])
    return walls + shell
