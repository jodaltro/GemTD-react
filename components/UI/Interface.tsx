

import React, { useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { GamePhase, GEM_COLORS, CellType, GEM_STATS, RECIPES, GemType, PRAY_COST_COLOR, PRAY_COST_QUALITY, SPAWN_PROBABILITIES, QUALITY_ORDER, BASE_STONE_COST, STONE_COST_INCREMENT, RESEARCH_COSTS, GemQuality } from '../../constants';
import { MousePointerClick, Hammer, Play, Heart, Shield, Check, Info, Merge, Sword, Clock, Zap, Scroll, BookOpen, X, ChevronDown, FlaskConical, Coins, Hand, BarChart3, Eraser } from 'lucide-react';

export const Interface: React.FC = () => {
  const [showRecipes, setShowRecipes] = useState(false);
  const [showPray, setShowPray] = useState(false);
  const [showChances, setShowChances] = useState(false);
  
  const phase = useGameStore((state) => state.phase);
  const placedGems = useGameStore((state) => state.placedGems);
  const wave = useGameStore((state) => state.wave);
  const lives = useGameStore((state) => state.playerLives);
  const gold = useGameStore((state) => state.gold);
  const researchLevel = useGameStore((state) => state.researchLevel);
  const startWave = useGameStore((state) => state.startWave);
  const selectedCellId = useGameStore((state) => state.selectedCellId);
  const grid = useGameStore((state) => state.grid);
  const confirmKeepGem = useGameStore((state) => state.confirmKeepGem);
  const combineGems = useGameStore((state) => state.combineGems);
  const combineSpecialGem = useGameStore((state) => state.combineSpecialGem);
  const downgradeGem = useGameStore((state) => state.downgradeGem);
  const upgradeResearch = useGameStore((state) => state.upgradeResearch);
  const togglePray = useGameStore((state) => state.togglePray);
  const activePray = useGameStore((state) => state.activePray);
  const removeStone = useGameStore((state) => state.removeStone);
  const stonesRemovedCount = useGameStore((state) => state.stonesRemovedCount);

  const selectedCell = useMemo(() => 
    grid.find(c => c.id === selectedCellId), 
    [grid, selectedCellId]
  );

  const canBasicCombine = useMemo(() => {
    if (!selectedCell || !selectedCell.gemType || selectedCell.type !== CellType.TOWER) return false;
    const sameGems = grid.filter(c => 
        c.type === CellType.TOWER && 
        c.gemType === selectedCell.gemType && 
        c.quality === selectedCell.quality
    );
    return sameGems.length >= 3;
  }, [grid, selectedCell]);

  const canDowngrade = useMemo(() => {
      if (!selectedCell || !selectedCell.quality) return false;
      return selectedCell.quality !== GemQuality.CHIPPED && selectedCell.quality !== GemQuality.SPECIAL;
  }, [selectedCell]);

  const availableRecipe = useMemo(() => {
    if (!selectedCell || !selectedCell.gemType || !selectedCell.quality) return null;
    const potentialRecipes = RECIPES.filter(r => 
        r.ingredients.some(i => i.type === selectedCell.gemType && i.quality === selectedCell.quality)
    );

    for (const recipe of potentialRecipes) {
        let needed = [...recipe.ingredients];
        const selfIdx = needed.findIndex(i => i.type === selectedCell.gemType && i.quality === selectedCell.quality);
        if (selfIdx > -1) needed.splice(selfIdx, 1);
        
        let hasAll = true;
        const usedIds = [selectedCell.id];
        
        for (const req of needed) {
            const found = grid.find(c => 
                c.type === CellType.TOWER && 
                c.gemType === req.type && 
                c.quality === req.quality &&
                !usedIds.includes(c.id)
            );
            if (found) {
                usedIds.push(found.id);
            } else {
                hasAll = false;
                break;
            }
        }
        if (hasAll) return recipe;
    }
    return null;
  }, [grid, selectedCell]);

  const stats = useMemo(() => {
    if (selectedCell && selectedCell.gemType && selectedCell.quality) {
        const typeStats = GEM_STATS[selectedCell.gemType];
        if (typeStats) {
            return typeStats[selectedCell.quality] || typeStats['Special'];
        }
    }
    return null;
  }, [selectedCell]);

  // Phase 5: Spawn Chances Data
  const spawnChances = useMemo(() => {
      return SPAWN_PROBABILITIES[researchLevel] || {};
  }, [researchLevel]);

  // Economic Values
  const stoneRemovalCost = BASE_STONE_COST + (stonesRemovedCount * STONE_COST_INCREMENT);
  const researchCost = RESEARCH_COSTS[researchLevel];

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
      {/* Header */}
      <div className="pointer-events-auto flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-lg">
            GEM <span className="text-sky-400">TD</span>
          </h1>
          <button 
             onClick={() => setShowChances(!showChances)}
             className="text-slate-400 text-xs font-medium tracking-tight hover:text-white flex items-center gap-1 mt-1"
          >
             <BarChart3 className="w-3 h-3" /> Spawn Chances
          </button>
        </div>
        
        <div className="flex gap-2 items-start">
            <div className="flex flex-col gap-2">
                <button 
                    onClick={upgradeResearch}
                    disabled={!researchCost || gold < researchCost}
                    className={`bg-purple-900/80 backdrop-blur-md p-2 px-3 rounded-xl border border-purple-500/50 flex flex-col items-end gap-0 transition-colors active:scale-95 ${(!researchCost || gold < researchCost) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-800/80'}`}
                >
                    <div className="flex items-center gap-2">
                         <FlaskConical className="w-4 h-4 text-purple-300" />
                         <span className="text-purple-100 font-bold text-sm">LVL {researchLevel}</span>
                    </div>
                    {researchCost && (
                        <span className="text-[10px] text-yellow-300 font-bold">{researchCost}g</span>
                    )}
                </button>

                {phase === GamePhase.BUILDING && (
                    <button 
                        onClick={() => setShowPray(true)}
                        className={`bg-indigo-600/80 hover:bg-indigo-500/80 backdrop-blur-md p-2 px-3 rounded-xl border border-indigo-400/50 flex items-center gap-2 transition-colors active:scale-95 ${activePray ? 'ring-2 ring-indigo-400' : ''}`}
                    >
                        <Hand className="w-4 h-4 text-indigo-200" />
                        <span className="text-indigo-100 font-bold text-sm">PRAY</span>
                    </button>
                )}
            </div>

            <div className="flex gap-2">
                <button 
                onClick={() => setShowRecipes(true)}
                className="bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur-md p-2 rounded-xl border border-slate-700/50 text-sky-400 transition-colors"
                >
                <BookOpen className="w-5 h-5" />
                </button>
                
                <div className="flex flex-col gap-1">
                    <div className="bg-slate-800/80 backdrop-blur-md p-2 px-3 rounded-xl border border-slate-700/50 flex items-center gap-2">
                        <Shield className="text-sky-400 w-5 h-5" />
                        <span className="text-white font-bold">{wave}</span>
                    </div>
                    <div className="bg-slate-800/80 backdrop-blur-md p-2 px-3 rounded-xl border border-slate-700/50 flex items-center gap-2">
                        <Heart className="text-red-500 w-5 h-5" />
                        <span className="text-white font-bold">{lives}</span>
                    </div>
                </div>

                <div className="bg-yellow-900/80 backdrop-blur-md p-2 px-3 rounded-xl border border-yellow-600/50 flex flex-col items-center justify-center min-w-[3.5rem]">
                    <Coins className="text-yellow-400 w-5 h-5 mb-1" />
                    <span className="text-yellow-100 font-bold text-sm leading-none">{gold}</span>
                </div>
            </div>
        </div>
      </div>

      {/* Spawn Chances Popover */}
      {showChances && (
          <div className="pointer-events-auto absolute top-20 left-6 bg-slate-900/95 border border-slate-700 p-3 rounded-lg text-xs w-40 animate-in fade-in zoom-in-95">
              <h4 className="text-white font-bold mb-2">Quality Odds (Lvl {researchLevel})</h4>
              {QUALITY_ORDER.filter(q => q !== GemQuality.SPECIAL).map(q => {
                  const val = spawnChances[q];
                  if (!val) return null;
                  return (
                      <div key={q} className="flex justify-between text-slate-300 mb-1">
                          <span>{q}</span>
                          <span className={val > 0 ? "text-emerald-400" : "text-slate-600"}>{val}%</span>
                      </div>
                  )
              })}
          </div>
      )}

      {/* Instructions / CTA Layer */}
      <div 
        className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 transition-all duration-300 ${
            phase === GamePhase.READY ? 'top-1/2 -translate-y-1/2' : 'top-28'
        }`}
        style={{ 
            opacity: selectedCellId ? 0 : 1,
            pointerEvents: selectedCellId || showRecipes || showPray ? 'none' : 'auto'
        }}
      >
        {phase === GamePhase.BUILDING && (
          <div className="bg-slate-900/90 backdrop-blur-sm px-6 py-3 rounded-2xl border border-slate-700 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3 text-sky-400 mb-1 justify-center">
              <Hammer className="w-4 h-4" />
              <span className="font-bold uppercase tracking-wide text-sm">Build Phase</span>
            </div>
            <p className="text-white text-base font-medium text-center">
              Place <span className="text-sky-400 text-xl font-bold">{5 - placedGems.length}</span> more gems
            </p>
          </div>
        )}

        {phase === GamePhase.SELECTING && !selectedCellId && (
          <div className="bg-slate-900/90 backdrop-blur-sm px-6 py-3 rounded-2xl border-2 border-emerald-500/50 shadow-2xl shadow-emerald-500/20 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3 text-emerald-400 mb-1 justify-center">
              <MousePointerClick className="w-4 h-4" />
              <span className="font-bold uppercase tracking-wide text-sm">Selection Phase</span>
            </div>
            <p className="text-white text-base font-medium text-center">
              Tap a <span className="text-emerald-400 font-bold">Gem</span> to inspect
            </p>
          </div>
        )}

        {phase === GamePhase.READY && (
             <button 
             onClick={startWave}
             className="bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-full font-bold text-xl shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 animate-in zoom-in duration-300"
           >
             <Play fill="currentColor" />
             START WAVE
           </button>
        )}
      </div>

      {/* Prayer Menu Modal */}
      {showPray && (
        <div className="pointer-events-auto absolute inset-0 bg-slate-950/90 backdrop-blur-lg z-50 flex flex-col items-center justify-center animate-in fade-in duration-200">
             <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-indigo-400 tracking-tight flex items-center gap-2">
                        <Hand className="w-6 h-6" /> PRAYER ALTAR
                    </h2>
                    <button 
                        onClick={() => setShowPray(false)}
                        className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                        <h3 className="text-white font-bold mb-2 flex items-center justify-between">
                            <span>QUALITY PRAYER</span>
                            <span className="text-yellow-400 text-sm flex items-center gap-1"><Coins className="w-3 h-3"/> {PRAY_COST_QUALITY}g</span>
                        </h3>
                        <p className="text-slate-400 text-sm mb-3">Increase chance of higher tier gems significantly for this turn.</p>
                        <button
                            onClick={() => togglePray('QUALITY')}
                            disabled={gold < PRAY_COST_QUALITY && activePray?.type !== 'QUALITY'}
                            className={`w-full py-3 rounded-lg font-bold transition-all ${
                                activePray?.type === 'QUALITY' 
                                ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                                : 'bg-slate-700 text-slate-300 hover:bg-indigo-900/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                        >
                            {activePray?.type === 'QUALITY' ? 'ACTIVE' : 'ACTIVATE'}
                        </button>
                    </div>

                    <div>
                        <h3 className="text-white font-bold mb-2 flex items-center justify-between">
                            <span>COLOR PRAYER</span>
                            <span className="text-yellow-400 text-sm flex items-center gap-1"><Coins className="w-3 h-3"/> {PRAY_COST_COLOR}g</span>
                        </h3>
                         <div className="grid grid-cols-4 gap-2">
                            {[
                                GemType.AMETHYST, GemType.AQUAMARINE, GemType.DIAMOND, GemType.EMERALD,
                                GemType.OPAL, GemType.RUBY, GemType.SAPPHIRE, GemType.TOPAZ
                            ].map((type) => (
                                <button
                                    key={type}
                                    onClick={() => togglePray('COLOR', type)}
                                    disabled={gold < PRAY_COST_COLOR && !(activePray?.type === 'COLOR' && activePray.target === type)}
                                    className={`p-2 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1 h-16 ${
                                        activePray?.type === 'COLOR' && activePray.target === type
                                        ? 'border-white bg-slate-700 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                                        : 'border-slate-800 bg-slate-900 hover:border-slate-600 disabled:opacity-50'
                                    }`}
                                >
                                     <div 
                                        className="w-4 h-4 rounded-sm shadow-sm"
                                        style={{ backgroundColor: GEM_COLORS[type] }}
                                    />
                                    <span className="text-[10px] uppercase font-bold text-slate-400">{type.slice(0,3)}</span>
                                </button>
                            ))}
                         </div>
                    </div>
                </div>
             </div>
        </div>
      )}

      {/* Recipe Modal Overlay */}
      {showRecipes && (
        <div className="pointer-events-auto absolute inset-0 bg-slate-950/90 backdrop-blur-lg z-50 flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <BookOpen className="text-sky-400 w-6 h-6" />
              <h2 className="text-2xl font-black text-white tracking-tight">RECIPES</h2>
            </div>
            <button 
              onClick={() => setShowRecipes(false)}
              className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RECIPES.map((recipe) => (
                <div key={recipe.result} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg shadow-inner flex items-center justify-center border border-white/10"
                      style={{ backgroundColor: GEM_COLORS[recipe.result] }}
                    >
                       <div className="w-2 h-2 rounded-full bg-white/50 blur-[2px]" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg leading-none">{recipe.result}</h3>
                      <p className="text-slate-400 text-xs mt-1">{recipe.description}</p>
                    </div>
                  </div>
                  <div className="h-px bg-slate-800 w-full" />
                  <div className="flex gap-2">
                    {recipe.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1 flex-1 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                        <div 
                          className="w-6 h-6 rounded-md shadow-sm border border-white/5"
                          style={{ backgroundColor: GEM_COLORS[ing.type] }}
                        />
                        <span className="text-[10px] uppercase font-bold text-slate-500 text-center leading-tight">
                          {ing.type.slice(0,3)}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-slate-600">
                          {ing.quality === 'Chipped' ? 'Q1' : 
                           ing.quality === 'Flawed' ? 'Q2' : 
                           ing.quality === 'Normal' ? 'Q3' : 
                           ing.quality === 'Flawless' ? 'Q4' : 
                           ing.quality === 'Perfect' ? 'Q5' : 'Q6'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Context Menu */}
      <div className={`flex justify-center w-full transition-opacity duration-200 ${showRecipes || showPray ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        {selectedCell && (selectedCell.type === CellType.TOWER || selectedCell.type === CellType.ROCK) && (
            <div className="pointer-events-auto w-full max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div 
                            className="w-12 h-12 rounded-lg shadow-inner flex items-center justify-center border border-white/10"
                            style={{ backgroundColor: selectedCell.gemType ? GEM_COLORS[selectedCell.gemType] : '#475569' }}
                        >
                             <div className="w-2 h-2 rounded-full bg-white/50 blur-[2px]" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-xl tracking-tight">
                                {selectedCell.gemType || 'Rock Barrier'}
                            </h3>
                            <p className="text-slate-400 text-xs uppercase font-semibold tracking-wider">
                                {selectedCell.quality ? `Quality: ${selectedCell.quality}` : 'Obstacle'}
                            </p>
                        </div>
                    </div>
                </div>

                {stats && (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                                <Sword className="w-3 h-3" /> DMG
                            </div>
                            <span className="text-white font-bold">{Math.round(stats.minDmg)}-{Math.round(stats.maxDmg)}</span>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                                <Clock className="w-3 h-3" /> SPD
                            </div>
                            <span className="text-white font-bold">{(1000/stats.cooldown).toFixed(1)}/s</span>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-slate-400 text-xs mb-1">
                                <Zap className="w-3 h-3" /> EFF
                            </div>
                            <span className="text-sky-300 font-bold text-xs leading-tight">{stats.special.split(' ')[0]}</span>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {/* ROCK: Removal Option */}
                    {selectedCell.type === CellType.ROCK && (
                         <button 
                         onClick={() => removeStone(selectedCell.id)}
                         disabled={gold < stoneRemovalCost}
                         className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                             gold >= stoneRemovalCost 
                             ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20 active:scale-95' 
                             : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                         }`}
                        >
                         <Eraser className="w-5 h-5" />
                         REMOVE STONE ({stoneRemovalCost}g)
                        </button>
                    )}

                    {phase === GamePhase.SELECTING && placedGems.includes(selectedCell.id) && (
                        <button 
                            onClick={confirmKeepGem}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-lg py-3 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Check className="w-6 h-6" strokeWidth={3} />
                            KEEP THIS GEM
                        </button>
                    )}

                    {canBasicCombine && (
                        <button 
                            onClick={() => combineGems(selectedCell.id)}
                            className="w-full bg-sky-500 hover:bg-sky-400 text-slate-900 font-black text-lg py-3 rounded-xl shadow-lg shadow-sky-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Merge className="w-6 h-6" />
                            COMBINE 3 GEMS
                        </button>
                    )}

                    {availableRecipe && (
                         <button 
                         onClick={() => combineSpecialGem(availableRecipe.result, selectedCell.id)}
                         className="w-full bg-purple-500 hover:bg-purple-400 text-white font-black text-lg py-3 rounded-xl shadow-lg shadow-purple-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 animate-pulse"
                     >
                         <Scroll className="w-6 h-6" />
                         CRAFT {availableRecipe.result}
                     </button>
                    )}

                    {canDowngrade && (
                        <button 
                            onClick={() => downgradeGem(selectedCell.id)}
                            className="w-full bg-orange-500/20 hover:bg-orange-500/40 border border-orange-500/50 text-orange-200 font-bold text-sm py-2 rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <ChevronDown className="w-4 h-4" />
                            DOWNGRADE
                        </button>
                    )}

                    {(!placedGems.includes(selectedCell.id) || phase !== GamePhase.SELECTING) && !canBasicCombine && !availableRecipe && !stats && !canDowngrade && selectedCell.type === CellType.TOWER && (
                         <div className="text-center p-2 bg-slate-800/50 rounded-lg">
                            <p className="text-slate-500 text-sm font-medium">Inspecting Structure</p>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};