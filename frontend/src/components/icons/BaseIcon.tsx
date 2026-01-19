import { FC } from 'react'

export const BaseIcon: FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 111 111"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
      <path
        d="M55.3877 93.0986C76.0588 93.0986 92.8184 76.339 92.8184 55.6679C92.8184 34.9968 76.0588 18.2372 55.3877 18.2372C35.7106 18.2372 19.582 33.5015 18 52.7879H67.0322V58.548H18C19.582 77.8343 35.7106 93.0986 55.3877 93.0986Z"
        fill="white"
      />
    </svg>
  )
}
