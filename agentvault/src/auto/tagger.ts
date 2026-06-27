/**
 * 自动标签与分类引擎 — 规则驱动，零依赖。
 *
 * 策略：
 *  1. 关键词模式匹配 → 建议标签
 *  2. 代码块 / URL 检测 → 内容特征标签
 *  3. 启发式分类推断 → category
 *  4. 用户显式提供的 tag / category 始终优先
 */

/** Strip code blocks, inline code, and normalize whitespace for analysis. */
export function normalizeContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heuristic category inference from content patterns. */
export function inferCategory(content: string): string | null {
  const c = content.toLowerCase();

  // Strong signals → return immediately
  if (/^[#*]{1,4}\s|```|import\s|export\s|function\s|const\s|class\s|interface\s/.test(c) && c.split(/\s+/).length >= 10) {
    return "code-pattern";
  }

  // Decision markers
  if (/\b(chose|decided|selected|picked|opted for|went with|migrated to)\b/.test(c)) {
    return "decision-log";
  }

  // Preference markers
  if (/\b(prefer|always|never|should (?!fail)|like to|want to|recommend|rule|convention)\b/.test(c)) {
    return "user-preference";
  }

  // Project context markers
  if (/\b(project|repo|monorepo|workspace|stack|architecture|pipeline|deploy|build|ci|cd)\b/.test(c)) {
    return "project-context";
  }

  return null;
}

interface TagRule {
  tag: string;
  patterns: RegExp[];
}

const TAG_RULES: TagRule[] = [
  {
    tag: "react",
    patterns: [/\breact\b/, /\bjsx\b/, /\buseState\b/, /\buseEffect\b/, /\buseCallback\b/],
  },
  {
    tag: "typescript",
    patterns: [/\btypescript\b/, /\b\.tsx?\b/, /\binterface\s+\w+\s*\{/, /\btype\s+\w+\s*=/],
  },
  {
    tag: "python",
    patterns: [/\bpython\b/, /\bdef\s+\w+\(/, /\bpip\b/, /\bpytest\b/, /\bFastAPI\b/],
  },
  {
    tag: "rust",
    patterns: [/\brust\b/, /\bcargo\b/, /\bfn\s+\w+\(/, /\bimpl\s/, /\bstruct\s/],
  },
  {
    tag: "go",
    patterns: [/\bgolang\b/, /\bgo\s+mod\b/, /\bfunc\s+\w+\([^)]*\)\s+\w+/],
  },
  {
    tag: "postgresql",
    patterns: [/\bpostgres\b/, /\bpostgresql\b/, /\bpg\b/, /\bpsql\b/, /\bmigration\b/],
  },
  {
    tag: "redis",
    patterns: [/\bredis\b/, /\bcache\b/, /\bcaching\b/, /\bmemcached\b/],
  },
  {
    tag: "docker",
    patterns: [/\bdocker\b/, /\bcontainer\b/, /\bDockerfile\b/, /\bdocker-compose\b/, /\bk8s\b/, /\bkubernetes\b/],
  },
  {
    tag: "git",
    patterns: [/\bgit\b/, /\bgithub\b/, /\bgitlab\b/, /\bcommit\b.*\bmessage\b/, /\bbranch\b\s+\bstrategy\b/],
  },
  {
    tag: "ci-cd",
    patterns: [/\bci\b/, /\bcd\b/, /\bpipeline\b/, /\bgithub actions\b/, /\bjenkins\b/, /\bgitlab ci\b/],
  },
  {
    tag: "testing",
    patterns: [/\btest(s|ing)?\b/, /\bcoverage\b/, /\bunit test\b/, /\be2e\b/, /\bintegration test\b/],
  },
  {
    tag: "api",
    patterns: [/\bapi\b/, /\brest\b/, /\bgraphql\b/, /\bgrpc\b/, /\bopenapi\b/, /\bswagger\b/],
  },
  {
    tag: "auth",
    patterns: [/\bauth\b/, /\bauthentication\b/, /\boauth\b/, /\bjwt\b/, /\bsso\b/, /\bopenid\b/],
  },
  {
    tag: "security",
    patterns: [/\bsecurity\b/, /\bvulnerability\b/, /\bxss\b/, /\bcsrf\b/, /\bsql injection\b/, /\bencrypt\b/],
  },
  {
    tag: "deployment",
    patterns: [/\bdeploy\b/, /\brelease\b/, /\bship\b/, /\bstaging\b/, /\bproduction\b/, /\bvercel\b/, /\bnetlify\b/],
  },
  {
    tag: "css",
    patterns: [/\bcss\b/, /\btailwind\b/, /\bsass\b/, /\bscss\b/, /\bstyle\b/, /\bstyling\b/],
  },
  {
    tag: "nodejs",
    patterns: [/\bnode\.js\b/, /\bnodejs\b/, /\bnpm\b/, /\bpnpm\b/, /\byarn\b/, /\bexpress\b/],
  },
  {
    tag: "monorepo",
    patterns: [/\bmonorepo\b/, /\bturborepo\b/, /\bnx\b/, /\bworkspace\b/, /\blerna\b/],
  },
  {
    tag: "database",
    patterns: [/\bdatabase\b/, /\bdb\b/, /\bmysql\b/, /\bmongodb\b/, /\bsqlite\b/, /\borm\b/, /\bprisma\b/],
  },
  {
    tag: "llm",
    patterns: [/\bllm\b/, /\bopenai\b/, /\banthropic\b/, /\bgpt\b/, /\bclaude\b/, /\bprompt\b/, /\bembedding\b/],
  },
];

/** Detect code blocks in content. */
function hasCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```/.test(content) || content.split("\n").filter((l) => /^(\s{2,}|\t)/.test(l)).length >= 5;
}

/** Detect URLs in content. */
function hasUrls(content: string): boolean {
  return /\bhttps?:\/\/[^\s]+/.test(content);
}

/** Suggest tags from content using keyword pattern matching. */
export function suggestTags(content: string): string[] {
  const normalized = normalizeContent(content);
  const c = normalized.toLowerCase();
  const tags = new Set<string>();

  for (const rule of TAG_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(c)) {
        tags.add(rule.tag);
        break;
      }
    }
    if (tags.size >= 8) break; // cap at 8 tags
  }

  // Content-based signals
  if (hasCodeBlocks(content)) {
    tags.add("code-snippet");
  }
  if (hasUrls(content)) {
    tags.add("url-reference");
  }

  return [...tags].sort();
}

/** Full auto-analysis: returns suggested category, tags, and whether analysis was meaningful. */
export function analyzeMemory(
  content: string,
  existingCategory?: string,
  existingTags?: string[],
): {
  suggested_category: string | null;
  suggested_tags: string[];
  is_code: boolean;
  has_urls: boolean;
} {
  return {
    suggested_category: inferCategory(content),
    suggested_tags: existingTags?.length ? existingTags : suggestTags(content),
    is_code: hasCodeBlocks(content),
    has_urls: hasUrls(content),
  };
}
