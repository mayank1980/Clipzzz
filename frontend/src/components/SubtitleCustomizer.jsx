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
  const [openSections, setOpenSections] = useState({
    gallery: true,
    highlight: true,
    layout: false,
    sync: false,
    speed: true,
  });

  const selectedPreset = captionStyle?.preset || captionStyle?.templateId || 'Karaoke';
  const textColor = captionStyle?.textColor || '#141413';
  const highlightColor = captionStyle?.highlightColor || '#CF4500';
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
    <div className="bg-lifted-cream border-b border-border-cream p-3 text-xs select-none shrink-0 overflow-y-auto max-h-[50%]">
      {/* PRESETS GALLERY */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-ink-black flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-signal-orange" />
            Caption Presets
          </label>
          <span className="text-[9px] text-ink-black font-semibold bg-canvas-cream px-2.5 py-0.5 rounded-full border border-border-cream">
            {selectedPreset}
          </span>
        </div>

        <CaptionTemplateGallery
          selectedPreset={selectedPreset}
          onSelect={handleSelectPreset}
        />
      </div>

      {/* Text Color & Alignment Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-[10px] font-semibold text-slate-gray mb-1">
            Text Color
          </label>
          <div className="flex items-center gap-1.5 bg-white border border-border-cream rounded-full px-2.5 py-1">
            <input
              type="color"
              value={textColor}
              onChange={(e) => onChangeStyle({ textColor: e.target.value })}
              className="w-5 h-5 rounded-full border-0 bg-transparent cursor-pointer"
            />
            <span className="font-mono text-[10px] text-ink-black uppercase font-bold">{textColor}</span>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-slate-gray mb-1">
            Alignment
          </label>
          <div className="flex items-center bg-canvas-cream border border-border-cream rounded-full p-0.5">
            <button
              onClick={() => onChangeStyle({ alignment: 'left' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-full transition cursor-pointer ${
                alignment === 'left'
                  ? 'bg-white text-ink-black shadow-sm font-bold'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
              title="Align Left"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => onChangeStyle({ alignment: 'center' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-full transition cursor-pointer ${
                alignment === 'center'
                  ? 'bg-white text-ink-black shadow-sm font-bold'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
              title="Align Center"
            >
              <AlignCenter className="w-3 h-3" />
            </button>
            <button
              onClick={() => onChangeStyle({ alignment: 'right' })}
              className={`flex-1 py-1 flex items-center justify-center rounded-full transition cursor-pointer ${
                alignment === 'right'
                  ? 'bg-white text-ink-black shadow-sm font-bold'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
              title="Align Right"
            >
              <AlignRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Sections */}
      <div className="space-y-1.5 border-t border-border-cream pt-2">
        {/* Word Highlighting */}
        <div className="border border-border-cream rounded-2xl overflow-hidden bg-white shadow-sm">
          <button
            onClick={() => toggleSection('highlight')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-canvas-cream transition cursor-pointer"
          >
            <span className="font-semibold text-ink-black flex items-center gap-2">
              <Palette className="w-3.5 h-3.5 text-signal-orange" />
              Word Highlighting Color
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-gray transition-transform ${
                openSections.highlight ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openSections.highlight && (
            <div className="p-3 border-t border-border-cream bg-lifted-cream space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-gray">Active Highlight Color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => onChangeStyle({ highlightColor: e.target.value })}
                    className="w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-signal-orange uppercase font-bold">
                    {highlightColor}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Position & Layout */}
        <div className="border border-border-cream rounded-2xl overflow-hidden bg-white shadow-sm">
          <button
            onClick={() => toggleSection('layout')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-canvas-cream transition cursor-pointer"
          >
            <span className="font-semibold text-ink-black flex items-center gap-2">
              <Move className="w-3.5 h-3.5 text-signal-orange" />
              Position & Layout
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-gray transition-transform ${
                openSections.layout ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openSections.layout && (
            <div className="p-3 border-t border-border-cream bg-lifted-cream space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-gray">Position Preset</span>
                <div className="flex items-center gap-1 bg-canvas-cream p-0.5 rounded-full border border-border-cream">
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
                        className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold transition cursor-pointer ${
                          isActive
                            ? 'bg-white text-ink-black shadow-sm'
                            : 'text-slate-gray hover:text-ink-black'
                        }`}
                      >
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-gray mb-1">
                  <span>Vertical Position (Y)</span>
                  <span className="text-ink-black font-mono font-bold">
                    {captionStyle?.yPercent ?? (position === 'top' ? 20 : position === 'center' ? 50 : 75)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="88"
                  value={captionStyle?.yPercent ?? (position === 'top' ? 20 : position === 'center' ? 50 : 75)}
                  onChange={(e) => onChangeStyle({ yPercent: Number(e.target.value), position: 'custom' })}
                  className="w-full cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-gray mb-1">
                  <span>Font Size</span>
                  <span className="text-ink-black font-mono font-bold">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="36"
                  value={fontSize}
                  onChange={(e) => onChangeStyle({ fontSize: Number(e.target.value) })}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Speed */}
        <div className="border border-border-cream rounded-2xl overflow-hidden bg-white shadow-sm">
          <button
            onClick={() => toggleSection('speed')}
            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-canvas-cream transition cursor-pointer"
          >
            <span className="font-semibold text-ink-black flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-signal-orange" />
              Caption & Playback Speed
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-ink-black bg-canvas-cream px-2 py-0.5 rounded-full border border-border-cream">
                {(playbackRate || 1.0).toFixed(2)}x
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-gray transition-transform ${
                  openSections.speed ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
          {openSections.speed && (
            <div className="p-3 border-t border-border-cream bg-lifted-cream space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-gray">Speed Dropdown</span>
                <select
                  value={playbackRate || 1.0}
                  onChange={(e) => onChangePlaybackRate?.(parseFloat(e.target.value))}
                  className="bg-white text-ink-black font-bold text-xs border border-border-cream rounded-full px-3 py-1 cursor-pointer focus:outline-none"
                >
                  {[0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}x {rate === 1.0 ? '(Normal)' : rate === 0.1 ? '(Slow-Mo)' : rate === 2.0 ? '(Max 2x)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-gray mb-1">
                  <span>Fine-tune Slider</span>
                  <span className="text-ink-black font-mono font-bold">{(playbackRate || 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.05"
                  value={playbackRate || 1.0}
                  onChange={(e) => onChangePlaybackRate?.(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-5 gap-1 pt-0.5">
                {[0.1, 0.5, 1.0, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => onChangePlaybackRate?.(rate)}
                    className={`py-1 rounded-full text-[10px] font-bold font-mono transition cursor-pointer ${
                      Math.abs((playbackRate || 1.0) - rate) < 0.04
                        ? 'bg-ink-black text-white'
                        : 'bg-white text-charcoal border border-border-cream hover:bg-canvas-cream'
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
