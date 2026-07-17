"""spritelib — geração de sprites RGBA para VFX/UI de jogos 3D (partículas, glows,
ícones raster, spritesheets). Saída sempre RGBA com fundo transparente.

Uso:
    import sys; sys.path.insert(0, '.claude/skills/game-sprite-gen/scripts')
    from spritelib import *

    save(glow(256, (120, 200, 255)), 'public/sprites/glow_blue.png')
    sheet = spritesheet([smoke_puff(128, seed=i) for i in range(8)], cols=4)
    save(sheet, 'public/sprites/smoke_sheet.png')
"""
import numpy as np
from PIL import Image


def _coords(size):
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    xs = (xs + 0.5) / size * 2 - 1
    ys = (ys + 0.5) / size * 2 - 1
    return xs, ys, np.sqrt(xs * xs + ys * ys)


def _rgba(size, color, alpha):
    out = np.zeros((size, size, 4), dtype=np.float32)
    c = np.array(color, dtype=np.float32) / 255.0
    a = np.clip(alpha, 0, 1)
    out[..., 0] = c[0]; out[..., 1] = c[1]; out[..., 2] = c[2]
    out[..., 3] = a
    return out


# ── Sprites de partícula ─────────────────────────────────────────────────────

def glow(size: int, color, core: float = 0.1, falloff: float = 2.2,
         core_white: bool = True) -> np.ndarray:
    """Glow radial clássico (aditivo). core_white deixa o centro branco-quente."""
    _, _, r = _coords(size)
    a = np.clip(1.0 - r, 0, 1) ** falloff
    out = _rgba(size, color, a)
    if core_white:
        w = np.clip(1.0 - r / max(core, 1e-4), 0, 1) ** 2
        for c in range(3):
            out[..., c] = out[..., c] * (1 - w) + w
    return out


def ring(size: int, color, radius: float = 0.7, width: float = 0.12,
         falloff: float = 1.5) -> np.ndarray:
    """Anel (shockwave, indicador de range/AoE)."""
    _, _, r = _coords(size)
    a = np.clip(1.0 - np.abs(r - radius) / width, 0, 1) ** falloff
    return _rgba(size, color, a)


def star_burst(size: int, color, spikes: int = 6, sharpness: float = 8.0,
               falloff: float = 1.8) -> np.ndarray:
    """Estrela de N pontas (flash de impacto, brilho de gema)."""
    xs, ys, r = _coords(size)
    ang = np.arctan2(ys, xs)
    spike = np.abs(np.cos(ang * spikes / 2)) ** sharpness
    a = np.clip(1.0 - r / (0.3 + 0.7 * spike), 0, 1) ** falloff
    return _rgba(size, color, a)


def smoke_puff(size: int, color=(200, 200, 200), seed: int = 0,
               density: float = 0.8) -> np.ndarray:
    """Nuvem/fumaça com ruído — usar vários seeds para animação em spritesheet."""
    rng = np.random.default_rng(seed)
    freq = 4
    g = rng.random((freq, freq)).astype(np.float32)
    big = np.array(Image.fromarray((g * 255).astype(np.uint8), 'L')
                   .resize((size, size), Image.BICUBIC), dtype=np.float32) / 255.0
    _, _, r = _coords(size)
    mask = np.clip(1.0 - r, 0, 1) ** 1.5
    a = np.clip(big * mask * 2.0 * density, 0, 1)
    return _rgba(size, color, a)


def droplet(size: int, color=(150, 220, 255)) -> np.ndarray:
    """Gota/lágrima vertical (água, veneno)."""
    xs, ys, _ = _coords(size)
    w = 0.35 * (1.0 + ys * 0.8)          # mais fina no topo
    body = np.sqrt((xs / np.maximum(w, 0.05)) ** 2 + (ys / 0.8) ** 2)
    a = np.clip(1.0 - body, 0, 1) ** 0.8
    out = _rgba(size, color, a)
    hl = np.clip(1.0 - np.sqrt((xs + 0.15) ** 2 + (ys + 0.25) ** 2) / 0.18, 0, 1)
    for c in range(3):
        out[..., c] = np.clip(out[..., c] + hl * 0.8, 0, 1)
    return out


# ── Composição ───────────────────────────────────────────────────────────────

def spritesheet(frames: list, cols: int) -> np.ndarray:
    """Empacota frames RGBA (mesmo tamanho) numa grade cols × ceil(n/cols)."""
    n = len(frames)
    rows = (n + cols - 1) // cols
    fh, fw = frames[0].shape[:2]
    sheet = np.zeros((rows * fh, cols * fw, 4), dtype=np.float32)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = f
    return sheet


def over(base: np.ndarray, top: np.ndarray) -> np.ndarray:
    """Alpha compositing top sobre base (mesmo tamanho)."""
    ta = top[..., 3:4]
    out = base.copy()
    out[..., :3] = top[..., :3] * ta + base[..., :3] * (1 - ta)
    out[..., 3:4] = ta + base[..., 3:4] * (1 - ta)
    return out


def save(arr: np.ndarray, path: str):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'RGBA').save(path)
    print(f'saved {path} {a.shape[1]}x{a.shape[0]} rgba')
