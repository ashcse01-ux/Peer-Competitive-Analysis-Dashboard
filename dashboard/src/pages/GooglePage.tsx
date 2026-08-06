import PeerStoreDashboard from '../components/PeerStoreDashboard'
import { GOOGLE_SEARCH_DASHBOARD } from '../lib/peerDashboardConfig'

export default function GooglePage() {
  return <PeerStoreDashboard config={GOOGLE_SEARCH_DASHBOARD} />
}
