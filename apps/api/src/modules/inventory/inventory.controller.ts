import { Request, Response, NextFunction } from 'express';
import {
  createStockItemSchema,
  updateStockItemSchema,
  restockStockItemSchema,
  adjustStockItemSchema
} from '@campusbite/shared';
import * as inventoryService from './inventory.service.js';
import { sendSuccess } from '../../utils/response.js';

export const getOverview = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = await inventoryService.getInventoryOverview();
    return sendSuccess(res, { overview }, 200);
  } catch (err) {
    next(err);
  }
};

export const listStockItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const lowStockOnly = req.query.lowStockOnly === 'true';
    const outOfStockOnly = req.query.outOfStockOnly === 'true';

    const items = await inventoryService.listStockItems({
      search,
      lowStockOnly,
      outOfStockOnly
    });

    return sendSuccess(res, { items }, 200);
  } catch (err) {
    next(err);
  }
};

export const getStockItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await inventoryService.getStockItemById(req.params.id);
    return sendSuccess(res, { item }, 200);
  } catch (err) {
    next(err);
  }
};

export const createStockItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createStockItemSchema.parse(req.body);
    const user = req.user!;
    const ipAddress = (req.ip || req.socket.remoteAddress) as string | undefined;

    const item = await inventoryService.createStockItem(validated, user.id, user.role, ipAddress);
    return sendSuccess(res, { item }, 201);
  } catch (err) {
    next(err);
  }
};

export const updateStockItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateStockItemSchema.parse(req.body);
    const user = req.user!;
    const ipAddress = (req.ip || req.socket.remoteAddress) as string | undefined;

    const item = await inventoryService.updateStockItem(req.params.id, validated, user.id, user.role, ipAddress);
    return sendSuccess(res, { item }, 200);
  } catch (err) {
    next(err);
  }
};

export const restock = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantityAdded, note } = restockStockItemSchema.parse(req.body);
    const user = req.user!;
    const ipAddress = (req.ip || req.socket.remoteAddress) as string | undefined;

    const item = await inventoryService.restockStockItem(
      req.params.id,
      quantityAdded,
      note,
      user.id,
      user.role,
      ipAddress
    );
    return sendSuccess(res, { item }, 200);
  } catch (err) {
    next(err);
  }
};

export const adjust = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quantityChange, reason } = adjustStockItemSchema.parse(req.body);
    const user = req.user!;
    const ipAddress = (req.ip || req.socket.remoteAddress) as string | undefined;

    const item = await inventoryService.adjustStockItem(
      req.params.id,
      quantityChange,
      reason,
      user.id,
      user.role,
      ipAddress
    );
    return sendSuccess(res, { item }, 200);
  } catch (err) {
    next(err);
  }
};

export const listMovements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stockItemId = req.query.stockItemId as string | undefined;
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

    const result = await inventoryService.listInventoryMovements({
      stockItemId,
      type,
      limit,
      offset
    });

    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};
