import React, { Suspense, lazy } from 'react'

import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const GooglePlayPage = lazy(() => import('./pages/GooglePlayPage'))
const AppleStorePage = lazy(() => import('./pages/AppleStorePage'))
const GooglePage = lazy(() => import('./pages/GooglePage'))
const RedbusLayout = lazy(() => import('./layouts/RedbusLayout'))
const RedbusMarketplacePage = lazy(() => import('./pages/RedbusMarketplacePage'))
const RedbusRoutesPage = lazy(() => import('./pages/RedbusRoutesPage'))
const RedbusOperatorsPage = lazy(() => import('./pages/RedbusOperatorsPage'))
const RedbusSrpPage = lazy(() => import('./pages/RedbusSrpPage'))
const AbhibusLayout = lazy(() => import('./layouts/AbhibusLayout'))
const AbhibusKpiPage = lazy(() => import('./pages/AbhibusKpiPage'))
const AbhibusSrpPage = lazy(() => import('./pages/AbhibusSrpPage'))

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="glass-panel m-6 p-6 text-sm text-theme-muted">Loading...</div>}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/google-play" element={<GooglePlayPage />} />
          <Route path="/apple-store" element={<AppleStorePage />} />
          <Route path="/google-reviews" element={<GooglePage />} />

          <Route path="/redbus" element={<RedbusLayout />}>
            <Route index element={<RedbusMarketplacePage />} />
            <Route path="routes" element={<RedbusRoutesPage />} />
            <Route path="operators" element={<RedbusOperatorsPage />} />
            <Route path="srp" element={<RedbusSrpPage />} />
            <Route path="kpis" element={<Navigate to="/redbus" replace />} />
          </Route>

          <Route path="/abhibus" element={<AbhibusLayout />}>
            <Route index element={<Navigate to="kpis" replace />} />
            <Route path="kpis" element={<AbhibusKpiPage />} />
            <Route path="srp" element={<AbhibusSrpPage />} />
          </Route>

          {/* Legacy redirects */}
          <Route path="/app-store" element={<Navigate to="/google-play" replace />} />
          <Route path="/review-tags" element={<Navigate to="/redbus" replace />} />
          <Route path="/redbus/reviews" element={<Navigate to="/redbus" replace />} />
          <Route path="/redbus-srp" element={<Navigate to="/redbus/srp" replace />} />
          <Route path="/abhibus/reviews" element={<Navigate to="/abhibus/kpis" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
