import { FC } from 'react'

export const ArbitrumIcon: FC<{ className?: string; size?: number }> = ({ className, size = 24 }) => {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="256" height="256" rx="128" fill="#213147" />
      <path d="M130.968 131.917L141.744 154.761L167.808 116.296L130.968 131.917Z" fill="#12AAFF" />
      <path
        d="M167.808 116.296L141.744 154.761L177.024 182.064L195.888 141.936L167.808 116.296Z"
        fill="#12AAFF"
      />
      <path
        d="M89.952 116.296L60.192 141.936L79.008 182.064L114.288 154.761L89.952 116.296Z"
        fill="#12AAFF"
      />
      <path
        d="M114.288 154.761L79.008 182.064L109.536 207.84L128.016 207.84L151.2 182.064L114.288 154.761Z"
        fill="white"
      />
      <path d="M151.2 182.064L128.016 207.84L146.496 207.84L177.024 182.064L151.2 182.064Z" fill="white" />
      <path d="M114.288 154.761L130.968 131.917L89.952 116.296L114.288 154.761Z" fill="#12AAFF" />
      <path
        d="M128 48L60.192 141.936L89.952 116.296L128 62.064L167.808 116.296L195.888 141.936L128 48Z"
        fill="#9DCCED"
      />
    </svg>
  )
}
