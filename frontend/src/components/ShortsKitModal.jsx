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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700/80 flex items-center justify-between bg-dark-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-lime-neon/15 border border-lime-neon/30 flex items-center justify-center text-lime-neon">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white flex items-center gap-2">
                YouTube Shorts Upload Kit
                <span className="text-[10px] font-bold text-lime-neon bg-lime-neon/10 px-2 py-0.5 rounded-full border border-lime-neon/20">
                  Copyright Safe
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                SEO-optimized title, description, hashtags & fair use creator attribution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-lime-neon animate-spin" />
              <p className="text-xs text-slate-400 font-medium">
                Generating viral hashtags and creator attribution...
              </p>
            </div>
          ) : (
            <>
              {/* TOP DOWNLOAD ACTION BAR */}
              <div className="bg-dark-950/90 border border-dark-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  <span className="font-bold text-white block">Download Assets</span>
                  <span className="text-[11px] text-slate-400">Download single files or full bundle</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Direct MP4 Download */}
                  <a
                    href={downloadMp4Url}
                    download
                    className="bg-dark-800 hover:bg-dark-700 text-slate-200 border border-dark-700 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                  >
                    <Video className="w-3.5 h-3.5 text-lime-neon" />
                    <span>Download MP4</span>
                  </a>

                  {/* Direct Markdown Download */}
                  <a
                    href={downloadMdUrl}
                    download
                    className="bg-dark-800 hover:bg-dark-700 text-slate-200 border border-dark-700 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Download .MD</span>
                  </a>

                  {/* Complete ZIP Bundle */}
                  <a
                    href={downloadZipUrl}
                    download
                    className="bg-lime-neon hover:bg-lime-400 text-black text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition shadow-neon-sm flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Download ZIP Bundle</span>
                  </a>
                </div>
              </div>

              {/* 1. SUGGESTED VIRAL TITLE */}
              <div className="border border-dark-800 rounded-xl p-3.5 bg-dark-950/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-lime-neon" />
                    YouTube Shorts Title
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.title, 'title')}
                    className="text-[11px] text-lime-neon hover:text-lime-300 flex items-center gap-1 font-semibold transition"
                  >
                    {copiedField === 'title' ? (
                      <>
                        <Check className="w-3 h-3" />
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
                <div className="bg-dark-950 border border-dark-800 rounded-lg p-2.5 font-mono text-xs text-white">
                  {kit?.title}
                </div>
              </div>

              {/* 2. DESCRIPTION (WITHOUT WEIRD EMOJIS, CLEAN ATTRIBUTION) */}
              <div className="border border-dark-800 rounded-xl p-3.5 bg-dark-950/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    YouTube Shorts Description (Copy & Paste)
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.description || kit?.markdown, 'desc')}
                    className="text-[11px] text-lime-neon hover:text-lime-300 flex items-center gap-1 font-semibold transition cursor-pointer"
                  >
                    {copiedField === 'desc' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied Description!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Description</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-slate-300 leading-relaxed bg-dark-950 border border-dark-800 rounded-lg p-3 whitespace-pre-wrap font-sans">
                  {kit?.description || kit?.hook}
                </pre>
              </div>

              {/* 3. HASHTAGS (SEPARATE – ONE COPYABLE LINE) */}
              <div className="border border-dark-800 rounded-xl p-3.5 bg-dark-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-lime-neon" />
                    Hashtags (Separate – Copy & Paste)
                  </label>
                  <button
                    onClick={() => handleCopy(kit?.hashtags_string, 'hashtags')}
                    className="text-[11px] text-lime-neon hover:text-lime-300 flex items-center gap-1 font-semibold transition cursor-pointer"
                  >
                    {copiedField === 'hashtags' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied Hashtags!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy All Hashtags</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-dark-950 border border-dark-800 rounded-lg p-2.5 font-mono text-xs text-lime-neon select-all">
                  {kit?.hashtags_string}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {kit?.hashtags?.map((tag, idx) => (
                    <span
                      key={idx}
                      className="bg-dark-900 border border-dark-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-md font-mono"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* 4. ORIGINAL CREATOR ATTRIBUTION */}
              <div className="border border-dark-800 rounded-xl p-3.5 bg-dark-950/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-lime-neon">
                  <ExternalLink className="w-4 h-4" />
                  <span>Creator & Source Attribution</span>
                </div>
                <div className="bg-dark-950 p-3 rounded-lg border border-dark-800 text-[11px] text-slate-300 space-y-1">
                  <p>
                    <strong className="text-slate-400">Original Video:</strong> {project?.title || kit?.raw_title}
                  </p>
                  <p>
                    <strong className="text-slate-400">Creator / Channel:</strong> {kit?.channel_credit}
                  </p>
                  <p className="truncate">
                    <strong className="text-slate-400">Full Video Link:</strong>{' '}
                    <span className="text-blue-400 underline">{kit?.video_url}</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-dark-700/80 bg-dark-950/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            Ready to upload directly on YouTube Studio Shorts tab
          </span>
          <button
            onClick={onClose}
            className="bg-dark-800 hover:bg-dark-700 text-white font-bold px-4 py-1.5 rounded-xl border border-dark-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

