import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Check,
  Pencil,
  Sparkles,
  Clock,
  Type,
  Plus,
  Trash2,
} from 'lucide-react';

export default function CaptionEditDrawer({
  segment,
  isOpen,
  onClose,
  onUpdateSegment,
  onSeek,
  onSaveToBackend,
}) {
  if (!isOpen || !segment) return null;

  const [text, setText] = useState(segment.text || '');
  const [words, setWords] = useState(segment.words || []);
  const [savedBadge, setSavedBadge] = useState(false);

  useEffect(() => {
    setText(segment.text || '');
    setWords(segment.words ? JSON.parse(JSON.stringify(segment.words)) : []);
  }, [segment.id, segment.start, segment.end]);

  const formatMinSec = (sec) => {
    const s = Math.max(0, sec || 0);
    const m = Math.floor(s / 60);
    const secPart = (s % 60).toFixed(1);
    const secStr = secPart < 10 ? `0${secPart}` : secPart;
    return `${m < 10 ? '0' : ''}${m}:${secStr}`;
  };

  const handleTextChange = (newText) => {
    setText(newText);
    const splitWords = newText.trim().split(/\s+/).filter(Boolean);
    const totalDuration = Math.max(0.2, (segment.end || 1) - (segment.start || 0));
    const wordDur = totalDuration / Math.max(1, splitWords.length);

    const updatedWords = splitWords.map((w, idx) => {
      const existingWord = words[idx];
      const wStart = existingWord ? existingWord.start : Number((segment.start + (idx * wordDur)).toFixed(2));
      const wEnd = existingWord ? existingWord.end : Number((wStart + wordDur).toFixed(2));
      return {
        word: w,
        start: wStart,
        end: wEnd,
      };
    });

    setWords(updatedWords);

    const updatedSeg = {
      ...segment,
      text: newText,
      words: updatedWords,
    };
    onUpdateSegment(updatedSeg);
    triggerSavedIndicator();
  };

  const handleWordChange = (idx, newWord) => {
    const updatedWords = [...words];
    updatedWords[idx] = {
      ...updatedWords[idx],
      word: newWord,
    };
    setWords(updatedWords);

    const newFullText = updatedWords.map((w) => w.word).join(' ');
    setText(newFullText);

    const updatedSeg = {
      ...segment,
      text: newFullText,
      words: updatedWords,
    };
    onUpdateSegment(updatedSeg);
    triggerSavedIndicator();
  };

  const handleAddWord = () => {
    const lastWord = words[words.length - 1];
    const newStart = lastWord ? lastWord.end : segment.start;
    const newEnd = Number((newStart + 0.4).toFixed(2));
    const newWordObj = {
      word: 'word',
      start: newStart,
      end: newEnd,
    };
    const updatedWords = [...words, newWordObj];
    setWords(updatedWords);
    const newFullText = updatedWords.map((w) => w.word).join(' ');
    setText(newFullText);
    onUpdateSegment({
      ...segment,
      text: newFullText,
      words: updatedWords,
    });
    triggerSavedIndicator();
  };

  const handleDeleteWord = (idx) => {
    if (words.length <= 1) return;
    const updatedWords = words.filter((_, i) => i !== idx);
    setWords(updatedWords);

    const newFullText = updatedWords.map((w) => w.word).join(' ');
    setText(newFullText);

    const updatedSeg = {
      ...segment,
      text: newFullText,
      words: updatedWords,
    };
    onUpdateSegment(updatedSeg);
    triggerSavedIndicator();
  };

  const triggerSavedIndicator = () => {
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 1200);
  };

  const handleReset = () => {
    setText(segment.text || '');
    setWords(segment.words ? JSON.parse(JSON.stringify(segment.words)) : []);
    onUpdateSegment(segment);
    triggerSavedIndicator();
  };

  const handleDone = () => {
    onSaveToBackend?.();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col select-none border-l border-border-cream shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-3.5 border-b border-border-cream flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-canvas-cream border border-border-cream flex items-center justify-center">
            <Pencil className="w-3.5 h-3.5 text-signal-orange" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink-black uppercase tracking-wider flex items-center gap-1.5">
              Edit Caption
              {savedBadge && (
                <span className="text-[10px] text-signal-orange font-normal flex items-center gap-0.5 normal-case">
                  <Check className="w-3 h-3 stroke-[2.5]" /> saved
                </span>
              )}
            </h3>
            <span className="text-[10px] font-mono text-slate-gray">
              {formatMinSec(segment.start)} – {formatMinSec(segment.end)} ({((segment.end || 0) - (segment.start || 0)).toFixed(1)}s)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSeek?.(segment.start)}
            className="p-1.5 rounded-full bg-canvas-cream hover:bg-lifted-cream text-ink-black transition border border-border-cream cursor-pointer"
            title="Preview caption"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            onClick={handleDone}
            className="p-1.5 rounded-full text-slate-gray hover:text-ink-black hover:bg-canvas-cream transition cursor-pointer"
            title="Done editing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Full Sentence Textarea */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-gray uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-signal-orange" />
              Full Sentence Text
            </span>
            <span className="text-[10px] text-slate-gray font-normal">
              {text.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          </label>
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={3}
            placeholder="Type corrected caption text here..."
            className="w-full bg-lifted-cream border border-dust-taupe rounded-2xl p-3 text-xs text-ink-black placeholder-slate-gray focus:outline-none focus:border-signal-orange transition leading-relaxed resize-none shadow-inner"
          />
        </div>

        {/* Word-by-Word */}
        <div className="space-y-2 pt-2 border-t border-border-cream">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-gray uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-signal-orange" />
              Word-By-Word Spelling
            </label>
            <button
              onClick={handleAddWord}
              className="text-[10px] font-bold text-ink-black hover:text-signal-orange flex items-center gap-1 bg-canvas-cream px-2.5 py-0.5 rounded-full border border-border-cream cursor-pointer"
            >
              <Plus className="w-3 h-3 text-signal-orange" /> Add Word
            </button>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {words.map((w, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-lifted-cream border border-border-cream rounded-full p-1.5 px-3 transition group shadow-sm"
              >
                <span className="text-[10px] font-mono text-slate-gray w-4 text-center">
                  {idx + 1}
                </span>

                <input
                  type="text"
                  value={w.word}
                  onChange={(e) => handleWordChange(idx, e.target.value)}
                  className="flex-1 bg-white border border-border-cream rounded-full px-2.5 py-0.5 text-xs text-ink-black font-medium focus:outline-none focus:border-signal-orange"
                  placeholder="Word..."
                />

                <span className="text-[9px] font-mono text-slate-gray bg-canvas-cream px-2 py-0.5 rounded-full border border-border-cream shrink-0">
                  {formatMinSec(w.start)}
                </span>

                <button
                  onClick={() => handleDeleteWord(idx)}
                  className="p-1 text-slate-gray hover:text-clay-brown transition cursor-pointer"
                  title="Remove word"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="p-3 border-t border-border-cream bg-white flex items-center justify-between shrink-0">
        <span className="text-[10px] text-slate-gray flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-signal-orange" />
          Live synced
        </span>
        <button
          onClick={handleDone}
          className="bg-ink-black hover:bg-black text-white font-bold text-xs px-5 py-2 rounded-full transition shadow-card-soft cursor-pointer flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Save & Done</span>
        </button>
      </div>
    </div>
  );
}
