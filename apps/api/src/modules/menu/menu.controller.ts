import { Request, Response, NextFunction } from 'express';
import { createMenuItemSchema, updateMenuItemSchema, updateAvailabilitySchema } from '@campusbite/shared';
import * as menuService from './menu.service.js';
import { sendSuccess } from '../../utils/response.js';

export const listMenuItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, search, isAvailable, includeInactiveCategory } = req.query;

    const items = await menuService.listMenuItems({
      categoryId: typeof categoryId === 'string' ? categoryId : undefined,
      search: typeof search === 'string' ? search : undefined,
      isAvailable: isAvailable !== undefined ? isAvailable === 'true' : undefined,
      includeInactiveCategory: includeInactiveCategory === 'true'
    });

    return sendSuccess(res, { items });
  } catch (err) {
    next(err);
  }
};

export const getMenuItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const item = await menuService.getMenuItemById(id);
    return sendSuccess(res, { item });
  } catch (err) {
    next(err);
  }
};

export const createMenuItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createMenuItemSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const item = await menuService.createMenuItem(input, actorId, actorRole, ip);
    return sendSuccess(res, { item }, 201);
  } catch (err) {
    next(err);
  }
};

export const updateMenuItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const input = updateMenuItemSchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const item = await menuService.updateMenuItem(id, input, actorId, actorRole, ip);
    return sendSuccess(res, { item });
  } catch (err) {
    next(err);
  }
};

export const updateAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { isAvailable } = updateAvailabilitySchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const item = await menuService.updateAvailability(id, isAvailable, actorId, actorRole, ip);
    return sendSuccess(res, { item });
  } catch (err) {
    next(err);
  }
};

export const deleteMenuItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    await menuService.deleteMenuItem(id, actorId, actorRole, ip);
    return sendSuccess(res, { message: 'Menu item deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

export const initializeCafe47Menu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const report = await menuService.initializeCafe47Menu(actorId, actorRole, ip);
    return sendSuccess(res, report, 200);
  } catch (err) {
    next(err);
  }
};
