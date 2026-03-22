import { Router, Request, Response } from "express";
import { connection } from "../bridge/solana/kesh_bridge";
import { getQueueStats } from "../bridge/mpesa/queue/offline_queue";

export const healthRouter = Router();

healthRouter.get("/health", async (_req: Request, res: Response) => {
  let solanaStatus = "offline";
  let blockHeight  = 0;
  try {
    blockHeight   = await connection.getBlockHeight();
    solanaStatus  = "online";
  } catch {}

  res.json({
    status:      "ok",
    timestamp:   new Date().toISOString(),
    solana:      { status: solanaStatus, blockHeight },
    queue:       getQueueStats(),
    version:     "0.4.0",
  });
});
