"""texlib — biblioteca de geração procedural de texturas tileable para jogos 3D.

Uso típico (num script próprio ou inline via `python -c`):

    import sys; sys.path.insert(0, '.claude/skills/game-texture-gen/scripts')
    from texlib import *

    h = fbm(512, octaves=6, freq=4, seed=42)          # heightmap tileable [0..1]
    save_gray(h, 'public/textures/rock_height.png')
    save_rgb(normal_from_height(h, strength=3.0), 'public/textures/rock_normal.png')
    save_gray(1.0 - h * 0.6, 'public/textures/rock_rough.png')

Todas as funções retornam arrays numpy float em [0..1] e são TILEABLE
(bordas casam perfeitamente ao repetir a textura).
"""
import numpy as np
from PIL import Image


# ── Ruído ────────────────────────────────────────────────────────────────────

def value_noise(size: int, freq: int, seed: int = 0) -> np.ndarray:
    """Value noise tileable size×size com `freq` células por lado."""
    rng = np.random.default_rng(seed)
    g = rng.random((freq, freq)).astype(np.float32)
    xs = np.linspace(0, freq, size, endpoint=False)
    i0 = np.floor(xs).astype(int) % freq
    i1 = (i0 + 1) % freq
    t = (xs - np.floor(xs)).astype(np.float32)
    t = t * t * (3.0 - 2.0 * t)  # smoothstep

    X0, Y0 = np.meshgrid(i0, i0)
    X1, Y1 = np.meshgrid(i1, i1)
    TX, TY = np.meshgrid(t, t)

    a = g[Y0, X0]
    b = g[Y0, X1]
    c = g[Y1, X0]
    d = g[Y1, X1]
    return (a * (1 - TX) + b * TX) * (1 - TY) + (c * (1 - TX) + d * TX) * TY


def fbm(size: int, octaves: int = 5, freq: int = 4, seed: int = 0,
        persistence: float = 0.5, lacunarity: int = 2) -> np.ndarray:
    """Fractal Brownian Motion tileable — base para rocha, terreno, nuvens."""
    out = np.zeros((size, size), dtype=np.float32)
    amp, f, total = 1.0, freq, 0.0
    for o in range(octaves):
        out += value_noise(size, f, seed + o * 131) * amp
        total += amp
        amp *= persistence
        f *= lacunarity
    return out / total


def ridged(size: int, octaves: int = 5, freq: int = 4, seed: int = 0) -> np.ndarray:
    """FBM 'ridged' (cristas afiadas) — veios de minério, montanhas, raios."""
    out = np.zeros((size, size), dtype=np.float32)
    amp, f, total = 1.0, freq, 0.0
    for o in range(octaves):
        n = value_noise(size, f, seed + o * 131)
        out += (1.0 - np.abs(n * 2.0 - 1.0)) * amp
        total += amp
        amp *= 0.5
        f *= 2
    return out / total


def voronoi(size: int, points: int = 32, seed: int = 0, mode: str = 'f1') -> np.ndarray:
    """Voronoi/celular tileable. mode: 'f1' (distância), 'f2f1' (bordas/rachaduras),
    'cell' (id da célula, útil para cores por célula)."""
    rng = np.random.default_rng(seed)
    pts = rng.random((points, 2)).astype(np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32) / size
    px = xs[..., None] - pts[None, None, :, 0]
    py = ys[..., None] - pts[None, None, :, 1]
    # wrap toroidal para tileabilidade
    px = np.abs(px); px = np.minimum(px, 1.0 - px)
    py = np.abs(py); py = np.minimum(py, 1.0 - py)
    d = np.sqrt(px * px + py * py)
    if mode == 'cell':
        ids = np.argmin(d, axis=-1).astype(np.float32)
        return ids / (points - 1)
    d.sort(axis=-1)
    if mode == 'f2f1':
        out = d[..., 1] - d[..., 0]
    else:
        out = d[..., 0]
    return out / out.max()


# ── Derivação de mapas PBR ───────────────────────────────────────────────────

def normal_from_height(h: np.ndarray, strength: float = 2.0) -> np.ndarray:
    """Converte heightmap → normal map RGB (OpenGL convention, Y+ up)."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    nz = np.ones_like(h)
    length = np.sqrt(dx * dx + dy * dy + nz * nz)
    n = np.stack([-dx / length, dy / length, nz / length], axis=-1)
    return n * 0.5 + 0.5


def ao_from_height(h: np.ndarray, radius: int = 8, strength: float = 1.0) -> np.ndarray:
    """Ambient occlusion aproximado: pontos abaixo da média local ficam escuros."""
    from numpy.fft import fft2, ifft2
    size = h.shape[0]
    ys, xs = np.mgrid[0:size, 0:size]
    ys = np.minimum(ys, size - ys); xs = np.minimum(xs, size - xs)
    kernel = np.exp(-(xs ** 2 + ys ** 2) / (2 * radius ** 2))
    kernel /= kernel.sum()
    blurred = np.real(ifft2(fft2(h) * fft2(kernel)))
    ao = 1.0 - np.clip((blurred - h) * 4.0 * strength, 0, 1)
    return ao


def colorize(gray: np.ndarray, stops: list) -> np.ndarray:
    """Mapeia [0..1] → gradiente de cores. stops = [(pos, (r,g,b)), ...] com rgb 0-255.
    Ex.: colorize(h, [(0.0,(30,25,20)), (0.5,(110,90,70)), (1.0,(200,190,180))])"""
    positions = np.array([s[0] for s in stops], dtype=np.float32)
    colors = np.array([s[1] for s in stops], dtype=np.float32) / 255.0
    out = np.empty(gray.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(gray, positions, colors[:, c])
    return out


# ── Salvamento ───────────────────────────────────────────────────────────────

def save_gray(arr: np.ndarray, path: str):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'L').save(path)
    print(f'saved {path} {a.shape[1]}x{a.shape[0]} gray')


def save_rgb(arr: np.ndarray, path: str):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'RGB').save(path)
    print(f'saved {path} {a.shape[1]}x{a.shape[0]} rgb')


def save_rgba(arr: np.ndarray, path: str):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'RGBA').save(path)
    print(f'saved {path} {a.shape[1]}x{a.shape[0]} rgba')
