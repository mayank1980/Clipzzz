# CLIPIT — Find the moment. Clip it.

> **Long videos in. Perfect clips out.**
> CLIPIT is an AI-powered video clipping platform that transforms long YouTube videos, podcasts, interviews, and recordings into engaging 9:16 short-form clips with smart active speaker tracking, multi-person vertical split-screen framing, and clean export workflows.

---

## ⚡ Quick Start: Setup & Run

### 🪟 Windows:
1. **First-time Setup** (Run once to install dependencies & database):
   ```cmd
   setup.bat
   ```
2. **Launch CLIPIT** (Run anytime):
   ```cmd
   run_clipzzz.bat
   ```
   *(Launches Backend on `http://localhost:8000`, Frontend on `http://localhost:5173`, and opens your browser automatically).*

---

### 🍎 Linux / macOS:
1. **First-time Setup**:
   ```bash
   chmod +x setup.sh run_clipzzz.sh
   ./setup.sh
   ```
2. **Launch CLIPIT**:
   ```bash
   ./run_clipzzz.sh
   ```

---

## 📋 Prerequisites
Before running, make sure your machine has:
* **Python 3.10+** ([python.org](https://www.python.org/downloads/)) - *Check "Add Python to PATH"*
* **Node.js (LTS v18+)** ([nodejs.org](https://nodejs.org/))
* **FFmpeg** ([gyan.dev](https://www.gyan.dev/ffmpeg/builds/) or `winget install Gyan.FFmpeg`)

---

## 🌟 Key Features

* **AI Content Detection & Mode Recommendation**:
  - Automatically identifies video genre (Horror / True Crime, Story Podcast, Standup Comedy, Motivation, Tech).
  - Auto-recommends **Story Arc Series** (uncapped full story sequential slicing from opening to conclusion) vs **Solo Viral Highlights**.
* **Sequential Story & Timeline Sorting**:
  - Multi-part series are strictly ordered chronologically: `Part 1 -> Part 2 -> Part 3...` with zero mixing between different story segments.
  - Quick toggle between **Timeline Order (0:00 -> End)** and **Viral Score (99 -> 0)**.
* **Animated Captions with 26 Presets**:
  - Real-time word-by-word karaoke synchronization with neon lime highlighting.
  - Interactive **drag-to-position** caption overlay on the video preview.
  - 26 presets (Karaoke, Banger, Beasty, Marker, Aurora Ink, Red Rock, Lovly, etc.).
* **AI Smart Speaker Tracking**:
  - Computer vision facial recognition and speaker tracking.
  - Smooth pan/zoom camera framing keeping the active speaker perfectly centered in 9:16 portrait.
* **Export Options**:
  - **Render Short (With Captions)**: 1080x1920 MP4 with burned-in ASS subtitles and NVIDIA NVENC / CPU acceleration.
  - **Download Clean (No Captions)**: 100% pure video footage without burned-in text for external editing in Premiere, DaVinci, or CapCut.
  - **Shorts Kit (.MD / ZIP)**: Complete YouTube upload package with dialogue hooks, SEO descriptions, hashtags, and creator credits.

---

## 📁 Repository Structure

```
CLIPZZZ/
├── backend/
│   ├── api/
│   │   ├── services/
│   │   │   ├── ai_analyzer.py      # Gemini AI highlight analysis & story arc slicer
│   │   │   ├── downloader.py       # yt-dlp metadata inspection & video download
│   │   │   ├── editor.py           # FFmpeg 9:16 renderer & ASS subtitle generator
│   │   │   ├── face_tracker.py     # AI facial tracking & active speaker framing
│   │   │   ├── task_runner.py      # Background async rendering engine
│   │   │   ├── transcription.py    # Whisper & Gemini audio transcription
│   │   │   └── upload_kit.py       # SEO titles, description & hashtag generator
│   │   ├── models.py               # VideoProject & VideoClip models
│   │   ├── serializers.py          # DRF serializers (with timeline ordering)
│   │   ├── views.py                # REST endpoints
│   │   └── urls.py
│   ├── config/                     # Django project configuration
│   ├── media/                      # Uploaded videos, audio, and rendered clips
│   ├── requirements.txt            # Python dependencies
│   ├── manage.py
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CreateWizard.jsx    # URL confirmation & AI content detector
│   │   │   ├── ClipsList.jsx       # Story arc groups & timeline sorting
│   │   │   ├── VideoPlayer.jsx     # 9:16 player with draggable captions & controls
│   │   │   ├── ExportModal.jsx     # Re-render & download studio
│   │   │   ├── ShortsKitModal.jsx  # SEO upload package viewer
│   │   │   └── SubtitleCustomizer.jsx # 26 animation presets & styling
│   │   ├── services/api.js         # API client
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── setup.bat                       # Initial Setup & Dependency Installer (Windows)
├── run_clipzzz.bat                 # Fast Studio Runner & Browser Launcher (Windows)
├── setup.sh                        # Initial Setup (Linux/macOS)
├── run_clipzzz.sh                  # Studio Runner (Linux/macOS)
├── .gitignore                      # Git exclusion rules
├── .env.example                    # Environment template
└── README.md
```

---

## 🔑 AI Key Setup (Google Gemini)

You can set your Gemini API key in two ways:
1. **In the Web UI**: Click **Linked AI Key** on the dashboard, paste your key, and click **Save & Link Key**.
2. **In `.env`**: Set `GEMINI_API_KEY=your_key_here` in `backend/.env`.

*(Note: If no key is configured, CLIPIT automatically uses its intelligent heuristic highlight engine so you can test cutting, styling, and rendering without being blocked).*
