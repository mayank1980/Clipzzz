import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  Check,
  Video,
  ShieldCheck,
  RefreshCw,
  Sliders,
  RotateCcw,
  MoveHorizontal,
  MoveVertical,
  ZoomIn,
} from 'lucide-react';

export default function CropInspector({
  isOpen,
  onClose,
  cropSettings,
  onChangeCrop,
  selectedClip,
  currentTime,
  videoSrc,
  onAutoTrack,
}) {
  if (!isOpen) return null;

  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [autoTrackSuccess, setAutoTrackSuccess] = useState(false);
  const previewVideoRef = useRef(null);

  // Keep preview video frame locked to the exact speech time in clip
  useEffect(() => {
    if (previewVideoRef.current && typeof currentTime === 'number' && !isNaN(currentTime)) {
      if (Math.abs(previewVideoRef.current.currentTime - currentTime) > 0.4) {
        previewVideoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime]);

  const handlePreviewLoaded = () => {
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = currentTime || selectedClip?.start_time || 0;
    }
  };

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const modeVal = cropSettings?.mode ?? 'custom_crop';
  const keyframeCount = Array.isArray(cropSettings?.keyframes) ? cropSettings.keyframes.length : 1;
  const xVal = typeof cropSettings?.x === 'number' ? cropSettings.x : 50;
  const yVal = typeof cropSettings?.y === 'number' ? cropSettings.y : 45;
  const zoomVal = typeof cropSettings?.zoom === 'number' ? cropSettings.zoom : 1.0;

  const handleRunAutoTrack = async () => {
    if (!onAutoTrack) return;
    setIsAutoTracking(true);
    setAutoTrackSuccess(false);
    try {
      await onAutoTrack();
      setAutoTrackSuccess(true);
      setTimeout(() => setAutoTrackSuccess(false), 3000);
    } catch (err) {
      console.error('Auto-track error:', err);
    } finally {
      setIsAutoTracking(false);
    }
  };

  return (
    <div className="w-[320px] max-w-[92vw] flex flex-col bg-dark-900/98 border border-dark-700 rounded-2xl shadow-2xl text-xs select-none backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto scrollbar-thin">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between p-3 bg-dark-950/90 border-b border-dark-800 shrink-0 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse" />
          <div>
            <div className="text-[11px] uppercase font-extrabold tracking-wider text-white flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-lime-neon fill-lime-neon" />
              AI Speaker Tracking
            </div>
            <div className="text-[10px] text-lime-neon font-semibold flex items-center gap-1">
              <span>Automated Multi-Speaker Focus</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 bg-dark-800 hover:bg-red-500/20 text-slate-200 hover:text-red-400 border border-dark-700 hover:border-red-500/50 px-2 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer"
          title="Close (ESC)"
        >
          <X className="w-3.5 h-3.5" />
          <span>Close</span>
        </button>
      </div>

      {/* 2. BODY */}
      <div className="p-3.5 space-y-3.5">
        {/* AI AUTO TRACKING STATUS CARD */}
        <div className="bg-lime-neon/10 border border-lime-neon/40 rounded-xl p-3 shadow-neon-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-extrabold text-[11px] text-lime-neon uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-lime-neon" />
              100% AI Auto-Framing
            </span>
            <span className="text-[10px] font-mono font-bold bg-lime-neon/20 text-lime-neon px-2 py-0.5 rounded-full border border-lime-neon/30">
              {keyframeCount} Focal Shifts
            </span>
          </div>

          <p className="text-[10px] text-slate-300 leading-relaxed mb-3">
            The AI monitors face positioning and shifts camera focus onto whoever is talking in the podcast or interview automatically. Zero manual keyframing required.
          </p>

          <button
            type="button"
            onClick={handleRunAutoTrack}
            disabled={isAutoTracking}
            className="w-full py-2 px-3 bg-lime-neon hover:bg-lime-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-neon-sm cursor-pointer disabled:opacity-50"
          >
            {isAutoTracking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : autoTrackSuccess ? (
              <Check className="w-4 h-4 text-black stroke-[3]" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>
              {isAutoTracking
                ? 'Scanning video faces...'
                : autoTrackSuccess
                ? '✓ AI Speakers Re-Tracked!'
                : 'Re-Analyze Speakers (AI)'}
            </span>
          </button>
        </div>

        {/* COMPACT VISUAL PREVIEW OF CURRENT AI FOCAL BOX */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
            <span>AI Framing Preview</span>
            <span className="text-lime-neon text-[9px] font-mono">Dynamic 9:16</span>
          </div>

          <div className="relative w-full h-28 bg-black rounded-xl overflow-hidden border border-dark-700 flex items-center justify-center shadow-inner">
            {videoSrc && (
              <video
                ref={previewVideoRef}
                src={videoSrc}
                onLoadedMetadata={handlePreviewLoaded}
                className="w-full h-full object-cover opacity-80 pointer-events-none"
                muted
                playsInline
                tabIndex={-1}
              />
            )}

            {/* AI 9:16 Focus Box - Dynamic based on X, Y, and Zoom */}
            <div
              className="absolute border-2 border-lime-neon rounded-lg shadow-neon pointer-events-none flex items-center justify-center"
              style={{
                width: `${(100 / zoomVal) * (9 / 16)}%`,
                height: `${100 / zoomVal}%`,
                left: `${Math.max(0, Math.min(100 - (100 / zoomVal) * (9 / 16), xVal - ((100 / zoomVal) * (9 / 16)) / 2))}%`,
                top: `${Math.max(0, Math.min(100 - 100 / zoomVal, yVal - (100 / zoomVal) / 2))}%`,
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-lime-neon border border-black shadow flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-black" />
              </div>
            </div>

            {/* Speaker Alignment Markers */}
            <div className="absolute inset-0 pointer-events-none flex justify-between px-[25%] opacity-20">
              <div className="w-px h-full bg-white border-dashed border-l" />
              <div className="w-px h-full bg-white border-dashed border-l" />
            </div>
          </div>
        </div>

        {/* MANUAL FRAMING SLIDERS & PROGRESS CONTROLS (X, Y, ZOOM) */}
        <div className="space-y-2.5 pt-2 border-t border-dark-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-lime-neon" />
              Manual Framing Controls
            </span>
            <button
              type="button"
              onClick={() => onChangeCrop({ x: 50, y: 45, zoom: 1.0, mode: 'custom_crop' })}
              className="text-[10px] font-bold text-lime-neon hover:underline cursor-pointer flex items-center gap-1"
              title="Reset coordinates to standard center"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Center
            </button>
          </div>

          {/* Horizontal Position (X) */}
          <div className="space-y-1 bg-dark-950/80 p-2.5 rounded-xl border border-dark-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <MoveHorizontal className="w-3.5 h-3.5 text-lime-neon" />
                Horizontal Pan (X)
              </span>
              <span className="font-mono font-bold text-lime-neon bg-lime-neon/10 px-1.5 py-0.5 rounded border border-lime-neon/20">
                {Math.round(xVal)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={xVal}
              onChange={(e) => onChangeCrop({ x: parseFloat(e.target.value), mode: 'custom_crop' })}
              className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-lime-neon"
            />
            <div className="flex justify-between text-[8px] text-slate-500 font-mono">
              <span>0% Left</span>
              <span>50% Center</span>
              <span>100% Right</span>
            </div>
          </div>

          {/* Vertical Position (Y) */}
          <div className="space-y-1 bg-dark-950/80 p-2.5 rounded-xl border border-dark-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <MoveVertical className="w-3.5 h-3.5 text-lime-neon" />
                Vertical Tilt (Y)
              </span>
              <span className="font-mono font-bold text-lime-neon bg-lime-neon/10 px-1.5 py-0.5 rounded border border-lime-neon/20">
                {Math.round(yVal)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={yVal}
              onChange={(e) => onChangeCrop({ y: parseFloat(e.target.value), mode: 'custom_crop' })}
              className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-lime-neon"
            />
            <div className="flex justify-between text-[8px] text-slate-500 font-mono">
              <span>0% Top</span>
              <span>45% Face Level</span>
              <span>100% Bottom</span>
            </div>
          </div>

          {/* Zoom / Focal Scale */}
          <div className="space-y-1 bg-dark-950/80 p-2.5 rounded-xl border border-dark-800">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-300 font-semibold flex items-center gap-1">
                <ZoomIn className="w-3.5 h-3.5 text-lime-neon" />
                Zoom / Framing Size
              </span>
              <span className="font-mono font-bold text-lime-neon bg-lime-neon/10 px-1.5 py-0.5 rounded border border-lime-neon/20">
                {Number(zoomVal).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="2.5"
              step="0.05"
              value={zoomVal}
              onChange={(e) => onChangeCrop({ zoom: parseFloat(e.target.value), mode: 'custom_crop' })}
              className="w-full h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer accent-lime-neon"
            />
            <div className="flex justify-between text-[8px] text-slate-500 font-mono">
              <span>1.0x Full</span>
              <span>1.5x Close</span>
              <span>2.5x Tight</span>
            </div>
          </div>
        </div>

        {/* FRAMING MODE TOGGLE */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Framing Style
          </div>
          <div className="grid grid-cols-2 p-1 bg-dark-950 rounded-xl border border-dark-800">
            <button
              type="button"
              onClick={() => onChangeCrop({ mode: 'custom_crop' })}
              className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                modeVal === 'custom_crop'
                  ? 'bg-lime-neon text-black shadow-neon-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart AI Crop</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeCrop({ mode: 'blur_fill' })}
              className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                modeVal === 'blur_fill'
                  ? 'bg-lime-neon text-black shadow-neon-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Blurred BG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
