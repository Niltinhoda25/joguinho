'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Play, RotateCcw, Trophy, Music } from 'lucide-react';

const AUDIO_URL = "https://www.dropbox.com/scl/fi/lqz08qxekdwbj6kdon7g1/Vicetone-Nevada-ft.-Cozi-Zuehlsdorff-WaveMusic-youtube.mp3?rlkey=0ux8r1bv5judmjsy6166sz57k&st=caoc788r&dl=1";

interface Tile {
  id: number;
  lane: number;
  y: number; // 0 to 1 scaling (top to bottom)
  startTime: number;
  hit: boolean;
  missed: boolean;
}

const LANES = 4;
const TILE_HEIGHT = 160; // Approximate height in pixels
const FALL_SPEED = 0.6; // Speed factor
const SPAWN_INTERVAL = 480; // ms (approx 124 BPM)

export default function NevadaPianoTiles() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [isAudioLoading, setIsAudioLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastSpawnTimeRef = useRef<number>(0);
  const nextTileIdRef = useRef<number>(0);
  const scoreRef = useRef(0);

  const spawnTile = useCallback((time: number) => {
    const lane = Math.floor(Math.random() * LANES);
    const newTile: Tile = {
      id: nextTileIdRef.current++,
      lane,
      y: -0.2, // Start slightly above
      startTime: time,
      hit: false,
      missed: false,
    };
    setTiles(prev => [...prev, newTile]);
  }, []);

  const startGame = () => {
    setScore(0);
    scoreRef.current = 0;
    setTiles([]);
    setGameState('playing');
    lastTimeRef.current = performance.now();
    lastSpawnTimeRef.current = performance.now();
    nextTileIdRef.current = 0;
    
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
  };

  const endGame = useCallback(() => {
    setGameState('gameover');
    if (audioRef.current) {
      audioRef.current.pause();
    }
    cancelAnimationFrame(requestRef.current);

    if (scoreRef.current > highScore) {
      setHighScore(scoreRef.current);
      localStorage.setItem('nevada-high-score', scoreRef.current.toString());
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [highScore]);

  // Initialize Audio
  useEffect(() => {
    const audio = new Audio(AUDIO_URL);
    audio.crossOrigin = "anonymous";
    audio.oncanplaythrough = () => setIsAudioLoading(false);
    audio.onended = () => endGame();
    audioRef.current = audio;

    const savedHighScore = localStorage.getItem('nevada-high-score');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore));
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [endGame]);

  const handleTileTap = (tileId: number, lane: number) => {
    if (gameState !== 'playing') return;

    setTiles(prev => {
      const tile = prev.find(t => t.id === tileId);
      if (tile && !tile.hit && !tile.missed) {
        // Simple hit detection logic
        // If the lowest tile in this lane is this tile, it's a valid hit
        const laneTiles = prev.filter(t => t.lane === lane && !t.hit);
        const lowestTileId = laneTiles.sort((a, b) => b.y - a.y)[0]?.id;

        if (tileId === lowestTileId) {
          const newScore = scoreRef.current + 1;
          scoreRef.current = newScore;
          setScore(newScore);
          return prev.map(t => t.id === tileId ? { ...t, hit: true } : t);
        }
      }
      return prev;
    });
  };

  const handleLaneTap = (lane: number) => {
    if (gameState !== 'playing') return;

    // Direct lane tapping logic: find the lowest unhit tile in this lane
    const unhitTiles = tiles.filter(t => t.lane === lane && !t.hit);
    if (unhitTiles.length > 0) {
      const sorted = unhitTiles.sort((a, b) => b.y - a.y);
      const target = sorted[0];

      // Check if the tile is within the "hit zone" (bottom 40% of screen)
      if (target.y > 0.4 && target.y < 0.95) {
        handleTileTap(target.id, lane);
      } else if (target.y >= 0.95) {
        // Too late (already missed by the game loop likely, but just in case)
        endGame();
      } else {
        // Too early or miss
        // For classic piano tiles, tapping an empty lane or too far is a miss
        // endgame(); 
      }
    } else {
      // Tapped lane with no tiles
      endGame();
    }
  };

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // Spawn tiles
      if (time - lastSpawnTimeRef.current > SPAWN_INTERVAL) {
        spawnTile(time);
        lastSpawnTimeRef.current = time;
      }

      // Update progress
      if (audioRef.current) {
        const p = (audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100;
        setProgress(p);
      }

      setTiles(prev => {
        let missedAny = false;
        const currentSpeed = FALL_SPEED * (1 + scoreRef.current / 100);
        const nextTiles = prev.map(tile => {
          if (tile.hit) return tile;
          
          const newY = tile.y + (currentSpeed * dt) / 1000;
          
          if (newY > 1.0 && !tile.hit && !tile.missed) {
            missedAny = true;
            return { ...tile, y: newY, missed: true };
          }
          
          return { ...tile, y: newY };
        }).filter(tile => tile.y < 1.2); // Clean up old tiles

        if (missedAny) {
          // Trigger game over in next frame to avoid state update during render
          setTimeout(() => endGame(), 0);
          return prev;
        }

        return nextTiles;
      });

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameState, spawnTile, endGame]);

  return (
    <main className="fixed inset-0 bg-[#05070a] text-white font-sans overflow-hidden flex flex-col justify-center items-center select-none touch-none p-4">
      {/* Game Outer Shell - Mobile Device Look */}
      <div 
        className="relative w-full max-w-[400px] h-full max-h-[700px] bg-[#0f141d] border-[8px] border-[#1a1f29] rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.8),0_0_40px_rgba(0,240,255,0.1)] overflow-hidden flex flex-col"
      >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-[4px] bg-white/10 z-50">
          <motion.div 
            className="h-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff]"
            animate={{ width: `${progress}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>

        {/* HUD */}
        <div className="relative z-10 pt-10 px-5 pb-5 flex flex-col items-center pointer-events-none text-center">
          <div className="score-wrapper">
            <div className="text-[10px] uppercase tracking-[4px] opacity-60 mb-1">Score</div>
            <div className="text-[56px] font-extralight tracking-[-2px] leading-none">{score.toLocaleString()}</div>
            <AnimatePresence>
              {score > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[#00f0ff] font-bold text-sm mt-2 shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                >
                  COMBO x{score}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Game Area / Stage */}
        <div 
          ref={containerRef}
          className="relative flex-1 flex z-10 w-full bg-gradient-to-b from-[#0f141d] to-[#141a26] border-t border-white/5 overflow-hidden"
        >
          {/* Lane Dividers */}
          {[...Array(LANES - 1)].map((_, i) => (
            <div key={i} className="absolute h-full w-[1px] bg-white/5 z-0" style={{ left: `${(i + 1) * 25}%` }} />
          ))}

          {/* Lanes */}
          {[...Array(LANES)].map((_, laneIndex) => (
            <div 
              key={laneIndex} 
              className="flex-1 h-full relative cursor-pointer active:bg-white/[0.03] transition-colors"
              onPointerDown={() => handleLaneTap(laneIndex)}
            >
              {/* Tiles in this lane */}
              {tiles.filter(t => t.lane === laneIndex).map(tile => (
                <motion.div
                  key={tile.id}
                  initial={false}
                  animate={{
                    top: `${tile.y * 100}%`,
                    // We change styling based on hit state
                  }}
                  transition={{ type: 'tween', ease: 'linear', duration: 0 }}
                  style={{
                    height: `${TILE_HEIGHT}px`,
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    zIndex: tile.hit ? 5 : 10,
                  }}
                  className={`
                    mx-1 rounded-sm border border-white/10 flex items-center justify-center overflow-hidden
                    ${tile.hit 
                      ? 'bg-gradient-to-br from-[#ff007a] to-[#b80058] shadow-[0_0_20px_rgba(255,0,122,0.6)]' 
                      : 'bg-gradient-to-br from-[#00f0ff] to-[#0098a1] shadow-[0_0_15px_rgba(0,240,255,0.4),inset_0_0_20px_rgba(255,255,255,0.2)]'
                    }
                  `}
                >
                  {tile.hit && (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center_80%,rgba(0,240,255,0.2)_0%,transparent_70%)] animate-pulse" />
                  )}
                </motion.div>
              ))}
            </div>
          ))}

          {/* Tap Zone Gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-t from-[#00f0ff]/[0.05] to-transparent border-t border-[#00f0ff]/20 pointer-events-none" />
        </div>

        {/* Song Info */}
        <div className="relative z-10 w-full py-8 text-center pointer-events-none">
          <div className="text-[16px] font-semibold tracking-[1px] uppercase mb-1">Nevada</div>
          <div className="text-[11px] opacity-50 tracking-[1px]">Vicetone ft. Cozi Zuehlsdorff</div>
        </div>

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'start' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/90 backdrop-blur-xl p-6 text-center"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="mb-12"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-[#00f0ff] to-[#0098a1] rounded-[24px] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,240,255,0.3)] mx-auto border border-white/20">
                  <Music className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-4xl font-black mb-2 tracking-tighter italic">NEVADA</h2>
                <p className="text-white/40 text-[11px] uppercase tracking-widest max-w-[240px] mx-auto leading-relaxed">
                  Extract styling and layout patterns. Follow the rhythm.
                </p>
              </motion.div>

              <button
                onClick={startGame}
                disabled={isAudioLoading}
                className={`
                  group relative px-12 py-5 rounded-full font-bold text-xl overflow-hidden transition-all active:scale-95
                  ${isAudioLoading ? 'bg-white/10 text-white/30 cursor-wait' : 'bg-white text-black hover:bg-[#00f0ff] hover:text-white'}
                `}
              >
                <span className="relative z-10 flex items-center gap-3">
                  {isAudioLoading ? (
                    <>LOADING...</>
                  ) : (
                    <>
                      PLAY <Play className="fill-current w-6 h-6" />
                    </>
                  )}
                </span>
                {!isAudioLoading && (
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff] to-[#0098a1] opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>

              {highScore > 0 && (
                <div className="mt-8 flex items-center gap-2 text-white/50 text-[10px] uppercase tracking-[3px] font-mono">
                  <Trophy className="w-4 h-4 text-[#00f0ff]" />
                  Best: {highScore}
                </div>
              )}
            </motion.div>
          )}

          {gameState === 'gameover' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#05070a]/95 backdrop-blur-2xl p-6 text-center"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="mb-8"
              >
                <div className="text-[32px] font-black italic text-[#ff007a] uppercase tracking-[2px] mb-2 drop-shadow-[0_0_10px_rgba(255,0,122,0.4)]">MISS!</div>
                <div className="text-[10px] uppercase tracking-[4px] text-[#00f0ff] font-bold mb-8">Game Over</div>
                
                <div className="bg-white/[0.03] border border-white/10 rounded-[32px] p-10 backdrop-blur-md mb-8">
                  <div className="text-[10px] text-white/40 uppercase tracking-[4px] mb-2">Final Score</div>
                  <div className="text-[64px] font-extralight tracking-[-2px] text-white leading-none">{score.toLocaleString()}</div>
                </div>
              </motion.div>

              <div className="flex flex-col gap-4 w-full max-w-[240px]">
                <button
                  onClick={startGame}
                  className="w-full bg-[#00f0ff] hover:bg-[#00d8e6] text-black py-5 rounded-[20px] font-black text-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,240,255,0.3)]"
                >
                  RETRY <RotateCcw className="w-6 h-6" />
                </button>
                
                <button
                  onClick={() => setGameState('start')}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/50 py-4 rounded-[20px] font-bold text-sm tracking-[1px] transition-all"
                >
                  MENU
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Background Ambience */}
      <div className="fixed inset-0 z-[-1] pointer-events-none">
        <div className="absolute top-[20%] left-[-10%] w-[60%] h-[60%] bg-[#00f0ff]/[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] bg-[#ff007a]/[0.03] blur-[120px] rounded-full" />
      </div>
    </main>
  );
}
