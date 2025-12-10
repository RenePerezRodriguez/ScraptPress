import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Express middleware to handle errors.
 * It sends a structured JSON response for operational errors
 * and a generic message for programming or other unexpected errors.
 */
export const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log the error for debugging purposes
  logger.error('ERROR', {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  // For operational errors, send a more detailed message to the client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      status: 'error',
      message: err.message,
    });
  }

  // For programming or other unknown errors, don't leak error details
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went very wrong!',
  });
};

/**
 * A simple utility for creating operational errors.
 */
export class ApiError extends Error implements AppError {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
