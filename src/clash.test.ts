import { describe, expect, it } from 'vitest';
import { mergeClashConfigs } from './clash.js';

describe('mergeClashConfigs', () => {
  it('merges proxies, proxy groups, and dedupes rules against custom rules', () => {
    const primary = `
port: 7890
proxies:
  - {name: Base Node, type: ss, server: base.example, port: 443, cipher: aes-256-gcm, password: secret}
proxy-groups:
  - name: Main Group
    type: select
    proxies:
      - Base Node
      - DIRECT
rules:
  - DOMAIN-SUFFIX,example.com,DIRECT
  - MATCH,Main Group
`;

    const secondary = `
proxies:
- {name: Extra Node, type: trojan, server: extra.example, port: 443, password: secret}
proxy-groups:
- name: Extra Group
  type: select
  proxies:
  - Extra Node
  - DIRECT
rules:
- DOMAIN-SUFFIX,grok.com,⚡️ 代理
- DOMAIN-SUFFIX,example.com,⚡️ 代理
- MATCH,Extra Group
`;

    const output = mergeClashConfigs([primary, secondary], [
      ' - DOMAIN-SUFFIX,grok.com,DIRECT',
      ' - IP-CIDR,1.2.3.4/32,DIRECT,no-resolve'
    ]);

    expect(output).toContain('name: Extra Group');
    expect(output).toContain('name: Extra Node');
    expect(output).toContain(' DOMAIN-SUFFIX,grok.com,DIRECT');
    expect(output).toContain(' DOMAIN-SUFFIX,example.com,DIRECT');
    expect(output).toContain(' IP-CIDR,1.2.3.4/32,DIRECT,no-resolve');
    expect(output).not.toContain(' DOMAIN-SUFFIX,grok.com,⚡️ 代理');

    const exampleMatches = output.match(/DOMAIN-SUFFIX,example\.com/g) ?? [];
    expect(exampleMatches).toHaveLength(1);
  });

  it('reindents secondary block-style proxies to match primary indent', () => {
    const primary = `
port: 7890
proxies:
  - {name: Base Node, type: ss, server: base.example, port: 443, cipher: aes-256-gcm, password: secret}
proxy-groups:
  - name: Main Group
    type: select
    proxies:
      - Base Node
      - DIRECT
rules:
  - DOMAIN-SUFFIX,example.com,DIRECT
  - MATCH,Main Group
`;

    const secondary = `
proxies:
- name: Extra Node
  type: trojan
  server: extra.example
  port: 443
  password: secret
proxy-groups:
- name: Extra Group
  type: select
  proxies:
  - Extra Node
  - DIRECT
rules:
- DOMAIN-SUFFIX,grok.com,Extra Group
- MATCH,Extra Group
`;

    const output = mergeClashConfigs([primary, secondary], []);
    // The multi-line proxy block must be re-indented to 2 spaces
    expect(output).toContain('  - name: Extra Node\n    type: trojan');
    expect(output).not.toContain('\n- name: Extra Node');
    // proxy-groups must also be re-indented
    expect(output).toContain('  - name: Extra Group\n    type: select');
  });

  it('filters info-only proxy nodes and removes their refs from proxy-groups', () => {
    const primary = `
port: 7890
proxies:
  - {name: Real Node, type: ss, server: real.example, port: 443, cipher: aes-256-gcm, password: secret}
proxy-groups:
  - name: Main Group
    type: select
    proxies:
      - Real Node
      - DIRECT
rules:
  - MATCH,Main Group
`;

    const secondary = `
proxies:
- name: 当前网址：example.com
  type: trojan
  server: info.example
  port: 443
  password: x
- name: 剩余流量：10G
  type: trojan
  server: info.example
  port: 443
  password: x
- name: 套餐到期：2026-12-01
  type: trojan
  server: info.example
  port: 443
  password: x
- name: Real Secondary
  type: trojan
  server: secondary.example
  port: 443
  password: x
proxy-groups:
- name: Secondary Group
  type: select
  proxies:
  - 当前网址：example.com
  - 剩余流量：10G
  - 套餐到期：2026-12-01
  - Real Secondary
  - Real Node
rules:
- MATCH,Secondary Group
`;

    const output = mergeClashConfigs([primary, secondary], []);
    // Info nodes should be filtered from proxies
    expect(output).not.toContain('当前网址');
    expect(output).not.toContain('剩余流量');
    expect(output).not.toContain('套餐到期');
    // Real secondary proxy should remain
    expect(output).toContain('Real Secondary');
    // Info node refs should be removed from proxy-groups
    expect(output).toContain('  - name: Secondary Group');
    // The group should still contain real proxies
    expect(output).toContain('Real Secondary');
  });

  it('moves secondary proxy group nodes into primary selection group', () => {
    const primary = `
port: 7890
proxies:
  - {name: Base Node, type: ss, server: base.example, port: 443, cipher: aes-256-gcm, password: secret}
proxy-groups:
  - name: 🔰 选择节点
    type: select
    proxies:
      - Base Node
      - DIRECT
rules:
  - MATCH,🔰 选择节点
`;

    const secondary = `
proxies:
- name: Secondary One
  type: trojan
  server: one.example
  port: 443
  password: x
- name: Secondary Two
  type: trojan
  server: two.example
  port: 443
  password: x
proxy-groups:
- name: "⚡️ 代理"
  type: select
  proxies:
  - Secondary One
  - Secondary Two
rules:
- DOMAIN-SUFFIX,grok.com,⚡️ 代理
- IP-CIDR,1.2.3.4/32,⚡️ 代理,no-resolve
`;

    const output = mergeClashConfigs([primary, secondary], []);

    expect(output).toContain('  - name: 🔰 选择节点');
    expect(output).toContain('      - Secondary One');
    expect(output).toContain('      - Secondary Two');
    expect(output).not.toContain('name: "⚡️ 代理"');
    expect(output).not.toContain('DOMAIN-SUFFIX,grok.com,⚡️ 代理');
    expect(output).toContain('DOMAIN-SUFFIX,grok.com,🔰 选择节点');
    expect(output).not.toContain('IP-CIDR,1.2.3.4/32,⚡️ 代理,no-resolve');
    expect(output).toContain('IP-CIDR,1.2.3.4/32,🔰 选择节点,no-resolve');
  });

  it('prioritizes US West and US nodes in the primary selection group', () => {
    const primary = `
port: 7890
proxies:
  - {name: 香港 Node, type: ss, server: hk.example, port: 443, cipher: aes-256-gcm, password: secret}
  - {name: 美国 Node, type: ss, server: us.example, port: 443, cipher: aes-256-gcm, password: secret}
proxy-groups:
  - name: 🔰 选择节点
    type: select
    proxies:
      - 香港 Node
      - 美国 Node
      - DIRECT
rules:
  - MATCH,🔰 选择节点
`;

    const secondary = `
proxies:
- name: x1.0 日本 - 中转1
  type: trojan
  server: jp.example
  port: 443
  password: x
- name: x1.0 美西 - 中转1
  type: trojan
  server: usw.example
  port: 443
  password: x
proxy-groups:
- name: "⚡️ 代理"
  type: select
  proxies:
  - x1.0 日本 - 中转1
  - x1.0 美西 - 中转1
rules:
- MATCH,⚡️ 代理
`;

    const output = mergeClashConfigs([primary, secondary], []);
    const groupStart = output.indexOf('  - name: 🔰 选择节点');
    const usIndex = output.indexOf('      - 美国 Node', groupStart);
    const usWestIndex = output.indexOf('      - x1.0 美西 - 中转1', groupStart);
    const hkIndex = output.indexOf('      - 香港 Node', groupStart);
    const jpIndex = output.indexOf('      - x1.0 日本 - 中转1', groupStart);

    expect(usIndex).toBeGreaterThan(groupStart);
    expect(usWestIndex).toBeGreaterThan(groupStart);
    expect(usIndex).toBeLessThan(hkIndex);
    expect(usWestIndex).toBeLessThan(jpIndex);
  });
});
