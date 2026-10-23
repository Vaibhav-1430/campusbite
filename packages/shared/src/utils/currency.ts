/**
 * Format integer paise into standard Indian Rupee presentation format
 * Example: 7500 paise -> ₹75.00
 */
export const formatPaise = (paise: number, showDecimals = true): string => {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2
  }).format(rupees);
};

/**
 * Convert Rupee decimal to integer paise
 * Example: 75.50 -> 7550
 */
export const rupeesToPaise = (rupees: number): number => {
  return Math.round(rupees * 100);
};

/**
 * Convert integer paise to decimal Rupee amount
 * Example: 7550 -> 75.50
 */
export const paiseToRupees = (paise: number): number => {
  return paise / 100;
};
