import PeerStoreDashboard from '../components/PeerStoreDashboard'
import { IOS_APP_STORE_DASHBOARD } from '../lib/peerDashboardConfig'

export default function AppleStorePage() {
  return <PeerStoreDashboard config={IOS_APP_STORE_DASHBOARD} />
}
