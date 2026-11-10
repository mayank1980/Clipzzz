import React, { useState } from 'react';
import { Shield, ExternalLink, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { api } from '../services/api';
import clipitIcon from '../assets/img/clipit_icon.png';

export default function GeminiKeyModal({ isOpen, onClose, userProfile, onKeySaved }) {
  const [keyInput, setKeyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleSaveKey = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!keyInput.trim()) {
      setErrorMessage('Please enter your Google Gemini API key.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.saveGeminiKey(keyInput.trim());
      setSuccessMessage(res.message || 'Key encrypted and bound to your account successfully!');
      onKeySaved?.(res);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to validate and encrypt key.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasKey = userProfile?.has_gemini_key;
  const maskedKey = userProfile?.masked_gemini_key;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-border-cream w-full max-w-lg rounded-stadium shadow-card-elevated overflow-hidden p-6 sm:p-7 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img src={clipitIcon} alt="CLIPIT" className="w-7 h-7 object-contain shrink-0 select-none" />
            <div>
              <h2 className="text-base font-extrabold text-ink-black tracking-tight">AI Engine Setup</h2>
              <p className="text-xs text-slate-gray">Bind your Gemini API Key with AES-256 Encryption</p>
            </div>
          </div>
          {hasKey && (
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-gray hover:text-ink-black hover:bg-canvas-cream transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="p-4 bg-canvas-cream rounded-2xl border border-border-cream text-xs text-charcoal space-y-2 mb-5">
          <div className="flex items-center gap-2 font-bold text-ink-black">
            <Shield className="w-4 h-4 text-signal-orange" />
            <span>Bank-Grade Encryption & Account Binding</span>
          </div>
          <p className="text-[11px] text-slate-gray leading-relaxed">
            Your key is encrypted on the backend with 256-bit symmetric encryption. Your raw key is never displayed again—only masked credentials will appear on this platform.
          </p>
          <div className="pt-2 flex items-center justify-between border-t border-border-cream text-[11px]">
            <span className="text-slate-gray">Need a free key?</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-signal-orange hover:underline font-bold inline-flex items-center gap-1"
            >
              Get Gemini Key from Google AI Studio
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Existing Masked Key Badge if user already has one */}
        {hasKey && (
          <div className="mb-4 p-3 bg-lifted-cream rounded-2xl border border-border-cream flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-gray uppercase font-semibold">Active Key</span>
              <p className="font-mono font-bold text-ink-black text-sm">{maskedKey}</p>
            </div>
            <span className="text-[10px] bg-white text-ink-black font-bold px-2.5 py-0.5 rounded-full border border-border-cream flex items-center gap-1 shadow-sm">
              <CheckCircle2 className="w-3 h-3 text-signal-orange" /> Linked
            </span>
          </div>
        )}

        {/* Messages */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-canvas-cream border border-signal-orange/50 rounded-2xl flex items-center gap-2 text-xs text-clay-brown">
            <AlertCircle className="w-4 h-4 text-signal-orange shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-canvas-cream border border-border-cream rounded-2xl flex items-center gap-2 text-xs text-ink-black">
            <CheckCircle2 className="w-4 h-4 text-signal-orange shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSaveKey} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-black mb-1.5 uppercase tracking-wide">
              {hasKey ? 'Replace API Key' : 'Enter Gemini API Key'}
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-lifted-cream border border-dust-taupe rounded-full px-4 py-3 text-xs text-ink-black font-mono placeholder-slate-gray focus:outline-none focus:border-signal-orange focus:ring-2 focus:ring-signal-orange/15 shadow-inner"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            {hasKey && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-full border border-border-cream bg-white hover:bg-canvas-cream text-charcoal font-semibold text-xs transition cursor-pointer"
              >
                Close
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 rounded-cta bg-ink-black hover:bg-black text-white font-bold text-xs shadow-card-soft transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{hasKey ? 'Update & Bind Key' : 'Save & Encrypt Key'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
