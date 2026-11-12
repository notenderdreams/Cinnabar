import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GoogleGeminiIcon } from '@hugeicons/core-free-icons';

export interface GoogleGeminiIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number;
}

export const SparkleIcon: React.FC<GoogleGeminiIconProps> = ({
  className,
  size,
  strokeWidth,
  ...props
}) => {
  return (
    <HugeiconsIcon
      icon={GoogleGeminiIcon}
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
};
