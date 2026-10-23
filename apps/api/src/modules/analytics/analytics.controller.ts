import { Request, Response, NextFunction } from 'express';
import {
  analyticsDateRangeSchema,
  dailyClosingReportQuerySchema
} from '@campusbite/shared';
import * as analyticsService from './analytics.service.js';
import { sendSuccess } from '../../utils/response.js';

export const getSalesSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const summary = await analyticsService.getSalesSummary(startDate, endDate);
    return sendSuccess(res, summary, 200);
  } catch (err) {
    next(err);
  }
};

export const getMenuPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const items = await analyticsService.getMenuPerformance(startDate, endDate);
    return sendSuccess(res, { items }, 200);
  } catch (err) {
    next(err);
  }
};

export const getKitchenPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const metrics = await analyticsService.getKitchenPerformance(startDate, endDate);
    return sendSuccess(res, metrics, 200);
  } catch (err) {
    next(err);
  }
};

export const getInventoryReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const report = await analyticsService.getInventoryReport(startDate, endDate);
    return sendSuccess(res, report, 200);
  } catch (err) {
    next(err);
  }
};

export const getDailyClosingReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = dailyClosingReportQuerySchema.parse(req.query);
    const closing = await analyticsService.getDailyClosingReport(date);
    return sendSuccess(res, closing, 200);
  } catch (err) {
    next(err);
  }
};

export const exportSalesCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const csvContent = await analyticsService.exportSalesSummaryCsv(startDate, endDate);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-summary-${startDate}-to-${endDate}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};

export const exportMenuCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);
    const csvContent = await analyticsService.exportMenuPerformanceCsv(startDate, endDate);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="menu-performance-${startDate}-to-${endDate}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};

export const exportDailyClosingCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = dailyClosingReportQuerySchema.parse(req.query);
    const csvContent = await analyticsService.exportDailyClosingCsv(date);
    const reportDate = date || new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="daily-closing-${reportDate}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
};
