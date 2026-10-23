export const OrderStatus = {
  PLACED: 'PLACED',
  PREPARING: 'PREPARING',
  PREPARED: 'PREPARED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
