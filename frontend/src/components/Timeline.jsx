import React, { useRef, useState } from 'react';
import { Plus, Sliders, Scissors, ZoomIn } from 'lucide-react';

export default function Timeline({
  project,
  selectedClip,
  currentTime,
  onSeek,
  onUpdateClipBounds,
}) {
  const trackRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(100);

  const totalDuration = project?.duration || 100;
  const clipStart = selectedClip?.start_time ?? 0;
  const clipEnd = selectedClip?.end_time ?? Math.min(totalDuration, 30);

  const formatMinSec = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTrackClick = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = pct * totalDuration;
    onSeek(targetTime);
  };

  const handleStartTrim = (e) => {
    e.stopPropagation();
    const handleMove = (moveEvt) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      const newStart = Math.min(pct * totalDuration, clipEnd - 2.0);
      onUpdateClipBounds(roundSec(newStart), clipEnd);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleEndTrim = (e) => {
    e.stopPropagation();
    const handleMove = (moveEvt) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      const newEnd = Math.max(pct * totalDuration, clipStart + 2.0);
      onUpdateClipBounds(clipStart, roundSec(newEnd));
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const roundSec = (val) => Math.round(val * 10) / 10;

  // Percentage calculations
  const startPct = (clipStart / totalDuration) * 100;
  const endPct = (clipEnd / totalDuration) * 100;
  const widthPct = Math.max(1, endPct - startPct);
  const playheadPct = (currentTime / totalDuration) * 100;

  return (
    <div className="w-full bg-dark-900 border-t border-dark-700/80 px-4 py-2.5 select-none overflow-hidden shrink-0">
      {/* Top Scene Pill (e.g. Scene #1: 05:52 - 06:37) */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-lime-neon text-black font-extrabold text-[11px] px-3 py-0.5 rounded-full flex items-center gap-1.5 shadow-neon-sm">
            <span>Scene #{selectedClip?.id ? selectedClip.id.slice(-2) : '1'}</span>
            <span className="font-mono font-medium text-dark-950">
              {formatMinSec(clipStart)} – {formatMinSec(clipEnd)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatMinSec(currentTime)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-[11px]">Timeline Zoom</span>
            <input
              type="range"
              min="100"
              max="250"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-20 accent-lime-neon cursor-pointer"
            />
            <span className="text-[10px] font-mono text-lime-neon w-8">{zoomLevel}%</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Timeline Track (Contained in scrollable viewport to prevent overflowing) */}
      <div className="w-full overflow-x-auto overflow-y-hidden rounded-xl border border-dark-700 bg-dark-950 scrollbar-thin">
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="relative h-12 cursor-pointer select-none"
          style={{ width: `${Math.max(100, zoomLevel)}%`, minWidth: '100%' }}
        >
          {/* Background ticks */}
          <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
            {[...Array(30)].map((_, i) => (
              <div key={i} className="h-full w-px bg-slate-400"></div>
            ))}
          </div>

          {/* Selected Clip Highlight Range (Lime Box) */}
          <div
            className="absolute top-1 bottom-1 bg-lime-neon/25 border-2 border-lime-neon rounded-lg flex items-center justify-between z-10 transition-all duration-75"
            style={{
              left: `${startPct}%`,
              width: `${widthPct}%`,
            }}
          >
            {/* Start Handle */}
            <div
              onMouseDown={handleStartTrim}
              className="w-3.5 h-full bg-lime-neon rounded-l cursor-ew-resize flex items-center justify-center hover:brightness-110 active:scale-105"
              title="Drag to adjust start time"
            >
              <div className="w-0.5 h-4 bg-black rounded-full"></div>
            </div>

            {/* Scene Label inside the timeline */}
            <span className="text-[10px] font-bold text-lime-neon drop-shadow truncate px-2 pointer-events-none">
              {selectedClip?.title || 'Clip Highlight'}
            </span>

            {/* End Handle */}
            <div
              onMouseDown={handleEndTrim}
              className="w-3.5 h-full bg-lime-neon rounded-r cursor-ew-resize flex items-center justify-center hover:brightness-110 active:scale-105"
              title="Drag to adjust end time"
            >
              <div className="w-0.5 h-4 bg-black rounded-full"></div>
            </div>
          </div>

          {/* Keyframe Markers track (dots matching the screenshot) */}
          <div className="absolute bottom-1 left-0 right-0 flex items-center pointer-events-none z-10 px-4">
            <div
              className="w-2 h-2 rounded-full bg-lime-neon border border-black shadow"
              style={{ marginLeft: `${startPct}%` }}
            ></div>
            <div
              className="w-2 h-2 rounded-full bg-lime-neon border border-black shadow"
              style={{ marginLeft: `${widthPct * 0.5}%` }}
            ></div>
          </div>

          {/* Playhead Scrubber */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none shadow"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full -ml-1 -mt-0.5 shadow-md"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

