"""Spherical conic equal-area projections matching d3-geo (as used by d3-composite-projections'
geoAlbersUsaTerritories, fitted to the 1000x640 county frame), plus the slab layout of the scene."""
import numpy as np

K = 1240.583314171773
TX, TY = 528.2480705172319, 315.4452552440835
D2R = np.pi / 180.0

class ConicEA:
    def __init__(self, rotate_lon, center, parallels, scale, translate):
        self.l0 = -rotate_lon            # d3 rotate([154,0]) means central meridian -154
        p1, p2 = parallels[0] * D2R, parallels[1] * D2R
        sy0 = np.sin(p1)
        self.n = (sy0 + np.sin(p2)) / 2.0
        self.c = 1 + sy0 * (2 * self.n - sy0)
        self.r0 = np.sqrt(self.c) / self.n
        self.k = scale
        # d3: projection(center) maps to translate. center is in the rotated frame.
        cx, cy = self._raw(center[0] * D2R, center[1] * D2R)
        self.tx = translate[0] - self.k * cx
        self.ty = translate[1] + self.k * cy
    def _raw(self, lam, phi):
        r = np.sqrt(self.c - 2 * self.n * np.sin(phi)) / self.n
        return r * np.sin(lam * self.n), self.r0 - r * np.cos(lam * self.n)
    def forward(self, lon, lat):
        lam = (np.asarray(lon) - self.l0)
        lam = (lam + 180.0) % 360.0 - 180.0
        x, y = self._raw(lam * D2R, np.asarray(lat) * D2R)
        return self.tx + self.k * x, self.ty - self.k * y
    def inverse(self, X, Y):
        x = (np.asarray(X) - self.tx) / self.k
        y = -(np.asarray(Y) - self.ty) / self.k
        r0y = self.r0 - y
        lam = np.arctan2(x, np.abs(r0y)) * np.sign(r0y)
        if self.n * r0y.min() < 0 if hasattr(r0y, 'min') else self.n * r0y < 0:
            pass
        l = lam / self.n
        rr = np.hypot(x, r0y)
        phi = np.arcsin(np.clip((self.c - rr * rr * self.n * self.n) / (2 * self.n), -1, 1))
        lon = l / D2R + self.l0
        lon = (lon + 180.0) % 360.0 - 180.0
        return lon, phi / D2R

LOWER48 = ConicEA(96, (-0.6, 38.7), (29.5, 45.5), K, (TX, TY))
ALASKA = ConicEA(154, (-2, 58.5), (55, 65), K * 0.35, (TX - 0.307 * K, TY + 0.201 * K))
HAWAII = ConicEA(157, (-3, 19.9), (8, 18), K, (TX - 0.205 * K, TY + 0.212 * K))
PUERTORICO = ConicEA(66, (0, 18), (8, 18), K, (TX + 0.350 * K, TY + 0.224 * K))

# Slab layout: source rectangle in composite-projection units, and the offset that moves it
# to its place in the scene (CONUS stays put; Alaska upper left, Hawaii lower left, PR/VI lower right).
SLABS = {
    'conus': dict(proj=LOWER48, rect=(58.7, 14.8, 998.8, 625.2), offset=(0.0, 0.0), states=None, ppu=6.535, hpu=6.535 / 3),
    'ak': dict(proj=ALASKA, rect=(-2.0, 457.7, 266.7, 610.9), offset=(-230.7 + 2.0, 30.0 - 457.7), states={'02'}, ppu=6.535, hpu=6.535 / 2),
    'hi': dict(proj=HAWAII, rect=(261.4, 520.4, 388.1, 608.0), offset=(-164.0 - 261.4, 466.0 - 520.4), states={'15'}, ppu=8.0, hpu=4.0),
    'pr': dict(proj=PUERTORICO, rect=(916.5, 576.1, 998.0, 606.3), offset=(1018.8 - 916.5, 528.0 - 576.1), states={'72', '78'}, ppu=10.0, hpu=5.0),
}
def slab_of_state(stfp):
    for k, s in SLABS.items():
        if s['states'] and stfp in s['states']: return k
    return 'conus'
