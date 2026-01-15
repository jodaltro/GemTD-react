import React from 'react';
import { GameScene } from './components/Scene/GameScene';
import { Interface } from './components/UI/Interface';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative selection:bg-none">
      <GameScene />
      <Interface />
    </div>
  );
};

export default App;