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
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition shrink-0 ${
                activeCategory === cat
                  ? 'bg-lime-neon text-black shadow-sm'
                  : 'bg-dark-950 text-slate-400 hover:text-white border border-dark-800'
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
              className={`p-2 rounded-xl text-left border transition relative overflow-hidden flex flex-col justify-between h-[62px] ${
                isSelected
                  ? 'bg-dark-800 border-lime-neon ring-1 ring-lime-neon shadow-neon-sm'
                  : 'bg-dark-950/80 border-dark-800 hover:border-dark-700 hover:bg-dark-850'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold text-white truncate">{tpl.name}</span>
                {isSelected ? (
                  <span className="w-3.5 h-3.5 rounded-full bg-lime-neon text-black flex items-center justify-center text-[9px] font-bold shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-500 uppercase">{tpl.animation}</span>
                )}
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-slate-400 truncate">{tpl.tag}</span>
                <span className="text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-dark-900 border border-dark-800 text-lime-neon">
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

