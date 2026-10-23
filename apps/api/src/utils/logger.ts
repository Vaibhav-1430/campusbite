type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  [key: string]: unknown;
}

const formatLog = (level: LogLevel, message: string, context?: string, meta?: Record<string, unknown>) => {
  const payload: LogPayload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
    ...meta
  };
  return JSON.stringify(payload);
};

export const logger = {
  info: (message: string, context?: string, meta?: Record<string, unknown>) => {
    console.log(formatLog('info', message, context, meta));
  },
  warn: (message: string, context?: string, meta?: Record<string, unknown>) => {
    console.warn(formatLog('warn', message, context, meta));
  },
  error: (message: string, context?: string, meta?: Record<string, unknown>) => {
    console.error(formatLog('error', message, context, meta));
  },
  debug: (message: string, context?: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', message, context, meta));
    }
  }
};
