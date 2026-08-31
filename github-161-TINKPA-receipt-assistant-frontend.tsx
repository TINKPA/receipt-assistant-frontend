// src/components/AwardDisplay.tsx
import React from 'react';

interface AwardDisplayProps {
  points: number;
  showAsDollars?: boolean;
}

const AwardDisplay: React.FC<AwardDisplayProps> = ({ points, showAsDollars = true }) => {
  const formatAmount = (value: number): string => {
    if (showAsDollars) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
    
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <span className="award-amount">
      {formatAmount(points)}
    </span>
  );
};

export default AwardDisplay;