import { Request, Response, NextFunction } from 'express';
import { createCategorySchema, updateCategorySchema } from '@campusbite/shared';
import * as categoryService from './category.service.js';
import { sendSuccess } from '../../utils/response.js';

export const listCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const categories = await categoryService.listCategories(includeInactive);
    return sendSuccess(res, { categories });
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createCategorySchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const category = await categoryService.createCategory(input, actorId, actorRole, ip);
    return sendSuccess(res, { category }, 201);
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const input = updateCategorySchema.parse(req.body);
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    const category = await categoryService.updateCategory(id, input, actorId, actorRole, ip);
    return sendSuccess(res, { category });
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const actorId = req.user!.id;
    const actorRole = req.user!.role;
    const ip = req.ip || req.socket.remoteAddress;

    await categoryService.deleteCategory(id, actorId, actorRole, ip);
    return sendSuccess(res, { message: 'Category deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
