import React from 'react'

/** Official FreshBus yellow mark (inbound CX dashboard). */
export default function FreshbusLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M 32 82 L 32 20 C 32 14, 37 10, 43 10 L 71 10 C 80 10, 84 21, 76 28 L 56 46 L 70 46 C 79 46, 83 57, 75 64 L 43 92 C 35 99, 32 92, 32 85 Z"
        fill="#FFEA20"
      />
    </svg>
  )
}
