import React from 'react';
import { Sparkles, Key, Plus, Film, Video, LogOut, User, Trash2 } from 'lucide-react';
import logoImg from '../assets/logo.png';

export default function Header({
  onOpenCreateWizard,
  onOpenKeyModal,
  activeProject,
  onOpenProjectsList,
  onDeleteProject,
  userProfile,
  onLogout,
  isEditorView,
}) {
  const maskedKey = userProfile?.masked_gemini_key || 'No Key Linked';
  const hasKey = userProfile?.has_gemini_key;

  return (
    <header className="h-16 border-b border-dark-700 bg-dark-900/95 backdrop-blur px-6 flex items-center justify-between z-30 sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-neon-sm bg-dark-950 flex items-center justify-center p-1 border border-lime-neon/30">
          <img src={logoImg} alt="Clipzzz Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xl tracking-wider text-white">
              CLIP<span className="text-lime-neon">ZZZ</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest bg-lime-neon/15 text-lime-neon px-2 py-0.5 rounded-full border border-lime-neon/30">
              AI Clipper
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">Turn long videos into viral YouTube Shorts</p>
        </div>
      </div>

      {/* Center project title info (if in editor view) */}
      {isEditorView && activeProject && (
        <div className="flex items-center gap-2 bg-dark-850 px-3 py-1.5 rounded-full border border-dark-700 max-w-xs md:max-w-md">
          <Video className="w-3.5 h-3.5 text-lime-neon shrink-0" />
          <span className="text-xs text-slate-200 font-medium truncate">{activeProject.title}</span>
          <span className="text-[10px] bg-dark-700 text-slate-300 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline">
            {activeProject.clips?.length || 0} clips
          </span>
          {onDeleteProject && (
            <button
              onClick={onDeleteProject}
              className="p-1 text-slate-400 hover:text-red-400 hover:bg-dark-800 rounded transition ml-1 shrink-0"
              title="Delete this project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Masked Key Indicator */}
        <button
          onClick={onOpenKeyModal}
          className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-xl hover:bg-dark-800 transition flex items-center gap-2 border border-dark-700 bg-dark-950/60"
          title="Click to view encrypted Gemini API key status"
        >
          <Key className="w-3.5 h-3.5 text-lime-neon" />
          <span className="font-mono text-[11px] text-lime-neon font-bold hidden sm:inline">
            {hasKey ? maskedKey : 'Setup Key'}
          </span>
        </button>

        {/* Saved Projects */}
        <button
          onClick={onOpenProjectsList}
          className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-xl hover:bg-dark-800 transition flex items-center gap-1.5 border border-dark-700"
          title="Browse saved projects"
        >
          <Film className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </button>

        {/* New Video Wizard Button */}
        <button
          onClick={onOpenCreateWizard}
          className="bg-lime-neon hover:bg-lime-400 text-black font-extrabold text-xs px-4 py-2 rounded-xl transition shadow-neon-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>New Project</span>
        </button>

        {/* User Profile & Logout */}
        {userProfile && (
          <div className="flex items-center gap-2 pl-2 border-l border-dark-700">
            <div className="hidden lg:block text-right">
              <div className="text-xs font-bold text-white truncate max-w-[120px]">
                {userProfile.first_name || userProfile.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                {userProfile.email}
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-dark-800 rounded-xl transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
