#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function printUsage() {
    console.log('Usage: node publish-ticket.js <ticket-markdown-file> [--title "<title>"] [--labels "<labels>"] [--comment-on <parent-issue>] [--repo <owner/repo>]');
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
}

let filePath = null;
let title = null;
let labels = 'enhancement,ready-for-agent';
let commentOnIssue = null;
let repo = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
        title = args[++i];
    } else if (args[i] === '--labels' && args[i + 1]) {
        labels = args[++i];
    } else if (args[i] === '--comment-on' && args[i + 1]) {
        commentOnIssue = args[++i];
    } else if (args[i] === '--repo' && args[i + 1]) {
        repo = args[++i];
    } else if (!args[i].startsWith('--') && !filePath) {
        filePath = args[i];
    }
}

if (!filePath || !fs.existsSync(filePath)) {
    console.error(`Error: Ticket markdown file not found: ${filePath}`);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');

const env = { ...process.env };
delete env.GITHUB_TOKEN;

try {
    if (commentOnIssue) {
        console.log(`Posting summary comment on Issue #${commentOnIssue}...`);
        const ghArgs = ['issue', 'comment', String(commentOnIssue), '--body-file', filePath];
        if (repo) ghArgs.push('--repo', repo);
        const result = execFileSync('gh', ghArgs, { env, encoding: 'utf8' });
        console.log(result.trim());
    } else {
        if (!title) {
            const headingMatch = content.match(/^#\s+(?:(?:\d+\s*[—–-]\s*)?)(.+)$/m);
            if (headingMatch) {
                title = headingMatch[1].trim();
            } else {
                title = path.basename(filePath, path.extname(filePath));
            }
        }
        console.log(`Publishing Ticket Issue "${title}"...`);
        const ghArgs = [
            'issue', 'create',
            '--title', title,
            '--body-file', filePath,
            '--label', labels
        ];
        if (repo) ghArgs.push('--repo', repo);
        const result = execFileSync('gh', ghArgs, { env, encoding: 'utf8' });
        console.log(result.trim());
    }
} catch (err) {
    console.error('Failed to publish ticket via gh CLI:');
    if (err.stderr) console.error(err.stderr.toString());
    else console.error(err.message);
    process.exit(1);
}
