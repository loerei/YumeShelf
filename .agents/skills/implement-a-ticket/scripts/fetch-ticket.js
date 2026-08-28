#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function fetchIssueData(issueTarget, repo) {
    const issueMatch = String(issueTarget).match(/\/issues\/(\d+)/);
    const issueNumber = issueMatch ? issueMatch[1] : String(issueTarget).replace(/^#/, '');

    const env = { ...process.env };
    delete env.GITHUB_TOKEN;

    const ghArgs = [
        'issue', 'view', issueNumber,
        '--comments',
        '--json', 'number,title,body,labels,comments,createdAt,author,url'
    ];
    if (repo) ghArgs.push('--repo', repo);

    const raw = execFileSync('gh', ghArgs, { env, encoding: 'utf8' });
    return JSON.parse(raw);
}

function writeIssueMarkdown(issueData, outDir, prefix = 'ticket') {
    const jsonPath = path.join(outDir, `${prefix}_${issueData.number}.json`);
    const mdPath = path.join(outDir, `${prefix}_${issueData.number}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(issueData, null, 2), 'utf8');

    let md = `# Issue #${issueData.number}: ${issueData.title}\n\n`;
    md += `**URL:** ${issueData.url || 'N/A'} | **Author:** @${issueData.author?.login || 'unknown'}\n\n`;
    md += `---\n\n${issueData.body || '(No description)'}\n\n`;

    if (Array.isArray(issueData.comments) && issueData.comments.length > 0) {
        md += `---\n\n## Comments (${issueData.comments.length})\n\n`;
        issueData.comments.forEach((c, i) => {
            md += `### Comment #${i + 1} by @${c?.author?.login || 'unknown'} (${c?.createdAt || 'N/A'})\n\n${c?.body || ''}\n\n`;
        });
    }

    fs.writeFileSync(mdPath, md, 'utf8');
    return { jsonPath, mdPath };
}

function main() {
    const args = process.argv.slice(2);
    if (!args[0]) {
        console.error('Usage: node fetch-ticket.js <ticket-number-or-url> [--repo <owner/repo>]');
        process.exit(1);
    }

    const ticketTarget = args[0];
    let repo = null;
    const repoIdx = args.indexOf('--repo');
    if (repoIdx !== -1 && args[repoIdx + 1]) repo = args[repoIdx + 1];

    const outDir = path.resolve('.scratch/tickets');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    console.log(`[fetch-ticket] Fetching Ticket ${ticketTarget}...`);
    const ticketData = fetchIssueData(ticketTarget, repo);
    const ticketFiles = writeIssueMarkdown(ticketData, outDir, 'ticket');
    console.log(`✓ Ticket #${ticketData.number} saved to ${ticketFiles.mdPath}`);

    // Auto-detect Parent PRD
    const parentMatch = ticketData.body?.match(/Parent(?:\s+PRD)?:\s*(?:#|https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/)(\d+)/i);
    if (parentMatch?.[1]) {
        const prdNumber = parentMatch[1];
        console.log(`[fetch-ticket] Found Parent PRD #${prdNumber}, fetching...`);
        try {
            const prdData = fetchIssueData(prdNumber, repo);
            const prdFiles = writeIssueMarkdown(prdData, outDir, 'prd');
            console.log(`✓ Parent PRD #${prdData.number} saved to ${prdFiles.mdPath}`);
        } catch (e) {
            console.warn(`[fetch-ticket] Warning: Could not fetch parent PRD #${prdNumber}: ${e.message}`);
        }
    }
}

main();
