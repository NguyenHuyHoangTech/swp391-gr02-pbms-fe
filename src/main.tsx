import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { AppRouter } from './core/routes/AppRouter'
import { ErrorBoundary } from './core/errors/ErrorBoundary'
import { GoogleOAuthProvider } from '@react-oauth/google'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId="643517877685-3s06vf1g291nld9730fv5fun270mbneb.apps.googleusercontent.com">
        <QueryClientProvider client={queryClient}>
          <AppRouter />
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
