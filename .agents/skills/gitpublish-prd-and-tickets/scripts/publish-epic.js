#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function printUsage() {
    console.log(`
Usage:
  node publish-epic.js <path-to-prd-or-epic-dir> [options]
  node publish-epic.js <specs-root-dir> --all [options]

Options:
  --parent-id <id>          Existing parent PRD issue ID on GitHub (if already created)
  --repo <owner/repo>       GitHub repository target (default: current git origin)
  --concurrency <N>         Maximum parallel GitHub API workers (default: 6)
  --all                     Batch publish / reconcile all Epics found in the target directory
  --dry-run                 Simulate reconciliation, topological sorting, and key replacements without calling GitHub CLI
  --help, -h                Show this help message
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
}

let targetPath = null;
let parentId = null;
let repo = null;
let concurrency = 6;
let isAll = false;
let isDryRun = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--parent-id' && args[i + 1]) {
        parentId = parseInt(args[++i], 10);
    } else if (args[i] === '--repo' && args[i + 1]) {
        repo = args[++i];
    } else if (args[i] === '--concurrency' && args[i + 1]) {
        concurrency = Math.max(1, parseInt(args[++i], 10) || 6);
    } else if (args[i] === '--all') {
        isAll = true;
    } else if (args[i] === '--dry-run') {
        isDryRun = true;
    } else if (!args[i].startsWith('--') && !targetPath) {
        targetPath = args[i];
    }
}

if (!targetPath) {
    console.error('Error: Missing target PRD file or Epic directory path.');
    printUsage();
}

const env = { ...process.env };
delete env.GITHUB_TOKEN;

async function runGh(ghArgs) {
    if (isDryRun) {
        return `[DRY-RUN gh ${ghArgs.join(' ')}]`;
    }
    try {
        const { stdout } = await execFileAsync('gh', ghArgs, { env, encoding: 'utf8' });
        return stdout.trim();
    } catch (err) {
        if (err.stderr) console.error(`gh error: ${err.stderr.toString().trim()}`);
        else console.error(`gh error: ${err.message}`);
        throw err;
    }
}

/**
 * High-performance pure Node.js concurrent worker pool
 */
async function runConcurrent(items, maxWorkers, workerFn) {
    if (items.length === 0) return [];
    const results = new Array(items.length);
    let index = 0;

    const workers = new Array(Math.min(maxWorkers, items.length)).fill(0).map(async () => {
        while (index < items.length) {
            const currentIndex = index++;
            results[currentIndex] = await workerFn(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(workers);
    return results;
}

function extractEpicNumber(dirOrFileName) {
    const match = dirOrFileName.match(/^(\d+)/);
    return match ? String(parseInt(match[1], 10)).padStart(2, '0') : null;
}

function extractSemanticKey(fileName) {
    const match = fileName.match(/^(\d+(?:\.\d+)*)/);
    return match ? match[1] : null;
}

function cleanTitle(rawTitle) {
    return rawTitle
        .replace(/^#+\s+/, '')
        .replace(/^#\d+\s+[—–-]\s+/, '')
        .replace(/^#\d+\s*\([0-9\.]+\)\s+[—–-]\s+/, '')
        .trim();
}

function replaceSemanticKeysInBody(content, currentEpicNo, registry, dynamicLocalMap) {
    let transformed = content;

    // 1. Cross-PRD replacement: "Epic XX: YY.YY" or "[Epic XX] YY.YY"
    transformed = transformed.replace(/(?:\[?\b(?:Epic|PRD)\s*(\d+)\b\]?[\s:—–\(\)]*)\b(\d+(?:\.\d+)*)\b/gi, (match, epicNo, key) => {
        const normEpic = String(parseInt(epicNo, 10)).padStart(2, '0');
        const targetEpic = registry[normEpic] || registry[epicNo];
        if (targetEpic && targetEpic.tickets[key] && targetEpic.tickets[key].issueId) {
            return `#${targetEpic.tickets[key].issueId} (Epic ${epicNo}: ${key})`;
        }
        return match;
    });

    // 2. Intra-PRD replacement: local semantic keys from dynamicLocalMap
    const sortedKeys = Object.keys(dynamicLocalMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        const id = dynamicLocalMap[key];
        if (!id) continue;
        // Avoid replacing in headers or already formatted #ID (key)
        const keyRegex = new RegExp(`(?<![#\\w\\.\\/])${key.replace(/\\./g, '\\.')}(?![\\w\\.\\/])`, 'g');
        transformed = transformed.replace(keyRegex, `#${id} (${key})`);
    }

    return transformed;
}

// Build Global Specs Index across all sibling PRDs without mutating disk
function buildGlobalRegistry(specsRootDir) {
    const globalRegistry = {};
    if (!fs.existsSync(specsRootDir)) return globalRegistry;

    const epicDirs = fs.readdirSync(specsRootDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => d.name);

    for (const dir of epicDirs) {
        const epicNum = extractEpicNumber(dir);
        if (!epicNum) continue;

        const ePrdFile = path.join(specsRootDir, dir, 'PRD.md');
        const eTicketsDir = path.join(specsRootDir, dir, 'tickets');
        if (!fs.existsSync(ePrdFile)) continue;

        const prdRaw = fs.readFileSync(ePrdFile, 'utf8');

        globalRegistry[epicNum] = {
            epicNum,
            dirName: dir,
            prdFile: ePrdFile,
            tickets: {}
        };

        const lines = prdRaw.split('\n');
        let inTicketsSection = false;

        for (const line of lines) {
            if (/^##\s+Tickets/i.test(line)) {
                inTicketsSection = true;
                continue;
            }
            if (inTicketsSection && /^##\s+/i.test(line)) {
                inTicketsSection = false;
                break;
            }
            if (inTicketsSection && line.trim().startsWith('-')) {
                const issueMatch = line.match(/-\s+#(\d+)\b/);
                const fileMatch = line.match(/\(`?([^`\n]+\.md)`?\)/);
                const issueId = issueMatch ? parseInt(issueMatch[1], 10) : null;
                const fileName = fileMatch ? path.basename(fileMatch[1].trim()) : null;
                const key = fileName ? extractSemanticKey(fileName) : null;

                if (key) {
                    globalRegistry[epicNum].tickets[key] = {
                        key,
                        fileName,
                        title: cleanTitle(line.replace(/^-\s+/, '')),
                        issueId
                    };
                }
            }
        }

        if (fs.existsSync(eTicketsDir)) {
            const tFiles = fs.readdirSync(eTicketsDir).filter(f => f.endsWith('.md'));
            for (const tf of tFiles) {
                const k = extractSemanticKey(tf);
                if (!k) continue;
                if (!globalRegistry[epicNum].tickets[k]) {
                    globalRegistry[epicNum].tickets[k] = {
                        key: k,
                        fileName: tf,
                        title: tf.replace('.md', ''),
                        issueId: null
                    };
                } else if (!globalRegistry[epicNum].tickets[k].fileName) {
                    globalRegistry[epicNum].tickets[k].fileName = tf;
                }
            }
        }
    }

    return globalRegistry;
}

// Publish or Reconcile a single Epic (PURE COMPILATION — ZERO DISK MUTATION OF TICKETS)
async function processEpic(prdFilePath, parentIdOverride, globalRegistry) {
    const targetEpicDir = path.dirname(prdFilePath);
    const ticketsDirPath = path.join(targetEpicDir, 'tickets');
    const currentEpicNum = extractEpicNumber(path.basename(targetEpicDir));
    const epicTag = `epic-${currentEpicNum}`;
    const prdLabels = `epic,${epicTag}`;
    const ticketLabels = `ticket,${epicTag}`;

    console.log(`\n======================================================`);
    console.log(`Processing Epic ${currentEpicNum}: ${path.basename(targetEpicDir)}`);
    console.log(`======================================================`);

    // Ensure labels exist
    const requiredLabels = [
        { name: 'epic', color: '5319e7', description: 'Epic PRD specification' },
        { name: 'ticket', color: '0e8a16', description: 'Actionable task ticket' },
        { name: epicTag, color: '1f75cb', description: `Issues belonging to Epic ${currentEpicNum}` }
    ];

    for (const l of requiredLabels) {
        if (isDryRun) {
            console.log(`  [DRY-RUN] Ensure label "${l.name}"`);
        } else {
            try {
                const lArgs = ['label', 'create', l.name, '--color', l.color, '--description', l.description, '--force'];
                if (repo) lArgs.push('--repo', repo);
                await runGh(lArgs);
            } catch (_) {}
        }
    }

    // Read Pure Local Tickets (READ-ONLY)
    const targetTickets = [];
    if (fs.existsSync(ticketsDirPath)) {
        const rawFiles = fs.readdirSync(ticketsDirPath).filter(f => f.endsWith('.md')).sort();
        for (const f of rawFiles) {
            const k = extractSemanticKey(f);
            if (!k) continue;
            const filePath = path.join(ticketsDirPath, f);
            const rawContent = fs.readFileSync(filePath, 'utf8');
            const titleMatch = rawContent.match(/^#\s+(.+)$/m);
            const rawTitle = titleMatch ? titleMatch[1].trim() : f.replace('.md', '');
            const title = cleanTitle(rawTitle);

            targetTickets.push({
                key: k,
                fileName: f,
                filePath,
                title,
                rawContent
            });
        }
    }

    console.log(`Found ${targetTickets.length} local tickets (Read-only source).`);

    // Parent PRD Resolution
    let finalParentId = parentIdOverride;
    const prdRawContent = fs.readFileSync(prdFilePath, 'utf8');
    const prdTitleMatch = prdRawContent.match(/^#\s+(.+)$/m);
    const prdTitle = prdTitleMatch ? cleanTitle(prdTitleMatch[1]) : `Epic ${currentEpicNum}: ${path.basename(targetEpicDir)}`;

    if (!finalParentId) {
        const existingParentMatch = prdRawContent.match(/## Parent\n#(\d+)/m);
        if (existingParentMatch) {
            finalParentId = parseInt(existingParentMatch[1], 10);
        }
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yumeshelf-publish-'));

    if (!finalParentId) {
        if (isDryRun) {
            finalParentId = 999;
            console.log(`[DRY-RUN] Create Parent Issue "${prdTitle}" -> #${finalParentId}`);
        } else {
            console.log(`Creating Parent Issue "${prdTitle}"...`);
            const tempPrdPath = path.join(tempDir, 'PRD.md');
            fs.writeFileSync(tempPrdPath, prdRawContent, 'utf8');

            const ghArgs = ['issue', 'create', '--title', prdTitle, '--body-file', tempPrdPath, '--label', prdLabels];
            if (repo) ghArgs.push('--repo', repo);
            const outUrl = await runGh(ghArgs);
            const idMatch = outUrl.match(/\/issues\/(\d+)$/);
            finalParentId = idMatch ? parseInt(idMatch[1], 10) : null;
            console.log(`Created Parent Issue #${finalParentId}: ${outUrl}`);
        }
    } else {
        console.log(`Using existing Parent Issue #${finalParentId} (labels: ${prdLabels}).`);
    }

    // Reconcile
    const existingRemoteTickets = (globalRegistry[currentEpicNum] && globalRegistry[currentEpicNum].tickets) || {};
    const localKeySet = new Set(targetTickets.map(t => t.key));
    const orphanedRemoteTickets = [];

    for (const [rKey, rTicket] of Object.entries(existingRemoteTickets)) {
        if (!localKeySet.has(rKey) && rTicket.issueId) {
            orphanedRemoteTickets.push(rTicket);
        }
    }

    if (orphanedRemoteTickets.length > 0) {
        console.log(`Closing ${orphanedRemoteTickets.length} orphaned/split tickets concurrently...`);
        await runConcurrent(orphanedRemoteTickets, concurrency, async (orphan) => {
            if (!isDryRun) {
                try {
                    const closeArgs = [
                        'issue', 'close', String(orphan.issueId),
                        '--reason', 'not planned',
                        '--comment', `Superseded or split under Parent PRD #${finalParentId}. Closing.`
                    ];
                    if (repo) closeArgs.push('--repo', repo);
                    await runGh(closeArgs);
                    console.log(`  [CLOSED (not planned)] Stale Issue #${orphan.issueId} [${orphan.key}]`);
                } catch (err) {
                    console.warn(`  Warning: Could not close #${orphan.issueId}: ${err.message}`);
                }
            } else {
                console.log(`  [DRY-RUN CLOSE] Stale Issue #${orphan.issueId} [${orphan.key}] (reason: not planned)`);
            }
        });
    }

    // Separate into In-Place Updates vs New Tickets
    const inPlaceTickets = [];
    const newTickets = [];

    for (const t of targetTickets) {
        const existingEntry = existingRemoteTickets[t.key];
        if (existingEntry && existingEntry.issueId) {
            inPlaceTickets.push({ ...t, existingIssueId: existingEntry.issueId });
        } else {
            newTickets.push(t);
        }
    }

    const dynamicLocalMap = {};
    for (const t of inPlaceTickets) {
        dynamicLocalMap[t.key] = t.existingIssueId;
    }

    // 1. Concurrent In-Place Updates (Ephemeral Compile -> gh issue edit -> Zero Disk Mutation)
    if (inPlaceTickets.length > 0) {
        console.log(`\nExecuting ${inPlaceTickets.length} In-Place Updates concurrently (Pool size: ${concurrency})...`);
        await runConcurrent(inPlaceTickets, concurrency, async (t) => {
            let compiledBody = replaceSemanticKeysInBody(t.rawContent, currentEpicNum, globalRegistry, dynamicLocalMap);
            if (!compiledBody.includes(`## Parent\n#${finalParentId}`) && !compiledBody.includes(`## Parent\nhttps://github.com/`)) {
                compiledBody = compiledBody.replace(/## Epic\n[^\n]+/m, `## Parent\n#${finalParentId} (${prdTitle})\n\n## Epic\n${prdTitle}`);
            }

            if (isDryRun) {
                console.log(`  [DRY-RUN EDIT] [${t.key}] In-Place Update #${t.existingIssueId}: "${t.title}"`);
            } else {
                const tempFilePath = path.join(tempDir, t.fileName);
                fs.writeFileSync(tempFilePath, compiledBody, 'utf8');

                const ghArgs = ['issue', 'edit', String(t.existingIssueId), '--title', t.title, '--body-file', tempFilePath, '--add-label', ticketLabels];
                if (repo) ghArgs.push('--repo', repo);
                await runGh(ghArgs);
                console.log(`  [UPDATED] #${t.existingIssueId} [${t.key}]: "${t.title}"`);
            }
        });
    }

    // 2. Sequential Creation of New Tickets (Ephemeral Compile -> gh issue create -> Zero Disk Mutation)
    if (newTickets.length > 0) {
        console.log(`\nCreating ${newTickets.length} New Tickets in topological order...`);
        let simCounter = 500;
        for (const t of newTickets) {
            let compiledBody = replaceSemanticKeysInBody(t.rawContent, currentEpicNum, globalRegistry, dynamicLocalMap);
            if (!compiledBody.includes(`## Parent\n#${finalParentId}`) && !compiledBody.includes(`## Parent\nhttps://github.com/`)) {
                compiledBody = compiledBody.replace(/## Epic\n[^\n]+/m, `## Parent\n#${finalParentId} (${prdTitle})\n\n## Epic\n${prdTitle}`);
            }

            let createdId = null;
            if (isDryRun) {
                createdId = simCounter++;
                dynamicLocalMap[t.key] = createdId;
                console.log(`  [DRY-RUN CREATE] [${t.key}] New Issue #${createdId}: "${t.title}"`);
            } else {
                const tempFilePath = path.join(tempDir, t.fileName);
                fs.writeFileSync(tempFilePath, compiledBody, 'utf8');

                const ghArgs = ['issue', 'create', '--title', t.title, '--body-file', tempFilePath, '--label', ticketLabels];
                if (repo) ghArgs.push('--repo', repo);
                const issueUrl = await runGh(ghArgs);
                const idMatch = issueUrl.match(/\/issues\/(\d+)$/);
                createdId = idMatch ? parseInt(idMatch[1], 10) : null;
                dynamicLocalMap[t.key] = createdId;
                console.log(`  [CREATED] #${createdId} [${t.key}]: "${t.title}"`);
            }
        }
    }

    // Compile and Upload Parent PRD Body (Ephemeral compile, updates GitHub)
    console.log(`\nCompiling and Updating Parent PRD #${finalParentId} on GitHub...`);
    let compiledPrd = prdRawContent;
    let ticketListMarkdown = '';

    for (const t of targetTickets) {
        const issueNum = dynamicLocalMap[t.key];
        ticketListMarkdown += `- #${issueNum} — ${t.title} (\`tickets/${t.fileName}\`)\n`;
    }

    compiledPrd = compiledPrd.replace(/## Tickets\n\n[\s\S]*?(?=\n## |$)/, `## Tickets\n\n${ticketListMarkdown}`);
    compiledPrd = replaceSemanticKeysInBody(compiledPrd, currentEpicNum, globalRegistry, dynamicLocalMap);

    if (isDryRun) {
        console.log(`[DRY-RUN] Update PRD #${finalParentId} on GitHub.`);
    } else {
        const tempPrdPath = path.join(tempDir, 'PRD_final.md');
        fs.writeFileSync(tempPrdPath, compiledPrd, 'utf8');

        const ghArgs = ['issue', 'edit', String(finalParentId), '--body-file', tempPrdPath, '--add-label', prdLabels];
        if (repo) ghArgs.push('--repo', repo);
        await runGh(ghArgs);
        console.log(`Successfully updated Parent Issue #${finalParentId} on GitHub.`);
    }

    // Cleanup temp directory
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}

    return dynamicLocalMap;
}

// Main CLI Entrypoint
async function main() {
    let resolvedSpecsRoot = null;
    let targetPrdList = [];

    if (isAll || fs.existsSync(path.join(targetPath, '01-yume-engine-core')) || fs.existsSync(path.join(targetPath, '02-codebase-readiness-multios'))) {
        resolvedSpecsRoot = fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
        const subDirs = fs.readdirSync(resolvedSpecsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => path.join(resolvedSpecsRoot, d.name, 'PRD.md'))
            .filter(f => fs.existsSync(f));
        targetPrdList = subDirs;
    } else {
        const pPath = fs.statSync(targetPath).isDirectory() ? path.join(targetPath, 'PRD.md') : targetPath;
        resolvedSpecsRoot = path.dirname(path.dirname(pPath));
        targetPrdList = [pPath];
    }

    console.log(`=== Pre-scanning Global Registry (Specs Root: ${resolvedSpecsRoot}) ===`);
    const globalRegistry = buildGlobalRegistry(resolvedSpecsRoot);

    for (const prdFile of targetPrdList) {
        await processEpic(prdFile, targetPrdList.length === 1 ? parentId : null, globalRegistry);
    }

    console.log(`\n======================================================`);
    console.log(`All Epic Operations Completed Successfully! (Local files untouched)`);
    console.log(`======================================================\n`);
}

main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
