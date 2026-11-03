import React, { useState, useMemo, useEffect } from 'react';
import { Flame, Clock, Sparkles, Check, Trash2, Plus, BookOpen, Layers, ChevronDown, ChevronRight, Film, ArrowDownAZ, ArrowUpDown } from 'lucide-react';

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

  const [viewMode, setViewMode] = useState(hasStories ? 'stories' : 'all'); // 'stories' | 'all'
  const [sortBy, setSortBy] = useState('timeline'); // 'timeline' | 'score'
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

    // Chronologically sort parent stories by their earliest start time
    groups.sort((a, b) => (a.clips[0]?.start_time || 0) - (b.clips[0]?.start_time || 0));

    return { storyGroups: groups, standaloneClips: standalone };
  }, [clips]);

  // Chronologically or virality sorted flat clips
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
      <div className="w-72 lg:w-80 shrink-0 bg-dark-900 border-r border-dark-700/80 p-4 text-xs text-slate-400 select-none flex flex-col justify-between">
        <div>No clips available.</div>
        {onDeleteProject && (
          <button
            onClick={onDeleteProject}
            className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-3 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/60 rounded-xl transition font-medium text-xs cursor-pointer"
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
        className={`w-full rounded-xl p-3 cursor-pointer transition border relative ${
          isSelected
            ? 'bg-dark-800 border-lime-neon ring-1 ring-lime-neon shadow-neon-sm'
            : isChild
            ? 'bg-dark-950/90 hover:bg-dark-850 border-dark-800/80 hover:border-lime-neon/40'
            : 'bg-dark-950/70 hover:bg-dark-850 border-dark-800 hover:border-dark-700'
        } ${isChild ? 'ml-3 w-[calc(100%-0.75rem)] border-l-2 border-l-lime-neon/60' : ''}`}
      >
        {/* Top Row: Score + Part/Category + Duration */}
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="text-[10px] font-extrabold bg-lime-neon/15 text-lime-neon border border-lime-neon/40 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <Flame className="w-3 h-3 fill-lime-neon" />
            {clip.score}/100
          </span>

          <span className="text-[10px] text-slate-300 uppercase font-bold tracking-wider flex items-center gap-1 truncate">
            {clip.part_number && clip.total_parts ? (
              <span className="bg-lime-neon/10 text-lime-neon px-1.5 py-0.5 rounded border border-lime-neon/20 font-mono">
                Part {clip.part_number}/{clip.total_parts}
              </span>
            ) : (
              clip.category || 'Highlight'
            )}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-slate-300 font-mono flex items-center gap-0.5">
              <Clock className="w-3 h-3 text-slate-500" />
              {formatTime(clip.duration)}
            </span>
            {onDeleteClip && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClip(clip);
                }}
                className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/50 transition cursor-pointer"
                title="Delete this clip"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h4 className="text-xs font-bold text-white line-clamp-1 mb-1" title={clip.title}>
          {clip.title}
        </h4>

        {/* Hook snippet */}
        <p className="text-[11px] text-slate-400 line-clamp-2 italic mb-2 leading-relaxed">
          "{clip.hook || clip.reason || 'High engagement moment'}"
        </p>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-1.5 border-t border-dark-800 text-[10px]">
          <span className="text-slate-400 font-mono">
            {formatTime(clip.start_time)} – {formatTime(clip.end_time)}
          </span>
          <div className="flex items-center gap-2">
            {isRendered ? (
              <span className="text-lime-neon font-bold flex items-center gap-1">
                <Check className="w-3 h-3 stroke-[2.5]" /> Ready
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip(clip);
                  onRenderClip(clip);
                }}
                className="text-lime-neon hover:underline font-bold cursor-pointer"
              >
                Render Short →
              </button>
            )}
            {onDeleteClip && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClip(clip);
                }}
                className="text-slate-500 hover:text-red-400 hover:bg-red-950/50 px-1.5 py-0.5 rounded transition flex items-center gap-1 cursor-pointer"
                title="Delete this clip"
              >
                <Trash2 className="w-3 h-3" />
                <span className="text-[9px] font-semibold">Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 lg:w-80 shrink-0 bg-dark-900 border-r border-dark-700/80 flex flex-col min-h-0 select-none">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-dark-700/80 bg-dark-950/50 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-lime-neon shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                AI Highlights ({clips.length})
              </h3>
              <p className="text-[10px] text-slate-400 truncate">
                {viewMode === 'stories' && storyGroups.length > 0
                  ? `${storyGroups.length} Stories • ${clips.length} Parts`
                  : sortBy === 'timeline'
                  ? 'Sequential Timeline Order'
                  : 'Ranked by Viral Score'}
              </p>
            </div>
          </div>

          {/* View Toggle (Stories vs Flat View) */}
          {(hasStories || storyGroups.length > 0) && (
            <div className="flex p-0.5 bg-dark-900 rounded-lg border border-dark-800 text-[10px] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('stories')}
                className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'stories'
                    ? 'bg-lime-neon text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Hierarchical Story View: Main story parent with nested child parts"
              >
                <BookOpen className="w-3 h-3" />
                Stories
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-lime-neon text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Flat list of all individual clips"
              >
                <Layers className="w-3 h-3" />
                All
              </button>
            </div>
          )}
        </div>

        {/* Sort Switcher (Timeline Chronological vs Viral Score) */}
        <div className="flex items-center justify-between gap-1 pt-1 border-t border-dark-800/80 text-[10px]">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-slate-500" />
            Sort:
          </span>
          <div className="flex p-0.5 bg-dark-900 rounded-lg border border-dark-800">
            <button
              type="button"
              onClick={() => setSortBy('timeline')}
              className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                sortBy === 'timeline'
                  ? 'bg-lime-neon text-black font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Sort sequentially by video timeline (0:00 -> End)"
            >
              <Clock className="w-2.5 h-2.5" />
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setSortBy('score')}
              className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 cursor-pointer ${
                sortBy === 'score'
                  ? 'bg-lime-neon text-black font-extrabold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Sort by highest AI virality score"
            >
              <Flame className="w-2.5 h-2.5" />
              Score
            </button>
          </div>
        </div>
      </div>

      {/* Vertical Clips Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {viewMode === 'stories' && storyGroups.length > 0 ? (
          <>
            {/* Render Hierarchical Parent Story Groups */}
            {storyGroups.map((group) => {
              const isCollapsed = Boolean(collapsedStories[group.key]);
              const containsSelected = group.clips.some((c) => c.id === selectedClip?.id);

              return (
                <div
                  key={group.key}
                  className={`rounded-2xl border transition overflow-hidden ${
                    containsSelected
                      ? 'border-lime-neon/40 bg-dark-900/90 shadow-neon-sm'
                      : 'border-dark-750 bg-dark-950/60'
                  }`}
                >
                  {/* Parent Story Header Card */}
                  <div
                    onClick={() => toggleStoryCollapse(group.key)}
                    className="p-3 bg-gradient-to-r from-dark-850 to-dark-900 flex items-center justify-between cursor-pointer hover:bg-dark-800 transition"
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-lime-neon/15 border border-lime-neon/30 flex items-center justify-center shrink-0 mt-0.5">
                        <BookOpen className="w-3.5 h-3.5 text-lime-neon" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-extrabold uppercase tracking-wider text-lime-neon bg-lime-neon/10 px-1.5 py-0.2 rounded border border-lime-neon/20">
                            Story Arc
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {group.clips.length} Parts • {formatTime(group.totalDuration)}
                          </span>
                        </div>
                        <h4 className="text-xs font-extrabold text-white truncate" title={group.title}>
                          {group.title}
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="p-1 rounded-md text-slate-400 hover:text-white"
                      title={isCollapsed ? 'Expand Parts' : 'Collapse Parts'}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-lime-neon" />
                      )}
                    </button>
                  </div>

                  {/* Child Parts List */}
                  {!isCollapsed && (
                    <div className="p-2.5 pt-2 space-y-2 bg-dark-950/40 border-t border-dark-800">
                      {group.clips.map((clip) => renderClipCard(clip, true))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone Highlights Section if any exist */}
            {standaloneClips.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <Flame className="w-3 h-3 text-lime-neon" />
                  <span>Standalone Highlights ({standaloneClips.length})</span>
                </div>
                {standaloneClips.map((clip) => renderClipCard(clip, false))}
              </div>
            )}
          </>
        ) : (
          /* Flat list view sorted by timeline or viral score */
          sortedClips.map((clip) => renderClipCard(clip, false))
        )}
      </div>

      {/* Sticky Project Management Footer: New Clip & Delete Project */}
      <div className="p-3 border-t border-dark-700/80 bg-dark-950/80 flex items-center gap-2 shrink-0">
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-dark-850 hover:bg-dark-800 text-slate-200 border border-dark-700 rounded-xl transition text-[11px] font-bold cursor-pointer"
            title="Create a new project"
          >
            <Plus className="w-3.5 h-3.5 text-lime-neon" />
            New
          </button>
        )}
        {onDeleteProject && (
          <button
            onClick={onDeleteProject}
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 border border-red-800/60 rounded-xl transition text-[11px] font-bold cursor-pointer"
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
