import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 300000,
});

// Attach JWT access token to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('clipzzz_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh token if 401 Unauthorized
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('clipzzz_refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
            refresh: refreshToken,
          });
          const newAccess = res.data.access;
          localStorage.setItem('clipzzz_access_token', newAccess);
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return client(originalRequest);
        } catch (refreshErr) {
          // If refresh token expires after 30 days, clear
          console.warn('Session expired, please re-login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Authentication
  requestOtp: async (payload) => {
    const res = await client.post('/auth/request-otp/', payload);
    return res.data;
  },

  verifyOtp: async (payload) => {
    const res = await client.post('/auth/verify-otp/', payload);
    if (res.data.access) {
      localStorage.setItem('clipzzz_access_token', res.data.access);
      localStorage.setItem('clipzzz_refresh_token', res.data.refresh);
    }
    return res.data;
  },

  getCurrentUser: async () => {
    const res = await client.get('/auth/me/');
    return res.data;
  },

  saveGeminiKey: async (geminiKey) => {
    const res = await client.post('/auth/save-key/', { gemini_api_key: geminiKey });
    return res.data;
  },

  logout: () => {
    localStorage.removeItem('clipzzz_access_token');
    localStorage.removeItem('clipzzz_refresh_token');
  },

  // Video Projects
  listProjects: async () => {
    const res = await client.get('/videos/');
    return res.data;
  },

  getProject: async (id) => {
    const res = await client.get(`/videos/${id}/`);
    return res.data;
  },

  updateProject: async (id, data) => {
    const res = await client.patch(`/videos/${id}/`, data);
    return res.data;
  },

  getProjectStatus: async (id) => {
    const res = await client.get(`/videos/${id}/status/`);
    return res.data;
  },

  inspectUrl: async (payload) => {
    const res = await client.post('/videos/inspect-url/', payload);
    return res.data;
  },

  importVideo: async (payload, onProgress) => {
    const isFormData = payload instanceof FormData;
    const res = await client.post('/videos/import/', payload, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          const pct = Math.round((evt.loaded * 100) / evt.total);
          onProgress(pct);
        }
      },
    });
    return res.data;
  },

  deleteProject: async (id) => {
    const res = await client.delete(`/videos/${id}/`);
    return res.data;
  },

  // Clips
  deleteClip: async (clipId) => {
    const res = await client.delete(`/clips/${clipId}/`);
    return res.data;
  },

  updateClip: async (clipId, data) => {
    const res = await client.patch(`/clips/${clipId}/`, data);
    return res.data;
  },

  autoTrackClip: async (clipId) => {
    const res = await client.post(`/clips/${clipId}/auto_track/`);
    return res.data;
  },

  renderClip: async (clipId, settings = {}) => {
    const res = await client.post(`/clips/${clipId}/render/`, settings);
    return res.data;
  },

  renderCleanClip: async (clipId) => {
    const res = await client.post(`/clips/${clipId}/render_clean/`);
    return res.data;
  },

  getClipRenderStatus: async (clipId) => {
    const res = await client.get(`/clips/${clipId}/render_status/`);
    return res.data;
  },

  getClipDescription: async (clipId) => {
    const res = await client.get(`/clips/${clipId}/description/`);
    return res.data;
  },

  getClipDownloadUrl: (clipId) => {
    return `${API_BASE_URL}/api/clips/${clipId}/download/`;
  },

  getClipCleanDownloadUrl: (clipId) => {
    return `${API_BASE_URL}/api/clips/${clipId}/download_clean/`;
  },

  getClipDescriptionDownloadUrl: (clipId) => {
    return `${API_BASE_URL}/api/clips/${clipId}/download_description/`;
  },

  getClipBundleDownloadUrl: (clipId) => {
    return `${API_BASE_URL}/api/clips/${clipId}/bundle/`;
  },

  validateGeminiKey: async (key) => {
    const res = await client.post('/validate-key/', { gemini_api_key: key });
    return res.data;
  },

  uploadCookies: async (formData) => {
    const res = await client.post('/settings/cookies/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
