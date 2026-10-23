export const Role = {
  ADMIN: 'ADMIN',
  COUNTER: 'COUNTER',
  KITCHEN: 'KITCHEN'
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = [Role.ADMIN, Role.COUNTER, Role.KITCHEN];
