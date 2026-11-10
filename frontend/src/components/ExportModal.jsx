import React, { useState, useEffect, useCallback, useRef } from 'react';
import clipitLogo from '../assets/img/clipit_logo.png';
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

export default function ExportModal({ isOpen, onClose, clip, initialMode = 'clean', forceRender = false, onRenderComplete }) {
  const [renderMode, setRenderMode] = useState(initialMode); // 'clean' default while captions are paused
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

  const startRender = useCallback(async (modeToRender, force = false) => {
    const activeClip = clipRef.current || clip;
    if (!activeClip) return;
    const mode = modeToRender || renderMode;
    setRenderMode(mode);
    setStatus('rendering');
    setProgress(18);
    setErrorMessage('');
    clearPolling();

    try {
      let renderRes;
      const renderPayload = {
        crop_mode: activeClip.crop_mode,
        crop_x: activeClip.crop_x,
        crop_y: activeClip.crop_y,
        crop_zoom: activeClip.crop_zoom,
        start_time: activeClip.start_time,
        end_time: activeClip.end_time,
        caption_style: activeClip.caption_style,
        force,
      };

      if (mode === 'clean') {
        renderRes = await api.renderCleanClip(activeClip.id, renderPayload);
      } else {
        renderRes = await api.renderClip(activeClip.id, renderPayload);
      }

      // Instant cache hit: video was already rendered with identical settings
      if (renderRes?.cached || renderRes?.status === 'completed') {
        const fileKey = mode === 'clean' ? 'rendered_clean_file' : 'rendered_file';
        const fileUrl = renderRes[fileKey] || (mode === 'clean' ? activeClip.rendered_clean_file : activeClip.rendered_file);
        if (fileUrl) {
          clearPolling();
          setStatus('completed');
          setProgress(100);
          const fullUrl = fileUrl.startsWith('http')
            ? fileUrl
            : `${API_BASE_URL}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}?t=${Date.now()}`;
          setRenderedUrl(fullUrl);
          onRenderComplete?.(activeClip.id, fileUrl, mode);
          return;
        }
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

    const targetMode = initialMode || 'clean';
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-border-cream w-full max-w-lg rounded-stadium shadow-card-elevated overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-cream flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img src={clipitLogo} alt="CLIPIT" className="h-5 w-auto object-contain select-none" />
            <div>
              <span className="text-[9px] bg-canvas-cream text-charcoal border border-border-cream font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                9:16 Export
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-gray hover:text-ink-black p-1.5 rounded-full hover:bg-canvas-cream transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto">
          {status === 'rendering' && (
            <div className="py-4 flex flex-col items-center text-center space-y-4">
              {/* Spinner */}
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-lifted-cream border border-border-cream flex items-center justify-center p-2 relative z-10 shadow-sm">
                  <Sparkles className="w-6 h-6 text-signal-orange" />
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-dashed border-signal-orange/40 border-t-signal-orange animate-spin" />
              </div>

              {/* Title & Status */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-canvas-cream border border-border-cream text-charcoal text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                  1080x1920 Full HD Export
                </div>
                <h3 className="text-base font-extrabold text-ink-black tracking-tight">
                  Your 9:16 Short is Rendering...
                </h3>
                <p className="text-xs text-slate-gray font-medium max-w-xs mx-auto leading-tight">
                  {isCleanMode
                    ? progress < 40
                      ? 'Extracting HD media frames & vocal audio...'
                      : progress < 80
                      ? 'Composing 1080×1920 layout & auto-camera framing...'
                      : 'Finalizing clean MP4 export...'
                    : 'Finalizing hardware-accelerated export...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full space-y-2 bg-lifted-cream p-4 rounded-2xl border border-border-cream">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-charcoal flex items-center gap-1.5 font-bold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-signal-orange animate-pulse" />
                    Rendering Short
                  </span>
                  <span className="text-ink-black font-extrabold text-xs bg-white px-2.5 py-0.5 rounded-full border border-border-cream shadow-sm">
                    {Math.round(progress)}%
                  </span>
                </div>

                <div className="w-full bg-canvas-cream rounded-full h-2.5 overflow-hidden p-0.5 border border-border-cream">
                  <div
                    className="bg-signal-orange h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(6, Math.min(100, progress))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-gray font-mono pt-0.5">
                  <span>1080 × 1920 Vertical</span>
                  <span>NVENC Hardware 60fps</span>
                </div>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
              {/* Left Column: Compact 9:16 Video Player Preview */}
              <div className="w-36 sm:w-40 aspect-[9/16] shrink-0 bg-black rounded-2xl overflow-hidden border-2 border-border-cream shadow-sm flex items-center justify-center">
                <video
                  src={renderedUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Right Column: Title, Metadata & Action Buttons */}
              <div className="flex-1 flex flex-col min-w-0 space-y-3 w-full">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-ink-black text-[10px] font-bold bg-canvas-cream px-2.5 py-0.5 rounded-full border border-border-cream mb-1">
                    <CheckCircle className="w-3.5 h-3.5 text-signal-orange" /> Ready for YouTube Shorts
                  </div>
                  <h3 className="text-sm font-bold text-ink-black truncate tracking-tight" title={clip.title}>
                    {clip.title}
                  </h3>
                  <p className="text-[10px] text-slate-gray font-mono">
                    1080 × 1920 Full HD MP4 • Ready to Share
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <a
                    href={api.getClipCleanDownloadUrl(clip.id)}
                    download
                    className="w-full bg-ink-black hover:bg-black text-white font-extrabold text-xs py-3 px-4 rounded-cta transition shadow-card-soft flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                    title="Download 9:16 short"
                  >
                    <Download className="w-4 h-4 text-white stroke-[2.5]" />
                    <span>Download Short (1080x1920)</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => startRender('clean', true)}
                    className="w-full bg-canvas-cream hover:bg-lifted-cream text-charcoal border border-border-cream font-bold text-xs py-2 px-3 rounded-full transition flex items-center justify-center gap-2 cursor-pointer"
                    title="Re-render 9:16 short"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-signal-orange" />
                    <span>Re-Render Short (HD)</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={api.getClipDescriptionDownloadUrl(clip.id)}
                      download
                      className="bg-white hover:bg-canvas-cream text-charcoal border border-border-cream text-[11px] font-bold py-2 rounded-full transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    >
                      <span>.MD Kit</span>
                    </a>

                    <a
                      href={api.getClipBundleDownloadUrl(clip.id)}
                      download
                      className="bg-white hover:bg-canvas-cream text-charcoal border border-border-cream text-[11px] font-bold py-2 rounded-full transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    >
                      <span>ZIP Pack</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="py-4 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-signal-orange mx-auto" />
              <h3 className="text-sm font-bold text-ink-black">Rendering Error</h3>
              <p className="text-xs text-clay-brown bg-canvas-cream p-3 rounded-2xl border border-border-cream">
                {errorMessage}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => startRender(renderMode, true)}
                  className="px-5 py-2 bg-ink-black text-white font-extrabold rounded-full text-xs hover:bg-black cursor-pointer"
                >
                  Retry Render
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-canvas-cream text-charcoal border border-border-cream rounded-full text-xs font-semibold hover:bg-lifted-cream cursor-pointer"
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
