import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const api = axios.create({ baseURL: `${baseURL.replace(/\/$/, '')}/api/admin`, timeout: 20000, headers: { 'Content-Type': 'application/json' } });
export const serviceApi = axios.create({ baseURL: `${baseURL.replace(/\/$/, '')}/api`, timeout: 20000, headers: { 'Content-Type': 'application/json' } });
const attachAdminAuth = (client: typeof api) => {
client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('sancharieAdminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
client.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
    sessionStorage.removeItem('sancharieAdminToken');
    window.dispatchEvent(new CustomEvent('admin:session-expired'));
  }
  const message = error.response?.data?.message || 'Request failed. Please try again.';
  return Promise.reject(new Error(message));
});
};
attachAdminAuth(api);
attachAdminAuth(serviceApi);

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';
