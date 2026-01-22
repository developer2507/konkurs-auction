import axios from 'axios';

const RAW_API_URL = import.meta.env.VITE_API_URL;
const API_URL = (RAW_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : ''))
  .replace(/\/+$/, ''); // remove trailing slashes

if (import.meta.env.PROD) {
  if (!RAW_API_URL) {
    // eslint-disable-next-line no-console
    console.error(
      '[config] VITE_API_URL is not set. Set it in Vercel Environment Variables to your backend origin, e.g. https://konkurs-auction.onrender.com'
    );
  } else if (RAW_API_URL.includes('/api')) {
    // eslint-disable-next-line no-console
    console.error(
      `[config] VITE_API_URL should be the backend ORIGIN without "/api". Current: ${RAW_API_URL}`
    );
  }
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Получить или установить userId
export const getUserId = (): string => {
  // В режиме разработки: если в localStorage есть валидный ObjectId, 
  // это может быть старый пользователь, поэтому генерируем новый ID
  // В production можно убрать эту проверку
  let userId = localStorage.getItem('userId');
  
  // Проверяем, не является ли сохраненный userId валидным ObjectId
  // (что означает, что это ID пользователя из БД, а не случайный идентификатор)
  // В режиме разработки всегда используем случайный идентификатор для нового пользователя
  if (userId && /^[0-9a-fA-F]{24}$/.test(userId)) {
    // Это валидный ObjectId - удаляем, чтобы создать нового пользователя
    localStorage.removeItem('userId');
    userId = null;
  }
  
  if (!userId) {
    userId = `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', userId);
  }
  return userId;
};

// Установить userId в заголовки
api.interceptors.request.use((config) => {
  const userId = getUserId();
  if (userId) {
    config.headers['X-User-Id'] = userId;
  }
  return config;
});

export default api;

