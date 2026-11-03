import os
import subprocess
from django.core.management.base import BaseCommand
from django.conf import settings
from api.models import VideoProject, VideoClip
from api.services.editor import render_shorts_clip

class Command(BaseCommand):
    help = "Seed demo video project matching the user reference screenshot"

    def handle(self, *args, **options):
        self.stdout.write("Generating demo video file...")

        media_videos = os.path.join(settings.MEDIA_ROOT, 'videos')
        media_audio = os.path.join(settings.MEDIA_ROOT, 'audio')
        os.makedirs(media_videos, exist_ok=True)
        os.makedirs(media_audio, exist_ok=True)

        video_filename = "demo_mrbeast_podcast.mp4"
        audio_filename = "demo_mrbeast_podcast.mp3"
        video_path = os.path.join(media_videos, video_filename)
        audio_path = os.path.join(media_audio, audio_filename)

        # Generate 45-second high quality demo video if not already exists
        if not os.path.exists(video_path):
            cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'testsrc=duration=45:size=1920x1080:rate=30',
                '-f', 'lavfi', '-i', 'sine=frequency=520:duration=45',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k',
                video_path
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # Generate audio MP3
        if not os.path.exists(audio_path):
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k',
                audio_path
            ]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # Create or update project
        project, created = VideoProject.objects.get_or_create(
            title="MrBeast Podcast: O Segredo de 100 Vídeos",
            defaults={
                'source_type': 'youtube',
                'youtube_url': 'https://www.youtube.com/watch?v=MrBeast100VideosDemo',
                'duration': 45.0,
                'width': 1920,
                'height': 1080,
                'fps': 30.0,
                'status': 'ready',
                'progress': 100,
                'status_message': 'Complete! Generated 3 viral clips.'
            }
        )
        project.video_file.name = f"videos/{video_filename}"
        project.audio_file.name = f"audio/{audio_filename}"

        # Transcript data matching user's uploaded screenshot
        project.transcript_raw = [
            {
                "id": 0,
                "start": 0.0,
                "end": 8.0,
                "text": "olhou muito o que o mrbeast falava e toda vez que perguntavam chegava alguém perguntando um hackzinho pro mrbeast ah o que que dá certo",
                "words": [
                    {"word": "olhou", "start": 0.0, "end": 0.5},
                    {"word": "muito", "start": 0.5, "end": 0.9},
                    {"word": "o", "start": 0.9, "end": 1.1},
                    {"word": "que", "start": 1.1, "end": 1.3},
                    {"word": "o", "start": 1.3, "end": 1.5},
                    {"word": "mrbeast", "start": 1.5, "end": 2.1},
                    {"word": "falava", "start": 2.1, "end": 2.7},
                    {"word": "e", "start": 2.7, "end": 2.9},
                    {"word": "toda", "start": 2.9, "end": 3.3},
                    {"word": "vez", "start": 3.3, "end": 3.6},
                    {"word": "que", "start": 3.6, "end": 3.8},
                    {"word": "perguntavam", "start": 3.8, "end": 4.5},
                    {"word": "chegava", "start": 4.5, "end": 5.1},
                    {"word": "alguém", "start": 5.1, "end": 5.6},
                    {"word": "perguntando", "start": 5.6, "end": 6.3},
                    {"word": "um", "start": 6.3, "end": 6.5},
                    {"word": "hackzinho", "start": 6.5, "end": 7.2},
                    {"word": "pro", "start": 7.2, "end": 7.5},
                    {"word": "mrbeast", "start": 7.5, "end": 8.0}
                ]
            },
            {
                "id": 1,
                "start": 8.0,
                "end": 18.0,
                "text": "dá de conselho e tal ele falava cara faz 100 vídeos posta no youtube volta pra mim e fala o que aconteceu e aí essas pessoas não voltavam",
                "words": [
                    {"word": "dá", "start": 8.0, "end": 8.3},
                    {"word": "de", "start": 8.3, "end": 8.5},
                    {"word": "conselho", "start": 8.5, "end": 9.1},
                    {"word": "e", "start": 9.1, "end": 9.3},
                    {"word": "tal", "start": 9.3, "end": 9.6},
                    {"word": "ele", "start": 9.6, "end": 9.9},
                    {"word": "falava", "start": 9.9, "end": 10.4},
                    {"word": "cara", "start": 10.4, "end": 10.8},
                    {"word": "faz", "start": 10.8, "end": 11.2},
                    {"word": "100", "start": 11.2, "end": 11.7},
                    {"word": "vídeos", "start": 11.7, "end": 12.3},
                    {"word": "posta", "start": 12.3, "end": 12.8},
                    {"word": "no", "start": 12.8, "end": 13.0},
                    {"word": "youtube", "start": 13.0, "end": 13.6},
                    {"word": "volta", "start": 13.6, "end": 14.1},
                    {"word": "pra", "start": 14.1, "end": 14.4},
                    {"word": "mim", "start": 14.4, "end": 14.8},
                    {"word": "e", "start": 14.8, "end": 15.0},
                    {"word": "fala", "start": 15.0, "end": 15.4},
                    {"word": "o", "start": 15.4, "end": 15.6},
                    {"word": "que", "start": 15.6, "end": 15.8},
                    {"word": "aconteceu", "start": 15.8, "end": 16.5}
                ]
            },
            {
                "id": 2,
                "start": 18.0,
                "end": 28.0,
                "text": "falar com o mrbeast por quê porque estava todo mundo querendo encontrar hackzinho encontrar um jeitinho nossa sensacional pegar uma",
                "words": [
                    {"word": "falar", "start": 18.0, "end": 18.5},
                    {"word": "com", "start": 18.5, "end": 18.8},
                    {"word": "o", "start": 18.8, "end": 19.0},
                    {"word": "mrbeast", "start": 19.0, "end": 19.6},
                    {"word": "por", "start": 19.6, "end": 19.9},
                    {"word": "quê", "start": 19.9, "end": 20.3},
                    {"word": "porque", "start": 20.3, "end": 20.8},
                    {"word": "estava", "start": 20.8, "end": 21.3},
                    {"word": "todo", "start": 21.3, "end": 21.7},
                    {"word": "mundo", "start": 21.7, "end": 22.2},
                    {"word": "querendo", "start": 22.2, "end": 22.8},
                    {"word": "encontrar", "start": 22.8, "end": 23.5},
                    {"word": "hackzinho", "start": 23.5, "end": 24.3},
                    {"word": "encontrar", "start": 24.3, "end": 25.0},
                    {"word": "um", "start": 25.0, "end": 25.2},
                    {"word": "jeitinho", "start": 25.2, "end": 26.0}
                ]
            },
            {
                "id": 3,
                "start": 28.0,
                "end": 37.0,
                "text": "muletinha mas ninguém estava disposto a fazer 100 vídeos para se tornar o mrbeast sensacional para entender o que ele estava falando",
                "words": [
                    {"word": "muletinha", "start": 28.0, "end": 28.8},
                    {"word": "mas", "start": 28.8, "end": 29.1},
                    {"word": "ninguém", "start": 29.1, "end": 29.7},
                    {"word": "estava", "start": 29.7, "end": 30.2},
                    {"word": "disposto", "start": 30.2, "end": 30.8},
                    {"word": "a", "start": 30.8, "end": 31.0},
                    {"word": "fazer", "start": 31.0, "end": 31.5},
                    {"word": "100", "start": 31.5, "end": 32.0},
                    {"word": "vídeos", "start": 32.0, "end": 32.6}
                ]
            },
            {
                "id": 4,
                "start": 37.0,
                "end": 45.0,
                "text": "entenda o que precisa ser feito acontece as pessoas estão sempre procurando atalhos mas a consistência vence sempre",
                "words": [
                    {"word": "entenda", "start": 37.0, "end": 37.7},
                    {"word": "o", "start": 37.7, "end": 37.9},
                    {"word": "que", "start": 37.9, "end": 38.1},
                    {"word": "precisa", "start": 38.1, "end": 38.6},
                    {"word": "ser", "start": 38.6, "end": 38.9},
                    {"word": "feito", "start": 38.9, "end": 39.4},
                    {"word": "acontece", "start": 39.4, "end": 40.0},
                    {"word": "as", "start": 40.0, "end": 40.2},
                    {"word": "pessoas", "start": 40.2, "end": 40.8},
                    {"word": "estão", "start": 40.8, "end": 41.2},
                    {"word": "sempre", "start": 41.2, "end": 41.7}
                ]
            }
        ]
        project.save()

        # Clear old clips and re-create 3 viral clips
        project.clips.all().delete()

        clip1 = VideoClip.objects.create(
            project=project,
            title="O Segredo dos 100 Vídeos",
            start_time=0.0,
            end_time=18.0,
            duration=18.0,
            score=96,
            category="Mindset",
            hook="O conselho do MrBeast que ninguém quer ouvir...",
            reason="Abertura impactante que confronta a preguiça comum com alta retenção.",
            aspect_ratio="9:16",
            crop_mode="blur_fill",
            crop_x=43.0,
            crop_y=45.0,
            crop_zoom=1.0,
            caption_style={
                "font": "Montserrat",
                "textColor": "#FFFFFF",
                "highlightColor": "#bef264",
                "alignment": "center",
                "position": "bottom",
                "fontSize": 22,
                "showCaptions": True,
                "animation": "karaoke",
            }
        )

        clip2 = VideoClip.objects.create(
            project=project,
            title="Por Que Quase Ninguém Vence",
            start_time=18.0,
            end_time=36.0,
            duration=18.0,
            score=91,
            category="Insight",
            hook="Todo mundo quer um hackzinho rápido...",
            reason="Quebra de expectativa e gancho dramático perfeito para Shorts.",
            aspect_ratio="9:16",
            crop_mode="custom_crop",
            crop_x=50.0,
            crop_y=45.0,
            crop_zoom=1.1,
            caption_style={
                "font": "Montserrat",
                "textColor": "#FFFFFF",
                "highlightColor": "#bef264",
                "alignment": "center",
                "position": "bottom",
                "fontSize": 22,
                "showCaptions": True,
                "animation": "karaoke",
            }
        )

        clip3 = VideoClip.objects.create(
            project=project,
            title="A Lição Final: Entenda o Que Fazer",
            start_time=28.0,
            end_time=45.0,
            duration=17.0,
            score=88,
            category="Business",
            hook="Entenda exatamente o que precisa ser feito...",
            reason="Conclusão forte com chamado à ação e alta taxa de compartilhamento.",
            aspect_ratio="9:16",
            crop_mode="blur_fill",
            crop_x=43.0,
            crop_y=45.0,
            crop_zoom=1.0,
            caption_style={
                "font": "Montserrat",
                "textColor": "#FFFFFF",
                "highlightColor": "#bef264",
                "alignment": "center",
                "position": "bottom",
                "fontSize": 22,
                "showCaptions": True,
                "animation": "karaoke",
            }
        )

        self.stdout.write(self.style.SUCCESS(f"Successfully seeded demo project with {project.clips.count()} clips!"))
