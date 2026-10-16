import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PublicApp } from './PublicApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PublicApp />
    </ErrorBoundary>
  </StrictMode>
)
