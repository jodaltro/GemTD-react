import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GemType, GemQuality, QUALITY_VISUALS, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, PEDESTAL_HEIGHT } from '../../../constants';
import { Enemy, GridCell } from '../../../types';
import { StonefishAimData, DiamondAimData } from './shared/types';
import { GEM_PHYSICS, DEFAULT_GEM_PHYSICS, ORB_TYPES, SNAKE_TYPES, STONEFISH_TYPES, RUBY_TYPES } from './shared/gemConfig';
import { GolemModel } from './golem/GolemModel';

export const Tower: React.FC<{
    cell: GridCell;
    envMap: THREE.Texture | null;
    enemies: Enemy[];
    isSelected: boolean;
}> = ({ cell, envMap, enemies, isSelected }) => {
    const group = useRef<THREE.Group>(null);
    const lookTargetWorldRef = useRef(new THREE.Vector3());
    const currentLookRef = useRef(new THREE.Vector3());
    const stonefishLocalTargetRef = useRef(new THREE.Vector3());
    const diamondLocalTargetRef = useRef(new THREE.Vector3());
    const stonefishAimRef = useRef<StonefishAimData>({
        hasTarget: false,
        localTarget: new THREE.Vector3(0, 0.45, 3.0),
        distanceGrid: 0,
        targetId: null,
    });
    const diamondAimRef = useRef<DiamondAimData>({
        hasTarget: false,
        localTarget: new THREE.Vector3(0, 0.6, 3.0),
        targetId: null,
    });

    const quality = (cell.quality || GemQuality.CHIPPED) as GemQuality;
    const visualConfig = QUALITY_VISUALS[quality] || QUALITY_VISUALS[GemQuality.CHIPPED];
    const physics = GEM_PHYSICS[cell.gemType!] || DEFAULT_GEM_PHYSICS;
    const isOrbType   = cell.gemType ? ORB_TYPES.includes(cell.gemType)       : false;
    const isSnakeType = cell.gemType ? SNAKE_TYPES.includes(cell.gemType)     : false;
    const isStonefish = cell.gemType ? STONEFISH_TYPES.includes(cell.gemType) : false;
    const isRubyType  = cell.gemType ? RUBY_TYPES.includes(cell.gemType)      : false;

    useFrame((state) => {
        const et = state.clock.getElapsedTime();
        if (!group.current) return;

        const x = cell.x * CELL_SIZE + BOARD_OFFSET_X;
        const z = cell.y * CELL_SIZE + BOARD_OFFSET_Z;
        group.current.position.set(x, PEDESTAL_HEIGHT, z);

        let s = visualConfig.scale * 0.35;
        if (isSelected) s *= 1.1 + Math.sin(et * 8) * 0.05;
        if (isOrbType)   s *= 0.9;
        if (isSnakeType) s *= 0.7;
        group.current.scale.setScalar(s);

        if (cell.targetId) {
            const target = enemies.find(e => e.id === cell.targetId);
            if (target && !target.isDead) {
                const tx = target.x * CELL_SIZE + BOARD_OFFSET_X;
                const ty = target.isFlying ? 1.5 : 0.4;
                const tz = target.y * CELL_SIZE + BOARD_OFFSET_Z;
                const targetPos = lookTargetWorldRef.current.set(tx, 0, tz);
                const currentLook = currentLookRef.current.set(0, 0, 1).applyQuaternion(group.current.quaternion).add(group.current.position);
                group.current.lookAt(currentLook.lerp(targetPos, 0.15).x, 0, currentLook.z);

                if (isStonefish) {
                    stonefishLocalTargetRef.current.set(tx, ty, tz);
                    group.current.worldToLocal(stonefishLocalTargetRef.current);
                    stonefishAimRef.current.hasTarget = true;
                    stonefishAimRef.current.localTarget.copy(stonefishLocalTargetRef.current);
                    stonefishAimRef.current.distanceGrid = Math.sqrt(Math.pow(target.x - cell.x, 2) + Math.pow(target.y - cell.y, 2));
                    stonefishAimRef.current.targetId = target.id;
                }
                diamondLocalTargetRef.current.set(tx, ty, tz);
                group.current.worldToLocal(diamondLocalTargetRef.current);
                diamondAimRef.current.hasTarget = true;
                diamondAimRef.current.localTarget.copy(diamondLocalTargetRef.current);
                diamondAimRef.current.targetId = target.id;
            } else {
                if (isStonefish) { stonefishAimRef.current.hasTarget = false; stonefishAimRef.current.targetId = null; }
                diamondAimRef.current.hasTarget = false;
                diamondAimRef.current.targetId = null;
            }
        } else {
            if (isStonefish) { stonefishAimRef.current.hasTarget = false; stonefishAimRef.current.targetId = null; }
            diamondAimRef.current.hasTarget = false;
            diamondAimRef.current.targetId = null;
            if (!isSnakeType && !isStonefish) group.current.rotation.y = Math.sin(et * 0.5) * 0.2;
        }
    });

    return (
        <group ref={group}>
            <GolemModel
                cell={cell} enemies={enemies} isSelected={isSelected}
                physics={physics} visualConfig={visualConfig}
                isOrbType={isOrbType} isSnakeType={isSnakeType} isStonefish={isStonefish} isRubyType={isRubyType}
                envMap={envMap} stonefishAimRef={stonefishAimRef} diamondAimRef={diamondAimRef}
            />
        </group>
    );
};
