import React from 'react'
import AnalyticsChannelLayout from '../components/AnalyticsChannelLayout'

/** Redbus channel is SRP-only (Marketplace / Routes / Operators removed). */
export default function RedbusLayout() {
  return (
    <AnalyticsChannelLayout
      redbusSpec
      hideSubnav
      marketplaceSync={{
        label: 'Redbus',
        kpiChannel: 'redbus_marketplace',
        srpChannel: 'redbus_srp',
      }}
      tabs={[]}
    />
  )
}
