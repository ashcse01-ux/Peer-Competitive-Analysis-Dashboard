import React from 'react'
import SyncControlPanel from './SyncControlPanel'

/** Overview page sync row for the three daily app-store channels (08:00 IST). */
export default function OverviewSyncPanel() {
  return (
    <SyncControlPanel
      channels={['google_play', 'ios_app_store', 'google_search']}
      className="col-span-full"
    />
  )
}
