import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { AdminApp } from './AdminApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </StrictMode>
)
