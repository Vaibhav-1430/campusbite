import { Request, Response, NextFunction } from 'express';
import { verifyOrderSchema } from '@campusbite/shared';
import * as trackingService from './tracking.service.js';
import { sendSuccess } from '../../utils/response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { verifyTrackingToken } from '../../utils/token.js';

export const verifyOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dailyOrderNumber, pin } = verifyOrderSchema.parse(req.body);
    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown') as string;

    const result = await trackingService.verifyOrder(dailyOrderNumber, pin, ipAddress);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};

export const getTrackingStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Tracking token is required.', 'TRACKING_AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = verifyTrackingToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired tracking token.', 'INVALID_TRACKING_TOKEN');
    }

    const order = await trackingService.getTrackingStatus(payload.orderId);
    return sendSuccess(res, { order }, 200);
  } catch (err) {
    next(err);
  }
};

export const getPublicBoard = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const board = await trackingService.getPublicBoardData();
    return sendSuccess(res, { board }, 200);
  } catch (err) {
    next(err);
  }
};
