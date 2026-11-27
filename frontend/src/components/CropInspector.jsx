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
  onOpenStudioEditor,
}) {
  if (!isOpen) return null;

  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [autoTrackSuccess, setAutoTrackSuccess] = useState(false);
  const previewVideoRef = useRef(null);

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
  const zoomVal = typeof cropSettings?.zoom === 'number' ? cropSettings.zoom : 1.15;
  const clipRelTime = Math.max(0, (currentTime || 0) - (selectedClip?.start_time || 0));
  const previewBoxRef = useRef(null);

  const handleMiniBoxDrag = (e) => {
    e.preventDefault();
    const box = previewBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const updateFromEvt = (evt) => {
      const cx = evt.clientX ?? evt.touches?.[0]?.clientX;
      const cy = evt.clientY ?? evt.touches?.[0]?.clientY;
      if (cx === undefined || cy === undefined) return;
      const effZ = Math.max(1.08, zoomVal);
      const wPct = (100 / effZ) * (9 / 16) * (9 / 16);
      const hPct = 100 / effZ;
      const rawX = ((cx - rect.left) / rect.width) * 100;
      const rawY = ((cy - rect.top) / rect.height) * 100;
      const nextX = Math.max(0, Math.min(100, ((rawX - wPct / 2) / Math.max(1, 100 - wPct)) * 100));
      const nextY = Math.max(0, Math.min(100, ((rawY - hPct / 2) / Math.max(1, 100 - hPct)) * 100));
      onChangeCrop({
        x: Math.round(nextX),
        y: Math.round(nextY),
        zoom: zoomVal,
        mode: 'custom_crop',
        atTime: clipRelTime,
        updateSegmentOnly: true,
      });
    };
    updateFromEvt(e);
    const onUp = () => {
      window.removeEventListener('mousemove', updateFromEvt);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', updateFromEvt);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', updateFromEvt);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', updateFromEvt);
    window.addEventListener('touchend', onUp);
  };

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
    <div className="w-[320px] max-w-[92vw] flex flex-col bg-white border border-border-cream rounded-stadium shadow-card-elevated text-xs select-none backdrop-blur-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between p-3.5 bg-white border-b border-border-cream shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
          <div>
            <div className="text-[11px] uppercase font-extrabold tracking-wider text-ink-black flex items-center gap-1">
              AI Camera Framing
            </div>
            <div className="text-[10px] text-slate-gray font-semibold">
              Speaker Tracking View
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 bg-canvas-cream hover:bg-lifted-cream text-charcoal border border-border-cream px-2.5 py-1 rounded-full font-bold text-[10px] transition cursor-pointer"
          title="Close (ESC)"
        >
          <X className="w-3.5 h-3.5" />
          <span>Close</span>
        </button>
      </div>

      {/* 2. BODY */}
      <div className="p-4 space-y-3.5">
        {/* AI AUTO TRACKING STATUS CARD */}
        <div className="bg-lifted-cream border border-border-cream rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-extrabold text-[11px] text-ink-black uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-signal-orange" />
              AI Auto-Framing
            </span>
            <span className="text-[10px] font-mono font-bold bg-canvas-cream text-ink-black px-2 py-0.5 rounded-full border border-border-cream">
              {keyframeCount} Focal Shifts
            </span>
          </div>

          <p className="text-[10px] text-slate-gray leading-relaxed mb-3">
            Neural facial tracking detects active speakers and aligns camera cuts automatically.
          </p>

          <button
            type="button"
            onClick={handleRunAutoTrack}
            disabled={isAutoTracking}
            className="w-full py-2.5 px-3 bg-ink-black hover:bg-black text-white font-bold rounded-cta text-xs flex items-center justify-center gap-2 transition shadow-card-soft cursor-pointer disabled:opacity-50"
          >
            {isAutoTracking ? (
              <Loader2 className="w-4 h-4 animate-spin text-signal-orange" />
            ) : autoTrackSuccess ? (
              <Check className="w-4 h-4 text-signal-orange stroke-[3]" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>
              {isAutoTracking
                ? 'Scanning speakers...'
                : autoTrackSuccess
                ? '✓ Speakers Re-Tracked!'
                : 'Re-Analyze Speakers (AI)'}
            </span>
          </button>
        </div>

        {/* VISUAL PREVIEW OF CURRENT FOCAL BOX (Draggable in 2D!) */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-gray mb-1.5 flex items-center justify-between">
            <span>Framing Preview (Drag Box)</span>
            <span className="text-signal-orange text-[9px] font-mono font-bold">9:16 Crop</span>
          </div>

          <div
            ref={previewBoxRef}
            onMouseDown={handleMiniBoxDrag}
            onTouchStart={handleMiniBoxDrag}
            className="relative w-full h-28 bg-black rounded-2xl overflow-hidden border border-border-cream flex items-center justify-center shadow-inner cursor-move"
          >
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

            {/* AI 9:16 Focus Box */}
            <div
              className="absolute border-2 border-signal-orange bg-signal-orange/15 rounded-lg shadow-sm pointer-events-none flex items-center justify-center"
              style={{
                width: `${(100 / Math.max(1.08, zoomVal)) * (9 / 16)}%`,
                height: `${100 / Math.max(1.08, zoomVal)}%`,
                left: `${Math.max(0, Math.min(100 - (100 / Math.max(1.08, zoomVal)) * (9 / 16), ((100 - (100 / Math.max(1.08, zoomVal)) * (9 / 16)) * (xVal / 100))))}%`,
                top: `${Math.max(0, Math.min(100 - 100 / Math.max(1.08, zoomVal), ((100 - 100 / Math.max(1.08, zoomVal)) * (yVal / 100))))}%`,
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-signal-orange border border-white shadow flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-white" />
              </div>
            </div>
          </div>

          {onOpenStudioEditor && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                onOpenStudioEditor();
              }}
              className="w-full mt-2 py-2 px-3 bg-canvas-cream hover:bg-lifted-cream text-ink-black border border-border-cream rounded-full font-extrabold text-[10px] flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Video className="w-3.5 h-3.5 text-signal-orange" />
              <span>Open Pro Keyframe & Cut Studio</span>
            </button>
          )}
        </div>

        {/* MANUAL FRAMING CONTROLS */}
        <div className="space-y-2.5 pt-2 border-t border-border-cream">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-gray flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-signal-orange" />
              Manual Adjustment
            </span>
            <button
              type="button"
              onClick={() => onChangeCrop({ x: 50, y: 45, zoom: 1.0, mode: 'custom_crop' })}
              className="text-[10px] font-bold text-signal-orange hover:underline cursor-pointer flex items-center gap-1"
              title="Reset coordinates"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          {/* Horizontal Position (X) */}
          <div className="space-y-1 bg-canvas-cream p-2.5 rounded-2xl border border-border-cream">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-charcoal font-semibold flex items-center gap-1">
                <MoveHorizontal className="w-3.5 h-3.5 text-signal-orange" />
                Horizontal Pan (X)
              </span>
              <span className="font-mono font-bold text-ink-black bg-white px-2 py-0.5 rounded-full border border-border-cream">
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
              className="w-full cursor-pointer"
            />
          </div>

          {/* Vertical Position (Y) */}
          <div className="space-y-1 bg-canvas-cream p-2.5 rounded-2xl border border-border-cream">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-charcoal font-semibold flex items-center gap-1">
                <MoveVertical className="w-3.5 h-3.5 text-signal-orange" />
                Vertical Tilt (Y)
              </span>
              <span className="font-mono font-bold text-ink-black bg-white px-2 py-0.5 rounded-full border border-border-cream">
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
              className="w-full cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
