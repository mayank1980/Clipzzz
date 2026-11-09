from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import StreamingHttpResponse, Http404
import os
import re

def stream_video(request, path):
    """
    Production-ready video streamer supporting HTTP 206 Partial Content
    (Range requests) for smooth video scrubbing in modern browsers.
    """
    full_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise Http404("Media file not found")

    file_size = os.path.getsize(full_path)
    content_type = 'video/mp4'
    if path.endswith('.webm'):
        content_type = 'video/webm'
    elif path.endswith('.wav') or path.endswith('.mp3'):
        content_type = 'audio/mpeg'

    range_header = request.META.get('HTTP_RANGE', '').strip()
    range_match = re.match(r'bytes=(\d+)-(\d*)', range_header)

    if range_match:
        first_byte, last_byte = range_match.groups()
        first_byte = int(first_byte) if first_byte else 0
        last_byte = int(last_byte) if last_byte else file_size - 1
        if last_byte >= file_size:
            last_byte = file_size - 1
        length = last_byte - first_byte + 1

        def file_iterator(file_name, offset, length, chunk_size=65536):
            with open(file_name, 'rb') as f:
                f.seek(offset)
                remaining = length
                while remaining > 0:
                    read_size = min(chunk_size, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        response = StreamingHttpResponse(
            file_iterator(full_path, first_byte, length),
            status=206,
            content_type=content_type
        )
        response['Content-Length'] = str(length)
        response['Content-Range'] = f'bytes {first_byte}-{last_byte}/{file_size}'
        response['Accept-Ranges'] = 'bytes'
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response
    else:
        def full_iterator(file_name, chunk_size=65536):
            with open(file_name, 'rb') as f:
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data

        response = StreamingHttpResponse(
            full_iterator(full_path),
            content_type=content_type
        )
        response['Content-Length'] = str(file_size)
        response['Accept-Ranges'] = 'bytes'
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
        response['Access-Control-Allow-Headers'] = '*'
        return response

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    re_path(r'^media/(?P<path>.*)$', stream_video, name='stream_media'),
]
