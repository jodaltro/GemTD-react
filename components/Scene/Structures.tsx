import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useEnvironment } from '@react-three/drei';
import { useGameStore } from '../../store/useGameStore';
import { CellType, COLORS, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, GRID_SIZE, PEDESTAL_HEIGHT } from '../../constants';
import { Tower } from './towers/Tower';

const rockGeo = new THREE.DodecahedronGeometry(CELL_SIZE * 0.35, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: COLORS.rock, flatShading: true, roughness: 0.9 });
const tempBase = new THREE.Object3D();

// Slightly tapered hex platform sitting under each tower
const pedestalGeo = new THREE.CylinderGeometry(0.38, 0.46, PEDESTAL_HEIGHT, 6);
const pedestalMat = new THREE.MeshStandardMaterial({ color: '#7a7060', roughness: 0.88, metalness: 0.08, flatShading: true });
const tempPedestal = new THREE.Object3D();

export const Structures: React.FC = () => {
    const grid = useGameStore((state) => state.grid);
    const enemies = useGameStore((state) => state.enemies);
    const selectedCellId = useGameStore((state) => state.selectedCellId);
    const envMap = useEnvironment({ preset: 'city' });
    const rockRef = useRef<THREE.InstancedMesh>(null);
    const pedestalRef = useRef<THREE.InstancedMesh>(null);
    const rocks = useMemo(() => grid.filter(c => c.type === CellType.ROCK), [grid]);
    const towers = useMemo(() => grid.filter(c => c.type === CellType.TOWER), [grid]);

    useLayoutEffect(() => {
        if (!rockRef.current) return;
        rockRef.current.count = rocks.length;
        rocks.forEach((rock, i) => {
            tempBase.position.set(rock.x * CELL_SIZE + BOARD_OFFSET_X, 0.2, rock.y * CELL_SIZE + BOARD_OFFSET_Z);
            tempBase.rotation.set(rock.x * 123, rock.y * 456, rock.x + rock.y);
            tempBase.scale.setScalar(1 + Math.sin(rock.x * 13 + rock.y * 7) * 0.2);
            tempBase.updateMatrix();
            rockRef.current!.setMatrixAt(i, tempBase.matrix);
        });
        rockRef.current.instanceMatrix.needsUpdate = true;
    }, [rocks]);

    useLayoutEffect(() => {
        if (!pedestalRef.current) return;
        pedestalRef.current.count = towers.length;
        towers.forEach((tower, i) => {
            tempPedestal.position.set(
                tower.x * CELL_SIZE + BOARD_OFFSET_X,
                PEDESTAL_HEIGHT / 2,
                tower.y * CELL_SIZE + BOARD_OFFSET_Z,
            );
            tempPedestal.rotation.set(0, (tower.x * 7 + tower.y * 13) * 0.5, 0);
            tempPedestal.scale.setScalar(1);
            tempPedestal.updateMatrix();
            pedestalRef.current!.setMatrixAt(i, tempPedestal.matrix);
        });
        pedestalRef.current.instanceMatrix.needsUpdate = true;
    }, [towers]);

    return (
        <group>
            <instancedMesh
                ref={rockRef}
                args={[rockGeo, rockMat, GRID_SIZE * GRID_SIZE]}
                castShadow receiveShadow frustumCulled={false}
            />
            <instancedMesh
                ref={pedestalRef}
                args={[pedestalGeo, pedestalMat, GRID_SIZE * GRID_SIZE]}
                castShadow receiveShadow frustumCulled={false}
            />
            {towers.map(cell => (
                <Tower
                    key={cell.id}
                    cell={cell}
                    envMap={envMap as THREE.Texture | null}
                    enemies={enemies}
                    isSelected={cell.id === selectedCellId}
                />
            ))}
        </group>
    );
};
