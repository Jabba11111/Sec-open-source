import { Router } from "express";
import { TOOL_REGISTRY } from "../services/toolRegistry";

export const toolsRouter = Router();

toolsRouter.get("/", (_req, res) => {
  res.json(Object.values(TOOL_REGISTRY));
});

toolsRouter.get("/:id", (req, res) => {
  const tool = TOOL_REGISTRY[req.params.id as keyof typeof TOOL_REGISTRY];
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
});
