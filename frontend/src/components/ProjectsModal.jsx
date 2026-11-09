import React, { useState, useEffect } from 'react';
import { X, Film, Trash2, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export default function ProjectsModal({ isOpen, onClose, onSelectProject, onDeleteActiveProject, activeProjectId }) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchProjects();
  }, [isOpen]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to list projects', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await api.deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      if (id === activeProjectId && onDeleteActiveProject) {
        onDeleteActiveProject();
      }
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  if (!isOpen) return null;

  const formatMinSec = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-border-cream w-full max-w-lg rounded-stadium shadow-card-elevated overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-cream flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-signal-orange"></span>
            <h2 className="font-extrabold text-base text-ink-black tracking-tight">Saved Projects</h2>
          </div>
          <button onClick={onClose} className="text-slate-gray hover:text-ink-black p-1 rounded-full hover:bg-canvas-cream transition cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-7 h-7 text-signal-orange animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-slate-gray text-xs">
              No saved projects found. Click "+ New Video" to import your first video.
            </div>
          ) : (
            projects.map((proj) => {
              const isActive = proj.id === activeProjectId;
              return (
                <div
                  key={proj.id}
                  onClick={() => {
                    onSelectProject(proj.id);
                    onClose();
                  }}
                  className={`p-3.5 rounded-[20px] border cursor-pointer transition flex items-center justify-between gap-3 ${
                    isActive
                      ? 'bg-lifted-cream border-signal-orange ring-1 ring-signal-orange shadow-sm'
                      : 'bg-white hover:bg-canvas-cream border-border-cream'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-ink-black truncate">{proj.title}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-gray mt-1">
                      <span className="font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-gray" />
                        {formatMinSec(proj.duration)}
                      </span>
                      <span className="bg-canvas-cream text-ink-black font-bold px-2 py-0.5 rounded-full border border-border-cream">
                        {proj.clips_count || 0} clips
                      </span>
                      <span className="uppercase font-bold text-slate-gray">
                        {proj.source_type}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, proj.id)}
                    className="p-1.5 text-slate-gray hover:text-clay-brown hover:bg-canvas-cream rounded-full transition cursor-pointer shrink-0"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
