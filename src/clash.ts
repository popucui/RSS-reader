import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const defaultCustomRules = `# Put your highest-priority custom Clash rules here.
# These rules are inserted immediately after \`rules:\`, before provider rules.

- IP-CIDR,107.174.76.239/32,DIRECT,no-resolve
- DOMAIN-SUFFIX,grok.com,🔰 选择节点
- DOMAIN-SUFFIX,krx18.com,🔰 选择节点
- DOMAIN-SUFFIX,gemini.com,🔰 选择节点
- DOMAIN-SUFFIX,scmp.com,🔰 选择节点
- DOMAIN-SUFFIX,grokipedia.com,🔰 选择节点
- DOMAIN-SUFFIX,tabbitbrowser.com,🔰 选择节点
- DOMAIN-SUFFIX,tabbit-ai.com,🔰 选择节点
`;

const markerBegin = ' # CUSTOM-RULES-BEGIN';
const markerEnd = ' # CUSTOM-RULES-END';

export interface ClashState {
  rules: string;
  sourceConfigured: boolean;
  refreshIntervalMinutes: number;
  configExists: boolean;
  configUpdatedAt: string | null;
  lastRefreshAttemptAt: string | null;
  lastRefreshSuccessAt: string | null;
  lastRefreshErrorAt: string | null;
  lastRefreshError: string | null;
  configUrl: string;
  importUrl: string;
}

export interface ClashGenerateResult {
  ok: true;
  ruleCount: number;
  configUrl: string;
  importUrl: string;
  updatedAt: string;
}

const clashDir = path.resolve(process.cwd(), 'data/clash');
const customRulesPath = path.join(clashDir, 'custom_rules.yaml');
const generatedConfigPath = path.join(clashDir, 'iKuuu_V2.custom.yaml');
const refreshStatusPath = path.join(clashDir, 'status.json');

interface ClashRefreshStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

const emptyRefreshStatus: ClashRefreshStatus = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null
};

export function getPublicConfigPath(): string {
  return '/clash/config.yaml';
}

export function getPublicImportPath(origin: string): string {
  const configUrl = new URL(getPublicConfigPath(), origin).toString();
  return `clash://install-config?url=${encodeURIComponent(configUrl)}`;
}

export async function readClashState(origin: string): Promise<ClashState> {
  await ensureCustomRulesFile();
  const rules = await fs.readFile(customRulesPath, 'utf8');
  const stat = await fs.stat(generatedConfigPath).catch(() => null);
  const refreshStatus = await readRefreshStatus();
  const configUrl = new URL(getPublicConfigPath(), origin).toString();
  return {
    rules,
    sourceConfigured: Boolean(config.clashSourceUrl),
    refreshIntervalMinutes: config.clashRefreshIntervalMinutes,
    configExists: Boolean(stat),
    configUpdatedAt: stat ? stat.mtime.toISOString() : null,
    lastRefreshAttemptAt: refreshStatus.lastAttemptAt,
    lastRefreshSuccessAt: refreshStatus.lastSuccessAt,
    lastRefreshErrorAt: refreshStatus.lastErrorAt,
    lastRefreshError: refreshStatus.lastError,
    configUrl,
    importUrl: getPublicImportPath(origin)
  };
}

export async function saveCustomRules(rules: string): Promise<void> {
  validateCustomRules(rules);
  await fs.mkdir(clashDir, { recursive: true });
  await fs.writeFile(customRulesPath, normalizeTrailingNewline(rules), 'utf8');
}

export async function generateClashConfig(origin: string): Promise<ClashGenerateResult> {
  const attemptedAt = new Date().toISOString();
  await writeRefreshStatus({ ...(await readRefreshStatus()), lastAttemptAt: attemptedAt });

  if (!config.clashSourceUrl) {
    const error = 'CLASH_SOURCE_URL is not configured';
    await recordRefreshError(error);
    throw new Error(error);
  }

  try {
    await ensureCustomRulesFile();
    const [sourceText, customRulesText] = await Promise.all([
      fetchSourceConfig(config.clashSourceUrl),
      fs.readFile(customRulesPath, 'utf8')
    ]);
    const customRules = parseCustomRules(customRulesText);
    const output = injectRules(sourceText, customRules);
    await fs.mkdir(clashDir, { recursive: true });
    await fs.writeFile(generatedConfigPath, output, 'utf8');
    const stat = await fs.stat(generatedConfigPath);
    const updatedAt = stat.mtime.toISOString();
    await writeRefreshStatus({
      lastAttemptAt: attemptedAt,
      lastSuccessAt: updatedAt,
      lastErrorAt: null,
      lastError: null
    });

    return {
      ok: true,
      ruleCount: customRules.length,
      configUrl: new URL(getPublicConfigPath(), origin).toString(),
      importUrl: getPublicImportPath(origin),
      updatedAt
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRefreshError(message, attemptedAt);
    throw err;
  }
}

export async function readGeneratedClashConfig(): Promise<string | null> {
  return fs.readFile(generatedConfigPath, 'utf8').catch(() => null);
}

async function ensureCustomRulesFile(): Promise<void> {
  await fs.mkdir(clashDir, { recursive: true });
  try {
    await fs.access(customRulesPath);
  } catch {
    await fs.writeFile(customRulesPath, defaultCustomRules, 'utf8');
  }
}

async function readRefreshStatus(): Promise<ClashRefreshStatus> {
  try {
    const raw = await fs.readFile(refreshStatusPath, 'utf8');
    return { ...emptyRefreshStatus, ...JSON.parse(raw) as Partial<ClashRefreshStatus> };
  } catch {
    return emptyRefreshStatus;
  }
}

async function writeRefreshStatus(status: ClashRefreshStatus): Promise<void> {
  await fs.mkdir(clashDir, { recursive: true });
  await fs.writeFile(refreshStatusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

async function recordRefreshError(message: string, attemptedAt = new Date().toISOString()): Promise<void> {
  await writeRefreshStatus({
    ...(await readRefreshStatus()),
    lastAttemptAt: attemptedAt,
    lastErrorAt: new Date().toISOString(),
    lastError: message
  });
}

async function fetchSourceConfig(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'rss-reader-clash-customizer/1.0' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    throw new Error(`Failed to download Clash source: ${response.status}`);
  }
  return response.text();
}

function validateCustomRules(rules: string): void {
  parseCustomRules(rules);
}

function parseCustomRules(rules: string): string[] {
  const parsed: string[] = [];
  for (const line of rules.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!trimmed.startsWith('- ')) {
      throw new Error(`Custom rule must start with "- ": ${line}`);
    }
    parsed.push(` ${trimmed}`);
  }
  return parsed;
}

function injectRules(configText: string, customRules: string[]): string {
  const lines = removeExistingBlock(configText.split(/\r?\n/));
  const rulesIndex = lines.findIndex((line) => line.trim() === 'rules:');
  if (rulesIndex === -1) {
    throw new Error('Source config does not contain a top-level "rules:" section');
  }
  if (customRules.length > 0) {
    lines.splice(rulesIndex + 1, 0, markerBegin, ...customRules, markerEnd);
  }
  return normalizeTrailingNewline(lines.join('\n'));
}

function removeExistingBlock(lines: string[]): string[] {
  const result: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line === markerBegin) {
      skipping = true;
      continue;
    }
    if (line === markerEnd) {
      skipping = false;
      continue;
    }
    if (!skipping) result.push(line);
  }
  if (skipping) {
    throw new Error('Custom rules block is missing its end marker');
  }
  return result;
}

function normalizeTrailingNewline(value: string): string {
  return `${value.replace(/\s+$/u, '')}\n`;
}
