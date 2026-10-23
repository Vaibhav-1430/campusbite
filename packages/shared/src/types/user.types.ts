import { Role } from '../constants/roles.js';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<UserDto, 'tokenVersion'>;

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  tokenVersion: number;
}
