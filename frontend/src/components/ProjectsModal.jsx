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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-lime-neon" />
            <h2 className="font-bold text-base text-white">Your Video Projects</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-8 h-8 text-lime-neon animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No projects found. Click "+ New Video" to import your first YouTube video!
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
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                    isActive
                      ? 'bg-dark-800 border-lime-neon shadow-neon-sm'
                      : 'bg-dark-950/70 hover:bg-dark-850 border-dark-700/80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-white truncate">{proj.title}</h4>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span className="font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatMinSec(proj.duration)}
                      </span>
                      <span className="bg-dark-800 text-lime-neon font-semibold px-2 py-0.5 rounded-full text-[10px]">
                        {proj.clips_count || 0} clips
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-500">
                        {proj.source_type}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, proj.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition"
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

