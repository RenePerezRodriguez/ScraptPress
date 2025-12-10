import { Request, Response, NextFunction } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void | unknown>;

/**
 * Wraps an asynchronous request handler to catch any thrown errors
 * and pass them to the Express error handling middleware.
 * @param fn The asynchronous request handler function.
 * @returns A new function that can be used as Express middleware.
 */
export const asyncHandler =
  (fn: AsyncRequestHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
