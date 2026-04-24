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
const primaryProxyGroupName = '🔰 选择节点';
const secondaryProxyGroupName = '⚡️ 代理';

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
    const sourceUrls = [config.clashSourceUrl, config.clashSecondarySourceUrl].filter(Boolean);
    const [sourceTexts, customRulesText] = await Promise.all([
      Promise.all(sourceUrls.map((sourceUrl) => fetchSourceConfig(sourceUrl))),
      fs.readFile(customRulesPath, 'utf8')
    ]);
    const customRules = parseCustomRules(customRulesText);
    const output = mergeClashConfigs(sourceTexts, customRules);
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

export function mergeClashConfigs(configTexts: string[], customRules: string[]): string {
  if (configTexts.length === 0) {
    throw new Error('At least one Clash source config is required');
  }

  const [baseConfig, ...extraConfigs] = configTexts;
  const baseLines = removeExistingBlock(baseConfig.split(/\r?\n/));

  const mergedProxies = filterInfoProxies(dedupeNamedBlocks([
    ...collectSectionBlocks(baseLines, 'proxies'),
    ...extraConfigs.flatMap((configText) => collectSectionBlocks(configText.split(/\r?\n/), 'proxies'))
  ]));
  replaceSection(baseLines, 'proxies', mergedProxies);

  const infoNames = new Set(mergedProxies.infoNames);
  const mergedProxyGroups = mergeProxyGroupRefs(removeInfoProxyRefs(dedupeNamedBlocks([
    ...collectSectionBlocks(baseLines, 'proxy-groups'),
    ...extraConfigs.flatMap((configText) => collectSectionBlocks(configText.split(/\r?\n/), 'proxy-groups'))
  ]), infoNames), secondaryProxyGroupName, primaryProxyGroupName);
  replaceSection(baseLines, 'proxy-groups', mergedProxyGroups);

  const sourceRules = dedupeRules([
    ...collectRuleLines(baseLines),
    ...extraConfigs.flatMap((configText) => collectRuleLines(configText.split(/\r?\n/)))
  ]);
  const mergedRules = dedupeRules([...customRules, ...sourceRules]).map((rule) =>
    replaceRuleTarget(rule, secondaryProxyGroupName, primaryProxyGroupName)
  );
  return injectRules(replaceRulesSection(baseLines), mergedRules);
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

function replaceRulesSection(lines: string[]): string {
  const range = findSectionRange(lines, 'rules');
  if (!range) {
    throw new Error('Source config does not contain a top-level "rules:" section');
  }
  const nextLines = [...lines];
  nextLines.splice(range.start + 1, range.end - range.start - 1);
  return normalizeTrailingNewline(nextLines.join('\n'));
}

function replaceSection(lines: string[], section: string, blocks: string[][]): void {
  const range = findSectionRange(lines, section);
  if (!range) return;
  const sectionLines = lines.slice(range.start + 1, range.end);
  const targetIndent = findItemIndent(sectionLines) ?? 2;
  const reindented = blocks.map((block) => reindentBlock(block, targetIndent));
  lines.splice(range.start + 1, range.end - range.start - 1, ...reindented.flat());
}

function reindentBlock(block: string[], targetIndent: number): string[] {
  const blockIndent = indentWidth(block[0]);
  const delta = targetIndent - blockIndent;
  if (delta === 0) return block;
  return block.map((line) => {
    if (!line.trim()) return line;
    const currentIndent = indentWidth(line);
    return ' '.repeat(Math.max(0, currentIndent + delta)) + line.trimStart();
  });
}

function collectSectionBlocks(lines: string[], section: string): string[][] {
  const range = findSectionRange(lines, section);
  if (!range) return [];
  const sectionLines = lines.slice(range.start + 1, range.end);
  const itemIndent = findItemIndent(sectionLines);
  if (itemIndent === null) return [];

  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of sectionLines) {
    if (indentWidth(line) === itemIndent && line.trim().startsWith('- ')) {
      if (current.length > 0) blocks.push(current);
      current = [line];
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function collectRuleLines(lines: string[]): string[] {
  return collectSectionBlocks(lines, 'rules')
    .map((block) => block[0])
    .filter((line) => line.trim().startsWith('- '));
}

const infoProxyPattern = /网址|流量|到期|重置|剩余|套餐|过期|官网|群|频道|发布/;

function filterInfoProxies(blocks: string[][]): string[][] & { infoNames: string[] } {
  const infoNames: string[] = [];
  const filtered = blocks.filter((block) => {
    const name = extractName(block);
    if (name && infoProxyPattern.test(name)) {
      infoNames.push(name);
      return false;
    }
    return true;
  });
  return Object.assign(filtered, { infoNames });
}

function removeInfoProxyRefs(blocks: string[][], infoNames: Set<string>): string[][] {
  if (infoNames.size === 0) return blocks;
  return blocks.map((block) => {
    const name = extractName(block);
    if (name && infoNames.has(name)) return block;
    return block.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) return true;
      const refName = trimmed.slice(2).replace(/^["']|["']$/g, '');
      return !infoNames.has(refName);
    });
  });
}

function mergeProxyGroupRefs(blocks: string[][], sourceName: string, targetName: string): string[][] {
  const target = blocks.find((block) => extractName(block) === targetName);
  const source = blocks.find((block) => extractName(block) === sourceName);
  const sourceRefs = source ? collectProxyRefs(source) : [];

  if (target && sourceRefs.length > 0) {
    appendProxyRefs(target, sourceRefs);
  }
  if (target) {
    prioritizeProxyRefs(target, (name) => /美西|美国/.test(name));
  }

  const merged = blocks
    .filter((block) => extractName(block) !== sourceName)
    .map((block) => rewriteProxyGroupRefs(block, sourceName, targetName));

  return merged;
}

function collectProxyRefs(block: string[]): string[] {
  const range = findNestedListRange(block, 'proxies');
  if (!range) return [];

  const refs: string[] = [];
  for (const line of block.slice(range.start + 1, range.end)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    refs.push(unquoteYamlValue(trimmed.slice(2)));
  }
  return refs;
}

function appendProxyRefs(block: string[], refs: string[]): void {
  const range = findNestedListRange(block, 'proxies');
  if (!range) return;

  const existing = new Set(collectProxyRefs(block));
  const itemIndent = findItemIndent(block.slice(range.start + 1, range.end)) ?? indentWidth(block[range.start]) + 2;
  const newLines = refs
    .filter((ref) => !existing.has(ref))
    .map((ref) => `${' '.repeat(itemIndent)}- ${ref}`);
  block.splice(range.end, 0, ...newLines);
}

function prioritizeProxyRefs(block: string[], isPriority: (name: string) => boolean): void {
  const range = findNestedListRange(block, 'proxies');
  if (!range) return;

  const refLines = block.slice(range.start + 1, range.end);
  const itemIndent = findItemIndent(refLines);
  if (itemIndent === null) return;

  const items = refLines.filter((line) => indentWidth(line) === itemIndent && line.trim().startsWith('- '));
  const priority = items.filter((line) => isPriority(unquoteYamlValue(line.trim().slice(2))));
  const rest = items.filter((line) => !isPriority(unquoteYamlValue(line.trim().slice(2))));
  block.splice(range.start + 1, range.end - range.start - 1, ...priority, ...rest);
}

function rewriteProxyGroupRefs(block: string[], from: string, to: string): string[] {
  return block.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) return line;
    const value = unquoteYamlValue(trimmed.slice(2));
    if (value !== from) return line;
    return `${line.slice(0, line.indexOf('- '))}- ${to}`;
  });
}

function replaceRuleTarget(rule: string, from: string, to: string): string {
  const trimmed = rule.trim();
  if (!trimmed.startsWith('- ')) return rule;
  const body = trimmed.slice(2);
  const parts = body.split(',');
  if (parts.length < 2) return rule;
  const targetIndex = parts.findIndex((part, index) => index > 0 && part.trim() === from);
  if (targetIndex === -1) return rule;
  parts[targetIndex] = to;
  return ` - ${parts.join(',')}`;
}

function findNestedListRange(block: string[], key: string): { start: number; end: number } | null {
  const start = block.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return null;

  const keyIndent = indentWidth(block[start]);
  let end = block.length;
  for (let index = start + 1; index < block.length; index += 1) {
    const line = block[index];
    if (!line.trim()) continue;
    const lineIndent = indentWidth(line);
    if (lineIndent <= keyIndent && !line.trim().startsWith('- ')) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function unquoteYamlValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

function dedupeNamedBlocks(blocks: string[][]): string[][] {
  const seen = new Set<string>();
  const deduped: string[][] = [];
  for (const block of blocks) {
    const name = extractName(block);
    const key = name ?? block.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(block);
  }
  return deduped;
}

function dedupeRules(rules: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const rule of rules) {
    const trimmed = rule.trim();
    if (!trimmed.startsWith('- ')) continue;
    const key = ruleIdentity(trimmed.slice(2));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(` ${trimmed}`);
  }
  return deduped;
}

function extractName(block: string[]): string | null {
  for (const line of block) {
    const trimmed = line.trim();
    const inline = trimmed.match(/^- \{[^}]*name:\s*("?)([^",}]+)\1/);
    if (inline) return inline[2].trim();

    const direct = trimmed.match(/^- name:\s*["']?(.*?)["']?$/);
    if (direct) return direct[1].trim();

    const nested = trimmed.match(/^name:\s*["']?(.*?)["']?$/);
    if (nested) return nested[1].trim();
  }
  return null;
}

function ruleIdentity(rule: string): string {
  const parts = rule.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return rule;
  if (parts[0] === 'MATCH') return 'MATCH';

  const simpleTypes = new Set([
    'DOMAIN',
    'DOMAIN-SUFFIX',
    'DOMAIN-KEYWORD',
    'GEOSITE',
    'GEOIP',
    'SRC-GEOIP',
    'IP-CIDR',
    'IP-CIDR6',
    'SRC-IP-CIDR',
    'DST-PORT',
    'SRC-PORT',
    'PROCESS-NAME',
    'PROCESS-PATH',
    'RULE-SET',
    'NETWORK',
    'IN-TYPE',
    'IN-PORT'
  ]);

  if (parts.length >= 2 && simpleTypes.has(parts[0])) {
    return `${parts[0]},${parts[1]}`;
  }
  return rule;
}

function findSectionRange(lines: string[], section: string): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.trim() === `${section}:`);
  if (start === -1) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (indentWidth(line) === 0 && /^[^-\s][^:]*:/.test(line)) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function findItemIndent(lines: string[]): number | null {
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.trim().startsWith('- ')) return indentWidth(line);
  }
  return null;
}

function indentWidth(line: string): number {
  return line.length - line.trimStart().length;
}

function normalizeTrailingNewline(value: string): string {
  return `${value.replace(/\s+$/u, '')}\n`;
}
