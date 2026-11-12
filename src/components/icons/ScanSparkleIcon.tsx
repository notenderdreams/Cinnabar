import React from 'react';

export interface ScanSparkleIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

export const ScanSparkleIcon: React.FC<ScanSparkleIconProps> = ({
  className = 'w-4 h-4',
  size = 24,
  strokeWidth = 2,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* 4 Scan Corner Brackets with open breathing room */}
      <path d="M3 6.5V5a2 2 0 0 1 2-2h1.5" />
      <path d="M17.5 3H19a2 2 0 0 1 2 2v1.5" />
      <path d="M21 17.5V19a2 2 0 0 1-2 2h-1.5" />
      <path d="M6.5 21H5a2 2 0 0 1-2-2v-1.5" />
      {/* Soft Rounded Center AI Sparkle with generous negative space */}
      <g transform="translate(12, 12) scale(0.8) translate(-12, -12)">
        <path
          d="M10.5279 7.13967C11.3077 5.71322 11.6977 5 11.9958 5C12.294 5 12.6839 5.71322 13.4638 7.13967C14.2665 8.60787 15.3392 9.69316 16.8489 10.52C18.2778 11.3026 18.9922 11.6938 18.9922 11.9923C18.9922 12.2908 18.2773 12.6825 16.8475 13.4658C15.3808 14.2693 14.2966 15.3432 13.4706 16.8545C12.6889 18.2848 12.298 19 11.9998 19C11.7017 19 11.3104 18.2844 10.5279 16.853C9.7252 15.3848 8.65247 14.2995 7.14272 13.4727C5.70903 12.6875 4.99219 12.2949 4.99219 11.9964C4.99219 11.6978 5.70903 11.3052 7.14272 10.52C8.65247 9.69316 9.7252 8.60787 10.5279 7.13967Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};
