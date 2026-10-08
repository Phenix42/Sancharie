import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { BookingProvider } from './context/BookingContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './themes/August15Theme.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <BookingProvider>
        <App />
      </BookingProvider>
    </AuthProvider>
  </BrowserRouter>,
)

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Push notifications are unavailable:', error.message);
    });
  });
}
