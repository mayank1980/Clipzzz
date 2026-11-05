import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  Film,
  RefreshCw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Eye,
  FileText,
  Youtube,
  Trash2,
} from 'lucide-react';
import { api, API_BASE_URL } from '../services/api';
import logoImg from '../assets/logo.png';

export default function ExportModal({ isOpen, onClose, clip, initialMode = 'captioned', forceRender = false, onRenderComplete }) {
  const [renderMode, setRenderMode] = useState(initialMode); // 'captioned' | 'clean'
  const [status, setStatus] = useState('idle'); // idle, rendering, completed, failed
  const [progress, setProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const intervalRef = useRef(null);
  const hasTriggeredRef = useRef(false);
  const clipRef = useRef(clip);

  // Playback state matching main video player
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip?.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const previewVideoRef = useRef(null);

  const togglePlay = () => {
    if (!previewVideoRef.current) return;
    if (previewVideoRef.current.paused) {
      previewVideoRef.current.play();
      setIsPlaying(true);
    } else {
      previewVideoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (previewVideoRef.current) {
      setCurrentTime(previewVideoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (previewVideoRef.current) {
      setDuration(previewVideoRef.current.duration || clip?.duration || 0);
    }
  };

  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = newTime;
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (previewVideoRef.current) {
      previewVideoRef.current.playbackRate = rate;
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (previewVideoRef.current) {
      previewVideoRef.current.volume = val;
      previewVideoRef.current.muted = val === 0;
    }
  };

  const toggleMute = () => {
    if (!previewVideoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    previewVideoRef.current.muted = nextMuted;
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSkip = (seconds) => {
    if (!previewVideoRef.current) return;
    const target = Math.max(0, Math.min(duration, previewVideoRef.current.currentTime + seconds));
    previewVideoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const toggleCleanPreview = () => {
    const activeClip = clipRef.current || clip;
    if (!activeClip) return;
    if (renderMode === 'clean') {
      setRenderMode('captioned');
      setRenderedUrl(api.getClipDownloadUrl(activeClip.id));
    } else {
      if (activeClip?.clean_render_status === 'completed' && activeClip?.rendered_clean_file) {
        setRenderMode('clean');
        setRenderedUrl(api.getClipCleanDownloadUrl(activeClip.id));
      } else {
        startRender('clean');
      }
    }
  };

  useEffect(() => {
    clipRef.current = clip;
  }, [clip]);

  // Sync mode whenever modal opens or initialMode changes
  useEffect(() => {
    if (isOpen) {
      setRenderMode(initialMode || 'captioned');
    } else {
      hasTriggeredRef.current = false;
      clearPolling();
    }
  }, [isOpen, initialMode]);

  const clearPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startRender = useCallback(async (modeToRender) => {
    const activeClip = clipRef.current || clip;
    if (!activeClip) return;
    const mode = modeToRender || renderMode;
    setRenderMode(mode);
    setStatus('rendering');
    setProgress(18);
    setErrorMessage('');
    clearPolling();

    try {
      if (mode === 'clean') {
        await api.renderCleanClip(activeClip.id);
      } else {
        await api.renderClip(activeClip.id, {
          crop_mode: activeClip.crop_mode,
          crop_x: activeClip.crop_x,
          crop_y: activeClip.crop_y,
          crop_zoom: activeClip.crop_zoom,
          caption_style: activeClip.caption_style,
        });
      }

      // Poll render status
      intervalRef.current = setInterval(async () => {
        try {
          const res = await api.getClipRenderStatus(activeClip.id);

          if (mode === 'clean') {
            if (res.clean_render_status === 'completed' && res.rendered_clean_file) {
              clearPolling();
              setStatus('completed');
              setProgress(100);
              const cleanUrl = res.rendered_clean_file.startsWith('http')
                ? res.rendered_clean_file
                : `${API_BASE_URL}${res.rendered_clean_file.startsWith('/') ? '' : '/'}${res.rendered_clean_file}?t=${Date.now()}`;
              setRenderedUrl(cleanUrl);
              onRenderComplete?.(activeClip.id, res.rendered_clean_file, 'clean');

              // Automatically trigger clean MP4 download once completed
              const dlLink = document.createElement('a');
              dlLink.href = api.getClipCleanDownloadUrl(activeClip.id);
              dlLink.download = '';
              document.body.appendChild(dlLink);
              dlLink.click();
              document.body.removeChild(dlLink);

            } else if (res.clean_render_status === 'failed') {
              clearPolling();
              setStatus('failed');
              setErrorMessage(res.error_message || 'Clean rendering failed');
            } else {
              setProgress((prev) => Math.min(95, prev + 10));
            }

          } else {
            // Captioned render
            if (res.render_status === 'completed' && res.rendered_file) {
              clearPolling();
              setStatus('completed');
              setProgress(100);
              const fullUrl = res.rendered_file.startsWith('http')
                ? res.rendered_file
                : `${API_BASE_URL}${res.rendered_file.startsWith('/') ? '' : '/'}${res.rendered_file}?t=${Date.now()}`;
              setRenderedUrl(fullUrl);
              onRenderComplete?.(activeClip.id, res.rendered_file, 'captioned');
            } else if (res.render_status === 'failed') {
              clearPolling();
              setStatus('failed');
              setErrorMessage(res.error_message || 'Rendering failed');
            } else {
              const serverProg = typeof res.render_progress === 'number' ? res.render_progress : 0;
              setProgress((prev) => Math.min(96, Math.max(prev + 12, serverProg)));
            }
          }
        } catch (pollErr) {
          console.error('Error polling render status', pollErr);
        }
      }, 1000);

    } catch (err) {
      clearPolling();
      setStatus('failed');
      setErrorMessage(err.message || 'Failed to start rendering');
    }
  }, [renderMode, onRenderComplete]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearPolling();
  }, []);

  useEffect(() => {
    if (!isOpen || !clip) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    const targetMode = initialMode || 'captioned';
    setRenderMode(targetMode);

    if (targetMode === 'clean') {
      if (!forceRender && clip.clean_render_status === 'completed' && clip.rendered_clean_file) {
        setStatus('completed');
        setProgress(100);
        setRenderedUrl(
          clip.rendered_clean_file.startsWith('http')
            ? clip.rendered_clean_file
            : `${API_BASE_URL}${clip.rendered_clean_file.startsWith('/') ? '' : '/'}${clip.rendered_clean_file}?t=${Date.now()}`
        );
        return;
      }
      startRender('clean');
    } else {
      if (!forceRender && clip.render_status === 'completed' && clip.rendered_file) {
        setStatus('completed');
        setProgress(100);
        setRenderedUrl(
          clip.rendered_file.startsWith('http')
            ? clip.rendered_file
            : `${API_BASE_URL}${clip.rendered_file.startsWith('/') ? '' : '/'}${clip.rendered_file}?t=${Date.now()}`
        );
        return;
      }
      startRender('captioned');
    }
  }, [isOpen, initialMode, forceRender, startRender]);

  if (!isOpen || !clip) return null;

  const isCleanMode = renderMode === 'clean';
  const hasCleanReady = clip?.clean_render_status === 'completed' && clip?.rendered_clean_file;
  const hasCaptionedReady = clip?.render_status === 'completed' && clip?.rendered_file;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className={`bg-dark-900 border border-dark-700 w-full transition-all duration-300 ${status === 'completed' ? 'max-w-4xl' : 'max-w-lg'} rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col`}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-dark-750 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-dark-950 border border-lime-neon/40 flex items-center justify-center p-1 shadow-neon-sm">
              <img src={logoImg} alt="CLIPZZZ" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white flex items-center gap-1.5 leading-tight">
                CLIPZZZ <span className="text-[10px] bg-lime-neon text-black font-extrabold px-1.5 py-0.2 rounded-full">AI</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-medium leading-tight">
                {isCleanMode ? 'Clean Short Export (No Captions)' : '9:16 Shorts Export Studio'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto scrollbar-thin">
          {status === 'rendering' && (
            <div className="py-4 flex flex-col items-center text-center space-y-4">
              {/* Animated Brand Hero Ring */}
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-dark-950 border-2 border-lime-neon/50 flex items-center justify-center p-2 shadow-neon relative z-10">
                  <img src={logoImg} alt="CLIPZZZ Logo" className="w-full h-full object-contain animate-pulse" />
                </div>
                <div className="absolute -inset-2 rounded-3xl border-2 border-dashed border-lime-neon/40 border-t-lime-neon animate-spin" />
              </div>

              {/* Title & Dynamic Status */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-lime-neon/15 border border-lime-neon/30 text-lime-neon text-[10px] font-extrabold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 fill-lime-neon" />
                  {isCleanMode ? 'CLEAN SHORT • NO CAPTIONS' : 'CLIPZZZ AI STUDIO'}
                </div>
                <h3 className="text-base font-black text-white tracking-wide">
                  {isCleanMode ? 'Your Clean Video is Rendering...' : 'Your Video is Rendering...'}
                </h3>
                <p className="text-xs text-slate-300 font-medium max-w-xs mx-auto leading-tight">
                  {isCleanMode
                    ? progress < 40
                      ? 'Extracting HD media frames & vocal audio...'
                      : progress < 80
                      ? 'Composing 1080×1920 layout & auto-camera framing (clean)...'
                      : 'Finalizing hardware-accelerated clean MP4 export...'
                    : progress < 35
                    ? 'Extracting HD media frames & vocal audio...'
                    : progress < 70
                    ? 'Composing 1080×1920 layout & auto-camera framing...'
                    : progress < 95
                    ? 'Burning kinetic animated subtitles & creator watermark...'
                    : 'Finalizing hardware-accelerated MP4 export...'}
                </p>
              </div>

              {/* Progress Percentage Display & Glowing Bar */}
              <div className="w-full space-y-1.5 bg-dark-950/80 p-3 rounded-2xl border border-dark-800">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 flex items-center gap-1.5 font-bold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-lime-neon animate-pulse" />
                    {isCleanMode ? 'Rendering Clean Short' : 'Rendering Short'}
                  </span>
                  <span className="text-lime-neon font-black text-xs bg-lime-neon/15 px-2 py-0.5 rounded-lg border border-lime-neon/30 shadow-neon-sm">
                    {Math.round(progress)}%
                  </span>
                </div>

                <div className="w-full bg-dark-900 rounded-full h-2.5 overflow-hidden p-0.5 border border-dark-750">
                  <div
                    className="bg-gradient-to-r from-lime-400 to-lime-neon h-full rounded-full transition-all duration-300 shadow-neon relative"
                    style={{ width: `${Math.max(6, Math.min(100, progress))}%` }}
                  >
                    <div className="absolute inset-0 bg-white/25 animate-pulse rounded-full" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
                  <span>1080 × 1920 Vertical</span>
                  <span>NVENC Hardware 60fps</span>
                </div>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6">
              {/* Left Column: Full 9:16 Shorts Phone Mockup Video Player */}
              <div className="relative aspect-[9/16] w-64 sm:w-72 bg-black rounded-3xl overflow-hidden shadow-2xl border-2 border-dark-700/80 flex items-center justify-center shrink-0 group">
                <video
                  ref={previewVideoRef}
                  src={renderedUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Top Overlay Badges */}
                <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
                  <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-1.5 border border-white/10 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-lime-neon animate-pulse" />
                    Speaker Focus
                  </div>
                  {(clip.channel_credit || 'RealHit') && (
                    <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white border border-white/10 shadow-lg">
                      Credit - {clip.channel_credit || 'RealHit'}
                    </div>
                  )}
                </div>

                {/* Center Hover Play/Pause Button */}
                <button
                  type="button"
                  onClick={togglePlay}
                  className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity cursor-pointer ${
                    isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
                  }`}
                >
                  <div className="w-14 h-14 rounded-full bg-lime-neon text-black flex items-center justify-center shadow-neon transition hover:scale-110">
                    {isPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </div>
                </button>
              </div>

              {/* Right Column: Full Studio Deck matching main player */}
              <div className="flex-1 flex flex-col min-w-0 space-y-4 w-full">
                {/* Scene Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-dark-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse" />
                    <span className="font-extrabold text-white text-sm tracking-wide">
                      SCENE #{clip.id ? clip.id.substring(0, 4).toUpperCase() : 'CLIP'}
                    </span>
                    <span className="bg-dark-950 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold text-slate-300 border border-dark-800">
                      {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-dark-950 px-2.5 py-1 rounded-full text-[11px] font-bold text-lime-neon border border-lime-neon/30">
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>9:16 Shorts</span>
                  </div>
                </div>

                {/* Transport Controls Row */}
                <div className="flex items-center justify-between gap-2 bg-dark-950/80 p-2.5 rounded-2xl border border-dark-800">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-xl bg-lime-neon hover:bg-lime-400 text-black flex items-center justify-center shadow-neon-sm transition cursor-pointer"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(-5)}
                      className="w-8 h-8 rounded-lg bg-dark-900 hover:bg-dark-800 text-slate-300 hover:text-white flex items-center justify-center border border-dark-750 transition cursor-pointer"
                      title="Rewind 5s"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(5)}
                      className="w-8 h-8 rounded-lg bg-dark-900 hover:bg-dark-800 text-slate-300 hover:text-white flex items-center justify-center border border-dark-750 transition cursor-pointer"
                      title="Skip 5s"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Speed Selector */}
                  <div className="flex items-center gap-1 bg-dark-900 px-1.5 py-1 rounded-xl border border-dark-750">
                    <Sparkles className="w-3 h-3 text-lime-neon" />
                    {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleSpeedChange(rate)}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-lime-neon text-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Clip Time */}
                  <div className="text-right pl-2">
                    <div className="text-[9px] uppercase font-bold text-slate-400 leading-none">Clip Time</div>
                    <div className="text-xs font-mono font-bold text-lime-neon">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>
                </div>

                {/* Volume Slider Row */}
                <div className="flex items-center gap-2 bg-dark-950/60 px-3 py-2 rounded-xl border border-dark-800">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
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
                  <span className="text-[10px] text-slate-400 font-mono w-8 text-right">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>

                {/* Framing Style */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    Framing Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled
                      className="bg-dark-950 text-slate-500 font-bold text-xs py-2 px-3 rounded-xl border border-dark-800 cursor-not-allowed opacity-60"
                    >
                      Blurred BG
                    </button>
                    <button
                      type="button"
                      className="bg-lime-neon text-black font-extrabold text-xs py-2 px-3 rounded-xl shadow-neon-sm cursor-default"
                    >
                      Smart Crop
                    </button>
                  </div>
                </div>

                {/* AI Features Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-dark-950/80 px-3 py-2 rounded-xl border border-dark-800 flex items-center gap-1.5 text-xs text-white font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-lime-neon" />
                    <span>Auto-Speaker Focus</span>
                  </div>
                  <div className="bg-lime-neon/15 px-3 py-2 rounded-xl border border-lime-neon/30 flex items-center justify-center gap-1.5 text-xs text-lime-neon font-bold">
                    <Sparkles className="w-3.5 h-3.5 fill-lime-neon" />
                    <span>Auto-Track (AI)</span>
                  </div>
                </div>

                {/* Channel Credit */}
                <div className="flex items-center justify-between bg-dark-950/60 px-3 py-2 rounded-xl border border-dark-800 text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-red-500" />
                    Channel Credit
                  </span>
                  <span className="font-bold text-white">
                    {clip.channel_credit || 'RealHit'}
                  </span>
                </div>

                {/* Toggle Captions / Clean Preview Button */}
                <button
                  type="button"
                  onClick={toggleCleanPreview}
                  className="w-full bg-dark-950 hover:bg-dark-850 text-slate-200 hover:text-white font-bold border border-dark-700 hover:border-lime-neon/40 py-2 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-lime-neon" />
                  <span>{isCleanMode ? 'Preview With Captions' : 'Preview Without Captions'}</span>
                </button>

                {/* Main Action Download Buttons */}
                <div className="space-y-2 pt-1 border-t border-dark-800">
                  {/* Primary Download Button */}
                  <a
                    href={isCleanMode ? api.getClipCleanDownloadUrl(clip.id) : api.getClipDownloadUrl(clip.id)}
                    download
                    className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs py-3 px-3 rounded-xl transition shadow-neon flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" />
                    <span>{isCleanMode ? 'Download Clean Short (No Captions)' : 'Download Short (With Captions)'}</span>
                  </a>

                  {/* Secondary Clean / Captioned Alternate */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isCleanMode) {
                        if (hasCaptionedReady) {
                          window.location.href = api.getClipDownloadUrl(clip.id);
                        } else {
                          startRender('captioned');
                        }
                      } else {
                        if (hasCleanReady) {
                          window.location.href = api.getClipCleanDownloadUrl(clip.id);
                        } else {
                          startRender('clean');
                        }
                      }
                    }}
                    className="w-full bg-dark-950 hover:bg-dark-850 text-slate-200 hover:text-white font-bold border border-dark-700 hover:border-lime-neon/50 py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5 text-lime-neon" />
                    <span>
                      {isCleanMode
                        ? hasCaptionedReady
                          ? 'Download Short (With Captions)'
                          : 'Render Short (With Captions)'
                        : hasCleanReady
                        ? 'Download Clean (No Captions)'
                        : 'Render Clean (No Captions)'}
                    </span>
                  </button>

                  {/* Shorts Kit & Re-render Fresh */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <a
                      href={api.getClipBundleDownloadUrl(clip.id)}
                      download
                      className="bg-dark-950 hover:bg-dark-850 text-white font-bold border border-dark-700 hover:border-lime-neon/50 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate"
                      title="Download Shorts Kit (MD Description & ZIP Pack)"
                    >
                      <FileText className="w-3.5 h-3.5 text-lime-neon shrink-0" />
                      <span className="truncate">Shorts Kit</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => startRender(renderMode)}
                      className="bg-dark-950 hover:bg-dark-850 text-slate-300 hover:text-lime-neon font-bold border border-dark-700 hover:border-lime-neon/40 py-2 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer truncate"
                      title="Re-render video fresh"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-lime-neon shrink-0" />
                      <span className="truncate">Re-render Fresh</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="py-4 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <h3 className="text-sm font-bold text-white">Rendering Encountered an Error</h3>
              <p className="text-xs text-red-300 bg-red-950/50 p-2.5 rounded-xl border border-red-800">
                {errorMessage}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => startRender(renderMode)}
                  className="px-4 py-1.5 bg-lime-neon text-black font-extrabold rounded-xl text-xs hover:bg-lime-400 cursor-pointer"
                >
                  Retry Render
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 bg-dark-800 text-white rounded-xl text-xs font-semibold hover:bg-dark-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
