#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function printUsage() {
    console.log('Usage: node publish-prd.js <prd-markdown-file> [--title "<title>"] [--labels "<labels>"] [--update <issue-number>]');
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
}

let filePath = null;
let title = null;
let labels = 'enhancement,ready-for-agent';
let updateIssue = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
        title = args[++i];
    } else if (args[i] === '--labels' && args[i + 1]) {
        labels = args[++i];
    } else if (args[i] === '--update' && args[i + 1]) {
        updateIssue = args[++i];
    } else if (!args[i].startsWith('--') && !filePath) {
        filePath = args[i];
    }
}

if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Error: PRD file not found: ${filePath}`);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');

if (!title) {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
        title = headingMatch[1].trim();
    } else {
        title = path.basename(filePath, path.extname(filePath));
    }
}

const env = { ...process.env };
delete env.GITHUB_TOKEN;

try {
    if (updateIssue) {
        console.log(`Updating GitHub Issue #${updateIssue}...`);
        const result = execFileSync('gh', [
            'issue', 'edit', String(updateIssue),
            '--title', title,
            '--body-file', filePath
        ], { env, encoding: 'utf8' });
        console.log(result.trim());
    } else {
        console.log(`Publishing new PRD Issue "${title}"...`);
        const result = execFileSync('gh', [
            'issue', 'create',
            '--title', title,
            '--body-file', filePath,
            '--label', labels
        ], { env, encoding: 'utf8' });
        console.log(result.trim());
    }
} catch (err) {
    console.error('Failed to publish PRD issue via gh CLI:');
    if (err.stderr) console.error(err.stderr.toString());
    else console.error(err.message);
    process.exit(1);
}
