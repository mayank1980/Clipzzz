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
      <div className="flex items-center justify-between mb-1.5 text-[11px] text-slate-400">
        <span className="flex items-center gap-1 font-medium">
          {disabled ? (
            <Lock className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-lime-neon" />
          )}
          Bot Protection
        </span>
        <span className={isVerified ? 'text-lime-neon font-bold' : disabled ? 'text-amber-400/80' : 'text-slate-400'}>
          {isVerified ? 'Verified Human ✓' : disabled ? disabledMessage : 'Slide to verify'}
        </span>
      </div>

      <div
        ref={trackRef}
        className={`relative h-11 rounded-xl flex items-center p-1 overflow-hidden select-none transition-all border ${
          isVerified
            ? 'bg-lime-950/40 border-lime-neon/50'
            : disabled
            ? 'bg-dark-950/60 border-dark-800 opacity-60 cursor-not-allowed'
            : 'bg-dark-950 border-dark-700 shadow-inner'
        }`}
      >
        {/* Track Progress Fill */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-lime-neon/20 transition-all pointer-events-none"
          style={{ width: isVerified ? '100%' : `${sliderPosition + 44}px` }}
        />

        {/* Track Prompt Text */}
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-wider uppercase text-slate-400 pointer-events-none">
          {isVerified ? (
            <span className="text-lime-neon flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4" /> Verification Passed
            </span>
          ) : disabled ? (
            <span className="text-slate-500 text-[10px] flex items-center gap-1">
              <Lock className="w-3 h-3" /> {disabledMessage}
            </span>
          ) : (
            <span className="text-slate-300 animate-pulse">Slide puzzle to verify →</span>
          )}
        </div>

        {/* Draggable Slider Handle */}
        {!isVerified ? (
          <div
            onMouseDown={(e) => handleStart(e.clientX)}
            onTouchStart={(e) => e.touches[0] && handleStart(e.touches[0].clientX)}
            style={{ transform: `translateX(${sliderPosition}px)` }}
            className={`w-10 h-9 rounded-lg flex items-center justify-center z-10 transition-transform duration-75 ${
              disabled
                ? 'bg-dark-800 text-slate-600 cursor-not-allowed'
                : 'bg-lime-neon hover:bg-lime-400 text-black cursor-grab active:cursor-grabbing shadow-neon-sm'
            }`}
          >
            {disabled ? (
              <Lock className="w-4 h-4" />
            ) : (
              <ChevronsRight className="w-5 h-5 stroke-[2.5]" />
            )}
          </div>
        ) : (
          <div className="absolute right-2 text-lime-neon">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
