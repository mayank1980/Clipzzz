import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import AuthScreen from './components/AuthScreen';
import GeminiKeyModal from './components/GeminiKeyModal';
import CreateWizard from './components/CreateWizard';
import ClipsList from './components/ClipsList';
import VideoPlayer from './components/VideoPlayer';
import CropInspector from './components/CropInspector';
import SubtitleCustomizer from './components/SubtitleCustomizer';
import TranscriptPanel from './components/TranscriptPanel';
import CaptionEditDrawer from './components/captions/CaptionEditDrawer';
import ExportModal from './components/ExportModal';
import ShortsKitModal from './components/ShortsKitModal';
import ProjectsModal from './components/ProjectsModal';
import { api, API_BASE_URL } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // View state: 'wizard' | 'editor'
  const [viewMode, setViewMode] = useState('wizard');
  const [activeProject, setActiveProject] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const cropSaveTimerRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [isCropInspectorOpen, setIsCropInspectorOpen] = useState(true);

  // Modals
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState('captioned'); // 'captioned' | 'clean'
  const [exportForce, setExportForce] = useState(false);
  const [isShortsKitOpen, setIsShortsKitOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState(null);
  const saveTimeoutRef = useRef(null);

  // Check existing session on mount
  useEffect(() => {
    checkAuthSession();
  }, []);

  // If activeProject is loaded in memory without channel_name, auto-fetch from backend
  useEffect(() => {
    if (activeProject?.id && !activeProject.channel_name) {
      api.getProject(activeProject.id).then((fresh) => {
        if (fresh && fresh.channel_name) {
          setActiveProject((prev) => ({
            ...prev,
            channel_name: fresh.channel_name,
          }));
        }
      }).catch((err) => {
        console.warn('Could not auto-refresh project channel name', err);
      });
    }
  }, [activeProject?.id, activeProject?.channel_name]);

  const checkAuthSession = async () => {
    const token = localStorage.getItem('clipzzz_access_token');
    if (!token) {
      setIsAuthLoading(false);
      return;
    }

    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);

      // If user has no key, prompt key modal
      if (!user.has_gemini_key) {
        setIsKeyModalOpen(true);
      }
    } catch (err) {
      console.warn('Session verification error', err);
      api.logout();
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    if (!user.has_gemini_key) {
      setIsKeyModalOpen(true);
    }
    setViewMode('wizard');
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setActiveProject(null);
    setSelectedClip(null);
    setViewMode('wizard');
  };

  const handleDeleteCurrentProject = async () => {
    if (!activeProject) return;
    if (!window.confirm(`Are you sure you want to delete "${activeProject.title}"?`)) return;
    try {
      await api.deleteProject(activeProject.id);
      setActiveProject(null);
      setSelectedClip(null);
      setViewMode('wizard');
    } catch (err) {
      console.error('Failed to delete project', err);
      alert('Failed to delete project.');
    }
  };

  const handleDeleteClip = async (clipToDelete) => {
    if (!clipToDelete) return;
    const confirmMsg = `Are you sure you want to delete "${clipToDelete.title || 'this clip'}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.deleteClip(clipToDelete.id);
      setActiveProject((prev) => {
        if (!prev) return prev;
        const newClips = (prev.clips || []).filter((c) => c.id !== clipToDelete.id);
        return {
          ...prev,
          clips: newClips,
        };
      });

      if (selectedClip?.id === clipToDelete.id) {
        const remaining = (activeProject?.clips || []).filter((c) => c.id !== clipToDelete.id);
        if (remaining.length > 0) {
          setSelectedClip(remaining[0]);
          setCurrentTime(remaining[0].start_time);
        } else {
          setSelectedClip(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete clip', err);
      alert('Failed to delete clip: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleKeySaved = (keyData) => {
    setCurrentUser((prev) => ({
      ...prev,
      has_gemini_key: true,
      masked_gemini_key: keyData.masked_gemini_key,
    }));
  };

  const handleProjectCreated = (project) => {
    setActiveProject(project);
    setAspectRatio(project.target_ratio || '9:16');
    if (project.clips && project.clips.length > 0) {
      setSelectedClip(project.clips[0]);
      setCurrentTime(project.clips[0].start_time);
    }
    setViewMode('editor');
  };

  const handleSelectClip = (clip) => {
    setSelectedClip(clip);
    setCurrentTime(clip.start_time);
  };

  const handleSeek = (time) => {
    setCurrentTime(time);
  };

  const handleUpdateClipBounds = async (newStart, newEnd) => {
    if (!selectedClip) return;
    const updated = {
      ...selectedClip,
      start_time: newStart,
      end_time: newEnd,
      duration: Math.max(1, Math.round((newEnd - newStart) * 10) / 10),
    };
    setSelectedClip(updated);

    setActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === updated.id ? updated : c)),
    }));

    try {
      await api.updateClip(updated.id, {
        start_time: newStart,
        end_time: newEnd,
      });
    } catch (err) {
      console.error('Failed to update clip timing', err);
    }
  };

  const handleChangeCrop = (partial) => {
    if (!selectedClip) return;
    const newX = partial.x !== undefined ? Number(partial.x) : selectedClip.crop_x;
    const newY = partial.y !== undefined ? Number(partial.y) : selectedClip.crop_y;
    const newZoom = partial.zoom !== undefined ? Number(partial.zoom) : selectedClip.crop_zoom;
    const newMode = partial.mode !== undefined ? partial.mode : selectedClip.crop_mode;

    // Synchronize manual coordinates into keyframes so both live player and FFmpeg export stay locked
    const isManualCoordChange = partial.x !== undefined || partial.y !== undefined || partial.zoom !== undefined;
    const newKeyframes = isManualCoordChange
      ? [{ time: 0, x: newX, y: newY, zoom: newZoom, speaker: 'Manual Focus' }]
      : (partial.keyframes !== undefined ? partial.keyframes : (selectedClip.crop_keyframes || []));

    const updated = {
      ...selectedClip,
      crop_x: newX,
      crop_y: newY,
      crop_zoom: newZoom,
      crop_mode: newMode,
      crop_keyframes: newKeyframes,
    };

    // 1. Instant optimistic state update for 60 FPS real-time video preview
    setSelectedClip(updated);
    setActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === updated.id ? updated : c)),
    }));

    // 2. Debounce database persist so rapid slider dragging is fluid and doesn't flood HTTP requests
    if (cropSaveTimerRef.current) {
      clearTimeout(cropSaveTimerRef.current);
    }
    cropSaveTimerRef.current = setTimeout(async () => {
      try {
        await api.updateClip(updated.id, {
          crop_x: updated.crop_x,
          crop_y: updated.crop_y,
          crop_zoom: updated.crop_zoom,
          crop_mode: updated.crop_mode,
          crop_keyframes: updated.crop_keyframes,
        });
      } catch (err) {
        console.error('Failed to persist crop settings to database', err);
      }
    }, 300);
  };

  const handleUpdateChannelName = async (newChannelName) => {
    if (!activeProject?.id) return;
    setActiveProject((prev) => ({
      ...prev,
      channel_name: newChannelName,
    }));
    try {
      await api.updateProject(activeProject.id, {
        channel_name: newChannelName,
      });
    } catch (err) {
      console.error('Failed to update channel name in backend', err);
    }
  };

  const handleAutoTrackClip = async () => {
    if (!selectedClip) return;
    try {
      const updated = await api.autoTrackClip(selectedClip.id);
      setSelectedClip(updated);
      setActiveProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => (c.id === updated.id ? updated : c)),
      }));
      return updated;
    } catch (err) {
      console.error('Failed to auto-track speakers', err);
    }
  };

  const handleChangeCaptionStyle = async (partial) => {
    if (!selectedClip) return;
    const newStyle = {
      ...(selectedClip.caption_style || {}),
      ...partial,
    };
    const updated = {
      ...selectedClip,
      caption_style: newStyle,
    };
    setSelectedClip(updated);

    try {
      await api.updateClip(updated.id, {
        caption_style: newStyle,
      });
    } catch (err) {
      console.error('Failed to update caption style', err);
    }
  };

  // Real-time transcript editing & live preview update across project & all clips
  const handleUpdateTranscriptSegment = (updatedSeg) => {
    if (!activeProject || !activeProject.transcript_raw) return;

    const newTranscript = activeProject.transcript_raw.map((s) => {
      if (s.id === updatedSeg.id || (s.start === updatedSeg.start && s.end === updatedSeg.end)) {
        return updatedSeg;
      }
      return s;
    });

    // Synchronize the edited words into selectedClip.caption_style.aligned_words & project.clips
    let updatedSelectedClip = selectedClip;
    const updatedClips = (activeProject.clips || []).map((clip) => {
      const cStart = Number(clip.start_time) || 0;
      const cEnd = Number(clip.end_time) || 999999;
      const clipWords = [];
      for (const seg of newTranscript) {
        if (seg.end < cStart || seg.start > cEnd) continue;
        const textTokens = String(seg.text || '').trim().split(/\s+/).filter(Boolean);
        const hasMatchingWords = seg.words && Array.isArray(seg.words) && seg.words.length === textTokens.length &&
          seg.words.every((w, idx) => String(w.word || '').trim().toLowerCase() === textTokens[idx].toLowerCase());

        if (hasMatchingWords) {
          for (const w of seg.words) {
            if (w.end >= (cStart - 0.05) && w.start <= (cEnd + 0.05)) {
              clipWords.push({ ...w });
            }
          }
        } else if (textTokens.length > 0) {
          const segStart = Number(seg.start) || 0;
          const segEnd = Number(seg.end) || (segStart + 1.0);
          const dur = Math.max(0.15, (segEnd - segStart) / textTokens.length);
          textTokens.forEach((tok, i) => {
            const st = Number((segStart + (i * dur)).toFixed(2));
            const et = Number((segStart + ((i + 1) * dur)).toFixed(2));
            if (et >= (cStart - 0.05) && st <= (cEnd + 0.05)) {
              clipWords.push({
                word: tok.trim(),
                start: st,
                end: et,
              });
            }
          });
        }
      }
      const updatedStyle = {
        ...(clip.caption_style || {}),
        aligned_words: clipWords,
      };
      const updatedClipObj = {
        ...clip,
        caption_style: updatedStyle,
      };
      if (selectedClip && selectedClip.id === clip.id) {
        updatedSelectedClip = updatedClipObj;
      }
      return updatedClipObj;
    });

    setActiveProject((prev) => ({
      ...prev,
      transcript_raw: newTranscript,
      clips: updatedClips,
    }));
    if (updatedSelectedClip) {
      setSelectedClip(updatedSelectedClip);
    }
    setEditingSegment(updatedSeg);

    // Debounced automatic database persistence so edits are never lost
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        if (activeProject?.id) {
          await api.updateProject(activeProject.id, {
            transcript_raw: newTranscript,
          });
        }
        if (updatedSelectedClip?.id) {
          await api.updateClip(updatedSelectedClip.id, {
            caption_style: updatedSelectedClip.caption_style,
          });
        }
      } catch (err) {
        console.warn('[App] Auto-save transcript note:', err);
      }
    }, 600);
  };

  // Persist updated transcript & clip caption styling to backend database
  const handleSaveTranscriptToBackend = async () => {
    if (!activeProject?.id || !activeProject.transcript_raw) return;
    try {
      await api.updateProject(activeProject.id, {
        transcript_raw: activeProject.transcript_raw,
      });
      if (selectedClip?.id) {
        await api.updateClip(selectedClip.id, {
          caption_style: selectedClip.caption_style,
        });
      }
      console.log('[App] Successfully saved updated transcript & clip captions to database');
    } catch (err) {
      console.error('[App] Failed to save updated transcript to database', err);
    }
  };

  const handleOpenExport = async (mode = 'captioned', force = false) => {
    // Immediately persist latest transcript & clip caption styling before starting render
    if (activeProject?.id && activeProject.transcript_raw) {
      try {
        await api.updateProject(activeProject.id, {
          transcript_raw: activeProject.transcript_raw,
        });
        if (selectedClip?.id) {
          await api.updateClip(selectedClip.id, {
            caption_style: selectedClip.caption_style,
          });
        }
      } catch (err) {
        console.warn('[App] Pre-export save note:', err);
      }
    }
    setExportMode(mode);
    setExportForce(force);
    setIsExportOpen(true);
  };

  const handleRenderComplete = (clipId, renderedFile, mode = 'captioned') => {
    setActiveProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId
          ? mode === 'clean'
            ? { ...c, clean_render_status: 'completed', rendered_clean_file: renderedFile }
            : { ...c, render_status: 'completed', rendered_file: renderedFile }
          : c
      ),
    }));
    if (selectedClip?.id === clipId) {
      setSelectedClip((prev) => ({
        ...prev,
        ...(mode === 'clean'
          ? { clean_render_status: 'completed', rendered_clean_file: renderedFile }
          : { render_status: 'completed', rendered_file: renderedFile }),
      }));
    }
  };

  const videoSrc = activeProject?.video_file
    ? activeProject.video_file.startsWith('http')
      ? activeProject.video_file
      : `${API_BASE_URL}${activeProject.video_file.startsWith('/') ? '' : '/'}${activeProject.video_file}`
    : '';

  // Initial Loading Screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-dark-800 border-t-lime-neon animate-spin"></div>
      </div>
    );
  }

  // STEP 1: Not logged in -> Show Auth Screen
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="flex flex-col h-screen bg-dark-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        onOpenCreateWizard={() => setViewMode('wizard')}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        onOpenProjectsList={() => setIsProjectsOpen(true)}
        onDeleteProject={handleDeleteCurrentProject}
        activeProject={activeProject}
        userProfile={currentUser}
        onLogout={handleLogout}
        isEditorView={viewMode === 'editor'}
      />

      {/* Main View Router */}
      {viewMode === 'wizard' ? (
        /* STEP 3: Clipzzz Creation Wizard */
        <div className="flex-1 overflow-y-auto">
          <CreateWizard
            onProjectCreated={handleProjectCreated}
            userProfile={currentUser}
            onOpenKeyModal={() => setIsKeyModalOpen(true)}
          />
        </div>
      ) : activeProject ? (
        /* STEP 4: Full Production Studio Editor (3-Column Layout: Left Clips, Center Stage, Right Settings) */
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT COLUMN: Vertical Clips Drawer / Sidebar */}
          <ClipsList
            clips={activeProject.clips}
            selectedClip={selectedClip}
            onSelectClip={handleSelectClip}
            onRenderClip={(clip, mode = 'captioned') => handleOpenExport(mode, true)}
            onDeleteClip={handleDeleteClip}
            onDeleteProject={handleDeleteCurrentProject}
            onCreateNew={() => setViewMode('wizard')}
          />

          {/* CENTER COLUMN: Main Video Stage + Floating Crop + Contained Timeline */}
          <div className="flex-1 flex flex-col min-h-0 relative border-r border-dark-700/80 bg-dark-950/60 overflow-hidden">
            <div className="flex-1 flex items-center justify-center min-h-0 relative overflow-hidden">
              <VideoPlayer
                project={activeProject}
                selectedClip={selectedClip}
                aspectRatio={aspectRatio}
                onToggleAspectRatio={setAspectRatio}
                cropSettings={{
                  x: selectedClip?.crop_x ?? 50,
                  y: selectedClip?.crop_y ?? 45,
                  zoom: selectedClip?.crop_zoom ?? 1.0,
                  mode: selectedClip?.crop_mode ?? 'blur_fill',
                  keyframes: selectedClip?.crop_keyframes || [],
                }}
                onChangeCrop={handleChangeCrop}
                captionStyle={selectedClip?.caption_style}
                onChangeCaptionStyle={handleChangeCaptionStyle}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
                onSeek={handleSeek}
                onUpdateClipBounds={handleUpdateClipBounds}
                onOpenExport={(mode = 'captioned', force = true) => handleOpenExport(mode, force)}
                onOpenShortsKit={() => setIsShortsKitOpen(true)}
                onDeleteClip={handleDeleteClip}
                isCropInspectorOpen={isCropInspectorOpen}
                onToggleCropInspector={() => setIsCropInspectorOpen(!isCropInspectorOpen)}
                onAutoTrack={handleAutoTrackClip}
                onUpdateChannelName={handleUpdateChannelName}
              />

              {/* Floating/Docked Crop Inspector */}
              {isCropInspectorOpen && (
                <div className="absolute top-4 right-4 z-40">
                  <CropInspector
                    isOpen={isCropInspectorOpen}
                    onClose={() => setIsCropInspectorOpen(false)}
                    cropSettings={{
                      x: selectedClip?.crop_x ?? 50,
                      y: selectedClip?.crop_y ?? 45,
                      zoom: selectedClip?.crop_zoom ?? 1.0,
                      mode: selectedClip?.crop_mode ?? 'blur_fill',
                      keyframes: selectedClip?.crop_keyframes || [],
                    }}
                    onChangeCrop={handleChangeCrop}
                    selectedClip={selectedClip}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                    videoSrc={videoSrc}
                    onAutoTrack={handleAutoTrackClip}
                  />
                </div>
              )}
            </div>

          </div>

          {/* RIGHT COLUMN: Video Settings (Caption.js Templates) + Transcript Sync */}
          <div className="w-80 lg:w-96 flex flex-col shrink-0 bg-dark-900 overflow-hidden relative">
            <SubtitleCustomizer
              captionStyle={selectedClip?.caption_style}
              onChangeStyle={handleChangeCaptionStyle}
            />

            <TranscriptPanel
              transcript={activeProject.transcript_raw}
              currentTime={currentTime}
              onSeek={handleSeek}
              selectedClip={selectedClip}
              highlightColor={selectedClip?.caption_style?.highlightColor || '#bef264'}
              onEditSegment={(seg) => setEditingSegment(seg)}
              onUpdateSegment={handleUpdateTranscriptSegment}
            />

            {/* Slide-over Caption Edit Modal / Drawer (Docked strictly on Right Side, keeping video visible) */}
            {editingSegment && (
              <CaptionEditDrawer
                isOpen={Boolean(editingSegment)}
                segment={editingSegment}
                onClose={() => setEditingSegment(null)}
                onUpdateSegment={handleUpdateTranscriptSegment}
                onSeek={handleSeek}
                onSaveToBackend={handleSaveTranscriptToBackend}
              />
            )}
          </div>
        </div>
      ) : (
        /* Fallback if no project in editor mode */
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => setViewMode('wizard')}
            className="bg-lime-neon text-black font-extrabold px-6 py-3 rounded-2xl shadow-neon"
          >
            Create Your First Shorts Project
          </button>
        </div>
      )}

      {/* STEP 2: Gemini API Key Setup Modal */}
      <GeminiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        userProfile={currentUser}
        onKeySaved={handleKeySaved}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => {
          setIsExportOpen(false);
          setExportForce(false);
        }}
        clip={selectedClip}
        initialMode={exportMode}
        forceRender={exportForce}
        onRenderComplete={handleRenderComplete}
      />

      <ShortsKitModal
        isOpen={isShortsKitOpen}
        onClose={() => setIsShortsKitOpen(false)}
        clip={selectedClip}
        project={activeProject}
      />

      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        onSelectProject={async (id) => {
          const p = await api.getProject(id);
          handleProjectCreated(p);
        }}
        onDeleteActiveProject={() => {
          setActiveProject(null);
          setSelectedClip(null);
          setViewMode('wizard');
        }}
        activeProjectId={activeProject?.id}
      />
    </div>
  );
}
