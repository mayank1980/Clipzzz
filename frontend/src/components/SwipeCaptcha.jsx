import React, { useState, useRef, useEffect } from 'react';
import { ChevronsRight, CheckCircle2, ShieldCheck, Lock } from 'lucide-react';

export default function SwipeCaptcha({ onVerified, isVerified, disabled = false, disabledMessage = 'Fill all fields above to unlock' }) {
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef(null);

  const handleStart = (clientX) => {
    if (isVerified || disabled) return;
    setIsDragging(true);
  };

  const handleMove = (clientX) => {
    if (!isDragging || isVerified || disabled || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const trackWidth = rect.width - 44;
    const offsetX = Math.max(0, Math.min(trackWidth, clientX - rect.left - 22));
    const pct = offsetX / trackWidth;
    setSliderPosition(offsetX);

    if (pct >= 0.95) {
      setIsDragging(false);
      setSliderPosition(trackWidth);
      onVerified();
    }
  };

  const handleEnd = () => {
    if (isVerified || disabled) return;
    setIsDragging(false);
    setSliderPosition(0);
  };

  useEffect(() => {
    const onMouseMove = (e) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();
    const onTouchMove = (e) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, isVerified, disabled]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5 text-[11px] text-slate-gray">
        <span className="flex items-center gap-1.5 font-medium">
          {disabled ? (
            <Lock className="w-3.5 h-3.5 text-slate-gray" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-signal-orange" />
          )}
          Verification Gate
        </span>
        <span className={isVerified ? 'text-ink-black font-bold' : disabled ? 'text-clay-brown' : 'text-slate-gray'}>
          {isVerified ? 'Verified Human ✓' : disabled ? disabledMessage : 'Slide to verify'}
        </span>
      </div>

      <div
        ref={trackRef}
        className={`relative h-12 rounded-full flex items-center p-1 overflow-hidden select-none transition-all border ${
          isVerified
            ? 'bg-lifted-cream border-signal-orange'
            : disabled
            ? 'bg-canvas-cream border-border-cream opacity-60 cursor-not-allowed'
            : 'bg-canvas-cream border-border-cream shadow-inner'
        }`}
      >
        {/* Track Progress Fill */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-light-orange/20 transition-all pointer-events-none rounded-full"
          style={{ width: isVerified ? '100%' : `${sliderPosition + 44}px` }}
        />

        {/* Track Prompt Text */}
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tracking-wider uppercase text-slate-gray pointer-events-none">
          {isVerified ? (
            <span className="text-ink-black flex items-center gap-1.5 font-extrabold">
              <CheckCircle2 className="w-4 h-4 text-signal-orange" /> Verification Complete
            </span>
          ) : disabled ? (
            <span className="text-slate-gray text-[10px] flex items-center gap-1">
              <Lock className="w-3 h-3" /> {disabledMessage}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-charcoal">
              <span>Slide right to continue</span>
              <ChevronsRight className="w-3.5 h-3.5 text-signal-orange animate-pulse" />
            </span>
          )}
        </div>

        {/* Draggable Circle Knob */}
        {!isVerified && (
          <div
            onMouseDown={(e) => handleStart(e.clientX)}
            onTouchStart={(e) => e.touches[0] && handleStart(e.touches[0].clientX)}
            style={{
              transform: `translateX(${sliderPosition}px)`,
              transition: isDragging ? 'none' : 'transform 0.25s ease-out',
            }}
            className={`w-10 h-10 rounded-full bg-white text-ink-black border border-border-cream shadow-satellite flex items-center justify-center z-10 ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing hover:scale-105'
            }`}
          >
            <ChevronsRight className="w-4 h-4 text-signal-orange stroke-[2.5]" />
          </div>
        )}
      </div>
    </div>
  );
}
