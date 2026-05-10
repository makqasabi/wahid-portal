import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import i18n from './i18n';

// Ensure dir/lang matches i18n default on app load
document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = i18n.language;
import { bindTokenAccessors } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

// Wire in-memory token accessors so axios never touches localStorage
bindTokenAccessors(
  () => useAuthStore.getState().token,
  (token) => useAuthStore.setState({ token, isAuthenticated: !!token }),
);

// On page load, attempt silent refresh via httpOnly cookie (only if not on login page)
if (!window.location.pathname.startsWith('/login')) {
  useAuthStore.getState().refreshToken();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
