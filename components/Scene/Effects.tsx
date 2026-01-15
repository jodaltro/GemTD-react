
import React from 'react';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

export const Effects: React.FC = () => {
  return (
    <EffectComposer disableNormalPass>
      {/* 
         Bloom settings optimized for MeshRefractionMaterial:
         - luminanceThreshold: 1.0 (Only values > 1.0 glow, requiring toneMapped={false} on mats)
         - mipmapBlur: true (Creates the soft, premium "angelic" glow)
         - radius: 0.6 (Spread)
      */}
      <Bloom 
        luminanceThreshold={1.0} 
        mipmapBlur 
        intensity={1.5} 
        radius={0.6}
        levels={5}
      />
      <Vignette offset={0.3} darkness={0.6} eskil={false} />
    </EffectComposer>
  );
};
