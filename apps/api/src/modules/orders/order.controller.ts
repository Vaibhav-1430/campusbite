import { Request, Response, NextFunction } from 'express';
import {
  createOrderSchema,
  cancelOrderSchema,
  adjustPrepTimeSchema,
  assignOrderSchema,
  OrderStatus
} from '@campusbite/shared';
import * as orderService from './order.service.js';
import { sendSuccess } from '../../utils/response.js';

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const result = await orderService.createOrder(input, actorId, actorRole, ip);
    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, date, limit, direction } = req.query;

    let statusList: OrderStatus[] | undefined;
    if (typeof status === 'string') {
      statusList = status.split(',').map((s) => s.trim() as OrderStatus);
    }

    const orderDirection = direction === 'asc' || direction === 'desc' ? direction : undefined;

    const orders = await orderService.listOrders({
      status: statusList,
      date: typeof date === 'string' ? date : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      direction: orderDirection
    });

    return sendSuccess(res, { orders });
  } catch (err) {
    next(err);
  }
};

export const getOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const claimOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.claimOrder(id, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const assignOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { staffId } = assignOrderSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.assignOrder(id, staffId, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const startPreparation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.startPreparation(id, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const adjustPreparationTime = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { minutesAdded, reason } = adjustPrepTimeSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.adjustPreparationTime(id, minutesAdded, reason, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const markPrepared = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.markPrepared(id, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const markHandover = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.markHandover(id, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = cancelOrderSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const order = await orderService.cancelOrder(id, reason, actorId, actorRole, ip);
    return sendSuccess(res, { order });
  } catch (err) {
    next(err);
  }
};
