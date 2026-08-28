/// <reference types="node" />
/**
 * YumeEngine - Declarative Engine Rule Registry
 *
 * Derived from Detect-It-Easy & XPEViewer specifications by horsicq
 * MIT License - Copyright (c) horsicq / YumeShelf Contributors
 */

import type { GameEngineProfile, IFileSystem } from '../types.js';
import type { EngineClassificationRule, ScanContext } from './types.js';
import { PEInspector } from '../pe/pe-inspector.js';
import { Core3DAndBinaryRules } from './rules-3d-binary.js';
import { DoujinAndRPGRules } from './rules-doujin-rpg.js';
import { InteractiveFictionAndWebRules } from './rules-if-web.js';

export class EngineRuleRegistry {
  private rules: EngineClassificationRule[] = [];

  constructor() {
    // Register standard default rule groups
    for (const rule of Core3DAndBinaryRules) {
      this.registerRule(rule);
    }
    for (const rule of DoujinAndRPGRules) {
      this.registerRule(rule);
    }
    for (const rule of InteractiveFictionAndWebRules) {
      this.registerRule(rule);
    }
  }

  /**
   * Registers a new engine classification rule with prioritized insertion.
   */
  public registerRule(rule: EngineClassificationRule): void {
    // Keep rules sorted ascending by priority number
    const index = this.rules.findIndex((r) => r.priority > rule.priority);
    if (index === -1) {
      this.rules.push(rule);
    } else {
      this.rules.splice(index, 0, rule);
    }
  }

  /**
   * Clears all registered rules (useful for testing custom rule sets).
   */
  public clearRules(): void {
    this.rules = [];
  }

  /**
   * Gets a readonly snapshot of currently registered rules.
   */
  public getRules(): readonly EngineClassificationRule[] {
    return this.rules;
  }

  /**
   * Evaluates all registered classification rules against the scan context.
   * Pre-computes normalized filename and extension Sets once to eliminate allocations during rule loops.
   */
  public async resolve(
    pe: PEInspector,
    exePath: string,
    parentFiles: string[] = [],
    fs?: IFileSystem
  ): Promise<GameEngineProfile> {
    // Normalize path and extract filename
    const normalizedExePath = exePath.replace(/\\/g, '/');
    const pathParts = normalizedExePath.split('/');
    const exeName = (pathParts[pathParts.length - 1] || '').toLowerCase();
    const parentDir = pathParts.slice(0, -1).join('/');

    // 1. Pre-compute O(1) Sets once per scan context to eliminate temporary array allocations
    const filesLowerSet = new Set<string>();
    const extensionsSet = new Set<string>();

    for (const file of parentFiles) {
      const lower = file.toLowerCase();
      filesLowerSet.add(lower);
      const dotIdx = lower.lastIndexOf('.');
      if (dotIdx !== -1) {
        extensionsSet.add(lower.slice(dotIdx));
      }
    }

    const ctx: ScanContext = {
      exePath: normalizedExePath,
      exeName,
      parentDir,
      parentFiles,
      filesLowerSet,
      extensionsSet,
      pe,
      fs,
    };

    // 2. Sequentially evaluate rules in priority order
    for (const rule of this.rules) {
      const matchResult = await rule.match(ctx);
      if (matchResult) {
        return matchResult;
      }
    }

    // 3. Fallback profile if no rule matched
    const is64 = pe.is64Bit;
    const arch = is64 ? 'x64' : (pe.coffHeader.machine === 0x014c ? 'x86' : 'unknown');

    return {
      tag: 'Others',
      family: 'native',
      variant: 'custom',
      arch,
      runtime: 'native',
      saveStrategy: 'unknown',
      detectedBy: pe.isValid ? 'Native PE Executable (Unclassified)' : 'Fallback Unrecognized Binary',
    };
  }
}

// Global default singleton registry instance
export const defaultRuleRegistry = new EngineRuleRegistry();
