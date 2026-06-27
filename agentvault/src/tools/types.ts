import type { MemoryStore } from "../store.js";

export interface ToolOptions {
  store: MemoryStore;
  version: string;
  hasPro: boolean;
}
