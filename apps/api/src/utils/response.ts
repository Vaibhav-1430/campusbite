import { Response } from 'express';
import { ApiSuccessResponse, ApiErrorResponse, ApiErrorDetail } from '@campusbite/shared';

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200, meta?: Record<string, unknown>) => {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
  return res.status(statusCode).json(payload);
};

export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: ApiErrorDetail[] | null
) => {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
  return res.status(statusCode).json(payload);
};
