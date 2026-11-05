import React, { useState } from 'react';
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Sparkles,
  Move,
  Zap,
  Palette,
  Clock,
} from 'lucide-react';
import CaptionTemplateGallery from './captions/CaptionTemplateGallery';
import { CAPTION_PRESETS } from './captions/captionPresets';

export default function SubtitleCustomizer({
  captionStyle,
  onChangeStyle,
  playbackRate = 1.0,
  onChangePlaybackRate,
}) {
  // Independent open/closed states for each accordion section
  const [openSections, setOpenSections] = useState({
    gallery: true,
    highlight: true,
    layout: false,
    sync: false,
    speed: true,
  });

  const selectedPreset = captionStyle?.preset || captionStyle?.templateId || 'Karaoke';
  const textColor = captionStyle?.textColor || '#FFFFFF';
  const highlightColor = captionStyle?.highlightColor || '#bef264';
  const alignment = captionStyle?.alignment || 'center';
  const position = captionStyle?.position || 'bottom';
  const fontSize = captionStyle?.fontSize || 22;
  const syncOffset = captionStyle?.syncOffset || 0.0;

  const toggleSection = (name) => {
    setOpenSections((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const handleSelectPreset = (presetName) => {
    const tpl = CAPTION_PRESETS.find((p) => p.name.toLowerCase() === presetName.toLowerCase());
    onChangeStyle({
      preset: presetName,
      templateId: presetName,
      animation: tpl?.animation?.toLowerCase() || 'bounce',
    });
  };

  return (
    <div className="bg-dark-900 border-b border-dark-700/80 p-3 text-xs select-none shrink-0 overflow-y-auto max-h-[50%]">
      {/* CAPTION.JS ALL 26 PRESETS GALLERY */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-lime-neon" />
            Caption.js Presets (26)
          </label>
          <span className="text-[9px] text-lime-neon font-semibold bg-lime-neon/10 px-2 py-0.5 rounded-full border border-lime-neon/20">
            {selectedPreset}
          </span>
        </div>

        {/* 26 Presets Component */}
        <CaptionTemplateGallery
          selectedPreset={selectedPreset}
          onSelect={handleSelectPreset}
        />
      </div>

      {/* Text Color & Alignment Grid (100% English Labels) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* Text Color */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">
            Text Color
          </label>
          <div className="flex items-center gap-1.5 bg-dark-950 border border-dark-700 rounded-xl px-2 py-1">
            <input
              type="color"
              value={textColor}
              onChange={(e) => onChangeStyle({ textColor: e.target.value })}
              className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-white uppercase">{textColor}</span>
          </div>
        </div>

        {/* Text Alignment */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 mb-1">
            Alignment
          </label>
          <div className="flex items-center bg-dark-950 border border-dark-700 rounded-xl p-0.5">
            <button
              onClick={() => onChangeStyle({ alignment: 'left' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-lg transition ${
                alignment === 'left'
                  ? 'bg-lime-neon text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Align Left"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => onChangeStyle({ alignment: 'center' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-lg transition ${
                alignment === 'center'
                  ? 'bg-lime-neon text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Align Center"
            >
              <AlignCenter className="w-3 h-3" />
            </button>
            <button
              onClick={() => onChangeStyle({ alignment: 'right' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-lg transition ${
                alignment === 'right'
                  ? 'bg-lime-neon text-black font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Align Right"
            >
              <AlignRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Sections (English Labels, Independent Toggling) */}
      <div className="space-y-1.5 border-t border-dark-800 pt-2">
        {/* Word Highlighting */}
        <div className="border border-dark-800 rounded-xl overflow-hidden bg-dark-950/40">
          <button
            onClick={() => toggleSection('highlight')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-dark-850 transition"
          >
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-lime-neon" />
              Word Highlighting Color
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                openSections.highlight ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openSections.highlight && (
            <div className="p-3 border-t border-dark-800 bg-dark-950 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Active Highlight Color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => onChangeStyle({ highlightColor: e.target.value })}
                    className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-lime-neon uppercase font-bold">
                    {highlightColor}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Position & Layout */}
        <div className="border border-dark-800 rounded-xl overflow-hidden bg-dark-950/40">
          <button
            onClick={() => toggleSection('layout')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-dark-850 transition"
          >
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Move className="w-3.5 h-3.5 text-slate-400" />
              Position & Layout
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                openSections.layout ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openSections.layout && (
            <div className="p-3 border-t border-dark-800 bg-dark-950 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Position Preset</span>
                <div className="flex items-center gap-1 bg-dark-900 p-0.5 rounded-lg border border-dark-800">
                  {[
                    { id: 'top', label: 'Top', y: 20 },
                    { id: 'center', label: 'Center', y: 50 },
                    { id: 'bottom', label: 'Bottom', y: 75 },
                  ].map((pos) => {
                    const currentY = captionStyle?.yPercent ?? (position === 'top' ? 20 : position === 'center' ? 50 : 75);
                    const isActive = (captionStyle?.position === pos.id) || currentY === pos.y;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => onChangeStyle({ position: pos.id, yPercent: pos.y, xPercent: 50 })}
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition cursor-pointer ${
                          isActive
                            ? 'bg-lime-neon text-black shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vertical Drag & Fine-tune Slider */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span className="flex items-center gap-1 font-semibold text-slate-300">
                    <Move className="w-3 h-3 text-lime-neon" />
                    <span>Vertical Position (Y)</span>
                  </span>
                  <span className="text-lime-neon font-mono font-bold">
                    {captionStyle?.yPercent ?? (position === 'top' ? 20 : position === 'center' ? 50 : 75)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="88"
                  value={captionStyle?.yPercent ?? (position === 'top' ? 20 : position === 'center' ? 50 : 75)}
                  onChange={(e) => onChangeStyle({ yPercent: Number(e.target.value), position: 'custom' })}
                  className="w-full accent-lime-neon cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 mt-1 italic">
                  💡 Tip: You can also click and drag the caption directly on the video player!
                </p>
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Font Size</span>
                  <span className="text-lime-neon font-mono">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="36"
                  value={fontSize}
                  onChange={(e) => onChangeStyle({ fontSize: Number(e.target.value) })}
                  className="w-full accent-lime-neon"
                />
              </div>
            </div>
          )}
        </div>

        {/* Mouth Audio Sync Calibration */}
        <div className="border border-dark-800 rounded-xl overflow-hidden bg-dark-950/40">
          <button
            onClick={() => toggleSection('sync')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-dark-850 transition"
          >
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-lime-neon" />
              Mouth Audio Sync
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-lime-neon">
                {syncOffset > 0 ? `+${syncOffset}s` : `${syncOffset}s`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  openSections.sync ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
          {openSections.sync && (
            <div className="p-3 border-t border-dark-800 bg-dark-950 space-y-2">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Audio-to-Lip Calibration</span>
                <span className="text-lime-neon font-mono font-bold">
                  {syncOffset === 0 ? '0.00s (Exact)' : syncOffset > 0 ? `+${syncOffset}s` : `${syncOffset}s`}
                </span>
              </div>
              <input
                type="range"
                min="-0.6"
                max="0.6"
                step="0.05"
                value={syncOffset}
                onChange={(e) => onChangeStyle({ syncOffset: parseFloat(e.target.value) })}
                className="w-full accent-lime-neon"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <button
                  type="button"
                  onClick={() => onChangeStyle({ syncOffset: Math.round((syncOffset - 0.1) * 100) / 100 })}
                  className="px-2 py-0.5 rounded bg-dark-900 border border-dark-800 hover:text-white"
                >
                  -0.1s Earlier
                </button>
                <button
                  type="button"
                  onClick={() => onChangeStyle({ syncOffset: 0.0 })}
                  className="text-lime-neon hover:underline font-semibold"
                >
                  Reset (0.0s)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeStyle({ syncOffset: Math.round((syncOffset + 0.1) * 100) / 100 })}
                  className="px-2 py-0.5 rounded bg-dark-900 border border-dark-800 hover:text-white"
                >
                  +0.1s Later
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Caption & Playback Speed */}
        <div className="border border-dark-800 rounded-xl overflow-hidden bg-dark-950/40">
          <button
            onClick={() => toggleSection('speed')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-dark-850 transition"
          >
            <span className="font-semibold text-slate-300 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-lime-neon" />
              Caption & Playback Speed
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-lime-neon bg-lime-neon/10 px-2 py-0.5 rounded border border-lime-neon/20">
                {(playbackRate || 1.0).toFixed(2)}x
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  openSections.speed ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
          {openSections.speed && (
            <div className="p-3 border-t border-dark-800 bg-dark-950 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Speed Dropdown</span>
                <select
                  value={playbackRate || 1.0}
                  onChange={(e) => onChangePlaybackRate?.(parseFloat(e.target.value))}
                  className="bg-dark-900 text-lime-neon font-black text-xs border border-dark-700 rounded-lg px-2.5 py-1 cursor-pointer focus:outline-none focus:border-lime-neon"
                >
                  {[0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                    <option key={rate} value={rate} className="bg-dark-900 text-white font-mono">
                      {rate}x {rate === 1.0 ? '(Normal)' : rate === 0.1 ? '(Slow-Mo)' : rate === 2.0 ? '(Max 2x)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Fine-tune Slider (0.1x to 2.0x)</span>
                  <span className="text-lime-neon font-mono font-bold">{(playbackRate || 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.05"
                  value={playbackRate || 1.0}
                  onChange={(e) => onChangePlaybackRate?.(parseFloat(e.target.value))}
                  className="w-full accent-lime-neon cursor-pointer"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-5 gap-1 pt-0.5">
                {[0.1, 0.5, 1.0, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onChangePlaybackRate?.(rate)}
                    className={`py-1 rounded text-[10px] font-bold font-mono transition cursor-pointer ${
                      Math.abs((playbackRate || 1.0) - rate) < 0.04
                        ? 'bg-lime-neon text-black font-extrabold shadow-neon-sm'
                        : 'bg-dark-900 text-slate-400 hover:text-white border border-dark-800'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
