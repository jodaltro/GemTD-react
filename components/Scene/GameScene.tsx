
import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Ground } from './Ground';
import { Structures } from './Structures';
import { Enemies } from './Enemies';
import { Towers } from './Towers';
import { Projectiles } from './Projectiles';
import { SelectionCursor } from './SelectionCursor';
import { Effects } from './Effects';
import { Particles } from './Particles';
import { useGameStore } from '../../store/useGameStore';

export const GameScene: React.FC = () => {
  const initializeGrid = useGameStore((state) => state.initializeGrid);
  const selectCell = useGameStore((state) => state.selectCell);

  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  return (
    <div className="w-full h-full relative bg-slate-950">
      <Canvas 
        shadows
        dpr={[1, 2]}
        onPointerMissed={() => selectCell(null)}
        gl={{
            toneMappingExposure: 1.4, // Increased exposure
            antialias: true,
            stencil: false,
            depth: true,
        }}
      >
        {/* Perspective Camera allows for true close-ups */}
        <PerspectiveCamera 
          makeDefault 
          position={[25, 25, 25]} 
          fov={35}
          near={0.1} 
          far={1000} 
        />
        
        <OrbitControls 
          enableZoom={true} 
          enablePan={true}
          minDistance={2}
          maxDistance={100}
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 0, 0]} // Center of the 32x32 board
          makeDefault
        />

        {/* Stronger Global Lighting for Visibility */}
        <ambientLight intensity={1.5} /> 
        <directionalLight 
          position={[30, 50, 20]} 
          intensity={3.0} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0001}
        >
          {/* Adjust shadow camera to cover the 32x32 grid */}
          <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30]} />
        </directionalLight>

        <Environment preset="city" background={false} />

        {/* Game Content */}
        <group position={[0, 0, 0]}>
          <Ground />
          <Structures />
          <Towers />
          <Enemies />
          <Projectiles />
          <SelectionCursor />
          <Particles />
        </group>

        {/* Subtle helper grid to keep orientation */}
        <gridHelper args={[100, 50, 0x334155, 0x0f172a]} position={[0, -0.6, 0]} />
        
        <Effects />
      </Canvas>
    </div>
  );
};
