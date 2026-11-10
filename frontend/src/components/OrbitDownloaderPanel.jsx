import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Clipboard,
  ArrowRight,
  Loader2,
  Download,
  Music,
  Video,
  Image as ImageIcon,
  Zap,
  CheckCircle,
  AlertCircle,
  Trash2,
  Clock,
  Eye,
  ThumbsUp,
  User,
  Scissors,
  Power,
  RefreshCw,
  ExternalLink,
  History,
  FileAudio,
} from 'lucide-react';
import { api } from '../services/api';

const DEFAULT_ORBIT_API = 'http://127.0.0.1:8001/api';

export default function OrbitDownloaderPanel({ onSendToClipit }) {
  const [orbitApiBase, setOrbitApiBase] = useState(DEFAULT_ORBIT_API);
  const [engineState, setEngineState] = useState('checking'); // checking | online | starting | offline
  const [engineError, setEngineError] = useState('');

  const [currentUrl, setCurrentUrl] = useState('');
  const [copiedPaste, setCopiedPaste] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [extractError, setExtractError] = useState('');

  const [media, setMedia] = useState(null);
  const [formats, setFormats] = useState(null);
  const [cachedDownloads, setCachedDownloads] = useState([]);
  const [statusNotice, setStatusNotice] = useState('');
  const [activeTab, setActiveTab] = useState('video');

  const [activeTask, setActiveTask] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [recentTasks, setRecentTasks] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const pollRef = useRef(null);
  const inspectorRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    initEngineConnection();
    return () => stopPolling();
  }, []);

  const initEngineConnection = async () => {
    setEngineState('checking');
    setEngineError('');
    try {
      const st = await api.getOrbitStatus();
      const base = st?.api_base || DEFAULT_ORBIT_API;
      setOrbitApiBase(base);

      if (st?.running) {
        setEngineState('online');
        loadRecentTasks(base);
        return;
      }

      if (st?.available) {
        setEngineState('starting');
        const startRes = await api.startOrbitEngine();
        if (startRes?.running) {
          setEngineState('online');
          loadRecentTasks(startRes.api_base || base);
          return;
        }
      }
      setEngineState('offline');
      setEngineError('Orbit Pro engine (D:\\Downloader) could not be started automatically.');
    } catch (err) {
      // Fallback: try direct health check against 127.0.0.1:8001
      try {
        const direct = await fetch(`${DEFAULT_ORBIT_API}/health/`);
        if (direct.ok) {
          setEngineState('online');
          loadRecentTasks(DEFAULT_ORBIT_API);
          return;
        }
      } catch {}
      setEngineState('offline');
      setEngineError(err?.response?.data?.error || 'Could not reach Orbit Pro backend on port 8001.');
    }
  };

  const loadRecentTasks = async (base = orbitApiBase) => {
    try {
      const res = await fetch(`${base}/tasks/recent/`);
      if (res.ok) {
        const list = await res.json();
        setRecentTasks(Array.isArray(list) ? list : []);
      }
    } catch {}
  };

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) {
        setCurrentUrl(txt.trim());
        setCopiedPaste(true);
        setTimeout(() => setCopiedPaste(false), 1800);
      }
    } catch {}
  };

  const triggerFileSave = (downloadPathOrUrl, filename) => {
    if (!downloadPathOrUrl) return;
    const origin = orbitApiBase.replace(/\/api\/?$/, '');
    const fullUrl = downloadPathOrUrl.startsWith('http')
      ? downloadPathOrUrl
      : `${origin}${downloadPathOrUrl.startsWith('/') ? '' : '/'}${downloadPathOrUrl}`;
    const a = document.createElement('a');
    a.href = fullUrl;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExtract = async (urlToFetch) => {
    const targetUrl = (urlToFetch ?? currentUrl).trim();
    if (!targetUrl) return;
    setCurrentUrl(targetUrl);
    setExtractError('');
    setIsInspecting(true);
    setMedia(null);
    setFormats(null);
    setCachedDownloads([]);

    try {
      const res = await fetch(`${orbitApiBase}/extract/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to inspect media link.');
      }

      setMedia(data.media);
      setFormats(data.formats);
      setCachedDownloads(data.cached_downloads || []);
      setStatusNotice(data.status_message || '');

      const hasVids = data.formats?.videos?.length > 0;
      const hasImgs = data.formats?.images?.length > 0;
      if (data.media?.platform === 'pinterest' && !hasVids && hasImgs) {
        setActiveTab('image');
      } else if (!hasVids && data.formats?.mp3_conversions?.length > 0) {
        setActiveTab('mp3');
      } else {
        setActiveTab('video');
      }

      setTimeout(() => {
        inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setExtractError(err.message || 'Could not inspect URL.');
    } finally {
      setIsInspecting(false);
    }
  };

  const startTaskPolling = (taskId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${orbitApiBase}/tasks/${taskId}/`);
        if (!res.ok) return;
        const updated = await res.json();
        setActiveTask(updated);

        if (updated.status === 'completed' || updated.status === 'failed') {
          stopPolling();
          setIsDownloading(false);
          loadRecentTasks();
          if (updated.status === 'completed' && updated.file_download_url) {
            triggerFileSave(updated.file_download_url, updated.file_name);
          }
        }
      } catch {}
    }, 1000);
  };

  const handleDownload = async (payload) => {
    setExtractError('');
    setIsDownloading(true);
    try {
      const res = await fetch(`${orbitApiBase}/download/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start download task.');
      }
      const task = data.task;
      setActiveTask(task);
      loadRecentTasks();

      if (data.is_cached && task.status === 'completed' && task.file_download_url) {
        setIsDownloading(false);
        triggerFileSave(task.file_download_url, task.file_name);
      } else {
        startTaskPolling(task.id);
      }
    } catch (err) {
      setIsDownloading(false);
      setExtractError(err.message || 'Download failed to start.');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await fetch(`${orbitApiBase}/tasks/${taskId}/`, { method: 'DELETE' });
      if (activeTask?.id === taskId) {
        stopPolling();
        setActiveTask(null);
        setIsDownloading(false);
      }
      loadRecentTasks();
    } catch {}
  };

  const handleClearTasks = async () => {
    try {
      await fetch(`${orbitApiBase}/tasks/recent/`, { method: 'DELETE' });
      setRecentTasks([]);
    } catch {}
  };

  const samplePresets = [
    { label: 'YouTube 4K Ultra HD', url: 'https://www.youtube.com/watch?v=LXb3EKWsInQ', dot: '#EB001B' },
    { label: 'Pinterest Pin & Video', url: 'https://www.pinterest.com/pin/111815965749000000/', dot: '#E60023' },
    { label: 'Instagram Reel', url: 'https://www.instagram.com/reel/sample/', dot: '#CF4500' },
    { label: 'Facebook Video', url: 'https://www.facebook.com/watch/?v=10153231379946729', dot: '#3860BE' },
    { label: 'Twitter / X Clip', url: 'https://twitter.com/NASA/status/1785000000000000000', dot: '#141413' },
    { label: 'SoundCloud Track', url: 'https://soundcloud.com/octobersveryown/sample', dot: '#F79E1B' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-canvas-cream text-ink-black font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 pb-16 relative">
        {/* Top Connection Status & Tasks Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 relative z-20">
          <div className="inline-flex items-center gap-2 bg-white border border-border-cream px-3.5 py-1.5 rounded-full shadow-sm text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                engineState === 'online'
                  ? 'bg-emerald-500 animate-pulse'
                  : engineState === 'starting' || engineState === 'checking'
                  ? 'bg-light-orange animate-ping'
                  : 'bg-signal-orange'
              }`}
            />
            <span className="font-bold text-ink-black">
              {engineState === 'online'
                ? 'Connected: Orbit Pro Engine (D:\\Downloader • :8001)'
                : engineState === 'starting'
                ? 'Starting Orbit Pro Engine...'
                : engineState === 'checking'
                ? 'Connecting to Orbit Pro...'
                : 'Orbit Pro Engine Offline'}
            </span>
            {engineState === 'offline' && (
              <button
                type="button"
                onClick={initEngineConnection}
                className="ml-1 px-2.5 py-0.5 rounded-full bg-ink-black text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Power className="w-3 h-3" /> Start Engine
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="bg-white border border-border-cream hover:border-signal-orange px-3.5 py-1.5 rounded-full text-xs font-bold text-ink-black flex items-center gap-2 shadow-sm cursor-pointer transition"
            >
              <History className="w-3.5 h-3.5 text-signal-orange" />
              <span>Tasks</span>
              <span className="bg-ink-black text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                {recentTasks.length}
              </span>
            </button>
          </div>
        </div>

        {/* HERO SECTION WITH ORBIT PRO GHOST WATERMARK */}
        <section className="relative pt-8 pb-10 text-center max-w-4xl mx-auto">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 select-none pointer-events-none text-[72px] sm:text-[130px] md:text-[170px] font-semibold tracking-tighter opacity-[0.06] text-ink-black whitespace-nowrap z-0 leading-none"
            aria-hidden="true"
          >
            ORBIT PRO
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-lifted-cream border border-border-cream mb-5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-ink-black">
                Orbit Pro • Universal Multi-Platform Engine
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-medium leading-[1.06] tracking-tight text-ink-black mb-5">
              Paste any link. <br />
              <span className="text-signal-orange">Extract every quality</span> or MP3.
            </h1>

            <p className="text-sm sm:text-base text-charcoal max-w-2xl mx-auto mb-8 leading-relaxed">
              High-performance Orbit Pro pipeline for YouTube, Instagram Reels, Facebook Watch, TikTok, Pinterest, and Twitter.
              Instant resolution breakdown with dedicated studio-grade 320kbps MP3 audio conversion.
            </p>

            {/* Floating Stadium Input Pill */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExtract();
              }}
              className="relative max-w-3xl mx-auto bg-white rounded-full p-2 sm:p-2.5 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 border border-border-cream shadow-card-elevated"
            >
              <div className="flex-1 flex items-center gap-3 w-full px-4 py-1.5 sm:py-0">
                <Search className="w-5 h-5 text-slate-gray shrink-0" />
                <input
                  type="url"
                  required
                  value={currentUrl}
                  onChange={(e) => setCurrentUrl(e.target.value)}
                  placeholder="Paste any link into Orbit Pro (YouTube, Instagram, Facebook, Pinterest, TikTok, Twitter...)"
                  className="w-full bg-transparent text-ink-black placeholder-slate-gray text-sm sm:text-base focus:outline-none"
                />
                {currentUrl && (
                  <button
                    type="button"
                    onClick={() => setCurrentUrl('')}
                    className="text-xs text-slate-gray hover:text-ink-black px-2 py-1 rounded-full hover:bg-canvas-cream cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end px-2 sm:px-0">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="px-3.5 py-2.5 rounded-full text-xs font-semibold text-ink-black bg-canvas-cream hover:bg-border-cream transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Clipboard className="w-3.5 h-3.5 text-signal-orange" />
                  <span>{copiedPaste ? 'Pasted!' : 'Paste'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isInspecting || engineState !== 'online'}
                  className="px-6 py-3 rounded-full bg-ink-black hover:bg-black text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isInspecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-light-orange" />
                      <span>Extracting...</span>
                    </>
                  ) : (
                    <>
                      <span>Fetch Media</span>
                      <ArrowRight className="w-4 h-4 text-light-orange" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Try Presets */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-gray mr-1">Try Demo:</span>
              {samplePresets.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleExtract(item.url)}
                  disabled={engineState !== 'online'}
                  className="bg-white border border-border-cream hover:border-signal-orange px-3 py-1.5 rounded-full text-xs font-semibold text-charcoal flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.dot }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Error Alert */}
        {(engineError || extractError) && (
          <div className="max-w-3xl mx-auto mb-6 p-4 rounded-2xl bg-white border border-signal-orange/60 flex items-center justify-between gap-3 text-xs text-clay-brown shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-signal-orange shrink-0" />
              <span>{extractError || engineError}</span>
            </div>
            {engineState !== 'online' && (
              <button
                type="button"
                onClick={initEngineConnection}
                className="px-3 py-1.5 rounded-full bg-ink-black text-white font-bold text-[11px] shrink-0 cursor-pointer"
              >
                Retry Connection
              </button>
            )}
          </div>
        )}

        {/* Active Download / Transcode Task Card */}
        {activeTask && (
          <div className="max-w-4xl mx-auto mb-8 bg-white border border-border-cream rounded-stadium p-6 shadow-card-elevated">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center shrink-0">
                  {activeTask.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : activeTask.status === 'failed' ? (
                    <AlertCircle className="w-5 h-5 text-signal-orange" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-signal-orange" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-signal-orange">
                    {activeTask.media_type === 'mp3' ? 'MP3 Transcoding' : 'Orbit Pro Task'} • #{activeTask.id.slice(0, 8)}
                  </div>
                  <h4 className="text-sm font-bold text-ink-black truncate">
                    {activeTask.media_title || activeTask.quality_label}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeTask.status === 'completed' && activeTask.file_download_url && (
                  <button
                    type="button"
                    onClick={() => triggerFileSave(activeTask.file_download_url, activeTask.file_name)}
                    className="px-4 py-2 rounded-full bg-ink-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save File</span>
                  </button>
                )}
                {activeTask.media_type === 'video' && activeTask.url && onSendToClipit && (
                  <button
                    type="button"
                    onClick={() => onSendToClipit(activeTask.url)}
                    className="px-4 py-2 rounded-full bg-signal-orange text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Clip in CLIPIT</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteTask(activeTask.id)}
                  className="p-2 rounded-full bg-canvas-cream hover:bg-border-cream text-slate-gray cursor-pointer"
                  title="Delete Task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="w-full h-2.5 bg-canvas-cream rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-light-orange transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, activeTask.progress_percentage || 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-gray">
              <span>{activeTask.status_message || activeTask.status}</span>
              <span>
                {activeTask.progress_percentage || 0}% {activeTask.download_speed ? `• ${activeTask.download_speed}` : ''}{' '}
                {activeTask.eta ? `• ETA ${activeTask.eta}` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Recent Tasks Panel */}
        {showHistory && (
          <div className="max-w-4xl mx-auto mb-8 bg-white border border-border-cream rounded-stadium p-6 shadow-card-soft">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-cream">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-signal-orange" />
                <h3 className="text-sm font-extrabold text-ink-black">Recent Orbit Pro Downloads</h3>
              </div>
              {recentTasks.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearTasks}
                  className="text-xs font-bold text-clay-brown hover:underline cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {recentTasks.length === 0 ? (
              <p className="text-xs text-slate-gray text-center py-6">No download tasks yet.</p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {recentTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-lifted-cream border border-border-cream text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-ink-black truncate">{t.media_title || t.url}</div>
                      <div className="text-[10px] text-slate-gray font-mono">
                        {t.media_type?.toUpperCase()} • {t.quality_label} • {t.status} {t.file_size_formatted ? `• ${t.file_size_formatted}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.status === 'completed' && t.file_download_url && (
                        <button
                          type="button"
                          onClick={() => triggerFileSave(t.file_download_url, t.file_name)}
                          className="px-3 py-1 rounded-full bg-ink-black text-white text-[11px] font-bold cursor-pointer"
                        >
                          Download
                        </button>
                      )}
                      {t.url && onSendToClipit && (
                        <button
                          type="button"
                          onClick={() => onSendToClipit(t.url)}
                          className="px-3 py-1 rounded-full bg-canvas-cream border border-border-cream hover:border-signal-orange text-ink-black text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Open in CLIPIT to generate 9:16 Shorts"
                        >
                          <Scissors className="w-3 h-3 text-signal-orange" />
                          <span>Clip It</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="p-1.5 text-slate-gray hover:text-signal-orange rounded-full cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MEDIA INSPECTOR STADIUM CARD */}
        {media && formats && (
          <section ref={inspectorRef} className="max-w-5xl mx-auto">
            <div className="bg-lifted-cream rounded-stadium p-6 sm:p-9 border border-border-cream shadow-card-elevated">
              {/* Instant Cache Banner */}
              {cachedDownloads.length > 0 && (
                <div className="mb-6 p-4 rounded-3xl bg-white border border-light-orange/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-ink-black text-mc-yellow flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4 fill-current" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider text-signal-orange">
                        ⚡ Instant Cache Available (0s wait)
                      </div>
                      <p className="text-[11px] text-charcoal">
                        {statusNotice || 'Already processed on Orbit Pro disk cache.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cachedDownloads.map((cd) => (
                      <button
                        key={cd.task_id}
                        type="button"
                        onClick={() => triggerFileSave(cd.file_download_url, cd.file_name)}
                        className="px-4 py-2 rounded-full bg-ink-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-light-orange" />
                        <span>Save {cd.quality_label} ({cd.file_size_formatted})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Media Summary Row */}
              <div className="flex flex-col md:flex-row gap-6 pb-6 mb-6 border-b border-border-cream">
                {media.thumbnail_url && (
                  <div className="w-full md:w-72 aspect-video rounded-[24px] overflow-hidden bg-black shrink-0 relative shadow-sm">
                    <img src={media.thumbnail_url} alt={media.title} className="w-full h-full object-cover" />
                    {media.duration_string && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                        {media.duration_string}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white border border-border-cream text-signal-orange">
                        {media.platform || 'Universal Web'}
                      </span>
                      {media.uploader && (
                        <span className="text-xs text-slate-gray flex items-center gap-1 font-medium">
                          <User className="w-3.5 h-3.5" />
                          {media.uploader}
                        </span>
                      )}
                      {media.view_count > 0 && (
                        <span className="text-xs text-slate-gray flex items-center gap-1 font-mono">
                          <Eye className="w-3.5 h-3.5" />
                          {Number(media.view_count).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold text-ink-black leading-snug mb-3">
                      {media.title}
                    </h2>
                  </div>

                  {/* Direct Cross-Platform Bridge Action: Send straight to CLIPIT! */}
                  {onSendToClipit && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => onSendToClipit(media.url || currentUrl)}
                        className="px-5 py-2.5 rounded-cta bg-ink-black hover:bg-black text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition hover:scale-[1.01] cursor-pointer"
                      >
                        <Scissors className="w-4 h-4 text-light-orange" />
                        <span>Clip into 9:16 Shorts in CLIPIT</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Format Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                {formats.videos?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('video')}
                    className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      activeTab === 'video'
                        ? 'bg-ink-black text-white border-ink-black'
                        : 'bg-white text-charcoal border-border-cream'
                    }`}
                  >
                    <Video className="w-3.5 h-3.5 text-light-orange" />
                    <span>Video ({formats.videos.length})</span>
                  </button>
                )}
                {formats.mp3_conversions?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('mp3')}
                    className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      activeTab === 'mp3'
                        ? 'bg-ink-black text-white border-ink-black'
                        : 'bg-white text-charcoal border-border-cream'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5 text-signal-orange" />
                    <span>MP3 Studio (320k)</span>
                  </button>
                )}
                {formats.audios?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('audio')}
                    className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      activeTab === 'audio'
                        ? 'bg-ink-black text-white border-ink-black'
                        : 'bg-white text-charcoal border-border-cream'
                    }`}
                  >
                    <FileAudio className="w-3.5 h-3.5 text-slate-gray" />
                    <span>Raw Audio ({formats.audios.length})</span>
                  </button>
                )}
                {formats.images?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('image')}
                    className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                      activeTab === 'image'
                        ? 'bg-ink-black text-white border-ink-black'
                        : 'bg-white text-charcoal border-border-cream'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-signal-orange" />
                    <span>Original Images ({formats.images.length})</span>
                  </button>
                )}
              </div>

              {/* Format Rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeTab === 'video' &&
                  (formats.videos || []).map((vf, i) => (
                    <div
                      key={`${vf.format_id}-${i}`}
                      className="bg-white border border-border-cream rounded-[20px] p-4 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink-black">{vf.resolution || vf.quality_label}</div>
                        <div className="text-[11px] text-slate-gray font-mono">
                          {vf.ext?.toUpperCase() || 'MP4'} {vf.filesize_formatted ? `• ${vf.filesize_formatted}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload({
                            url: media.url || currentUrl,
                            format_id: vf.format_id,
                            quality_label: vf.resolution || vf.quality_label || 'Video',
                            media_type: 'video',
                          })
                        }
                        className="px-3.5 py-2 rounded-full bg-ink-black hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-light-orange" />
                        <span>Download</span>
                      </button>
                    </div>
                  ))}

                {activeTab === 'mp3' &&
                  (formats.mp3_conversions || []).map((mp3, i) => (
                    <div
                      key={`${mp3.bitrate || mp3.quality_label}-${i}`}
                      className="bg-white border border-border-cream rounded-[20px] p-4 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink-black truncate">{mp3.quality_label || mp3.label}</div>
                        <div className="text-[11px] text-slate-gray">
                          {mp3.badge || `Studio MP3 (${mp3.bitrate || '320k'})`}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload({
                            url: media.url || currentUrl,
                            format_id: mp3.format_id || 'bestaudio',
                            quality_label: mp3.quality_label || mp3.label || 'MP3 320k',
                            media_type: 'mp3',
                            convert_to_mp3: true,
                            audio_bitrate: mp3.bitrate || '320k',
                          })
                        }
                        className="px-3.5 py-2 rounded-full bg-signal-orange hover:brightness-110 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Music className="w-3.5 h-3.5" />
                        <span>MP3</span>
                      </button>
                    </div>
                  ))}

                {activeTab === 'audio' &&
                  (formats.audios || []).map((af, i) => (
                    <div
                      key={`${af.format_id}-${i}`}
                      className="bg-white border border-border-cream rounded-[20px] p-4 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink-black truncate">{af.quality_label || 'Audio Stream'}</div>
                        <div className="text-[11px] text-slate-gray font-mono">
                          {af.ext?.toUpperCase() || 'M4A'} {af.filesize_formatted ? `• ${af.filesize_formatted}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload({
                            url: media.url || currentUrl,
                            format_id: af.format_id,
                            quality_label: af.quality_label || 'Audio',
                            media_type: 'audio',
                          })
                        }
                        className="px-3.5 py-2 rounded-full bg-ink-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  ))}

                {activeTab === 'image' &&
                  (formats.images || []).map((im, i) => (
                    <div
                      key={i}
                      className="bg-white border border-border-cream rounded-[20px] p-4 flex items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink-black truncate">{im.quality_label || im.resolution || 'Original High-Res'}</div>
                        <div className="text-[11px] text-slate-gray font-mono">
                          {im.ext?.toUpperCase() || 'JPG'} {im.filesize_formatted ? `• ${im.filesize_formatted}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() =>
                          handleDownload({
                            url: media.url || currentUrl,
                            format_id: im.format_id || 'image',
                            quality_label: im.quality_label || im.resolution || 'Original Image',
                            media_type: 'image',
                          })
                        }
                        className="px-3.5 py-2 rounded-full bg-ink-black text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
