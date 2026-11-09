import React, { useState } from 'react';
import { X, Sparkles, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export default function SettingsModal({ isOpen, onClose, apiKey, onSaveApiKey }) {
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  if (!isOpen) return null;

  const handleValidate = async () => {
    if (!keyInput.trim()) {
      setValidationResult({ valid: false, message: 'Please enter an API key' });
      return;
    }
    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await api.validateGeminiKey(keyInput.trim());
      setValidationResult(res);
      if (res.valid) {
        onSaveApiKey(keyInput.trim());
      }
    } catch (err) {
      setValidationResult({
        valid: false,
        message: err.response?.data?.message || err.message || 'Validation failed',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = () => {
    onSaveApiKey(keyInput.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-border-cream w-full max-w-md rounded-stadium shadow-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-cream flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
            <h2 className="font-extrabold text-base text-ink-black tracking-tight">AI Settings</h2>
          </div>
          <button onClick={onClose} className="text-slate-gray hover:text-ink-black p-1 rounded-full hover:bg-canvas-cream transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink-black mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
              Gemini API Key
            </label>
            <p className="text-[11px] text-slate-gray mb-3">
              Enables Discover AI viral hook ranking and speech processing.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-lifted-cream border border-dust-taupe rounded-full px-4 py-2.5 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange font-mono shadow-inner"
              />
              <button
                type="button"
                onClick={handleValidate}
                disabled={isValidating || !keyInput.trim()}
                className="bg-canvas-cream hover:bg-lifted-cream border border-border-cream text-xs text-charcoal px-4 py-2 rounded-full transition flex items-center gap-1.5 font-bold cursor-pointer"
              >
                {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
              </button>
            </div>
          </div>

          {validationResult && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                validationResult.valid
                  ? 'bg-canvas-cream border-border-cream text-ink-black font-semibold'
                  : 'bg-canvas-cream border-signal-orange/60 text-clay-brown'
              }`}
            >
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4 text-signal-orange shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-signal-orange shrink-0" />
              )}
              <span>{validationResult.message}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-border-cream text-slate-gray hover:text-ink-black text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 rounded-cta bg-ink-black hover:bg-black text-white text-xs font-bold transition shadow-card-soft"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
