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

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setLocalFrameTime(curr);
    onTimeUpdate(curr);

    // Loop within clip bounds if a clip is active
    if (selectedClip) {
      if (curr >= selectedClip.end_time) {
        videoRef.current.currentTime = selectedClip.start_time;
        videoRef.current.playbackRate = playbackRate;
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

  // Dynamic Real-Time Keyframe Camera Tracking (PDF 3: Multi-Speaker Framing)
  let activeCropX = cropSettings?.x ?? 50.0;
  let activeCropY = cropSettings?.y ?? 45.0;
  let activeCropZoom = cropSettings?.zoom ?? 1.0;
  let activeSpeakerLabel = '';

  const keyframes = Array.isArray(cropSettings?.keyframes) && cropSettings.keyframes.length > 0
    ? [...cropSettings.keyframes].sort((a, b) => (a.time || 0) - (b.time || 0))
    : null;

  // When Crop Inspector is open, prioritize user's direct manual coordinates for instant real-time feedback
  if (isCropInspectorOpen) {
    activeCropX = cropSettings?.x ?? 50.0;
    activeCropY = cropSettings?.y ?? 45.0;
    activeCropZoom = cropSettings?.zoom ?? 1.0;
    activeSpeakerLabel = 'Manual Framing Focus';
  } else if (keyframes && keyframes.length > 0) {
    if (keyframes.length === 1) {
      activeCropX = keyframes[0].x ?? activeCropX;
      activeCropY = keyframes[0].y ?? activeCropY;
      activeCropZoom = keyframes[0].zoom ?? activeCropZoom;
      activeSpeakerLabel = keyframes[0].speaker || '';
    } else {
      let curIdx = 0;
      for (let i = 0; i < keyframes.length; i++) {
        if (keyframes[i].time <= clipCurrentTime) {
          curIdx = i;
        } else {
          break;
        }
      }

      const curKf = keyframes[curIdx];
      const prevKf = curIdx > 0 ? keyframes[curIdx - 1] : null;

      if (!prevKf) {
        activeCropX = curKf.x;
        activeCropY = curKf.y;
        activeCropZoom = curKf.zoom || 1.0;
        activeSpeakerLabel = curKf.speaker || '';
      } else {
        // Fluid, cinematic camera glide over 0.75s from previous keyframe to current keyframe
        const panDur = 0.75;
        const dt = clipCurrentTime - curKf.time;
        if (dt >= 0 && dt < panDur) {
          const progress = dt / panDur;
          // Smooth Hermite cubic ease-in-out curve (smoothstep)
          const easeRatio = progress * progress * (3 - 2 * progress);
          activeCropX = prevKf.x + (curKf.x - prevKf.x) * easeRatio;
          activeCropY = prevKf.y + (curKf.y - prevKf.y) * easeRatio;
          activeCropZoom = (prevKf.zoom || 1.0) + ((curKf.zoom || 1.0) - (prevKf.zoom || 1.0)) * easeRatio;
          activeSpeakerLabel = curKf.speaker || '';
        } else {
          activeCropX = curKf.x;
          activeCropY = curKf.y;
          activeCropZoom = curKf.zoom || 1.0;
          activeSpeakerLabel = curKf.speaker || '';
        }
      }
    }
  }

  // Mathematical 9:16 Porting for 16:9 horizontal video:
  // In a 9:16 frame, a 16:9 video scaled to full height (zoom=1.0) is (16/9)^2 = 3.1605 times container width.
  // Using effectiveZoom >= 1.08 provides graceful vertical headroom so Vertical Tilt (Y) never exposes black gaps.
  const zoom = Math.max(1.0, Math.min(2.5, activeCropZoom || 1.0));
  const effectiveZoom = Math.max(1.08, zoom);
  const cropX = Math.max(0.0, Math.min(100.0, activeCropX));
  const cropY = Math.max(0.0, Math.min(100.0, activeCropY));
  const cropMode = cropSettings?.mode || 'custom_crop';

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
      const pct = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      const newStart = Math.min(pct * totalVideoDuration, clipEnd - 2.0);
      onUpdateClipBounds?.(roundSec(newStart), clipEnd);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleEndTrim = (e) => {
    e.stopPropagation();
    const handleMove = (moveEvt) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      const newEnd = Math.max(pct * totalVideoDuration, clipStart + 2.0);
      onUpdateClipBounds?.(clipStart, roundSec(newEnd));
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-2 overflow-y-auto min-h-0">
      {/* 9:16 PORTRAIT SHORTS LAYOUT: PHONE ON LEFT, TIMELINE DECK ON RIGHT */}
      <div className="flex flex-row items-center justify-center gap-4 w-full max-w-4xl py-1 my-auto">
          {/* Phone Frame Container: Clean bezels, proportional height */}
          <div
            ref={phoneContainerRef}
            className="relative aspect-[9/16] h-[450px] sm:h-[480px] max-h-[68vh] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-dark-700/80 flex items-center justify-center shrink-0"
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

            {/* Foreground Video */}
            <video
              ref={videoRef}
              src={videoSrc}
              onClick={togglePlay}
              onError={() => setIsVideoError(true)}
              onPlay={() => {
                setIsPlaying(true);
                if (videoRef.current) {
                  videoRef.current.playbackRate = playbackRate;
                  videoRef.current.defaultPlaybackRate = playbackRate;
                }
              }}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              className={`cursor-pointer ${
                cropMode === 'blur_fill'
                  ? 'relative z-10 w-full object-contain'
                  : 'absolute z-10 max-w-none max-h-none pointer-events-auto'
              }`}
              style={
                cropMode !== 'blur_fill'
                  ? {
                      width: `${(316.05 * effectiveZoom).toFixed(2)}%`,
                      height: `${(100 * effectiveZoom).toFixed(2)}%`,
                      left: `${(-((3.1605 * effectiveZoom - 1) * (cropX / 100)) * 100).toFixed(2)}%`,
                      top: `${(-((effectiveZoom - 1) * (cropY / 100)) * 100).toFixed(2)}%`,
                      objectFit: 'fill',
                      transition: isCropInspectorOpen
                        ? 'none'
                        : 'left 0.08s ease-out, top 0.08s ease-out, width 0.08s ease-out, height 0.08s ease-out',
                    }
                  : {}
              }
              playsInline
            />

            {/* Video Load Error / Connecting Fallback */}
            {isVideoError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-dark-950/90 text-center p-4 space-y-2 select-none">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto animate-pulse" />
                <p className="text-xs font-bold text-white">Connecting Media Stream...</p>
                <p className="text-[10px] text-slate-400 max-w-[200px]">Video file is being initialized or backend server is starting.</p>
              </div>
            )}

            {/* Top Floating Control Bar: Speaker Badge on Left & Attribution Credit on Right (Zero Overlapping) */}
            <div className="absolute top-3 left-3 right-3 z-20 pointer-events-none flex items-center justify-between gap-1.5 select-none">
              {activeSpeakerLabel && cropMode === 'custom_crop' ? (
                <div className="bg-black/70 backdrop-blur-md border border-lime-neon/40 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-neon max-w-[48%] shrink min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-lime-neon animate-pulse shrink-0" />
                  <span className="text-[10px] font-semibold text-white tracking-wide truncate">{activeSpeakerLabel}</span>
                </div>
              ) : <div />}

              {channelCredit && (
                <div className="bg-black/75 backdrop-blur-md border border-white/20 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-lg max-w-[50%] shrink min-w-0 ml-auto">
                  <span className="text-[10px] font-bold text-slate-300 tracking-wide truncate">
                    Credit - <span className="text-white font-extrabold">{channelCredit}</span>
                  </span>
                </div>
              )}
            </div>

            {/* CAPTIONS TEMPORARILY DISABLED: Commented out per user request */}
            {/*
            {!hideCaptionsPreview && captionStyle?.showCaptions !== false && (activeCue || !isPlaying) && (
              <div
                onMouseDown={(e) => startCaptionDrag(e, phoneContainerRef)}
                onTouchStart={(e) => startCaptionDrag(e, phoneContainerRef)}
                style={{
                  position: 'absolute',
                  top: `${activeCaptionY}%`,
                  left: `${activeCaptionX}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: isDraggingCaption ? 'grabbing' : 'grab',
                  zIndex: 35,
                  userSelect: 'none',
                  touchAction: 'none',
                  width: '92%',
                }}
                className={`group flex flex-col items-center justify-center text-center transition-all ${
                  isDraggingCaption
                    ? 'ring-2 ring-lime-neon/90 bg-black/40 rounded-xl py-1 shadow-neon-lg'
                    : 'hover:ring-1 hover:ring-lime-neon/50 hover:bg-black/20 rounded-xl py-1'
                }`}
                title="Click and drag to position caption anywhere on video"
              >
                <div
                  className={`flex items-center gap-1 bg-black/90 text-lime-neon border border-lime-neon/30 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold shadow-md transition-opacity duration-150 mb-1 select-none pointer-events-none ${
                    isDraggingCaption ? 'opacity-100 ring-1 ring-lime-neon' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Move className="w-2.5 h-2.5" />
                  <span>{isDraggingCaption ? `Position: ${Math.round(activeCaptionY)}%` : 'Drag to Move Caption'}</span>
                </div>

                <div
                  key={activeCue?.id || 'static-cue'}
                  className="inline-block max-w-[95%] text-center select-none transition-all duration-150 ease-out"
                  style={{
                    fontFamily: captionStyle?.font || 'Montserrat',
                    fontSize: `${captionStyle?.fontSize || 19}px`,
                    fontWeight: 800,
                    textAlign: captionStyle?.alignment || 'center',
                    lineHeight: '1.25',
                    textShadow:
                      '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 10px rgba(0,0,0,0.95)',
                  }}
                >
                  {activeCue ? renderSubtitleWords() : (
                    <span className="text-white/80 font-bold text-sm tracking-wide flex items-center justify-center gap-1.5 py-0.5">
                      <Move className="w-3.5 h-3.5 text-lime-neon animate-pulse" />
                      <span>{selectedClip?.title ? `"${selectedClip.title.slice(0, 30)}"` : 'Preview Caption (Drag to Position)'}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            */}
          </div>

          {/* DOCKED TIMELINE & CONTROL DECK: Placed neatly in the empty space on the right! */}
          <div className="w-full sm:w-[350px] lg:w-[370px] flex flex-col gap-2 bg-dark-900/95 border border-dark-700/80 rounded-2xl p-3 pb-6 shadow-2xl shrink-0 max-h-[min(620px,calc(100vh-130px))] overflow-y-auto scrollbar-thin">
            {/* Header: Scene Badge & Aspect Ratio */}
            <div className="flex items-center justify-between pb-2 border-b border-dark-800">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-lime-neon animate-pulse"></span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Scene #{selectedClip?.id ? selectedClip.id.slice(0, 4) : '1'}
                </span>
                <span className="text-[10px] font-mono text-lime-neon bg-lime-neon/10 px-2 py-0.5 rounded-full border border-lime-neon/20 ml-1">
                  {formatSec(clipStart)} – {formatSec(clipEnd)}
                </span>
              </div>

              {/* 9:16 Portrait Shorts Indicator */}
              <div className="flex items-center px-2 py-0.5 bg-dark-950 rounded-lg border border-dark-800 text-[11px] font-bold text-lime-neon gap-1">
                <Smartphone className="w-3 h-3" />
                9:16 Shorts
              </div>
            </div>

            {/* Playback Transport: Play/Pause, Time Scrubber, Skip */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 shrink min-w-0">
                  <button
                    onClick={togglePlay}
                    className="w-9 h-9 rounded-xl bg-lime-neon text-black flex items-center justify-center transition shadow-neon-sm hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-black stroke-black" />
                    ) : (
                      <Play className="w-4 h-4 fill-black stroke-black ml-0.5" />
                    )}
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => onSeek(Math.max(0, currentTime - 5))}
                      className="p-1.5 rounded-lg bg-dark-950 text-slate-400 hover:text-white border border-dark-800 transition cursor-pointer"
                      title="-5s"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onSeek(Math.min(totalVideoDuration, currentTime + 5))}
                      className="p-1.5 rounded-lg bg-dark-950 text-slate-400 hover:text-white border border-dark-800 transition cursor-pointer"
                      title="+5s"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Playback & Caption Speed Dropdown (0.1x – 2.0x) */}
                  <div className="relative flex items-center bg-dark-950 py-1 px-2 rounded-xl border border-dark-800 hover:border-lime-neon/50 text-[11px] font-mono shrink-0 transition group">
                    <span className="text-lime-neon mr-1.5 text-xs">⚡</span>
                    <select
                      value={playbackRate}
                      onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                      className="bg-transparent text-lime-neon font-black text-xs cursor-pointer focus:outline-none appearance-none pr-5 z-10"
                      title="Adjust caption & video playback speed (0.1x to 2.0x)"
                    >
                      <option value="0.1" className="bg-dark-900 text-white font-mono">0.1x (Slow-Mo)</option>
                      <option value="0.25" className="bg-dark-900 text-white font-mono">0.25x</option>
                      <option value="0.5" className="bg-dark-900 text-white font-mono">0.5x</option>
                      <option value="0.75" className="bg-dark-900 text-white font-mono">0.75x</option>
                      <option value="1.0" className="bg-dark-900 text-lime-neon font-bold font-mono">1.0x (Normal)</option>
                      <option value="1.25" className="bg-dark-900 text-white font-mono">1.25x</option>
                      <option value="1.5" className="bg-dark-900 text-white font-mono">1.5x (Fast)</option>
                      <option value="1.75" className="bg-dark-900 text-white font-mono">1.75x</option>
                      <option value="2.0" className="bg-dark-900 text-white font-mono">2.0x (Max)</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none group-hover:text-lime-neon transition-colors" />
                  </div>
                </div>

                {/* Clip Duration Pill - Strictly No-Wrap */}
                <div className="shrink-0 whitespace-nowrap bg-dark-950/90 px-2 py-1 rounded-xl border border-dark-800 text-right select-none min-w-[76px]">
                  <div className="text-[8px] uppercase tracking-wider font-bold text-slate-400 leading-tight whitespace-nowrap">Clip Time</div>
                  <div className="font-mono text-[11px] font-extrabold text-lime-neon leading-tight flex items-center justify-end gap-1 whitespace-nowrap">
                    <span className="whitespace-nowrap">{formatSec(clipCurrentTime)}</span>
                    <span className="text-slate-500 font-normal">/</span>
                    <span className="whitespace-nowrap">{formatSec(clipTotalDuration)}</span>
                  </div>
                </div>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 bg-dark-950/80 px-2.5 py-1.5 rounded-xl border border-dark-800 text-xs">
                <button onClick={toggleMute} className="text-slate-400 hover:text-white cursor-pointer">
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-lime-neon" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="flex-1 accent-lime-neon cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 font-mono w-7 text-right">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>
              </div>
            </div>



            {/* Framing Style Selector */}
            <div className="space-y-1.5 pt-1 border-t border-dark-800">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Framing Style
              </label>
              <div className="grid grid-cols-2 p-0.5 bg-dark-950 rounded-xl border border-dark-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => onChangeCrop?.({ mode: 'blur_fill' })}
                  className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    cropMode === 'blur_fill'
                      ? 'bg-lime-neon text-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Blurred BG
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCrop?.({ mode: 'custom_crop' })}
                  className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    cropMode === 'custom_crop'
                      ? 'bg-lime-neon text-black shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Smart Crop
                </button>
              </div>
            </div>

            {/* AI Auto-Speaker Focus Action */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-[11px] text-slate-300 font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-lime-neon fill-lime-neon" />
                Auto-Speaker Focus
              </span>
              <button
                type="button"
                onClick={handleRunAutoTrack}
                disabled={isAutoTracking}
                className="px-2.5 py-1 bg-lime-neon hover:bg-lime-400 text-black rounded-lg font-extrabold text-[10px] flex items-center gap-1 transition shadow-neon-sm cursor-pointer disabled:opacity-50"
                title="AI detects all speakers in video and shifts camera automatically"
              >
                {isAutoTracking ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 fill-black" />
                )}
                <span>{isAutoTracking ? 'Tracking...' : '⚡ Auto-Track (AI)'}</span>
              </button>
            </div>

            {/* AI Tracking Overlay Toggle */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <span className="text-[11px] text-slate-400 font-semibold">AI Camera View</span>
              <button
                onClick={onToggleCropInspector}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isCropInspectorOpen
                    ? 'bg-lime-neon/20 border-lime-neon text-lime-neon'
                    : 'bg-dark-950 border-dark-750 text-slate-400 hover:text-white'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>{isCropInspectorOpen ? 'Hide AI View' : 'View AI Framing'}</span>
              </button>
            </div>

            {/* Original Channel Attribution Badge with One-Click Edit */}
            <div className="flex items-center justify-between text-xs bg-dark-950/80 px-2.5 py-1.5 rounded-xl border border-dark-800 text-[11px]">
              <span className="text-slate-400 font-semibold flex items-center gap-1.5 shrink-0">
                <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />
                Channel Credit
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
                    className="bg-dark-900 border border-lime-neon/60 rounded px-1.5 py-0.5 text-xs text-white font-bold w-full outline-none focus:ring-1 focus:ring-lime-neon"
                    placeholder="Channel Name"
                  />
                  <button
                    onClick={handleSaveChannel}
                    type="button"
                    className="p-1 rounded bg-lime-neon text-black hover:bg-lime-400 shrink-0 cursor-pointer"
                    title="Save"
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </button>
                  <button
                    onClick={() => setIsEditingChannel(false)}
                    type="button"
                    className="p-1 rounded bg-dark-800 text-slate-400 hover:text-white shrink-0 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 max-w-[200px]">
                  <span className="font-bold text-white truncate" title={channelCredit}>
                    {channelCredit}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartEditChannel}
                    className="text-slate-400 hover:text-lime-neon p-0.5 transition cursor-pointer"
                    title="Edit Channel Credit"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Render & Shorts Kit Action Buttons */}
            {selectedClip && (
              <div className="space-y-1.5 pt-1.5 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedClip?.clean_render_status === 'completed' && selectedClip?.rendered_clean_file) {
                      window.location.href = api.getClipCleanDownloadUrl(selectedClip.id);
                    } else {
                      onOpenExport?.('clean', false);
                    }
                  }}
                  className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold py-2.5 px-3 rounded-xl transition shadow-neon-sm flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
                  title="Render and download 9:16 Short (1080x1920 HD)"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {selectedClip?.clean_render_status === 'completed' && selectedClip?.rendered_clean_file
                      ? 'Download 9:16 Short (HD)'
                      : 'Render 9:16 Short (HD)'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    onClick={onOpenShortsKit}
                    className="w-full bg-dark-950 hover:bg-dark-800 text-white font-bold border border-dark-700 hover:border-lime-neon/50 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate"
                    title="Download Upload Kit (.MD Description, Creator Credits, & ZIP Bundle)"
                  >
                    <FileText className="w-3.5 h-3.5 text-lime-neon shrink-0" />
                    <span className="truncate">Shorts Kit</span>
                  </button>

                  {onDeleteClip && (
                    <button
                      onClick={() => onDeleteClip(selectedClip)}
                      className="w-full bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 font-bold border border-red-800/50 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate"
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
