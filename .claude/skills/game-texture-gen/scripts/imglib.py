"""imglib — transforma uma IMAGEM DE REFERÊNCIA (enviada pelo usuário) em assets de jogo:
textura tileable, mapas PBR derivados (normal/roughness), paleta de cores e sprites
com fundo removido.

Uso:
    import sys; sys.path.insert(0, '.claude/skills/game-texture-gen/scripts')
    from imglib import *

    img = load('referencia.png', size=512)
    til = make_tileable(img, blend=0.25)
    save_rgb(til, 'public/textures/ref_albedo.png')
    save_rgb(normal_from_image(til, strength=3.0), 'public/textures/ref_normal.png')
    print(palette(img, 5))   # cores dominantes p/ usar em constants.ts / materiais
"""
import numpy as np
from PIL import Image
from texlib import normal_from_height, save_gray, save_rgb, save_rgba  # noqa: F401


# ── Entrada ──────────────────────────────────────────────────────────────────

def load(path: str, size: int | None = None) -> np.ndarray:
    """Carrega imagem → float RGB [0..1]. size opcional redimensiona para quadrado."""
    im = Image.open(path).convert('RGB')
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def load_rgba(path: str, size: int | None = None) -> np.ndarray:
    im = Image.open(path).convert('RGBA')
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


# ── Análise ──────────────────────────────────────────────────────────────────

def palette(img: np.ndarray, n: int = 5) -> list:
    """Cores dominantes via k-means simples. Retorna [(r,g,b) 0-255, ...] por frequência.
    Útil para casar materiais/VFX com a arte de referência."""
    px = img[..., :3].reshape(-1, 3)
    px = px[::max(1, len(px) // 4096)]
    rng = np.random.default_rng(0)
    centers = px[rng.choice(len(px), n, replace=False)]
    for _ in range(12):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for k in range(n):
            sel = px[lab == k]
            if len(sel):
                centers[k] = sel.mean(0)
    counts = np.bincount(lab, minlength=n)
    order = counts.argsort()[::-1]
    return [tuple(int(c * 255) for c in centers[k]) for k in order]


def luminance(img: np.ndarray) -> np.ndarray:
    return img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114


# ── Textura a partir da referência ───────────────────────────────────────────

def make_tileable(img: np.ndarray, blend: float = 0.25) -> np.ndarray:
    """Torna a imagem tileable: desloca 50% nos dois eixos e funde as costuras
    com blend suave. blend = fração da imagem usada na fusão (0.15–0.35)."""
    h, w = img.shape[:2]
    shifted = np.roll(np.roll(img, h // 2, axis=0), w // 2, axis=1)
    bw = max(int(w * blend), 2)
    center = w // 2
    # máscara 2D: 1 perto das costuras (centro do shifted), 0 longe
    xs = np.abs(np.arange(w) - center) / bw
    mask_x = np.clip(1 - xs, 0, 1) ** 2
    ys = np.abs(np.arange(h) - h // 2) / bw
    mask_y = np.clip(1 - ys, 0, 1) ** 2
    m = np.maximum(mask_x[None, :], mask_y[:, None])[..., None]
    # funde o original (sem costura no centro) sobre o shifted (costura no centro)
    return shifted * (1 - m) + img * m


def normal_from_image(img: np.ndarray, strength: float = 3.0,
                      smooth: int = 2) -> np.ndarray:
    """Normal map a partir da luminância da foto (aproximação height-from-shading)."""
    h = luminance(img)
    for _ in range(smooth):
        h = (h + np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1)) / 5
    return normal_from_height(h, strength)


def roughness_from_image(img: np.ndarray, base: float = 0.6,
                         variation: float = 0.35, invert: bool = True) -> np.ndarray:
    """Roughness a partir da luminância (claro = liso por padrão; invert=False inverte)."""
    l = luminance(img)
    l = (l - l.min()) / max(l.max() - l.min(), 1e-6)
    return np.clip(base + (1 - l if invert else l - 0.5) * variation, 0, 1)


# ── Sprite a partir da referência ────────────────────────────────────────────

def remove_background(img: np.ndarray, tol: float = 0.12,
                      soft: float = 0.08) -> np.ndarray:
    """Remove fundo de cor ~uniforme (amostra dos 4 cantos) → RGBA para sprite."""
    rgb = img[..., :3]
    h, w = rgb.shape[:2]
    corners = np.stack([rgb[2, 2], rgb[2, w - 3], rgb[h - 3, 2], rgb[h - 3, w - 3]])
    bg = corners.mean(0)
    d = np.sqrt(((rgb - bg) ** 2).sum(-1))
    a = np.clip((d - tol) / max(soft, 1e-6), 0, 1)
    out = np.concatenate([rgb, a[..., None]], axis=-1)
    return out.astype(np.float32)
