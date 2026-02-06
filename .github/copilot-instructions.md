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
