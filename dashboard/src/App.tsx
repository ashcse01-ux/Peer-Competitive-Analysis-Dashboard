import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const GooglePlayPage = lazy(() => import('./pages/GooglePlayPage'))
const AppleStorePage = lazy(() => import('./pages/AppleStorePage'))
const GooglePage = lazy(() => import('./pages/GooglePage'))
const RedbusAnalysisPage = lazy(() => import('./pages/RedbusAnalysisPage'))

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="glass-panel m-6 p-6 text-sm text-theme-muted">Loading...</div>}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/google-play" element={<GooglePlayPage />} />
          <Route path="/apple-store" element={<AppleStorePage />} />
          <Route path="/google-reviews" element={<GooglePage />} />
          <Route path="/redbus" element={<RedbusAnalysisPage />} />
          {/* Legacy redirects */}
          <Route path="/app-store" element={<Navigate to="/google-play" replace />} />
          <Route path="/review-tags" element={<Navigate to="/redbus" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
