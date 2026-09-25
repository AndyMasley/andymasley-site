"""Authored, tileable PBR surface library for the Webster drive.

Every texture here is procedurally generated from fixed seeds: no photograph,
scan or third-party image is used, so the outputs are reproducible and carry no
licence obligations. Dimensions follow ordinary New England building practice
(4-inch clapboard exposure, 5 5/8-inch architectural-shingle exposure, dense
graded asphalt aggregate, broom-finished concrete). They are generic material
interpretations, not observations of any particular Webster surface.

Array convention: row index grows with texture v. glTF-style samplers (flipY
false) therefore read row i at v = i / N. Normal maps are tangent-space, OpenGL
convention: +x follows increasing u, +y follows increasing v.

Usage: python3 scripts/town_material_library/generate.py [--out public/town-materials]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

VERSION = 'v1'


# ----------------------------------------------------------------------------
# Tileable noise and helpers
# ----------------------------------------------------------------------------

def _freq(n: int) -> tuple[np.ndarray, np.ndarray]:
    f = np.fft.fftfreq(n) * n
    fx, fy = np.meshgrid(f, f)
    return fx, fy


def spectral(n: int, seed: int, beta: float = 2.0, fmin: float = 1.0, fmax: float | None = None,
             stretch: tuple[float, float] = (1.0, 1.0)) -> np.ndarray:
    """Periodic Gaussian noise with a 1/f^beta power spectrum (cycles per tile).

    stretch scales the (u, v) frequencies before the spectrum is applied: a
    larger v stretch favours variation across v, i.e. streaks that run along u.
    """
    rng = np.random.default_rng(seed)
    white = np.fft.fft2(rng.standard_normal((n, n)))
    fx, fy = _freq(n)
    f = np.sqrt((fx / stretch[0]) ** 2 + (fy / stretch[1]) ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp[f < fmin] = 0.0
    if fmax is not None:
        amp *= np.exp(-(f / fmax) ** 4)
    amp[0, 0] = 0.0
    out = np.real(np.fft.ifft2(white * amp))
    return (out - out.mean()) / (out.std() + 1e-12)


def blur(a: np.ndarray, sigma_px: float) -> np.ndarray:
    """Periodic Gaussian blur."""
    if sigma_px <= 0:
        return a
    n = a.shape[0]
    fx, fy = _freq(n)
    g = np.exp(-2.0 * (np.pi * sigma_px / n) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def worley(n: int, cells: int, seed: int, jitter: float = 0.9) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Periodic cellular noise: nearest/second distances (in cell units) and nearest cell id."""
    rng = np.random.default_rng(seed)
    pts = 0.5 + (rng.random((cells, cells, 2)) - 0.5) * jitter
    ids = rng.permutation(cells * cells).reshape(cells, cells)
    coord = (np.arange(n) + 0.5) * cells / n
    x, y = np.meshgrid(coord, coord)
    cx, cy = np.floor(x).astype(int), np.floor(y).astype(int)
    f1 = np.full((n, n), 9.0)
    f2 = np.full((n, n), 9.0)
    nearest = np.zeros((n, n), dtype=np.int64)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx, gy = cx + ox, cy + oy
            wx, wy = gx % cells, gy % cells
            px = gx + pts[wy, wx, 0]
            py = gy + pts[wy, wx, 1]
            d = np.hypot(x - px, y - py)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            nearest = np.where(closer, ids[wy, wx], nearest)
            f1 = np.where(closer, d, f1)
    return f1, f2, nearest


def hash_values(ids: np.ndarray, seed: int) -> np.ndarray:
    """Deterministic [0,1) value per integer id."""
    x = (ids.astype(np.uint64) * np.uint64(0x9E3779B97F4A7C15) + np.uint64(seed * 0x632BE59BD9B4E019 & 0xFFFFFFFFFFFFFFFF))
    x ^= x >> np.uint64(29)
    x *= np.uint64(0xBF58476D1CE4E5B9)
    x ^= x >> np.uint64(32)
    return (x & np.uint64(0xFFFFFF)).astype(np.float64) / float(0x1000000)


def normal_from_height(h_m: np.ndarray, texel_m: float) -> np.ndarray:
    """Tangent-space normals (u, v, up) from a periodic height field in metres."""
    du = (np.roll(h_m, -1, axis=1) - np.roll(h_m, 1, axis=1)) / (2.0 * texel_m)
    dv = (np.roll(h_m, -1, axis=0) - np.roll(h_m, 1, axis=0)) / (2.0 * texel_m)
    nrm = np.stack([-du, -dv, np.ones_like(h_m)], axis=-1)
    return nrm / np.linalg.norm(nrm, axis=-1, keepdims=True)


def cavity(h_m: np.ndarray, radius_px: float, depth_m: float) -> np.ndarray:
    """Cheap ambient-occlusion estimate: how far a texel sits below its blurred surroundings."""
    below = np.clip((blur(h_m, radius_px) - h_m) / depth_m, 0.0, 1.0)
    return 1.0 - below


def srgb(linear: np.ndarray) -> np.ndarray:
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def to8(a: np.ndarray) -> np.ndarray:
    return np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)


def resize(a: np.ndarray, size: int) -> np.ndarray:
    """Box-filter a periodic RGB/float image to a smaller power-of-two size."""
    n = a.shape[0]
    f = n // size
    if f <= 1:
        return a
    shape = (size, f, size, f) + a.shape[2:]
    return a.reshape(shape).mean(axis=(1, 3))


# ----------------------------------------------------------------------------
# Materials. Each returns linear albedo (N,N,3), height (m), roughness, ao.
# ----------------------------------------------------------------------------

def clapboard(n: int, tile_m: float) -> dict:
    """Painted lapped clapboard, 4-inch (0.10 m) exposure, butt joints and grain."""
    px = tile_m / n
    exposure = tile_m / 20.0
    v = (np.arange(n) + 0.5) * px
    u = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(u, v)
    board = np.floor(V / exposure).astype(int)
    t = V / exposure - board  # 0 at the lip (bottom of each board), 1 under the next lip
    # Tapered board face: thick at the lip, thin at the top.
    face = 0.0112 - 0.0072 * t
    # Round the lip over ~1.5 texels so the step reads as a shadow line, not a jagged edge.
    lip = smoothstep(0.0, 1.6 * px / exposure, t)
    below_top = 0.0112 - 0.0072
    h = below_top + (face - below_top) * lip
    rng = np.random.default_rng(11)
    # Per-row butt joints and board-length colour variation.
    joint = np.zeros((n, n))
    board_tone = np.zeros((n, n))
    rows = 20
    for r in range(rows):
        mask_rows = (board == r)
        count = rng.choice([0, 1, 1, 2], p=[0.25, 0.45, 0.15, 0.15])
        cuts = np.sort(rng.random(count)) * tile_m
        edges = np.concatenate([cuts, [tile_m]]) if count else np.array([tile_m])
        seg = np.searchsorted(cuts, U[mask_rows]) if count else np.zeros(mask_rows.sum(), int)
        # wrap: last segment continues into the first across the tile edge
        if count:
            seg = np.where(seg == count, 0, seg)
        tones = rng.normal(0.0, 0.018, count + 1)
        board_tone[mask_rows] = tones[seg]
        for c in cuts:
            d = np.abs(((U[mask_rows] - c + tile_m / 2) % tile_m) - tile_m / 2)
            joint[mask_rows] = np.maximum(joint[mask_rows], 1.0 - smoothstep(0.6 * px, 1.8 * px, d))
    grain = spectral(n, 12, beta=1.4, fmin=3, fmax=n / 3, stretch=(0.08, 1.0))
    fine = spectral(n, 13, beta=0.6, fmin=40, fmax=n / 2.2)
    h = h - joint * 0.0012 + grain * 0.00012 * (1 - joint)
    ao = cavity(h, 3.0, 0.004)
    # The upper band of each board sits in the shadow pocket below the next lip.
    pocket = smoothstep(0.80, 1.0, t) ** 1.5
    ao = ao * (1.0 - 0.34 * pocket) * (1.0 - 0.35 * joint)
    base = 0.93 + board_tone + grain * 0.012 + fine * 0.006
    albedo = np.stack([base, base, base], axis=-1) * ao[..., None] ** 0.8
    rough = np.clip(0.58 + fine * 0.03 + grain * 0.02 + (1 - ao) * 0.25 + joint * 0.2, 0.3, 0.95)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def shingles(n: int, tile_m: float) -> dict:
    """Laminated architectural asphalt shingles, 0.14 m exposure, blended granules."""
    px = tile_m / n
    courses = 28
    exposure = tile_m / courses
    u = (np.arange(n) + 0.5) * px
    v = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(u, v)
    course = np.floor(V / exposure).astype(int)
    t = V / exposure - course
    rng = np.random.default_rng(21)
    # A "weathered wood / charcoal blend": neighbouring tabs differ only a little.
    palette = np.array([
        [0.060, 0.062, 0.066], [0.071, 0.071, 0.073], [0.052, 0.053, 0.057],
        [0.068, 0.064, 0.060], [0.078, 0.077, 0.076], [0.058, 0.058, 0.060],
    ])
    albedo = np.zeros((n, n, 3))
    h = np.zeros((n, n))
    shadow_layer = np.zeros((n, n))
    tab_edge = np.zeros((n, n))
    for c in range(courses):
        rows = np.where((np.floor(v / exposure).astype(int)) == c)[0]
        # Build a wrapped sequence of tabs and dark shadow-layer gaps.
        widths, kinds = [], []
        total = 0.0
        while total < tile_m:
            w = rng.uniform(0.16, 0.42)
            g = rng.uniform(0.03, 0.10)
            widths += [w, g]
            kinds += [1, 0]
            total += w + g
        widths = np.array(widths) * tile_m / total
        starts = np.concatenate([[0.0], np.cumsum(widths)[:-1]])
        offset = rng.uniform(0, tile_m)
        uu = (U[rows] + offset) % tile_m
        seg = np.searchsorted(starts, uu, side='right') - 1
        kind = np.array(kinds)[seg]
        colours = palette[rng.integers(0, len(palette), len(widths))]
        colours *= rng.uniform(0.95, 1.06, (len(widths), 1))
        col = colours[seg]
        # Notch height for the gaps: the lower shadow layer shows up to gap_top.
        gap_top = rng.uniform(0.35, 0.7, len(widths))[seg]
        tt = t[rows]
        in_gap = (kind == 0) & (tt < gap_top)
        # distance to the nearest segment side, for bevels
        seg_start = starts[seg]
        seg_w = widths[seg]
        side = np.minimum(uu - seg_start, seg_start + seg_w - uu)
        bevel = smoothstep(0.0, 2.2 * px, side)
        hc = 0.0045 - 0.0022 * tt                     # base mat, thick at the course edge
        hc = hc + np.where(kind == 1, 0.0028 * bevel, 0.0)  # laminated tab
        hc = np.where(in_gap, hc - 0.0006, hc)
        lip = smoothstep(0.0, 1.8 * px / exposure, tt)
        hc = 0.0023 + (hc - 0.0023) * lip
        h[rows] = hc
        # The shadow layer is a darker granule band; the upper course's lip
        # throws a narrow shadow pocket onto the top of this course.
        dark = np.where(in_gap, 0.55, 1.0) * (1.0 - 0.35 * smoothstep(0.86, 1.0, tt) ** 1.5)
        albedo[rows] = col * dark[..., None]
        shadow_layer[rows] = in_gap
        tab_edge[rows] = (1 - bevel) * (kind == 1)
    granule = blur(spectral(n, 22, beta=0.2, fmin=n / 8), 0.45)   # near-white granule noise
    mid = spectral(n, 23, beta=1.6, fmin=4, fmax=n / 6)
    speck = (np.random.default_rng(24).random((n, n)) > 0.992).astype(float)
    albedo *= (1.0 + granule[..., None] * 0.13 + mid[..., None] * 0.04)
    albedo = albedo * (1 - speck[..., None] * 0.3) + speck[..., None] * 0.09 * np.array([1.0, 0.96, 0.9])
    h = h + granule * 0.00018
    ao = cavity(h, 2.5, 0.003) * (1 - 0.18 * shadow_layer)
    albedo *= ao[..., None] ** 0.6
    rough = np.clip(0.9 + granule * 0.03 - speck * 0.1, 0.72, 1.0)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def asphalt(n: int, tile_m: float) -> dict:
    """Weathered dense-graded asphalt: oxidised grey binder, exposed stone and fines.

    Coarse stones (~12-16 mm) and fine stones (~6-8 mm) are angular Voronoi
    fragments; the binder between them is sand-filled and has greyed with age.
    """
    # Oxidised binder with sand: the dominant tone of an older road at distance.
    sand = spectral(n, 34, beta=0.0, fmin=n / 6)
    wear = spectral(n, 35, beta=2.2, fmin=1, fmax=24)
    binder_tone = 0.052 + 0.012 * blur(sand, 0.6) + 0.006 * wear
    albedo = np.stack([binder_tone, binder_tone, binder_tone * 1.03], axis=-1)
    h = sand * 0.00006
    stone_cover = np.zeros((n, n))
    layers = [(n // 8, 0.0022, 31, 0.62), (n // 4, 0.0013, 32, 0.55), (n // 2, 0.0006, 33, 0.5)]
    for cells, height, seed, keep_p in layers:
        f1, f2, ids = worley(n, cells, seed, jitter=0.95)
        size = hash_values(ids, seed)
        keep = hash_values(ids, seed + 7) < keep_p
        # Angular fragments: a cell's interior shrunk away from its edges.
        edge = f2 - f1
        shape = smoothstep(0.05 + 0.10 * (1 - size), 0.35, edge) * keep
        tone = hash_values(ids, seed + 3)
        warm = hash_values(ids, seed + 5)
        grey = 0.10 + 0.26 * tone ** 1.6
        grey = np.where(hash_values(ids, seed + 9) < 0.18, 0.05 + 0.03 * tone, grey)  # dark traprock
        col = np.stack([grey * (1 + 0.10 * (warm - 0.5)), grey, grey * (1 - 0.07 * (warm - 0.5))], axis=-1)
        top = smoothstep(0.2, 0.9, shape)
        col *= (0.78 + 0.3 * top)[..., None]
        cover = smoothstep(0.0, 0.25, shape)
        albedo = albedo * (1 - cover[..., None]) + col * cover[..., None]
        h = np.maximum(h, shape * height * (0.7 + 0.6 * size))
        stone_cover = np.maximum(stone_cover, cover)
    albedo *= (1.0 + wear[..., None] * 0.05)
    ao = cavity(h, 2.0, 0.0012)
    albedo *= ao[..., None] ** 0.8
    rough = np.clip(0.93 - 0.14 * stone_cover * smoothstep(0.3, 1.0, h / 0.0022) + sand * 0.015, 0.62, 1.0)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def concrete(n: int, tile_m: float) -> dict:
    """Broom-finished sidewalk concrete with sand, pits and mild staining."""
    streak = spectral(n, 41, beta=1.0, fmin=6, fmax=n / 2.5, stretch=(0.04, 1.0))
    grain = spectral(n, 42, beta=0.3, fmin=n / 10)
    mottle = spectral(n, 43, beta=2.4, fmin=1, fmax=40)
    stain = smoothstep(0.9, 2.2, spectral(n, 44, beta=2.6, fmin=1, fmax=18))
    rng = np.random.default_rng(45)
    pits = blur((rng.random((n, n)) > 0.9975).astype(float), 0.7)
    pits = np.clip(pits * 6.0, 0.0, 1.0)
    f1, f2, ids = worley(n, n // 6, 46, jitter=0.9)
    agg = (hash_values(ids, 47) > 0.86) * np.clip(1 - (f1 / 0.28) ** 2, 0, 1)
    base = 0.40 + mottle * 0.022 + grain * 0.018 + streak * 0.014 - stain * 0.05
    albedo = np.stack([base * 1.01, base, base * 0.965], axis=-1)
    albedo = albedo * (1 - 0.35 * pits[..., None]) + agg[..., None] * (0.07 * hash_values(ids, 48)[..., None] - 0.035)
    h = streak * 0.00016 + grain * 0.00005 - pits * 0.0009 + agg * 0.00015
    ao = cavity(h, 2.0, 0.0008)
    albedo *= ao[..., None] ** 0.5
    rough = np.clip(0.9 + grain * 0.025 - stain * 0.04, 0.72, 1.0)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def granite(n: int, tile_m: float) -> dict:
    """Sawn grey granite: feldspar, quartz and biotite grains."""
    f1, f2, ids = worley(n, n // 5, 51, jitter=0.95)
    pick = hash_values(ids, 52)
    tone = hash_values(ids, 53)
    col = np.zeros((n, n, 3))
    feldspar = np.stack([0.52 + 0.12 * tone, 0.50 + 0.11 * tone, 0.47 + 0.10 * tone], -1)
    quartz = np.stack([0.30 + 0.10 * tone, 0.31 + 0.10 * tone, 0.31 + 0.11 * tone], -1)
    biotite = np.stack([0.035 + 0.03 * tone] * 3, -1)
    col = np.where((pick < 0.52)[..., None], feldspar, np.where((pick < 0.9)[..., None], quartz, biotite))
    edge = 1 - smoothstep(0.0, 0.08, f2 - f1)
    col *= (1 - 0.18 * edge)[..., None]
    mottle = spectral(n, 54, beta=2.2, fmin=1, fmax=20)
    col *= (1 + 0.05 * mottle)[..., None]
    h = -edge * 0.00015 + (pick > 0.83) * -0.00008
    ao = cavity(h, 1.5, 0.0004)
    rough = np.clip(0.74 + 0.1 * (pick > 0.83) + 0.05 * edge, 0.5, 0.95)
    return dict(albedo=col * 0.62, height=h, rough=rough, ao=ao)


def foundation(n: int, tile_m: float) -> dict:
    """Poured concrete foundation: form-panel seams, tie holes and weathering."""
    px = tile_m / n
    u = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(u, u)
    panel_u, panel_v = tile_m / 3.0, tile_m / 3.0
    su = np.abs(((U + panel_u / 2) % panel_u) - panel_u / 2)
    sv = np.abs(((V + panel_v / 2) % panel_v) - panel_v / 2)
    seam = np.maximum(1 - smoothstep(0.5 * px, 2.0 * px, su), 1 - smoothstep(0.5 * px, 2.0 * px, sv))
    tie_u = np.abs(((U) % (panel_u / 2)) - panel_u / 4)
    tie_v = np.abs(((V) % (panel_v / 2)) - panel_v / 4)
    ties = (1 - smoothstep(3 * px, 5 * px, np.hypot(tie_u, tie_v)))
    mottle = spectral(n, 61, beta=2.3, fmin=1, fmax=30)
    grain = spectral(n, 62, beta=0.4, fmin=n / 10)
    streak = spectral(n, 63, beta=1.8, fmin=2, fmax=60, stretch=(1.0, 0.1))
    base = 0.30 + 0.025 * mottle + 0.012 * grain - 0.02 * np.clip(streak, 0, None)
    albedo = np.stack([base * 1.02, base, base * 0.95], -1)
    h = -seam * 0.0006 - ties * 0.004 + grain * 0.00006
    ao = cavity(h, 2.5, 0.002)
    albedo *= (ao ** 0.8)[..., None]
    rough = np.clip(0.9 + grain * 0.03, 0.75, 1.0)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def cedar(n: int, tile_m: float) -> dict:
    """Painted or stained cedar wall shingles, 5-inch (0.125 m) exposure.

    Random widths (75-300 mm), keyway gaps, staggered joints, tapered butts and
    vertical grain. Neutral near-white: the wall's paint or stain tints it.
    """
    px = tile_m / n
    courses = 16
    exposure = tile_m / courses
    u = (np.arange(n) + 0.5) * px
    v = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(u, v)
    rng = np.random.default_rng(71)
    h = np.zeros((n, n))
    tone = np.zeros((n, n))
    gap = np.zeros((n, n))
    butt_dirt = np.zeros((n, n))
    previous_joints: np.ndarray | None = None
    for c in range(courses):
        rows = np.where(np.floor(v / exposure).astype(int) == c)[0]
        # Widths: mostly 100-220 mm, a few narrow slips and wide boards.
        while True:
            widths = []
            total = 0.0
            while total < tile_m - 0.05:
                w = float(np.clip(rng.lognormal(np.log(0.16), 0.38), 0.075, 0.30))
                widths.append(w)
                total += w
            widths = np.array(widths) * tile_m / total
            offset = rng.uniform(0, tile_m)
            joints = (np.cumsum(widths) + offset) % tile_m
            if previous_joints is None:
                break
            # Keep joints at least 38 mm from the course below (shingling rule).
            d = np.abs(((joints[:, None] - previous_joints[None, :]) + tile_m / 2) % tile_m - tile_m / 2)
            if d.min() > 0.038:
                break
        previous_joints = joints
        starts = np.concatenate([[0.0], np.cumsum(widths)[:-1]])
        uu = (U[rows] - offset) % tile_m
        seg = np.searchsorted(starts, uu, side='right') - 1
        seg_start = starts[seg]
        seg_w = widths[seg]
        side = np.minimum(uu - seg_start, seg_start + seg_w - uu)
        gap_w = rng.uniform(0.002, 0.006, len(widths))[seg]
        in_gap = 1.0 - smoothstep(gap_w * 0.5, gap_w * 0.5 + 1.2 * px, side)
        tt = V[rows] / exposure - c
        # Each butt sits a few millimetres higher or lower than its neighbours.
        drop = rng.uniform(-0.004, 0.004, len(widths))[seg] / exposure
        tb = np.clip(tt - drop, 0.0, 1.0)
        face = 0.011 - 0.0075 * tb
        lip = smoothstep(0.0, 1.6 * px / exposure, tt - drop)
        below = 0.0035
        hc = below + (face - below) * lip
        # Slight cupping across each shingle.
        across = (uu - seg_start) / seg_w
        hc += 0.0007 * np.sin(np.pi * across) * rng.uniform(0.3, 1.0, len(widths))[seg]
        hc -= in_gap * 0.006
        h[rows] = hc
        tone[rows] = rng.normal(0.0, 0.035, len(widths))[seg]
        gap[rows] = in_gap
        butt_dirt[rows] = smoothstep(0.12, 0.0, tt - drop) * lip
    grain = spectral(n, 72, beta=1.3, fmin=3, fmax=n / 2.5, stretch=(1.0, 0.07))
    fine = spectral(n, 73, beta=0.5, fmin=40, fmax=n / 2.2)
    weather = spectral(n, 74, beta=2.2, fmin=1, fmax=12)
    h = h + grain * 0.00018 * (1 - gap)
    ao = cavity(h, 3.0, 0.005)
    pocket = smoothstep(0.78, 1.0, (V / exposure) % 1.0) ** 1.5
    ao = ao * (1.0 - 0.30 * pocket) * (1.0 - 0.55 * gap)
    base = 0.90 + tone + grain * 0.022 + fine * 0.008 + weather * 0.02 - butt_dirt * 0.05
    albedo = np.stack([base, base * 0.995, base * 0.985], axis=-1) * ao[..., None] ** 0.85
    rough = np.clip(0.72 + grain * 0.04 + fine * 0.02 + (1 - ao) * 0.2 + gap * 0.2, 0.4, 0.97)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


def brick(n: int, tile_m: float) -> dict:
    """Running-bond face brick with recessed mortar joints (0.2 x 0.0667 m module).

    Neutral mean near 1: the building's own brick colour tints it, and each
    brick varies in tone, fire flash and surface texture.
    """
    px = tile_m / n
    courses = 30
    per_course = 10
    ch = tile_m / courses
    cw = tile_m / per_course
    mortar = 0.0095
    u = (np.arange(n) + 0.5) * px
    v = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(u, v)
    row = np.floor(V / ch).astype(int)
    shift = (row % 2) * 0.5 * cw
    col = np.floor(((U + shift) % tile_m) / cw).astype(int)
    lu = ((U + shift) % tile_m) - col * cw
    lv = V - row * ch
    # Distance inside the brick face to its nearest edge (mortar is centred on the module line).
    du = np.minimum(lu - mortar / 2, cw - mortar / 2 - lu)
    dv = np.minimum(lv - mortar / 2, ch - mortar / 2 - lv)
    inside = np.minimum(du, dv)
    ids = row * per_course + col
    wobble = spectral(n, 81, beta=2.0, fmin=20, fmax=n / 6) * 0.0005
    face = smoothstep(-0.0006, 0.0012, inside + wobble)
    tone = hash_values(ids, 82)
    flash = hash_values(ids, 83)
    rough_brick = hash_values(ids, 84)
    # Brick body: tone spread, occasional dark fire-flashed ends, sand-struck grain.
    grain = spectral(n, 85, beta=0.2, fmin=n / 6)
    mottle = spectral(n, 86, beta=1.8, fmin=6, fmax=n / 8)
    end_flash = (flash > 0.8) * smoothstep(0.06, 0.0, np.minimum(lu, cw - lu) / cw)
    body = 1.0 + (tone - 0.5) * 0.30 + grain * 0.05 * (0.6 + rough_brick) + mottle * 0.06 - end_flash * 0.35
    body = np.where(flash < 0.06, body * 0.72, body)  # a few dark clinker bricks
    brick_rgb = np.stack([body * 1.0, body * (0.96 + 0.05 * (tone - 0.5)), body * (0.93 + 0.08 * (tone - 0.5))], -1)
    mortar_rgb = np.stack([np.full((n, n), 1.35), np.full((n, n), 1.33), np.full((n, n), 1.26)], -1) * (1 + grain[..., None] * 0.04)
    albedo = mortar_rgb * (1 - face[..., None]) + brick_rgb * face[..., None]
    h = face * 0.006 + grain * 0.00012 * face + mottle * 0.0002 * face - (1 - face) * 0.0005
    ao = cavity(h, 2.5, 0.004)
    albedo = albedo * ao[..., None] ** 0.7
    albedo = albedo / albedo.reshape(-1, 3).mean(0).mean()  # centred on 1 for tinting
    albedo = albedo * 0.5
    rough = np.clip(0.86 + grain * 0.03 + (1 - face) * 0.06, 0.6, 1.0)
    return dict(albedo=albedo, height=h, rough=rough, ao=ao)


MATERIALS = {
    # name: (generator, tile metres, albedo size, normal size, orm size, description)
    'clapboard': (clapboard, 2.0, 1024, 1024, 512, 'Painted lapped clapboard, 0.10 m exposure; neutral white to be tinted by paint colour.'),
    'shingles': (shingles, 3.92, 1024, 1024, 512, 'Laminated architectural asphalt shingles, 0.14 m exposure, blended charcoal and grey granules.'),
    'asphalt': (asphalt, 2.0, 1024, 1024, 512, 'Weathered dense-graded asphalt: oxidised grey binder with exposed 6-16 mm aggregate.'),
    'concrete': (concrete, 2.0, 1024, 512, 512, 'Broom-finished sidewalk concrete with sand, pits and mild staining.'),
    'granite': (granite, 1.0, 512, 512, 256, 'Sawn grey curb granite with feldspar, quartz and biotite grains.'),
    'foundation': (foundation, 2.0, 512, 512, 256, 'Poured concrete foundation with form seams and tie holes.'),
    'cedar': (cedar, 2.0, 1024, 1024, 512, 'Painted or stained cedar wall shingles, 0.125 m exposure, random widths; neutral white to be tinted.'),
    'brick': (brick, 2.0, 1024, 1024, 512, 'Running-bond face brick, 0.2 x 0.067 m module with recessed mortar; neutral, tinted by the brick colour.'),
}


def write_webp(path: Path, rgb8: np.ndarray, quality: int) -> dict:
    img = Image.fromarray(rgb8, 'RGB')
    img.save(path, 'WEBP', quality=quality, method=6)
    data = path.read_bytes()
    return {'url': path.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'size': rgb8.shape[0]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='public/town-materials')
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    out = Path(args.out) / VERSION
    out.mkdir(parents=True, exist_ok=True)
    n = 1024
    manifest = {'version': 1, 'library': VERSION,
                'provenance': 'Procedurally authored from fixed seeds by scripts/town_material_library/generate.py; no photographs or third-party images.',
                'convention': 'Rows follow texture v (flipY false). Normal maps are tangent-space OpenGL (+y along +v). ORM: R ambient occlusion, G roughness, B metalness (0).',
                'materials': {}}
    for name, (gen, tile_m, a_size, n_size, o_size, desc) in MATERIALS.items():
        if args.only and name not in args.only:
            continue
        res = gen(n, tile_m)
        albedo = np.clip(res['albedo'], 0, 1)
        nrm = normal_from_height(res['height'], tile_m / n)
        orm = np.stack([res['ao'], res['rough'], np.zeros_like(res['ao'])], -1)
        files = {
            'albedo': write_webp(out / f'{name}-albedo.webp', to8(srgb(resize(albedo, a_size))), 90),
            'normal': write_webp(out / f'{name}-normal.webp', to8(resize(nrm, n_size) * 0.5 + 0.5), 94),
            'orm': write_webp(out / f'{name}-orm.webp', to8(resize(orm, o_size)), 90),
        }
        mean = albedo.reshape(-1, 3).mean(0)
        manifest['materials'][name] = {'tileM': tile_m, 'description': desc, 'meanLinearAlbedo': [round(float(x), 5) for x in mean], **files}
        print(name, {k: (v['size'], v['bytes']) for k, v in files.items()}, 'mean', np.round(mean, 4))
    if not args.only:
        (Path('data/derived/town') / 'material-library.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
