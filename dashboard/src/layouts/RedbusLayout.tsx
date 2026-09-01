import React from 'react'
import { BarChart3, Building2, Compass, MapPin } from 'lucide-react'
import AnalyticsChannelLayout from '../components/AnalyticsChannelLayout'

export default function RedbusLayout() {
  return (
    <AnalyticsChannelLayout
      redbusSpec
      marketplaceSync={{
        label: 'Redbus',
        kpiChannel: 'redbus_marketplace',
        srpChannel: 'redbus_srp',
      }}
      tabs={[
        {
          to: '/redbus',
          label: 'Marketplace',
          icon: <BarChart3 size={16} strokeWidth={2.2} />,
          end: true,
        },
        {
          to: '/redbus/routes',
          label: 'Routes',
          icon: <MapPin size={16} strokeWidth={2.2} />,
          end: true,
        },
        {
          to: '/redbus/operators',
          label: 'Operators',
          icon: <Building2 size={16} strokeWidth={2.2} />,
          end: true,
        },
        {
          to: '/redbus/srp',
          label: 'SRP Tracker',
          icon: <Compass size={16} strokeWidth={2.2} />,
          end: true,
        },
      ]}
    />
  )
}
