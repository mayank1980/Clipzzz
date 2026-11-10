from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    VideoProjectViewSet,
    VideoClipViewSet,
    validate_gemini_key,
    request_otp,
    verify_otp,
    get_current_user,
    save_gemini_key,
    upload_cookies,
    orbit_status,
    orbit_start,
)

router = DefaultRouter()
router.register(r'videos', VideoProjectViewSet, basename='video')
router.register(r'clips', VideoClipViewSet, basename='clip')

urlpatterns = [
    # Authentication & API Key encryption endpoints
    path('auth/request-otp/', request_otp, name='request_otp'),
    path('auth/verify-otp/', verify_otp, name='verify_otp'),
    path('auth/me/', get_current_user, name='get_current_user'),
    path('auth/save-key/', save_gemini_key, name='save_gemini_key'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    path('validate-key/', validate_gemini_key, name='validate_gemini_key'),
    path('settings/cookies/', upload_cookies, name='upload_cookies'),
    path('orbit/status/', orbit_status, name='orbit_status'),
    path('orbit/start/', orbit_start, name='orbit_start'),
    path('', include(router.urls)),
]
