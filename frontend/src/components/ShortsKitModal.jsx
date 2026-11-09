import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Archive,
  FileText,
  Video,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Tag,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';

export default function ShortsKitModal({ isOpen, onClose, clip, project }) {
  const [loading, setLoading] = useState(true);
  const [kit, setKit] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    if (!isOpen || !clip) return;
    setLoading(true);
    setCopiedField('');

    api.getClipDescription(clip.id)
      .then((data) => {
        setKit(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load shorts upload kit', err);
        setLoading(false);
      });
  }, [isOpen, clip?.id]);

  if (!isOpen || !clip) return null;

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2500);
  };

  const downloadMp4Url = api.getClipDownloadUrl(clip.id);
  const downloadMdUrl = api.getClipDescriptionDownloadUrl(clip.id);
  const downloadZipUrl = api.getClipBundleDownloadUrl(clip.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-border-cream w-full max-w-2xl rounded-stadium shadow-card-elevated overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-cream flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center w-8 h-5 select-none">
              <div className="w-5 h-5 rounded-full bg-mc-red"></div>
              <div className="w-5 h-5 rounded-full bg-mc-yellow -ml-2.5 mix-blend-multiply opacity-95"></div>
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-ink-black flex items-center gap-2 tracking-tight">
                Shorts Upload Kit
                <span className="text-[9px] font-bold text-ink-black bg-canvas-cream px-2.5 py-0.5 rounded-full border border-border-cream">
                  Copyright Safe
                </span>
              </h2>
              <p className="text-[11px] text-slate-gray">
                SEO title, description, hashtags, and creator attribution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-gray hover:text-ink-black p-1.5 rounded-full hover:bg-canvas-cream transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-7 h-7 text-signal-orange animate-spin" />
              <p className="text-xs text-slate-gray font-medium">
                Generating metadata package...
              </p>
            </div>
          ) : (
            <>
              {/* TOP DOWNLOAD ACTION BAR */}
              <div className="bg-lifted-cream border border-border-cream rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="text-xs">
                  <span className="font-bold text-ink-black block">Download Assets</span>
                  <span className="text-[11px] text-slate-gray">Individual files or full bundle</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={downloadMp4Url}
                    download
                    className="bg-white hover:bg-canvas-cream text-charcoal border border-border-cream text-xs font-bold px-3 py-1.5 rounded-full transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Video className="w-3.5 h-3.5 text-signal-orange" />
                    <span>Download MP4</span>
                  </a>

                  <a
                    href={downloadMdUrl}
                    download
                    className="bg-white hover:bg-canvas-cream text-charcoal border border-border-cream text-xs font-bold px-3 py-1.5 rounded-full transition flex items-center gap-1.5 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-gray" />
                    <span>Download .MD</span>
                  </a>

                  <a
                    href={downloadZipUrl}
                    download
                    className="bg-ink-black hover:bg-black text-white text-xs font-bold px-4 py-1.5 rounded-full transition shadow-card-soft flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Download ZIP</span>
                  </a>
                </div>
              </div>

              {/* 1. TITLE */}
              <div className="border border-border-cream rounded-2xl p-4 bg-lifted-cream space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-gray uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-signal-orange" />
                    Shorts Title
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.title, 'title')}
                    className="text-[11px] text-ink-black hover:text-signal-orange flex items-center gap-1 font-bold transition cursor-pointer"
                  >
                    {copiedField === 'title' ? (
                      <>
                        <Check className="w-3 h-3 text-signal-orange" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Title</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-white border border-border-cream rounded-xl p-3 font-mono text-xs text-ink-black shadow-sm">
                  {kit?.title}
                </div>
              </div>

              {/* 2. DESCRIPTION */}
              <div className="border border-border-cream rounded-2xl p-4 bg-lifted-cream space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-gray uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-signal-orange" />
                    Description (Copy & Paste)
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.description || kit?.markdown, 'desc')}
                    className="text-[11px] text-ink-black hover:text-signal-orange flex items-center gap-1 font-bold transition cursor-pointer"
                  >
                    {copiedField === 'desc' ? (
                      <>
                        <Check className="w-3 h-3 text-signal-orange" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Description</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-charcoal leading-relaxed bg-white border border-border-cream rounded-xl p-3 whitespace-pre-wrap font-sans shadow-sm">
                  {kit?.description || kit?.hook}
                </pre>
              </div>

              {/* 3. HASHTAGS */}
              <div className="border border-border-cream rounded-2xl p-4 bg-lifted-cream space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-gray uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-signal-orange" />
                    Hashtags
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.hashtags_string, 'hashtags')}
                    className="text-[11px] text-ink-black hover:text-signal-orange flex items-center gap-1 font-bold transition cursor-pointer"
                  >
                    {copiedField === 'hashtags' ? (
                      <>
                        <Check className="w-3 h-3 text-signal-orange" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy All</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-white border border-border-cream rounded-xl p-3 font-mono text-xs text-signal-orange select-all shadow-sm">
                  {kit?.hashtags_string}
                </div>
              </div>

              {/* 4. CREATOR ATTRIBUTION */}
              <div className="border border-border-cream rounded-2xl p-4 bg-canvas-cream space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-black">
                  <ExternalLink className="w-4 h-4 text-signal-orange" />
                  <span>Original Creator Attribution</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-border-cream text-[11px] text-slate-gray space-y-1 shadow-sm">
                  <p>
                    <strong className="text-charcoal">Original Video:</strong> {project?.title || kit?.raw_title}
                  </p>
                  <p>
                    <strong className="text-charcoal">Creator:</strong> {kit?.channel_credit}
                  </p>
                  <p className="truncate">
                    <strong className="text-charcoal">Source URL:</strong>{' '}
                    <span className="text-signal-orange underline">{kit?.video_url}</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-cream bg-white flex items-center justify-between text-xs">
          <span className="text-slate-gray text-[11px]">
            Ready to upload to YouTube Shorts
          </span>
          <button
            onClick={onClose}
            className="bg-canvas-cream hover:bg-lifted-cream text-ink-black font-bold px-4 py-1.5 rounded-full border border-border-cream transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
