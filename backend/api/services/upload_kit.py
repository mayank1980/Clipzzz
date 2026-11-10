import re
from typing import Dict, Any

def extract_channel_credit(video_title: str) -> str:
    """
    Extracts clean channel name or speaker from title, ignoring hashtags.
    e.g. 'GURGAON FARM HOUSE MAUT KA KHEL | Ft. Sanyam Angi | Real Horror Incidents #evil'
    -> 'AkshayVashishtHorrorShow' or clean channel name without hashtags.
    """
    if not video_title:
        return "Original Creator"
    # Strip hashtags
    cleaned = re.sub(r'#\w+', '', video_title).strip()
    parts = [p.strip() for p in re.split(r'[|•\-_]', cleaned) if p.strip()]
    cand = parts[-1] if len(parts) >= 2 else (parts[0] if parts else "Original Creator")
    cand = re.sub(r'^(?:w\/|ft\.|featuring)\s*', '', cand, flags=re.I).strip()
    return cand if cand else "Original Creator"

def generate_shorts_upload_kit(clip) -> Dict[str, Any]:
    project = clip.project
    channel_credit = getattr(project, 'channel_name', '') or extract_channel_credit(project.title)
    video_url = project.youtube_url or "https://youtube.com"
    original_title = getattr(project, 'title', 'Original Video')

    # Part number handling
    part_prefix = f"Part {clip.part_number}: " if getattr(clip, 'part_number', None) else ""

    # 1. Title generation: natural dialogue hook + 1 relevant emoji + #Shorts
    clean_title = (clip.title or "").strip()
    clean_title = re.sub(r'^Part\s*\d+\s*:\s*', '', clean_title, flags=re.I).strip()
    
    category_low = f"{getattr(clip, 'category', '')} {original_title} {clean_title}".lower()
    if any(k in category_low for k in ['horror', 'bhoot', 'chudail', 'ghost', 'paranormal', 'darr', 'incident']):
        emoji = "😱"
    elif any(k in category_low for k in ['comedy', 'standup', 'roast', 'funny', 'joke', 'laughter']):
        emoji = "😂"
    elif any(k in category_low for k in ['crime', 'murder', 'police', 'investigation', 'case', 'incident']):
        emoji = "🚨"
    elif any(k in category_low for k in ['podcast', 'interview', 'talk', 'story', 'kahani']):
        emoji = "🎙️"
    else:
        emoji = "🔥"

    viral_title = f"{part_prefix}{clean_title} {emoji} #Shorts".strip()
    if len(viral_title) > 95:
        max_c = max(10, 95 - len(f"{part_prefix} {emoji} #Shorts"))
        viral_title = f"{part_prefix}{clean_title[:max_c]} {emoji} #Shorts"

    # 2. Spoken dialogue hook & context explanation
    spoken_dialogue = (clip.hook or clean_title).strip()
    if spoken_dialogue and not spoken_dialogue.startswith('"'):
        spoken_dialogue = f'"{spoken_dialogue}"'

    reason_context = (clip.reason or "Watch how this intense conversation unfolds.").strip()

    # 3. Clean professional description (NO weird emojis, NO hashtags inside, NO copyright disclaimer)
    clean_description = (
        f"{spoken_dialogue}\n\n"
        f"{reason_context}\n\n"
        f"Watch the full conversation for the complete context and story.\n\n"
        f"Original Video: {original_title}\n"
        f"Channel: {channel_credit}\n"
        f"Full Video Link: {video_url}"
    )

    # 4. 5-8 relevant hashtags in one copyable line (separate from description)
    hashtags = ["#Shorts"]
    if any(k in category_low for k in ['horror', 'bhoot', 'chudail', 'ghost', 'paranormal']):
        hashtags.extend(["#HorrorStory", "#HindiHorror", "#HorrorPodcast"])
    elif any(k in category_low for k in ['crime', 'murder', 'case']):
        hashtags.extend(["#TrueCrime", "#CrimeStory", "#CrimePodcast"])
    elif any(k in category_low for k in ['comedy', 'standup', 'funny']):
        hashtags.extend(["#StandupComedy", "#ComedyClips", "#HindiComedy"])
    else:
        hashtags.extend(["#PodcastClips", "#RealIncidents"])

    if any(k in category_low for k in ['podcast', 'interview', 'talk']):
        hashtags.append("#HindiPodcast")
    else:
        hashtags.append("#HindiStories")

    hashtags.append("#CLIPIT")
    # Strictly 5 to 8 hashtags
    hashtags = list(dict.fromkeys(hashtags))[:8]
    hashtags_str = " ".join(hashtags)

    # 5. Output format strictly matching user specification
    markdown_content = f"""# 🎬 YouTube Shorts Upload Package

## 📌 Suggested Video Title:
{viral_title}

---

## 📝 YouTube Shorts Description (Copy & Paste):
{clean_description}

---

## 🏷️ Hashtags (Separate – Copy & Paste):
{hashtags_str}
"""

    return {
        "clip_id": str(clip.id),
        "title": viral_title,
        "raw_title": clean_title,
        "hook": spoken_dialogue,
        "channel_credit": channel_credit,
        "video_url": video_url,
        "hashtags": hashtags,
        "hashtags_string": hashtags_str,
        "description": clean_description,
        "markdown": markdown_content.strip(),
    }


def generate_srt_subtitles(clip) -> str:
    """
    Generates standard SRT subtitles for dialogue within the clip bounds.
    """
    project = clip.project
    transcript = project.transcript_raw or []
    clip_start = clip.start_time
    clip_end = clip.end_time

    matching_segs = [
        s for s in transcript
        if s.get('end', 0) >= clip_start and s.get('start', 0) <= clip_end
    ]

    def sec_to_srt_time(sec: float) -> str:
        sec = max(0.0, sec)
        hrs = int(sec // 3600)
        rem = sec % 3600
        mins = int(rem // 60)
        secs = int(rem % 60)
        millis = int(round((sec - int(sec)) * 1000))
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

    srt_lines = []
    sub_idx = 1
    for seg in matching_segs:
        rel_start = max(0.0, seg['start'] - clip_start)
        rel_end = min(clip.duration, seg['end'] - clip_start)
        if rel_end > rel_start:
            srt_lines.append(str(sub_idx))
            srt_lines.append(f"{sec_to_srt_time(rel_start)} --> {sec_to_srt_time(rel_end)}")
            srt_lines.append(seg.get('text', ''))
            srt_lines.append("")
            sub_idx += 1

    return "\n".join(srt_lines)
