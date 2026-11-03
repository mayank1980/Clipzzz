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

  // Sync state whenever selected segment changes
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

  // Handle full sentence edit: updates text and distributes timings across words
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

  // Handle individual word spelling edit
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

  // Add a new word
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

    const updatedSeg = {
      ...segment,
      end: Math.max(segment.end, newEnd),
      text: newFullText,
      words: updatedWords,
    };
    onUpdateSegment(updatedSeg);
    triggerSavedIndicator();
  };

  // Delete an individual word
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

  // Trigger quick saved indicator
  const triggerSavedIndicator = () => {
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 1200);
  };

  // Reset to original segment text
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
    <div className="absolute inset-0 z-50 bg-dark-900 flex flex-col select-none border-l border-dark-700/80 shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-3.5 border-b border-dark-700/80 flex items-center justify-between bg-dark-950/70 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-lime-neon/15 border border-lime-neon/30 flex items-center justify-center">
            <Pencil className="w-3.5 h-3.5 text-lime-neon" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              Edit Caption
              {savedBadge && (
                <span className="text-[10px] text-lime-neon font-normal flex items-center gap-0.5 normal-case animate-pulse">
                  <Check className="w-3 h-3 stroke-[2.5]" /> live updated
                </span>
              )}
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {formatMinSec(segment.start)} – {formatMinSec(segment.end)} ({((segment.end || 0) - (segment.start || 0)).toFixed(1)}s)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Play/Seek this segment */}
          <button
            onClick={() => onSeek?.(segment.start)}
            className="p-1.5 rounded-lg bg-lime-neon/20 hover:bg-lime-neon text-lime-neon hover:text-black transition border border-lime-neon/40 cursor-pointer"
            title="Preview caption on video player"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Close button */}
          <button
            onClick={handleDone}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-800 transition cursor-pointer"
            title="Done editing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {/* Helper Banner */}
        <div className="bg-lime-neon/10 border border-lime-neon/20 rounded-xl p-2.5 text-[11px] text-lime-300/90 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-lime-neon shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white">Live Video Sync:</span> Any word or spelling corrected here updates immediately on the video player!
          </div>
        </div>

        {/* 1. Full Sentence Textarea */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-lime-neon" />
              Full Sentence Text
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              {text.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          </label>
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={3}
            placeholder="Type corrected caption text here..."
            className="w-full bg-dark-950 border border-dark-700 hover:border-dark-600 focus:border-lime-neon rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none transition leading-relaxed resize-none font-sans"
          />
        </div>

        {/* 2. Word-by-Word Precise Timing & Spelling Cards */}
        <div className="space-y-2 pt-2 border-t border-dark-800">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-lime-neon" />
              Word-By-Word Spelling
            </label>
            <button
              onClick={handleAddWord}
              className="text-[10px] font-bold text-lime-neon hover:text-lime-300 flex items-center gap-1 bg-lime-neon/10 px-2 py-0.5 rounded-lg border border-lime-neon/20 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Word
            </button>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
            {words.map((w, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-dark-950/80 border border-dark-800 hover:border-dark-700 rounded-xl p-1.5 px-2.5 transition group"
              >
                <span className="text-[10px] font-mono text-slate-500 w-4 text-center">
                  {idx + 1}
                </span>

                {/* Word Input */}
                <input
                  type="text"
                  value={w.word}
                  onChange={(e) => handleWordChange(idx, e.target.value)}
                  className={`flex-1 bg-dark-900 border focus:border-lime-neon rounded-lg px-2 py-1 text-xs text-white font-medium focus:outline-none ${
                    w.needs_review ? 'border-amber-400/60 ring-1 ring-amber-400/20' : 'border-dark-750'
                  }`}
                  placeholder="Word..."
                />

                {w.needs_review && (
                  <span
                    className="text-[9px] font-bold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded border border-amber-400/30 shrink-0"
                    title={`Acoustic Confidence: ${Math.round((w.confidence || 0.75) * 100)}%`}
                  >
                    Check
                  </span>
                )}

                {/* Timing Badge */}
                <span className="text-[9px] font-mono text-slate-400 bg-dark-850 px-1.5 py-0.5 rounded border border-dark-750 shrink-0">
                  {formatMinSec(w.start)}
                </span>

                {/* Delete word button */}
                <button
                  onClick={() => handleDeleteWord(idx)}
                  className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer opacity-40 group-hover:opacity-100"
                  title="Remove word"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Format Tools */}
        <div className="pt-2 border-t border-dark-800 space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Quick Cleaners
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTextChange(text.toUpperCase())}
              className="px-2 py-1 bg-dark-950 hover:bg-dark-800 border border-dark-750 rounded-lg text-[10px] font-bold text-slate-300 transition cursor-pointer"
            >
              UPPERCASE
            </button>
            <button
              onClick={() => {
                const titleCased = text
                  .split(' ')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
                handleTextChange(titleCased);
              }}
              className="px-2 py-1 bg-dark-950 hover:bg-dark-800 border border-dark-750 rounded-lg text-[10px] font-bold text-slate-300 transition cursor-pointer"
            >
              Title Case
            </button>
            <button
              onClick={handleReset}
              className="px-2 py-1 bg-dark-950 hover:bg-dark-800 border border-dark-750 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer ml-auto"
              title="Reset to original"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions */}
      <div className="p-3 border-t border-dark-700/80 bg-dark-950 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-slate-400 flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-lime-neon" />
          Syncs live with video
        </span>
        <button
          onClick={handleDone}
          className="bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-neon-sm cursor-pointer flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Save & Done</span>
        </button>
      </div>
    </div>
  );
}

