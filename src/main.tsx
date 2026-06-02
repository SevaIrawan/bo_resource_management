import '@/lib/suppressDevConsoleNoise';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { initSupabaseConfig } from '@/lib/supabase';
import './index.css';

const rootEl = document.getElementById('root')!;

void initSupabaseConfig().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <LanguageProvider>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </LanguageProvider>
    </StrictMode>,
  );
});
