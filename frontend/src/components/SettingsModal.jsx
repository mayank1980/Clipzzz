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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-lime-neon" />
            <h2 className="font-bold text-base text-white">AI Configuration</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-lime-neon" />
              Google Gemini API Key
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Power highlight discovery, viral hook ranking, and speech transcription using Gemini 3.8 Flash.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-lime-neon font-mono"
              />
              <button
                type="button"
                onClick={handleValidate}
                disabled={isValidating || !keyInput.trim()}
                className="bg-dark-800 hover:bg-dark-700 border border-dark-700 text-xs text-slate-200 px-3 py-2 rounded-xl transition flex items-center gap-1.5 font-semibold"
              >
                {isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
              </button>
            </div>
          </div>

          {validationResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                validationResult.valid
                  ? 'bg-lime-950/40 border-lime-neon/40 text-lime-neon'
                  : 'bg-red-950/40 border-red-800 text-red-300'
              }`}
            >
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{validationResult.message}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-lime-neon hover:bg-lime-400 text-black text-xs font-bold rounded-xl shadow-neon-sm transition"
            >
              Save Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

