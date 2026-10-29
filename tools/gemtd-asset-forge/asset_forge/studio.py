"""Local web studio for turning four fixed reference views into a GemSpec.

The browser never receives the OpenRouter key. Images are uploaded only to this
local Python server, which calls OpenRouter and saves the resulting asset files.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .candidates import construction_plan, make_candidates, summary as candidate_summary
from .geometry import create_asset
from .glb import write_glb

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "out"
BLENDER_SCRIPT = ROOT / "blender" / "validate_glb.py"
MAX_BODY_BYTES = 32 * 1024 * 1024
VIEW_NAMES = ("front", "right", "back", "left")
# Fast multimodal analysis for every iteration. Use GPT-6 Astra only as a
# deliberate final-review choice after the procedural candidate is already good.
DEFAULT_VISION_MODEL = "google/gemini-3.8-flash"
# Prompt-only planning does not need image capability. This version supports
# OpenRouter structured output and is served by multiple text providers.
DEFAULT_PROMPT_MODEL = "deepseek/deepseek-chat-v3-0324"


def load_dotenv() -> None:
    """Load local configuration without adding a python-dotenv dependency."""
    dotenv = ROOT / ".env"
    if not dotenv.exists():
        return
    for line in dotenv.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key.strip()):
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not result:
        raise ValueError("Use an asset id containing letters or numbers.")
    return result[:80]


def asset_directory(asset_id: str) -> Path:
    """All generated and reference files for one asset live in one bundle."""
    return OUT_DIR / asset_id


def output_url(path: Path) -> str:
    relative = path.relative_to(OUT_DIR).as_posix()
    return f"/files/out/{urllib.parse.quote(relative)}"


def clamp(value: Any, minimum: float, maximum: float, default: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
    except (TypeError, ValueError):
        return default


def number_pair(value: Any, minimum: float, maximum: float, default: tuple[float, float]) -> list[float]:
    if not isinstance(value, list) or len(value) != 2:
        return list(default)
    a, b = (clamp(item, minimum, maximum, default[index]) for index, item in enumerate(value))
    return [min(a, b), max(a, b)]


def number_triplet(value: Any, minimum: float, maximum: float, default: tuple[float, float, float]) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        return list(default)
    return [clamp(item, minimum, maximum, default[index]) for index, item in enumerate(value)]


def color(value: Any, default: str) -> str:
    if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return value.lower()
    return default


def normalise_geode(candidate: dict[str, Any], asset_id: str) -> dict[str, Any]:
    """Constrain the allow-listed organic geode generator parameters."""
    geode = candidate.get("geode") if isinstance(candidate.get("geode"), dict) else {}
    material = candidate.get("material") if isinstance(candidate.get("material"), dict) else {}
    finish = candidate.get("finish") if isinstance(candidate.get("finish"), dict) else {}
    surface = candidate.get("surface") if isinstance(candidate.get("surface"), dict) else {}
    texture = candidate.get("texture") if isinstance(candidate.get("texture"), dict) else {}
    vfx = candidate.get("vfx") if isinstance(candidate.get("vfx"), dict) else {}
    try:
        seed = int(candidate.get("seed", 723941)) & 0xFFFFFFFF
    except (TypeError, ValueError):
        seed = 723941
    mode = surface.get("mode") if surface.get("mode") in {"faceted", "softened", "sculpted"} else "sculpted"
    defaults = {"faceted": (0, 0.0), "softened": (1, 0.035), "sculpted": (2, 0.075)}[mode]
    return {
        "$schema": "../gem-spec.schema.json", "id": asset_id, "kind": "geode-egg", "seed": seed, "quality": "hero",
        "geode": {"radius": clamp(geode.get("radius"), 0.35, 1.4, 0.9), "height": clamp(geode.get("height"), 0.8, 3.5, 2.1), "coreRadius": clamp(geode.get("coreRadius"), 0.2, 0.75, 0.48), "coreHeight": clamp(geode.get("coreHeight"), 0.2, 0.8, 0.42), "loosePlates": round(clamp(geode.get("loosePlates"), 0, 16, 0))},
        "material": {"rockColor": color(material.get("rockColor"), "#5d564e"), "baseColor": color(material.get("baseColor"), "#8fdef4"), "emissive": color(material.get("emissive"), "#bdf7ff"), "emissiveIntensity": clamp(material.get("emissiveIntensity"), 0, 3, 1.2), "roughness": clamp(material.get("roughness"), 0.02, 1, 0.26), "metalness": clamp(material.get("metalness"), 0, 1, 0.02), "transmission": clamp(material.get("transmission"), 0, 1, 0.18)},
        "finish": {"edgeRadius": clamp(finish.get("edgeRadius"), 0.001, 0.04, 0.009), "bevelSegments": round(clamp(finish.get("bevelSegments"), 1, 6, 3)), "smoothAngleDegrees": clamp(finish.get("smoothAngleDegrees"), 10, 80, 38)},
        "surface": {"mode": mode, "iterations": round(clamp(surface.get("iterations"), 0, 4, defaults[0])), "strength": clamp(surface.get("strength"), 0, 0.18, defaults[1]), "preserveVolume": True},
        "texture": {"resolution": round(clamp(texture.get("resolution"), 1024, 4096, 4096)), "pattern": str(texture.get("pattern", "weathered mineral strata around a luminous geode cavity"))[:160], "veinContrast": clamp(texture.get("veinContrast"), 0, 1, 0.42), "normalStrength": clamp(texture.get("normalStrength"), 0, 2, 0.55)},
        "vfx": {"kind": str(vfx.get("kind", "aether-motes-and-wisps"))[:48], "count": round(clamp(vfx.get("count"), 0, 500, 164)), "radius": clamp(vfx.get("radius"), 0.1, 3, 1.12), "speed": number_pair(vfx.get("speed"), 0, 8, (0.08, 0.48)), "color": color(vfx.get("color"), "#bdf7ff")},
        "export": {"targetTriangles": 100000, "output": f"out/{asset_id}/model.glb"},
    }


def visual_defaults(context: str) -> dict[str, Any]:
    """Semantic fallbacks prevent an incomplete LLM palette becoming Ruby red."""
    text = context.lower()
    if any(token in text for token in ("diamante", "diamond")):
        return {"baseColor": "#d8f7ff", "emissive": "#eafcff", "emissiveIntensity": 0.16, "roughness": 0.12, "metalness": 0.0, "transmission": 0.72, "vfxKind": "subtle-diamond-crystal-dust", "vfxColor": "#dffaff", "solitary": True, "rawFaceted": True}
    if any(token in text for token in ("safira", "sapphire")):
        return {"baseColor": "#2474d8", "emissive": "#0b2e88", "emissiveIntensity": 0.28, "roughness": 0.16, "metalness": 0.02, "transmission": 0.16, "vfxKind": "crystal-sparks", "vfxColor": "#5fb4ff", "solitary": False, "rawFaceted": False}
    return {"baseColor": "#c1122f", "emissive": "#39000b", "emissiveIntensity": 0.45, "roughness": 0.22, "metalness": 0.03, "transmission": 0.06, "vfxKind": "crystal-sparks", "vfxColor": "#c1122f", "solitary": False, "rawFaceted": False}


def normalise_organic(candidate: dict[str, Any], asset_id: str) -> dict[str, Any]:
    """Constrain an articulated creature/guardian to safe modular primitives."""
    organic = candidate.get("organic") if isinstance(candidate.get("organic"), dict) else {}
    body = organic.get("body") if isinstance(organic.get("body"), dict) else {}
    limbs = organic.get("limbs") if isinstance(organic.get("limbs"), dict) else {}
    armor = organic.get("armor") if isinstance(organic.get("armor"), dict) else {}
    material = candidate.get("material") if isinstance(candidate.get("material"), dict) else {}
    finish = candidate.get("finish") if isinstance(candidate.get("finish"), dict) else {}
    surface = candidate.get("surface") if isinstance(candidate.get("surface"), dict) else {}
    texture = candidate.get("texture") if isinstance(candidate.get("texture"), dict) else {}
    vfx = candidate.get("vfx") if isinstance(candidate.get("vfx"), dict) else {}
    try:
        seed = int(candidate.get("seed", 917263)) & 0xFFFFFFFF
    except (TypeError, ValueError):
        seed = 917263
    mode = surface.get("mode") if surface.get("mode") in {"faceted", "softened", "sculpted"} else "sculpted"
    defaults = {"faceted": (0, 0.0), "softened": (1, 0.035), "sculpted": (2, 0.065)}[mode]
    return {
        "$schema": "../gem-spec.schema.json", "id": asset_id, "kind": "organic-guardian", "seed": seed, "quality": "hero",
        "organic": {
            "body": {"length": clamp(body.get("length"), 0.55, 3.6, 1.8), "width": clamp(body.get("width"), 0.25, 1.8, 0.82), "height": clamp(body.get("height"), 0.35, 3.2, 1.05), "headScale": clamp(body.get("headScale"), 0.2, 1.25, 0.58)},
            "limbs": {"count": round(clamp(limbs.get("count"), 0, 8, 4)), "length": clamp(limbs.get("length"), 0.2, 2.8, 0.95), "radius": clamp(limbs.get("radius"), 0.035, 0.42, 0.16), "stance": clamp(limbs.get("stance"), 0.0, 1.0, 0.62)},
            "armor": {"plateCount": round(clamp(armor.get("plateCount"), 0, 96, 28)), "plateScale": clamp(armor.get("plateScale"), 0.04, 0.55, 0.18), "spikeLength": clamp(armor.get("spikeLength"), 0, 0.85, 0.16)},
            "tailLength": clamp(organic.get("tailLength"), 0, 3.5, 0.9),
        },
        "material": {"rockColor": color(material.get("rockColor"), "#3d4552"), "baseColor": color(material.get("baseColor"), "#6e9db2"), "emissive": color(material.get("emissive"), "#07141d"), "emissiveIntensity": clamp(material.get("emissiveIntensity"), 0, 3, 0.15), "roughness": clamp(material.get("roughness"), 0.02, 1, 0.46), "metalness": clamp(material.get("metalness"), 0, 1, 0.02), "transmission": clamp(material.get("transmission"), 0, 1, 0.0)},
        "finish": {"edgeRadius": clamp(finish.get("edgeRadius"), 0.001, 0.04, 0.008), "bevelSegments": round(clamp(finish.get("bevelSegments"), 1, 6, 3)), "smoothAngleDegrees": clamp(finish.get("smoothAngleDegrees"), 10, 80, 42)},
        "surface": {"mode": mode, "iterations": round(clamp(surface.get("iterations"), 0, 4, defaults[0])), "strength": clamp(surface.get("strength"), 0, 0.18, defaults[1]), "preserveVolume": True},
        "texture": {"resolution": round(clamp(texture.get("resolution"), 1024, 4096, 4096)), "pattern": str(texture.get("pattern", "layered hide, scale boundaries and worn armor plates"))[:160], "veinContrast": clamp(texture.get("veinContrast"), 0, 1, 0.35), "normalStrength": clamp(texture.get("normalStrength"), 0, 2, 0.62)},
        "vfx": {"kind": str(vfx.get("kind", "guardian-dust-and-embers"))[:48], "count": round(clamp(vfx.get("count"), 0, 500, 48)), "radius": clamp(vfx.get("radius"), 0.1, 3, 1.2), "speed": number_pair(vfx.get("speed"), 0, 8, (0.05, 0.34)), "color": color(vfx.get("color"), color(material.get("emissive"), "#89d8ff"))},
        "export": {"targetTriangles": 180000, "output": f"out/{asset_id}/model.glb"},
    }


def normalise_spec(candidate: dict[str, Any], asset_id: str, context: str = "") -> dict[str, Any]:
    """Constrain LLM output to valid, game-appropriate procedural parameters."""
    if candidate.get("kind") == "geode-egg":
        return normalise_geode(candidate, asset_id)
    if candidate.get("kind") == "organic-guardian":
        return normalise_organic(candidate, asset_id)
    cluster = candidate.get("cluster") if isinstance(candidate.get("cluster"), dict) else {}
    primary = cluster.get("primaryCrystal") if isinstance(cluster.get("primaryCrystal"), dict) else {}
    satellites = cluster.get("satellites") if isinstance(cluster.get("satellites"), dict) else {}
    material = candidate.get("material") if isinstance(candidate.get("material"), dict) else {}
    finish = candidate.get("finish") if isinstance(candidate.get("finish"), dict) else {}
    surface = candidate.get("surface") if isinstance(candidate.get("surface"), dict) else {}
    texture = candidate.get("texture") if isinstance(candidate.get("texture"), dict) else {}
    vfx = candidate.get("vfx") if isinstance(candidate.get("vfx"), dict) else {}
    defaults = visual_defaults(context + " " + json.dumps(candidate, ensure_ascii=False))
    try:
        seed = int(candidate.get("seed", 3281)) & 0xFFFFFFFF
    except (TypeError, ValueError):
        seed = 3281
    # The Studio is intentionally an art-source tool. It always generates the
    # high-density editable master; an optimized derivative can be made later.
    quality = "hero"
    surface_mode = "faceted" if defaults["rawFaceted"] else surface.get("mode") if surface.get("mode") in {"faceted", "softened", "sculpted"} else "softened"
    default_iterations, default_strength = {"faceted": (0, 0.0), "softened": (1, 0.035), "sculpted": (2, 0.09)}[surface_mode]
    return {
        "$schema": "../gem-spec.schema.json",
        "id": asset_id,
        "kind": "crystal-cluster",
        "seed": seed,
        "quality": quality,
        "cluster": {
            "composition": "solitary" if cluster.get("composition") == "solitary" or defaults["solitary"] else "cluster",
            "primaryCrystal": {
                "form": "rough-diamond" if defaults["rawFaceted"] else "prism",
                "sides": round(clamp(primary.get("sides"), 4, 8, 6)),
                "height": clamp(primary.get("height"), 0.35, 3.0, 1.5),
                "radius": clamp(primary.get("radius"), 0.05, 0.9, 0.25),
                "tipSharpness": clamp(primary.get("tipSharpness"), 0.4, 0.99, 0.88),
                "tiltDegrees": number_triplet(primary.get("tiltDegrees"), -40, 40, (0, 0, 0)),
            },
            "satellites": {
                "count": 0 if defaults["solitary"] else round(clamp(satellites.get("count"), 0, 15, 6)),
                "heightRange": number_pair(satellites.get("heightRange"), 0.1, 2.5, (0.42, 1.05)),
                "radiusRange": number_pair(satellites.get("radiusRange"), 0.04, 0.45, (0.09, 0.19)),
                "spreadRadius": clamp(satellites.get("spreadRadius"), 0.1, 1.2, 0.55),
                "tiltRangeDegrees": number_pair(satellites.get("tiltRangeDegrees"), 0, 50, (8, 28)),
            },
            "baseRadius": min(0.14, clamp(cluster.get("baseRadius"), 0.12, 1.2, 0.12)) if defaults["solitary"] else clamp(cluster.get("baseRadius"), 0.12, 1.2, 0.5),
        },
        "material": {
            "baseColor": color(material.get("baseColor", material.get("color")), defaults["baseColor"]),
            "emissive": color(material.get("emissive", material.get("glowColor")), defaults["emissive"]),
            "emissiveIntensity": clamp(material.get("emissiveIntensity", material.get("glow")), 0, 3, defaults["emissiveIntensity"]),
            "roughness": clamp(material.get("roughness"), 0.02, 1, defaults["roughness"]),
            "metalness": clamp(material.get("metalness"), 0, 1, defaults["metalness"]),
            "transmission": clamp(material.get("transmission"), 0, 1, defaults["transmission"]),
        },
        "finish": {
            "edgeRadius": clamp(finish.get("edgeRadius"), 0.001, 0.04, 0.012),
            "bevelSegments": round(clamp(finish.get("bevelSegments"), 1, 6, 3)),
            "smoothAngleDegrees": clamp(finish.get("smoothAngleDegrees"), 10, 80, 32),
        },
        "surface": {
            "mode": surface_mode,
            "iterations": round(clamp(surface.get("iterations"), 0, 4, default_iterations)),
            "strength": clamp(surface.get("strength"), 0, 0.18, default_strength),
            "preserveVolume": True,
        },
        "texture": {
            "resolution": round(clamp(texture.get("resolution"), 1024, 4096, 4096)),
            "pattern": str(texture.get("pattern", "subtle internal crystalline veins"))[:160],
            "veinContrast": clamp(texture.get("veinContrast"), 0, 1, 0.22),
            "normalStrength": clamp(texture.get("normalStrength"), 0, 2, 0.32),
        },
        "vfx": {
            "kind": str(vfx.get("kind", defaults["vfxKind"]))[:48],
            "count": round(clamp(vfx.get("count"), 0, 500, 24 if defaults["solitary"] else 96)),
            "radius": clamp(vfx.get("radius"), 0.1, 3, 0.38 if defaults["solitary"] else 0.85),
            "speed": number_pair(vfx.get("speed"), 0, 8, (0.02, 0.12) if defaults["solitary"] else (0.15, 0.8)),
            "color": color(vfx.get("color"), defaults["vfxColor"]),
        },
        "export": {"targetTriangles": 75000 if quality == "hero" else 4000, "output": f"out/{asset_id}/model.glb"},
    }


def parse_llm_json(content: str) -> dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The selected model did not return a JSON object.")
    value = json.loads(content[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("The selected model did not return a JSON object.")
    return value


def model_text(content: Any) -> str:
    """Normalise OpenAI-compatible content variants into the model's text."""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        for key in ("text", "content"):
            if key in content:
                return model_text(content[key])
        # A few compatible providers return the JSON object itself as content.
        return json.dumps(content)
    if isinstance(content, list):
        return "".join(model_text(part) for part in content)
    return ""


def _openrouter_endpoint(base_url: str) -> str:
    base_url = base_url.rstrip("/")
    return base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"


def _jev_endpoint(base_url: str) -> str:
    """The typed Decisions API is deliberately separate from chat completions."""
    root = base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[:-3]
    return f"{root}/alpha/decisions"


def call_jev(*, state: dict[str, Any], questions: dict[str, Any]) -> dict[str, Any]:
    """Ask Jev for bounded decisions only; it never receives code to execute."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    base_url = os.environ.get("OPENROUTER_BASE_URL")
    if not api_key or not base_url:
        raise RuntimeError("OPENROUTER_API_KEY and OPENROUTER_BASE_URL are required for Jev.")
    payload = json.dumps({"model": "typesafe/jev-1.13", "state": state, "questions": questions}).encode("utf-8")
    request = urllib.request.Request(
        _jev_endpoint(base_url), data=payload, method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Jev returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Jev through OpenRouter: {error.reason}") from error
    if not isinstance(result.get("answers"), dict):
        raise RuntimeError("Jev did not return a typed decision response.")
    return result


def route_prompt_with_jev(prompt: str) -> dict[str, Any]:
    """Make bounded production decisions before an art-director model is called."""
    families = {
        "crystal-cluster": "Use for exposed pointed crystals with a separate mineral base; not a rounded carved shell or articulated creature.",
        "geode-egg": "Use for a single continuous rounded rock shell, normally carved/opened to reveal an inner luminous core.",
        "organic-guardian": "Use for a static creature or living golem with a body, head, limbs, armor plates and optional tail.",
    }
    routes = {
        "silhouette-first": "A prop whose recognizability depends chiefly on one dominant outline and proportion.",
        "anatomy-first": "A creature/golem whose body mass, head position, stance and limb reach must be approved before surface detail.",
        "cavity-surface-first": "A carved or mineral object whose interior/exterior relationship and material boundary are the main design problem.",
    }
    research = {
        "anatomy-and-function": "Research biological anatomy, skeletal arrangement or functional construction before parameterizing forms.",
        "material-and-construction": "Research strata, erosion, mineral growth, manufactured assembly or material response before parameterizing forms.",
        "no-external-research": "The prompt is sufficiently fictional/stylized; use internal art direction only.",
    }
    decision = call_jev(
        state={"description": f"Classify this requested game asset before any geometry is generated. Creator prompt: {prompt[:8000]}"},
        questions={
            "family": {"type": "choice", "instructions": "Choose the one executable family that should own this asset's first procedural master.", "criteria": families},
            "construction_route": {"type": "choice", "instructions": "Choose the first construction review that prevents the most expensive wrong turn.", "criteria": routes},
            "research_priority": {"type": "choice", "instructions": "Choose what external research, if any, has the highest leverage before modeling.", "criteria": research},
        },
    )
    answers = decision["answers"]
    values = {"family": families, "construction_route": routes, "research_priority": research}
    route: dict[str, Any] = {"decision": decision, "choices": {}}
    for name, allowed in values.items():
        answer = answers.get(name, {})
        choice = answer.get("choice") if isinstance(answer, dict) else None
        if choice not in allowed:
            raise RuntimeError(f"Jev returned an invalid {name} route.")
        route["choices"][name] = {"choice": choice, "confidence": answer.get("confidence"), "reason": allowed[choice]}
    return route


def conduct_research(*, model: str, prompt: str, route: dict[str, Any]) -> dict[str, Any]:
    """Run one mandatory, source-audited web research pass before art direction.

    OpenRouter's newer server tool is intentionally model-decided. For this
    explicit user-requested research phase we use its compatible web plugin,
    which executes one search deterministically. The returned sources are
    required; no ungrounded fallback is silently substituted.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    base_url = os.environ.get("OPENROUTER_BASE_URL")
    if not api_key or not base_url:
        raise RuntimeError("OPENROUTER_API_KEY and OPENROUTER_BASE_URL are required for research.")
    choices = route["choices"]
    system = """You are a research librarian supporting a 3D technical artist. A web search has been executed for this request. Extract only useful, checkable facts about anatomy, physical construction, surface formation, proportion, or material behavior. Prefer museums, universities, peer-reviewed sources, technical manuals and primary organizations over blogs, stores or SEO pages. Return ONLY JSON: {"queries":[string],"findings":[string],"sources":[{"title":string,"url":string}]}. Include 2 to 6 real source URLs from the supplied search context. Do not invent sources, code, or geometry."""
    user = f"Creator prompt: {prompt}\nJev family: {choices['family']['choice']}\nJev construction route: {choices['construction_route']['choice']}\nResearch priority: {choices['research_priority']['choice']}"
    payload = {
        "model": model, "temperature": 0.0, "max_tokens": 2500, "response_format": {"type": "json_object"},
        # The legacy plugin runs once by design; unlike server tools it does not
        # leave whether research happens to the model's discretion.
        "plugins": [{"id": "web", "engine": "exa", "max_results": 5}],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    request = urllib.request.Request(_openrouter_endpoint(base_url), data=json.dumps(payload).encode("utf-8"), method="POST", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.loads(response.read().decode("utf-8"))
        message = result["choices"][0]["message"]
        value = parse_llm_json(model_text(message["content"]))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Web research returned HTTP {error.code}: {detail}") from error
    except (urllib.error.URLError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Web research did not produce a valid dossier: {error}") from error

    sources: list[dict[str, str]] = []
    raw_sources = value.get("sources", []) if isinstance(value, dict) else []
    if isinstance(raw_sources, list):
        for source in raw_sources[:8]:
            if isinstance(source, dict) and str(source.get("url", "")).startswith(("https://", "http://")):
                sources.append({"title": str(source.get("title", "source"))[:180], "url": str(source["url"])[:1000]})
    if not sources:
        annotations = message.get("annotations", []) if isinstance(message, dict) else []
        if isinstance(annotations, list):
            for annotation in annotations[:8]:
                if isinstance(annotation, dict) and str(annotation.get("url", "")).startswith(("https://", "http://")):
                    sources.append({"title": str(annotation.get("title", "source"))[:180], "url": str(annotation["url"])[:1000]})
    if not sources:
        raise RuntimeError("Web research returned no auditable sources. Try again, or uncheck research to deliberately proceed without it.")
    findings = value.get("findings", []) if isinstance(value, dict) else []
    queries = value.get("queries", []) if isinstance(value, dict) else []
    return {"model": model, "queries": [str(item)[:240] for item in queries[:8]] if isinstance(queries, list) else [], "findings": [str(item)[:500] for item in findings[:16]] if isinstance(findings, list) else [], "sources": sources}


def _vision_content(asset_id: str, images: dict[str, str]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{
        "type": "text",
        "text": f"Asset id: {asset_id}. The next four images have fixed, known directions.",
    }]
    labels = {"front": "FRONT", "right": "RIGHT", "back": "BACK", "left": "LEFT"}
    for view in VIEW_NAMES:
        content.extend((
            {"type": "text", "text": f"View: {labels[view]}"},
            {"type": "image_url", "image_url": {"url": images[view]}},
        ))
    return content


def _call_vision_json(*, model: str, system: str, content: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    base_url = os.environ.get("OPENROUTER_BASE_URL")
    if not api_key or not base_url:
        raise RuntimeError("OPENROUTER_API_KEY and OPENROUTER_BASE_URL are required in .env.")
    payload = json.dumps({"model": model, "temperature": 0.1, "max_tokens": 3000, "response_format": {"type": "json_object"}, "messages": [
        {"role": "system", "content": system}, {"role": "user", "content": content},
    ]}).encode("utf-8")
    request = urllib.request.Request(_openrouter_endpoint(base_url), data=payload, method="POST", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
        return parse_llm_json(model_text(result["choices"][0]["message"]["content"]))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach OpenRouter: {error.reason}") from error
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Invalid vision response: {error}") from error


def observe_views(*, model: str, asset_id: str, images: dict[str, str]) -> dict[str, Any]:
    """Perceive the reference only; classification remains Jev's responsibility."""
    system = """You are a neutral visual observer for a game-asset workshop. Inspect the four fixed orthographic views of one object. Do not choose a generator, do not suggest code, and do not invent hidden detail. Return ONLY JSON with objectDescription, silhouette, visibleParts, articulationCues, cavityOrInteriorCues, materialCues, symmetry, and uncertainty. Each value must be a short string or an array of short strings."""
    return _call_vision_json(model=model, system=system, content=_vision_content(asset_id, images))


def call_openrouter(*, model: str, asset_id: str, images: dict[str, str], route: dict[str, Any] | None = None) -> dict[str, Any]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    base_url = os.environ.get("OPENROUTER_BASE_URL")
    if not api_key or not base_url:
        raise RuntimeError("OPENROUTER_API_KEY and OPENROUTER_BASE_URL are required in .env.")
    content = _vision_content(asset_id, images)
    system = """You are the technical art director for GemTD, a mobile isometric tower-defense game.
Analyze four orthographic views of exactly one stylized game prop. Infer only visible, consistent structure.
First choose kind: use crystal-cluster for exposed pointed crystals; use geode-egg only for a rounded organic rock shell with a visible glowing inner core; use organic-guardian for a creature/living golem with a torso, head and articulated limbs. Return ONLY one JSON object.
For crystal-cluster, return keys kind, seed, quality, cluster, material, finish, surface, texture, vfx.
For geode-egg, return keys kind, seed, quality, geode, material, finish, surface, texture, vfx; geode={radius(0.35-1.4),height(0.8-3.5),coreRadius(0.2-0.75),coreHeight(0.2-0.8),loosePlates(0-16)}. For a carved egg, use loosePlates:0: surface irregularity must come from the continuous shell.
For organic-guardian, return keys kind, seed, quality, organic, material, finish, surface, texture, vfx; organic={body:{length(0.55-3.6),width(0.25-1.8),height(0.35-3.2),headScale(0.2-1.25)},limbs:{count(0-8),length(0.2-2.8),radius(0.035-0.42),stance(0-1)},armor:{plateCount(0-96),plateScale(0.04-0.55),spikeLength(0-0.85)},tailLength(0-3.5)}. It is a static, separately editable master, not a rigged character.
cluster.primaryCrystal={sides(4-8),height(0.35-3),radius(0.05-0.9),tipSharpness(0.4-0.99),tiltDegrees:[x,y,z]}.
cluster.satellites={count(0-15),heightRange:[min,max],radiusRange:[min,max],spreadRadius(0.1-1.2),tiltRangeDegrees:[min,max]}.
cluster.baseRadius(0.12-1.2). material={baseColor:'#RRGGBB',emissive:'#RRGGBB',emissiveIntensity(0-3),roughness(0.02-1),metalness(0-1),transmission(0-1)}. finish={edgeRadius(0.001-0.04),bevelSegments(1-6),smoothAngleDegrees(10-80)}. surface={mode:'faceted'|'softened'|'sculpted',iterations(0-4),strength(0-0.18)}. Use faceted only for deliberately sharp-cut surfaces, softened for crystalline polish, sculpted only when the reference visibly has rounded/carved transitions. texture={resolution(1024|2048|4096),pattern:string,veinContrast(0-1),normalStrength(0-2)}. vfx={kind:string,count(0-500),radius(0.1-3),speed:[min,max],color:'#RRGGBB'}.
Do not include markdown, a prompt, export paths, or unknown keys. Set quality to hero. Favor a strong silhouette and a high-detail AAA hero prop; do not add hidden details unsupported by the views."""
    if route:
        choices = route["choices"]
        system += f"\nJev made the production route from a separate neutral observation. It is binding: return kind='{choices['family']['choice']}' and prioritize '{choices['construction_route']['choice']}'."
    payload = json.dumps({"model": model, "temperature": 0.1, "max_tokens": 3000, "response_format": {"type": "json_object"}, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": content},
    ]}).encode("utf-8")
    request = urllib.request.Request(
        _openrouter_endpoint(base_url), data=payload, method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach OpenRouter: {error.reason}") from error
    try:
        response_content = result["choices"][0]["message"]["content"]
        return parse_llm_json(model_text(response_content))
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Invalid model response: {error}") from error


def call_prompt_director(*, model: str, asset_id: str, prompt: str, route: dict[str, Any], research_dossier: dict[str, Any] | None = None) -> dict[str, Any]:
    """Turn a creative prompt into a constrained ArtSpec and build brief.

    The model is an art director, never an arbitrary-code generator. Research,
    when requested, was collected in a separate auditable step before this call.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    base_url = os.environ.get("OPENROUTER_BASE_URL")
    if not api_key or not base_url:
        raise RuntimeError("OPENROUTER_API_KEY and OPENROUTER_BASE_URL are required in .env.")
    choices = route["choices"]
    family = choices["family"]["choice"]
    construction_route = choices["construction_route"]["choice"]
    research_priority = choices["research_priority"]["choice"]
    research_context = json.dumps(research_dossier or {"status": "not requested"}, ensure_ascii=False)
    system = """You are the technical art director of a high-detail stylized game-asset workshop.
Convert a creator's idea into a build brief a senior 3D artist could follow, then map it to the safe GemTD procedural vocabulary.
Use the supplied research dossier when present; distinguish its observed reference facts from stylized inventions. Think in build order: silhouette, primary volumes, secondary forms, tertiary surface detail, material response, VFX.
The current executable vocabulary supports three hero families: crystal-cluster (exposed pointed crystals), geode-egg (a continuous rounded rock shell carved around a luminous core), and organic-guardian (a quadruped/hexapod creature or living golem assembled from body, head, articulated limbs, armor plates and optional tail). Do not pretend an unsupported subject is already fully generatable: choose the closest family, and record unsupported anatomical features in buildBrief.futureTools. organic-guardian is a static unrigged master, not an animated character.
Jev has already made the bounded production route. Treat it as binding: spec.kind MUST be 'ROUTE_FAMILY'. First review MUST be 'ROUTE_CONSTRUCTION'. Research focus is 'ROUTE_RESEARCH'. Reflect these choices in buildBrief, and never silently substitute another asset family.
Return ONLY JSON: {"spec": {...}, "buildBrief": {"concept":string,"silhouette":string,"assembly":[{"name":string,"role":string,"shape":string,"priority":"primary"|"secondary"|"tertiary"}],"surfaceNotes":[string],"materialNotes":[string],"futureTools":[string],"researchNotes":[string]}}.
spec must use the exact GemTD schema: either kind='crystal-cluster' with cluster.primaryCrystal, cluster.satellites, cluster.baseRadius; kind='geode-egg' with geode.radius, height, coreRadius, coreHeight, loosePlates; or kind='organic-guardian' with organic={body:{length,width,height,headScale},limbs:{count,length,radius,stance},armor:{plateCount,plateScale,spikeLength},tailLength}. Include seed, quality='hero', material, finish, surface, texture and vfx. Use only numeric ranges: geode radius .35-1.4,height .8-3.5,coreRadius .2-.75,coreHeight .2-.8,loosePlates 0-16; crystal sides 4-8,height .35-3,radius .05-.9; satellites count 0-15; organic body length .55-3.6,width .25-1.8,height .35-3.2,headScale .2-1.25; limbs count 0-8,length .2-2.8,radius .035-.42,stance 0-1; armor plates 0-96,plateScale .04-.55,spikeLength 0-.85,tailLength 0-3.5; material colors #RRGGBB. No markdown, code, URLs, or unknown spec keys."""
    system = system.replace("ROUTE_FAMILY", family).replace("ROUTE_CONSTRUCTION", construction_route).replace("ROUTE_RESEARCH", research_priority)
    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.2,
        "max_tokens": 3500,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": f"Asset id: {asset_id}\nCreator prompt:\n{prompt}\nResearch dossier (do not invent sources beyond it):\n{research_context}"},
        ],
    }
    request = urllib.request.Request(
        _openrouter_endpoint(base_url), data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
        message = result["choices"][0]["message"]
        content = message["content"]
        value = parse_llm_json(model_text(content))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach OpenRouter: {error.reason}") from error
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Invalid prompt-director response: {error}") from error
    if not isinstance(value.get("spec"), dict):
        raise RuntimeError("The prompt director returned no GemSpec.")
    return value


def clean_build_brief(value: Any) -> dict[str, Any]:
    """Keep the artistic plan inspectable and bounded; it is never executable."""
    brief = value if isinstance(value, dict) else {}
    def text(key: str, limit: int = 600) -> str:
        return str(brief.get(key, "")).strip()[:limit]
    def lines(key: str, limit: int = 12) -> list[str]:
        raw = brief.get(key, [])
        return [str(item).strip()[:240] for item in raw[:limit]] if isinstance(raw, list) else []
    assembly: list[dict[str, str]] = []
    if isinstance(brief.get("assembly"), list):
        for item in brief["assembly"][:16]:
            if not isinstance(item, dict):
                continue
            priority = item.get("priority") if item.get("priority") in {"primary", "secondary", "tertiary"} else "secondary"
            assembly.append({"name": str(item.get("name", "part"))[:80], "role": str(item.get("role", ""))[:240], "shape": str(item.get("shape", ""))[:240], "priority": priority})
    return {"concept": text("concept"), "silhouette": text("silhouette"), "assembly": assembly, "surfaceNotes": lines("surfaceNotes"), "materialNotes": lines("materialNotes"), "futureTools": lines("futureTools"), "researchNotes": lines("researchNotes")}


def save_reference_images(asset_id: str, images: dict[str, str]) -> None:
    destination = asset_directory(asset_id) / "references"
    destination.mkdir(parents=True, exist_ok=True)
    for view, data_url in images.items():
        header, encoded = data_url.split(",", 1)
        match = re.fullmatch(r"data:(image/(?:png|jpeg|webp));base64", header, flags=re.IGNORECASE)
        if not match:
            raise ValueError(f"{view}: only PNG, JPEG, and WebP images are accepted.")
        extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[match.group(1).lower()]
        (destination / f"{view}.{extension}").write_bytes(base64.b64decode(encoded, validate=True))


def load_request(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if not 0 < length <= MAX_BODY_BYTES:
        raise ValueError("Request must contain images and be no larger than 32 MB.")
    value = json.loads(handler.rfile.read(length).decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON request body.")
    return value


def create_prompt_description(data: dict[str, Any], progress: Any = None) -> dict[str, Any]:
    """Run the prompt pipeline with observable, ordered production phases."""
    def report(phase: str, message: str) -> None:
        if progress:
            progress(phase, message)

    asset_id = slug(str(data.get("assetId", "")))
    model = str(data.get("promptModel") or os.environ.get("OPENROUTER_PROMPT_MODEL", DEFAULT_PROMPT_MODEL)).strip()
    prompt = str(data.get("prompt", "")).strip()
    if not model:
        raise ValueError("Choose a prompt model.")
    if not 12 <= len(prompt) <= 12_000:
        raise ValueError("Describe the asset in 12 to 12,000 characters.")
    report("jev", "Jev está classificando a família e a primeira revisão construtiva.")
    route = route_prompt_with_jev(prompt)
    research_requested = bool(data.get("research"))
    bundle = asset_directory(asset_id)
    bundle.mkdir(parents=True, exist_ok=True)
    dossier = None
    if research_requested:
        report("research", "Pesquisando fontes verificáveis de anatomia, construção e material.")
        cache_key = {"prompt": prompt, "model": model, "route": {name: choice["choice"] for name, choice in route["choices"].items()}}
        dossier_path = bundle / "research-dossier.json"
        try:
            cached = json.loads(dossier_path.read_text(encoding="utf-8")) if dossier_path.is_file() else {}
        except json.JSONDecodeError:
            cached = {}
        if cached.get("cacheKey") == cache_key and isinstance(cached.get("dossier"), dict) and cached["dossier"].get("sources"):
            dossier = cached["dossier"]
        else:
            dossier = conduct_research(model=model, prompt=prompt, route=route)
            dossier_path.write_text(json.dumps({"cacheKey": cache_key, "dossier": dossier}, indent=2), encoding="utf-8")
        report("research-complete", f"Pesquisa concluída com {len(dossier['sources'])} fontes auditáveis.")
    report("director", "DeepSeek está convertendo a rota em um brief e GemSpec estruturada.")
    result = call_prompt_director(model=model, asset_id=asset_id, prompt=prompt, route=route, research_dossier=dossier)
    style_context = prompt + " " + json.dumps(result.get("buildBrief", {}), ensure_ascii=False) + " " + json.dumps(dossier or {}, ensure_ascii=False)
    spec = normalise_spec(result["spec"], asset_id, context=style_context)
    report("save", "Gravando o brief, a rota do Jev e a GemSpec no bundle do asset.")
    spec_path = bundle / "spec.json"
    spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
    brief_path = bundle / "build-brief.json"
    brief = {"assetId": asset_id, "model": model, "jevRoute": route, "researchRequested": research_requested, "researchUsed": bool(dossier), "research": dossier, "creatorPrompt": prompt, "brief": clean_build_brief(result.get("buildBrief"))}
    brief_path.write_text(json.dumps(brief, indent=2), encoding="utf-8")
    report("complete", "Plano concluído.")
    return {"spec": spec, "brief": brief, "route": route, "specPath": str(spec_path.relative_to(ROOT)), "briefPath": str(brief_path.relative_to(ROOT))}


class StudioHandler(BaseHTTPRequestHandler):
    server_version = "GemTDAssetForge/0.1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[studio] {format % args}")

    def send_json(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json(HTTPStatus.OK, {
                "configured": bool(os.environ.get("OPENROUTER_API_KEY") and os.environ.get("OPENROUTER_BASE_URL")),
                "model": os.environ.get("OPENROUTER_VISION_MODEL", DEFAULT_VISION_MODEL),
                "promptModel": os.environ.get("OPENROUTER_PROMPT_MODEL", DEFAULT_PROMPT_MODEL),
            })
            return
        if parsed.path == "/":
            content = (ROOT / "web" / "index.html").read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if parsed.path.startswith("/files/out/"):
            relative = Path(urllib.parse.unquote(parsed.path.removeprefix("/files/out/")))
            source = (OUT_DIR / relative).resolve()
            if OUT_DIR.resolve() not in source.parents or not source.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            content = source.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mimetypes.guess_type(source.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        try:
            data = load_request(self)
            if self.path == "/api/analyse":
                self.analyse(data)
            elif self.path == "/api/describe":
                self.describe(data)
            elif self.path == "/api/describe-stream":
                self.describe_stream(data)
            elif self.path == "/api/generate":
                self.generate(data)
            elif self.path == "/api/validate":
                self.validate(data)
            elif self.path == "/api/candidates":
                self.candidates(data)
            elif self.path == "/api/promote-candidate":
                self.promote_candidate(data)
            elif self.path == "/api/construct":
                self.construct(data)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:  # Surface safe error text to this local-only interface.
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def analyse(self, data: dict[str, Any]) -> None:
        asset_id = slug(str(data.get("assetId", "")))
        model = str(data.get("model") or os.environ.get("OPENROUTER_VISION_MODEL", DEFAULT_VISION_MODEL)).strip()
        images = data.get("images")
        if not model:
            raise ValueError("Choose a vision model.")
        if not isinstance(images, dict) or set(images) != set(VIEW_NAMES):
            raise ValueError("Upload exactly front, right, back, and left images.")
        if not all(isinstance(images[view], str) and images[view].startswith("data:image/") for view in VIEW_NAMES):
            raise ValueError("All four uploads must be images.")
        save_reference_images(asset_id, images)
        bundle = asset_directory(asset_id)
        observation = observe_views(model=model, asset_id=asset_id, images=images)
        route = route_prompt_with_jev(json.dumps(observation, ensure_ascii=False))
        spec = normalise_spec(call_openrouter(model=model, asset_id=asset_id, images=images, route=route), asset_id)
        spec_path = bundle / "spec.json"
        spec_path.parent.mkdir(parents=True, exist_ok=True)
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        (bundle / "vision-observation.json").write_text(json.dumps(observation, indent=2), encoding="utf-8")
        (bundle / "jev-route.json").write_text(json.dumps(route, indent=2), encoding="utf-8")
        self.send_json(HTTPStatus.OK, {"spec": spec, "route": route, "specPath": str(spec_path.relative_to(ROOT))})

    def describe(self, data: dict[str, Any]) -> None:
        """Prompt-only entry point, optionally grounded by OpenRouter web search."""
        self.send_json(HTTPStatus.OK, create_prompt_description(data))

    def describe_stream(self, data: dict[str, Any]) -> None:
        """NDJSON status stream so the local UI reflects actual work phases."""
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        def emit(kind: str, value: dict[str, Any]) -> None:
            self.wfile.write((json.dumps({"type": kind, **value}) + "\n").encode("utf-8"))
            self.wfile.flush()
        try:
            result = create_prompt_description(data, lambda phase, message: emit("progress", {"phase": phase, "message": message}))
            emit("result", result)
        except Exception as error:
            emit("error", {"error": str(error)})

    def generate(self, data: dict[str, Any]) -> None:
        raw_spec = data.get("spec")
        if isinstance(raw_spec, str):
            raw_spec = json.loads(raw_spec)
        if not isinstance(raw_spec, dict):
            raise ValueError("GemSpec must be a JSON object.")
        asset_id = slug(str(raw_spec.get("id", "")))
        spec = normalise_spec(raw_spec, asset_id)
        bundle = asset_directory(asset_id)
        bundle.mkdir(parents=True, exist_ok=True)
        (bundle / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
        base, crystals = create_asset(spec)
        output = bundle / "model.glb"
        write_glb(output, asset_id=asset_id, base=base, crystals=crystals, material=spec["material"], metadata={"generator": spec["kind"], "seed": spec["seed"], "quality": spec["quality"]})
        triangles = len(base.indices) // 3 + sum(len(crystal.indices) // 3 for crystal in crystals)
        vfx_path = bundle / "vfx.json"
        vfx_path.write_text(json.dumps(spec["vfx"], indent=2), encoding="utf-8")
        self.send_json(HTTPStatus.OK, {"spec": spec, "triangles": triangles, "glbUrl": output_url(output), "vfxUrl": output_url(vfx_path), "bundlePath": str(bundle.relative_to(ROOT))})

    def validate(self, data: dict[str, Any]) -> None:
        asset_id = slug(str(data.get("assetId", "")))
        bundle = asset_directory(asset_id)
        source = bundle / "model.glb"
        if not source.exists():
            raise ValueError("Generate the GLB before validating it.")
        blender = shutil.which("blender")
        if not blender:
            raise RuntimeError("Blender was not found on PATH.")
        report = bundle / "qa.json"
        preview = bundle / "preview.png"
        subprocess.run([blender, "--background", "--python", str(BLENDER_SCRIPT), "--", str(source), str(report), str(preview)], check=True, timeout=180)
        blend = bundle / "model.blend"
        polished = bundle / "model-polished.glb"
        if not polished.exists():
            raise RuntimeError("Blender did not export the polished GLB.")
        self.send_json(HTTPStatus.OK, {"report": json.loads(report.read_text(encoding="utf-8")), "previewUrl": output_url(preview), "blendUrl": output_url(blend), "polishedGlbUrl": output_url(polished), "bundlePath": str(bundle.relative_to(ROOT))})

    def candidates(self, data: dict[str, Any]) -> None:
        raw_spec = data.get("spec")
        if isinstance(raw_spec, str):
            raw_spec = json.loads(raw_spec)
        if not isinstance(raw_spec, dict):
            raise ValueError("GemSpec must be a JSON object.")
        asset_id = slug(str(raw_spec.get("id", "")))
        spec = normalise_spec(raw_spec, asset_id)
        count = round(clamp(data.get("count"), 3, 16, 9))
        bundle = asset_directory(asset_id)
        bundle.mkdir(parents=True, exist_ok=True)
        (bundle / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
        records: list[dict[str, Any]] = []
        for candidate in make_candidates(spec, count):
            candidate_id = candidate["candidateId"]
            candidate_dir = bundle / "candidates" / candidate_id
            candidate_dir.mkdir(parents=True, exist_ok=True)
            base, parts = create_asset(candidate)
            output = candidate_dir / "model.glb"
            write_glb(output, asset_id=candidate["id"], base=base, crystals=parts, material=candidate["material"], metadata={"generator": candidate["kind"], "parentAssetId": asset_id, "candidateId": candidate_id, "seed": candidate["seed"], "quality": candidate["quality"]})
            triangles = len(base.indices) // 3 + sum(len(part.indices) // 3 for part in parts)
            (candidate_dir / "spec.json").write_text(json.dumps(candidate, indent=2), encoding="utf-8")
            (candidate_dir / "vfx.json").write_text(json.dumps(candidate["vfx"], indent=2), encoding="utf-8")
            records.append({"id": candidate_id, "triangles": triangles, "meshes": len(parts) + 1, "summary": candidate_summary(candidate, triangles, len(parts) + 1), "modelUrl": output_url(output)})

        criteria = {record["id"]: record["summary"] for record in records}
        target = json.dumps({"kind": spec["kind"], "shape": spec.get("geode") or spec.get("cluster") or spec.get("organic"), "surface": spec["surface"], "material": spec["material"], "vfx": spec["vfx"]}, separators=(",", ":"))
        decision = call_jev(
            state={"description": f"Choose the candidate program that best matches this target blueprint: {target}", "records": [{"id": record["id"], "record": record["summary"]} for record in records]},
            questions={"winner": {"type": "choice", "instructions": "Choose the candidate with the most faithful silhouette, continuous-vs-part structure, and appropriate surface treatment for the target blueprint.", "criteria": criteria}, "needs_refine": {"type": "noul", "instructions": "Does this target need another candidate beam after render review because the present choices are structurally insufficient?"}},
        )
        winner = str(decision["answers"]["winner"].get("choice", ""))
        if winner not in criteria:
            raise RuntimeError("Jev selected a candidate outside the generated beam.")
        manifest = {"assetId": asset_id, "target": spec, "candidates": records, "jev": decision, "winner": winner}
        manifest_path = bundle / "candidate-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        self.send_json(HTTPStatus.OK, {"bundlePath": str(bundle.relative_to(ROOT)), "candidates": records, "winner": winner, "decision": decision["answers"], "manifestUrl": output_url(manifest_path)})

    def promote_candidate(self, data: dict[str, Any]) -> None:
        asset_id = slug(str(data.get("assetId", "")))
        candidate_id = slug(str(data.get("candidateId", "")))
        bundle = asset_directory(asset_id)
        source_dir = bundle / "candidates" / candidate_id
        source = source_dir / "model.glb"
        if not source.is_file():
            raise ValueError("Candidate model was not found.")
        shutil.copy2(source, bundle / "model.glb")
        selected_spec = json.loads((source_dir / "spec.json").read_text(encoding="utf-8"))
        # Promotion selects geometry, not a new asset identity. Keeping the
        # parent id prevents later actions writing into `<asset>-c04/`.
        selected_spec["id"] = asset_id
        selected_spec.pop("candidateId", None)
        selected_spec.pop("parentAssetId", None)
        selected_spec["export"] = {"targetTriangles": selected_spec.get("export", {}).get("targetTriangles", 75000), "output": f"out/{asset_id}/model.glb"}
        (bundle / "spec.json").write_text(json.dumps(selected_spec, indent=2), encoding="utf-8")
        shutil.copy2(source_dir / "vfx.json", bundle / "vfx.json")
        selection = {"assetId": asset_id, "candidateId": candidate_id, "source": str(source.relative_to(ROOT))}
        (bundle / "selection.json").write_text(json.dumps(selection, indent=2), encoding="utf-8")
        self.send_json(HTTPStatus.OK, {"bundlePath": str(bundle.relative_to(ROOT)), "glbUrl": output_url(bundle / "model.glb"), "selection": selection})

    def construct(self, data: dict[str, Any]) -> None:
        """Export intermediate assemblies so the asset can be judged part by part."""
        raw_spec = data.get("spec")
        if isinstance(raw_spec, str):
            raw_spec = json.loads(raw_spec)
        if not isinstance(raw_spec, dict):
            raise ValueError("GemSpec must be a JSON object.")
        asset_id = slug(str(raw_spec.get("id", "")))
        spec = normalise_spec(raw_spec, asset_id)
        bundle = asset_directory(asset_id)
        bundle.mkdir(parents=True, exist_ok=True)
        (bundle / "spec.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
        base, parts = create_asset(spec)
        stages: list[dict[str, Any]] = []
        for stage in construction_plan(spec):
            include = stage["include"]
            selected = parts if include == ["*"] else [part for part in parts if any(part.name.startswith(prefix) for prefix in include)]
            stage_dir = bundle / "stages" / stage["id"]
            output = stage_dir / "model.glb"
            write_glb(output, asset_id=f"{asset_id}-{stage['id']}", base=base, crystals=selected, material=spec["material"], metadata={"generator": spec["kind"], "stage": stage["id"], "goal": stage["goal"]})
            triangles = len(base.indices) // 3 + sum(len(part.indices) // 3 for part in selected)
            stages.append({**stage, "triangles": triangles, "meshes": len(selected) + 1, "modelUrl": output_url(output)})
        brief_path = bundle / "build-brief.json"
        creative_brief: dict[str, Any] | None = None
        if brief_path.is_file():
            try:
                saved_brief = json.loads(brief_path.read_text(encoding="utf-8"))
                if isinstance(saved_brief, dict):
                    creative_brief = clean_build_brief(saved_brief.get("brief"))
            except json.JSONDecodeError:
                pass
        plan = {"assetId": asset_id, "kind": spec["kind"], "stages": stages, "creativeBrief": creative_brief, "nextRule": "Do not add a later stage until the previous stage passes silhouette and proportion review."}
        plan_path = bundle / "construction-plan.json"
        plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        self.send_json(HTTPStatus.OK, {"bundlePath": str(bundle.relative_to(ROOT)), "stages": stages, "planUrl": output_url(plan_path)})


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the local GemTD Asset Forge Studio.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    load_dotenv()
    server = ThreadingHTTPServer((args.host, args.port), StudioHandler)
    print(f"GemTD Asset Forge Studio: http://{args.host}:{args.port}")
    print("OpenRouter configuration:", "ready" if os.environ.get("OPENROUTER_API_KEY") else "missing")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStudio stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
