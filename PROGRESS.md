# Clipzzz – AI YouTube Clipper: Development Progress & Roadmap

> **Status:** Active Development
> **Last Updated:** 2026-11-01
> **Architecture:** Django REST Backend + React Vite Tailwind Frontend + Gemini AI Engine + FFmpeg Video Processing Pipeline

---

## 📌 Project Overview
Clipzzz is an AI-powered YouTube Clipper and Short-form Video Generation Studio. It takes long-form YouTube videos or uploaded video files, extracts transcripts with accurate word-level timestamps, leverages Google Gemini AI to detect high-virality highlights and hooks, and edits them via FFmpeg into vertical (9:16, 1080x1920) YouTube Shorts with burned-in animated subtitles, smart framing, and professional audio normalization.

---

## 🗺️ Master Phased Roadmap

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | **Project Blueprint, Roadmap & Workspace Setup** (Virtualenv, Django backend structure, React+Vite frontend, dependencies) | 🟢 Completed |
| **Phase 2** | **Video Ingestion & Transcription Pipeline** (YouTube downloader with yt-dlp, local file upload, FFmpeg audio extraction, native YouTube captions + Whisper/Gemini fallback) | 🟢 Completed |
| **Phase 3** | **Gemini AI Highlight Detection & Viral Scoring** (Prompt engineering for viral hooks, engagement scoring 0-100, topic categorization, fallback mode) | 🟢 Completed |
| **Phase 4** | **FFmpeg Video Editing & Shorts Rendering Engine** (9:16 vertical crop/blur-pad, ASS animated/karaoke subtitles, audio normalization, MP4 export) | 🟢 Completed |
| **Phase 5** | **Clipzzz Studio UI (Reference Screenshot Design)** (Dark theme + neon lime accent, 16:9 vs 9:16 player, interactive timeline, X/Y crop inspector, live transcript sync, subtitle styling) | 🟢 Completed |
| **Phase 6** | **End-to-End Integration, Testing & Production Verification** (Full pipeline testing, error handling, performance optimization, export validation) | 🟢 Completed |
| **Phase 7** | **Airtight Auth, Key Encryption & CapCut-Style Creation Wizard** (Swipe puzzle captcha, OTP verification, JWT session persistence, AES key encryption & masking, AI speaker face tracking, aspect ratios 9:16/16:9/1:1, clip counts 5-11, duration bounds) | 🟢 Completed |
| **Phase 8** | **Gmail SMTP, India-Based Formatting, Captcha Locking & Redis Rate Limiting** (Real Gmail SMTP with branded HTML email template, strict @gmail.com enforcement, Indian +91 phone validation, captcha locking until form completion, Redis/Cache rate limiter) | 🟢 Completed |
| **Phase 9** | **Custom Brand Logo Integration Across Platform** (Configured logo.png as browser favicon, Header brand mark, Auth card, Project Wizard, and AI key modal) | 🟢 Completed |

---

## 📝 Phase-by-Phase Log

### Phase 1: Project Blueprint & Workspace Setup ✅
- [x] Initialized roadmap and progress tracker (`PROGRESS.md`).
- [x] Configured Python 3.12 virtual environment in `backend/venv`.
- [x] Installed all backend dependencies (`Django 5.1`, `djangorestframework`, `django-cors-headers`, `google-genai`, `google-generativeai`, `yt-dlp`, `youtube-transcript-api`, `psutil`, `pydantic`).
- [x] Initialized Django project (`config`) and API application (`api`).
- [x] Configured React 18 + Vite frontend with Tailwind CSS (custom neon lime palette matching reference screenshot) and Lucide icons.
- [x] Initialized environment files (`.env.example`, `backend/.env`).

### Phase 2: Video Ingestion & Audio/Transcription Pipeline ✅
- [x] Implemented `downloader.py` using `yt-dlp` for YouTube download with 1080p selection and `ffprobe` metadata analysis.
- [x] Implemented `transcription.py` extracting 16kHz mono audio via FFmpeg.
- [x] Added instant sub-second native YouTube transcript retrieval (`youtube-transcript-api`) with zero latency.
- [x] Integrated Gemini audio transcription and Groq Whisper fallback, with intelligent fallback generator.
- [x] Configured HTTP 206 Partial Content Range streaming in Django for fluid video scrubbing in browser players.

### Phase 3: Gemini AI Highlight Detection & Viral Scoring ✅
- [x] Created `ai_analyzer.py` utilizing Gemini 2.5 Flash (`google-genai`) for extracting high-engagement viral clips.
- [x] Prompted Gemini for standalone moments, strong opening hooks, clean sentence boundaries, and 0-100 virality scoring.
- [x] Added support for target clip counts (`5, 7, 9, 11`) and duration preferences (`0-30s, 30-60s, 60-80s`).
- [x] Built heuristic fallback engine with keyword density scoring when running without API keys.

### Phase 4: FFmpeg Video Editing & Shorts Rendering Engine ✅
- [x] Created `editor.py` for automated 9:16 vertical (1080x1920) rendering.
- [x] Supported **Smart Blur-Fill Background** (original video centered with blurred zoomed background).
- [x] Supported **Center Crop / Custom Crop** with X%, Y% focal point and Zoom sliders matching reference screenshot.
- [x] Generated ASS (Advanced SubStation Alpha) subtitle files with word-by-word karaoke and highlighted accents (`#bef264` neon lime).
- [x] Integrated audio loudness normalization (`loudnorm=I=-14:LRA=7:tp=-1.5`) for broadcast-grade Shorts audio.
- [x] Built async worker `task_runner.py` for non-blocking rendering.

### Phase 5: Clipzzz Studio UI (Reference Screenshot Design) ✅
- [x] Built React + Vite UI mirroring the uploaded reference screenshot in theme and aesthetics.
- [x] Implemented dark charcoal background (`#07090e`, `#0b0f19`) with glowing neon lime (`#bef264`) accents.
- [x] Created 16:9 vs 9:16 aspect ratio switcher with live on-screen subtitle karaoke word sync.
- [x] Implemented interactive draggable timeline with scene labels (`Cena #1`), keyframe track, and zoom slider (`Zoom da timeline`).
- [x] Built floating Crop & Keyframe inspector (`KEYFRAME 227`) with X%, Y%, and Zoom sliders.
- [x] Created Subtitle Customizer with font selector, color pickers, alignment buttons, and animations.
- [x] Built Interactive Transcript panel (`Transcrição do Clipe`) with clickable timestamps, search, and live spoken word highlighting.

### Phase 6: End-to-End Integration & Verification ✅
- [x] Created `seed_demo` management command with demo video and transcript.
- [x] Verified FFmpeg 9:16 rendering pipeline generating 1080x1920 MP4 with burned-in subtitles and normalized audio.
- [x] Tested Vite production build (transformed 1,660 modules with 0 errors).
- [x] Created Windows launcher scripts (`run_clipzzz.bat`, `run_backend.bat`, `run_frontend.bat`).

### Phase 7: Airtight Auth, Key Encryption & CapCut-Style Creation Wizard ✅
- [x] Built `AuthScreen` with Login & Signup tabs:
  - Signup fields: First Name, Last Name, Email, Contact Phone, Anti-Bot Swipe Puzzle Captcha, and OTP verification.
  - Login fields: Email, Anti-Bot Swipe Puzzle Captcha, and OTP verification.
  - Implemented SimpleJWT authentication with 7-day access tokens and 30-day refresh tokens.
  - Added Axios interceptor with automatic token rotation so users are never unexpectedly logged out.
- [x] Built `GeminiKeyModal`:
  - 256-bit AES Fernet encryption on the backend before storing in SQLite/PostgreSQL.
  - Raw API key is permanently masked on the platform (`AIzaSy••••••••4x8F`).
  - Account-bound persistent credentials.
- [x] Built `CreateWizard` (CapCut-inspired flow):
  - Aspect ratio selection: `9:16 Portrait` (Shorts/TikTok/Reels), `16:9 Landscape` (YouTube), `1:1 Square` (Instagram).
  - AI Smart Speaker Tracking: Automatic face detection via OpenCV centering the speaker in the frame.
  - Clip Count selector: `5`, `7 (Recommended)`, `9`, `11 (Max)`.
  - Target Duration selector: `0 – 30s` (Quick hooks), `30 – 60s` (Standard Shorts), `60 – 80s` (Deep story).
  - Real-time 5-stage pipeline animation before transitioning into the Studio Editor.

### Phase 8: Gmail SMTP, India-Based Formatting, Captcha Locking & Redis Rate Limiting ✅
- [x] Integrated real Gmail SMTP (`smtp.gmail.com:587`, TLS) in `settings.py`.
- [x] Designed branded dark + neon lime HTML email template ([email_service.py](file:///d:/CLIPZZZ/backend/api/services/email_service.py)) with bold 6-digit OTP code, expiration warning, and creator branding.
- [x] Localized all placeholders for India (`Aarav Sharma`, `+91 98765 43210`, `rohit.sharma@gmail.com`).
- [x] Enforced strict `@gmail.com` validation on both frontend and backend (non-Gmail addresses rejected with HTTP 400).
- [x] Enforced Indian mobile number validation (`+91` 10-digits starting with 6, 7, 8, or 9).
- [x] Implemented **Captcha Locking**: The swipe puzzle remains locked and untriggerable until all required fields are filled.
- [x] Implemented **Redis / Cache Rate Limiting**: Max 3 OTP requests per 10 minutes per email, 5 per IP to stop bot spam and fake API calls.

### Phase 9: Custom Brand Logo Integration Across Platform ✅
- [x] Set `logo.png` as high-resolution browser favicon in `index.html` and `public/logo.png`.
- [x] Updated main application [Header.jsx](file:///d:/CLIPZZZ/frontend/src/components/Header.jsx) with custom brand logo badge.
- [x] Updated [AuthScreen.jsx](file:///d:/CLIPZZZ/frontend/src/components/AuthScreen.jsx) landing card with the official logo.
- [x] Updated [CreateWizard.jsx](file:///d:/CLIPZZZ/frontend/src/components/CreateWizard.jsx) header banner.
- [x] Updated [GeminiKeyModal.jsx](file:///d:/CLIPZZZ/frontend/src/components/GeminiKeyModal.jsx) onboarding modal.
- [x] Verified full Vite production bundling (1,661 modules, 0 errors).

---

## 📝 Phase-by-Phase Log

### Phase 1: Project Blueprint & Workspace Setup ✅
- [x] Initialized roadmap and progress tracker (`PROGRESS.md`).
- [x] Configured Python 3.12 virtual environment in `backend/venv`.
- [x] Installed all backend dependencies (`Django 5.1`, `djangorestframework`, `django-cors-headers`, `google-genai`, `google-generativeai`, `yt-dlp`, `youtube-transcript-api`, `psutil`, `pydantic`).
- [x] Initialized Django project (`config`) and API application (`api`).
- [x] Configured React 18 + Vite frontend with Tailwind CSS (custom neon lime palette matching reference screenshot) and Lucide icons.
- [x] Initialized environment files (`.env.example`, `backend/.env`).

### Phase 2: Video Ingestion & Audio/Transcription Pipeline ✅
- [x] Implemented `downloader.py` using `yt-dlp` for YouTube download with 1080p selection and `ffprobe` metadata analysis.
- [x] Implemented `transcription.py` extracting 16kHz mono audio via FFmpeg.
- [x] Added instant sub-second native YouTube transcript retrieval (`youtube-transcript-api`) with zero latency.
- [x] Integrated Gemini audio transcription and Groq Whisper fallback, with intelligent fallback generator.
- [x] Configured HTTP 206 Partial Content Range streaming in Django for fluid video scrubbing in browser players.

### Phase 3: Gemini AI Highlight Detection & Viral Scoring ✅
- [x] Created `ai_analyzer.py` utilizing Gemini 2.5 Flash (`google-genai`) for extracting high-engagement viral clips.
- [x] Prompted Gemini for standalone moments, strong opening hooks, clean sentence boundaries, and 0-100 virality scoring.
- [x] Added support for target clip counts (`5, 7, 9, 11`) and duration preferences (`0-30s, 30-60s, 60-80s`).
- [x] Built heuristic fallback engine with keyword density scoring when running without API keys.

### Phase 4: FFmpeg Video Editing & Shorts Rendering Engine ✅
- [x] Created `editor.py` for automated 9:16 vertical (1080x1920) rendering.
- [x] Supported **Smart Blur-Fill Background** (original video centered with blurred zoomed background).
- [x] Supported **Center Crop / Custom Crop** with X%, Y% focal point and Zoom sliders matching reference screenshot.
- [x] Generated ASS (Advanced SubStation Alpha) subtitle files with word-by-word karaoke and highlighted accents (`#bef264` neon lime).
- [x] Integrated audio loudness normalization (`loudnorm=I=-14:LRA=7:tp=-1.5`) for broadcast-grade Shorts audio.
- [x] Built async worker `task_runner.py` for non-blocking rendering.

### Phase 5: Clipzzz Studio UI (Reference Screenshot Design) ✅
- [x] Built React + Vite UI mirroring the uploaded reference screenshot in theme and aesthetics.
- [x] Implemented dark charcoal background (`#07090e`, `#0b0f19`) with glowing neon lime (`#bef264`) accents.
- [x] Created 16:9 vs 9:16 aspect ratio switcher with live on-screen subtitle karaoke word sync.
- [x] Implemented interactive draggable timeline with scene labels (`Cena #1`), keyframe track, and zoom slider (`Zoom da timeline`).
- [x] Built floating Crop & Keyframe inspector (`KEYFRAME 227`) with X%, Y%, and Zoom sliders.
- [x] Created Subtitle Customizer with font selector, color pickers, alignment buttons, and animations.
- [x] Built Interactive Transcript panel (`Transcrição do Clipe`) with clickable timestamps, search, and live spoken word highlighting.

### Phase 6: End-to-End Integration & Verification ✅
- [x] Created `seed_demo` management command with demo video and transcript.
- [x] Verified FFmpeg 9:16 rendering pipeline generating 1080x1920 MP4 with burned-in subtitles and normalized audio.
- [x] Tested Vite production build (transformed 1,660 modules with 0 errors).
- [x] Created Windows launcher scripts (`run_clipzzz.bat`, `run_backend.bat`, `run_frontend.bat`).

### Phase 7: Airtight Auth, Key Encryption & CapCut-Style Creation Wizard ✅
- [x] Built `AuthScreen` with Login & Signup tabs:
  - Signup fields: First Name, Last Name, Email, Contact Phone, Anti-Bot Swipe Puzzle Captcha, and OTP verification.
  - Login fields: Email, Anti-Bot Swipe Puzzle Captcha, and OTP verification.
  - Implemented SimpleJWT authentication with 7-day access tokens and 30-day refresh tokens.
  - Added Axios interceptor with automatic token rotation so users are never unexpectedly logged out.
- [x] Built `GeminiKeyModal`:
  - 256-bit AES Fernet encryption on the backend before storing in SQLite/PostgreSQL.
  - Raw API key is permanently masked on the platform (`AIzaSy••••••••4x8F`).
  - Account-bound persistent credentials.
- [x] Built `CreateWizard` (CapCut-inspired flow):
  - Aspect ratio selection: `9:16 Portrait` (Shorts/TikTok/Reels), `16:9 Landscape` (YouTube), `1:1 Square` (Instagram).
  - AI Smart Speaker Tracking: Automatic face detection via OpenCV centering the speaker in the frame.
  - Clip Count selector: `5`, `7 (Recommended)`, `9`, `11 (Max)`.
  - Target Duration selector: `0 – 30s` (Quick hooks), `30 – 60s` (Standard Shorts), `60 – 80s` (Deep story).
  - Real-time 5-stage pipeline animation before transitioning into the Studio Editor.

---

## 📝 Phase-by-Phase Log

### Phase 1: Project Blueprint & Workspace Setup ✅
- [x] Initialized roadmap and progress tracker (`PROGRESS.md`).
- [x] Configured Python 3.12 virtual environment in `backend/venv`.
- [x] Installed all backend dependencies (`Django 5.1`, `djangorestframework`, `django-cors-headers`, `google-genai`, `google-generativeai`, `yt-dlp`, `youtube-transcript-api`, `psutil`, `pydantic`).
- [x] Initialized Django project (`config`) and API application (`api`).
- [x] Configured React 18 + Vite frontend with Tailwind CSS (custom neon lime palette matching reference screenshot) and Lucide icons.
- [x] Initialized environment files (`.env.example`, `backend/.env`).

### Phase 2: Video Ingestion & Audio/Transcription Pipeline ✅
- [x] Implemented `downloader.py` using `yt-dlp` for YouTube download with 1080p selection and `ffprobe` metadata analysis.
- [x] Implemented `transcription.py` extracting 16kHz mono audio via FFmpeg.
- [x] Added instant sub-second native YouTube transcript retrieval (`youtube-transcript-api`) with zero latency.
- [x] Integrated Gemini audio transcription and Groq Whisper fallback, with intelligent fallback generator.
- [x] Configured HTTP 206 Partial Content Range streaming in Django for fluid video scrubbing in browser players.

### Phase 3: Gemini AI Highlight Detection & Viral Scoring ✅
- [x] Created `ai_analyzer.py` utilizing Gemini 2.5 Flash (`google-genai`) for extracting high-engagement viral clips.
- [x] Prompted Gemini for 3-8 standalone moments, strong opening hooks, clean sentence boundaries, and 0-100 virality scoring.
- [x] Built heuristic fallback engine with keyword density scoring when running without API keys.

### Phase 4: FFmpeg Video Editing & Shorts Rendering Engine ✅
- [x] Created `editor.py` for automated 9:16 vertical (1080x1920) rendering.
- [x] Supported **Smart Blur-Fill Background** (original video centered with blurred zoomed background).
- [x] Supported **Center Crop / Custom Crop** with X%, Y% focal point and Zoom sliders matching reference screenshot.
- [x] Generated ASS (Advanced SubStation Alpha) subtitle files with word-by-word karaoke and highlighted accents (`#bef264` neon lime).
- [x] Integrated audio loudness normalization (`loudnorm=I=-14:LRA=7:tp=-1.5`) for broadcast-grade Shorts audio.
- [x] Built async worker `task_runner.py` for non-blocking rendering.

### Phase 5: Clipzzz Studio UI (Reference Screenshot Design) ✅
- [x] Built React + Vite UI mirroring the uploaded reference screenshot in theme and aesthetics.
- [x] Implemented dark charcoal background (`#07090e`, `#0b0f19`) with glowing neon lime (`#bef264`) accents.
- [x] Created 16:9 vs 9:16 aspect ratio switcher with live on-screen subtitle karaoke word sync.
- [x] Implemented interactive draggable timeline with scene labels (`Cena #1`), keyframe track, and zoom slider (`Zoom da timeline`).
- [x] Built floating Crop & Keyframe inspector (`KEYFRAME 227`) with X%, Y%, and Zoom sliders.
- [x] Created Subtitle Customizer with font selector, color pickers, alignment buttons, and animations.
- [x] Built Interactive Transcript panel (`Transcrição do Clipe`) with clickable timestamps, search, and live spoken word highlighting.

### Phase 6: End-to-End Integration & Verification ✅
- [x] Created `seed_demo` management command with demo video and transcript.
- [x] Verified FFmpeg 9:16 rendering pipeline generating 1080x1920 MP4 with burned-in subtitles and normalized audio.
- [x] Tested Vite production build (transformed 1,658 modules in 6.05s with 0 errors).
- [x] Created Windows launcher scripts (`run_clipzzz.bat`, `run_backend.bat`, `run_frontend.bat`).

---

## 📝 Phase-by-Phase Log

### Phase 1: Project Blueprint & Workspace Setup ✅
- [x] Initialized roadmap and progress tracker (`PROGRESS.md`).
- [x] Configured Python 3.12 virtual environment in `backend/venv`.
- [x] Installed all backend dependencies (`Django 5.1`, `djangorestframework`, `django-cors-headers`, `google-genai`, `google-generativeai`, `yt-dlp`, `youtube-transcript-api`, `psutil`, `pydantic`).
- [x] Initialized Django project (`config`) and API application (`api`).
- [x] Configured React 18 + Vite frontend with Tailwind CSS (custom neon lime palette matching reference screenshot) and Lucide icons.
- [x] Initialized environment files (`.env.example`, `backend/.env`).

### Phase 2: Video Ingestion & Audio/Transcription Pipeline ✅
- [x] Implemented `downloader.py` using `yt-dlp` for YouTube download with 1080p selection and `ffprobe` metadata analysis.
- [x] Implemented `transcription.py` extracting 16kHz mono audio via FFmpeg.
- [x] Added instant sub-second native YouTube transcript retrieval (`youtube-transcript-api`) with zero latency.
- [x] Integrated Gemini audio transcription and Groq Whisper fallback, with intelligent fallback generator.
- [x] Configured HTTP 206 Partial Content Range streaming in Django for fluid video scrubbing in browser players.

### Phase 3: Gemini AI Highlight Detection & Viral Scoring ✅
- [x] Created `ai_analyzer.py` utilizing Gemini 2.5 Flash (`google-genai`) for extracting high-engagement viral clips.
- [x] Prompted Gemini for 3-8 standalone moments, strong opening hooks, clean sentence boundaries, and 0-100 virality scoring.
- [x] Built heuristic fallback engine with keyword density scoring when running without API keys.

### Phase 4: FFmpeg Video Editing & Shorts Rendering Engine ✅
- [x] Created `editor.py` for automated 9:16 vertical (1080x1920) rendering.
- [x] Supported **Smart Blur-Fill Background** (original video centered with blurred zoomed background).
- [x] Supported **Center Crop / Custom Crop** with X%, Y% focal point and Zoom sliders matching reference screenshot.
- [x] Generated ASS (Advanced SubStation Alpha) subtitle files with word-by-word karaoke and highlighted accents (`#bef264` neon lime).
- [x] Integrated audio loudness normalization (`loudnorm=I=-14:LRA=7:tp=-1.5`) for broadcast-grade Shorts audio.
- [x] Built async worker `task_runner.py` for non-blocking rendering.

---
*This file is updated at every phase completion to ensure consistent tracking.*
