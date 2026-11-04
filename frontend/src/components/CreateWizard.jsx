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
  Sliders,
  BookOpen,
  Flame,
} from 'lucide-react';
import { api } from '../services/api';
import logoImg from '../assets/logo.png';

export default function CreateWizard({ onProjectCreated, userProfile, onOpenKeyModal }) {
  const [sourceType, setSourceType] = useState('youtube'); // 'youtube' or 'upload'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Settings requested by user
  const [targetRatio, setTargetRatio] = useState('9:16'); // '9:16', '16:9', '1:1'
  const [autoSpeakerTracking, setAutoSpeakerTracking] = useState(true);
  const [clipCount, setClipCount] = useState(0); // 0 (Auto), 5, 7, 9, 11, 15
  const [durationPref, setDurationPref] = useState('30-60'); // '0-30', '30-60', '60-80'
  const [clippingMode, setClippingMode] = useState('story_series'); // 'viral_highlights' or 'story_series'
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
      } else {
        setInspectError(res?.error || 'Failed to inspect YouTube video.');
      }
    } catch (err) {
      console.warn('Inspect error', err);
      // Fallback inspection if offline/restricted network
      const vidMatch = youtubeUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      const vidId = vidMatch ? vidMatch[1] : '';
      const low = youtubeUrl.toLowerCase();
      const isStory = low.includes('horror') || low.includes('story') || low.includes('podcast') || low.includes('incident') || low.includes('bhoot');
      const recMode = isStory ? 'story_series' : 'viral_highlights';
      const cType = isStory ? 'Horror & Story Arc' : 'High-Retention Highlights';
      setVideoInfo({
        video_id: vidId,
        title: 'YouTube Video Confirmed',
        thumbnail_url: vidId ? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg` : '',
        content_type: cType,
        recommended_mode: recMode,
        recommendation_reason: isStory ? 'Continuous incident narrative detected. Slicing into consecutive episodes until narrative conclusion.' : 'Standalone viral punchlines detected.',
      });
      setIsLinkConfirmed(true);
      setClippingMode(recMode);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleCookieUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCookieUploading(true);
    setCookieSuccess(false);
    try {
      const formData = new FormData();
      formData.append('cookies_file', file);
      await api.uploadCookies(formData);
      setCookieSuccess(true);
      setErrorMessage('');
      setTimeout(() => setCookieSuccess(false), 5000);
    } catch (err) {
      alert('Failed to upload cookies: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsCookieUploading(false);
    }
  };

  // Loading & pipeline status
  const [isLoading, setIsLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [progress, setProgress] = useState(5);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let timer;
    if (isLoading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (sourceType === 'youtube' && !youtubeUrl.trim()) {
      setErrorMessage('Please enter a YouTube video URL.');
      return;
    }
    if (sourceType === 'upload' && !selectedFile) {
      setErrorMessage('Please select a video file.');
      return;
    }

    setIsLoading(true);
    setPipelineStep(1);
    setStatusMessage('Initiating video pipeline...');

    try {
      let payload;
      if (sourceType === 'youtube') {
        payload = {
          youtube_url: youtubeUrl.trim(),
          target_ratio: targetRatio,
          auto_speaker_tracking: autoSpeakerTracking,
          requested_clip_count: clipCount,
          duration_preference: durationPref,
          clipping_mode: clippingMode,
        };
      } else {
        const formData = new FormData();
        formData.append('video_file', selectedFile);
        formData.append('target_ratio', targetRatio);
        formData.append('auto_speaker_tracking', autoSpeakerTracking);
        formData.append('requested_clip_count', clipCount);
        formData.append('duration_preference', durationPref);
        formData.append('clipping_mode', clippingMode);
        payload = formData;
      }

      const res = await api.importVideo(payload);
      const projectId = res.id;
      setStatusMessage('Video registered. Processing pipeline active...');

      // Poll status every 1000ms for instantaneous updates
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
          if (statusRes.status === 'downloading' || lowerMsg.includes('download')) setPipelineStep(1);
          else if (statusRes.status === 'extracting_audio' || lowerMsg.includes('audio')) setPipelineStep(2);
          else if (statusRes.status === 'transcribing' || lowerMsg.includes('dialogue') || lowerMsg.includes('transcrib')) setPipelineStep(3);
          else if (statusRes.status === 'analyzing' || lowerMsg.includes('analyz') || lowerMsg.includes('scan')) setPipelineStep(4);
          else if (statusRes.status === 'ready') {
            clearInterval(interval);
            setPipelineStep(5);
            setStatusMessage('All clips generated successfully!');
            setTimeout(async () => {
              const fullProject = await api.getProject(projectId);
              setIsLoading(false);
              onProjectCreated(fullProject);
            }, 600);
          } else if (statusRes.status === 'failed') {
            clearInterval(interval);
            setIsLoading(false);
            setErrorMessage(statusRes.error_message || 'Processing failed');
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
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Top Greeting & AI Key Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-dark-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-dark-950 border border-lime-neon/40 flex items-center justify-center p-1 shadow-neon-sm">
              <img src={logoImg} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-wide">
              Create AI Shorts
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Configure your video source, aspect framing, speaker tracking, and clipping targets.
          </p>
        </div>

        {/* Masked Key Status Badge */}
        <div
          onClick={onOpenKeyModal}
          className="flex items-center gap-2.5 bg-dark-900 border border-dark-700/80 px-4 py-2 rounded-2xl cursor-pointer hover:border-lime-neon/50 transition self-start sm:self-center"
          title="Click to view or update your encrypted Gemini key"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse"></div>
          <div>
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Linked AI Key</div>
            <div className="text-xs font-mono font-bold text-lime-neon">
              {hasKey ? maskedKey : 'Setup Required'}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        /* Pipeline Processing Screen */
        <div className="bg-dark-900 border border-dark-700 rounded-3xl p-8 text-center max-w-xl mx-auto shadow-2xl space-y-6">
          <div className="relative w-20 h-20 mx-auto">
            <div className="w-20 h-20 rounded-full border-4 border-dark-800 border-t-lime-neon animate-spin"></div>
            <Sparkles className="w-8 h-8 text-lime-neon absolute inset-0 m-auto" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-white mb-1.5">Clipzzz Engine at Work</h3>
            <p className="text-xs font-semibold text-lime-neon">{statusMessage}</p>
          </div>

          {/* Live Timelapse Timer & Pipeline Progress */}
          <div className="space-y-3">
            <div className="bg-dark-950 p-4 rounded-2xl border border-dark-800 text-center flex items-center justify-between px-6">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse"></span>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Processing Timelapse
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Elapsed</span>
                <span className="text-lg font-mono font-extrabold text-lime-neon bg-dark-900 border border-dark-750 px-3 py-1 rounded-xl shadow-neon-sm">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>
            </div>

            {/* Video Download Ingest Progress Bar (Shown during Ingestion/Download) */}
            {(downloadProgress > 0 || pipelineStep === 1 || (statusMessage && statusMessage.toLowerCase().includes('download'))) && (
              <div className="space-y-1.5 bg-dark-950 p-3.5 rounded-2xl border border-cyan-500/30 shadow-lg">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                    Download & Ingest Stream
                  </span>
                  <div className="flex items-center gap-2">
                    {downloadSpeed && (
                      <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full">
                        {downloadSpeed}
                      </span>
                    )}
                    {downloadEta && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {downloadEta}
                      </span>
                    )}
                    <span className="text-cyan-400 font-extrabold text-xs">
                      {downloadProgress}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden border border-dark-800 p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-lime-neon rounded-full transition-all duration-300 shadow-sm"
                    style={{ width: `${Math.max(4, Math.min(100, downloadProgress))}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Real Percentage Progress Bar: Overall Pipeline */}
            <div className="space-y-1 bg-dark-950 p-3 rounded-2xl border border-dark-800">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span className="font-semibold text-slate-300">Overall Pipeline Execution</span>
                <span className="text-lime-neon font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden border border-dark-800 p-0.5">
                <div
                  className="h-full bg-lime-neon rounded-full transition-all duration-500 shadow-neon-sm"
                  style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 5-Step Pipeline Indicator */}
          <div className="space-y-2.5 text-left bg-dark-950 p-4 rounded-2xl border border-dark-800 text-xs">
            {[
              { step: 1, label: 'Download / Ingest Video' },
              { step: 2, label: 'Extract High-Fidelity Audio' },
              { step: 3, label: 'Timestamped Speech-to-Text Transcription' },
              { step: 4, label: clipCount === 0 ? 'Gemini AI Full-Timeline Scan (00:00 - End)' : `Gemini AI Selecting Top ${clipCount} Moments (${durationPref}s)` },
              { step: 5, label: 'Ready for Studio Preview & Export' },
            ].map((s) => {
              const isPast = pipelineStep > s.step;
              const isCurrent = pipelineStep === s.step;
              return (
                <div key={s.step} className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isPast
                        ? 'bg-lime-neon text-black'
                        : isCurrent
                        ? 'bg-lime-neon/20 border border-lime-neon text-lime-neon animate-pulse'
                        : 'bg-dark-800 text-slate-500'
                    }`}
                  >
                    {isPast ? '✓' : s.step}
                  </div>
                  <span
                    className={`font-medium ${
                      isPast
                        ? 'text-slate-300'
                        : isCurrent
                        ? 'text-lime-neon font-bold'
                        : 'text-slate-500'
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
        <form onSubmit={handleCreate} className="space-y-8">
          {/* Section 1: Video Input */}
          <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-bold text-white flex items-center gap-2">
                <Youtube className="w-4 h-4 text-red-500" />
                1. Video Source
              </label>
              <div className="flex p-0.5 bg-dark-950 rounded-xl border border-dark-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSourceType('youtube')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    sourceType === 'youtube'
                      ? 'bg-dark-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  YouTube Link
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('upload')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    sourceType === 'upload'
                      ? 'bg-dark-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  File Upload
                </button>
              </div>
            </div>

            {sourceType === 'youtube' ? (
              <div>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-dark-950 border border-dark-700 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-lime-neon shadow-inner"
                />
                <p className="text-[11px] text-slate-500 mt-2">
                  Works with standard videos, podcasts, interviews, and live streams.
                </p>

                {/* 1. Ask Confirmation Prompt when URL is entered but not yet confirmed */}
                {youtubeUrl.trim().length > 10 && !isLinkConfirmed && (
                  <div className="mt-3.5 p-4 rounded-2xl bg-dark-950 border border-amber-500/40 shadow-lg animate-fadeIn">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          Confirm Video Source
                          <span className="text-[9px] bg-amber-400/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase">
                            Final Decision Required
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                          Are you sure this link is your <strong className="text-white">final decision</strong> to make clips?
                        </p>

                        {inspectError && (
                          <p className="text-[11px] text-red-400 mt-2 font-medium">
                            {inspectError}
                          </p>
                        )}

                        <div className="flex items-center gap-2.5 mt-3">
                          <button
                            type="button"
                            disabled={isInspecting}
                            onClick={handleConfirmLink}
                            className="px-4 py-2 rounded-xl bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs shadow-neon-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {isInspecting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>AI Analyzing Video Content...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Yes, Confirm & Analyze Video</span>
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
                            className="px-3 py-2 rounded-xl bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-white text-xs font-semibold transition cursor-pointer"
                          >
                            Change Link
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Confirmed Video Intelligence & AI Recommendation Card */}
                {isLinkConfirmed && videoInfo && (
                  <div className="mt-3.5 p-4 rounded-2xl bg-dark-950 border border-lime-neon/40 shadow-neon-sm animate-fadeIn">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {videoInfo.thumbnail_url && (
                        <div className="relative w-full sm:w-36 aspect-video rounded-xl overflow-hidden bg-black border border-dark-700 shrink-0">
                          <img
                            src={videoInfo.thumbnail_url}
                            alt={videoInfo.title}
                            className="w-full h-full object-cover"
                          />
                          {videoInfo.duration_str && (
                            <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                              {videoInfo.duration_str}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold text-lime-neon bg-lime-neon/15 px-2 py-0.5 rounded-full border border-lime-neon/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Video Confirmed • Downloading in Background
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsLinkConfirmed(false);
                            }}
                            className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                          >
                            Change Link
                          </button>
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-white truncate" title={videoInfo.title}>
                          {videoInfo.title}
                        </h4>
                        {videoInfo.author_name && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Channel: {videoInfo.author_name}
                          </p>
                        )}

                        <div className="mt-2.5 pt-2 border-t border-dark-800 flex flex-wrap items-center gap-2">
                          <div className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-lime-neon" />
                            <span>AI Detected:</span>
                            <span className="text-white font-bold bg-dark-800 px-2 py-0.5 rounded-md border border-dark-700">
                              {videoInfo.content_type}
                            </span>
                          </div>

                          <div className="text-[11px] font-semibold text-lime-neon flex items-center gap-1">
                            <span>➔ AI Recommends:</span>
                            <span className="font-extrabold uppercase bg-lime-neon text-black px-2 py-0.5 rounded-md text-[10px]">
                              {videoInfo.recommended_mode === 'story_series' ? 'Story Series (Episodes)' : 'Viral Highlights (Solo)'}
                            </span>
                          </div>
                        </div>

                        {videoInfo.recommendation_reason && (
                          <p className="text-[10px] text-slate-400 mt-1.5 italic">
                            💡 {videoInfo.recommendation_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-dark-700 hover:border-lime-neon/50 rounded-2xl p-6 text-center cursor-pointer transition bg-dark-950/60">
                <input
                  type="file"
                  id="wizard-file-input"
                  accept="video/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <label htmlFor="wizard-file-input" className="cursor-pointer">
                  <UploadCloud className="w-8 h-8 text-lime-neon mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-200">
                    {selectedFile ? selectedFile.name : 'Click to select video file (MP4, MKV, MOV)'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Up to 2GB supported</p>
                </label>
              </div>
            )}
          </div>

          {/* Section 2: Dedicated 9:16 Portrait Shorts Canvas */}
          <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-lime-neon" />
                  2. Target Canvas Format
                </label>
                <p className="text-xs text-slate-400">
                  Dedicated high-converting short-form canvas format:
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-lime-neon bg-lime-neon/10 px-2.5 py-1 rounded-full border border-lime-neon/30 uppercase tracking-wider">
                Dedicated 9:16 Studio
              </span>
            </div>

            <div className="relative p-4 rounded-2xl border bg-dark-800/90 border-lime-neon shadow-neon-sm flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-lime-neon/15 border border-lime-neon/30 flex items-center justify-center text-lime-neon shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">9:16 Portrait Shorts</h4>
                    <span className="text-[9px] bg-lime-neon text-black font-extrabold px-1.5 py-0.5 rounded-full uppercase">
                      Default & Optimized
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    YouTube Shorts, Instagram Reels, TikTok (1080×1920)
                  </p>
                </div>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse shrink-0"></div>
            </div>
          </div>

          {/* Section 3: Smart Speaker Tracking Feature */}
          <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 shadow-lg flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-lime-neon/15 border border-lime-neon/30 flex items-center justify-center text-lime-neon shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  AI Smart Speaker Tracking
                  <span className="text-[10px] bg-lime-neon/20 text-lime-neon font-bold px-2 py-0.5 rounded-full">
                    Auto-Frame
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 max-w-lg">
                  Analyzes video frames with facial recognition to automatically center the active talking person inside the vertical 9:16 frame.
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => setAutoSpeakerTracking(!autoSpeakerTracking)}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                autoSpeakerTracking ? 'bg-lime-neon' : 'bg-dark-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black transition-transform absolute top-0.5 ${
                  autoSpeakerTracking ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Section 4 & 5: AI Mode, Clip Count & Target Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Number of Clips & Mode Selection */}
            <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-lime-neon" />
                  3. Number of Clips & Mode
                </label>
                <span className="text-[10px] font-mono font-bold bg-lime-neon/20 text-lime-neon px-2 py-0.5 rounded-full border border-lime-neon/30">
                  {clippingMode === 'story_series' ? 'Multi-Part Series' : 'Solo Highlights'}
                </span>
              </div>

              {/* Mode Selector: Viral Highlights vs Story Series */}
              <div className="flex p-1 bg-dark-950 rounded-2xl border border-dark-800 mb-3 gap-1">
                <button
                  type="button"
                  onClick={() => setClippingMode('viral_highlights')}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                    clippingMode === 'viral_highlights'
                      ? 'bg-lime-neon text-black shadow-neon-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Extract independent high-retention highlights across the entire video"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Viral Highlights (Solo)</span>
                  {videoInfo?.recommended_mode === 'viral_highlights' && (
                    <span className="text-[8px] bg-black text-lime-neon font-black px-1.5 py-0.5 rounded-full uppercase ml-1">
                      AI REC
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setClippingMode('story_series')}
                  className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                    clippingMode === 'story_series'
                      ? 'bg-lime-neon text-black shadow-neon-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Detect continuous stories and generate all parts sequentially until the story ends"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Story Series (Episodes)</span>
                  {videoInfo?.recommended_mode === 'story_series' && (
                    <span className="text-[8px] bg-black text-lime-neon font-black px-1.5 py-0.5 rounded-full uppercase ml-1">
                      AI REC
                    </span>
                  )}
                </button>
              </div>

              {clippingMode === 'story_series' ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-lime-neon/10 border border-lime-neon/30 text-xs text-lime-300">
                    <p className="font-bold flex items-center gap-1.5 text-lime-neon mb-1">
                      <Sparkles className="w-4 h-4" /> Full Story Arc Detection (Clips are NOT Limited)
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Clips are <strong className="text-lime-neon">not limited to 4 or any fixed number</strong>. The AI analyzes the entire story from the opening sentence to final climax, slicing into consecutive episodes (<strong className="text-white">Part 1, Part 2, Part 3... Part N</strong>) until the story has fully finished.
                    </p>
                  </div>

                  <div
                    onClick={() => setClipCount(0)}
                    className="p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between bg-lime-neon/15 border-lime-neon shadow-neon-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-lime-neon text-black font-extrabold flex flex-col items-center justify-center shadow-sm shrink-0">
                        <span className="text-xs font-black leading-none">Auto</span>
                        <span className="text-[7px] uppercase font-mono font-black text-black/80 mt-0.5">FULL</span>
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                          Uncapped Full Story (Part 1 to Part N)
                          <span className="text-[8px] bg-lime-neon text-black font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                            No Part Limit
                          </span>
                        </h5>
                        <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                          Generates all sequential parts without stopping until the story narrative concludes.
                        </p>
                      </div>
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full bg-lime-neon animate-pulse shrink-0 ml-2" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-400">
                    Select how many viral moments to extract across the entire timeline:
                  </p>

                  {/* Auto AI Full Button */}
                  <div
                    onClick={() => setClipCount(0)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      clipCount === 0
                        ? 'bg-lime-neon/15 border-lime-neon shadow-neon-sm text-white'
                        : 'bg-dark-950 border-dark-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg font-black text-[11px] flex items-center justify-center ${
                          clipCount === 0 ? 'bg-lime-neon text-black' : 'bg-dark-800 text-slate-300'
                        }`}
                      >
                        Auto
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Auto AI Full Video Scan</div>
                        <div className="text-[10px] text-slate-400">Evenly selects best viral moments from start to end</div>
                      </div>
                    </div>
                    {clipCount === 0 && <span className="w-2 h-2 rounded-full bg-lime-neon animate-pulse" />}
                  </div>

                  {/* Specific Clip Counts: 5, 7, 9, 11, 15 */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[
                      { count: 5, label: '5' },
                      { count: 7, label: '7', tag: 'BEST' },
                      { count: 9, label: '9' },
                      { count: 11, label: '11', tag: 'MAX' },
                      { count: 15, label: '15', tag: 'MEGA' },
                    ].map((opt) => {
                      const isSelected = clipCount === opt.count;
                      return (
                        <button
                          key={opt.count}
                          type="button"
                          onClick={() => setClipCount(opt.count)}
                          className={`py-2 rounded-xl text-center border font-bold transition cursor-pointer flex flex-col items-center justify-center ${
                            isSelected
                              ? 'bg-lime-neon text-black border-lime-neon shadow-neon-sm'
                              : 'bg-dark-950 border-dark-800 text-slate-300 hover:text-white hover:bg-dark-850'
                          }`}
                        >
                          <span className="text-xs font-black">{opt.label}</span>
                          {opt.tag ? (
                            <span
                              className={`text-[8px] font-black uppercase mt-0.5 ${
                                isSelected ? 'text-black/80' : 'text-lime-neon'
                              }`}
                            >
                              {opt.tag}
                            </span>
                          ) : (
                            <span className="text-[8px] text-slate-500 font-normal mt-0.5">Clips</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Duration Preference (0-30s, 30-60s, 60-80s) */}
            <div className="bg-dark-900 border border-dark-750 rounded-3xl p-6 shadow-lg">
              <label className="text-sm font-bold text-white mb-1.5 flex items-center gap-2">
                <Clock className="w-4 h-4 text-lime-neon" />
                4. Target Duration
              </label>
              <p className="text-xs text-slate-400 mb-3">
                Select your preferred Shorts length:
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: '0-30', label: '0 – 30s', tag: 'Fast Hooks' },
                  { id: '30-60', label: '30 – 60s', tag: 'Shorts Sweet' },
                  { id: '60-80', label: '60 – 80s', tag: 'Deep Story' },
                ].map((dur) => {
                  const isSelected = durationPref === dur.id;
                  return (
                    <button
                      key={dur.id}
                      type="button"
                      onClick={() => setDurationPref(dur.id)}
                      className={`py-2 rounded-xl text-xs font-bold transition border text-center ${
                        isSelected
                          ? 'bg-lime-neon text-black border-lime-neon shadow-neon-sm'
                          : 'bg-dark-950 border-dark-700 text-slate-300 hover:text-white hover:bg-dark-850'
                      }`}
                    >
                      <div>{dur.label}</div>
                      <div className="text-[8px] font-normal opacity-80">{dur.tag}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Success Cookie Alert */}
          {cookieSuccess && (
            <div className="p-3.5 bg-lime-950/60 border border-lime-neon/50 rounded-2xl flex items-center gap-2.5 text-xs text-lime-neon shadow-neon-sm animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-lime-neon shrink-0" />
              <div>
                <span className="font-bold">✓ YouTube cookies activated successfully!</span>
                <p className="text-[11px] text-slate-300">You can now click 'Generate AI Shorts' to import the YouTube video without bot verification.</p>
              </div>
            </div>
          )}

          {/* Error Message / Smart YouTube Bot Bypass Card */}
          {errorMessage && (
            errorMessage.toLowerCase().includes('bot') || errorMessage.toLowerCase().includes('cookies') || errorMessage.toLowerCase().includes('verification') ? (
              <div className="p-4 bg-amber-950/40 border-2 border-amber-500/50 rounded-2xl text-xs space-y-3 shadow-xl">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold text-amber-300 uppercase tracking-wide text-[11px]">
                      YouTube Anti-Bot Check Active
                    </div>
                    <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                      YouTube requires bot verification for this video. Use either of these instant solutions to proceed:
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Option 1: Switch to Direct File Upload */}
                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('upload');
                      setErrorMessage('');
                    }}
                    className="flex items-center justify-center gap-2 bg-dark-950 hover:bg-dark-850 text-white font-bold py-2.5 px-3 rounded-xl border border-dark-700 hover:border-lime-neon/60 transition text-xs cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-lime-neon" />
                    <span>📁 Upload Video File (100% Bypass)</span>
                  </button>

                  {/* Option 2: 1-Click Cookie Upload */}
                  <label className="flex items-center justify-center gap-2 bg-lime-neon/15 hover:bg-lime-neon/25 text-lime-neon font-bold py-2.5 px-3 rounded-xl border border-lime-neon/40 hover:border-lime-neon transition text-xs cursor-pointer">
                    <input
                      type="file"
                      accept=".txt"
                      onChange={handleCookieUpload}
                      className="hidden"
                      disabled={isCookieUploading}
                    />
                    <span>{isCookieUploading ? 'Uploading cookies...' : '🍪 Upload cookies.txt'}</span>
                  </label>
                </div>

                <div className="bg-dark-950/80 p-2.5 rounded-xl border border-dark-800 text-[10px] text-slate-400 space-y-1">
                  <span className="font-bold text-slate-300">💡 How to get cookies.txt in 15 seconds:</span>
                  <p>1. Install free Chrome/Edge extension <span className="text-lime-neon font-mono">"Get cookies.txt LOCALLY"</span>.</p>
                  <p>2. Open YouTube.com, click the extension icon and click <span className="text-white font-bold">Export</span>.</p>
                  <p>3. Drop the file above or into your <span className="font-mono text-white">Downloads</span> folder (Clipzzz auto-loads it)!</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-2xl flex items-center gap-2 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )
          )}

          {/* Launch Button */}
          <button
            type="submit"
            className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-sm py-4 rounded-2xl transition shadow-neon flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
          >
            <Sparkles className="w-5 h-5 fill-black" />
            <span>
              {clippingMode === 'story_series'
                ? `Generate Complete Story Series (${targetRatio} • ${durationPref}s)`
                : clipCount === 0
                ? `Generate Full-Timeline Viral Clips (${targetRatio} • ${durationPref}s)`
                : `Generate ${clipCount} Solo Viral Clips (${targetRatio} • ${durationPref}s)`}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}

