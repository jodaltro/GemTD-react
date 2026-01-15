
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useGameStore } from '../../store/useGameStore';
import { COLORS, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Z, START_POS, END_POS, GRID_SIZE } from '../../constants';

// Use standard mesh for the base to ensure it's always visible
const baseGeo = new THREE.BoxGeometry(GRID_SIZE * CELL_SIZE + 4, 1, GRID_SIZE * CELL_SIZE + 4);
const baseMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 1 });

const cellGeo = new THREE.BoxGeometry(CELL_SIZE * 0.96, 0.2, CELL_SIZE * 0.96);
const cellMat = new THREE.MeshStandardMaterial({ 
  roughness: 0.7,
  metalness: 0.2,
  vertexColors: false // We use instance color
});

const tempObj = new THREE.Object3D();
const tempColor = new THREE.Color();

export const Ground: React.FC = () => {
  const grid = useGameStore((state) => state.grid);
  const hoverCell = useGameStore((state) => state.hoverCell);
  const handleCellClick = useGameStore((state) => state.handleCellClick);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!meshRef.current || grid.length === 0) return;

    grid.forEach((cell, i) => {
      tempObj.position.set(
        cell.x * CELL_SIZE + BOARD_OFFSET_X, 
        -0.1, 
        cell.y * CELL_SIZE + BOARD_OFFSET_Z
      );
      tempObj.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObj.matrix);
      
      const color = cell.isHovered ? COLORS.groundHighlight : COLORS.ground;
      meshRef.current!.setColorAt(i, tempColor.set(color));
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [grid]);

  return (
    <group>
      {/* The main solid floor slab */}
      <mesh position={[0, -0.6, 0]} receiveShadow geometry={baseGeo} material={baseMat} />

      {/* Grid cells as instances for performance */}
      <instancedMesh 
        ref={meshRef} 
        args={[cellGeo, cellMat, GRID_SIZE * GRID_SIZE]} 
        receiveShadow 
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          const { instanceId } = e;
          if (instanceId !== undefined) {
            const cell = grid[instanceId];
            if (cell) handleCellClick(cell.x, cell.y);
          }
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const { instanceId } = e;
          if (instanceId !== undefined) {
            const cell = grid[instanceId];
            if (cell) hoverCell(cell.x, cell.y);
          }
        }}
        onPointerOut={() => hoverCell(null, null)}
      />
      
      <Marker position={START_POS} color={COLORS.start} label="INÍCIO" />
      <Marker position={END_POS} color={COLORS.end} label="FIM" />
    </group>
  );
};

const Marker: React.FC<{position: {x: number, y: number}, color: string, label: string}> = ({position, color, label}) => {
  return (
    <group position={[
      position.x * CELL_SIZE + BOARD_OFFSET_X,
      0.02,
      position.y * CELL_SIZE + BOARD_OFFSET_Z
    ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[CELL_SIZE * 0.9, CELL_SIZE * 0.9]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <Text 
        position={[0, 0.1, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        fontSize={0.3} 
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  )
}
