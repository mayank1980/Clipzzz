import React, { useState, useMemo } from 'react';
import { Flame, Clock, Sparkles, Check, Trash2, Plus, ArrowUpDown, ArrowRight, Scissors } from 'lucide-react';

export default function ClipsList({
  clips,
  selectedClip,
  onSelectClip,
  onRenderClip,
  onOpenStudio,
  onDeleteClip,
  onDeleteProject,
  onCreateNew,
}) {
  const [sortBy, setSortBy] = useState('score');

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const sortedClips = useMemo(() => {
    if (!clips) return [];
    const list = [...clips];
    if (sortBy === 'timeline') {
      return list.sort((a, b) => a.start_time - b.start_time);
    }
    return list.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start_time - b.start_time);
  }, [clips, sortBy]);

  if (!clips || clips.length === 0) {
    return (
      <div className="w-72 lg:w-80 shrink-0 bg-lifted-cream border-r border-border-cream p-4 text-xs text-slate-gray select-none flex flex-col justify-between">
        <div>No clips generated yet.</div>
        {onDeleteProject && (
          <button
            onClick={onDeleteProject}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-canvas-cream text-clay-brown border border-border-cream rounded-full transition font-semibold text-xs cursor-pointer shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Project
          </button>
        )}
      </div>
    );
  }

  const renderClipCard = (clip) => {
    const isSelected = selectedClip?.id === clip.id;
    const isRendered = clip.render_status === 'completed';

    return (
      <div
        key={clip.id}
        onClick={() => onSelectClip(clip)}
        className={`w-full rounded-[20px] p-3.5 cursor-pointer transition border relative shadow-sm ${
          isSelected
            ? 'bg-white border-signal-orange ring-1 ring-signal-orange'
            : 'bg-white hover:bg-canvas-cream border-border-cream'
        }`}
      >
        {/* Top Row: Score + Category + Ending Tag on Left, Duration + Delete on Right */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center flex-wrap gap-1.5 min-w-0">
            <span className="text-[10px] font-extrabold bg-canvas-cream text-ink-black border border-border-cream px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0">
              <Flame className="w-3 h-3 text-signal-orange fill-signal-orange" />
              {clip.score}/100
            </span>

            {clip.category && (
              <span className="text-[10px] bg-canvas-cream text-charcoal px-2 py-0.5 rounded-full border border-border-cream font-bold shrink-0">
                {clip.category}
              </span>
            )}

            {clip.ending_type && (
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-canvas-cream text-charcoal border border-border-cream shrink-0">
                {clip.ending_type}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <span className="text-[10px] text-slate-gray font-mono flex items-center gap-0.5 whitespace-nowrap">
              <Clock className="w-3 h-3 text-slate-gray" />
              {formatTime(clip.duration)}
            </span>
            {onDeleteClip && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClip(clip);
                }}
                className="p-1 rounded-full text-slate-gray hover:text-signal-orange hover:bg-canvas-cream transition cursor-pointer"
                title="Delete this clip"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Title & Hook */}
        {clip.hook_title && clip.hook_title !== clip.title && (
          <div className="text-[10px] font-extrabold text-signal-orange line-clamp-1 mb-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-orange shrink-0"></span>
            <span>{clip.hook_title}</span>
          </div>
        )}
        <h4 className="text-xs font-bold text-ink-black line-clamp-1 mb-1 tracking-tight" title={clip.title}>
          {clip.title}
        </h4>

        {/* Hook text */}
        <p className="text-[11px] text-slate-gray line-clamp-2 italic mb-2.5 leading-relaxed">
          "{clip.hook || clip.reason || 'High engagement moment'}"
        </p>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border-cream text-[10px]">
          <span className="text-slate-gray font-mono">
            {formatTime(clip.start_time)} – {formatTime(clip.end_time)}
          </span>
          <div className="flex items-center gap-2">
            {onOpenStudio && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip(clip);
                  onOpenStudio(clip);
                }}
                className="px-2 py-0.5 rounded-full bg-canvas-cream hover:bg-ink-black text-ink-black hover:text-white border border-border-cream font-bold cursor-pointer flex items-center gap-1 transition"
                title="Open CapCut-style Pro Studio Editor"
              >
                <Scissors className="w-2.5 h-2.5 text-signal-orange" />
                <span>Studio</span>
              </button>
            )}
            {isRendered ? (
              <span className="text-ink-black font-bold flex items-center gap-1">
                <Check className="w-3 h-3 text-signal-orange stroke-[2.5]" /> Ready
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip(clip);
                  onRenderClip(clip);
                }}
                className="text-ink-black hover:text-signal-orange font-bold cursor-pointer flex items-center gap-1"
              >
                <span>Render Short</span>
                <ArrowRight className="w-3 h-3 text-signal-orange" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 xl:w-[340px] shrink-0 bg-lifted-cream border-r border-border-cream flex flex-col min-h-0 select-none">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-border-cream bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-ink-black uppercase tracking-wider truncate">
                Viral Shorts ({clips.length})
              </h3>
              <p className="text-[10px] text-slate-gray truncate">
                {sortBy === 'score' ? 'Ranked by Virality' : 'Sequential Timeline'}
              </p>
            </div>
          </div>
        </div>

        {/* Sort Switcher */}
        <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-border-cream text-[10px]">
          <span className="text-slate-gray font-semibold flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-slate-gray" />
            Sort:
          </span>
          <div className="flex p-0.5 bg-canvas-cream rounded-full border border-border-cream">
            <button
              type="button"
              onClick={() => setSortBy('score')}
              className={`px-2.5 py-0.5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer ${
                sortBy === 'score'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
            >
              <Flame className="w-2.5 h-2.5 text-signal-orange" />
              Score
            </button>
            <button
              type="button"
              onClick={() => setSortBy('timeline')}
              className={`px-2.5 py-0.5 rounded-full font-bold transition flex items-center gap-1 cursor-pointer ${
                sortBy === 'timeline'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
            >
              <Clock className="w-2.5 h-2.5 text-signal-orange" />
              Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Clips Scrollable List */}
      <div className="flex-1 overflow-y-auto pl-3 pr-1.5 py-3 space-y-3">
        {sortedClips.map((clip) => renderClipCard(clip))}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-border-cream bg-white flex items-center gap-2 shrink-0">
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-canvas-cream hover:bg-lifted-cream text-ink-black border border-border-cream rounded-full transition text-[11px] font-bold cursor-pointer shadow-sm"
            title="Create a new project"
          >
            <Plus className="w-3.5 h-3.5 text-signal-orange stroke-[2.5]" />
            New Video
          </button>
        )}
        {onDeleteProject && (
          <button
            onClick={onDeleteProject}
            className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-canvas-cream text-clay-brown border border-border-cream rounded-full transition text-[11px] font-bold cursor-pointer shadow-sm"
            title="Delete this project"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
