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
      <div className="bg-dark-900 border border-dark-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
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
        <div className="p-4 sm:p-5 overflow-y-auto scrollbar-thin">
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
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
              {/* Left Column: Compact 9:16 Video Player Preview */}
              <div className="w-36 sm:w-40 aspect-[9/16] shrink-0 bg-black rounded-2xl overflow-hidden border border-lime-neon/40 shadow-neon flex items-center justify-center">
                <video
                  src={renderedUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Right Column: Title, Metadata & Action Buttons */}
              <div className="flex-1 flex flex-col min-w-0 space-y-2.5 w-full">
                <div>
                  <div className="inline-flex items-center gap-1 text-lime-neon text-[10px] font-bold bg-lime-neon/15 px-2.5 py-0.5 rounded-full border border-lime-neon/30 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Ready for YouTube Shorts
                  </div>
                  <h3 className="text-sm font-bold text-white truncate" title={clip.title}>
                    {clip.title}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    1080 × 1920 MP4 • {isCleanMode ? 'Clean (No Captions)' : 'With Dynamic Captions'}
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  {/* Clean Mode Primary Button */}
                  {isCleanMode ? (
                    <>
                      <a
                        href={api.getClipCleanDownloadUrl(clip.id)}
                        download
                        className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs py-2.5 px-3 rounded-xl transition shadow-neon flex items-center justify-center gap-2 cursor-pointer"
                        title="Download clean 9:16 short without burned-in subtitles"
                      >
                        <Film className="w-4 h-4 text-black stroke-[2.5]" />
                        <span>Download Clean Short (No Captions)</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => startRender('captioned')}
                        className="w-full bg-dark-950 hover:bg-dark-850 text-slate-200 hover:text-white border border-dark-700 hover:border-lime-neon/50 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                        title="Render captioned version with dynamic animated subtitles"
                      >
                        <Download className="w-3.5 h-3.5 text-lime-neon" />
                        <span>{hasCaptionedReady ? 'Switch to Captions Short' : 'Render Short (With Captions)'}</span>
                      </button>
                    </>
                  ) : (
                    /* Captioned Mode Primary Button */
                    <>
                      <a
                        href={api.getClipDownloadUrl(clip.id)}
                        download
                        className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs py-2.5 px-3 rounded-xl transition shadow-neon flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4 stroke-[2.5]" />
                        <span>Download Video MP4 (With Captions)</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          if (hasCleanReady) {
                            window.location.href = api.getClipCleanDownloadUrl(clip.id);
                          } else {
                            startRender('clean');
                          }
                        }}
                        className="w-full bg-dark-950 hover:bg-dark-850 text-slate-200 hover:text-white border border-dark-700 hover:border-lime-neon/50 font-bold text-xs py-2 px-3 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                        title="Download or render clean 9:16 short without subtitles"
                      >
                        <Film className="w-3.5 h-3.5 text-lime-neon" />
                        <span>{hasCleanReady ? 'Download Clean Short (No Captions)' : 'Render & Download Clean (No Captions)'}</span>
                      </button>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={api.getClipDescriptionDownloadUrl(clip.id)}
                      download
                      className="bg-dark-800 hover:bg-dark-750 text-slate-200 border border-dark-700 hover:text-white text-[11px] font-bold py-2 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>.MD Kit</span>
                    </a>

                    <a
                      href={api.getClipBundleDownloadUrl(clip.id)}
                      download
                      className="bg-dark-800 hover:bg-dark-750 text-lime-neon border border-lime-neon/40 text-[11px] font-bold py-2 rounded-xl transition flex items-center justify-center gap-1 hover:bg-lime-neon/10 cursor-pointer"
                    >
                      <span>ZIP Pack</span>
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => startRender(renderMode)}
                    className="w-full bg-dark-950 hover:bg-dark-850 text-slate-400 hover:text-lime-neon border border-dark-800 hover:border-lime-neon/40 text-[10px] font-semibold py-1.5 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer mt-0.5"
                    title="Re-render video fresh"
                  >
                    <RefreshCw className="w-3 h-3 text-lime-neon" />
                    <span>Re-render Fresh</span>
                  </button>
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
