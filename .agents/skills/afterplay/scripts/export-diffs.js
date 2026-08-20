#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  let targetRef = null;
  let outputPath = null;
  let updateMode = false;
  let jsonOutput = false;
  let cleanMode = false;
  let fileFilter = null;
  let cwd = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--update' || arg === '-u') {
      updateMode = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--clean') {
      cleanMode = true;
    } else if (arg === '--output' || arg === '-o' || arg === '--out') {
      outputPath = args[i + 1];
      i++;
    } else if (arg.startsWith('--output=') || arg.startsWith('-o=') || arg.startsWith('--out=')) {
      outputPath = arg.split('=')[1];
    } else if (arg === '--files' || arg === '-f') {
      fileFilter = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
      i++;
    } else if (arg.startsWith('--files=') || arg.startsWith('-f=')) {
      fileFilter = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--cwd' || arg === '-C') {
      cwd = path.resolve(args[i + 1]);
      i++;
    } else if (!arg.startsWith('-')) {
      targetRef = arg;
    }
  }

  return { targetRef, outputPath, updateMode, jsonOutput, cleanMode, fileFilter, cwd };
}

function printHelp() {
  console.log("Usage: node export-diffs.js [TARGET_REF] -o <OUTPUT_DIR> [options]");
  console.log("\nOptions:");
  console.log("  -o, --output <dir>        Output directory for exported .diff files (Required)");
  console.log("  -u, --update              Incremental update mode (only re-exports changed diffs)");
  console.log("  --json                    Output JSON manifest of exported diffs");
  console.log("  --clean                   Purge existing .diff files in output directory before exporting");
  console.log("  -f, --files <list>        Comma-separated list of target files to filter");
  console.log("  -C, --cwd <dir>           Target Git repository directory (Default: current directory)");
  console.log("  -h, --help                Show this help message and exit");
  console.log("\nExamples:");
  console.log("  node export-diffs.js origin/trunk -o \"<appDataDir>/brain/<id>\"");
  console.log("  node export-diffs.js 24f01a07 -o \"<appDataDir>/brain/<id>\" --update --json");
}

function getGitDiffFiles(targetRef, cwd) {
  try {
    const ref = targetRef || 'origin/HEAD';
    const cmd = `git diff --name-only ${ref} HEAD`;
    const output = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return output.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (err) {
    try {
      const ref = targetRef || 'HEAD~1';
      const cmd = `git diff --name-only ${ref} HEAD`;
      const output = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return output.split('\n').map(l => l.trim()).filter(Boolean);
    } catch (fallbackErr) {
      console.error(`[-] Error executing git diff: ${err.message} (${fallbackErr.message})`);
      process.exit(1);
    }
  }
}

function getSingleFileDiff(targetRef, relPath, cwd) {
  try {
    const ref = targetRef || 'origin/HEAD';
    const cmd = `git diff ${ref} HEAD -- "${relPath}"`;
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    if (process.env.DEBUG) {
      console.error(`Failed to get diff for ${relPath}:`, err.message);
    }
    return "";
  }
}

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function getSanitizedDiffFilename(relPath, existingNames) {
  const base = path.basename(relPath);
  let name = `${base}.diff`;
  if (existingNames.has(name)) {
    const prefix = relPath.replace(/[\\/]/g, '_');
    name = `${prefix}.diff`;
  }
  existingNames.add(name);
  return name;
}

function main() {
  const { targetRef, outputPath, updateMode, jsonOutput, cleanMode, fileFilter, cwd } = parseArgs();

  if (!outputPath) {
    console.error("[-] Error: Missing output directory (-o, --output).");
    printHelp();
    process.exit(1);
  }

  const absOutputDir = path.resolve(outputPath);
  if (!fs.existsSync(absOutputDir)) {
    fs.mkdirSync(absOutputDir, { recursive: true });
  } else if (cleanMode) {
    const existing = fs.readdirSync(absOutputDir);
    for (const f of existing) {
      if (f.endsWith('.diff')) {
        fs.unlinkSync(path.join(absOutputDir, f));
      }
    }
  }

  const allFiles = getGitDiffFiles(targetRef, cwd);
  let targetFiles = allFiles;

  if (fileFilter && fileFilter.length > 0) {
    targetFiles = allFiles.filter(f => fileFilter.some(filter => f.includes(filter)));
  }

  const existingNames = new Set();
  const manifest = [];

  for (const relPath of targetFiles) {
    const absSourcePath = path.resolve(cwd, relPath);
    const diffContent = getSingleFileDiff(targetRef, relPath, cwd);
    const diffFileName = getSanitizedDiffFilename(relPath, existingNames);
    const absDiffPath = path.join(absOutputDir, diffFileName);
    const newHash = computeHash(diffContent);

    let isUpdated = true;
    let status = 'NEW';

    if (fs.existsSync(absDiffPath)) {
      const existingContent = fs.readFileSync(absDiffPath, 'utf8');
      const oldHash = computeHash(existingContent);
      if (oldHash === newHash) {
        isUpdated = false;
        status = 'UNCHANGED';
      } else {
        status = 'MODIFIED';
      }
    }

    if (!updateMode || isUpdated) {
      fs.writeFileSync(absDiffPath, diffContent, 'utf8');
    }

    manifest.push({
      targetFile: absSourcePath,
      relativePath: relPath,
      diffFile: absDiffPath,
      diffFileName: diffFileName,
      status: status,
      isUpdated: isUpdated,
      checksum: newHash
    });
  }

  if (updateMode && fs.existsSync(absOutputDir)) {
    const currentDiffFiles = new Set(manifest.map(m => m.diffFileName));
    const diskFiles = fs.readdirSync(absOutputDir);
    for (const f of diskFiles) {
      if (f.endsWith('.diff') && !currentDiffFiles.has(f)) {
        fs.unlinkSync(path.join(absOutputDir, f));
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      targetRef: targetRef || 'auto',
      totalFiles: manifest.length,
      updatedCount: manifest.filter(m => m.isUpdated).length,
      diffs: manifest
    }, null, 2));
  } else {
    console.log(`[+] Exported ${manifest.length} diff file(s) to: ${absOutputDir}`);
    for (const item of manifest) {
      const tag = item.isUpdated ? `[${item.status}]` : `[UNCHANGED]`;
      console.log(`    ${tag} ${item.relativePath} -> ${item.diffFileName}`);
    }
  }
}

main();
