import React, { useState } from 'react';
import { Sparkles, Shield, Key, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import logoImg from '../assets/logo.png';

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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden p-6 relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-dark-950 border border-lime-neon/40 flex items-center justify-center p-1.5 shadow-neon-sm">
            <img src={logoImg} alt="Clipzzz Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Engine Setup Required</h2>
            <p className="text-xs text-slate-400">Bind your Gemini API Key with AES Encryption</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 bg-dark-950 rounded-2xl border border-dark-800 text-xs text-slate-300 space-y-2.5 mb-5">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Shield className="w-4 h-4 text-lime-neon" />
            <span>Bank-Grade Encryption & Permanent Account Binding</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Your key is encrypted on the backend with 256-bit symmetric encryption. For strict security, your raw key is never displayed again—only masked credentials will appear on this platform.
          </p>
          <div className="pt-1 flex items-center justify-between border-t border-dark-800/80 text-[11px]">
            <span className="text-slate-400">Need a free key?</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lime-neon hover:underline font-bold inline-flex items-center gap-1"
            >
              Get Gemini Key from Google AI Studio
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Existing Masked Key Badge if user already has one */}
        {hasKey && (
          <div className="mb-4 p-3 bg-dark-850 rounded-xl border border-lime-neon/30 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Active Key</span>
              <p className="font-mono font-bold text-lime-neon text-sm">{maskedKey}</p>
            </div>
            <span className="text-[10px] bg-lime-neon/20 text-lime-neon font-bold px-2 py-0.5 rounded-full border border-lime-neon/40 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Linked & Encrypted
            </span>
          </div>
        )}

        {/* Messages */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-lime-950/50 border border-lime-neon/40 rounded-xl flex items-center gap-2 text-xs text-lime-neon">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSaveKey} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-lime-neon" />
              {hasKey ? 'Update Gemini API Key' : 'Enter Gemini API Key'}
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              required
              className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {hasKey && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Continue with Existing Key
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !keyInput.trim()}
              className="bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs px-6 py-2.5 rounded-xl transition shadow-neon flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <>
                  <Shield className="w-4 h-4 fill-black" />
                  <span>Encrypt & Bind to Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

