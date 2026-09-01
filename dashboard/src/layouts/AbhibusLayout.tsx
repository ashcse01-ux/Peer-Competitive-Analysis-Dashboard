import React from 'react'

import { BarChart3, Compass } from 'lucide-react'

import AnalyticsChannelLayout from '../components/AnalyticsChannelLayout'

import { useTranslation } from '../i18n/useTranslation'



const ABHIBUS_ORANGE = '#E85D04'



export default function AbhibusLayout() {

  const { t } = useTranslation()



  return (

    <AnalyticsChannelLayout

      eyebrow={t('abhibus.eyebrow')}

      title={t('abhibus.title')}

      subtitle={t('abhibus.subtitle')}

      accent={ABHIBUS_ORANGE}

      marketplaceSync={{

        label: 'Abhibus',

        kpiChannel: 'abhibus_marketplace',

        srpChannel: 'abhibus_srp',

      }}

      tabs={[

        {

          to: '/abhibus/kpis',

          label: 'KPI Analytics',

          icon: <BarChart3 size={16} strokeWidth={2.2} />,

          end: true,

        },

        {

          to: '/abhibus/srp',

          label: 'SRP Tracker',

          icon: <Compass size={16} strokeWidth={2.2} />,

          end: true,

        },

      ]}

    />

  )

}


