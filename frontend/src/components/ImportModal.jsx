import React, { useState } from 'react';
import { X, Youtube, UploadCloud, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export default function ImportModal({ isOpen, onClose, onProjectReady, apiKey, onSaveApiKey }) {
  const [activeTab, setActiveTab] = useState('youtube');
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
      setStatusMessage('Video registered. Processing pipeline active...');

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
      }, 1000);

    } catch (err) {
      console.error('Import error', err);
      setIsLoading(false);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to import video');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-border-cream w-full max-w-lg rounded-stadium shadow-card-elevated overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-cream flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center w-8 h-5 select-none">
              <div className="w-5 h-5 rounded-full bg-mc-red"></div>
              <div className="w-5 h-5 rounded-full bg-mc-yellow -ml-2.5 mix-blend-multiply opacity-95"></div>
            </div>
            <h2 className="font-extrabold text-base text-ink-black tracking-tight">Import Video</h2>
          </div>
          {!isLoading && (
            <button onClick={onClose} className="text-slate-gray hover:text-ink-black p-1 rounded-full hover:bg-canvas-cream transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 rounded-full border-4 border-canvas-cream border-t-signal-orange animate-spin"></div>
                <Sparkles className="w-6 h-6 text-signal-orange absolute inset-0 m-auto" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-ink-black tracking-tight mb-1">AI Pipeline at Work</h3>
                <p className="text-xs text-signal-orange font-bold">{statusMessage}</p>
                <p className="text-[11px] text-slate-gray mt-2 max-w-xs mx-auto">
                  Extracting audio, transcribing speech, and analyzing hooks...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStartImport} className="space-y-4">
              {/* Tab Selector */}
              <div className="grid grid-cols-2 p-1 bg-canvas-cream rounded-full border border-border-cream">
                <button
                  type="button"
                  onClick={() => setActiveTab('youtube')}
                  className={`py-2 text-xs font-bold rounded-full flex items-center justify-center gap-2 transition cursor-pointer ${
                    activeTab === 'youtube'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  <Youtube className="w-4 h-4 text-mc-red" />
                  YouTube Link
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`py-2 text-xs font-bold rounded-full flex items-center justify-center gap-2 transition cursor-pointer ${
                    activeTab === 'upload'
                      ? 'bg-white text-ink-black shadow-sm'
                      : 'text-slate-gray hover:text-ink-black'
                  }`}
                >
                  <UploadCloud className="w-4 h-4 text-signal-orange" />
                  Upload Video
                </button>
              </div>

              {/* YouTube Tab */}
              {activeTab === 'youtube' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-gray mb-1.5 uppercase tracking-wide">
                    YouTube URL
                  </label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-3 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange shadow-inner"
                  />
                </div>
              ) : (
                /* File Upload Tab */
                <div>
                  <label className="block text-xs font-bold text-slate-gray mb-1.5 uppercase tracking-wide">
                    Select Video File
                  </label>
                  <div className="border-2 border-dashed border-dust-taupe hover:border-signal-orange rounded-3xl p-6 text-center cursor-pointer transition bg-lifted-cream">
                    <input
                      type="file"
                      id="video-upload-input"
                      accept="video/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="video-upload-input" className="cursor-pointer">
                      <UploadCloud className="w-8 h-8 text-signal-orange mx-auto mb-2" />
                      <p className="text-xs font-semibold text-ink-black">
                        {selectedFile ? selectedFile.name : 'Click to select video (MP4, MKV, MOV)'}
                      </p>
                      <p className="text-[10px] text-slate-gray mt-1">Up to 2GB supported</p>
                    </label>
                  </div>
                </div>
              )}

              {/* Gemini API Key */}
              <div className="p-3 bg-canvas-cream rounded-2xl border border-border-cream">
                <label className="text-xs font-bold text-slate-gray mb-1 block uppercase tracking-wide">
                  Gemini API Key (Optional)
                </label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="AIzaSy... (leave blank to use account key)"
                  className="w-full bg-white border border-border-cream rounded-full px-3.5 py-1.5 text-xs text-ink-black font-mono placeholder-slate-gray focus:outline-none focus:border-signal-orange"
                />
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-canvas-cream border border-signal-orange/60 rounded-2xl flex items-center gap-2 text-xs text-clay-brown">
                  <AlertCircle className="w-4 h-4 text-signal-orange shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-ink-black hover:bg-black text-white font-extrabold text-xs py-3.5 rounded-cta transition shadow-card-soft flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
              >
                <Sparkles className="w-4 h-4 text-signal-orange" />
                <span>Import & Process Video</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
