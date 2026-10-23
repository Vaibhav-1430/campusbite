import { Request, Response, NextFunction } from 'express';
import { createOrderSchema, cancelOrderSchema, OrderStatus } from '@campusbite/shared';
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
    const { status, date, limit } = req.query;

    let statusList: OrderStatus[] | undefined;
    if (typeof status === 'string') {
      statusList = status.split(',').map((s) => s.trim() as OrderStatus);
    }

    const orders = await orderService.listOrders({
      status: statusList,
      date: typeof date === 'string' ? date : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined
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
