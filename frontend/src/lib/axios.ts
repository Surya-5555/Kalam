import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  withCredentials: true, // Crucial for receiving and sending the HttpOnly refresh token cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach access token if we have it in memory or localStorage
api.interceptors.request.use(
  (config) => {
    // Note: In a real app, you might store the short-lived access token in memory
    // or Zustand/Redux rather than localStorage for better security.
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401s and automatically refresh the token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // The refresh token is in the HttpOnly cookie, so this request will send it automatically
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/refresh`, 
          {}, 
          { withCredentials: true }
        );

        const newAccessToken = data.accessToken;
        
        // Save the new access token
        localStorage.setItem('accessToken', newAccessToken);

        // Update the failed request with the new token and retry it
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token failed (expired or invalid). Require login again.
        localStorage.removeItem('accessToken');
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
