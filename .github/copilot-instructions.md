# GemTD 3D Mobile - AI Coding Agent Instructions

## Project Overview
React Three Fiber (R3F) tower defense game with gem crafting mechanics. Uses Zustand for centralized state management and Three.js for 3D rendering.

## Architecture Principles

### 1. Distributed Game Loop
Each R3F component handles its own update cycle via `useFrame()` hooks rather than a centralized loop. Combat systems (towers, enemies, projectiles) update independently within their respective components.

### 2. Centralized State (Zustand)
All game state lives in `store/useGameStore.ts`. Avoid React local state (`useState`) for game entities. Components read from store and call store actions to mutate state.

### 3. Performance: InstancedMesh
For entities with many instances (enemies, projectiles, particles), use `THREE.InstancedMesh` with matrix updates. Never create individual meshes in loops - this causes severe performance issues.

Update pattern:
- Use `useLayoutEffect` to update matrices when entity data changes
- Always set `instanceMatrix.needsUpdate = true` after modifications
- Set `frustumCulled={false}` for critical meshes

### 4. Pathfinding Strategy
- **A-Star**: Validation only (checking if tower placement blocks path)
- **Flow Field (BFS)**: Runtime navigation (pre-computed direction map)

Validate placement during build phase, use flow field for enemy movement.

### 5. 3D Model Animation
GLB models use skeletal animation. Procedural modifications done via bone scale manipulation in `useLayoutEffect`. Different entity types modify skeleton structure (hide limbs, scale bones) to create visual variety.

Attack animations trigger on state changes, not continuous loops.

### 7. Tower Visual Archetypes
Each gem type maps to a distinct visual archetype in `Structures.tsx`. All share the same base GLB golem model but are differentiated via bone manipulation and material overrides:

| Archetype | Gem Types | Technique |
|---|---|---|
| **Golem** (default) | Diamond, Ruby, Sapphire, Topaz, etc. | Standard golem with attack animation |
| **Orb** | Amethyst, Opal, Black Opal, Uranium, Tourmaline | Hide limbs, enlarge head/spine → floating chest |
| **Snake** | Emerald, Dark Emerald | Procedural tube geometry (`ProceduralSnake`) with vertex animation |
| **Aquamarine** | Aquamarine | Fully procedural (`ProceduralStonefish`). Pear-shaped `LatheGeometry` crystal body + Catmull-Rom fluid tendrils. Early-returns in `GolemModel`, no golem model used. |

#### Adding a New Visual Archetype
1. Add type array constant (e.g., `STONEFISH_TYPES`)
2. Detect in `Tower` component → pass as prop to `GolemModel`
3. For procedural types: create standalone component, early-return from `GolemModel` (like Snake/Aquamarine)
4. For golem-based types: add bone manipulation in `GolemModel.useLayoutEffect` + animation in `useFrame`
5. Wire into render

#### Aquamarine (Water Drop Crystal) Implementation Details
- **Architecture**: Fully procedural component `ProceduralStonefish` — does NOT use the golem model. Early-returns from `GolemModel` like `ProceduralSnake`.
- **Body**: `THREE.LatheGeometry` with pear/drop profile (32 segments, 32 radial). Rendered with `rotation={[Math.PI, 0, 0]}` to flip (pointy bottom, round top). Profile: thin point → gradual widen → wide pear belly (widest ~65%) → smooth close at top.
- **Crystal material**: `MeshPhysicalMaterial` — `color: #7fffff`, `emissive: #00e5ff`, `emissiveIntensity: 0.45`, `transmission: 0.7`, `ior: 1.65`, `clearcoat: 1.0`, `sheen: 1.0` (cyan), `toneMapped: false`, `envMapIntensity: 2.2`
- **Float animation**: `position.y = 1.2 + sin(t * 1.1) * 0.1`, gentle Z/X rotation sway
- **Attack**: Forward lunge on z-axis over 400ms (quick in 20%, ease-out 80%)
- **Water tendrils** (4 total, 2 per side):
  - 14 sphere segments per tendril interpolated along **Catmull-Rom splines**
  - 6 animated control points per tendril with sine harmonics for X/Y/Z
  - Y axis: parabolic gravity arc + wave + turbulence
  - Z axis: sinusoidal undulation + secondary harmonics
  - Scale: thick at base, tapers to tip, with pulsation; stretched Y for connected liquid look
  - Each segment oriented along flow direction via `atan2`
- **Water droplets** (16): orbit with surface-tension behavior, pulsating ellipsoidal scale, varied radii (close/far scatter)
- **Water material**: `MeshPhysicalMaterial` — `color: #c0f8ff`, `emissive: #00d4ff`, `transmission: 0.92`, `ior: 1.33` (real water), `toneMapped: false`, `depthWrite: false`

### 6. Material System
When creating/modifying materials:
- Apply environment map for proper reflections
- Set `material.needsUpdate = true` after changes
- Use `toneMapped: false` for emissive effects with Bloom post-processing

## Game State Machine

Phase-based gameplay: BUILDING → SELECTING → READY → DEFENDING → READY (loop)

Phase transitions managed in store. UI components read phase to show/hide controls.

## Development

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run preview    # Preview build
```

## Code Organization

- **constants.ts**: Game balance configuration (stats, costs, spawn rates)
- **types.ts**: TypeScript interfaces, no implementation
- **store/useGameStore.ts**: Global state and actions
- **components/Scene/**: 3D rendering components (R3F)
- **components/UI/**: HTML overlay interface
- **utils/**: Algorithms (pathfinding, geometry)

## Common Patterns

### Adding New Entity Types
1. Define type/enum in `constants.ts`
2. Add stats/configuration
3. Update relevant type interfaces in `types.ts`
4. Implement rendering in Scene component
5. Add logic in store actions if needed

### Debugging 3D Rendering
- Check console for Three.js warnings
- Verify environment maps are loaded before use
- Ensure matrix updates include `needsUpdate = true`
- Test transparency with `depthWrite: false`

### Performance Optimization
- Use instanced meshes for repeated objects
- Adjust shadow map resolution
- Toggle post-processing effects temporarily
- Disable frustum culling for critical objects

## Anti-Patterns

❌ Local React state for game entities  
✅ Centralized Zustand store

❌ Individual meshes in loops  
✅ InstancedMesh with matrix updates

❌ Pathfinding every frame  
✅ Pre-computed navigation maps

❌ Material updates without flags  
✅ Set `needsUpdate = true`

## References

See `README.md`, `.context/agents.md`, and source files for implementation details and specific examples.
