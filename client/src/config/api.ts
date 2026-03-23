import axios, { type AxiosRequestHeaders, type AxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  timeout: 30000, // 30 seconds timeout by default
  // Add retry logic
  validateStatus(status) {
    // Consider only 5xx responses as errors that should trigger retries
    return status >= 200 && status < 500;
  }
});

const REFRESH_ENDPOINT = '/auth/refresh-token';
let redirectingToLogin = false;
let refreshPromise: Promise<string | null> | null = null;

const PUBLIC_ENDPOINT_PREFIXES = ['/flights/search', '/flights/results'];

const isPublicEndpoint = (url?: string) => {
  if (!url) return false;
  return PUBLIC_ENDPOINT_PREFIXES.some(prefix => url.includes(prefix));
};

// Add session ID to requests for anonymous users
api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  const sessionId = localStorage.getItem('sessionId');

  // If we have a token, ensure it's fresh. If expired, try to refresh synchronously.
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const currentTime = Date.now() / 1000;
        if (payload.exp && payload.exp > currentTime) {
          config.headers = (config.headers ?? {}) as AxiosRequestHeaders;
          (config.headers as AxiosRequestHeaders).Authorization = `Bearer ${token}`;
          return config;
        }
      }

      // Token looks expired or invalid; attempt refresh if we have a refresh token
      // Skip refresh for public endpoints (avoid noisy refresh loops when user is browsing unauthenticated pages)
      if (refreshToken && !isPublicEndpoint(config.url)) {
        try {
          if (!refreshPromise) {
            const baseURL = import.meta.env.VITE_API_URL ?? '/api';
            refreshPromise = axios
              .post(`${baseURL}${REFRESH_ENDPOINT}`, { refreshToken })
              .then((refreshResp) => {
                if (refreshResp.data?.success && refreshResp.data.accessToken) {
                  localStorage.setItem('token', refreshResp.data.accessToken);
                  if (refreshResp.data.refreshToken) {
                    localStorage.setItem('refreshToken', refreshResp.data.refreshToken);
                  }
                  return String(refreshResp.data.accessToken);
                }
                return null;
              })
              .catch(() => null)
              .finally(() => {
                refreshPromise = null;
              });
          }

          const newAccessToken = await refreshPromise;
          if (newAccessToken) {
            config.headers = (config.headers ?? {}) as AxiosRequestHeaders;
            (config.headers as AxiosRequestHeaders).Authorization = `Bearer ${newAccessToken}`;
            return config;
          }
        } catch (refreshErr) {
          console.warn('Token refresh failed', refreshErr);
        }
      }

      // If we reach here, token is not usable
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      // allow request to proceed without Authorization header (server will return 401)
      return config;
    } catch (err) {
      // If any parsing error, clear tokens and continue
      localStorage.removeItem('token');
      return config;
    }
  }

  if (sessionId) {
    config.headers = (config.headers ?? {}) as AxiosRequestHeaders;
    (config.headers as AxiosRequestHeaders)['X-Session-ID'] = sessionId;
  }

  return config;
});

const redirectToLogin = () => {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

interface RetryableRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

// Handle token expiration responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig;

    // If error is 401 and we haven't tried refreshing yet
    if (error.response?.status === 401) {
      if (!originalRequest) {
        redirectToLogin();
        return Promise.reject(error);
      }

      if (originalRequest.url && originalRequest.url.includes(REFRESH_ENDPOINT)) {
        redirectToLogin();
        return Promise.reject(error);
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true;
        
        // Try to refresh the token
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken && !isPublicEndpoint(originalRequest.url)) {
          try {
            if (!refreshPromise) {
              const baseURL = import.meta.env.VITE_API_URL ?? '/api';
              refreshPromise = axios
                .post(`${baseURL}${REFRESH_ENDPOINT}`, { refreshToken })
                .then((refreshResp) => {
                  if (refreshResp.data?.success && refreshResp.data.accessToken) {
                    localStorage.setItem('token', refreshResp.data.accessToken);
                    if (refreshResp.data.refreshToken) {
                      localStorage.setItem('refreshToken', refreshResp.data.refreshToken);
                    }
                    return String(refreshResp.data.accessToken);
                  }
                  return null;
                })
                .catch(() => null)
                .finally(() => {
                  refreshPromise = null;
                });
            }

            const newAccessToken = await refreshPromise;
            if (newAccessToken) {
              originalRequest.headers = {
                ...(originalRequest.headers ?? {}),
                Authorization: `Bearer ${newAccessToken}`,
              };
              return axios(originalRequest);
            }
          } catch (refreshError: any) {
            if (refreshError?.response?.status === 401) {
              redirectToLogin();
              return Promise.reject(refreshError);
            }
            // Other errors: fall through to logout and reject
            redirectToLogin();
            return Promise.reject(refreshError);
          }
        }
        redirectToLogin();
        return Promise.reject(error);
      }
      redirectToLogin();
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);
 
export default api;
