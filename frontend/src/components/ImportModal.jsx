import React, { useState } from 'react';
import { X, Youtube, UploadCloud, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export default function ImportModal({ isOpen, onClose, onProjectReady, apiKey, onSaveApiKey }) {
  const [activeTab, setActiveTab] = useState('youtube'); // 'youtube' or 'upload'
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [customKey, setCustomKey] = useState(apiKey || '');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);

  if (!isOpen) return null;

  const handleStartImport = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);
    setStatusMessage('Submitting video for processing...');

    try {
      let payload;
      if (activeTab === 'youtube') {
        if (!youtubeUrl.trim()) {
          setErrorMessage('Please enter a valid YouTube URL');
          setIsLoading(false);
          return;
        }
        payload = {
          youtube_url: youtubeUrl.trim(),
          gemini_api_key: customKey.trim(),
        };
      } else {
        if (!selectedFile) {
          setErrorMessage('Please select a video file to upload');
          setIsLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('video_file', selectedFile);
        if (customKey.trim()) {
          formData.append('gemini_api_key', customKey.trim());
        }
        payload = formData;
      }

      if (customKey.trim() && customKey !== apiKey) {
        onSaveApiKey(customKey.trim());
      }

      const res = await api.importVideo(payload, (pct) => {
        setUploadProgress(pct);
        if (pct < 100) {
          setStatusMessage(`Uploading video: ${pct}%`);
        } else {
          setStatusMessage('Processing upload on server...');
        }
      });

      const projectId = res.id;
      setActiveProjectId(projectId);
      setStatusMessage('Video registered. Initializing processing pipeline...');

      // Poll status until ready
      const interval = setInterval(async () => {
        try {
          const statusRes = await api.getProjectStatus(projectId);
          setStatusMessage(statusRes.status_message || 'Analyzing video...');
          if (statusRes.download_progress !== undefined) {
            setDownloadProgress(statusRes.download_progress);
          }
          if (statusRes.download_speed) {
            setDownloadSpeed(statusRes.download_speed);
          }

          if (statusRes.status === 'ready') {
            clearInterval(interval);
            setIsLoading(false);
            const fullProject = await api.getProject(projectId);
            onProjectReady(fullProject);
            onClose();
          } else if (statusRes.status === 'failed') {
            clearInterval(interval);
            setIsLoading(false);
            setErrorMessage(statusRes.error_message || 'Failed to process video');
          }
        } catch (pollErr) {
          console.error('Polling error', pollErr);
        }
      }, 1800);

    } catch (err) {
      console.error('Import error', err);
      setIsLoading(false);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to import video');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-lime-neon" />
            <h2 className="font-bold text-lg text-white">Import Video to Clipzzz</h2>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-dark-700 border-t-lime-neon animate-spin"></div>
                <Sparkles className="w-6 h-6 text-lime-neon absolute inset-0 m-auto" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">AI Pipeline at Work</h3>
                <p className="text-xs text-lime-neon font-medium">{statusMessage}</p>
                <p className="text-[11px] text-slate-400 mt-2 max-w-xs mx-auto">
                  Extracting audio, transcribing speech, and analyzing high-retention YouTube Shorts hooks...
                </p>
              </div>
              {downloadProgress > 0 && downloadProgress < 100 && (
                <div className="w-full space-y-1 mt-4">
                  <div className="flex justify-between text-[11px] font-mono text-cyan-400">
                    <span>Downloading Stream</span>
                    <span>{downloadSpeed ? `${downloadSpeed} · ` : ''}{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-lime-neon h-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden mt-4">
                  <div className="bg-lime-neon h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleStartImport} className="space-y-5">
              {/* Tab Selector */}
              <div className="grid grid-cols-2 p-1 bg-dark-950 rounded-xl border border-dark-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('youtube')}
                  className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                    activeTab === 'youtube'
                      ? 'bg-dark-800 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Youtube className="w-4 h-4 text-red-500" />
                  YouTube Link
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                    activeTab === 'upload'
                      ? 'bg-dark-800 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UploadCloud className="w-4 h-4 text-lime-neon" />
                  Upload Video
                </button>
              </div>

              {/* YouTube Tab */}
              {activeTab === 'youtube' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    YouTube Video URL
                  </label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-lime-neon transition"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Paste any YouTube video or podcast URL. Native captions and timestamps are extracted automatically.
                  </p>
                </div>
              ) : (
                /* File Upload Tab */
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Select Video File (MP4, MKV, MOV, WebM)
                  </label>
                  <div className="border-2 border-dashed border-dark-700 hover:border-lime-neon/50 rounded-xl p-6 text-center cursor-pointer transition bg-dark-950/50">
                    <input
                      type="file"
                      id="video-upload-input"
                      accept="video/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="video-upload-input" className="cursor-pointer">
                      <UploadCloud className="w-8 h-8 text-lime-neon mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-200">
                        {selectedFile ? selectedFile.name : 'Click to browse or drop video here'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">Up to 2GB supported</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Gemini API Key configuration */}
              <div className="p-3 bg-dark-950/80 rounded-xl border border-dark-800">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-lime-neon" />
                    Gemini API Key
                  </label>
                  <span className="text-[10px] text-slate-500">Optional (Recommended)</span>
                </div>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="AIzaSy... (leave blank to use built-in engine)"
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon"
                />
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-sm py-3 rounded-xl transition shadow-neon flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 fill-black" />
                <span>Analyze & Clip with Gemini AI</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

