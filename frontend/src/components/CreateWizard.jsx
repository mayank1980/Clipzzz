import React, { useState, useEffect } from 'react';
import {
  Youtube,
  UploadCloud,
  Sparkles,
  Smartphone,
  UserCheck,
  Clock,
  Layers,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  BookOpen,
  Flame,
  HardDrive,
  RefreshCw,
  Zap,
  Download,
  X,
  Key,
} from 'lucide-react';
import { api } from '../services/api';

export default function CreateWizard({ onProjectCreated, userProfile, onOpenKeyModal, initialUrl = '', onOpenOrbit }) {
  const [sourceType, setSourceType] = useState('youtube'); // 'youtube' or 'upload'
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl || '');

  useEffect(() => {
    if (initialUrl) {
      setSourceType('youtube');
      setYoutubeUrl(initialUrl);
      setIsLinkConfirmed(false);
      setVideoInfo(null);
      setInspectError('');
    }
  }, [initialUrl]);
  const [selectedFile, setSelectedFile] = useState(null);

  // Settings requested by user
  const [targetRatio, setTargetRatio] = useState('9:16');
  const [downloadQuality, setDownloadQuality] = useState('720p');
  const [downloadFullVideo, setDownloadFullVideo] = useState(false);
  const [showDownloadConfirmModal, setShowDownloadConfirmModal] = useState(false);
  const [useExistingCache, setUseExistingCache] = useState(true);
  const [autoSpeakerTracking, setAutoSpeakerTracking] = useState(true);
  const [clipCount, setClipCount] = useState(0); // 0 (Auto), 5, 7, 9, 11, 15
  const [durationPref, setDurationPref] = useState('30-60');
  const [clippingMode, setClippingMode] = useState('story_series');
  const [isCookieUploading, setIsCookieUploading] = useState(false);
  const [cookieSuccess, setCookieSuccess] = useState(false);

  // Link confirmation & AI content analysis
  const [isLinkConfirmed, setIsLinkConfirmed] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [inspectError, setInspectError] = useState('');

  const handleUrlChange = (val) => {
    setYoutubeUrl(val);
    setIsLinkConfirmed(false);
    setVideoInfo(null);
    setInspectError('');
    const low = val.toLowerCase();
    if (
      low.includes('horror') ||
      low.includes('bhoot') ||
      low.includes('chudail') ||
      low.includes('incident') ||
      low.includes('ghost') ||
      low.includes('kahaani') ||
      low.includes('darr') ||
      low.includes('story') ||
      low.includes('kahani')
    ) {
      setClippingMode('story_series');
    } else if (low.includes('comedy') || low.includes('standup') || low.includes('roast') || low.includes('funny')) {
      setClippingMode('viral_highlights');
    }
  };

  const handleFileChange = (file) => {
    setErrorMessage('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const probeUrl = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const dur = v.duration || 0;
      URL.revokeObjectURL(probeUrl);
      if (dur > 0 && dur < 180) {
        const mins = Math.floor(dur / 60);
        const secs = Math.floor(dur % 60);
        setSelectedFile(null);
        setErrorMessage(
          `Video is too short (${mins}:${secs < 10 ? '0' : ''}${secs}). CLIPIT creates clips only from long-form videos longer than 3 minutes (3:00+).`
        );
      } else {
        setSelectedFile(file);
      }
    };
    v.onerror = () => {
      URL.revokeObjectURL(probeUrl);
      setSelectedFile(file);
    };
    v.src = probeUrl;
  };

  const handleConfirmLink = async () => {
    if (!youtubeUrl.trim()) return;
    setIsInspecting(true);
    setInspectError('');
    try {
      const res = await api.inspectUrl({
        youtube_url: youtubeUrl.trim(),
        gemini_api_key: userProfile?.gemini_api_key || '',
      });
      if (res && res.success) {
        setVideoInfo(res);
        setIsLinkConfirmed(true);
        if (res.recommended_mode) {
          setClippingMode(res.recommended_mode);
        }
        if (res.default_quality) {
          setDownloadQuality(res.default_quality);
        }
        if (res.cached_video?.exists) {
          setUseExistingCache(true);
        } else {
          setUseExistingCache(false);
        }
      } else {
        setInspectError(res?.error || 'Failed to inspect video URL.');
      }
    } catch (err) {
      console.warn('Inspect error', err);
      const serverErr = err?.response?.data?.error;
      if (serverErr) {
        setInspectError(serverErr);
        setIsLinkConfirmed(false);
      } else {
        setIsLinkConfirmed(true);
        setVideoInfo({
          platform: 'Video Stream',
          title: 'Video Stream Ready',
          duration_str: 'Ready',
          content_type: 'Dialogue / Narrative',
          recommended_mode: 'story_series',
          qualities: [{ id: '720p', label: '720p Fast (Recommended)', size_mb: 45 }],
        });
      }
    } finally {
      setIsInspecting(false);
    }
  };

  // Pipeline loading state
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [pipelineStep, setPipelineStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Auto-start elapsed timer when pipeline starts
  useEffect(() => {
    let timer = null;
    if (isLoading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Handle instant cookie file upload to bypass bot blocks
  const handleCookieUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCookieUploading(true);
    setErrorMessage('');
    try {
      const res = await api.uploadCookies(file);
      if (res && res.success) {
        setCookieSuccess(true);
        setTimeout(() => setCookieSuccess(false), 5000);
      } else {
        setErrorMessage(res?.error || 'Failed to upload cookies.');
      }
    } catch (err) {
      setErrorMessage('Failed to upload cookies file. Please verify it is a valid Netscape cookies.txt.');
    } finally {
      setIsCookieUploading(false);
      e.target.value = '';
    }
  };

  const handleStartProcess = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (sourceType === 'youtube' && !youtubeUrl) {
      setErrorMessage('Please enter a valid video URL (YouTube, Facebook, Vimeo, Twitch, X, etc.)');
      return;
    }
    if (sourceType === 'youtube' && inspectError) {
      setErrorMessage(inspectError);
      return;
    }
    if (sourceType === 'upload' && !selectedFile) {
      setErrorMessage('Please choose a local video file');
      return;
    }

    setIsLoading(true);
    setProgress(5);
    setPipelineStep(1);
    setStatusMessage('Connecting stream...');

    try {
      let payload;
      if (sourceType === 'youtube') {
        payload = {
          youtube_url: youtubeUrl,
          target_ratio: targetRatio,
          download_quality: downloadQuality,
          download_full_video: downloadFullVideo,
          use_cached_video: useExistingCache,
          auto_speaker_tracking: autoSpeakerTracking,
          requested_clip_count: clipCount,
          duration_preference: durationPref,
          clipping_mode: clippingMode,
        };
      } else {
        const formData = new FormData();
        formData.append('video_file', selectedFile);
        formData.append('target_ratio', targetRatio);
        formData.append('download_quality', downloadQuality);
        formData.append('download_full_video', downloadFullVideo);
        formData.append('use_cached_video', useExistingCache);
        formData.append('auto_speaker_tracking', autoSpeakerTracking);
        formData.append('requested_clip_count', clipCount);
        formData.append('duration_preference', durationPref);
        formData.append('clipping_mode', clippingMode);
        payload = formData;
      }

      const res = await api.importVideo(payload);
      const projectId = res.id;
      setStatusMessage('Video registered. Processing pipeline active...');

      const interval = setInterval(async () => {
        try {
          const statusRes = await api.getProjectStatus(projectId);
          const msg = statusRes.status_message || '';
          setStatusMessage(msg || 'Analyzing video...');
          if (statusRes.progress) {
            setProgress(statusRes.progress);
          }
          let dlPct = (statusRes.download_progress !== undefined && statusRes.download_progress !== null) 
            ? statusRes.download_progress 
            : 0;
          if (!dlPct && msg) {
            const dlMatch = msg.match(/(\d+)%/);
            if (dlMatch) {
              dlPct = parseInt(dlMatch[1], 10);
            }
          }
          setDownloadProgress(dlPct);

          if (statusRes.download_speed) {
            setDownloadSpeed(statusRes.download_speed);
          }
          if (statusRes.download_eta) {
            setDownloadEta(statusRes.download_eta);
          }

          const lowerMsg = msg.toLowerCase();
          if (lowerMsg.includes('analyz') || lowerMsg.includes('scan') || lowerMsg.includes('gemini') || lowerMsg.includes('trend') || lowerMsg.includes('retention') || statusRes.status === 'analyzing') {
            setPipelineStep(2);
          } else if (lowerMsg.includes('assembling') || lowerMsg.includes('package') || lowerMsg.includes('shorts package') || lowerMsg.includes('clip ') || lowerMsg.includes('validating') || lowerMsg.includes('framing')) {
            setPipelineStep(3);
          } else if (statusRes.status === 'ready' || lowerMsg.includes('ready') || lowerMsg.includes('complete')) {
            clearInterval(interval);
            setPipelineStep(4);
            setStatusMessage('All 9:16 Shorts generated successfully!');
            setTimeout(async () => {
              const fullProject = await api.getProject(projectId);
              setIsLoading(false);
              onProjectCreated(fullProject);
            }, 600);
          } else if (statusRes.status === 'failed') {
            clearInterval(interval);
            setIsLoading(false);
            setErrorMessage(statusRes.error_message || 'Processing failed');
          } else {
            setPipelineStep(1);
          }
        } catch (pollErr) {
          console.error('Polling error', pollErr);
        }
      }, 1000);

    } catch (err) {
      console.error('Create error', err);
      setIsLoading(false);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to start video processing');
    }
  };

  const hasKey = userProfile?.has_gemini_key;
  const maskedKey = userProfile?.masked_gemini_key;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 pb-10 relative">
      {/* Decorative Ghost Watermark Headline behind First Page Hero (matching Orbit Pro aesthetic) */}
      <div
        className="absolute top-2 left-1/2 -translate-x-1/2 select-none pointer-events-none text-[88px] sm:text-[150px] md:text-[190px] font-semibold tracking-tighter opacity-[0.06] text-ink-black whitespace-nowrap z-0 leading-none"
        aria-hidden="true"
      >
        CLIPIT
      </div>

      {/* Top Editorial Hero & Controls */}
      <div className="relative z-10 text-center max-w-3xl mx-auto mb-8 pb-6 border-b border-border-cream">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lifted-cream border border-border-cream mb-5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-ink-black">
            CLIPIT • Find the moment. Clip it.
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-medium leading-[1.08] tracking-tight text-ink-black mb-3">
          Long videos in. <span className="text-signal-orange">Perfect clips out.</span>
        </h1>
        <p className="text-sm text-charcoal max-w-xl mx-auto mb-5 leading-relaxed">
          Transform long YouTube, Facebook, Vimeo & Twitch videos into engaging 9:16 vertical Shorts with multi-person split screens.
        </p>

        {/* Action Strip: Masked Key Status + Orbit Pro Downloader Link */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onOpenKeyModal}
            className="flex items-center gap-2.5 bg-white border border-border-cream px-4 py-2 rounded-full cursor-pointer hover:border-signal-orange transition shadow-sm"
            title="Click to view or update your encrypted Gemini key"
          >
            <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-signal-orange' : 'bg-slate-gray'}`}></span>
            <span className="text-[10px] text-slate-gray font-bold uppercase tracking-wider">Gemini AI</span>
            <span className="text-xs font-mono font-bold text-ink-black">
              {hasKey ? maskedKey : 'Setup Key'}
            </span>
          </button>

          {onOpenOrbit && (
            <button
              type="button"
              onClick={onOpenOrbit}
              className="flex items-center gap-2 bg-white border border-border-cream hover:border-signal-orange px-4 py-2 rounded-full cursor-pointer transition shadow-sm text-xs font-bold text-ink-black"
              title="Open connected Orbit Pro Downloader (4K Video, 320kbps MP3, Instagram, Pinterest)"
            >
              <Download className="w-3.5 h-3.5 text-signal-orange" />
              <span>Orbit Pro Downloader (4K / MP3 / IG / Pin)</span>
              <ArrowRight className="w-3.5 h-3.5 text-signal-orange" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        /* Mastercard Pipeline Processing Screen */
        <div className="bg-white border border-border-cream rounded-stadium p-8 text-center max-w-xl mx-auto shadow-card-elevated space-y-6">
          <div className="relative w-20 h-20 mx-auto">
            <div className="w-20 h-20 rounded-full border-4 border-canvas-cream border-t-signal-orange animate-spin"></div>
            <Sparkles className="w-8 h-8 text-signal-orange absolute inset-0 m-auto" />
          </div>

          <div className="bg-lifted-cream border border-border-cream rounded-2xl py-3.5 px-4">
            <h3 className="text-xs font-bold text-slate-gray uppercase tracking-wider mb-1 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-signal-orange animate-ping"></span>
              Pipeline Active
            </h3>
            <p className="text-sm font-semibold text-ink-black">{statusMessage}</p>
          </div>

          {/* Live Elapsed & Progress */}
          <div className="space-y-3">
            <div className="bg-lifted-cream p-4 rounded-2xl border border-border-cream text-center flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
                <span className="text-xs font-bold text-slate-gray uppercase tracking-wider">
                  Elapsed Time
                </span>
              </div>
              <span className="text-lg font-mono font-extrabold text-ink-black bg-white border border-border-cream px-3 py-1 rounded-full shadow-sm">
                {formatTimer(elapsedSeconds)}
              </span>
            </div>

            {/* Ingest Progress Bar */}
            {downloadProgress > 0 && !statusMessage?.toLowerCase().includes('0 mb') && (
              <div className="space-y-1.5 bg-lifted-cream p-3.5 rounded-2xl border border-border-cream">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-ink-black flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
                    Download Stream
                  </span>
                  <div className="flex items-center gap-2 text-slate-gray">
                    {downloadSpeed && <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-border-cream">{downloadSpeed}</span>}
                    <span className="text-ink-black font-extrabold">{downloadProgress}%</span>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-canvas-cream rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-signal-orange rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(4, Math.min(100, downloadProgress))}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Overall Pipeline Progress */}
            <div className="space-y-1.5 bg-lifted-cream p-3.5 rounded-2xl border border-border-cream">
              <div className="flex justify-between text-xs font-mono">
                <span className="font-semibold text-slate-gray">Overall Execution</span>
                <span className="text-ink-black font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-canvas-cream rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-ink-black rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 4-Step Pipeline Indicator */}
          <div className="space-y-2.5 text-left bg-lifted-cream p-4 rounded-2xl border border-border-cream text-xs">
            {[
              { step: 1, label: `Fast Stream Ingest & Resolution Optimization (${downloadQuality})` },
              { step: 2, label: clippingMode === 'story_series'
                  ? 'AI Viral Engine: Full-Timeline Story Arc & Suspense Slicing'
                  : (clipCount === 0
                      ? 'AI Viral Engine: Full-Video Scan for Top Audience Moments'
                      : `AI Viral Engine: Selecting Top ${clipCount} High-Retention Hooks`) },
              { step: 3, label: 'Assemble 9:16 Portrait Shorts & Smart Speaker Framing' },
              { step: 4, label: 'Ready for Live Studio Preview & HD Export' },
            ].map((s) => {
              const isPast = pipelineStep > s.step;
              const isCurrent = pipelineStep === s.step;
              return (
                <div key={s.step} className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isPast
                        ? 'bg-ink-black text-white'
                        : isCurrent
                        ? 'bg-signal-orange text-white'
                        : 'bg-canvas-cream text-slate-gray border border-border-cream'
                    }`}
                  >
                    {isPast ? '✓' : s.step}
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrent
                        ? 'font-bold text-ink-black'
                        : isPast
                        ? 'text-slate-gray line-through'
                        : 'text-slate-gray'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Configuration Form */
        <form onSubmit={handleStartProcess} className="space-y-6">
          {/* Section 1: Video Source */}
          <div className="bg-white border border-border-cream rounded-stadium p-6 sm:p-8 shadow-card-soft">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider text-slate-gray mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                  <span>Step 1</span>
                </div>
                <h3 className="text-lg font-bold text-ink-black">Video Source</h3>
              </div>

              {/* Source Switcher Pill */}
              <div className="flex bg-canvas-cream p-1 rounded-full border border-border-cream text-xs">
                <button
                  type="button"
                  onClick={() => setSourceType('youtube')}
                  className={`px-4 py-1.5 rounded-full font-bold transition cursor-pointer ${
                    sourceType === 'youtube'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  Video Link
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('upload')}
                  className={`px-4 py-1.5 rounded-full font-bold transition cursor-pointer ${
                    sourceType === 'upload'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  File Upload
                </button>
              </div>
            </div>

            {sourceType === 'youtube' ? (
              <div>
                <div className="relative">
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or Facebook, Vimeo, Twitch, X link"
                    className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-5 py-3.5 text-xs sm:text-sm text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange focus:ring-2 focus:ring-signal-orange/15 shadow-inner"
                  />
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => handleUrlChange('')}
                      className="absolute right-3.5 top-3.5 text-slate-gray hover:text-ink-black"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-gray mt-2 ml-2">
                  Supports long-form videos (3+ minutes) from YouTube, Facebook, Vimeo, Twitch, X, Instagram, Dailymotion & direct links.
                </p>

                {/* Confirmation Prompt when URL is entered */}
                {youtubeUrl.trim().length > 10 && !isLinkConfirmed && (
                  <div className="mt-4 p-5 rounded-[28px] bg-lifted-cream border border-border-cream shadow-sm">
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-full bg-signal-orange/10 flex items-center justify-center text-signal-orange shrink-0 mt-0.5">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-ink-black flex items-center gap-2">
                          Confirm Video Source
                          <span className="text-[9px] bg-canvas-cream text-slate-gray border border-border-cream font-bold px-2.5 py-0.5 rounded-full uppercase">
                            Verification
                          </span>
                        </h4>
                        <p className="text-xs text-slate-gray mt-1">
                          Confirm link to pre-scan stream metadata, duration, and AI content categorization.
                        </p>

                        {inspectError && (
                          <p className="text-xs text-signal-orange mt-2 font-medium">
                            {inspectError}
                          </p>
                        )}

                        <div className="flex items-center gap-2.5 mt-3.5">
                          <button
                            type="button"
                            disabled={isInspecting}
                            onClick={handleConfirmLink}
                            className="px-5 py-2.5 rounded-full bg-ink-black hover:bg-black text-white font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {isInspecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Analyzing Media Stream...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Confirm & Scan Video</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isInspecting}
                            onClick={() => {
                              setYoutubeUrl('');
                              setIsLinkConfirmed(false);
                              setVideoInfo(null);
                            }}
                            className="px-4 py-2.5 rounded-full bg-white hover:bg-canvas-cream text-slate-gray hover:text-ink-black text-xs font-semibold border border-border-cream transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmed Video Card with Satellite Micro-CTA */}
                {isLinkConfirmed && videoInfo && (
                  <div className="mt-4 p-5 rounded-[28px] bg-lifted-cream border border-border-cream shadow-sm relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {videoInfo.thumbnail_url && (
                        <div className="relative w-full sm:w-40 aspect-video rounded-2xl overflow-hidden bg-black shrink-0 shadow-sm">
                          <img
                            src={videoInfo.thumbnail_url}
                            alt={videoInfo.title}
                            className="w-full h-full object-cover"
                          />
                          {videoInfo.duration_str && (
                            <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">
                              {videoInfo.duration_str}
                            </span>
                          )}
                          {/* Attached Perimeter Satellite Micro-CTA */}
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white text-ink-black shadow-satellite flex items-center justify-center">
                            <ArrowRight className="w-3 h-3 text-signal-orange stroke-[2.5]" />
                          </div>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold text-signal-orange bg-white px-2.5 py-0.5 rounded-full border border-border-cream flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                            Verified {videoInfo.platform || 'Media'} Stream
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsLinkConfirmed(false)}
                            className="text-[10px] text-slate-gray hover:text-ink-black underline cursor-pointer"
                          >
                            Change Link
                          </button>
                        </div>

                        <h4 className="text-sm font-bold text-ink-black truncate" title={videoInfo.title}>
                          {videoInfo.title}
                        </h4>
                        {videoInfo.author_name && (
                          <p className="text-[11px] text-slate-gray mt-0.5">
                            Channel: {videoInfo.author_name}
                          </p>
                        )}

                        <div className="mt-2.5 pt-2 border-t border-border-cream flex flex-wrap items-center gap-2 text-xs">
                          <div className="text-slate-gray flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
                            <span>AI Detected:</span>
                            <span className="text-ink-black font-bold bg-white px-2.5 py-0.5 rounded-full border border-border-cream text-[11px]">
                              {videoInfo.content_type}
                            </span>
                          </div>

                          <div className="text-ink-black font-semibold flex items-center gap-1">
                            <span>➔ Recommendation:</span>
                            <span className="font-extrabold uppercase bg-ink-black text-white px-2.5 py-0.5 rounded-full text-[10px]">
                              {videoInfo.recommended_mode === 'story_series' ? 'Story Series' : 'Viral Highlights'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-dust-taupe hover:border-signal-orange rounded-3xl p-8 text-center cursor-pointer transition bg-lifted-cream">
                <input
                  type="file"
                  id="wizard-file-input"
                  accept="video/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label htmlFor="wizard-file-input" className="cursor-pointer">
                  <UploadCloud className="w-10 h-10 text-signal-orange mx-auto mb-2" />
                  <p className="text-xs sm:text-sm font-semibold text-ink-black">
                    {selectedFile ? selectedFile.name : 'Choose long-form video file (MP4, MKV, MOV)'}
                  </p>
                  <p className="text-[11px] text-slate-gray mt-1">Minimum 3 minutes • Direct upload up to 2GB</p>
                </label>
              </div>
            )}
          </div>

          {/* Section 2: Smart Speaker Tracking */}
          <div className="bg-white border border-border-cream rounded-stadium p-6 shadow-card-soft flex items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center text-signal-orange shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider text-slate-gray mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                  <span>Step 2</span>
                </div>
                <h4 className="text-sm font-bold text-ink-black flex items-center gap-2">
                  AI Active Speaker Tracking
                  <span className="text-[9px] bg-canvas-cream text-slate-gray border border-border-cream font-bold px-2 py-0.5 rounded-full">
                    9:16 Center
                  </span>
                </h4>
                <p className="text-xs text-slate-gray mt-0.5 max-w-lg">
                  Analyzes neural facial keypoints to automatically center speakers and debate turns without shaky twitches.
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => setAutoSpeakerTracking(!autoSpeakerTracking)}
              className={`w-13 h-7 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                autoSpeakerTracking ? 'bg-ink-black' : 'bg-dust-taupe'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white transition-transform ${
                  autoSpeakerTracking ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Section 3 & 4: Mode, Clip Count & Target Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Number of Clips & Mode Selection */}
            <div className="bg-white border border-border-cream rounded-stadium p-6 shadow-card-soft">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider text-slate-gray mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                    <span>Step 3</span>
                  </div>
                  <label className="text-sm font-bold text-ink-black flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-signal-orange" />
                    Clipping Mode
                  </label>
                </div>
                <span className="text-[10px] font-bold bg-canvas-cream text-charcoal px-2.5 py-0.5 rounded-full border border-border-cream">
                  {clippingMode === 'story_series' ? 'Story Series' : 'Solo Clips'}
                </span>
              </div>

              {/* Mode Selector Pill */}
              <div className="flex p-1 bg-canvas-cream rounded-full border border-border-cream mb-4 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setClippingMode('story_series')}
                  className={`flex-1 py-2 px-3 rounded-full font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    clippingMode === 'story_series'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-signal-orange" />
                  <span>Story Series</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClippingMode('viral_highlights')}
                  className={`flex-1 py-2 px-3 rounded-full font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    clippingMode === 'viral_highlights'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-signal-orange" />
                  <span>Highlights</span>
                </button>
              </div>

              {clippingMode === 'story_series' ? (
                <div className="space-y-3">
                  <div
                    onClick={() => setClipCount(0)}
                    className="p-4 rounded-2xl border border-border-cream cursor-pointer transition flex items-center justify-between bg-lifted-cream hover:border-signal-orange"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-ink-black text-white font-extrabold flex items-center justify-center text-xs shrink-0 shadow-sm">
                        Auto
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-ink-black flex items-center gap-1.5">
                          Complete Story Narrative (Part 1 to N)
                        </h5>
                        <p className="text-[11px] text-slate-gray mt-0.5">
                          Uncapped full-timeline story arc detection.
                        </p>
                      </div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-signal-orange shrink-0"></span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Auto AI Full Video Scan Button */}
                  <div
                    onClick={() => setClipCount(0)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                      clipCount === 0
                        ? 'bg-lifted-cream border-signal-orange shadow-sm text-ink-black'
                        : 'bg-white border-border-cream text-slate-gray hover:text-ink-black'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full font-extrabold text-xs flex items-center justify-center ${
                          clipCount === 0 ? 'bg-ink-black text-white' : 'bg-canvas-cream text-slate-gray'
                        }`}
                      >
                        Auto
                      </div>
                      <div>
                        <div className="text-xs font-bold text-ink-black">Auto AI Full Video Scan</div>
                        <div className="text-[10px] text-slate-gray">Selects optimal viral moments start to finish</div>
                      </div>
                    </div>
                    {clipCount === 0 && <span className="w-2.5 h-2.5 rounded-full bg-signal-orange" />}
                  </div>

                  {/* Specific Clip Counts */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[
                      { count: 5, label: '5' },
                      { count: 7, label: '7', tag: 'BEST' },
                      { count: 9, label: '9' },
                      { count: 11, label: '11', tag: 'MAX' },
                      { count: 15, label: '15' },
                    ].map((opt) => {
                      const isSelected = clipCount === opt.count;
                      return (
                        <button
                          key={opt.count}
                          type="button"
                          onClick={() => setClipCount(opt.count)}
                          className={`py-2 rounded-2xl text-center border font-bold transition cursor-pointer flex flex-col items-center justify-center ${
                            isSelected
                              ? 'bg-ink-black text-white border-ink-black shadow-sm'
                              : 'bg-white border-border-cream text-charcoal hover:bg-canvas-cream'
                          }`}
                        >
                          <span className="text-xs font-black">{opt.label}</span>
                          <span className={`text-[8px] font-semibold uppercase mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-gray'}`}>
                            {opt.tag || 'Clips'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Target Duration Preference */}
            <div className="bg-white border border-border-cream rounded-stadium p-6 shadow-card-soft">
              <div className="flex items-center gap-1.5 text-xs uppercase font-extrabold tracking-wider text-slate-gray mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-orange"></span>
                <span>Step 4</span>
              </div>
              <label className="text-sm font-bold text-ink-black mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-signal-orange" />
                Target Clip Duration
              </label>
              <p className="text-xs text-slate-gray mb-4">
                Select your preferred vertical Shorts duration window:
              </p>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: '0-30', label: '0 – 30s', tag: 'Fast Hooks' },
                  { id: '30-60', label: '30 – 60s', tag: 'Shorts Sweet' },
                  { id: '60-80', label: '60 – 80s', tag: 'Full Story' },
                ].map((dur) => {
                  const isSelected = durationPref === dur.id;
                  return (
                    <button
                      key={dur.id}
                      type="button"
                      onClick={() => setDurationPref(dur.id)}
                      className={`py-3 rounded-2xl text-xs font-bold transition border text-center cursor-pointer ${
                        isSelected
                          ? 'bg-ink-black text-white border-ink-black shadow-sm'
                          : 'bg-white border-border-cream text-charcoal hover:bg-canvas-cream'
                      }`}
                    >
                      <div className="font-extrabold">{dur.label}</div>
                      <div className={`text-[9px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-gray'}`}>{dur.tag}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Success Cookie Alert */}
          {cookieSuccess && (
            <div className="p-4 bg-white border border-border-cream rounded-2xl flex items-center gap-3 text-xs text-ink-black shadow-sm">
              <CheckCircle2 className="w-5 h-5 text-signal-orange shrink-0" />
              <div>
                <span className="font-bold">✓ YouTube cookies activated successfully!</span>
                <p className="text-slate-gray text-[11px]">Proceed with AI Shorts generation.</p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 bg-white border-2 border-signal-orange/60 rounded-2xl flex items-center gap-3 text-xs text-ink-black shadow-sm">
              <AlertCircle className="w-5 h-5 text-signal-orange shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Signature Ink Black Launch CTA */}
          <button
            type="submit"
            className="w-full bg-ink-black hover:bg-black text-white font-extrabold text-sm py-4 rounded-cta transition-all hover:scale-[1.01] shadow-card-soft flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
          >
            <Sparkles className="w-4 h-4 text-signal-orange" />
            <span>
              {clippingMode === 'story_series'
                ? `Generate Complete 9:16 Story Series (${durationPref}s)`
                : clipCount === 0
                ? `Generate Full-Timeline 9:16 Shorts (${durationPref}s)`
                : `Generate ${clipCount} 9:16 Shorts (${durationPref}s)`}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      )}
    </div>
  );
}
