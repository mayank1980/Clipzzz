import os
import json
import re
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional


def get_duration_range(preference: str):
    if preference == '0-30':
        return 20.0, 30.0
    elif preference == '60-80':
        return 58.0, 82.0
    else:  # '30-60'
        return 35.0, 60.0


VIRAL_KEYWORDS = [
    'kyu', 'kya', 'kaise', 'why', 'how', 'secret', 'bada', 'sabse', 'truth',
    'mistake', 'galti', 'never', 'hamesha', '99%', 'sach', 'danger', 'proof',
    'rule', 'commando', 'sniper', 'discipline', 'mindset', 'fail', 'exposed',
    'success', 'faisla', 'life', 'focus', 'pressure', 'fear', 'darr', 'reality',
    'lesson', 'operation', 'story', 'game changer', 'result', 'habits', 'hack',
    'asli', 'biggest', 'advice', 'career', 'money', 'wealth', 'strategy', 'formula',
]

EMOTION_KEYWORDS = [
    'danger', 'fear', 'darr', 'shock', 'insane', 'pagal', 'crazy', 'unbelievable',
    'worst', 'best', 'khatam', 'mar', 'jeet', 'winner', 'loser', 'tears', 'hasna',
    'cry', 'fail', 'died', 'survive', 'pain', 'dard', 'proud', 'heart', 'brutal',
    'terrifying', 'goosebumps', 'hilarious', 'destroyed', 'obsessed',
]

HOOK_STARTERS = [
    'kyu', 'kya', 'kaise', 'why', 'how', 'what if', 'never', '99%', 'sabse bada',
    'do you know', 'agar aap', 'jab maine', 'the secret', 'ek rule', 'yeh galti',
    'stop', 'nobody talks', 'most people', 'here is why', 'listen closely', 'imagine',
    'truth is', 'asli baat', 'ek baat',
]

CONTRAST_PIVOTS = [
    'but', 'however', 'actually', 'lekin', 'par', 'magar', 'sacchai', 'reality is',
    'plot twist', 'instead', 'turns out', 'yet', 'asli mein', 'most people think',
]

PAYOFF_MARKERS = [
    'toh', 'isliye', 'result', 'hamesha', 'tabhi', 'success', 'asli', 'yaad rakhna',
    'solution', 'lesson', 'takeaway', 'that is why', 'the key is', 'always', 'never forget',
]

MID_THOUGHT_CONTINUATIONS = (
    'and ', 'but ', 'so ', 'because ', 'then ', 'or ', 'though ', 'which ', 'that ',
    'aur ', 'lekin ', 'toh ', 'kyunki ', 'isliye ', 'par ', 'magar ', 'tab ', 'phir ',
)

WEAK_END_WORDS = {
    'and', 'but', 'or', 'because', 'so', 'that', 'if', 'when', 'while', 'with', 'to', 'of',
    'for', 'in', 'on', 'aur', 'lekin', 'ki', 'par', 'kyunki', 'toh', 'se', 'mein',
}

STAT_PATTERN = re.compile(
    r'\b(?:\d+(?:\.\d+)?%|\d+\s*(?:million|billion|crore|lakh|thousand|x|times|years|days|hours|mistakes|rules|steps))\b',
    re.IGNORECASE,
)


def calculate_segment_scores(
    text: str,
    duration: float,
    has_face: bool = True
) -> Dict[str, float]:
    """
    Implements the 6-parameter viral scoring formula:
    S = 0.28*M + 0.24*H + 0.16*E + 0.14*A + 0.08*V + 0.10*C
    All components normalized to [0, 100].
    """
    text_clean = text.strip()
    words = text_clean.split()
    word_count = len(words)
    text_lower = text_clean.lower()

    # 1. M: Semantic Importance & Novelty (28%)
    m_score = 64.0
    viral_matches = sum(1 for k in VIRAL_KEYWORDS if k in text_lower)
    m_score += min(24.0, viral_matches * 5.0)
    if STAT_PATTERN.search(text_clean):
        m_score += 8.0
    if any(p in text_lower for p in CONTRAST_PIVOTS):
        m_score += 6.0
    m_score = min(100.0, m_score)

    # 2. H: Opening Hook Strength (24%)
    h_score = 58.0
    first_few_words = " ".join(words[:7]).lower()
    if '?' in text_clean or any(text_lower.startswith(hs) for hs in HOOK_STARTERS) or any(hs in first_few_words for hs in HOOK_STARTERS):
        h_score += 28.0
    if any(k in first_few_words for k in ['99%', 'never', 'secret', 'sabse', 'galti', 'why', 'kaise', 'stop', 'truth']):
        h_score += 12.0
    if any(first_few_words.startswith(c) for c in MID_THOUGHT_CONTINUATIONS):
        h_score -= 10.0
    h_score = max(40.0, min(100.0, h_score))

    # 3. E: Emotional & Tension Impact (16%)
    e_score = 58.0
    if '!' in text_clean:
        e_score += 14.0
    if '?' in text_clean:
        e_score += 8.0
    emotion_matches = sum(1 for ek in EMOTION_KEYWORDS if ek in text_lower)
    e_score += min(24.0, emotion_matches * 7.5)
    e_score = min(100.0, e_score)

    # 4. A: Audio Cadence & Speaking Energy (14%)
    dur = max(0.5, duration)
    wps = word_count / dur
    if 2.3 <= wps <= 3.9:
        a_score = 96.0
    elif 1.7 <= wps < 2.3 or 3.9 < wps <= 4.6:
        a_score = 82.0
    else:
        a_score = 65.0

    # 5. V: Visual Presence Factor (8%)
    v_score = 92.0 if has_face else 75.0

    # 6. C: Context Completeness & Payoff Closure (10%)
    c_score = 68.0
    if text_clean.endswith(('.', '?', '!', '|')):
        c_score = 94.0
    elif word_count >= 12:
        c_score = 80.0
    last_word = re.sub(r'[^a-zA-Z]', '', words[-1].lower()) if words else ''
    if last_word in WEAK_END_WORDS:
        c_score -= 16.0
    c_score = max(40.0, min(100.0, c_score))

    composite = (
        0.28 * m_score +
        0.24 * h_score +
        0.16 * e_score +
        0.14 * a_score +
        0.08 * v_score +
        0.10 * c_score
    )

    return {
        "composite": round(composite, 1),
        "semantic": round(m_score, 1),
        "hook": round(h_score, 1),
        "emotion": round(e_score, 1),
        "audio": round(a_score, 1),
        "visual": round(v_score, 1),
        "completeness": round(c_score, 1),
    }


def predict_retention_heuristics(
    full_clip_text: str,
    duration: float
) -> Dict[str, Any]:
    """
    Estimates short-form retention potential from opening 3s hook,
    contrast pivots in body, and closing payoff completeness.
    """
    words = full_clip_text.split()
    if not words:
        return {"retention_score": 85, "reason": "Balanced conversational pacing"}

    first_words = " ".join(words[:9]).lower()
    last_words = " ".join(words[-9:]).lower()

    curiosity_hook = any(
        q in first_words
        for q in ['kyu', 'kya', 'kaise', 'why', 'how', 'never', 'secret', 'galti', '99%', 'stop', 'truth', 'imagine']
    ) or '?' in " ".join(words[:12])
    contrast_pivot = any(p in full_clip_text.lower() for p in CONTRAST_PIVOTS)
    payoff = any(p in last_words for p in PAYOFF_MARKERS)
    has_closure = full_clip_text.strip().endswith(('.', '!', '?', '|'))

    retention = 76
    reasons = []

    if curiosity_hook:
        retention += 10
        reasons.append("Strong 3-second curiosity hook")
    else:
        reasons.append("Clean standalone cold-open")

    if contrast_pivot:
        retention += 5
        reasons.append("Pattern-interrupt twist mid-clip")

    if payoff or has_closure:
        retention += 6
        reasons.append("Sharp closing payoff & thought resolution")

    if 28.0 <= duration <= 60.0:
        retention += 4
        reasons.append("Optimal short-form attention window")

    return {
        "retention_score": min(99, max(75, retention)),
        "reason": " | ".join(reasons),
    }


def compute_text_similarity(text_a: str, text_b: str) -> float:
    """Computes word-level Jaccard similarity to prevent duplicate topic clips."""
    words_a = set(re.findall(r'\b[a-zA-Z0-9]{3,}\b', text_a.lower()))
    words_b = set(re.findall(r'\b[a-zA-Z0-9]{3,}\b', text_b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def _build_viral_gemini_prompt(
    video_title: str,
    total_duration: float,
    act_index: int,
    total_acts: int,
    act_cap: int,
    min_dur: float,
    max_dur: float,
    intro_cutoff: float,
    transcript_chunk_text: str,
) -> str:
    act_note = (
        f"Segment Scope: Timeline Act {act_index + 1} of {total_acts}."
        if total_acts > 1
        else "Segment Scope: Full video timeline start to finish."
    )
    return f"""
You are an elite viral YouTube Shorts, Instagram Reels & TikTok director.
Your job is to extract EVERY genuinely engaging, high-retention STANDALONE VIRAL CLIP from this transcript.

CRITICAL ENGAGEMENT-BASED COUNT RULE:
- There is NO fixed or mandatory number of clips to return.
- Clip count MUST be decided purely by how many genuinely engaging moments exist in this video (up to {act_cap} in this section).
- Return ONLY clips where a cold viewer would genuinely stop scrolling, engage emotionally/intellectually, and watch through to the payoff (virality score >= 80).
- NEVER pad weak filler, mundane transitions, or repetitive points just to reach a higher count.

Video Title: "{video_title}"
Full Video Duration: {total_duration:.1f}s ({total_duration/60:.1f} min)
{act_note}
Strict Clip Duration Window: {min_dur:.0f}s to {max_dur:.0f}s per clip.

TIMESTAMPED SENTENCE TRANSCRIPT (Format: [sentence_id] (start_s-end_s) text):
---
{transcript_chunk_text}
---

NON-NEGOTIABLE VIRAL SELECTION RULES:
1. ATOMIC SENTENCE BOUNDARIES (NO MID-SENTENCE CUTS):
   - You MUST provide exact `start_sentence_id` AND `end_sentence_id` integers from `[id]` above, plus `start` and `end` floats.
   - NEVER start mid-thought with vague words ("So he did...", "And that's why..."). Every clip must make 100% sense to a cold viewer.
2. FIRST-3-SECOND SCROLL-STOPPING HOOK:
   - Choose clips that open with a bold contrarian claim, shocking reveal, gripping dilemma, funny setup, specific stat, or sharp question.
3. STRONG CLOSING PAYOFF:
   - End on a punchline, actionable rule, surprising twist, or lingering tension (`ending_type`: "punchline", "takeaway", or "cliffhanger").
4. NON-OVERLAPPING DIVERSITY:
   - Distribute clips cleanly across the entire segment; never overlap timestamps or repeat the same talking point.
   - Skip generic channel intros/sponsors in the first {intro_cutoff:.0f}s unless critical.
5. CREATOR-READY TITLES & HOOKS:
   - `title`: Punchy Roman Hinglish / English title (3-6 words, curiosity-driven, zero clickbait fluff).
   - `hook_title`: Ultra-short 2-4 word cold-open banner headline.
   - `category`: One of "Hook", "Story", "Insight", "Debate", "Humor", "Strategy", "Mindset".

Return ONLY valid JSON:
{{
  "clips": [
    {{
      "title": "Why 99% Fail Under Pressure",
      "hook_title": "THE 99% TRAP",
      "start_sentence_id": 42,
      "end_sentence_id": 54,
      "start": 124.2,
      "end": 171.8,
      "score": 96,
      "retention_score": 95,
      "category": "Mindset",
      "ending_type": "takeaway",
      "hook": "Exact spoken opening hook from the first sentence",
      "reason": "Opens with stark 99% pattern interrupt, builds tension, closes on memorable principle."
    }}
  ]
}}
"""


def analyze_highlights_with_gemini(
    transcript_segments: List[Dict[str, Any]],
    video_title: str,
    total_duration: float,
    api_key: str,
    target_count: int = 0,
    duration_preference: str = '30-60',
    clipping_mode: str = 'viral_highlights',
    progress_callback = None
) -> List[Dict[str, Any]]:
    """
    Engagement-driven Gemini Viral Highlights Director with automatic NLP fallback:
    - Automatically determines clip count strictly from genuinely high-engagement viral moments,
    - Scans the ENTIRE timeline across parallel chunks for long videos (1-3+ hours),
    - Snaps boundaries atomically to indexed sentence IDs (-0.08s / +0.25s acoustic cushions).
    """
    min_dur, max_dur = get_duration_range(duration_preference)
    # Upper sanity ceiling proportional to video length (~1 max per 65s, up to 35);
    # actual returned count depends strictly on how many high-engagement moments exist.
    max_cap = max(4, min(35, int(total_duration / 65.0))) if total_duration > 0 else 15
    intro_cutoff = 15.0 if total_duration > 180.0 else 0.0

    if not api_key or not transcript_segments:
        if progress_callback:
            progress_callback(80, "AI analyzing viral hooks with contextual NLP engine...")
        return extract_smart_nlp_highlights(
            transcript_segments, total_duration, video_title, max_cap, min_dur, max_dur, intro_cutoff
        )

    if progress_callback:
        progress_callback(78, "Structuring dialogue into indexed viral sentences...")

    sentence_map: Dict[int, Dict[str, Any]] = {}
    formatted_lines: List[str] = []
    for idx_seg, s in enumerate(transcript_segments):
        s_id = s.get('id') if s.get('id') is not None else idx_seg
        s_start = float(s.get('start', 0.0))
        s_end = float(s.get('end', s_start + 2.0))
        txt = s.get('text', '').strip()
        if not txt:
            continue
        sentence_map[int(s_id)] = s
        formatted_lines.append(f"[{int(s_id)}] ({s_start:.2f}s-{s_end:.2f}s) {txt}")

    if not formatted_lines:
        return extract_smart_nlp_highlights(
            transcript_segments, total_duration, video_title, max_cap, min_dur, max_dur, intro_cutoff
        )

    # Split long transcripts into up to 4 parallel timeline acts so 1-3 hour videos are scanned end-to-end
    max_lines_per_act = 1400
    total_lines = len(formatted_lines)
    num_acts = min(4, max(1, math.ceil(total_lines / max_lines_per_act)))
    act_size = math.ceil(total_lines / num_acts)
    acts: List[tuple] = []
    for a_i in range(num_acts):
        chunk = formatted_lines[a_i * act_size : (a_i + 1) * act_size]
        if chunk:
            per_act_cap = max(6, math.ceil(max_cap / num_acts) + 2)
            acts.append((a_i, per_act_cap, "\n".join(chunk)))

    if progress_callback:
        scan_desc = f"{num_acts} timeline acts in parallel" if num_acts > 1 else "full timeline"
        progress_callback(80, f"Scanning {scan_desc} with Gemini Viral AI...")

    model_candidates = [
        'gemini-2.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-pro-latest',
    ]

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        def _scan_act(act_tuple):
            act_idx, act_cap, chunk_text = act_tuple
            prompt = _build_viral_gemini_prompt(
                video_title=video_title,
                total_duration=total_duration,
                act_index=act_idx,
                total_acts=len(acts),
                act_cap=act_cap,
                min_dur=min_dur,
                max_dur=max_dur,
                intro_cutoff=intro_cutoff if act_idx == 0 else 0.0,
                transcript_chunk_text=chunk_text,
            )
            for m in model_candidates:
                try:
                    resp = client.models.generate_content(
                        model=m,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.25,
                            max_output_tokens=8192,
                        ),
                    )
                    if resp and resp.text:
                        parsed = json.loads(resp.text)
                        raw_clips = parsed.get('clips', [])
                        if raw_clips:
                            return raw_clips
                except Exception as model_err:
                    print(f"[ai_analyzer] Act {act_idx + 1} / {m} note: {model_err}")
                    continue
            return []

        all_raw_clips: List[Dict[str, Any]] = []
        if len(acts) == 1:
            all_raw_clips = _scan_act(acts[0])
        else:
            with ThreadPoolExecutor(max_workers=len(acts)) as pool:
                futures = [pool.submit(_scan_act, act) for act in acts]
                for fut in as_completed(futures):
                    try:
                        all_raw_clips.extend(fut.result() or [])
                    except Exception as act_err:
                        print(f"[ai_analyzer] Act scan notice: {act_err}")

        if all_raw_clips:
            if progress_callback:
                progress_callback(85, f"AI found {len(all_raw_clips)} viral candidates. Snapping boundaries...")

            valid_clips: List[Dict[str, Any]] = []
            used_ranges: List[tuple] = []
            used_texts: List[str] = []

            # Pre-sort candidates by reported viral score before overlap deduplication
            all_raw_clips.sort(key=lambda x: int(x.get('score', 85)), reverse=True)

            for c in all_raw_clips:
                st_id = c.get('start_sentence_id')
                et_id = c.get('end_sentence_id')
                clip_transcript_slice = ""

                if st_id is not None and et_id is not None and int(st_id) in sentence_map and int(et_id) in sentence_map:
                    sid_a, sid_b = sorted((int(st_id), int(et_id)))
                    first_sent = sentence_map[sid_a]
                    last_sent = sentence_map[sid_b]
                    s_time = max(0.0, float(first_sent.get('start', 0.0)) - 0.08)
                    e_time = min(total_duration if total_duration > 0 else 99999.0, float(last_sent.get('end', 0.0)) + 0.25)
                    clip_transcript_slice = " ".join(
                        sentence_map[k].get('text', '')
                        for k in range(sid_a, sid_b + 1)
                        if k in sentence_map
                    )
                else:
                    s_time = max(0.0, float(c.get('start', 0.0)))
                    e_time = min(total_duration if total_duration > 0 else 99999.0, float(c.get('end', s_time + min_dur)))

                if s_time < intro_cutoff and total_duration > 180.0:
                    continue

                clip_len = e_time - s_time
                if clip_len < max(15.0, min_dur * 0.72) or clip_len > (max_dur + 22.0):
                    continue

                # Strict 5.0s buffer prevents overlapping duplicate Shorts
                is_overlap = any(not (e_time < r[0] - 5.0 or s_time > r[1] + 5.0) for r in used_ranges)
                if is_overlap:
                    continue

                title = str(c.get('title', 'Viral Highlight')).strip()[:60]
                hook = str(c.get('hook', '')).strip()
                topic_basis = clip_transcript_slice or f"{title} {hook}"
                raw_score = min(99, max(70, int(c.get('score', 86))))

                # Only keep genuinely engaging moments (strict quality bar >= 80 once we have at least 2)
                if raw_score < 80 and len(valid_clips) >= 2:
                    continue

                if any(compute_text_similarity(topic_basis, ut) > 0.40 for ut in used_texts):
                    continue

                retention_info = predict_retention_heuristics(topic_basis, clip_len)
                ending_type = str(c.get('ending_type', 'punchline')).lower().strip()
                if ending_type not in ('punchline', 'takeaway', 'cliffhanger'):
                    ending_type = 'punchline'

                hook_title = str(c.get('hook_title') or title).strip()[:50]

                valid_clips.append({
                    "title": title,
                    "start": round(s_time, 2),
                    "end": round(e_time, 2),
                    "duration": round(clip_len, 2),
                    "score": raw_score,
                    "category": str(c.get('category', 'Highlight')).strip() or 'Highlight',
                    "hook": hook or (topic_basis[:110] + ("..." if len(topic_basis) > 110 else "")),
                    "ending_type": ending_type,
                    "hook_title": hook_title,
                    "reason": c.get('reason') or retention_info['reason'],
                    "retention_score": c.get('retention_score', retention_info['retention_score']),
                })
                used_ranges.append((s_time, e_time))
                used_texts.append(topic_basis)

            if len(valid_clips) >= 1:
                valid_clips.sort(key=lambda x: x['score'], reverse=True)
                return valid_clips[:max_cap]

    except Exception as e:
        print(f"[analyze_highlights_with_gemini] API Note: {e}")

    return extract_smart_nlp_highlights(
        transcript_segments, total_duration, video_title, max_cap, min_dur, max_dur, intro_cutoff
    )


def _snap_clean_start_idx(segments: List[Dict[str, Any]], idx: int, intro_cutoff: float) -> int:
    """
    Walks back up to 3 sentences (<= 8s) if `segments[idx]` begins mid-thought
    with a conjunction/pronoun so standalone Shorts never open mid-sentence.
    """
    cur = idx
    base_start = float(segments[idx].get('start', 0.0))
    steps = 0
    while cur > 0 and steps < 3:
        cur_txt = segments[cur].get('text', '').strip().lower()
        prev_seg = segments[cur - 1]
        prev_txt = prev_seg.get('text', '').strip()
        prev_start = float(prev_seg.get('start', 0.0))
        cur_start = float(segments[cur].get('start', 0.0))
        pause_gap = cur_start - float(prev_seg.get('end', cur_start))

        if prev_start < intro_cutoff:
            break
        if (base_start - prev_start) > 8.5:
            break

        starts_mid_clause = any(cur_txt.startswith(c) for c in MID_THOUGHT_CONTINUATIONS) or (
            len(cur_txt) > 0 and cur_txt[0].islower()
        )
        prev_was_incomplete = bool(prev_txt) and not prev_txt.endswith(('.', '!', '?', '|')) and pause_gap < 0.70

        if starts_mid_clause or prev_was_incomplete:
            cur -= 1
            steps += 1
        else:
            break
    return cur


def _classify_nlp_category(text: str) -> str:
    low = text.lower()
    if any(k in low for k in ['funny', 'laugh', 'hasna', 'joke', 'comedy', 'hilarious']):
        return 'Humor'
    if any(k in low for k in ['strategy', 'formula', 'hack', 'step', 'rule', 'method', 'system']):
        return 'Strategy'
    if any(k in low for k in ['mistake', 'galti', 'truth', 'secret', '99%', 'reality', 'actually']):
        return 'Insight'
    if any(k in low for k in ['story', 'kahani', 'incident', 'jab maine', 'once', 'survived']):
        return 'Story'
    return 'Mindset'


def extract_smart_nlp_highlights(
    transcript_segments: List[Dict[str, Any]],
    total_duration: float,
    video_title: str,
    count: int = 7,
    min_dur: float = 30.0,
    max_dur: float = 60.0,
    intro_cutoff: float = 25.0,
    clipping_mode: str = 'viral_highlights'
) -> List[Dict[str, Any]]:
    """
    Context-aware Viral Highlights semantic NLP engine:
    1. Builds multi-sentence viral windows with clean thought-start snapping & pause/punctuation ends.
    2. Scores full candidate windows (Hook + Contrast Pivot + Novelty + Cadence + Payoff Closure).
    3. Guarantees full-timeline chronological spread via epoch interleaving + Jaccard topic diversity.
    """
    if not transcript_segments:
        return generate_heuristic_highlights(transcript_segments, total_duration, video_title, count, min_dur, max_dur, intro_cutoff)

    total_segs = len(transcript_segments)
    scored_windows: List[Dict[str, Any]] = []
    seen_start_indices = set()

    for i, seg in enumerate(transcript_segments):
        raw_start = float(seg.get('start', 0.0))
        if raw_start < intro_cutoff and total_duration > 180.0:
            continue

        text = seg.get('text', '').strip()
        if not text or len(text.split()) < 3:
            continue

        # Pre-filter quickly by sentence hook/density score before expanding full window
        seed_dur = max(0.5, float(seg.get('end', raw_start + 2.0)) - raw_start)
        seed_scores = calculate_segment_scores(text, seed_dur, has_face=True)
        if seed_scores['composite'] < 66.0:
            continue

        snap_idx = _snap_clean_start_idx(transcript_segments, i, intro_cutoff if total_duration > 180.0 else 0.0)
        if snap_idx in seen_start_indices:
            continue
        seen_start_indices.add(snap_idx)

        clip_start = float(transcript_segments[snap_idx].get('start', raw_start))
        best_end = clip_start
        best_words: List[str] = []
        best_window_score = -1.0

        cur_words: List[str] = []
        for j in range(snap_idx, min(total_segs, snap_idx + 50)):
            s = transcript_segments[j]
            s_txt = s.get('text', '').strip()
            if s_txt:
                cur_words.append(s_txt)
            cur_end = float(s.get('end', clip_start + 3.0))
            cur_len = cur_end - clip_start

            if cur_len >= min_dur:
                window_text = " ".join(cur_words)
                win_scores = calculate_segment_scores(window_text, cur_len, has_face=True)

                next_gap = 0.0
                if j + 1 < total_segs:
                    next_start = float(transcript_segments[j + 1].get('start', cur_end))
                    next_gap = max(0.0, next_start - cur_end)

                punctuation_bonus = 6.0 if s_txt.endswith(('.', '!', '?', '|')) else 0.0
                pause_bonus = 4.0 if next_gap >= 0.45 else 0.0
                rank_val = win_scores['composite'] + punctuation_bonus + pause_bonus

                if rank_val > best_window_score:
                    best_window_score = rank_val
                    best_end = cur_end + min(0.25, next_gap * 0.5)
                    best_words = list(cur_words)

                if cur_len >= max_dur or (s_txt.endswith(('.', '!', '?', '|')) and cur_len >= (min_dur + max_dur) * 0.45):
                    if not (s_txt.split()[-1].lower().strip(',.') in WEAK_END_WORDS if s_txt.split() else False):
                        break

        actual_len = round(best_end - clip_start, 1)
        if actual_len < min_dur * 0.85 or not best_words:
            continue

        full_text = " ".join(best_words)
        win_breakdown = calculate_segment_scores(full_text, actual_len, has_face=True)

        scored_windows.append({
            'start': clip_start,
            'end': best_end,
            'duration': actual_len,
            'score': min(99, max(76, int(round(win_breakdown['composite'])))),
            'breakdown': win_breakdown,
            'text': full_text,
        })

    if not scored_windows:
        return generate_heuristic_highlights(transcript_segments, total_duration, video_title, count, min_dur, max_dur, intro_cutoff)

    scored_windows.sort(key=lambda x: x['score'], reverse=True)

    # Interleave across chronological epochs so clips cover beginning, middle, and climax cleanly
    timeline_start = intro_cutoff if total_duration > 180.0 else 0.0
    timeline_end = max(timeline_start + 60.0, total_duration)
    num_epochs = max(2, min(count, 6))
    epoch_duration = (timeline_end - timeline_start) / num_epochs
    epoch_buckets: List[List[Dict[str, Any]]] = [[] for _ in range(num_epochs)]

    for cand in scored_windows:
        e_idx = min(num_epochs - 1, max(0, int((cand['start'] - timeline_start) / epoch_duration)))
        epoch_buckets[e_idx].append(cand)

    interleaved: List[Dict[str, Any]] = []
    ptrs = [0] * num_epochs
    max_bucket = max((len(b) for b in epoch_buckets), default=0)
    for _ in range(max_bucket):
        for e in range(num_epochs):
            if ptrs[e] < len(epoch_buckets[e]):
                interleaved.append(epoch_buckets[e][ptrs[e]])
                ptrs[e] += 1

    candidate_queue = interleaved if interleaved else scored_windows
    MIN_ENGAGING_SCORE = 78
    engaging_clips: List[Dict[str, Any]] = []
    backup_clips: List[Dict[str, Any]] = []
    used_ranges: List[tuple] = []
    selected_texts: List[str] = []

    for cand in candidate_queue:
        if len(engaging_clips) >= count:
            break

        c_start = max(0.0, cand['start'] - 0.08)
        c_end = min(total_duration if total_duration > 0 else cand['end'], cand['end'])
        if any(not (c_end < r[0] - 5.0 or c_start > r[1] + 5.0) for r in used_ranges):
            continue

        full_text = cand['text']
        if any(compute_text_similarity(full_text, st) > 0.35 for st in selected_texts):
            continue

        opening_hook = " ".join(full_text.split()[:14]) + ("..." if len(full_text.split()) > 14 else "")
        title_words = [re.sub(r'^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$', '', w) for w in full_text.split() if len(w) > 3][:6]
        title_words = [w for w in title_words if w]
        title = (" ".join(title_words).title() if title_words else f"Viral Highlight #{len(engaging_clips) + len(backup_clips) + 1}")[:48]
        hook_title = " ".join(title.split()[:4]).upper()

        retention_info = predict_retention_heuristics(full_text, cand['duration'])
        category = _classify_nlp_category(full_text)
        ending_type = "takeaway" if any(p in full_text.lower()[-80:] for p in PAYOFF_MARKERS) else "punchline"

        item = {
            "title": title,
            "start": round(c_start, 2),
            "end": round(c_end, 2),
            "duration": round(c_end - c_start, 1),
            "score": cand['score'],
            "category": category,
            "hook": opening_hook,
            "ending_type": ending_type,
            "hook_title": hook_title or title,
            "reason": retention_info['reason'],
            "retention_score": retention_info['retention_score'],
            "breakdown": cand['breakdown'],
        }

        if cand['score'] >= MIN_ENGAGING_SCORE and retention_info['retention_score'] >= 80:
            engaging_clips.append(item)
            used_ranges.append((c_start, c_end))
            selected_texts.append(full_text)
        elif len(backup_clips) < 3:
            backup_clips.append(item)
            used_ranges.append((c_start, c_end))
            selected_texts.append(full_text)

    if engaging_clips:
        # Return strictly the genuinely engaging viral clips found (never padded with filler!)
        engaging_clips.sort(key=lambda x: x['score'], reverse=True)
        return engaging_clips

    if backup_clips:
        backup_clips.sort(key=lambda x: x['score'], reverse=True)
        return backup_clips

    return generate_heuristic_highlights(transcript_segments, total_duration, video_title, min(4, count), min_dur, max_dur, intro_cutoff)


def generate_heuristic_highlights(
    transcript_segments: List[Dict[str, Any]],
    total_duration: float,
    video_title: str,
    count: int = 7,
    min_dur: float = 30.0,
    max_dur: float = 60.0,
    intro_cutoff: float = 25.0
) -> List[Dict[str, Any]]:
    """
    Distributed fallback algorithm when no usable dialogue transcript exists.
    """
    target_len = (min_dur + max_dur) / 2.0
    start_base = intro_cutoff if total_duration > 180.0 else 0.0
    effective_dur = max(target_len * count, total_duration - start_base)

    titles_pool = [
        ("Key Turning Point", "Mindset", "Notice what shifts right when pressure hits peak levels...", "Peak energy inflection point across timeline"),
        ("Why 99% Miss This Rule", "Insight", "Most beginners overlook this exact detail until it costs them...", "Strong pattern-interrupt framing"),
        ("High Stakes Breakdown", "Strategy", "Look closely at the decision process right before the move...", "Step-by-step tactical breakdown"),
        ("Calm Under Fire", "Mindset", "How composed leaders process pressure in real time...", "High emotional contrast & clarity"),
        ("The Defining Moment", "Story", "One single choice changes the direction of the entire story...", "Complete standalone narrative arc"),
        ("Consistency Compounded", "Mindset", "Daily discipline compounds quietly until the gap becomes huge...", "Actionable punchline takeaway"),
        ("Calculated Risk Truth", "Strategy", "Smart execution comes down to preparing for the unseen factor...", "Counter-intuitive insight"),
        ("Laser Focus Framework", "Strategy", "Cut the noise down to one clear priority and execute...", "Direct actionable instruction"),
    ]

    results = []
    step = effective_dur / (count + 1)
    for i in range(count):
        s_time = round(start_base + step * (i + 0.5), 1)
        e_time = round(min(total_duration if total_duration > 0 else s_time + target_len, s_time + target_len), 1)
        t_title, t_cat, t_hook, t_reason = titles_pool[i % len(titles_pool)]
        results.append({
            "title": t_title,
            "start": s_time,
            "end": e_time,
            "duration": round(max(5.0, e_time - s_time), 1),
            "score": max(78, 96 - (i * 2)),
            "category": t_cat,
            "hook": t_hook,
            "ending_type": "punchline",
            "hook_title": t_title.upper(),
            "reason": t_reason,
            "retention_score": 89 + ((i * 3) % 8),
        })

    return results
