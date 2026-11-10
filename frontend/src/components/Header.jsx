import React from 'react';
import { Sparkles, Key, Plus, Film, Video, LogOut, Trash2, Download, Scissors } from 'lucide-react';
import clipitLogo from '../assets/img/clipit_logo.png';

export default function Header({
  onOpenCreateWizard,
  onOpenKeyModal,
  activeProject,
  onOpenProjectsList,
  onDeleteProject,
  userProfile,
  onLogout,
  isEditorView,
  viewMode,
  onSwitchView,
}) {
  const maskedKey = userProfile?.masked_gemini_key || 'No Key';
  const hasKey = userProfile?.has_gemini_key;

  return (
    <div className="shrink-0 z-40 w-full bg-canvas-cream border-b border-border-cream px-4 sm:px-6 py-3">
      <header className="w-full max-w-7xl mx-auto bg-white/95 backdrop-blur-md border border-border-cream rounded-full px-5 py-2.5 flex items-center justify-between gap-3 shadow-nav-pill transition-all">
        {/* Brand Logo (Direct wordmark image, no extra text or badge) */}
        <div className="flex items-center gap-3 shrink-0 select-none">
          <button
            type="button"
            onClick={() => onSwitchView?.(activeProject ? 'editor' : 'wizard')}
            className="cursor-pointer flex items-center"
            title="CLIPIT — Find the moment. Clip it."
          >
            <img
              src={clipitLogo}
              alt="CLIPIT"
              className="h-5 sm:h-6 w-auto object-contain block"
            />
          </button>

          {/* Connected Suite Switcher: CLIPIT Shorts <-> Orbit Pro Downloader */}
          <div className="hidden sm:flex items-center p-0.5 bg-canvas-cream rounded-full border border-border-cream text-[11px] shrink-0">
            <button
              type="button"
              onClick={() => onSwitchView?.(activeProject && viewMode !== 'wizard' ? 'editor' : 'wizard')}
              className={`px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode !== 'downloader'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
              title="CLIPIT AI Shorts Studio"
            >
              <Scissors className="w-3 h-3 text-signal-orange" />
              <span>Shorts</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchView?.('downloader')}
              className={`px-3 py-1 rounded-full font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'downloader'
                  ? 'bg-white text-ink-black shadow-sm'
                  : 'text-slate-gray hover:text-ink-black'
              }`}
              title="Orbit Pro — Multi-Platform Downloader & 320kbps MP3 Studio"
            >
              <Download className="w-3 h-3 text-signal-orange" />
              <span>Orbit Pro</span>
            </button>
          </div>
        </div>

        {/* Center Project Indicator (when editing) */}
        {isEditorView && activeProject && (
          <div className="hidden md:flex items-center gap-2 bg-canvas-cream px-3.5 py-1 rounded-full border border-border-cream max-w-[240px] lg:max-w-sm min-w-0">
            <Video className="w-3.5 h-3.5 text-signal-orange shrink-0" />
            <span className="text-xs text-ink-black font-semibold truncate">{activeProject.title}</span>
            <span className="text-[10px] bg-white text-slate-gray px-2 py-0.5 rounded-full border border-border-cream shrink-0 font-medium">
              {activeProject.clips?.length || 0} clips
            </span>
            {onDeleteProject && (
              <button
                onClick={onDeleteProject}
                className="p-1 text-slate-gray hover:text-signal-orange hover:bg-white rounded-full transition ml-1 shrink-0"
                title="Delete this project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 whitespace-nowrap">
          {/* Linked Key Status Pill */}
          <button
            onClick={onOpenKeyModal}
            className="text-xs text-charcoal hover:text-ink-black px-3 py-1.5 rounded-full hover:bg-canvas-cream transition flex items-center gap-2 border border-border-cream bg-lifted-cream"
            title="Encrypted Gemini Key Status"
          >
            <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-signal-orange' : 'bg-slate-gray'}`}></span>
            <Key className="w-3 h-3 text-slate-gray" />
            <span className="font-mono text-[11px] font-semibold text-ink-black hidden sm:inline">
              {hasKey ? maskedKey : 'Setup Key'}
            </span>
          </button>

          {/* Saved Projects Pill */}
          <button
            onClick={onOpenProjectsList}
            className="text-xs text-charcoal hover:text-ink-black px-3 py-1.5 rounded-full hover:bg-canvas-cream transition flex items-center gap-1.5 border border-border-cream bg-white"
            title="Browse Projects"
          >
            <Film className="w-3.5 h-3.5 text-slate-gray" />
            <span className="hidden sm:inline font-medium">Projects</span>
          </button>

          {/* Signature Ink Black Primary CTA */}
          <button
            onClick={onOpenCreateWizard}
            className="bg-ink-black hover:bg-black text-white font-bold text-xs px-4 sm:px-5 py-2 rounded-full transition-transform hover:scale-[1.02] shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Video</span>
          </button>

          {/* User Profile & Logout */}
          {userProfile && (
            <div className="flex items-center gap-2 pl-2 border-l border-border-cream">
              <div className="hidden lg:block text-right">
                <div className="text-xs font-bold text-ink-black truncate max-w-[110px]">
                  {userProfile.first_name || userProfile.email?.split('@')[0]}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-gray hover:text-signal-orange hover:bg-canvas-cream rounded-full transition"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}
