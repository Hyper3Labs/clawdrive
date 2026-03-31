import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  const msg = err.message ?? "";

  if (
    msg.includes("API key expired") ||
    msg.includes("API key not valid") ||
    msg.includes("API_KEY_INVALID")
  ) {
    res.status(502).json({ error: "Gemini API key is invalid or expired." });
    return;
  }

  if (msg.includes("429")) {
    res.status(429).json({ error: "Gemini API rate limit exceeded." });
    return;
  }

  console.error(err.stack);
  res.status(500).json({ error: err.message });
}
