/**
 * ScopedMemoryStore: 装饰器模式包装 MemoryStore，自动限定 project scope。
 *
 * 所有操作自动限定在当前 project 或全局记忆。
 * 外部调用者无需手动传 projectHash。
 */

import type { Memory, MemoryStore } from "./store.js";

export class ScopedMemoryStore {
  constructor(
    private inner: MemoryStore,
    private projectHash: string | null,
    private projectName: string | null,
  ) {}

  /** 自动注入 project_id 和 project_name */
  add(memory: Memory): void {
    const scoped = { ...memory };
    if (this.projectHash) {
      scoped.project_id = this.projectHash;
      scoped.project_name = this.projectName ?? undefined;
      scoped.scope = "project";
    } else {
      scoped.scope = "global";
    }
    this.inner.add(scoped);
  }

  get(id: string): Memory | null {
    return this.inner.get(id);
  }

  remove(id: string): boolean {
    return this.inner.remove(id);
  }

  touch(id: string): void {
    this.inner.touch(id);
  }

  size(): number {
    return this.inner.size();
  }

  /** 默认只搜索当前项目 + 全局记忆 */
  search(
    query: string,
    opts: {
      limit: number;
      category?: string | null;
      tags?: string[] | null;
      minSimilarity?: number;
      queryVec?: Float32Array;
      alpha?: number;
      includeAllProjects?: boolean;
    },
  ): Memory[] {
    const { includeAllProjects, ...searchOpts } = opts;
    return this.inner.search(query, {
      ...searchOpts,
      projectHash: includeAllProjects ? null : (this.projectHash ?? undefined),
    } as any);
  }

  /** 默认只列举当前项目 + 全局记忆 */
  list(opts: {
    category?: string | null;
    tags?: string[] | null;
    limit: number;
    offset: number;
    includeAllProjects?: boolean;
  }): Memory[] {
    const { includeAllProjects, ...listOpts } = opts;
    return this.inner.list({
      ...listOpts,
      projectHash: includeAllProjects ? null : (this.projectHash ?? undefined),
    } as any);
  }

  /** 跨所有项目搜索（不限定 project），结果标注来源 */
  searchAllProjects(
    query: string,
    opts: {
      limit: number;
      category?: string | null;
      tags?: string[] | null;
      minSimilarity?: number;
      queryVec?: Float32Array;
      alpha?: number;
    },
  ): Memory[] {
    return this.inner.search(query, {
      ...opts,
      projectHash: null,
    } as any);
  }

  /** 仅在当前项目内搜索（排除全局记忆） */
  searchCurrentProjectOnly(
    query: string,
    opts: {
      limit: number;
      category?: string | null;
      tags?: string[] | null;
      minSimilarity?: number;
      queryVec?: Float32Array;
      alpha?: number;
    },
  ): Memory[] {
    // Fetch broadly (project + global) then filter strictly in-memory
    const results = this.inner.search(query, {
      ...opts,
      projectHash: null, // fetch all so we can filter precisely
    } as any);
    return results.filter((m) => m.project_id === this.projectHash);
  }

  stats() {
    return this.inner.stats();
  }

  /** 暴露内部 store（用于 export 等需要全量操作的场景） */
  getInner(): MemoryStore {
    return this.inner;
  }

  getProjectHash(): string | null {
    return this.projectHash;
  }

  getProjectName(): string | null {
    return this.projectName;
  }
}
