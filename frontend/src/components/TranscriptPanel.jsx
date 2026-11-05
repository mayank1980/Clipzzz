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

  // Filter segments
  const displayedSegments = (transcript || []).filter((seg) => {
    if (!filterClipOnly || !selectedClip) return true;
    return seg.end >= selectedClip.start_time - 0.5 && seg.start <= selectedClip.end_time + 0.5;
  });

  return (
    <div className="flex-1 bg-dark-900 flex flex-col min-h-0 select-none overflow-hidden">
      {/* Action Header */}
      <div className="p-3 border-b border-dark-700/80 flex items-center justify-between gap-2 bg-dark-950/40 shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-bold text-xs text-white">Clip Transcript</h3>
          <button
            onClick={() => setFilterClipOnly(!filterClipOnly)}
            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border transition ${
              filterClipOnly
                ? 'bg-lime-neon/15 text-lime-neon border-lime-neon/40'
                : 'bg-dark-800 text-slate-400 border-dark-700'
            }`}
            title="Toggle between clip dialogue only or full video dialogue"
          >
            {filterClipOnly ? 'Clip Dialogue' : 'Full Video'}
          </button>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          <button
            onClick={() => onSeek(selectedClip?.start_time || 0)}
            className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-dark-800 transition flex items-center gap-1 cursor-pointer"
            title="Reset to Clip Start"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {/* Current time pill */}
          <div className="bg-lime-neon text-black font-mono font-extrabold px-2 py-0.5 rounded-full shadow-neon-sm">
            {formatDetailedTime(currentTime)}
          </div>
        </div>
      </div>

      {/* Editing Hint Bar */}
      <div className="px-3 py-1 bg-dark-950/60 border-b border-dark-800/80 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
        <span className="flex items-center gap-1">
          <Pencil className="w-2.5 h-2.5 text-lime-neon" />
          Click to seek • ⚡ change speed per caption block
        </span>
      </div>

      {/* Detailed Timestamped dialogue list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-sans text-xs scrollbar-thin">
        {(!displayedSegments || displayedSegments.length === 0) && (
          <div className="text-center py-8 text-slate-500">
            No dialogue transcript segments found for this range.
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
              title="Click to seek & play | Double-click to edit spelling"
              className={`p-2.5 rounded-xl cursor-pointer transition border relative group ${
                isSegActive
                  ? 'bg-dark-800 border-lime-neon/60 shadow-neon-sm ring-1 ring-lime-neon/30'
                  : isInsideClip
                  ? 'bg-dark-950/70 border-dark-800 hover:bg-dark-850 hover:border-dark-700'
                  : 'opacity-40 hover:opacity-80 border-transparent bg-dark-950/30'
              }`}
            >
              {/* Detailed Timestamp header & Individual Block Speed */}
              <div className="flex items-center justify-between mb-1 text-[10px]">
                <span
                  className={`font-mono font-bold ${
                    isSegActive ? 'text-lime-neon' : 'text-slate-400'
                  }`}
                >
                  {formatDetailedTime(seg.start)} – {formatDetailedTime(seg.end)}
                </span>
                
                <div className="flex items-center gap-1.5">
                  {/* Individual Caption Speed Selector */}
                  <div
                    className="flex items-center bg-dark-900/90 rounded border border-dark-800 p-0.5 text-[8px] font-mono"
                    onClick={(e) => e.stopPropagation()}
                    title="Change playback speed for this caption block"
                  >
                    <span className="text-lime-neon px-0.5">⚡</span>
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
                          className={`px-1 py-0.2 rounded font-bold transition cursor-pointer ${
                            isCur
                              ? 'bg-lime-neon text-black font-extrabold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      );
                    })}
                  </div>

                  {seg.words?.some((w) => w.needs_review) && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30" title="Contains words flagged for review">
                      Review
                    </span>
                  )}
                  <span className="text-slate-500 font-mono text-[9px] bg-dark-900 px-1.5 py-0.5 rounded border border-dark-800">
                    {dur}s
                  </span>
                  {/* Subtle Edit Pencil Icon */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSegment?.(seg);
                    }}
                    className="p-1 text-slate-400 hover:text-lime-neon hover:bg-dark-800 rounded opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    title="Edit caption spelling"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Spoken words with live karaoke word-level highlighting */}
              <p className="text-slate-200 leading-relaxed text-xs">
                {seg.words && seg.words.length > 0 ? (
                  seg.words.map((w, wIdx) => {
                    const isWordActive =
                      currentTime >= w.start && currentTime <= w.end;
                    const needsReview = Boolean(w.needs_review);
                    return (
                      <span
                        key={wIdx}
                        ref={isWordActive ? activeWordRef : null}
                        title={needsReview ? `Confidence: ${Math.round((w.confidence || 0.75) * 100)}% (Double-click to edit)` : undefined}
                        className={`inline-block mr-1 rounded px-0.5 transition-all duration-75 ${
                          isWordActive
                            ? 'bg-lime-neon text-black font-extrabold shadow-sm scale-105'
                            : needsReview
                            ? 'border-b-2 border-amber-400/80 text-amber-200'
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
