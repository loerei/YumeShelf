#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function main() {
    const args = process.argv.slice(2);
    if (!args[0]) {
        console.error('Usage: node close-ticket.js <ticket-number-or-url> [--comment <text>] [--repo <owner/repo>]');
        process.exit(1);
    }

    const target = args[0];
    const issueMatch = String(target).match(/\/issues\/(\d+)/);
    const issueNumber = issueMatch ? issueMatch[1] : String(target).replace(/^#/, '');

    let comment = null;
    let repo = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--comment' && args[i + 1]) comment = args[++i];
        else if (args[i] === '--repo' && args[i + 1]) repo = args[++i];
    }

    const env = { ...process.env };
    delete env.GITHUB_TOKEN;

    const ghArgs = ['issue', 'close', issueNumber, '--reason', 'completed'];
    if (comment) ghArgs.push('--comment', comment);
    if (repo) ghArgs.push('--repo', repo);

    console.log(`[close-ticket] Closing Issue #${issueNumber}...`);
    execFileSync('gh', ghArgs, { env, encoding: 'utf8', stdio: 'inherit' });
    console.log(`✓ Issue #${issueNumber} closed successfully.`);
}

main();
