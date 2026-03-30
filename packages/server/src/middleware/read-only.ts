import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createReadOnlyMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    res.status(403).json({
      error: "read_only_demo",
      message: "This demo is read-only",
    });
  };
}