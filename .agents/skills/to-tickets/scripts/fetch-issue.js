#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function printUsage() {
    console.log('Usage: node fetch-issue.js <issue-number-or-url> [--out <output.json>] [--repo <owner/repo>]');
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
}

let issueTarget = null;
let customOut = null;
let repo = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
        customOut = args[++i];
    } else if (args[i] === '--repo' && args[i + 1]) {
        repo = args[++i];
    } else if (!args[i].startsWith('--') && !issueTarget) {
        issueTarget = args[i];
    }
}

if (!issueTarget) {
    console.error('Error: Missing issue number or URL');
    printUsage();
}

// Extract issue number if URL is provided
const issueNumberMatch = issueTarget.match(/\/issues\/(\d+)/);
const issueNumber = issueNumberMatch ? issueNumberMatch[1] : issueTarget;

const env = { ...process.env };
delete env.GITHUB_TOKEN;

const ghArgs = [
    'issue', 'view', String(issueNumber),
    '--comments',
    '--json', 'number,title,body,labels,comments,createdAt,author,url'
];

if (repo) {
    ghArgs.push('--repo', repo);
}

console.log(`Fetching complete issue #${issueNumber} and comments from GitHub...`);
let issueDataRaw;
try {
    issueDataRaw = execFileSync('gh', ghArgs, { env, encoding: 'utf8' });
} catch (err) {
    console.error('Failed to fetch issue from GitHub CLI:');
    if (err.stderr) console.error(err.stderr.toString());
    else console.error(err.message);
    process.exit(1);
}

let issueData;
try {
    issueData = JSON.parse(issueDataRaw);
} catch (err) {
    console.error('Failed to parse GitHub issue JSON payload:', err.message);
    process.exit(1);
}

const scratchDir = path.resolve('.scratch');
if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
}

const jsonOutPath = customOut ? path.resolve(customOut) : path.join(scratchDir, `issue_${issueData.number}_details.json`);
const mdOutPath = jsonOutPath.replace(/\.json$/i, '') + '.md';

// 1. Write clean JSON
fs.writeFileSync(jsonOutPath, JSON.stringify(issueData, null, 2), 'utf8');

// 2. Write rendered Markdown version for easy view_file reading
let mdContent = `# Issue #${issueData.number}: ${issueData.title}\n\n`;
mdContent += `**Author:** @${issueData.author?.login || 'unknown'} | **Created:** ${issueData.createdAt || 'N/A'}\n`;
if (Array.isArray(issueData.labels) && issueData.labels.length > 0) {
    mdContent += `**Labels:** ${issueData.labels.map((l) => l.name || l).join(', ')}\n`;
}
mdContent += `**URL:** ${issueData.url || 'N/A'}\n\n`;
mdContent += `---\n\n## Description\n\n${issueData.body || '(No description)'}\n\n`;

if (Array.isArray(issueData.comments) && issueData.comments.length > 0) {
    mdContent += `---\n\n## Comments (${issueData.comments.length})\n\n`;
    issueData.comments.forEach((c, idx) => {
        mdContent += `### Comment #${idx + 1} by @${c.author?.login || 'unknown'} (${c.createdAt || 'N/A'})\n\n`;
        mdContent += `${c.body || ''}\n\n`;
    });
}

fs.writeFileSync(mdOutPath, mdContent, 'utf8');

console.log(`\nSuccessfully fetched Issue #${issueData.number}:`);
console.log(`- JSON dump: ${jsonOutPath}`);
console.log(`- Markdown doc: ${mdOutPath}`);
