import React, { useState } from 'react';
import { Sparkles, Search, Check, Zap } from 'lucide-react';
import { CAPTION_PRESETS, PRESET_CATEGORIES } from './captionPresets';

export default function CaptionTemplateGallery({
  selectedPreset = 'Karaoke',
  onSelect,
}) {
  const [activeCategory, setActiveCategory] = useState('All (26)');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPresets = CAPTION_PRESETS.filter((p) => {
    const matchesCategory =
      activeCategory === 'All (26)' || p.category === activeCategory;
    const matchesSearch =
      searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.animation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-2.5">
      {/* Category Pills & Search */}
      <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1 shrink-0">
          {PRESET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition shrink-0 cursor-pointer ${
                activeCategory === cat
                  ? 'bg-ink-black text-white shadow-sm'
                  : 'bg-white text-slate-gray hover:text-ink-black border border-border-cream'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of 26 Templates */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
        {filteredPresets.map((tpl) => {
          const isSelected = selectedPreset.toLowerCase() === tpl.name.toLowerCase();
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.name)}
              className={`p-2.5 rounded-2xl text-left border transition relative overflow-hidden flex flex-col justify-between h-[64px] cursor-pointer shadow-sm ${
                isSelected
                  ? 'bg-white border-signal-orange ring-1 ring-signal-orange'
                  : 'bg-white border-border-cream hover:bg-canvas-cream/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold text-ink-black truncate">{tpl.name}</span>
                {isSelected ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-signal-orange text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-gray uppercase">{tpl.animation}</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-slate-gray truncate">{tpl.tag}</span>
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-canvas-cream border border-border-cream text-charcoal">
                  {tpl.animation}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
