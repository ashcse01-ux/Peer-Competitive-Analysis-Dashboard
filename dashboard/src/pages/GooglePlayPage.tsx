import PeerStoreDashboard from '../components/PeerStoreDashboard'
import { GOOGLE_PLAY_DASHBOARD } from '../lib/peerDashboardConfig'

export default function GooglePlayPage() {
  return <PeerStoreDashboard config={GOOGLE_PLAY_DASHBOARD} />
}
