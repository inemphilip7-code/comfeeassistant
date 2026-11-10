import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthPage } from './components/AuthPage';
import { setupPWA } from './pwa';

setupPWA();

function Root() {
  const params = new URLSearchParams(window.location.search);
  const legacyAuthFlow =
    params.has('legacyAuth') || params.has('resetToken') || params.has('token');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/signup') return <AuthPage initialMode="register" />;
  if (!localStorage.getItem('comfee_auth_token') && !legacyAuthFlow && path === '/') {
    return <AuthPage />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
