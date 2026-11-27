import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Scissors,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Sparkles,
  Move,
  ZoomIn,
  Volume2,
  VolumeX,
  Sliders,
  Layers,
  Diamond,
  FlipHorizontal,
  RotateCw,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Maximize2,
  Loader2,
  Check,
  Film,
  Grid,
  Repeat,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

const FILTER_PRESETS = [
  { id: 'original', label: 'Original', brightness: 0, contrast: 1, saturation: 1, sharpen: 0 },
  { id: 'crisp', label: 'Crisp Pop', brightness: 0.03, contrast: 1.15, saturation: 1.2, sharpen: 0.45 },
  { id: 'warm', label: 'Warm Cinema', brightness: 0.02, contrast: 1.12, saturation: 1.18, sharpen: 0.2 },
  { id: 'noir', label: 'Noir B&W', brightness: 0.02, contrast: 1.25, saturation: 0.0, sharpen: 0.3 },
  { id: 'vivid', label: 'Vibrant', brightness: 0.04, contrast: 1.1, saturation: 1.4, sharpen: 0.25 },
  { id: 'soft', label: 'Soft Vlog', brightness: 0.06, contrast: 0.94, saturation: 1.06, sharpen: 0.0 },
];

const cloneState = (obj) => JSON.parse(JSON.stringify(obj));

const buildInitialStudioState = (clip) => {
  const ed = clip?.editor_data && typeof clip.editor_data === 'object' ? clip.editor_data : {};
  const baseStart = Number(clip?.start_time ?? 0);
  const baseEnd = Math.max(baseStart + 1, Number(clip?.end_time ?? baseStart + 30));

  const segments =
    Array.isArray(ed.segments) && ed.segments.length > 0
      ? ed.segments.map((s, i) => ({
          id: s.id || `seg_${i}_${Math.round((s.start || 0) * 10)}`,
          start: Number(s.start ?? baseStart),
          end: Number(s.end ?? baseEnd),
          speed: Number(s.speed || 1.0),
          volume: s.volume !== undefined ? Number(s.volume) : 1.0,
          muted: Boolean(s.muted),
        }))
      : [
          {
            id: 'seg_0',
            start: baseStart,
            end: baseEnd,
            speed: 1.0,
            volume: 1.0,
            muted: false,
          },
        ];

  const rawKfs =
    Array.isArray(clip?.crop_keyframes) && clip.crop_keyframes.length > 0
      ? clip.crop_keyframes
      : [
          {
            time: 0,
            x: Number(clip?.crop_x ?? 50),
            y: Number(clip?.crop_y ?? 45),
            zoom: Math.max(1.08, Number(clip?.crop_zoom ?? 1.15)),
            speaker: 'Manual Focus',
            easing: 'cut',
          },
        ];

  const keyframes = rawKfs
    .map((k, idx) => ({
      id: k.id || `kf_${idx}_${Math.round((Number(k.time) || 0) * 100)}`,
      time: Math.max(0, Math.round((Number(k.time) || 0) * 100) / 100),
      x: Math.max(0, Math.min(100, Number(k.x ?? clip?.crop_x ?? 50))),
      y: Math.max(0, Math.min(100, Number(k.y ?? clip?.crop_y ?? 45))),
      zoom: Math.max(1.08, Math.min(2.5, Number(k.zoom ?? clip?.crop_zoom ?? 1.15))),
      speaker: k.speaker || 'Focus',
      easing: k.easing || 'cut',
    }))
    .sort((a, b) => a.time - b.time);

  const adj = ed.adjustments || {};

  return {
    title: clip?.title || 'Untitled Short',
    cropMode: clip?.crop_mode === 'blur_fill' ? 'blur_fill' : 'custom_crop',
    segments,
    keyframes,
    adjustments: {
      preset: adj.preset || 'original',
      brightness: Number(adj.brightness ?? 0),
      contrast: Number(adj.contrast ?? 1),
      saturation: Number(adj.saturation ?? 1),
      sharpen: Number(adj.sharpen ?? 0),
      flipH: Boolean(adj.flipH),
      rotate: Number(adj.rotate ?? 0),
    },
    fadeIn: Number(ed.fadeIn ?? 0),
    fadeOut: Number(ed.fadeOut ?? 0),
    smoothPan: ed.smoothPan !== undefined ? Boolean(ed.smoothPan) : true,
    showCredit: ed.showCredit !== undefined ? Boolean(ed.showCredit) : true,
  };
};

export default function CapCutStudioEditor({
  project,
  clip,
  videoSrc,
  onBack,
  onSaveClip,
  onAutoTrack,
  onOpenExport,
}) {
  const [studio, setStudio] = useState(() => buildInitialStudioState(clip));
  const [history, setHistory] = useState(() => [buildInitialStudioState(clip)]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [leftTab, setLeftTab] = useState('framing'); // 'framing' | 'cuts' | 'color'
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTl, setPlayheadTl] = useState(0); // seconds on edited timeline
  const [timelineZoom, setTimelineZoom] = useState(1); // 1x..4x
  const [selectedSegId, setSelectedSegId] = useState(() => studio.segments[0]?.id || 'seg_0');
  const [selectedKfId, setSelectedKfId] = useState(() => studio.keyframes[0]?.id || null);
  const [showSafeGuides, setShowSafeGuides] = useState(true);
  const [showSourceMinimap, setShowSourceMinimap] = useState(true);
  const [autoKeyframeOnDrag, setAutoKeyframeOnDrag] = useState(true);
  const [loopClip, setLoopClip] = useState(true);
  const [saveState, setSaveState] = useState('saved'); // 'saved' | 'saving' | 'dirty'
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [srcAspect, setSrcAspect] = useState(16 / 9);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [liveDragXY, setLiveDragXY] = useState(null);
  const [draggingSegIdx, setDraggingSegIdx] = useState(null);

  const mainVideoRef = useRef(null);
  const miniVideoRef = useRef(null);
  const canvasStageRef = useRef(null);
  const miniStageRef = useRef(null);
  const timelineTrackRef = useRef(null);
  const saveTimerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const clipIdRef = useRef(clip?.id);

  // Sync when switching to a different clip id
  useEffect(() => {
    if (clip?.id && clip.id !== clipIdRef.current) {
      clipIdRef.current = clip.id;
      const fresh = buildInitialStudioState(clip);
      setStudio(fresh);
      setHistory([cloneState(fresh)]);
      setHistoryIdx(0);
      setPlayheadTl(0);
      setSelectedSegId(fresh.segments[0]?.id || null);
      setSelectedKfId(fresh.keyframes[0]?.id || null);
    }
  }, [clip?.id]);

  // Edited timeline segment mapping
  const timelineMap = useMemo(() => {
    const items = [];
    let cursor = 0;
    for (let i = 0; i < studio.segments.length; i++) {
      const seg = studio.segments[i];
      const spd = Math.max(0.25, Math.min(3.0, Number(seg.speed || 1)));
      const srcDur = Math.max(0.15, Number(seg.end) - Number(seg.start));
      const tlDur = srcDur / spd;
      items.push({
        ...seg,
        idx: i,
        speed: spd,
        srcDur,
        tlDur,
        tlStart: cursor,
        tlEnd: cursor + tlDur,
      });
      cursor += tlDur;
    }
    return { items, totalDur: Math.max(0.5, cursor) };
  }, [studio.segments]);

  const timelineToSource = useCallback(
    (tl) => {
      const clamped = Math.max(0, Math.min(timelineMap.totalDur, tl));
      for (let i = 0; i < timelineMap.items.length; i++) {
        const it = timelineMap.items[i];
        if (clamped <= it.tlEnd + 0.001 || i === timelineMap.items.length - 1) {
          const offset = Math.max(0, Math.min(it.tlDur, clamped - it.tlStart));
          return { seg: it, segIdx: i, sourceTime: Math.min(it.end, it.start + offset * it.speed) };
        }
      }
      return { seg: timelineMap.items[0], segIdx: 0, sourceTime: clip?.start_time || 0 };
    },
    [timelineMap, clip?.start_time]
  );

  // Build backend persistence payload from current studio state
  const buildPersistPayload = useCallback(
    (st) => {
      const kfs = [...st.keyframes]
        .sort((a, b) => a.time - b.time)
        .map((k) => ({
          id: k.id,
          time: Math.round(k.time * 100) / 100,
          x: Math.round(k.x * 10) / 10,
          y: Math.round(k.y * 10) / 10,
          zoom: Math.round(k.zoom * 100) / 100,
          speaker: k.speaker || 'Focus',
          easing: k.easing || 'cut',
        }));
      const segs = st.segments.map((s) => ({
        id: s.id,
        start: Math.round(s.start * 100) / 100,
        end: Math.round(s.end * 100) / 100,
        speed: Math.round((s.speed || 1) * 100) / 100,
        volume: s.volume !== undefined ? Math.round(s.volume * 100) / 100 : 1.0,
        muted: Boolean(s.muted),
      }));
      const firstKf = kfs[0] || { x: 50, y: 45, zoom: 1.15 };
      const minStart = Math.min(...segs.map((s) => s.start));
      const maxEnd = Math.max(...segs.map((s) => s.end));
      return {
        title: st.title,
        start_time: minStart,
        end_time: maxEnd,
        crop_mode: st.cropMode,
        crop_x: firstKf.x,
        crop_y: firstKf.y,
        crop_zoom: firstKf.zoom,
        crop_keyframes: kfs,
        editor_data: {
          segments: segs,
          adjustments: st.adjustments,
          fadeIn: st.fadeIn,
          fadeOut: st.fadeOut,
          smoothPan: st.smoothPan,
          showCredit: st.showCredit,
        },
      };
    },
    []
  );

  const flushSaveNow = useCallback(
    async (stateToSave = studio) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (!clip?.id || !onSaveClip) return;
      setSaveState('saving');
      try {
        await onSaveClip(clip.id, buildPersistPayload(stateToSave));
        setSaveState('saved');
      } catch (err) {
        console.error('[CapCutStudioEditor] Save failed:', err);
        setSaveState('dirty');
      }
    },
    [clip?.id, onSaveClip, buildPersistPayload, studio]
  );

  // Commit state change into undo/redo stack + debounced backend auto-save
  const commitStudio = useCallback(
    (updater, { recordHistory = true, immediateSave = false } = {}) => {
      setStudio((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (recordHistory) {
          setHistory((h) => [...h.slice(0, historyIdx + 1), cloneState(next)].slice(-40));
          setHistoryIdx((idx) => Math.min(39, idx + 1));
        }
        setSaveState('dirty');
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (immediateSave) {
          flushSaveNow(next);
        } else {
          saveTimerRef.current = setTimeout(() => flushSaveNow(next), 320);
        }
        return next;
      });
    },
    [historyIdx, flushSaveNow]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx <= 0) return;
    const targetIdx = historyIdx - 1;
    const snap = cloneState(history[targetIdx]);
    setHistoryIdx(targetIdx);
    setStudio(snap);
    flushSaveNow(snap);
  }, [history, historyIdx, flushSaveNow]);

  const handleRedo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const targetIdx = historyIdx + 1;
    const snap = cloneState(history[targetIdx]);
    setHistoryIdx(targetIdx);
    setStudio(snap);
    flushSaveNow(snap);
  }, [history, historyIdx, flushSaveNow]);

  // Live camera evaluator at current timeline timestamp (matches editor.py 1:1)
  const cameraAtPlayhead = useMemo(() => {
    const kfs = [...studio.keyframes].sort((a, b) => a.time - b.time);
    if (kfs.length === 0) return { x: 50, y: 45, zoom: 1.15, speaker: 'Focus', easing: 'cut', idx: -1 };
    let curIdx = 0;
    for (let i = 0; i < kfs.length; i++) {
      if (kfs[i].time <= playheadTl + 0.001) curIdx = i;
      else break;
    }
    const cur = kfs[curIdx];
    const next = kfs[curIdx + 1];
    let x = cur.x;
    let y = cur.y;
    let zoom = cur.zoom || 1.15;

    if (next && (next.easing === 'linear' || next.easing === 'smooth') && next.time > cur.time + 0.04) {
      const frac = Math.max(0, Math.min(1, (playheadTl - cur.time) / (next.time - cur.time)));
      x = cur.x + (next.x - cur.x) * frac;
      y = cur.y + (next.y - cur.y) * frac;
      zoom = (cur.zoom || 1.15) + ((next.zoom || 1.15) - (cur.zoom || 1.15)) * frac;
    } else if (curIdx > 0 && cur.easing !== 'cut' && studio.smoothPan) {
      const prev = kfs[curIdx - 1];
      const glideDur = 0.24;
      const elapsed = playheadTl - cur.time;
      if (elapsed >= 0 && elapsed < glideDur) {
        const frac = elapsed / glideDur;
        x = prev.x + (cur.x - prev.x) * frac;
        y = prev.y + (cur.y - prev.y) * frac;
        zoom = (prev.zoom || 1.15) + ((cur.zoom || 1.15) - (prev.zoom || 1.15)) * frac;
      }
    }
    return {
      x: Math.max(0, Math.min(100, liveDragXY ? liveDragXY.x : x)),
      y: Math.max(0, Math.min(100, liveDragXY ? liveDragXY.y : y)),
      zoom: Math.max(1.08, Math.min(2.5, zoom)),
      speaker: cur.speaker || 'Focus',
      easing: cur.easing || 'cut',
      idx: curIdx,
      kfId: cur.id,
    };
  }, [studio.keyframes, studio.smoothPan, playheadTl, liveDragXY]);

  // Seek hardware video to timeline time cleanly
  const seekTimeline = useCallback(
    (targetTl, { pauseFirst = false } = {}) => {
      const clampedTl = Math.max(0, Math.min(timelineMap.totalDur, targetTl));
      setPlayheadTl(clampedTl);
      const { seg, sourceTime } = timelineToSource(clampedTl);
      if (seg?.id) setSelectedSegId(seg.id);
      if (mainVideoRef.current) {
        if (pauseFirst && !mainVideoRef.current.paused) {
          mainVideoRef.current.pause();
        }
        mainVideoRef.current.currentTime = sourceTime;
        mainVideoRef.current.playbackRate = seg?.speed || 1;
        mainVideoRef.current.volume = Math.min(1, seg?.volume ?? 1);
        mainVideoRef.current.muted = Boolean(seg?.muted);
      }
      if (miniVideoRef.current) {
        miniVideoRef.current.currentTime = sourceTime;
      }
    },
    [timelineMap.totalDur, timelineToSource]
  );

  // Sync video initially on load
  const handleLoadedMetadata = () => {
    const vid = mainVideoRef.current;
    if (!vid) return;
    if (vid.videoWidth > 0 && vid.videoHeight > 0) {
      setSrcAspect(vid.videoWidth / vid.videoHeight);
    }
    seekTimeline(playheadTl);
  };

  // 60 FPS Playhead & Multi-Segment Stitch Loop
  const playheadRef = useRef(playheadTl);
  playheadRef.current = playheadTl;

  useEffect(() => {
    if (!isPlaying) return;
    let rafId;
    let segIdxActive = timelineToSource(playheadRef.current).segIdx;

    const tick = () => {
      const vid = mainVideoRef.current;
      if (vid && !vid.paused) {
        const curSrc = vid.currentTime;
        const item = timelineMap.items[segIdxActive];
        if (item) {
          vid.playbackRate = item.speed;
          vid.volume = Math.min(1, item.volume ?? 1);
          vid.muted = Boolean(item.muted);

          const tlPos = item.tlStart + Math.max(0, curSrc - item.start) / item.speed;
          setPlayheadTl(Math.min(timelineMap.totalDur, tlPos));
          if (miniVideoRef.current && Math.abs(miniVideoRef.current.currentTime - curSrc) > 0.08) {
            miniVideoRef.current.currentTime = curSrc;
          }

          if (curSrc >= item.end - 0.03) {
            const nextIdx = segIdxActive + 1;
            if (nextIdx < timelineMap.items.length) {
              segIdxActive = nextIdx;
              const nxt = timelineMap.items[nextIdx];
              vid.currentTime = nxt.start;
              setSelectedSegId(nxt.id);
              setPlayheadTl(nxt.tlStart);
            } else if (loopClip) {
              segIdxActive = 0;
              const first = timelineMap.items[0];
              vid.currentTime = first.start;
              setSelectedSegId(first.id);
              setPlayheadTl(0);
            } else {
              vid.pause();
              setIsPlaying(false);
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, timelineMap, loopClip, timelineToSource]);

  const togglePlay = useCallback(() => {
    const vid = mainVideoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.pause();
    } else {
      const { seg, sourceTime } = timelineToSource(playheadRef.current);
      if (Math.abs(vid.currentTime - sourceTime) > 0.15) {
        vid.currentTime = sourceTime;
      }
      vid.playbackRate = seg?.speed || 1;
      vid.volume = Math.min(1, seg?.volume ?? 1);
      vid.muted = Boolean(seg?.muted);
      vid.play().catch(() => setIsPlaying(false));
    }
  }, [isPlaying, timelineToSource]);

  // Add or update a Keyframe at current playhead
  const upsertKeyframeAt = useCallback(
    (timeVal, partial = {}) => {
      const tRounded = Math.max(0, Math.min(timelineMap.totalDur, Math.round(timeVal * 100) / 100));
      commitStudio((prev) => {
        const nearIdx = prev.keyframes.findIndex((k) => Math.abs(k.time - tRounded) <= 0.35);
        let nextKfs = [...prev.keyframes];
        if (nearIdx >= 0) {
          const updated = {
            ...nextKfs[nearIdx],
            ...partial,
            speaker: partial.speaker || 'Manual Keyframe',
          };
          nextKfs[nearIdx] = updated;
          setSelectedKfId(updated.id);
        } else {
          const newKf = {
            id: `kf_${Date.now()}_${Math.round(tRounded * 100)}`,
            time: tRounded,
            x: partial.x ?? cameraAtPlayhead.x,
            y: partial.y ?? cameraAtPlayhead.y,
            zoom: partial.zoom ?? cameraAtPlayhead.zoom,
            easing: partial.easing ?? 'linear',
            speaker: partial.speaker || 'Manual Keyframe',
          };
          nextKfs.push(newKf);
          nextKfs.sort((a, b) => a.time - b.time);
          setSelectedKfId(newKf.id);
        }
        return { ...prev, cropMode: 'custom_crop', keyframes: nextKfs };
      });
    },
    [timelineMap.totalDur, cameraAtPlayhead, commitStudio]
  );

  // Apply crop coordinates either at current keyframe or inserting new keyframe if autoKeyframeOnDrag
  const applyCropCoords = useCallback(
    (partial, { forceAddKf = false } = {}) => {
      const curKf = studio.keyframes.find((k) => k.id === selectedKfId) || studio.keyframes[Math.max(0, cameraAtPlayhead.idx)];
      const nearPlayhead = studio.keyframes.find((k) => Math.abs(k.time - playheadTl) <= 0.35);
      if (forceAddKf || (autoKeyframeOnDrag && !nearPlayhead)) {
        upsertKeyframeAt(playheadTl, partial);
      } else if (nearPlayhead || curKf) {
        const targetId = (nearPlayhead || curKf).id;
        commitStudio((prev) => ({
          ...prev,
          cropMode: 'custom_crop',
          keyframes: prev.keyframes.map((k) => (k.id === targetId ? { ...k, ...partial, speaker: 'Edited Frame' } : k)),
        }));
      } else {
        upsertKeyframeAt(0, partial);
      }
    },
    [studio.keyframes, selectedKfId, cameraAtPlayhead.idx, playheadTl, autoKeyframeOnDrag, upsertKeyframeAt, commitStudio]
  );

  // Split active segment at playhead (CapCut Cut tool)
  const handleSplitAtPlayhead = useCallback(() => {
    const { seg, segIdx, sourceTime } = timelineToSource(playheadRef.current);
    if (!seg) return;
    if (sourceTime - seg.start < 0.25 || seg.end - sourceTime < 0.25) return;
    const splitPt = Math.round(sourceTime * 100) / 100;
    const newId = `seg_${Date.now()}`;
    commitStudio((prev) => {
      const nextSegs = [...prev.segments];
      const target = nextSegs[segIdx];
      const left = { ...target, end: splitPt };
      const right = {
        id: newId,
        start: splitPt,
        end: target.end,
        speed: target.speed,
        volume: target.volume,
        muted: target.muted,
      };
      nextSegs.splice(segIdx, 1, left, right);
      return { ...prev, segments: nextSegs };
    });
    setSelectedSegId(newId);
  }, [timelineToSource, commitStudio]);

  const handleDeleteSegment = useCallback(
    (segId) => {
      if (studio.segments.length <= 1) return; // keep at least 1 segment
      const delItem = timelineMap.items.find((s) => s.id === segId);
      const removedTlDur = delItem ? delItem.tlDur : 0;
      const removedTlStart = delItem ? delItem.tlStart : 0;
      commitStudio((prev) => {
        const nextSegs = prev.segments.filter((s) => s.id !== segId);
        // Shift keyframes after the deleted segment cleanly so camera alignment stays accurate
        const nextKfs = prev.keyframes
          .map((k) => {
            if (k.time > removedTlStart + removedTlDur) {
              return { ...k, time: Math.max(0, Math.round((k.time - removedTlDur) * 100) / 100) };
            }
            return k;
          })
          .filter((k) => k.time <= Math.max(0.5, timelineMap.totalDur - removedTlDur + 0.1));
        return {
          ...prev,
          segments: nextSegs,
          keyframes: nextKfs.length > 0 ? nextKfs : prev.keyframes.slice(0, 1),
        };
      });
      setSelectedSegId(studio.segments.find((s) => s.id !== segId)?.id || null);
      setPlayheadTl((p) => Math.max(0, Math.min(p, timelineMap.totalDur - removedTlDur)));
    },
    [studio.segments, timelineMap, commitStudio]
  );

  const handleRestoreAllSegments = () => {
    const origStart = Math.min(...studio.segments.map((s) => s.start), Number(clip?.start_time ?? 0));
    const origEnd = Math.max(...studio.segments.map((s) => s.end), Number(clip?.end_time ?? origStart + 30));
    const restored = [{ id: `seg_${Date.now()}`, start: origStart, end: origEnd, speed: 1.0, volume: 1.0, muted: false }];
    commitStudio((prev) => ({ ...prev, segments: restored }));
    setSelectedSegId(restored[0].id);
  };

  // Keyboard Shortcuts (CapCut / Premiere style: Space, S, K, Arrows, Ctrl+Z, Ctrl+Shift+Z)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        upsertKeyframeAt(playheadRef.current);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTimeline(playheadRef.current - (e.shiftKey ? 1.0 : 0.033), { pauseFirst: true });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTimeline(playheadRef.current + (e.shiftKey ? 1.0 : 0.033), { pauseFirst: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, handleSplitAtPlayhead, upsertKeyframeAt, seekTimeline, handleUndo, handleRedo]);

  // Direct Drag-to-Reframe on main 9:16 Stage (Left / Right / Up / Down)
  const widthRatio = Math.max(1.0, (srcAspect || 16 / 9) / (9 / 16));
  const startCanvasDrag = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (!canvasStageRef.current) return;
    const startCX = e.clientX ?? e.touches?.[0]?.clientX;
    const startCY = e.clientY ?? e.touches?.[0]?.clientY;
    if (startCX === undefined || startCY === undefined) return;

    const rect = canvasStageRef.current.getBoundingClientRect();
    const curX = cameraAtPlayhead.x;
    const curY = cameraAtPlayhead.y;
    const curZ = cameraAtPlayhead.zoom;
    const overflowX = Math.max(40, rect.width * Math.max(0.15, widthRatio * curZ - 1));
    const overflowY = Math.max(28, rect.height * Math.max(0.08, curZ - 1));
    let moved = false;
    let lastX = curX;
    let lastY = curY;

    const onMove = (me) => {
      const cx = me.clientX ?? me.touches?.[0]?.clientX;
      const cy = me.clientY ?? me.touches?.[0]?.clientY;
      if (cx === undefined || cy === undefined) return;
      const dx = cx - startCX;
      const dy = cy - startCY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) {
        moved = true;
        suppressClickRef.current = true;
        setIsDraggingCanvas(true);
      }
      lastX = Math.max(0, Math.min(100, Math.round((curX - (dx / overflowX) * 100) * 10) / 10));
      lastY = Math.max(0, Math.min(100, Math.round((curY - (dy / overflowY) * 100) * 10) / 10));
      setLiveDragXY({ x: lastX, y: lastY });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      setIsDraggingCanvas(false);
      setLiveDragXY(null);
      if (moved) {
        applyCropCoords({ x: lastX, y: lastY, zoom: curZ });
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // Drag Crop Box inside the 16:9 Source Minimap
  const startMinimapDrag = (e) => {
    e.preventDefault();
    if (!miniStageRef.current) return;
    const rect = miniStageRef.current.getBoundingClientRect();
    let latestX = cameraAtPlayhead.x;
    let latestY = cameraAtPlayhead.y;

    const updateFromEvt = (evt) => {
      const cx = evt.clientX ?? evt.touches?.[0]?.clientX;
      const cy = evt.clientY ?? evt.touches?.[0]?.clientY;
      if (cx === undefined || cy === undefined) return;
      const effZ = cameraAtPlayhead.zoom;
      const wPct = (100 / effZ) * (9 / 16) * (9 / 16);
      const hPct = 100 / effZ;
      const rawX = ((cx - rect.left) / rect.width) * 100;
      const rawY = ((cy - rect.top) / rect.height) * 100;
      latestX = Math.max(0, Math.min(100, Math.round(((rawX - wPct / 2) / Math.max(1, 100 - wPct)) * 100 * 10) / 10));
      latestY = Math.max(0, Math.min(100, Math.round(((rawY - hPct / 2) / Math.max(1, 100 - hPct)) * 100 * 10) / 10));
      setLiveDragXY({ x: latestX, y: latestY });
    };

    updateFromEvt(e);
    const onUp = () => {
      window.removeEventListener('mousemove', updateFromEvt);
      window.removeEventListener('mouseup', updateFromEvt);
      window.removeEventListener('touchmove', updateFromEvt);
      window.removeEventListener('touchend', onUp);
      setLiveDragXY(null);
      applyCropCoords({ x: latestX, y: latestY, zoom: cameraAtPlayhead.zoom });
    };
    window.addEventListener('mousemove', updateFromEvt);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', updateFromEvt, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // Scrub Playhead on Timeline Ruler / Track
  const handleTimelineScrub = (e) => {
    if (!timelineTrackRef.current) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const moveTo = (evt) => {
      const cx = evt.clientX ?? evt.touches?.[0]?.clientX;
      if (cx === undefined) return;
      const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      seekTimeline(pct * timelineMap.totalDur, { pauseFirst: true });
    };
    moveTo(e);
    const up = () => {
      window.removeEventListener('mousemove', moveTo);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', moveTo);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', moveTo);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', moveTo, { passive: true });
    window.addEventListener('touchend', up);
  };

  // Drag & Drop a Keyframe Diamond horizontally along Track 2
  const startKeyframeDrag = (e, kfId) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedKfId(kfId);
    const trackEl = timelineTrackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    let finalTime = studio.keyframes.find((k) => k.id === kfId)?.time ?? 0;

    const onMove = (me) => {
      const cx = me.clientX ?? me.touches?.[0]?.clientX;
      if (cx === undefined) return;
      const pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      finalTime = Math.round(pct * timelineMap.totalDur * 100) / 100;
      setStudio((prev) => ({
        ...prev,
        keyframes: prev.keyframes.map((k) => (k.id === kfId ? { ...k, time: finalTime } : k)).sort((a, b) => a.time - b.time),
      }));
      seekTimeline(finalTime, { pauseFirst: true });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      commitStudio((prev) => ({
        ...prev,
        keyframes: prev.keyframes.map((k) => (k.id === kfId ? { ...k, time: finalTime } : k)).sort((a, b) => a.time - b.time),
      }));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // Trim Left / Right edge of a Segment inside Track 1
  const startSegTrim = (e, segIdx, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const trackEl = timelineTrackRef.current;
    const item = timelineMap.items[segIdx];
    if (!trackEl || !item) return;
    const startCX = e.clientX ?? e.touches?.[0]?.clientX;
    const pxPerSec = trackEl.getBoundingClientRect().width / timelineMap.totalDur;
    const origStart = item.start;
    const origEnd = item.end;
    let newStart = origStart;
    let newEnd = origEnd;
    const maxVideoDur = Number(project?.duration || origEnd + 60);

    const onMove = (me) => {
      const cx = me.clientX ?? me.touches?.[0]?.clientX;
      if (cx === undefined) return;
      const deltaSrc = ((cx - startCX) / Math.max(5, pxPerSec)) * item.speed;
      if (edge === 'start') {
        newStart = Math.max(0, Math.min(origEnd - 0.5, Math.round((origStart + deltaSrc) * 10) / 10));
      } else {
        newEnd = Math.min(maxVideoDur, Math.max(origStart + 0.5, Math.round((origEnd + deltaSrc) * 10) / 10));
      }
      setStudio((prev) => ({
        ...prev,
        segments: prev.segments.map((s, i) => (i === segIdx ? { ...s, start: newStart, end: newEnd } : s)),
      }));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      commitStudio((prev) => ({
        ...prev,
        segments: prev.segments.map((s, i) => (i === segIdx ? { ...s, start: newStart, end: newEnd } : s)),
      }));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // Drag-and-Drop Reorder Segments in Track 1
  const handleSegDrop = (targetIdx) => {
    if (draggingSegIdx === null || draggingSegIdx === targetIdx) {
      setDraggingSegIdx(null);
      return;
    }
    const from = draggingSegIdx;
    setDraggingSegIdx(null);
    commitStudio((prev) => {
      const arr = [...prev.segments];
      const [moved] = arr.splice(from, 1);
      arr.splice(targetIdx, 0, moved);
      return { ...prev, segments: arr };
    });
  };

  // Run AI Auto-Track fallback inside Studio
  const handleRunAiAutoTrack = async () => {
    if (!clip?.id || !onAutoTrack) return;
    setIsAutoTracking(true);
    try {
      const freshClip = await onAutoTrack(clip.id);
      if (freshClip && Array.isArray(freshClip.crop_keyframes) && freshClip.crop_keyframes.length > 0) {
        const mappedKfs = freshClip.crop_keyframes.map((k, idx) => ({
          id: `kf_ai_${idx}_${Date.now()}`,
          time: Number(k.time || 0),
          x: Number(k.x ?? 50),
          y: Number(k.y ?? 45),
          zoom: Math.max(1.08, Number(k.zoom ?? 1.15)),
          speaker: k.speaker || 'AI Speaker',
          easing: 'cut',
        }));
        commitStudio((prev) => ({ ...prev, cropMode: 'custom_crop', keyframes: mappedKfs }), { immediateSave: true });
        setSelectedKfId(mappedKfs[0].id);
      }
    } finally {
      setIsAutoTracking(false);
    }
  };

  const handleExportClick = async () => {
    await flushSaveNow(studio);
    onOpenExport?.('clean', true);
  };

  const handleBackClick = async () => {
    await flushSaveNow(studio);
    onBack?.();
  };

  const formatTimecode = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${rem < 10 ? '0' : ''}${rem}.${ms}`;
  };

  const selectedSegment = studio.segments.find((s) => s.id === selectedSegId) || studio.segments[0];
  const selectedKf = studio.keyframes.find((k) => k.id === selectedKfId) || studio.keyframes[Math.max(0, cameraAtPlayhead.idx)];

  const filterCss = `brightness(${(1 + studio.adjustments.brightness).toFixed(2)}) contrast(${studio.adjustments.contrast.toFixed(2)}) saturate(${studio.adjustments.saturation.toFixed(2)})`;
  const transformCss = `${studio.adjustments.flipH ? 'scaleX(-1)' : ''} ${studio.adjustments.rotate ? `rotate(${studio.adjustments.rotate}deg)` : ''}`.trim() || undefined;

  const channelCredit = project?.channel_name || project?.title?.split('|').pop()?.trim() || '';
  const clipWords = useMemo(() => {
    const list = [];
    const tr = project?.transcript_raw || [];
    const minS = Math.min(...studio.segments.map((s) => s.start));
    const maxE = Math.max(...studio.segments.map((s) => s.end));
    for (const seg of tr) {
      if (seg.end < minS || seg.start > maxE) continue;
      if (Array.isArray(seg.words) && seg.words.length > 0) {
        seg.words.forEach((w) => list.push(w));
      } else if (seg.text) {
        list.push({ word: seg.text, start: seg.start, end: seg.end });
      }
    }
    return list.slice(0, 80);
  }, [project?.transcript_raw, studio.segments]);

  return (
    <div className="flex flex-col h-screen bg-[#111113] text-white overflow-hidden select-none font-sans">
      {/* 1. PRO STUDIO TOP BAR */}
      <header className="h-14 shrink-0 bg-[#18181B] border-b border-white/10 px-4 flex items-center justify-between gap-3 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBackClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-full text-xs font-bold transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Clips</span>
          </button>

          <div className="h-5 w-px bg-white/10 shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full bg-signal-orange/20 border border-signal-orange/40 text-light-orange text-[10px] font-extrabold uppercase tracking-wider shrink-0">
              Pro Studio
            </span>
            <input
              type="text"
              value={studio.title}
              onChange={(e) => commitStudio((prev) => ({ ...prev, title: e.target.value }))}
              className="bg-transparent border border-transparent hover:border-white/15 focus:border-signal-orange rounded-lg px-2 py-1 text-xs font-bold text-white outline-none w-48 sm:w-64 truncate"
              title="Rename clip"
            />
          </div>
        </div>

        {/* Center Undo/Redo & Save Status */}
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIdx <= 0}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30 transition cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIdx >= history.length - 1}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30 transition cursor-pointer"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <span className="text-[11px] font-mono text-white/60 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5">
            {saveState === 'saving' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-light-orange" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{saveState === 'dirty' ? 'Syncing' : 'Saved'}</span>
              </>
            )}
          </span>
        </div>

        {/* Right Actions: AI Re-Track + Safe Guides + Export */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSafeGuides((v) => !v)}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
              showSafeGuides
                ? 'bg-white/15 border-white/25 text-white'
                : 'bg-transparent border-white/10 text-white/60 hover:text-white'
            }`}
            title="Toggle Grid & Shorts Safe Zone Guides"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guides</span>
          </button>

          <button
            type="button"
            onClick={handleRunAiAutoTrack}
            disabled={isAutoTracking}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Re-run AI Face Tracker across clip"
          >
            {isAutoTracking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-light-orange" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-light-orange" />
            )}
            <span className="hidden sm:inline">AI Re-Track</span>
          </button>

          <button
            type="button"
            onClick={handleExportClick}
            className="px-4 py-2 rounded-full bg-signal-orange hover:bg-light-orange text-white text-xs font-extrabold flex items-center gap-1.5 shadow-neon-sm transition hover:scale-[1.02] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Export 9:16 HD</span>
          </button>
        </div>
      </header>

      {/* 2. MIDDLE WORKSPACE: LEFT INSPECTOR + CENTER DUAL MONITOR */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT INSPECTOR DOCK */}
        <aside className="w-80 lg:w-[340px] shrink-0 bg-[#18181B] border-r border-white/10 flex flex-col min-h-0">
          {/* Inspector Tabs */}
          <div className="grid grid-cols-3 p-1.5 gap-1 bg-[#121215] border-b border-white/10 text-[11px] font-bold">
            {[
              { id: 'framing', label: 'Frame & KFs', icon: Move },
              { id: 'cuts', label: 'Cut & Speed', icon: Scissors },
              { id: 'color', label: 'Color & Audio', icon: Sliders },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLeftTab(t.id)}
                  className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    leftTab === t.id
                      ? 'bg-[#27272C] text-white border border-white/15 shadow-sm'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${leftTab === t.id ? 'text-light-orange' : ''}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
            {/* TAB 1: FRAMING & KEYFRAMES */}
            {leftTab === 'framing' && (
              <>
                {/* Background Framing Mode */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Framing Style</div>
                  <div className="grid grid-cols-2 p-1 bg-[#111113] rounded-xl border border-white/10 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => commitStudio((p) => ({ ...p, cropMode: 'custom_crop' }))}
                      className={`py-1.5 rounded-lg cursor-pointer transition ${
                        studio.cropMode !== 'blur_fill' ? 'bg-signal-orange text-white' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      9:16 Smart Crop
                    </button>
                    <button
                      type="button"
                      onClick={() => commitStudio((p) => ({ ...p, cropMode: 'blur_fill' }))}
                      className={`py-1.5 rounded-lg cursor-pointer transition ${
                        studio.cropMode === 'blur_fill' ? 'bg-signal-orange text-white' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      Blurred BG Fill
                    </button>
                  </div>
                </div>

                {/* Live Coordinates + 4-Way Pan Pad */}
                <div className="bg-[#202025] border border-white/10 rounded-2xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                      <Move className="w-3.5 h-3.5 text-light-orange" />
                      Pan & Zoom
                    </span>
                    <button
                      type="button"
                      onClick={() => applyCropCoords({ x: 50, y: 45, zoom: 1.15 })}
                      className="text-[10px] text-light-orange hover:underline flex items-center gap-1 cursor-pointer font-bold"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>

                  {/* X Position */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/70">Horizontal (Left / Right)</span>
                      <span className="font-mono font-bold">{cameraAtPlayhead.x.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={cameraAtPlayhead.x}
                      onChange={(e) => applyCropCoords({ x: parseFloat(e.target.value) })}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  {/* Y Position */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/70">Vertical (Up / Down)</span>
                      <span className="font-mono font-bold">{cameraAtPlayhead.y.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={cameraAtPlayhead.y}
                      onChange={(e) => applyCropCoords({ y: parseFloat(e.target.value) })}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  {/* Scale / Zoom */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/70 flex items-center gap-1">
                        <ZoomIn className="w-3 h-3 text-light-orange" /> Scale (Zoom)
                      </span>
                      <span className="font-mono font-bold">{cameraAtPlayhead.zoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.08"
                      max="2.5"
                      step="0.02"
                      value={cameraAtPlayhead.zoom}
                      onChange={(e) => applyCropCoords({ zoom: parseFloat(e.target.value) })}
                      className="w-full cursor-pointer"
                    />
                  </div>

                  {/* Precision D-Pad & Transform */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        onClick={() => applyCropCoords({ x: Math.max(0, cameraAtPlayhead.x - 4) })}
                        className="py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                        title="Nudge Left"
                      ><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        onClick={() => applyCropCoords({ y: Math.max(0, cameraAtPlayhead.y - 5) })}
                        className="py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                        title="Nudge Up"
                      ><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        onClick={() => applyCropCoords({ y: Math.min(100, cameraAtPlayhead.y + 5) })}
                        className="py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                        title="Nudge Down"
                      ><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        onClick={() => applyCropCoords({ x: Math.min(100, cameraAtPlayhead.x + 4) })}
                        className="py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                        title="Nudge Right"
                      ><ChevronRight className="w-3.5 h-3.5" /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          commitStudio((p) => ({
                            ...p,
                            adjustments: { ...p.adjustments, flipH: !p.adjustments.flipH },
                          }))
                        }
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer border ${
                          studio.adjustments.flipH
                            ? 'bg-signal-orange border-signal-orange text-white'
                            : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/15'
                        }`}
                        title="Mirror Horizontally"
                      >
                        <FlipHorizontal className="w-3 h-3" /> Flip
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          commitStudio((p) => ({
                            ...p,
                            adjustments: { ...p.adjustments, rotate: (p.adjustments.rotate + 90) % 360 },
                          }))
                        }
                        className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        title="Rotate 90 degrees"
                      >
                        <RotateCw className="w-3 h-3" /> {studio.adjustments.rotate}°
                      </button>
                    </div>
                  </div>
                </div>

                {/* Keyframe Management */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70 flex items-center gap-1.5">
                      <Diamond className="w-3.5 h-3.5 text-amber-400" />
                      Camera Keyframes ({studio.keyframes.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => upsertKeyframeAt(playheadTl, { easing: 'linear' })}
                      className="px-2.5 py-1 rounded-full bg-signal-orange hover:bg-light-orange text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add KF
                    </button>
                  </div>

                  <label className="flex items-center justify-between text-[11px] bg-[#202025] px-3 py-2 rounded-xl border border-white/10 cursor-pointer">
                    <span className="text-white/80">Auto-create Keyframe on Drag</span>
                    <input
                      type="checkbox"
                      checked={autoKeyframeOnDrag}
                      onChange={(e) => setAutoKeyframeOnDrag(e.target.checked)}
                      className="accent-signal-orange cursor-pointer"
                    />
                  </label>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {studio.keyframes.map((kf, idx) => {
                      const isSel = kf.id === (selectedKf?.id || cameraAtPlayhead.kfId);
                      return (
                        <div
                          key={kf.id}
                          onClick={() => {
                            setSelectedKfId(kf.id);
                            seekTimeline(kf.time, { pauseFirst: true });
                          }}
                          className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 cursor-pointer transition ${
                            isSel
                              ? 'bg-signal-orange/20 border-signal-orange text-white'
                              : 'bg-[#202025] border-white/10 text-white/75 hover:border-white/25'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-bold flex items-center gap-1.5">
                              <Diamond className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{kf.time.toFixed(2)}s</span>
                              <span className="text-[10px] text-white/50 truncate">#{idx + 1}</span>
                            </div>
                            <div className="text-[10px] font-mono text-white/60">
                              X:{kf.x.toFixed(0)}% · Y:{kf.y.toFixed(0)}% · {kf.zoom.toFixed(2)}x
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() =>
                                commitStudio((prev) => ({
                                  ...prev,
                                  keyframes: prev.keyframes.map((item) =>
                                    item.id === kf.id
                                      ? { ...item, easing: item.easing === 'linear' ? 'cut' : 'linear' }
                                      : item
                                  ),
                                }))
                              }
                              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase cursor-pointer border ${
                                kf.easing === 'linear' || kf.easing === 'smooth'
                                  ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                                  : 'bg-white/10 border-white/15 text-white/75'
                              }`}
                              title="Toggle Smooth Glide vs Instant Cut into this keyframe"
                            >
                              {kf.easing === 'linear' || kf.easing === 'smooth' ? 'Smooth' : 'Cut'}
                            </button>

                            {studio.keyframes.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  commitStudio((prev) => ({
                                    ...prev,
                                    keyframes: prev.keyframes.filter((item) => item.id !== kf.id),
                                  }))
                                }
                                className="p-1 text-white/45 hover:text-rose-400 cursor-pointer"
                                title="Delete keyframe"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: CUTS & SEGMENT SPEED */}
            {leftTab === 'cuts' && (
              <>
                <div className="bg-[#202025] border border-white/10 rounded-2xl p-3 space-y-2.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/60">
                    Timeline Split & Trim Tools
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleSplitAtPlayhead}
                      className="py-2 px-3 bg-signal-orange hover:bg-light-orange text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Scissors className="w-3.5 h-3.5" /> Split Here (S)
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedSegment && handleDeleteSegment(selectedSegment.id)}
                      disabled={studio.segments.length <= 1}
                      className="py-2 px-3 bg-white/10 hover:bg-rose-500/20 text-white disabled:opacity-35 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Cut Segment
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleRestoreAllSegments}
                    className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer border border-white/10"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore Full Original Clip Span
                  </button>
                </div>

                {selectedSegment && (
                  <div className="bg-[#202025] border border-white/10 rounded-2xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider">Selected Segment</span>
                      <span className="font-mono text-[10px] text-light-orange font-bold">
                        {formatTimecode(selectedSegment.start)} → {formatTimecode(selectedSegment.end)}
                      </span>
                    </div>

                    {/* Speed Preset Pills */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/70">Playback Speed</span>
                        <span className="font-mono font-bold">{(selectedSegment.speed || 1).toFixed(2)}x</span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                          <button
                            key={spd}
                            type="button"
                            onClick={() =>
                              commitStudio((prev) => ({
                                ...prev,
                                segments: prev.segments.map((s) =>
                                  s.id === selectedSegment.id ? { ...s, speed: spd } : s
                                ),
                              }))
                            }
                            className={`py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer border ${
                              Math.abs((selectedSegment.speed || 1) - spd) < 0.05
                                ? 'bg-signal-orange border-signal-orange text-white'
                                : 'bg-white/5 border-white/10 text-white/75 hover:bg-white/15'
                            }`}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Segment Audio Volume & Mute */}
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/70">Segment Volume</span>
                        <button
                          type="button"
                          onClick={() =>
                            commitStudio((prev) => ({
                              ...prev,
                              segments: prev.segments.map((s) =>
                                s.id === selectedSegment.id ? { ...s, muted: !s.muted } : s
                              ),
                            }))
                          }
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                            selectedSegment.muted ? 'bg-rose-500/25 text-rose-300' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          {selectedSegment.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          {selectedSegment.muted ? 'Muted' : `${Math.round((selectedSegment.volume ?? 1) * 100)}%`}
                        </button>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={selectedSegment.muted ? 0 : selectedSegment.volume ?? 1}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          commitStudio((prev) => ({
                            ...prev,
                            segments: prev.segments.map((s) =>
                              s.id === selectedSegment.id ? { ...s, volume: v, muted: v === 0 } : s
                            ),
                          }));
                        }}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Transcript Jump Helper */}
                {clipWords.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Transcript Jump (Click word to seek)
                    </div>
                    <div className="bg-[#202025] border border-white/10 rounded-2xl p-2.5 max-h-48 overflow-y-auto flex flex-wrap gap-1 text-[11px]">
                      {clipWords.map((w, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            const match = timelineMap.items.find((seg) => w.start >= seg.start && w.start <= seg.end);
                            if (match) {
                              const tl = match.tlStart + (w.start - match.start) / match.speed;
                              seekTimeline(tl, { pauseFirst: true });
                            }
                          }}
                          className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-signal-orange/30 text-white/85 cursor-pointer transition"
                        >
                          {w.word}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 3: COLOR GRADING, AUDIO FADES & OVERLAYS */}
            {leftTab === 'color' && (
              <>
                <div className="space-y-2">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">
                    Filter Presets
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FILTER_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          commitStudio((prev) => ({
                            ...prev,
                            adjustments: {
                              ...prev.adjustments,
                              preset: p.id,
                              brightness: p.brightness,
                              contrast: p.contrast,
                              saturation: p.saturation,
                              sharpen: p.sharpen,
                            },
                          }))
                        }
                        className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left cursor-pointer transition ${
                          studio.adjustments.preset === p.id
                            ? 'bg-signal-orange/25 border-signal-orange text-white'
                            : 'bg-[#202025] border-white/10 text-white/75 hover:border-white/25'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#202025] border border-white/10 rounded-2xl p-3 space-y-2.5">
                  {[
                    { key: 'brightness', label: 'Brightness', min: -0.4, max: 0.4, step: 0.02 },
                    { key: 'contrast', label: 'Contrast', min: 0.5, max: 1.8, step: 0.02 },
                    { key: 'saturation', label: 'Saturation', min: 0.0, max: 2.0, step: 0.05 },
                    { key: 'sharpen', label: 'Sharpen', min: 0.0, max: 1.5, step: 0.05 },
                  ].map((ctrl) => (
                    <div key={ctrl.key} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/75">{ctrl.label}</span>
                        <span className="font-mono font-bold">{studio.adjustments[ctrl.key].toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={studio.adjustments[ctrl.key]}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          commitStudio((prev) => ({
                            ...prev,
                            adjustments: { ...prev.adjustments, preset: 'custom', [ctrl.key]: v },
                          }));
                        }}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                {/* Audio Fades & Credit Watermark */}
                <div className="bg-[#202025] border border-white/10 rounded-2xl p-3 space-y-2.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">
                    Audio Fades & Overlay
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-white/70">Fade In: {studio.fadeIn.toFixed(1)}s</span>
                      <input
                        type="range"
                        min="0"
                        max="2.5"
                        step="0.1"
                        value={studio.fadeIn}
                        onChange={(e) => commitStudio((p) => ({ ...p, fadeIn: parseFloat(e.target.value) }))}
                        className="w-full cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-white/70">Fade Out: {studio.fadeOut.toFixed(1)}s</span>
                      <input
                        type="range"
                        min="0"
                        max="2.5"
                        step="0.1"
                        value={studio.fadeOut}
                        onChange={(e) => commitStudio((p) => ({ ...p, fadeOut: parseFloat(e.target.value) }))}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>
                  <label className="flex items-center justify-between text-[11px] pt-1 cursor-pointer">
                    <span className="text-white/80">Show Channel Credit on Export</span>
                    <input
                      type="checkbox"
                      checked={studio.showCredit}
                      onChange={(e) => commitStudio((p) => ({ ...p, showCredit: e.target.checked }))}
                      className="accent-signal-orange cursor-pointer"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* CENTER VIDEO MONITOR STAGE + OPTIONAL 16:9 SOURCE MINIMAP */}
        <main className="flex-1 flex flex-col items-center justify-center bg-[#0D0D0F] relative min-w-0 min-h-0 p-3 gap-3 overflow-hidden">
          <div className="flex-1 flex items-center justify-center gap-6 w-full min-h-0">
            {/* PRIMARY 9:16 OUTPUT MONITOR */}
            <div className="flex flex-col items-center gap-1.5 h-full max-h-[460px] justify-center">
              <div
                ref={canvasStageRef}
                onMouseDown={startCanvasDrag}
                onTouchStart={startCanvasDrag}
                className={`relative aspect-[9/16] h-full max-h-[430px] bg-black rounded-[24px] overflow-hidden border-2 shadow-2xl ${
                  isDraggingCanvas ? 'border-signal-orange cursor-grabbing' : 'border-white/20 cursor-grab'
                }`}
                title="Drag video left/right/up/down to set framing at playhead"
              >
                {studio.cropMode === 'blur_fill' && (
                  <video
                    src={videoSrc}
                    className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-70 pointer-events-none"
                    muted
                  />
                )}

                <video
                  ref={mainVideoRef}
                  src={videoSrc}
                  preload="auto"
                  playsInline
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    togglePlay();
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onLoadedMetadata={handleLoadedMetadata}
                  className={
                    studio.cropMode === 'blur_fill'
                      ? 'relative z-10 w-full h-full object-contain'
                      : 'absolute z-10 max-w-none max-h-none'
                  }
                  style={
                    studio.cropMode !== 'blur_fill'
                      ? {
                          width: `${(widthRatio * 100 * cameraAtPlayhead.zoom).toFixed(2)}%`,
                          height: `${(100 * cameraAtPlayhead.zoom).toFixed(2)}%`,
                          left: `${(-((widthRatio * cameraAtPlayhead.zoom - 1) * (cameraAtPlayhead.x / 100)) * 100).toFixed(2)}%`,
                          top: `${(-((cameraAtPlayhead.zoom - 1) * (cameraAtPlayhead.y / 100)) * 100).toFixed(2)}%`,
                          objectFit: 'fill',
                          filter: filterCss,
                          transform: transformCss,
                        }
                      : { filter: filterCss, transform: transformCss }
                  }
                />

                {/* Grid & Safe Zone Guides */}
                {showSafeGuides && (
                  <div className="absolute inset-0 z-20 pointer-events-none">
                    <div className="absolute inset-x-0 top-1/3 border-t border-white/20" />
                    <div className="absolute inset-x-0 top-2/3 border-t border-white/20" />
                    <div className="absolute inset-y-0 left-1/3 border-l border-white/20" />
                    <div className="absolute inset-y-0 left-2/3 border-l border-white/20" />
                    {/* Bottom & Right Shorts UI safe margin indicator */}
                    <div className="absolute inset-x-3 bottom-3 h-14 border border-dashed border-amber-300/35 rounded-xl flex items-end justify-center pb-1">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-amber-200/60">Shorts UI Zone</span>
                    </div>
                  </div>
                )}

                {/* HUD Overlay */}
                <div className="absolute top-2.5 left-2.5 right-2.5 z-25 pointer-events-none flex items-center justify-between text-[9px] font-bold">
                  <span className="bg-black/70 backdrop-blur px-2 py-0.5 rounded-full border border-white/15 font-mono">
                    X:{cameraAtPlayhead.x.toFixed(0)}% Y:{cameraAtPlayhead.y.toFixed(0)}% · {cameraAtPlayhead.zoom.toFixed(2)}x
                  </span>
                  {studio.showCredit && channelCredit && (
                    <span className="bg-white/90 text-ink-black px-2 py-0.5 rounded-full truncate max-w-[110px]">
                      {channelCredit}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* OPTIONAL 16:9 FULL SOURCE MINIMAP WITH DRAGGABLE 9:16 VIEWPORT */}
            {showSourceMinimap && (
              <div className="hidden xl:flex flex-col gap-2 w-72 bg-[#18181B] border border-white/10 rounded-2xl p-3 shrink-0">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/70">
                  <span>Full 16:9 Scene (Drag Crop)</span>
                  <button
                    type="button"
                    onClick={() => setShowSourceMinimap(false)}
                    className="text-white/40 hover:text-white cursor-pointer"
                    title="Hide full-scene minimap"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  ref={miniStageRef}
                  onMouseDown={startMinimapDrag}
                  onTouchStart={startMinimapDrag}
                  className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-white/15 cursor-move"
                  title="Drag the orange 9:16 window directly onto any speaker!"
                >
                  <video
                    ref={miniVideoRef}
                    src={videoSrc}
                    muted
                    playsInline
                    className="w-full h-full object-fill opacity-75 pointer-events-none"
                  />
                  {/* Live 9:16 Crop Viewport Rectangle */}
                  <div
                    className="absolute border-2 border-signal-orange bg-signal-orange/15 rounded shadow-lg pointer-events-none"
                    style={{
                      width: `${(100 / cameraAtPlayhead.zoom) * (9 / 16) * (9 / 16)}%`,
                      height: `${100 / cameraAtPlayhead.zoom}%`,
                      left: `${((100 - (100 / cameraAtPlayhead.zoom) * (9 / 16) * (9 / 16)) * (cameraAtPlayhead.x / 100)).toFixed(2)}%`,
                      top: `${((100 - 100 / cameraAtPlayhead.zoom) * (cameraAtPlayhead.y / 100)).toFixed(2)}%`,
                    }}
                  />
                </div>

                <p className="text-[10px] text-white/50 leading-relaxed">
                  Tip: Drag either the main 9:16 video or the orange rectangle above left, right, up, or down to reframe any speaker cleanly.
                </p>
              </div>
            )}

            {!showSourceMinimap && (
              <button
                type="button"
                onClick={() => setShowSourceMinimap(true)}
                className="hidden xl:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white/75 self-start cursor-pointer"
              >
                <Eye className="w-3 h-3" /> Show Scene Map
              </button>
            )}
          </div>

          {/* PRO TRANSPORT BAR */}
          <div className="w-full max-w-3xl bg-[#18181B] border border-white/10 rounded-full px-4 py-1.5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => seekTimeline(0, { pauseFirst: true })}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
                title="Jump to start"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => seekTimeline(playheadTl - 0.033, { pauseFirst: true })}
                className="px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-mono text-white/80 cursor-pointer"
                title="-1 Frame (Left Arrow)"
              >
                -1f
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-signal-orange hover:bg-light-orange text-white flex items-center justify-center shadow cursor-pointer"
                title="Play / Pause (Space)"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={() => seekTimeline(playheadTl + 0.033, { pauseFirst: true })}
                className="px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-mono text-white/80 cursor-pointer"
                title="+1 Frame (Right Arrow)"
              >
                +1f
              </button>
              <button
                type="button"
                onClick={() => seekTimeline(timelineMap.totalDur, { pauseFirst: true })}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white cursor-pointer"
                title="Jump to end"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="font-mono text-xs font-extrabold tracking-tight">
              <span className="text-light-orange">{formatTimecode(playheadTl)}</span>
              <span className="text-white/35 mx-1">/</span>
              <span className="text-white/75">{formatTimecode(timelineMap.totalDur)}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSplitAtPlayhead}
                className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-signal-orange text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                title="Split clip at playhead (S)"
              >
                <Scissors className="w-3 h-3" /> Split
              </button>
              <button
                type="button"
                onClick={() => upsertKeyframeAt(playheadTl, { easing: 'linear' })}
                className="px-2.5 py-1 rounded-full bg-amber-400/20 hover:bg-amber-400/35 border border-amber-400/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                title="Add/Update Keyframe at playhead (K)"
              >
                <Diamond className="w-3 h-3" /> +Keyframe
              </button>
              <button
                type="button"
                onClick={() => setLoopClip((v) => !v)}
                className={`p-1.5 rounded-full cursor-pointer ${loopClip ? 'text-light-orange bg-white/10' : 'text-white/45 hover:text-white'}`}
                title="Toggle Loop Playback"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* 3. BOTTOM CAPCUT-STYLE MULTI-TRACK TIMELINE */}
      <section className="h-56 shrink-0 bg-[#151518] border-t border-white/10 flex flex-col select-none z-20">
        {/* Timeline Toolbar */}
        <div className="h-9 px-4 bg-[#1B1B1F] border-b border-white/10 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-white/50 font-bold uppercase tracking-wider text-[10px]">
              Multi-Track Timeline ({studio.segments.length} seg{studio.segments.length > 1 ? 's' : ''})
            </span>
            <span className="text-white/25">|</span>
            <span className="text-[10px] text-white/45 hidden sm:inline">
              Shortcuts: Space Play/Pause · S Split · K Keyframe · ←/→ Step · Drag ◆ Diamonds or Clips
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/50">Zoom</span>
            <input
              type="range"
              min="1"
              max="4"
              step="0.25"
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
              className="w-24 cursor-pointer"
            />
            <span className="font-mono text-[10px] text-white/75 w-7">{timelineZoom}x</span>
          </div>
        </div>

        {/* Scrollable Multi-Track Canvas */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Track Labels Column */}
          <div className="w-24 shrink-0 bg-[#18181B] border-r border-white/10 flex flex-col text-[10px] font-bold text-white/60">
            <div className="h-6 border-b border-white/10 px-2.5 flex items-center">Time</div>
            <div className="h-10 border-b border-white/10 px-2.5 flex items-center gap-1.5 text-amber-300">
              <Diamond className="w-3 h-3 shrink-0" /> KFs
            </div>
            <div className="h-14 border-b border-white/10 px-2.5 flex items-center gap-1.5 text-white">
              <Film className="w-3 h-3 text-light-orange shrink-0" /> Video V1
            </div>
            <div className="flex-1 px-2.5 flex items-center gap-1.5 text-emerald-300">
              <Volume2 className="w-3 h-3 shrink-0" /> Audio A1
            </div>
          </div>

          {/* Tracks Scroll Container */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#111113]">
            <div
              ref={timelineTrackRef}
              onMouseDown={handleTimelineScrub}
              onTouchStart={handleTimelineScrub}
              className="relative h-full cursor-pointer"
              style={{ width: `${timelineZoom * 100}%`, minWidth: '100%' }}
            >
              {/* RULER TICKS */}
              <div className="h-6 border-b border-white/10 bg-[#17171B] relative">
                {Array.from({ length: Math.min(30, Math.max(4, Math.ceil(timelineMap.totalDur / 2))) + 1 }).map((_, idx, arr) => {
                  const pct = (idx / (arr.length - 1)) * 100;
                  const tVal = (pct / 100) * timelineMap.totalDur;
                  return (
                    <div key={idx} className="absolute top-0 bottom-0 flex flex-col justify-between" style={{ left: `${pct}%` }}>
                      <span className="text-[9px] font-mono text-white/45 -ml-2 px-0.5">{tVal.toFixed(0)}s</span>
                      <div className="w-px h-1.5 bg-white/25" />
                    </div>
                  );
                })}
              </div>

              {/* TRACK 2: CAMERA KEYFRAMES (◆ Diamonds, draggable!) */}
              <div className="h-10 border-b border-white/10 bg-[#16161A] relative flex items-center">
                {studio.keyframes.map((kf) => {
                  const leftPct = Math.max(0, Math.min(100, (kf.time / timelineMap.totalDur) * 100));
                  const isSel = kf.id === (selectedKf?.id || cameraAtPlayhead.kfId);
                  return (
                    <div
                      key={kf.id}
                      onMouseDown={(e) => startKeyframeDrag(e, kf.id)}
                      onTouchStart={(e) => startKeyframeDrag(e, kf.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedKfId(kf.id);
                        seekTimeline(kf.time, { pauseFirst: true });
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 cursor-ew-resize group p-1.5"
                      style={{ left: `${leftPct}%` }}
                      title={`t=${kf.time.toFixed(2)}s | X=${kf.x.toFixed(0)}% Y=${kf.y.toFixed(0)}% ${kf.zoom.toFixed(2)}x (Drag horizontally)`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rotate-45 border transition-transform ${
                          isSel
                            ? 'bg-signal-orange border-white scale-125 shadow-neon-sm'
                            : 'bg-amber-400 border-black group-hover:scale-125'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* TRACK 1: VIDEO SEGMENTS (V1 - Draggable Trim, Reorder & Delete) */}
              <div className="h-14 border-b border-white/10 bg-[#131316] relative flex items-center px-0.5 gap-0.5">
                {timelineMap.items.map((seg, i) => {
                  const segWidthPct = (seg.tlDur / timelineMap.totalDur) * 100;
                  const isSel = seg.id === selectedSegment?.id;
                  return (
                    <div
                      key={seg.id}
                      draggable
                      onDragStart={() => setDraggingSegIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleSegDrop(i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSegId(seg.id);
                        seekTimeline(seg.tlStart + 0.01, { pauseFirst: true });
                      }}
                      style={{ width: `${segWidthPct}%` }}
                      className={`h-11 rounded-lg relative flex items-center justify-between px-2.5 overflow-hidden border transition cursor-pointer group ${
                        isSel
                          ? 'bg-gradient-to-r from-[#2D1A12] to-[#261E1B] border-signal-orange shadow-sm'
                          : 'bg-[#232329] hover:bg-[#2A2A32] border-white/15'
                      }`}
                    >
                      {/* Left Trim Handle */}
                      <div
                        onMouseDown={(e) => startSegTrim(e, i, 'start')}
                        className="absolute left-0 top-0 bottom-0 w-2 bg-white/15 hover:bg-signal-orange cursor-ew-resize z-20"
                        title="Drag to trim segment start"
                      />

                      <div className="min-w-0 pl-1.5">
                        <div className="text-[10px] font-bold text-white truncate">
                          Seg {i + 1} · {seg.tlDur.toFixed(1)}s
                        </div>
                        <div className="text-[9px] font-mono text-white/50 truncate">
                          {formatTimecode(seg.start)}–{formatTimecode(seg.end)} {seg.speed !== 1 ? `(${seg.speed}x)` : ''}
                        </div>
                      </div>

                      {studio.segments.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSegment(seg.id);
                          }}
                          className="p-1 rounded bg-black/40 text-white/50 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition cursor-pointer z-20"
                          title="Delete this cut segment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}

                      {/* Right Trim Handle */}
                      <div
                        onMouseDown={(e) => startSegTrim(e, i, 'end')}
                        className="absolute right-0 top-0 bottom-0 w-2 bg-white/15 hover:bg-signal-orange cursor-ew-resize z-20"
                        title="Drag to trim segment end"
                      />
                    </div>
                  );
                })}
              </div>

              {/* TRACK 3: AUDIO WAVEFORM */}
              <div className="h-[calc(100%-7.5rem)] bg-[#121215] relative flex items-center px-1 gap-0.5">
                {timelineMap.items.map((seg) => {
                  const segWidthPct = (seg.tlDur / timelineMap.totalDur) * 100;
                  return (
                    <div
                      key={`aud_${seg.id}`}
                      style={{ width: `${segWidthPct}%` }}
                      className={`h-8 rounded-lg border flex items-center gap-[2px] px-2 overflow-hidden ${
                        seg.muted
                          ? 'bg-rose-950/30 border-rose-500/30 opacity-45'
                          : 'bg-emerald-950/35 border-emerald-500/30'
                      }`}
                    >
                      {Array.from({ length: Math.max(8, Math.round(segWidthPct * 0.7)) }).map((_, b) => {
                        const h = 25 + ((b * 37 + Math.round(seg.start)) % 65);
                        return (
                          <div
                            key={b}
                            className={`flex-1 rounded-full ${seg.muted ? 'bg-rose-400/40' : 'bg-emerald-400/70'}`}
                            style={{ height: `${h}%` }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* MASTER PLAYHEAD NEEDLE */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-signal-orange pointer-events-none z-30 shadow-[0_0_8px_rgba(207,69,0,0.8)]"
                style={{ left: `${Math.max(0, Math.min(100, (playheadTl / timelineMap.totalDur) * 100))}%` }}
              >
                <div className="w-3 h-3 bg-signal-orange border-2 border-white rounded-sm -ml-[5px] -mt-0.5 rotate-45" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
