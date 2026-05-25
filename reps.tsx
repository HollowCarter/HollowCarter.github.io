```react
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Settings, BarChart2, RotateCcw, Check, Plus, Minus, AlertTriangle, Target } from "lucide-react";

// ─── Math & Date Utils ────────────────────────────────────────────────────────
const CX = 150, CY = 150, R = 108, STK = 14, DPR = 36;

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(sweep) {
  if (sweep <= 0) return null;
  const s = polar(CX, CY, R, 0);
  const e = polar(CX, CY, R, Math.min(sweep, 359.99));
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function arcPathNeg(sweep) {
  if (sweep <= 0) return null;
  const s = polar(CX, CY, R, 0);
  const e = polar(CX, CY, R, -Math.min(sweep, 359.99));
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${R} ${R} 0 ${sweep > 180 ? 1 : 0} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function today() { return fmtDate(new Date()); }

function last7() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return fmtDate(d);
  });
}

function parseDate(s) { 
  const [y, m, d] = s.split('-').map(Number); 
  return new Date(y, m - 1, d); 
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── IndexedDB Storage Wrapper ────────────────────────────────────────────────
const DB_NAME = 'replogger-db';
const DB_VER = 1;
const STORE = 'kv';
let _db = null;

function getDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'k' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

const IDB = {
  async get(key) {
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = e => resolve(e.target.result?.v ?? null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  },
  async set(key, val) {
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ k: key, v: val });
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e.target.error);
      });
    } catch {}
  },
  async del(key) {
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {}
  }
};


// ─── Isolated Components ──────────────────────────────────────────────────────

// 1. Dial Component (Isolated to prevent entire app re-render on drag)
function PushupDial({ todayReps, todayTarget, progress, onBank }) {
  const [arc, setArc] = useState(0);
  const [dialReps, setDialReps] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [lapFlash, setLapFlash] = useState(false);
  const [bankPop, setBankPop] = useState(false);

  const svgRef = useRef(null);
  const lastA = useRef(0);
  const accA = useRef(0);
  const prevLap = useRef(0);

  const getA = (cx, cy) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return Math.atan2(cy - (rect.top + rect.height / 2), cx - (rect.left + rect.width / 2)) * 180 / Math.PI;
  };

  const onStart = (e) => {
    e.preventDefault();
    const pt = e.touches?.[0] ?? e;
    lastA.current = getA(pt.clientX, pt.clientY);
    accA.current = arc;
    prevLap.current = Math.floor(arc / 360);
    setIsTracking(true);
  };

  const onMove = useCallback((e) => {
    if (!isTracking) return;
    e.preventDefault(); // Prevents scrolling while dialing
    const pt = e.touches?.[0] ?? e;
    const a = getA(pt.clientX, pt.clientY);
    
    // Prevent huge jumps if moving too close to the center
    const rect = svgRef.current.getBoundingClientRect();
    const dist = Math.hypot(pt.clientX - (rect.left + rect.width / 2), pt.clientY - (rect.top + rect.height / 2));
    if (dist < 30) return;

    let d = a - lastA.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    
    accA.current = accA.current + d;
    lastA.current = a;
    
    const newDeg = accA.current;
    const nl = Math.floor(newDeg / 360);
    
    if (nl > prevLap.current) { 
      setLapFlash(true); 
      setTimeout(() => setLapFlash(false), 350); 
    }
    prevLap.current = nl;
    
    setArc(newDeg);
    setDialReps(Math.trunc(newDeg / DPR));
  }, [isTracking]);

  const onEnd = useCallback(() => setIsTracking(false), []);

  useEffect(() => {
    if (isTracking) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isTracking, onMove, onEnd]);

  const handleBank = () => {
    if (dialReps === 0) return;
    onBank(dialReps);
    setArc(0); 
    setDialReps(0); 
    accA.current = 0;
    setBankPop(true); 
    setTimeout(() => setBankPop(false), 600);
  };

  const isNeg = arc < 0;
  const absSweep = Math.abs(arc) % 360;
  const lapsComplete = isNeg ? 0 : Math.floor(arc / 360);
  const lapSweep = isNeg ? absSweep : arc % 360;
  const path = isNeg ? arcPathNeg(lapSweep) : arcPath(lapSweep);
  const tip = lapSweep > 4 ? polar(CX, CY, R, isNeg ? -lapSweep : lapSweep) : null;
  const arcColor = isNeg ? '#EF4444' : '#F59E0B'; // Tailwind Red-500 or Amber-500
  const startDot = polar(CX, CY, R, 0);

  return (
    <div className="flex flex-col items-center px-5 pt-4 w-full">
      {/* Today Card */}
      <div className="w-full bg-white rounded-2xl p-5 mb-4 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-2">
          <span className="text-slate-800 font-bold text-base">Today</span>
          <span className={`text-2xl font-extrabold transition-transform duration-300 ${bankPop ? 'scale-110' : 'scale-100'} ${progress >= 1 ? 'text-green-500' : 'text-amber-500'}`}>
            {todayReps}
            <span className="text-sm font-medium text-slate-300 ml-1">/ {todayTarget}</span>
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ease-out ${progress >= 1 ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-amber-400 to-amber-300'}`}
            style={{ width: `${progress * 100}%` }} 
          />
        </div>
        {progress >= 1 && (
          <div className="text-xs text-green-500 font-bold mt-2 flex items-center gap-1">
            <Check size={14} strokeWidth={3} /> Daily target smashed!
          </div>
        )}
      </div>

      {/* Lap Indicators */}
      <div className="h-4 flex gap-1.5 items-center mb-2">
        {lapsComplete > 0 && Array.from({ length: Math.min(lapsComplete, 12) }).map((_, i) => (
          <div key={i} className={`w-2 h-2 rounded-full bg-amber-500 transition-transform ${lapFlash && i === lapsComplete - 1 ? 'scale-150' : 'scale-100'}`} />
        ))}
        {lapsComplete > 12 && <span className="text-[10px] text-amber-500 font-bold">+{lapsComplete - 12}</span>}
      </div>

      {/* Interactive SVG Dial */}
      <svg 
        ref={svgRef} 
        width={300} height={300} viewBox="0 0 300 300"
        className={`touch-none drop-shadow-xl ${isTracking ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={onStart} onTouchStart={onStart}
      >
        <circle cx={CX} cy={CY} r={R + STK / 2 + 9} fill="none" stroke="rgba(245, 158, 11, 0.05)" strokeWidth={20} />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#F1F5F9" strokeWidth={STK} />
        <circle cx={CX} cy={CY} r={R - STK - 6} fill="white" />
        
        {lapsComplete > 0 && <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(245, 158, 11, 0.15)" strokeWidth={STK} />}
        {path && <path d={path} fill="none" stroke={arcColor} strokeWidth={STK} strokeLinecap="round" />}
        
        <circle cx={startDot.x} cy={startDot.y} r={7} fill={arc !== 0 ? arcColor : '#E2E8F0'} className="transition-colors duration-200" />
        
        {tip && (
          <g>
            <circle cx={tip.x} cy={tip.y} r={20} fill="white" opacity={0.6} />
            <circle cx={tip.x} cy={tip.y} r={17} fill="#1E293B" stroke={arcColor} strokeWidth={2.5} />
            {isNeg
              ? <line x1={tip.x - 6} y1={tip.y} x2={tip.x + 6} y2={tip.y} stroke={arcColor} strokeWidth={2.5} strokeLinecap="round" />
              : <polyline points={`${tip.x - 5.5},${tip.y} ${tip.x - 1.5},${tip.y + 4.5} ${tip.x + 6.5},${tip.y - 5.5}`} fill="none" stroke={arcColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            }
          </g>
        )}
        
        <text x={CX} y={CY + (Math.abs(dialReps) > 99 ? 4 : 8)} textAnchor="middle" dominantBaseline="middle" fill={isNeg ? '#EF4444' : '#1E293B'} fontSize={Math.abs(dialReps) > 99 ? 50 : 68} fontWeight={900}>
          {dialReps}
        </text>
        <text x={CX} y={CY + 44} textAnchor="middle" fill={isNeg ? '#FCA5A5' : '#94A3B8'} fontSize={13} fontWeight={500}>
          {isNeg ? 'reps to remove' : dialReps === 1 ? 'rep' : 'reps to bank'}
        </text>
        
        {lapsComplete > 0 && (
          <>
            <rect x={CX - 30} y={CY - 82} width={60} height={20} rx={10} fill="#F59E0B" opacity={0.12} />
            <text x={CX} y={CY - 69} textAnchor="middle" fill="#D97706" fontSize={11} fontWeight={700}>
              {lapsComplete} lap{lapsComplete > 1 ? 's' : ''}
            </text>
          </>
        )}
      </svg>

      {/* Bank Action Button */}
      <button 
        onClick={handleBank} 
        disabled={dialReps === 0}
        className={`mt-6 w-[82%] py-4 rounded-full font-bold text-lg tracking-wide transition-all duration-300 shadow-lg
          ${dialReps > 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-500/40 hover:scale-105 active:scale-95' 
          : dialReps < 0 ? 'bg-gradient-to-br from-red-400 to-red-600 text-white shadow-red-500/40 hover:scale-105 active:scale-95' 
          : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'}`}
      >
        {dialReps > 0 
          ? `Bank ${dialReps} Push-up${dialReps !== 1 ? 's' : ''}`
          : dialReps < 0 
            ? `Remove ${Math.abs(dialReps)} Push-up${Math.abs(dialReps) !== 1 ? 's' : ''}`
            : 'Bank Push-ups'}
      </button>
      
      <p className={`text-xs mt-3 ${isNeg ? 'text-red-400' : 'text-slate-400'}`}>
        {dialReps === 0
          ? 'Drag clockwise to add · anticlockwise to correct'
          : isNeg
            ? `Will correct today's total to ${Math.max(0, todayReps + dialReps)}`
            : 'Tap to save to today\'s total'}
      </p>
    </div>
  );
}

// 2. Stats Component
function StatsTab({ history, defTarget, onEditDay }) {
  const days = last7();
  const maxV = Math.max(
    ...days.map(d => Math.max(history[d]?.target ?? defTarget, history[d]?.reps ?? 0, 1)),
    defTarget
  );
  
  const CH = 180, CW = 300, BW = 28, gap = CW / 7;
  const td = today();

  return (
    <div className="px-4 py-5 w-full">
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-slate-100">
        <h2 className="text-lg font-extrabold text-slate-800 text-center mb-4 tracking-tight">Daily Progress</h2>
        <svg width="100%" viewBox={`-4 0 ${CW + 44} ${CH + 62}`}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => {
            const y = CH - f * CH + 4;
            const v = Math.round(f * maxV);
            return (
              <g key={f}>
                <line x1={32} y1={y} x2={CW + 32} y2={y} stroke={f === 0 ? '#CBD5E1' : '#F1F5F9'} strokeWidth={f === 0 ? 1 : 0.8} />
                <text x={29} y={y + 4} textAnchor="end" fill="#94A3B8" fontSize={9} fontWeight={500}>{v}</text>
              </g>
            );
          })}
          
          {days.map((date, i) => {
            const x = 32 + i * gap + gap / 2;
            const d = history[date] ?? {};
            const reps = d.reps ?? 0;
            const tgt = d.target ?? defTarget;
            const isToday = date === td;
            const done = reps > 0 && reps >= tgt;
            const tH = (tgt / maxV) * CH;
            const rH = Math.max(0, (reps / maxV) * CH);

            return (
              <g key={date} className="cursor-pointer group" onClick={() => onEditDay(date, tgt)}>
                {/* Background Target Bar */}
                <rect x={x - BW / 2} y={CH - tH + 4} width={BW} height={tH} rx={6} fill="#F1F5F9" className="group-hover:fill-slate-200 transition-colors" />
                
                {/* Foreground Reps Bar */}
                {reps > 0 && (
                  <rect x={x - BW / 2} y={CH - rH + 4} width={BW} height={rH} rx={6} fill={done ? '#FBBF24' : isToday ? '#D97706' : '#F59E0B'} />
                )}
                
                {isToday && <circle cx={x} cy={CH + 16} r={3} fill="#F59E0B" />}
                
                <text x={x} y={CH + 30} textAnchor="middle" fontSize={11} fontWeight={isToday ? 700 : 500} fill={isToday ? '#F59E0B' : '#64748B'}>
                  {parseDate(date).getDate()}
                </text>
                <text x={x} y={CH + 44} textAnchor="middle" fontSize={8.5} fill="#94A3B8">
                  {DOW2[parseDate(date).getDay()]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex gap-4 justify-center mt-2">
          {[
            { c: 'bg-slate-100', l: 'Target' },
            { c: 'bg-amber-600', l: 'Banked' },
            { c: 'bg-amber-400', l: 'Completed' }
          ].map(({ c, l }) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-sm ${c}`} />
              <span className="text-[10px] text-slate-500 font-medium">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* List Breakdown */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-4">Weekly Breakdown</div>
        {[...days].reverse().map((date, i) => {
          const d = history[date] ?? {};
          const reps = d.reps ?? 0;
          const tgt = d.target ?? defTarget;
          const pct = Math.min(reps / tgt, 1);
          const isToday = date === td;
          const done = reps >= tgt && reps > 0;
          const label = isToday ? 'Today' : DOW[parseDate(date).getDay()];
          
          return (
            <div key={date} className={`cursor-pointer ${i < 6 ? 'mb-4' : ''}`} onClick={() => onEditDay(date, tgt)}>
              <div className="flex justify-between items-baseline mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isToday ? 'text-amber-500 font-extrabold' : 'text-slate-800'}`}>{label}</span>
                  {done && <Check size={12} className="text-amber-400" strokeWidth={4} />}
                </div>
                <span className="text-sm text-slate-500 font-medium">{reps} <span className="text-slate-300">/ {tgt}</span></span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-amber-400' : isToday ? 'bg-amber-500' : 'bg-amber-600'}`} 
                  style={{ width: `${pct * 100}%` }} 
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-slate-400 mt-4 text-center">Tap any day to edit its target</p>
      </div>
    </div>
  );
}

// 3. Settings Component
function SettingsTab({ history, defTarget, onSaveTarget, onResetAll }) {
  const [settTarget, setSettTarget] = useState(String(defTarget));
  const [savedAnim, setSavedAnim] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSave = () => {
    onSaveTarget(Math.max(1, parseInt(settTarget) || 100));
    setSavedAnim(true);
    setTimeout(() => setSavedAnim(false), 1600);
  };

  const handleReset = () => {
    if (!confirmReset) { 
      setConfirmReset(true); 
      setTimeout(() => setConfirmReset(false), 3000); 
      return; 
    }
    onResetAll();
    setConfirmReset(false);
  };

  const totalDays = Object.keys(history).length;
  const totalReps = Object.values(history).reduce((a, d) => a + (d.reps || 0), 0);

  return (
    <div className="px-4 py-5 w-full space-y-4">
      {/* Target Setting */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-base mb-1">
          <Target size={18} className="text-amber-500" /> Default Daily Target
        </div>
        <div className="text-xs text-slate-500 mb-4">
          Applies to any day without a custom target. Tap a day in Progress to override.
        </div>
        
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => setSettTarget(s => String(Math.max(1, (parseInt(s) || 100) - 10)))}
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          ><Minus size={20} /></button>
          
          <input 
            type="number" 
            value={settTarget}
            onChange={e => setSettTarget(e.target.value)}
            className="flex-1 h-12 rounded-xl border-2 border-slate-100 bg-slate-50 text-xl font-bold text-slate-800 text-center outline-none focus:border-amber-400 transition-colors" 
          />
          
          <button 
            onClick={() => setSettTarget(s => String((parseInt(s) || 100) + 10))}
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          ><Plus size={20} /></button>
        </div>
        
        <button 
          onClick={handleSave} 
          className={`w-full py-3.5 rounded-xl font-bold text-white transition-all shadow-md flex items-center justify-center gap-2
            ${savedAnim ? 'bg-green-500 shadow-green-500/30' : 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-amber-500/30 hover:shadow-amber-500/50'}`}
        >
          {savedAnim ? <><Check size={18} /> Saved</> : 'Save Target'}
        </button>
      </div>

      {/* Stats Summary */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex justify-between items-center">
        <div>
          <div className="text-sm font-bold text-slate-800 mb-1">Days Logged</div>
          <div className="text-2xl font-extrabold text-amber-500">{totalDays}</div>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div className="text-right">
          <div className="text-sm font-bold text-slate-800 mb-1">All-time Reps</div>
          <div className="text-2xl font-extrabold text-amber-500">{totalReps.toLocaleString()}</div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 mt-8">
        <div className="text-slate-800 font-bold text-base mb-1">Data</div>
        <div className="text-xs text-slate-500 mb-4">Permanently delete all logged reps and history.</div>
        
        <button 
          onClick={handleReset} 
          className={`w-full py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2
            ${confirmReset ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
        >
          {confirmReset ? <><AlertTriangle size={18} /> Tap again to confirm</> : 'Reset All Data'}
        </button>
      </div>
    </div>
  );
}


// ─── Main App Shell ───────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('counter');
  const [history, setHistory] = useState({});
  const [defTarget, setDefTarget] = useState(100);
  const [loaded, setLoaded] = useState(false);
  
  const [editDay, setEditDay] = useState(null);
  const [editInput, setEditInput] = useState('');

  // Initial Load
  useEffect(() => {
    (async () => {
      const s = await IDB.get('pushup:settings');
      if (s?.defaultTarget) setDefTarget(s.defaultTarget);
      
      const h = await IDB.get('pushup:history');
      if (h) setHistory(h);
      
      setLoaded(true);
    })();
  }, []);

  // Handlers
  const handleBankReps = async (repsToAdd) => {
    const td = today();
    const todayTarget = history[td]?.target ?? defTarget;
    const nh = { ...history };
    const day = nh[td] ?? { reps: 0, target: todayTarget };
    nh[td] = { ...day, reps: Math.max(0, (day.reps ?? 0) + repsToAdd) };
    
    setHistory(nh);
    await IDB.set('pushup:history', nh);
  };

  const handleSaveDayTarget = async () => {
    const val = Math.max(1, parseInt(editInput) || defTarget);
    const nh = { ...history, [editDay]: { ...(history[editDay] ?? { reps: 0 }), target: val } };
    
    setHistory(nh);
    await IDB.set('pushup:history', nh);
    setEditDay(null);
  };

  const handleSaveDefTarget = async (val) => {
    setDefTarget(val);
    await IDB.set('pushup:settings', { defaultTarget: val });
  };

  const handleResetAll = async () => {
    setHistory({});
    await IDB.del('pushup:history');
  };

  if (!loaded) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4" />
      <div className="text-slate-400 font-medium text-sm">Warming up...</div>
    </div>
  );

  const td = today();
  const todayReps = history[td]?.reps ?? 0;
  const todayTarget = history[td]?.target ?? defTarget;
  const progress = Math.min(todayReps / todayTarget, 1);

  return (
    <div className="h-screen max-w-[430px] mx-auto bg-slate-50 flex flex-col font-sans overflow-hidden relative selection:bg-amber-100">
      
      {/* Top Nav */}
      <div className="h-[52px] bg-white/90 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-center shrink-0 z-10">
        <span className="text-[16px] font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          {tab === 'counter' && '💪 Rep Logger'}
          {tab === 'stats' && '📊 Progress'}
          {tab === 'settings' && '⚙️ Settings'}
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {tab === 'counter' && (
          <PushupDial 
            todayReps={todayReps} 
            todayTarget={todayTarget} 
            progress={progress} 
            onBank={handleBankReps} 
          />
        )}
        
        {tab === 'stats' && (
          <StatsTab 
            history={history} 
            defTarget={defTarget} 
            onEditDay={(date, tgt) => { setEditDay(date); setEditInput(String(tgt)); }} 
          />
        )}
        
        {tab === 'settings' && (
          <SettingsTab 
            history={history} 
            defTarget={defTarget} 
            onSaveTarget={handleSaveDefTarget} 
            onResetAll={handleResetAll} 
          />
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div className="h-[84px] bg-white border-t border-slate-200 flex shrink-0 pb-4 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-10">
        {[
          { id: 'counter', icon: RotateCcw, label: 'Counter' },
          { id: 'stats', icon: BarChart2, label: 'Progress' },
          { id: 'settings', icon: Settings, label: 'Settings' },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id)} 
              className="flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 transition-colors"
            >
              <Icon size={22} className={active ? 'text-amber-500' : 'text-slate-400'} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] font-bold tracking-wide ${active ? 'text-amber-500' : 'text-slate-400'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Edit Day Target Sheet Overlay */}
      {editDay && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-end" onClick={() => setEditDay(null)}>
          <div 
            onClick={e => e.stopPropagation()} 
            className="bg-white w-full max-w-[430px] mx-auto rounded-t-3xl p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom-full duration-300"
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-200 mx-auto mb-6" />
            
            <div className="text-lg font-bold text-slate-800 mb-1">Set Daily Target</div>
            <div className="text-sm text-slate-500 mb-6 font-medium">
              {editDay === td ? 'Today' : parseDate(editDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            
            <div className="flex items-center gap-4 mb-8">
              <button 
                onClick={() => setEditInput(s => String(Math.max(1, (parseInt(s) || 100) - 10)))}
                className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600 active:bg-slate-200 transition-colors"
              ><Minus size={24} /></button>
              
              <input 
                autoFocus 
                type="number" 
                value={editInput}
                onChange={e => setEditInput(e.target.value)}
                className="flex-1 h-14 rounded-2xl border-2 border-slate-200 bg-white text-2xl font-extrabold text-slate-800 text-center outline-none focus:border-amber-400 transition-colors" 
              />
              
              <button 
                onClick={() => setEditInput(s => String((parseInt(s) || 100) + 10))}
                className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 text-slate-600 active:bg-slate-200 transition-colors"
              ><Plus size={24} /></button>
            </div>
            
            <button 
              onClick={handleSaveDayTarget} 
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-white text-lg font-bold shadow-lg shadow-amber-500/30 active:scale-95 transition-transform"
            >
              Save Target
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

```
