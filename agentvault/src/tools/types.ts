import type { MemoryStore } from "../store.js";
import type { ScopedMemoryStore } from "../scoped-store.js";

export interface ToolOptions {
  store: MemoryStore;
  version: string;
  hasPro: boolean;
  projectHash: string | null;
  projectName: string | null;
  scopedStore: ScopedMemoryStore;
}
