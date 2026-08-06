import React from 'react'
import { NavLink } from 'react-router-dom'
import FreshbusLogo from './FreshbusLogo'

/** Header brand: logo plate + title stack (horizontal). */
export default function BrandLockup() {
  return (
    <NavLink to="/" className="brand-lockup" aria-label="Fresh Bus home">
      <span className="brand-mark">
        <FreshbusLogo className="brand-mark-icon" />
      </span>
      <span className="brand-text">
        <span className="brand-title">Fresh Bus</span>
        <span className="brand-tagline">Peer Competitive Analysis</span>
      </span>
    </NavLink>
  )
}
