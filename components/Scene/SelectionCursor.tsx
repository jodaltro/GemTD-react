
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, GEM_STATS, RANGE_SCALE, GemQuality, GEM_COLORS, CellType } from '../../constants';
import * as THREE from 'three';

export const SelectionCursor: React.FC = () => {
  const selectedCellId = useGameStore((state) => state.selectedCellId);
  const grid = useGameStore((state) => state.grid);
  const ringRef = useRef<THREE.Mesh>(null);
  const pillarRef = useRef<THREE.Mesh>(null);
  const rangeRef = useRef<THREE.Group>(null);

  const selectedCell = grid.find(c => c.id === selectedCellId);

  // Calculate Range Radius based on Towers.tsx logic
  const { rangeRadius, gemColor } = useMemo(() => {
    if (!selectedCell || !selectedCell.gemType || !selectedCell.quality) {
        return { rangeRadius: 0, gemColor: '#ffffff' };
    }
    
    // Only show range for Towers
    if (selectedCell.type !== CellType.TOWER) {
        return { rangeRadius: 0, gemColor: '#ffffff' };
    }

    const typeStats = GEM_STATS[selectedCell.gemType];
    const stats = typeStats[selectedCell.quality] || typeStats[GemQuality.SPECIAL];
    
    if (!stats) return { rangeRadius: 0, gemColor: '#ffffff' };

    // Math derived from Towers.tsx combat logic: (range / RANGE_SCALE) * 0.035
    const radius = (stats.range / RANGE_SCALE) * 0.035;
    const color = GEM_COLORS[selectedCell.gemType];

    return { rangeRadius: radius, gemColor: color };
  }, [selectedCell]);

  useFrame((state, delta) => {
    const et = state.clock.getElapsedTime();
    
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2;
      const s = 1 + Math.sin(et * 6) * 0.05;
      ringRef.current.scale.set(s, s, s);
    }

    if (pillarRef.current) {
      // Pulse opacity and height slightly
      const material = pillarRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.1 + Math.sin(et * 6) * 0.05;
      const s = 1 + Math.sin(et * 6) * 0.1;
      pillarRef.current.scale.set(1, s, 1);
    }

    // Gentle pulse for the range circle
    if (rangeRef.current) {
        rangeRef.current.rotation.y = -et * 0.1; // Slow rotation
        const rangePulse = 1 + Math.sin(et * 2) * 0.01;
        rangeRef.current.scale.set(rangePulse, 1, rangePulse);
    }
  });

  if (!selectedCell) return null;

  return (
    <group
      position={[
        selectedCell.x * CELL_SIZE + BOARD_OFFSET_X,
        0.1,
        selectedCell.y * CELL_SIZE + BOARD_OFFSET_Z
      ]}
    >
      {/* 1. Standard Selection Ring (Small) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      
      {/* 2. Selection Pillar Light */}
      <mesh ref={pillarRef} position={[0, 0.5, 0]}>
         <cylinderGeometry args={[0.35, 0.35, 1, 32, 1, true]} />
         <meshBasicMaterial 
            color="#ffffff" 
            transparent 
            opacity={0.1} 
            side={THREE.DoubleSide} 
            blending={THREE.AdditiveBlending} 
            depthWrite={false}
         />
      </mesh>

      {/* 3. Attack Range Visualization */}
      {rangeRadius > 0 && (
          <group ref={rangeRef} position={[0, -0.08, 0]}>
              {/* Outer Ring Line */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[rangeRadius - 0.05, rangeRadius, 64]} />
                  <meshBasicMaterial 
                    color={gemColor} 
                    transparent 
                    opacity={0.6} 
                    side={THREE.DoubleSide} 
                    blending={THREE.AdditiveBlending}
                  />
              </mesh>

              {/* Inner Fill Area */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[rangeRadius, 64]} />
                  <meshBasicMaterial 
                    color={gemColor} 
                    transparent 
                    opacity={0.1} 
                    depthWrite={false} 
                    side={THREE.DoubleSide}
                  />
              </mesh>
          </group>
      )}
    </group>
  );
};
