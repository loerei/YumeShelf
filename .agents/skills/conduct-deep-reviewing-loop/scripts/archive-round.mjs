#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function printUsage() {
  console.log(`Usage: node archive-round.mjs --review-dir <path> --target <path> --round <N> [--vault-dir <path>] [--pause]`);
  process.exit(1);
}

const args = process.argv.slice(2);
let reviewDir = null;
let target = null;
let round = null;
let vaultDir = null;
let pause = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--review-dir' && args[i + 1]) {
    reviewDir = args[++i];
  } else if (args[i] === '--target' && args[i + 1]) {
    target = args[++i];
  } else if (args[i] === '--round' && args[i + 1]) {
    round = parseInt(args[++i], 10);
  } else if (args[i] === '--vault-dir' && args[i + 1]) {
    vaultDir = args[++i];
  } else if (args[i] === '--pause') {
    pause = true;
  } else if (args[i] === '-h' || args[i] === '--help') {
    printUsage();
  }
}

if (!reviewDir || !target || round === null || isNaN(round)) {
  console.error('Error: --review-dir, --target, and --round are all required.');
  printUsage();
}

const resolvedReviewDir = path.resolve(reviewDir);
if (!fs.existsSync(resolvedReviewDir) || !fs.statSync(resolvedReviewDir).isDirectory()) {
  console.error(`Error: Review directory does not exist: ${resolvedReviewDir}`);
  process.exit(1);
}

const resolvedTarget = path.resolve(target);
if (!fs.existsSync(resolvedTarget)) {
  console.error(`Error: Target DA does not exist: ${resolvedTarget}`);
  process.exit(1);
}

// 1. Determine Vault Base
const leaf = path.basename(resolvedReviewDir);
const vaultName = leaf.replace(/^deep-review-/, 'deep-review-trace-');
if (!vaultDir || !vaultDir.trim()) {
  vaultDir = `/tmp/${vaultName}`;
}
const resolvedVaultDir = path.resolve(vaultDir);

// Guard against empty path or filesystem root (e.g. D:\ or /)
const vaultRoot = path.parse(resolvedVaultDir).root;
if (resolvedVaultDir === vaultRoot || !resolvedVaultDir) {
  console.error(`Error: Vault directory cannot be empty or filesystem root: ${resolvedVaultDir}`);
  process.exit(1);
}

const roundStr = round < 10 ? `round-0${round}` : `round-${round}`;
const roundBase = path.join(resolvedVaultDir, roundStr);

const roundBaseRoot = path.parse(roundBase).root;
if (roundBase === roundBaseRoot || !roundBase) {
  console.error(`Error: Target archival base cannot be empty or filesystem root: ${roundBase}`);
  process.exit(1);
}

const reportsFinalDir = path.join(roundBase, 'reports-final');
const negotiationTraceDir = path.join(roundBase, 'negotiation-trace');
const sandboxDir = path.join(roundBase, 'sandbox');
const daSnapshotDir = path.join(roundBase, 'da-snapshot');
const daPreMutationDir = path.join(roundBase, 'da-pre-mutation');

fs.mkdirSync(roundBase, { recursive: true });
fs.mkdirSync(reportsFinalDir, { recursive: true });
fs.mkdirSync(negotiationTraceDir, { recursive: true });
fs.mkdirSync(sandboxDir, { recursive: true });
fs.mkdirSync(daSnapshotDir, { recursive: true });
fs.mkdirSync(daPreMutationDir, { recursive: true });

// 2. Round 1 Rationale copy
const rationaleSrc = path.join(resolvedReviewDir, 'host', 'Reviewer_Choice_Rationale.md');
if (round === 1 && fs.existsSync(rationaleSrc)) {
  const initialContextDir = path.join(resolvedVaultDir, '00-initial-context');
  fs.mkdirSync(initialContextDir, { recursive: true });
  fs.copyFileSync(rationaleSrc, path.join(initialContextDir, 'Reviewer_Choice_Rationale.md'));
}

// 3. Copy State.md and Analyzation.md
const stateSrc = path.join(resolvedReviewDir, 'host', 'State.md');
if (fs.existsSync(stateSrc)) {
  fs.copyFileSync(stateSrc, path.join(roundBase, 'State.md'));
}
const analyzationSrc = path.join(resolvedReviewDir, 'host', 'Analyzation.md');
if (fs.existsSync(analyzationSrc)) {
  fs.copyFileSync(analyzationSrc, path.join(roundBase, 'Analyzation.md'));
}

// 4. Move directory contents
function moveDirContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    const srcItem = path.join(srcDir, item);
    const destItem = path.join(destDir, item);
    fs.renameSync(srcItem, destItem);
  }
}

moveDirContents(path.join(resolvedReviewDir, 'reports'), reportsFinalDir);
moveDirContents(path.join(resolvedReviewDir, 'host', 'trace'), negotiationTraceDir);
moveDirContents(path.join(resolvedReviewDir, 'sandbox'), sandboxDir);

// 5. Snapshot Target DAs & .bak.md handling
const allBakFiles = [];

// Context.bak.md handling
const contextBak = path.join(resolvedReviewDir, 'Context.bak.md');
const contextFile = path.join(resolvedReviewDir, 'Context.md');
if (fs.existsSync(contextBak)) {
  if (fs.existsSync(contextFile)) {
    fs.copyFileSync(contextFile, path.join(daSnapshotDir, 'Context.md'));
  }
  fs.copyFileSync(contextBak, path.join(daPreMutationDir, 'Context.bak.md'));
  allBakFiles.push(contextBak);
}

if (fs.statSync(resolvedTarget).isDirectory()) {
  function scanDir(currentDir) {
    for (const item of fs.readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (item.endsWith('.bak.md')) {
        allBakFiles.push(fullPath);
        fs.copyFileSync(fullPath, path.join(daPreMutationDir, item));
      } else if (item.endsWith('.md')) {
        const relPath = path.relative(resolvedTarget, fullPath);
        const destPath = path.join(daSnapshotDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(fullPath, destPath);
      }
    }
  }
  scanDir(resolvedTarget);
} else {
  // Single file target
  fs.copyFileSync(resolvedTarget, path.join(daSnapshotDir, path.basename(resolvedTarget)));
  const parentDir = path.dirname(resolvedTarget);
  const stem = path.basename(resolvedTarget, path.extname(resolvedTarget));
  for (const item of fs.readdirSync(parentDir)) {
    if (item.startsWith(stem) && item.endsWith('.bak.md')) {
      const fullPath = path.join(parentDir, item);
      allBakFiles.push(fullPath);
      fs.copyFileSync(fullPath, path.join(daPreMutationDir, item));
    }
  }
}

// 6. Cleanup .bak.md unless pause is set
if (!pause) {
  for (const bak of allBakFiles) {
    if (fs.existsSync(bak)) {
      fs.rmSync(bak, { force: true });
    }
  }
}

// 7. Purge host/Analyzation.md
if (fs.existsSync(analyzationSrc)) {
  fs.rmSync(analyzationSrc, { force: true });
}

console.log(`[OK] Archived Round ${round} to ${roundBase}`);
