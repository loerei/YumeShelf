#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  let target = null;
  let rawOnly = false;
  let jsonOutput = false;
  let outputPath = null;
  let repo = null;
  let token = null;
  let host = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--raw') {
      rawOnly = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--output' || arg === '-o' || arg === '--out') {
      outputPath = args[i + 1];
      i++;
    } else if (arg.startsWith('--output=') || arg.startsWith('-o=') || arg.startsWith('--out=')) {
      outputPath = arg.split('=')[1];
    } else if (arg === '--repo' || arg === '-R') {
      repo = args[i + 1];
      i++;
    } else if (arg.startsWith('--repo=') || arg.startsWith('-R=')) {
      repo = arg.split('=')[1];
    } else if (arg === '--token' || arg === '-t') {
      token = args[i + 1];
      i++;
    } else if (arg.startsWith('--token=') || arg.startsWith('-t=')) {
      token = arg.split('=')[1];
    } else if (arg === '--host') {
      host = args[i + 1];
      i++;
    } else if (arg.startsWith('--host=')) {
      host = arg.split('=')[1];
    } else if (!arg.startsWith('-')) {
      target = arg;
    } else if (arg.startsWith('--')) {
      // Handle cases like --42 or --1857 or --https://...
      target = arg.replace(/^--/, '');
    }
  }

  return { target, rawOnly, jsonOutput, outputPath, repo, token, host };
}

function printHelp() {
  console.log("Usage: node get-pr-description.js <PR_NUMBER_OR_URL> [options]");
  console.log("\nOptions:");
  console.log("  --raw                     Output only the raw PR description markdown body");
  console.log("  --json                    Output PR details in JSON format");
  console.log("  --output, -o <file>       Export output to specified file path (.md or .json)");
  console.log("  --repo, -R <owner/repo>   Specify GitHub repository (e.g. owner/repo)");
  console.log("  --token, -t <token>       Personal Access Token (PAT) for Private Repos / CI");
  console.log("  --host <hostname>         Custom GitHub Enterprise host (e.g. github.mycompany.com)");
  console.log("  --help, -h                Show this help message and exit");
  console.log("\nExamples:");
  console.log("  node get-pr-description.js 42 -o PR.md");
  console.log("  node get-pr-description.js 42 -R owner/private-repo -t ghp_xxxx -o PR.md");
  console.log("  node get-pr-description.js https://github.com/owner/private-repo/pull/42 -o PR.md");
}

function fetchPRDetails(target, repo, token, host) {
  try {
    const repoFlag = repo ? `-R "${repo}"` : '';
    const hostFlag = host ? `--hostname "${host}"` : '';
    const cmd = `gh pr view "${target}" ${repoFlag} ${hostFlag} --json number,title,body,author,state,url,headRefName,baseRefName`;
    
    // Inject token into environment variables if explicitly passed
    const env = { ...process.env };
    if (token) {
      env.GH_TOKEN = token;
      env.GITHUB_TOKEN = token;
    }

    const output = execSync(cmd, { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(`[-] Error fetching PR details for "${target}":`);
    console.error(`    ${stderr.trim()}`);
    if (stderr.includes('Could not resolve') || stderr.includes('404') || stderr.includes('GraphQL')) {
      console.error("\n[💡 Private Repo Note] If this is a private repository, ensure:");
      console.error("       1. You are authenticated via `gh auth login` with `repo` scope.");
      console.error("       2. Or pass a PAT token via --token <GH_TOKEN> or set env GH_TOKEN.");
    } else if (!target.includes('/') && !repo) {
      console.error("\n[💡 Tip] When passing a PR number outside a git repo, specify the full URL or use --repo:");
      console.error(`       node get-pr-description.js https://github.com/owner/repo/pull/${target}`);
      console.error(`       node get-pr-description.js ${target} -R owner/repo`);
    }
    process.exit(1);
  }
}

function main() {
  const { target, rawOnly, jsonOutput, outputPath, repo, token, host } = parseArgs();

  if (!target) {
    console.error("[-] Error: Missing PR number or URL.");
    printHelp();
    process.exit(1);
  }

  const pr = fetchPRDetails(target, repo, token, host);

  let content = "";
  let isJsonFormat = jsonOutput;
  let isRawFormat = rawOnly;

  // Auto-detect format from output file extension if not explicitly specified
  if (outputPath && !jsonOutput && !rawOnly) {
    if (outputPath.endsWith('.json')) {
      isJsonFormat = true;
    } else if (outputPath.endsWith('.md')) {
      isRawFormat = true;
    }
  }

  if (isJsonFormat) {
    content = JSON.stringify(pr, null, 2);
  } else if (isRawFormat) {
    content = pr.body ? pr.body.trim() : "(No description provided)";
  } else {
    const lines = [];
    lines.push(
      "==================================================",
      `PR #${pr.number}: ${pr.title}`,
      "==================================================",
      `Author:     ${pr.author ? pr.author.login : 'Unknown'}`,
      `State:      ${pr.state}`,
      `Branch:     ${pr.headRefName} -> ${pr.baseRefName}`,
      `URL:        ${pr.url}`,
      "--------------------------------------------------",
      "DESCRIPTION:",
      "--------------------------------------------------",
      pr.body ? pr.body.trim() : "(No description provided)",
      "=================================================="
    );
    content = lines.join("\n");
  }

  if (outputPath) {
    try {
      const resolvedPath = path.resolve(outputPath);
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolvedPath, content, 'utf8');
      console.log(`[+] Exported PR #${pr.number} details to: ${resolvedPath}`);
    } catch (err) {
      console.error(`[-] Failed to write file to "${outputPath}": ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log(content);
  }
}

main();
