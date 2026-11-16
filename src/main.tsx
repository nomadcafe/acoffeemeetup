import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nProvider } from './context/I18nContext'
import { initGoogleAnalytics } from './initGoogleAnalytics.ts'
import { getInitialLocale } from './i18n/detectLocale'
import { loadLocaleMessages } from './i18n/messages'

const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID
if (gaId) {
  initGoogleAnalytics(gaId)
}

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Fetch the visitor's catalogue before the first render. Rendering
// without it painted raw keys ("showcase.title") for a frame, then
// re-flowed the hero to real copy — a visible flash and ~0.16 CLS. The
// I18nProvider reads the now-warm cache synchronously. A failed chunk
// load still renders (keys beat a blank page).
loadLocaleMessages(getInitialLocale(window.location.pathname)).then(render, render)
