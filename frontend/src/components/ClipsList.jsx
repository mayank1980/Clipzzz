import React, { useState, useMemo, useEffect } from 'react';
import { Flame, Clock, Sparkles, Check, Trash2, Plus, BookOpen, Layers, ChevronDown, ChevronRight, Film, ArrowDownAZ, ArrowUpDown, ArrowRight } from 'lucide-react';

export default function ClipsList({
  clips,
  selectedClip,
  onSelectClip,
  onRenderClip,
  onDeleteClip,
  onDeleteProject,
  onCreateNew,
}) {
  const hasStories = useMemo(() => {
    return clips ? clips.some((c) => Boolean(c.story_id || c.parent_story_title || (c.part_number && c.total_parts > 1))) : false;
  }, [clips]);

  const [viewMode, setViewMode] = useState(hasStories ? 'stories' : 'all');
  const [sortBy, setSortBy] = useState('timeline');
  const [collapsedStories, setCollapsedStories] = useState({});

  useEffect(() => {
    if (hasStories) {
      setViewMode('stories');
      setSortBy('timeline');
    }
  }, [hasStories]);

  const toggleStoryCollapse = (storyKey) => {
    setCollapsedStories((prev) => ({
      ...prev,
      [storyKey]: !prev[storyKey],
    }));
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Group clips into stories and standalone
  const { storyGroups, standaloneClips } = useMemo(() => {
    if (!clips) return { storyGroups: [], standaloneClips: [] };

    const groupsMap = new Map();
    const standalone = [];

    clips.forEach((clip) => {
      const key = clip.story_id || clip.parent_story_title;
      if (key) {
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            key,
            title: clip.parent_story_title || `Story: ${clip.title}`,
            clips: [],
            totalDuration: 0,
            avgScore: 0,
          });
        }
        const group = groupsMap.get(key);
        group.clips.push(clip);
        group.totalDuration += clip.duration || 0;
      } else {
        standalone.push(clip);
      }
    });

    const groups = Array.from(groupsMap.values()).map((g) => {
      g.clips.sort((a, b) => (a.part_number || 1) - (b.part_number || 1) || a.start_time - b.start_time);
      const totalScore = g.clips.reduce((acc, c) => acc + (c.score || 85), 0);
      g.avgScore = Math.round(totalScore / Math.max(1, g.clips.length));
      return g;
    });

    groups.sort((a, b) => (a.clips[0]?.start_time || 0) - (b.clips[0]?.start_time || 0));

    return { storyGroups: groups, standaloneClips: standalone };
  }, [clips]);

  const sortedClips = useMemo(() => {
    if (!clips) return [];
    const list = [...clips];
    if (sortBy === 'timeline') {
      return list.sort((a, b) => a.start_time - b.start_time || (a.part_number || 1) - (b.part_number || 1));
    } else {
      return list.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start_time - b.start_time);
    }
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

  const renderClipCard = (clip, isChild = false) => {
    const isSelected = selectedClip?.id === clip.id;
    const isRendered = clip.render_status === 'completed';

    return (
      <div
        key={clip.id}
        onClick={() => onSelectClip(clip)}
        className={`w-full rounded-[20px] p-3.5 cursor-pointer transition border relative shadow-sm ${
          isSelected
            ? 'bg-white border-signal-orange ring-1 ring-signal-orange'
            : isChild
            ? 'bg-lifted-cream hover:bg-white border-border-cream'
            : 'bg-white hover:bg-canvas-cream border-border-cream'
        } ${isChild ? 'ml-2.5 w-[calc(100%-0.625rem)] border-l-2 border-l-signal-orange' : ''}`}
      >
        {/* Top Row: Score + Part + Duration */}
        <div className="flex items-center justify-between gap-1 mb-2">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-[10px] font-extrabold bg-canvas-cream text-ink-black border border-border-cream px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0">
              <Flame className="w-3 h-3 text-signal-orange fill-signal-orange" />
              {clip.score}/100
            </span>

            {clip.ending_type && (
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider bg-canvas-cream text-charcoal border border-border-cream shrink-0">
                {clip.ending_type}
              </span>
            )}
          </div>

          <span className="text-[10px] text-charcoal uppercase font-bold tracking-wider flex items-center gap-1 truncate">
            {clip.part_number && clip.total_parts ? (
              <span className="bg-canvas-cream text-ink-black px-2 py-0.5 rounded-full border border-border-cream font-mono font-bold">
                Part {clip.part_number}/{clip.total_parts}
              </span>
            ) : (
              clip.category || 'Short'
            )}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-slate-gray font-mono flex items-center gap-0.5">
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
    <div className="w-72 lg:w-80 shrink-0 bg-lifted-cream border-r border-border-cream flex flex-col min-h-0 select-none">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-border-cream bg-white space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-ink-black uppercase tracking-wider truncate">
                AI Shorts ({clips.length})
              </h3>
              <p className="text-[10px] text-slate-gray truncate">
                {viewMode === 'stories' && storyGroups.length > 0
                  ? `${storyGroups.length} Stories • ${clips.length} Parts`
                  : sortBy === 'timeline'
                  ? 'Sequential Timeline'
                  : 'Ranked by Virality'}
              </p>
            </div>
          </div>

          {/* View Toggle */}
          {(hasStories || storyGroups.length > 0) && (
            <div className="flex p-0.5 bg-canvas-cream rounded-full border border-border-cream text-[10px] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('stories')}
                className={`px-2.5 py-1 rounded-full font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'stories'
                    ? 'bg-white text-ink-black shadow-sm'
                    : 'text-slate-gray hover:text-ink-black'
                }`}
                title="Story Series View"
              >
                <BookOpen className="w-3 h-3 text-signal-orange" />
                Series
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-2.5 py-1 rounded-full font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-white text-ink-black shadow-sm'
                    : 'text-slate-gray hover:text-ink-black'
                }`}
                title="All individual clips"
              >
                <Layers className="w-3 h-3 text-signal-orange" />
                All
              </button>
            </div>
          )}
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
          </div>
        </div>
      </div>

      {/* Vertical Clips Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {viewMode === 'stories' && storyGroups.length > 0 ? (
          <>
            {storyGroups.map((group) => {
              const isCollapsed = Boolean(collapsedStories[group.key]);
              const containsSelected = group.clips.some((c) => c.id === selectedClip?.id);

              return (
                <div
                  key={group.key}
                  className={`rounded-[24px] border transition overflow-hidden shadow-sm ${
                    containsSelected
                      ? 'border-signal-orange bg-white'
                      : 'border-border-cream bg-white'
                  }`}
                >
                  {/* Parent Story Header Card */}
                  <div
                    onClick={() => toggleStoryCollapse(group.key)}
                    className="p-3.5 bg-white flex items-center justify-between cursor-pointer hover:bg-canvas-cream/50 transition"
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0 pr-2">
                      <div className="w-7 h-7 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center shrink-0 mt-0.5">
                        <BookOpen className="w-3.5 h-3.5 text-signal-orange" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-charcoal bg-canvas-cream px-2 py-0.2 rounded-full border border-border-cream">
                            Story Arc
                          </span>
                          <span className="text-[10px] font-mono text-slate-gray">
                            {group.clips.length} Parts • {formatTime(group.totalDuration)}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-ink-black truncate tracking-tight" title={group.title}>
                          {group.title}
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="p-1 rounded-full text-slate-gray hover:text-ink-black"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-signal-orange" />
                      )}
                    </button>
                  </div>

                  {/* Child Parts List */}
                  {!isCollapsed && (
                    <div className="p-3 pt-2 space-y-2 bg-lifted-cream border-t border-border-cream">
                      {group.clips.map((clip) => renderClipCard(clip, true))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone Highlights */}
            {standaloneClips.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-slate-gray uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                  <span>Standalone Highlights ({standaloneClips.length})</span>
                </div>
                {standaloneClips.map((clip) => renderClipCard(clip, false))}
              </div>
            )}
          </>
        ) : (
          sortedClips.map((clip) => renderClipCard(clip, false))
        )}
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
