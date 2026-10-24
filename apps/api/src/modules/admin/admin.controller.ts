import { Request, Response, NextFunction } from 'express';
import { resetBusinessDataSchema } from '@campusbite/shared';
import * as adminService from './admin.service.js';
import { sendSuccess } from '../../utils/response.js';

export const resetBusinessData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    resetBusinessDataSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const result = await adminService.resetBusinessData(actorId, actorRole, ip);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};
