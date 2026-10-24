import { Request, Response, NextFunction } from 'express';
import { createUserSchema, updateUserStatusSchema, resetPasswordSchema } from '@campusbite/shared';
import * as userService from './user.service.js';
import { sendSuccess } from '../../utils/response.js';

export const listUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userService.listUsers();
    return sendSuccess(res, { users });
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createUserSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const user = await userService.createUser(input, actorId, actorRole, ip);
    return sendSuccess(res, { user }, 201);
  } catch (err) {
    next(err);
  }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isActive } = updateUserStatusSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const user = await userService.updateUserStatus(id, isActive, actorId, actorRole, ip);
    return sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { newPassword } = resetPasswordSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const result = await userService.resetPassword(id, newPassword, actorId, actorRole, ip);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const result = await userService.deleteUser(id, actorId, actorRole, ip);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};
