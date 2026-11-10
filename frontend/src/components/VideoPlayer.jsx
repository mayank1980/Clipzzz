import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Crop,
  Download,
  FileText,
  Sliders,
  Sparkles,
  Maximize2,
  Tv,
  Youtube,
  Smartphone,
  Scissors,
  ZoomIn,
  Loader2,
  Zap,
  Film,
  Eye,
  EyeOff,
  Edit2,
  Check,
  X,
  Trash2,
  Move,
  AlertCircle,
} from 'lucide-react';
import { api, API_BASE_URL } from '../services/api';

export default function VideoPlayer({
  project,
  selectedClip,
  aspectRatio,
  onToggleAspectRatio,
  cropSettings,
  onChangeCrop,
  captionStyle,
  onChangeCaptionStyle,
  currentTime,
  onTimeUpdate,
  onSeek,
  onUpdateClipBounds,
  onOpenExport,
  onOpenShortsKit,
  onDeleteClip,
  isCropInspectorOpen,
  onToggleCropInspector,
  onAutoTrack,
  onUpdateChannelName,
  playbackRate: externalPlaybackRate,
  onChangePlaybackRate,
}) {
  const videoRef = useRef(null);
  const splitVideoRefs = useRef([]);

  const computePanelCropBox = (rawX, rawY, mode = 'solo', zoomVal = 1.15) => {
    const SRC_AR = 16.0 / 9.0;
    const effZoom = Math.max(1.08, Math.min(2.5, Number(zoomVal) || 1.15));
    const zoomScale = effZoom / 1.15;
    let wf, hf;

    if (mode === 'split_2') {
      const panelAr = 9.0 / 8.0;
      hf = Math.max(0.35, Math.min(0.94, 0.80 / zoomScale));
      wf = Math.max(0.24, Math.min(0.95, (hf * panelAr) / SRC_AR));
    } else if (mode === 'split_3') {
      const panelAr = 1080.0 / 640.0;
      wf = Math.max(0.24, Math.min(0.88, 0.45 / zoomScale));
      hf = Math.max(0.22, Math.min(0.95, (wf * SRC_AR) / panelAr));
      wf = (hf * panelAr) / SRC_AR;
    } else if (mode === 'split_4') {
      const panelAr = 1080.0 / 480.0;
      wf = Math.max(0.24, Math.min(0.88, 0.42 / zoomScale));
      hf = Math.max(0.18, Math.min(0.95, (wf * SRC_AR) / panelAr));
      wf = (hf * panelAr) / SRC_AR;
    } else {
      hf = 1.0 / effZoom;
      wf = (hf * (9.0 / 16.0)) / SRC_AR;
    }

    const spanX = Math.max(0.001, 1.0 - wf);
    const normX = Math.max(0.0, Math.min(1.0, Number(rawX) / 100.0));
    const cx = Math.max(0.0, Math.min(100.0, ((normX - wf / 2.0) / spanX) * 100.0));

    let cy;
    if (mode === 'solo') {
      cy = Math.max(25.0, Math.min(45.0, Number(rawY)));
    } else {
      const spanY = Math.max(0.001, 1.0 - hf);
      const targetY = Math.min(0.92, (Number(rawY) + Math.min(6.0, hf * 10.0)) / 100.0);
      cy = Math.max(0.0, Math.min(100.0, ((targetY - hf / 2.0) / spanY) * 100.0));
    }
    return { x: cx, y: cy, wf, hf };
  };

  const channelCredit = useMemo(() => {
    if (project?.channel_name && project.channel_name.trim()) {
      return project.channel_name.trim();
    }
    const t = project?.title || '';
    if (!t) return 'Original Creator';
    const cleanT = t.replace(/#\w+/g, '').trim();
    const parts = cleanT.split(/[|•\-_]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 1].replace(/^(?:w\/|ft\.|featuring)\s*/i, '').trim();
    }
    return parts[0] || 'Original Creator';
  }, [project?.channel_name, project?.title]);

  // Video source URL
  const videoSrc = project?.video_file
    ? project.video_file.startsWith('http')
      ? project.video_file
      : `${API_BASE_URL}${project.video_file.startsWith('/') ? '' : '/'}${project.video_file}`
    : '';

  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [channelInput, setChannelInput] = useState('');

  const handleStartEditChannel = () => {
    setChannelInput(channelCredit);
    setIsEditingChannel(true);
  };

  const handleSaveChannel = () => {
    const trimmed = channelInput.trim();
    if (trimmed && onUpdateChannelName) {
      onUpdateChannelName(trimmed);
    }
    setIsEditingChannel(false);
  };
  const trackRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hideCaptionsPreview, setHideCaptionsPreview] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [localFrameTime, setLocalFrameTime] = useState(0);
  const [internalPlaybackRate, setInternalPlaybackRate] = useState(1.0);
  const playbackRate = externalPlaybackRate !== undefined ? externalPlaybackRate : internalPlaybackRate;
  const setPlaybackRate = onChangePlaybackRate || setInternalPlaybackRate;
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [isVideoError, setIsVideoError] = useState(false);

  useEffect(() => {
    setIsVideoError(false);
  }, [videoSrc]);

  // Drag-and-drop subtitle positioning state
  const phoneContainerRef = useRef(null);
  const landscapeContainerRef = useRef(null);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);
  const [dragYPercent, setDragYPercent] = useState(null);
  const [dragXPercent, setDragXPercent] = useState(null);

  const activeCaptionY = dragYPercent !== null
    ? dragYPercent
    : (captionStyle?.yPercent ?? (captionStyle?.position === 'top' ? 20 : captionStyle?.position === 'center' ? 50 : 75));

  const activeCaptionX = dragXPercent !== null
    ? dragXPercent
    : (captionStyle?.xPercent ?? 50);

  const startCaptionDrag = (e, containerRef) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingCaption(true);

    const container = containerRef.current;
    if (!container) return;

    const onMove = (moveEvent) => {
      const clientY = moveEvent.clientY ?? moveEvent.touches?.[0]?.clientY;
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientY === undefined || clientX === undefined) return;

      const rect = container.getBoundingClientRect();
      const newY = Math.max(10, Math.min(88, ((clientY - rect.top) / rect.height) * 100));
      const newX = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));

      setDragYPercent(Math.round(newY));
      setDragXPercent(Math.round(newX));
    };

    const onEnd = (endEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);

      setIsDraggingCaption(false);

      const clientY = endEvent.clientY ?? endEvent.changedTouches?.[0]?.clientY;
      const clientX = endEvent.clientX ?? endEvent.changedTouches?.[0]?.clientX;

      let finalY = activeCaptionY;
      let finalX = activeCaptionX;

      if (clientY !== undefined && clientX !== undefined) {
        const rect = container.getBoundingClientRect();
        finalY = Math.max(10, Math.min(88, ((clientY - rect.top) / rect.height) * 100));
        finalX = Math.max(15, Math.min(85, ((clientX - rect.left) / rect.width) * 100));
      }

      const roundedY = Math.round(finalY);
      const roundedX = Math.round(finalX);

      setDragYPercent(null);
      setDragXPercent(null);

      onChangeCaptionStyle?.({
        yPercent: roundedY,
        xPercent: roundedX,
        position: 'custom',
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  };

  const handlePlaybackRateChange = (newRate) => {
    const rate = Math.max(0.1, Math.min(2.0, parseFloat(newRate) || 1.0));
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      videoRef.current.defaultPlaybackRate = rate;
    }
  };

  // Keep HTML5 video playbackRate strictly synchronized with user's selected speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.defaultPlaybackRate = playbackRate;
    }
  }, [playbackRate, videoSrc, isPlaying]);

  const handleRunAutoTrack = async () => {
    if (!onAutoTrack) return;
    setIsAutoTracking(true);
    try {
      await onAutoTrack();
    } finally {
      setIsAutoTracking(false);
    }
  };

  // Synchronize play state
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.defaultPlaybackRate = playbackRate;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Playback error caught:', err);
          setIsPlaying(false);
        });
      }
    }
  };

  const syncSplitVideos = () => {
    const main = videoRef.current;
    if (!main) return;
    splitVideoRefs.current.forEach((sv) => {
      if (!sv) return;
      if (Math.abs((sv.currentTime || 0) - main.currentTime) > 0.12) {
        try {
          sv.currentTime = main.currentTime;
        } catch (e) {}
      }
      if (sv.playbackRate !== main.playbackRate) {
        sv.playbackRate = main.playbackRate;
      }
      if (!main.paused && sv.paused) {
        sv.play().catch(() => {});
      } else if (main.paused && !sv.paused) {
        sv.pause();
      }
    });
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setLocalFrameTime(curr);
    onTimeUpdate(curr);
    syncSplitVideos();

    // Loop within clip bounds if a clip is active
    if (selectedClip) {
      if (curr >= selectedClip.end_time) {
        videoRef.current.currentTime = selectedClip.start_time;
        videoRef.current.playbackRate = playbackRate;
        syncSplitVideos();
      }
    }
  };

  // 60 FPS direct-frame sync loop: eliminates React render lag so captions match audio instantly
  useEffect(() => {
    let animId;
    let lastParentUpdate = 0;

    const syncLoop = () => {
      if (videoRef.current && !videoRef.current.paused) {
        const curr = videoRef.current.currentTime;

        // 1. Direct local frame update for 60 FPS zero-latency caption highlighting
        setLocalFrameTime(curr);

        // 2. Loop within clip bounds if a clip is active
        if (selectedClip && curr >= selectedClip.end_time) {
          videoRef.current.currentTime = selectedClip.start_time;
          videoRef.current.playbackRate = playbackRate;
        }

        // Keep split-screen video clones locked frame-for-frame
        syncSplitVideos();

        // 3. Throttle parent App.jsx re-renders to ~12 FPS (every 80ms) so CPU and UI thread stay 100% smooth
        const now = performance.now();
        if (now - lastParentUpdate >= 80) {
          lastParentUpdate = now;
          onTimeUpdate(curr);
        }
      }
      animId = requestAnimationFrame(syncLoop);
    };

    if (isPlaying) {
      animId = requestAnimationFrame(syncLoop);
    } else {
      syncSplitVideos();
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, selectedClip?.id, selectedClip?.start_time, selectedClip?.end_time, playbackRate]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = playbackRate;
    videoRef.current.defaultPlaybackRate = playbackRate;
    setDuration(videoRef.current.duration || project?.duration || 0);
    const target = (typeof currentTime === 'number' && !isNaN(currentTime) && currentTime > 0)
      ? currentTime
      : (selectedClip?.start_time || 0);
    if (Math.abs(videoRef.current.currentTime - target) > 0.2) {
      videoRef.current.currentTime = target;
      setLocalFrameTime(target);
    }
  };

  // Jump to clip start when selected clip changes
  useEffect(() => {
    if (videoRef.current && selectedClip) {
      videoRef.current.currentTime = selectedClip.start_time;
      setLocalFrameTime(selectedClip.start_time);
    }
  }, [selectedClip?.id, selectedClip?.start_time]);

  // Synchronize hardware video element when external seek or aspect ratio toggle happens
  useEffect(() => {
    if (videoRef.current && typeof currentTime === 'number' && !isNaN(currentTime)) {
      const diff = Math.abs(videoRef.current.currentTime - currentTime);
      if (diff > 0.2) {
        videoRef.current.currentTime = currentTime;
        setLocalFrameTime(currentTime);
      }
    }
  }, [currentTime, aspectRatio, selectedClip?.id]);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const formatSec = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Exact hardware playback time directly from video element (zero React delay)
  const exactCurrentTime = videoRef.current
    ? videoRef.current.currentTime
    : (localFrameTime || currentTime || 0);

  // Exact 1:1 mouth-synced playback time (no artificial future offset)
  const userOffset = captionStyle?.syncOffset || 0.0;
  const effectiveTime = exactCurrentTime + userOffset;

  // Format transcript into captions.js plain format [{ word, startTime, endTime }]
  const formattedCaptions = useMemo(() => {
    const list = [];
    if (!project?.transcript_raw) return list;
    for (const seg of project.transcript_raw) {
      if (seg.words && Array.isArray(seg.words) && seg.words.length > 0) {
        for (const w of seg.words) {
          const st = Number(w.start);
          const et = Number(w.end);
          if (!isNaN(st) && !isNaN(et) && et > st) {
            list.push({
              word: String(w.word || ''),
              startTime: st,
              endTime: et,
            });
          }
        }
      } else if (seg.text) {
        const words = seg.text.split(/\s+/).filter(Boolean);
        const dur = Math.max(0.2, (seg.end - seg.start) / Math.max(1, words.length));
        words.forEach((w, i) => {
          list.push({
            word: w,
            startTime: Number(seg.start + (i * dur)),
            endTime: Number(seg.start + ((i + 1) * dur)),
          });
        });
      }
    }
    return list;
  }, [project?.transcript_raw]);

  const presetName = captionStyle?.preset || captionStyle?.templateId || 'Karaoke';

  // Ensure any lingering duplicate imperative canvases (e.g. from hot-reload) are purged
  useEffect(() => {
    if (!videoRef.current) return;
    try {
      const container = videoRef.current.parentElement;
      if (container) {
        const canvases = container.querySelectorAll('.konvajs-content, canvas');
        canvases.forEach((c) => c.remove());
      }
    } catch (e) {}
  }, [videoSrc]);

  // Smart Caption Engine: Compiles transcript words into balanced, natural spoken cues
  const smartCues = useMemo(() => {
    if (!project?.transcript_raw || project.transcript_raw.length === 0) return [];

    // 1. Gather all words inside clip boundaries (or full video if no clip)
    const clipStart = selectedClip ? Number(selectedClip.start_time) || 0 : 0;
    const clipEnd = selectedClip ? Number(selectedClip.end_time) || 999999 : 999999;

    const words = [];
    // Priority 1: Check project.transcript_raw first so creator's live manual edits preview instantly!
    if (project?.transcript_raw && Array.isArray(project.transcript_raw) && project.transcript_raw.length > 0) {
      for (const seg of project.transcript_raw) {
        if (seg.end < (clipStart - 0.05) || seg.start > (clipEnd + 0.05)) continue;

        // Check whether seg.words matches seg.text (handles manual edits like "hum" -> "hmm")
        const textTokens = String(seg.text || '').trim().split(/\s+/).filter(Boolean);
        const hasMatchingWords = seg.words && Array.isArray(seg.words) && seg.words.length === textTokens.length &&
          seg.words.every((w, idx) => String(w.word || '').trim().toLowerCase() === textTokens[idx].toLowerCase());

        if (hasMatchingWords) {
          for (const w of seg.words) {
            const st = Number(w.start);
            const et = Number(w.end);
            if (!isNaN(st) && !isNaN(et) && et > st) {
              if (et > (clipStart - 0.05) && st < (clipEnd + 0.05)) {
                words.push({ word: String(w.word || '').trim(), start: st, end: et });
              }
            }
          }
        } else if (textTokens.length > 0) {
          // Manual edit occurred: Rebuild word timings from textTokens across segment duration
          const segStart = Number(seg.start) || 0;
          const segEnd = Number(seg.end) || (segStart + 1.0);
          const dur = Math.max(0.15, (segEnd - segStart) / textTokens.length);
          textTokens.forEach((tok, i) => {
            const st = Number((segStart + (i * dur)).toFixed(2));
            const et = Number((segStart + ((i + 1) * dur)).toFixed(2));
            if (et > (clipStart - 0.05) && st < (clipEnd + 0.05)) {
              words.push({ word: tok.trim(), start: st, end: et });
            }
          });
        }
      }
    }

    // Priority 2: Fallback to clip's aligned_words if transcript_raw yielded no words in clip range
    if (words.length === 0) {
      const alignedWords = selectedClip?.caption_style?.aligned_words;
      if (alignedWords && Array.isArray(alignedWords) && alignedWords.length > 0) {
        for (const w of alignedWords) {
          const st = Number(w.start);
          const et = Number(w.end);
          if (!isNaN(st) && !isNaN(et) && et > st) {
            words.push({ word: String(w.word || '').trim(), start: st, end: et });
          }
        }
      }
    }

    words.sort((a, b) => a.start - b.start);
    if (words.length === 0) return [];

    // 2. Build Smart Pacing Cues: 4-6 words, breaking on natural breath pauses (>=0.28s) or punctuation
    const cues = [];
    let currentCueWords = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      currentCueWords.push(w);

      const isLast = (i === words.length - 1);
      const hasPause = !isLast && ((words[i + 1].start - w.end) >= 0.28);
      const hasPunctuation = /[.?!,;:]$/.test(w.word);
      const isTargetSize = currentCueWords.length >= 5;
      const isMaxSize = currentCueWords.length >= 7;

      if (isLast || isMaxSize || (isTargetSize && (hasPause || hasPunctuation)) || (hasPause && currentCueWords.length >= 3)) {
        const cueStart = currentCueWords[0].start;
        const cueEnd = currentCueWords[currentCueWords.length - 1].end;
        const nextWordStart = !isLast ? words[i + 1].start : (cueEnd + 1.0);
        
        // Display end smoothly bridges natural breath pause into next phrase without sudden black gap
        const displayEnd = Math.min(nextWordStart, cueEnd + 0.45);

        cues.push({
          id: `cue_${cues.length}_${cueStart.toFixed(2)}`,
          start: cueStart,
          end: cueEnd,
          displayEnd: displayEnd,
          words: currentCueWords,
          text: currentCueWords.map((cw) => cw.word).join(' '),
        });
        currentCueWords = [];
      }
    }

    return cues;
  }, [project?.transcript_raw, selectedClip?.id, selectedClip?.start_time, selectedClip?.end_time, selectedClip?.caption_style?.aligned_words]);

  // Current active smart cue: strictly linked with audio playback time
  const activeCue = useMemo(() => {
    if (!smartCues || smartCues.length === 0) return null;

    // 1. Direct active cue: current time is within [start, displayEnd)
    const current = smartCues.find(
      (c) => effectiveTime >= (c.start - 0.05) && effectiveTime < c.displayEnd
    );
    if (current) return current;

    // 2. Clip start edge: bind immediately to the very first cue of the clip
    if (selectedClip && effectiveTime <= (selectedClip.start_time + 0.35)) {
      return smartCues[0];
    }

    // 3. Natural speech pause between sentences: bridge seamlessly
    for (let i = 0; i < smartCues.length; i++) {
      if (effectiveTime < smartCues[i].start) {
        if (i > 0 && (effectiveTime - smartCues[i - 1].end) < 0.35) {
          return smartCues[i - 1];
        }
        return (smartCues[i].start - effectiveTime) < 0.4 ? smartCues[i] : (i > 0 ? smartCues[i - 1] : smartCues[i]);
      }
    }

    return smartCues[smartCues.length - 1];
  }, [smartCues, effectiveTime, selectedClip?.start_time]);

  // Backward compatible activeSegment reference
  const activeSegment = activeCue;

  // Time within current clip
  const clipCurrentTime = selectedClip
    ? Math.max(0, exactCurrentTime - selectedClip.start_time)
    : exactCurrentTime;
  const clipTotalDuration = selectedClip
    ? selectedClip.duration
    : duration || 1;

  // Dynamic Real-Time Keyframe Camera Tracking (Multi-Speaker Framing & Vertical Split Screen)
  let activeCropX = cropSettings?.x ?? 50.0;
  let activeCropY = cropSettings?.y ?? 45.0;
  let activeCropZoom = cropSettings?.zoom ?? 1.0;
  let activeSpeakerLabel = '';
  let activeKf = null;

  const keyframes = Array.isArray(cropSettings?.keyframes) && cropSettings.keyframes.length > 0
    ? [...cropSettings.keyframes].sort((a, b) => (a.time || 0) - (b.time || 0))
    : null;

  if (cropSettings?.mode === 'manual_crop') {
    activeCropX = cropSettings?.x ?? 50.0;
    activeCropY = cropSettings?.y ?? 45.0;
    activeCropZoom = cropSettings?.zoom ?? 1.0;
    activeSpeakerLabel = 'Manual Framing';
  } else if (keyframes && keyframes.length > 0) {
    if (keyframes.length === 1) {
      activeKf = keyframes[0];
      activeCropX = activeKf.x ?? activeCropX;
      activeCropY = activeKf.y ?? activeCropY;
      activeCropZoom = activeKf.zoom ?? activeCropZoom;
      activeSpeakerLabel = activeKf.speaker || 'Speaker Focus';
    } else {
      let curIdx = 0;
      for (let i = 0; i < keyframes.length; i++) {
        if (keyframes[i].time <= clipCurrentTime) {
          curIdx = i;
        } else {
          break;
        }
      }

      activeKf = keyframes[curIdx];
      // Clean, instantaneous broadcast cuts on speaker turns & multi-person splits
      activeCropX = activeKf.x;
      activeCropY = activeKf.y;
      activeCropZoom = activeKf.zoom || 1.0;
      activeSpeakerLabel = activeKf.speaker || 'Speaker Focus';
    }
  } else {
    activeCropX = cropSettings?.x ?? 50.0;
    activeCropY = cropSettings?.y ?? 45.0;
    activeCropZoom = cropSettings?.zoom ?? 1.0;
    activeSpeakerLabel = 'Speaker Focus';
  }

  // User manual zoom slider overrides keyframe base zoom proportionally when adjusted
  const zoom = Math.max(1.0, Math.min(2.5, (cropSettings?.zoom ?? activeCropZoom) || 1.0));
  const effectiveZoom = Math.max(1.08, zoom);
  const cropX = Math.max(0.0, Math.min(100.0, activeCropX));
  const cropY = Math.max(0.0, Math.min(100.0, activeCropY));
  const cropMode = cropSettings?.mode || 'custom_crop';

  const activeKfMode = String(activeKf?.mode || 'solo');
  const isSplitScreen =
    cropMode === 'custom_crop' &&
    activeKfMode.startsWith('split_') &&
    Array.isArray(activeKf?.panels) &&
    activeKf.panels.length >= 2;

  const splitPanels = isSplitScreen
    ? activeKf.panels.slice(0, 4).map((p) =>
        p.raw_x !== undefined && p.raw_y !== undefined
          ? computePanelCropBox(p.raw_x, p.raw_y, activeKfMode, effectiveZoom)
          : { x: p.x ?? 50, y: p.y ?? 50, wf: p.wf ?? 0.45, hf: p.hf ?? 0.5 }
      )
    : [];

  useEffect(() => {
    if (isSplitScreen) {
      syncSplitVideos();
    }
  }, [isSplitScreen, splitPanels.length]);

  // Format words with all 26 captions.js animations and seamless highlight transitions
  const renderSubtitleWords = () => {
    if (!activeCue) return null;

    const words = activeCue.words || [];
    const animation = (captionStyle?.animation || 'bounce').toLowerCase();
    const highlightColor = captionStyle?.highlightColor || '#bef264';
    const textColor = captionStyle?.textColor || '#ffffff';

    if (!words || words.length === 0) {
      return (
        <span
          className="leading-snug block line-clamp-3 text-center"
          style={{ color: textColor }}
        >
          {activeCue.text}
        </span>
      );
    }

    // 1. Direct active word match: effectiveTime falls inside [w.start, w.end]
    let activeIdx = words.findIndex(
      (w) => effectiveTime >= w.start && effectiveTime <= w.end
    );

    // 2. Continuous inter-word flow: if in a natural micro-pause between words, hold on current word
    if (activeIdx === -1) {
      for (let i = words.length - 1; i >= 0; i--) {
        if (effectiveTime >= words[i].start) {
          activeIdx = i;
          break;
        }
      }
    }

    // Default to first word if speech hasn't begun yet
    if (activeIdx === -1 && words.length > 0) {
      activeIdx = 0;
    }

    return words.map((w, idx) => {
      // Exactly one word is active at any time, staying active until the next word begins
      const isWordActive = words[activeIdx] === w;

      // 1. Box Animation (Focus Box, Safari, Deep Diver B&W, Midnight Serif)
      if (animation === 'box' || presetName.toLowerCase().includes('box')) {
        return (
          <span
            key={idx}
            className={`inline-block mx-1 px-1.5 py-0.5 rounded-lg transition-all duration-75 ${
              isWordActive
                ? 'font-black scale-110 shadow-neon-sm -translate-y-0.5'
                : 'font-bold opacity-80'
            }`}
            style={{
              backgroundColor: isWordActive ? highlightColor : 'transparent',
              color: isWordActive ? '#000000' : textColor,
              textShadow: isWordActive ? 'none' : undefined,
            }}
          >
            {w.word}
          </span>
        );
      }

      // 2. Underline Animation (Marker, Hook, Aurora Ink)
      if (animation === 'underline' || presetName === 'Marker' || presetName === 'Hook' || presetName === 'Aurora Ink') {
        return (
          <span
            key={idx}
            className={`inline-block mx-1 transition-all duration-100 ${
              isWordActive
                ? 'font-black scale-105 border-b-4 pb-0.5'
                : 'font-bold opacity-85'
            }`}
            style={{
              color: isWordActive ? highlightColor : textColor,
              borderColor: isWordActive ? highlightColor : 'transparent',
            }}
          >
            {w.word}
          </span>
        );
      }

      // 3. Pop Animation (Banger, Beasty, New, From)
      if (animation === 'pop' || animation === 'word_pop' || presetName === 'Banger' || presetName === 'Beasty') {
        return (
          <span
            key={idx}
            className={`inline-block mx-1 transition-transform duration-75 uppercase ${
              isWordActive
                ? 'scale-125 font-black drop-shadow-md z-10 -translate-y-1'
                : 'scale-100 font-bold opacity-80'
            }`}
            style={{
              color: isWordActive ? highlightColor : textColor,
            }}
          >
            {w.word}
          </span>
        );
      }

      // 4. Scale Animation (Lovly, Marvel, Flamingo)
      if (animation === 'scale' || presetName === 'Lovly' || presetName === 'Marvel' || presetName === 'Flamingo') {
        return (
          <span
            key={idx}
            className={`inline-block mx-1 transition-transform duration-100 ${
              isWordActive
                ? 'scale-130 font-black tracking-wide'
                : 'scale-95 font-semibold opacity-75'
            }`}
            style={{
              color: isWordActive ? highlightColor : textColor,
            }}
          >
            {w.word}
          </span>
        );
      }

      // 5. Slide-up / Motion (Neon Pulse, Old Money, Sky)
      if (animation === 'slide-up' || presetName === 'Neon Pulse' || presetName === 'Old Money' || presetName === 'Sky') {
        return (
          <span
            key={idx}
            className={`inline-block mx-1 transition-all duration-100 ${
              isWordActive
                ? '-translate-y-1 font-black opacity-100'
                : 'translate-y-0 font-medium opacity-65'
            }`}
            style={{
              color: isWordActive ? highlightColor : textColor,
              textShadow: isWordActive ? `0 0 10px ${highlightColor}` : undefined,
            }}
          >
            {w.word}
          </span>
        );
      }

      // 6. Default Karaoke / Bounce (Karaoke, Desert, Catchy)
      return (
        <span
          key={idx}
          className={`inline-block mx-1 transition-all duration-75 ${
            isWordActive
              ? 'scale-115 font-black -translate-y-1'
              : 'scale-100 font-bold opacity-80'
          }`}
          style={{
            color: isWordActive ? highlightColor : textColor,
          }}
        >
          {w.word}
        </span>
      );
    });
  };

  // Timeline scrubber calculation and trimming handles
  const totalVideoDuration = duration || project?.duration || 100;
  const clipStart = selectedClip?.start_time ?? 0;
  const clipEnd = selectedClip?.end_time ?? Math.min(totalVideoDuration, 30);

  const startPct = (clipStart / totalVideoDuration) * 100;
  const endPct = (clipEnd / totalVideoDuration) * 100;
  const widthPct = Math.max(1, endPct - startPct);
  const playheadPct = (currentTime / totalVideoDuration) * 100;

  const roundSec = (val) => Math.round(val * 10) / 10;

  const formatPreciseSec = (seconds) => {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms}s`;
  };

  const handleTrackClick = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = pct * totalVideoDuration;
    onSeek(targetTime);
  };

  const handleStartTrim = (e) => {
    e.stopPropagation();
    const handleMove = (moveEvt) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clientX = moveEvt.clientX ?? moveEvt.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newStart = Math.min(pct * totalVideoDuration, clipEnd - 1.5);
      onUpdateClipBounds?.(roundSec(newStart), clipEnd);
      onSeek?.(newStart);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
  };

  const handleEndTrim = (e) => {
    e.stopPropagation();
    const handleMove = (moveEvt) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clientX = moveEvt.clientX ?? moveEvt.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newEnd = Math.max(pct * totalVideoDuration, clipStart + 1.5);
      onUpdateClipBounds?.(clipStart, roundSec(newEnd));
      onSeek?.(Math.max(clipStart, newEnd - 0.5));
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleUp);
  };

  const handleNudgeStart = (delta) => {
    const newStart = Math.max(0, Math.min(clipEnd - 1.5, clipStart + delta));
    onUpdateClipBounds?.(roundSec(newStart), clipEnd);
    onSeek?.(newStart);
  };

  const handleNudgeEnd = (delta) => {
    const newEnd = Math.max(clipStart + 1.5, Math.min(totalVideoDuration, clipEnd + delta));
    onUpdateClipBounds?.(clipStart, roundSec(newEnd));
    onSeek?.(Math.max(clipStart, newEnd - 0.5));
  };

  return (
    <div className="flex flex-col items-center w-full h-full px-4 py-4 overflow-y-auto min-h-0">
      {/* 9:16 PORTRAIT SHORTS LAYOUT: PHONE ON LEFT, TIMELINE DECK ON RIGHT */}
      <div className="flex flex-row items-center justify-center gap-5 w-full max-w-4xl py-2 my-auto">
          {/* Phone Frame Container: Clean bezels, proportional height */}
          <div
            ref={phoneContainerRef}
            className="relative aspect-[9/16] h-[450px] sm:h-[480px] max-h-[68vh] bg-black rounded-[36px] overflow-hidden shadow-card-elevated border-4 border-charcoal flex items-center justify-center shrink-0"
          >
            {/* Blurred Background Mode */}
            {cropMode === 'blur_fill' && (
              <video
                src={videoSrc}
                className="absolute inset-0 w-full h-full object-cover filter blur-xl scale-125 opacity-70 pointer-events-none"
                muted
                tabIndex={-1}
              />
            )}

            {/* Video Stage Container (Persistent Panel 0 prevents remounting videoRef on solo/split transitions) */}
            <div className={`relative z-10 w-full h-full flex ${cropMode === 'blur_fill' ? 'items-center justify-center' : 'flex-col bg-black'}`}>
              {/* Primary Panel (Solo or Split Panel 0) */}
              <div
                className={
                  cropMode === 'blur_fill'
                    ? 'w-full flex items-center justify-center'
                    : `flex-1 w-full relative overflow-hidden ${isSplitScreen ? 'border-b border-ink-black' : ''}`
                }
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  preload="auto"
                  onClick={togglePlay}
                  onError={() => setIsVideoError(true)}
                  onPlay={() => {
                    setIsPlaying(true);
                    if (videoRef.current) {
                      videoRef.current.playbackRate = playbackRate;
                      videoRef.current.defaultPlaybackRate = playbackRate;
                    }
                    syncSplitVideos();
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    syncSplitVideos();
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  className={`cursor-pointer ${
                    cropMode === 'blur_fill'
                      ? 'relative z-10 w-full object-contain'
                      : 'absolute z-10 max-w-none max-h-none pointer-events-auto'
                  }`}
                  style={
                    cropMode !== 'blur_fill'
                      ? isSplitScreen && splitPanels[0]
                        ? {
                            width: `${(100 / splitPanels[0].wf).toFixed(2)}%`,
                            height: `${(100 / splitPanels[0].hf).toFixed(2)}%`,
                            left: `${(-((1 / splitPanels[0].wf - 1) * (splitPanels[0].x / 100)) * 100).toFixed(2)}%`,
                            top: `${(-((1 / splitPanels[0].hf - 1) * (splitPanels[0].y / 100)) * 100).toFixed(2)}%`,
                            objectFit: 'fill',
                            transition: 'none',
                          }
                        : {
                            width: `${(316.05 * effectiveZoom).toFixed(2)}%`,
                            height: `${(100 * effectiveZoom).toFixed(2)}%`,
                            left: `${(-((3.1605 * effectiveZoom - 1) * (cropX / 100)) * 100).toFixed(2)}%`,
                            top: `${(-((effectiveZoom - 1) * (cropY / 100)) * 100).toFixed(2)}%`,
                            objectFit: 'fill',
                            transition: 'none',
                          }
                      : {}
                  }
                  playsInline
                />
              </div>

              {/* Additional Vertical Split Panels (2, 3, or 4 Stacked Speakers) */}
              {isSplitScreen &&
                splitPanels.slice(1).map((panelBox, idx) => (
                  <div
                    key={idx + 1}
                    onClick={togglePlay}
                    className="flex-1 w-full relative overflow-hidden border-b border-ink-black last:border-b-0 cursor-pointer"
                  >
                    <video
                      ref={(el) => {
                        splitVideoRefs.current[idx] = el;
                      }}
                      src={videoSrc}
                      preload="auto"
                      muted
                      playsInline
                      tabIndex={-1}
                      onLoadedMetadata={() => syncSplitVideos()}
                      className="absolute z-10 max-w-none max-h-none pointer-events-none"
                      style={{
                        width: `${(100 / panelBox.wf).toFixed(2)}%`,
                        height: `${(100 / panelBox.hf).toFixed(2)}%`,
                        left: `${(-((1 / panelBox.wf - 1) * (panelBox.x / 100)) * 100).toFixed(2)}%`,
                        top: `${(-((1 / panelBox.hf - 1) * (panelBox.y / 100)) * 100).toFixed(2)}%`,
                        objectFit: 'fill',
                        transition: 'none',
                      }}
                    />
                  </div>
                ))}
            </div>

            {/* Video Load Error / Connecting Fallback */}
            {isVideoError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-black/90 text-center p-4 space-y-2 select-none">
                <AlertCircle className="w-8 h-8 text-signal-orange mx-auto animate-pulse" />
                <p className="text-xs font-bold text-white">Connecting Media Stream...</p>
                <p className="text-[10px] text-slate-gray max-w-[200px]">Video file is being initialized or stream is caching.</p>
              </div>
            )}

            {/* Top Floating Control Bar: Speaker Badge on Left & Attribution Credit on Right */}
            <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex items-center justify-between gap-1.5 select-none">
              {activeSpeakerLabel && cropMode === 'custom_crop' ? (
                <div className="bg-white/95 backdrop-blur-md border border-border-cream px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm max-w-[48%] shrink min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-signal-orange animate-pulse shrink-0" />
                  <span className="text-[10px] font-bold text-ink-black tracking-wide truncate">{activeSpeakerLabel}</span>
                </div>
              ) : <div />}

              {channelCredit && (
                <div className="bg-white/95 backdrop-blur-md border border-border-cream px-3 py-1 rounded-full flex items-center gap-1 shadow-sm max-w-[50%] shrink min-w-0 ml-auto">
                  <span className="text-[10px] font-semibold text-slate-gray tracking-wide truncate">
                    Credit: <span className="text-ink-black font-extrabold">{channelCredit}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* DOCKED TIMELINE & CONTROL DECK: Warm Lifted Editorial Style */}
          <div className="w-full sm:w-[350px] lg:w-[370px] flex flex-col gap-2.5 bg-white border border-border-cream rounded-stadium p-4 sm:p-5 shadow-card-soft shrink-0 max-h-[min(620px,calc(100vh-165px))] overflow-y-auto">
            {/* Header: Scene Badge & Aspect Ratio */}
            <div className="flex items-center justify-between pb-2 border-b border-border-cream">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
                <span className="text-xs font-extrabold text-ink-black uppercase tracking-wider">
                  Scene #{selectedClip?.id ? selectedClip.id.slice(0, 4) : '1'}
                </span>
                <span className="text-[10px] font-mono text-ink-black bg-canvas-cream px-2.5 py-0.5 rounded-full border border-border-cream font-semibold ml-1">
                  {formatSec(clipStart)} – {formatSec(clipEnd)}
                </span>
              </div>

              {/* 9:16 Portrait Shorts Indicator */}
              <div className="flex items-center px-2.5 py-0.5 bg-canvas-cream rounded-full border border-border-cream text-[10px] font-bold text-charcoal gap-1">
                <Smartphone className="w-3 h-3 text-signal-orange" />
                9:16 Shorts
              </div>
            </div>

            {/* Playback Transport: Play/Pause, Time Scrubber, Skip */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 shrink min-w-0">
                  <button
                    onClick={togglePlay}
                    className="w-9 h-9 rounded-full bg-ink-black hover:bg-black text-white flex items-center justify-center transition shadow-sm hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-white stroke-white" />
                    ) : (
                      <Play className="w-4 h-4 fill-white stroke-white ml-0.5" />
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onSeek(Math.max(0, currentTime - 5))}
                      className="p-1.5 rounded-full bg-canvas-cream text-charcoal hover:bg-white border border-border-cream transition cursor-pointer"
                      title="-5s"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSeek(Math.min(totalVideoDuration, currentTime + 5))}
                      className="p-1.5 rounded-full bg-canvas-cream text-charcoal hover:bg-white border border-border-cream transition cursor-pointer"
                      title="+5s"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Playback Speed Dropdown */}
                  <div className="relative flex items-center bg-canvas-cream py-1 px-2.5 rounded-full border border-border-cream hover:border-signal-orange text-[11px] font-mono shrink-0 transition group">
                    <span className="text-signal-orange mr-1.5 text-xs">⚡</span>
                    <select
                      value={playbackRate}
                      onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                      className="bg-transparent text-ink-black font-bold text-xs cursor-pointer focus:outline-none appearance-none pr-4 z-10"
                      title="Adjust playback speed"
                    >
                      <option value="0.1">0.1x (Slow-Mo)</option>
                      <option value="0.25">0.25x</option>
                      <option value="0.5">0.5x</option>
                      <option value="0.75">0.75x</option>
                      <option value="1.0">1.0x (Normal)</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x (Fast)</option>
                      <option value="1.75">1.75x</option>
                      <option value="2.0">2.0x (Max)</option>
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-gray absolute right-1.5 pointer-events-none group-hover:text-signal-orange transition-colors" />
                  </div>
                </div>

                {/* Clip Duration Pill */}
                <div className="shrink-0 whitespace-nowrap bg-canvas-cream px-2.5 py-1 rounded-full border border-border-cream text-right select-none min-w-[76px]">
                  <div className="font-mono text-[11px] font-extrabold text-ink-black leading-tight flex items-center justify-end gap-1 whitespace-nowrap">
                    <span className="whitespace-nowrap">{formatSec(clipCurrentTime)}</span>
                    <span className="text-slate-gray font-normal">/</span>
                    <span className="whitespace-nowrap">{formatSec(clipTotalDuration)}</span>
                  </div>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 bg-canvas-cream px-3 py-1.5 rounded-full border border-border-cream text-xs">
                <button onClick={toggleMute} className="text-slate-gray hover:text-ink-black cursor-pointer">
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-signal-orange" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-ink-black" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="flex-1 cursor-pointer"
                />
                <span className="text-[10px] text-slate-gray font-mono w-7 text-right">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>

            {/* INTERACTIVE CLIP TIMELINE TRIMMER */}
            <div className="space-y-2 pt-2 border-t border-border-cream">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-ink-black flex items-center gap-1.5 uppercase tracking-wide">
                  <Scissors className="w-3.5 h-3.5 text-signal-orange" />
                  Timeline Trimmer
                </span>
                <span className="text-[10px] font-mono text-ink-black bg-canvas-cream px-2 py-0.5 rounded-full border border-border-cream font-bold">
                  {formatPreciseSec(clipEnd - clipStart)}
                </span>
              </div>

              {/* Trimmer Track */}
              <div
                ref={trackRef}
                onClick={handleTrackClick}
                className="relative w-full h-8 bg-canvas-cream rounded-full border border-border-cream overflow-hidden cursor-pointer select-none group"
                title="Click anywhere to seek playhead, drag handles to trim"
              >
                {/* Background Full Timeline Track Bar */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-dust-taupe rounded-full" />

                {/* Highlighted Selected Clip Span */}
                <div
                  className="absolute top-1 bottom-1 bg-light-orange/20 border-y-2 border-signal-orange rounded-full"
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                  }}
                />

                {/* Playhead Needle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-ink-black shadow-lg pointer-events-none z-20"
                  style={{ left: `${Math.max(0, Math.min(100, playheadPct))}%` }}
                >
                  <div className="w-2.5 h-2.5 bg-ink-black rounded-full -ml-[4px] -mt-0.5 shadow-md" />
                </div>

                {/* Left Trim Handle (Start) */}
                <div
                  onMouseDown={handleStartTrim}
                  onTouchStart={handleStartTrim}
                  className="absolute top-0 bottom-0 w-4 -ml-2 bg-white hover:bg-canvas-cream active:bg-ink-black active:text-white text-ink-black border border-border-cream flex items-center justify-center cursor-ew-resize z-30 rounded-full shadow-satellite transition-colors group/handle"
                  style={{ left: `${startPct}%` }}
                  title={`Trim Start: ${formatPreciseSec(clipStart)}`}
                >
                  <div className="w-0.5 h-3.5 bg-signal-orange rounded-full" />
                </div>

                {/* Right Trim Handle (End) */}
                <div
                  onMouseDown={handleEndTrim}
                  onTouchStart={handleEndTrim}
                  className="absolute top-0 bottom-0 w-4 -ml-2 bg-white hover:bg-canvas-cream active:bg-ink-black active:text-white text-ink-black border border-border-cream flex items-center justify-center cursor-ew-resize z-30 rounded-full shadow-satellite transition-colors group/handle"
                  style={{ left: `${endPct}%` }}
                  title={`Trim End: ${formatPreciseSec(clipEnd)}`}
                >
                  <div className="w-0.5 h-3.5 bg-signal-orange rounded-full" />
                </div>
              </div>

              {/* Nudge & Precision Timing Adjustments */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {/* Start Time Nudge */}
                <div className="bg-canvas-cream p-2 rounded-2xl border border-border-cream space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray font-semibold uppercase text-[9px]">Start</span>
                    <span className="font-mono font-bold text-ink-black">{formatPreciseSec(clipStart)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    {[-1.0, -0.2, 0.2, 1.0].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleNudgeStart(d)}
                        className="flex-1 py-0.5 bg-white hover:bg-lifted-cream text-charcoal rounded-full border border-border-cream font-mono transition cursor-pointer text-center"
                      >
                        {d > 0 ? `+${d}` : d}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* End Time Nudge */}
                <div className="bg-canvas-cream p-2 rounded-2xl border border-border-cream space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray font-semibold uppercase text-[9px]">End</span>
                    <span className="font-mono font-bold text-ink-black">{formatPreciseSec(clipEnd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    {[-1.0, -0.2, 0.2, 1.0].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleNudgeEnd(d)}
                        className="flex-1 py-0.5 bg-white hover:bg-lifted-cream text-charcoal rounded-full border border-border-cream font-mono transition cursor-pointer text-center"
                      >
                        {d > 0 ? `+${d}` : d}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* VIDEO RESIZING & ZOOM SCALE */}
            <div className="space-y-1.5 pt-2 border-t border-border-cream">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-ink-black flex items-center gap-1.5 uppercase tracking-wide">
                  <ZoomIn className="w-3.5 h-3.5 text-signal-orange" />
                  Video Resizing (Zoom)
                </span>
                <span className="font-mono text-[10px] font-bold text-ink-black bg-canvas-cream px-2 py-0.5 rounded-full border border-border-cream">
                  {effectiveZoom.toFixed(2)}x
                </span>
              </div>

              {/* Zoom Slider */}
              <div className="flex items-center gap-2 bg-canvas-cream px-3 py-1.5 rounded-full border border-border-cream">
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.05"
                  value={activeCropZoom || 1.15}
                  onChange={(e) => onChangeCrop?.({ zoom: parseFloat(e.target.value) })}
                  className="w-full cursor-pointer"
                />
              </div>

              {/* Preset Zoom Pills */}
              <div className="grid grid-cols-4 gap-1 text-[10px]">
                {[
                  { label: '1.0x Wide', val: 1.0 },
                  { label: '1.15x Std', val: 1.15 },
                  { label: '1.35x Med', val: 1.35 },
                  { label: '1.6x Close', val: 1.6 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onChangeCrop?.({ zoom: item.val })}
                    className={`py-1 rounded-full font-bold transition text-center cursor-pointer border ${
                      Math.abs((activeCropZoom || 1.15) - item.val) < 0.06
                        ? 'bg-ink-black text-white border-ink-black shadow-sm'
                        : 'bg-white text-charcoal hover:bg-canvas-cream border-border-cream'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Framing Style Selector */}
            <div className="space-y-1.5 pt-1 border-t border-border-cream">
              <label className="text-[10px] font-bold text-slate-gray uppercase tracking-wider block">
                Framing Style
              </label>
              <div className="grid grid-cols-2 p-1 bg-canvas-cream rounded-full border border-border-cream text-[11px]">
                <button
                  type="button"
                  onClick={() => onChangeCrop?.({ mode: 'blur_fill' })}
                  className={`py-1.5 rounded-full font-bold transition cursor-pointer ${
                    cropMode === 'blur_fill'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  Blurred BG
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCrop?.({ mode: 'custom_crop' })}
                  className={`py-1.5 rounded-full font-bold transition cursor-pointer ${
                    cropMode === 'custom_crop'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  Smart Crop
                </button>
              </div>
            </div>

            {/* AI Auto-Speaker Focus Action */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[11px] text-ink-black font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
                Auto-Speaker Focus
              </span>
              <button
                type="button"
                onClick={handleRunAutoTrack}
                disabled={isAutoTracking}
                className="px-3 py-1 bg-canvas-cream hover:bg-lifted-cream text-ink-black border border-border-cream rounded-full font-extrabold text-[10px] flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50"
                title="AI detects all speakers in video and shifts camera automatically"
              >
                {isAutoTracking ? (
                  <Loader2 className="w-3 h-3 animate-spin text-signal-orange" />
                ) : (
                  <Sparkles className="w-3 h-3 text-signal-orange" />
                )}
                <span>{isAutoTracking ? 'Tracking...' : '⚡ Auto-Track (AI)'}</span>
              </button>
            </div>

            {/* AI Tracking Overlay Toggle */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-[11px] text-slate-gray font-semibold">AI Camera View</span>
              <button
                onClick={onToggleCropInspector}
                className={`px-3 py-1 rounded-full border text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isCropInspectorOpen
                    ? 'bg-ink-black text-white border-ink-black'
                    : 'bg-canvas-cream border-border-cream text-charcoal hover:bg-white'
                }`}
              >
                <Crop className="w-3 h-3" />
                <span>{isCropInspectorOpen ? 'Hide View' : 'View AI Framing'}</span>
              </button>
            </div>

            {/* Original Channel Attribution Badge with One-Click Edit */}
            <div className="flex items-center justify-between text-xs bg-canvas-cream px-3 py-1.5 rounded-full border border-border-cream text-[11px]">
              <span className="text-slate-gray font-semibold flex items-center gap-1.5 shrink-0">
                <Youtube className="w-3.5 h-3.5 text-mc-red shrink-0" />
                Credit
              </span>
              {isEditingChannel ? (
                <div className="flex items-center gap-1 max-w-[200px]">
                  <input
                    type="text"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveChannel();
                      if (e.key === 'Escape') setIsEditingChannel(false);
                    }}
                    autoFocus
                    className="bg-white border border-signal-orange rounded-full px-2.5 py-0.5 text-xs text-ink-black font-bold w-full outline-none"
                    placeholder="Channel Name"
                  />
                  <button
                    onClick={handleSaveChannel}
                    type="button"
                    className="p-1 rounded-full bg-ink-black text-white shrink-0 cursor-pointer"
                    title="Save"
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </button>
                  <button
                    onClick={() => setIsEditingChannel(false)}
                    type="button"
                    className="p-1 rounded-full bg-white text-slate-gray shrink-0 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 max-w-[200px]">
                  <span className="font-bold text-ink-black truncate" title={channelCredit}>
                    {channelCredit}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartEditChannel}
                    className="text-slate-gray hover:text-signal-orange p-0.5 transition cursor-pointer"
                    title="Edit Channel Credit"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Render & Shorts Kit Action Buttons */}
            {selectedClip && (
              <div className="space-y-2 pt-2 border-t border-border-cream">
                {/* Mastercard Signature Ink Black CTA */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedClip?.clean_render_status === 'completed' && selectedClip?.rendered_clean_file) {
                      window.location.href = api.getClipCleanDownloadUrl(selectedClip.id);
                    } else {
                      onOpenExport?.('clean', false);
                    }
                  }}
                  className="w-full bg-ink-black hover:bg-black text-white font-extrabold py-3.5 px-4 rounded-cta transition-all hover:scale-[1.01] shadow-card-soft flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
                  title="Render and download 9:16 Short (1080x1920 HD)"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {selectedClip?.clean_render_status === 'completed' && selectedClip?.rendered_clean_file
                      ? 'Download 9:16 Short (HD)'
                      : 'Render 9:16 Short (HD)'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onOpenShortsKit}
                    className="w-full bg-white hover:bg-canvas-cream text-charcoal font-bold border border-border-cream py-2 px-2.5 rounded-full transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate shadow-sm"
                    title="Download Upload Kit (.MD Description, Creator Credits, & ZIP Bundle)"
                  >
                    <FileText className="w-3.5 h-3.5 text-signal-orange shrink-0" />
                    <span className="truncate">Shorts Kit</span>
                  </button>

                  {onDeleteClip && (
                    <button
                      onClick={() => onDeleteClip(selectedClip)}
                      className="w-full bg-white hover:bg-canvas-cream text-clay-brown font-bold border border-border-cream py-2 px-2.5 rounded-full transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate shadow-sm"
                      title="Delete this clip"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Delete Clip</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
