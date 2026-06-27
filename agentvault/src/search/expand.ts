/**
 * Static query expansion — lightweight synonym/alias mapping.
 * Zero dependencies, offline-safe. Used to broaden keyword reach.
 */

const SYNONYMS: Record<string, string[]> = {
  // Tech terms
  auth: ["authentication", "login", "oauth", "jwt", "sso"],
  authn: ["authentication"],
  authz: ["authorization", "permission", "access control", "rbac"],
  api: ["endpoint", "rest", "graphql", "rpc", "http"],
  db: ["database", "postgres", "mysql", "sqlite", "mongo"],
  ci: ["continuous integration", "pipeline", "github actions", "jenkins"],
  cd: ["continuous deployment", "deploy", "release"],
  css: ["style", "styling", "tailwind", "sass", "less"],
  js: ["javascript", "ecmascript", "es6", "es2022"],
  ts: ["typescript"],
  react: ["reactjs", "react.js", "jsx"],
  vue: ["vuejs", "vue.js"],
  node: ["nodejs", "node.js"],
  vcs: ["git", "version control", "github", "gitlab"],
  k8s: ["kubernetes", "container", "docker", "pod"],
  ssh: ["secure shell", "remote", "terminal"],
  ssl: ["tls", "https", "certificate", "encryption"],
  dns: ["domain", "hostname", "nameserver"],
  jwt: ["json web token", "token", "bearer"],
  oauth: ["open authorization", "social login"],
  orm: ["object relational mapping", "prisma", "drizzle", "sequelize"],
  spa: ["single page application", "client-side routing"],
  ssr: ["server-side rendering", "nextjs", "nuxt"],
  csv: ["comma separated", "spreadsheet", "tabular"],
  json: ["javascript object notation", "serialization"],
  xml: ["extensible markup language", "soap"],
  yaml: ["yaml ain't markup language", "config"],
  toml: ["tom's obvious minimal language", "config"],
  env: ["environment variable", ".env", "dotenv"],
  pkg: ["package", "dependency", "npm", "pip", "crate"],
  lint: ["eslint", "prettier", "formatter", "style guide"],
  test: ["testing", "unit test", "integration", "e2e", "coverage"],
  build: ["compile", "transpile", "bundle", "webpack", "vite"],
  deploy: ["deployment", "release", "ship", "production", "staging"],
  monitor: ["observability", "logging", "metrics", "alerting", "grafana"],
  cache: ["caching", "redis", "memcached", "cdn"],
  queue: ["message queue", "kafka", "rabbitmq", "sqs", "pubsub"],
  arch: ["architecture", "design pattern", "system design"],
  perf: ["performance", "optimization", "benchmark", "latency"],

  // Common memory categories
  preference: ["prefer", "like", "want", "style", "coding style"],
  decision: ["chose", "decided", "picked", "selected", "decision"],
  pattern: ["pattern", "template", "boilerplate", "skeleton", "scaffold"],
  bug: ["error", "issue", "fix", "broken", "crash"],
  feature: ["feat", "feature", "enhancement", "new", "add"],
  refactor: ["refactor", "rewrite", "cleanup", "simplify", "improve"],
  docs: ["documentation", "readme", "guide", "tutorial", "manual"],
  security: ["secure", "vulnerability", "exploit", "xss", "csrf", "injection"],

  // CJK mappings (common translations)
  认证: ["auth", "authentication", "login"],
  授权: ["authorization", "permission", "access"],
  数据库: ["database", "db", "postgres", "mysql"],
  部署: ["deploy", "deployment", "release"],
  测试: ["test", "testing", "coverage"],
  性能: ["performance", "optimization", "perf"],
  安全: ["security", "vulnerability", "encryption"],
  配置: ["config", "configuration", "settings", "env"],
  文档: ["documentation", "docs", "readme"],
  日志: ["logging", "log", "monitor"],
  缓存: ["cache", "caching", "redis"],
  重构: ["refactor", "rewrite", "cleanup"],
};

/**
 * Expand a query string with related synonyms.
 * Returns original query + expanded tokens appended, weighted at 0.3.
 */
export function expandQuery(query: string): {
  original: string;
  expanded: string;
  tokens: string[];
} {
  const originalTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const expanded = new Set<string>();
  for (const token of originalTokens) {
    expanded.add(token);
    const syns = SYNONYMS[token];
    if (syns) {
      for (const s of syns) expanded.add(s);
    }
  }

  return {
    original: query,
    expanded: [...expanded].join(" "),
    tokens: [...expanded],
  };
}
