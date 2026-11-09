import React, { useRef, useEffect, useState } from 'react';
import { RotateCcw, Clock, Filter, Sparkles, Pencil, Zap } from 'lucide-react';

export default function TranscriptPanel({
  transcript,
  currentTime,
  onSeek,
  selectedClip,
  highlightColor,
  onEditSegment,
  onUpdateSegment,
}) {
  const activeWordRef = useRef(null);
  const [filterClipOnly, setFilterClipOnly] = useState(true);

  const formatDetailedTime = (sec) => {
    const s = Math.max(0, sec || 0);
    const m = Math.floor(s / 60);
    const secPart = (s % 60).toFixed(1);
    const secStr = secPart < 10 ? `0${secPart}` : secPart;
    return `${m < 10 ? '0' : ''}${m}:${secStr}`;
  };

  // Scroll active segment into view gently
  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [Math.floor(currentTime * 2)]);

  const displayedSegments = (transcript || []).filter((seg) => {
    if (!filterClipOnly || !selectedClip) return true;
    return seg.end >= selectedClip.start_time - 0.5 && seg.start <= selectedClip.end_time + 0.5;
  });

  return (
    <div className="flex-1 bg-lifted-cream flex flex-col min-h-0 select-none overflow-hidden">
      {/* Action Header */}
      <div className="p-3.5 border-b border-border-cream flex items-center justify-between gap-2 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
          <h3 className="font-bold text-xs text-ink-black tracking-tight">Clip Transcript</h3>
          <button
            onClick={() => setFilterClipOnly(!filterClipOnly)}
            className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition cursor-pointer ${
              filterClipOnly
                ? 'bg-canvas-cream text-ink-black border-border-cream shadow-sm'
                : 'bg-white text-slate-gray border-border-cream'
            }`}
            title="Toggle between clip dialogue only or full video dialogue"
          >
            {filterClipOnly ? 'Clip Dialogue' : 'Full Video'}
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <button
            onClick={() => onSeek(selectedClip?.start_time || 0)}
            className="text-slate-gray hover:text-ink-black px-2 py-1 rounded-full hover:bg-canvas-cream transition flex items-center gap-1 cursor-pointer"
            title="Reset to Clip Start"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Current time pill */}
          <div className="bg-ink-black text-white font-mono font-bold px-2.5 py-0.5 rounded-full shadow-sm">
            {formatDetailedTime(currentTime)}
          </div>
        </div>
      </div>

      {/* Editing Hint Bar */}
      <div className="px-3.5 py-1 bg-canvas-cream border-b border-border-cream flex items-center justify-between text-[10px] text-slate-gray shrink-0">
        <span className="flex items-center gap-1.5">
          <Pencil className="w-2.5 h-2.5 text-signal-orange" />
          Click to seek • ⚡ speed per dialogue segment
        </span>
      </div>

      {/* Timestamped dialogue list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-sans text-xs">
        {(!displayedSegments || displayedSegments.length === 0) && (
          <div className="text-center py-8 text-slate-gray">
            No dialogue segments found for this range.
          </div>
        )}

        {displayedSegments.map((seg) => {
          const isSegActive = currentTime >= (seg.start - 0.2) && currentTime <= (seg.end + 0.5);
          const isInsideClip =
            selectedClip &&
            seg.end >= selectedClip.start_time &&
            seg.start <= selectedClip.end_time;
          const dur = (seg.end - seg.start).toFixed(1);
          const segSpeed = seg.speed || 1.0;

          return (
            <div
              key={seg.id}
              onClick={() => onSeek(seg.start, segSpeed)}
              onDoubleClick={() => onEditSegment?.(seg)}
              title="Click to seek | Double-click to edit"
              className={`p-3 rounded-[18px] cursor-pointer transition border relative group shadow-sm ${
                isSegActive
                  ? 'bg-white border-signal-orange ring-1 ring-signal-orange'
                  : isInsideClip
                  ? 'bg-white border-border-cream hover:bg-canvas-cream/50'
                  : 'opacity-40 hover:opacity-80 border-transparent bg-canvas-cream'
              }`}
            >
              {/* Timestamp header & speed control */}
              <div className="flex items-center justify-between mb-1.5 text-[10px]">
                <span
                  className={`font-mono font-bold ${
                    isSegActive ? 'text-signal-orange' : 'text-slate-gray'
                  }`}
                >
                  {formatDetailedTime(seg.start)} – {formatDetailedTime(seg.end)}
                </span>
                
                <div className="flex items-center gap-1.5">
                  <div
                    className="flex items-center bg-canvas-cream rounded-full border border-border-cream p-0.5 text-[8px] font-mono"
                    onClick={(e) => e.stopPropagation()}
                    title="Change playback speed for this block"
                  >
                    <span className="text-signal-orange px-0.5">⚡</span>
                    {[0.1, 0.5, 1.0, 1.5, 2.0].map((spd) => {
                      const isCur = Math.abs(segSpeed - spd) < 0.05;
                      return (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => {
                            onUpdateSegment?.({ ...seg, speed: spd });
                            onSeek?.(seg.start, spd);
                          }}
                          className={`px-1.5 py-0.2 rounded-full font-bold transition cursor-pointer ${
                            isCur
                              ? 'bg-ink-black text-white font-extrabold'
                              : 'text-slate-gray hover:text-ink-black'
                          }`}
                        >
                          {spd}x
                        </button>
                      );
                    })}
                  </div>

                  <span className="text-slate-gray font-mono text-[9px] bg-canvas-cream px-2 py-0.5 rounded-full border border-border-cream">
                    {dur}s
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSegment?.(seg);
                    }}
                    className="p-1 text-slate-gray hover:text-signal-orange hover:bg-canvas-cream rounded-full opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Edit caption"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Spoken words */}
              <p className="text-ink-black leading-relaxed text-xs font-medium">
                {seg.words && seg.words.length > 0 ? (
                  seg.words.map((w, wIdx) => {
                    const isWordActive =
                      currentTime >= w.start && currentTime <= w.end;
                    const needsReview = Boolean(w.needs_review);
                    return (
                      <span
                        key={wIdx}
                        ref={isWordActive ? activeWordRef : null}
                        className={`inline-block mr-1 rounded px-0.5 transition-all duration-75 ${
                          isWordActive
                            ? 'bg-signal-orange text-white font-extrabold shadow-sm scale-105'
                            : needsReview
                            ? 'border-b-2 border-signal-orange text-charcoal'
                            : ''
                        }`}
                      >
                        {w.word}
                      </span>
                    );
                  })
                ) : (
                  <span>{seg.text}</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
