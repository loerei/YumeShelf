const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

function main() {
    // 1. Resolve arguments and version
    const args = process.argv.slice(2);
    const hasReleaseFlag = args.includes('--release') || args.includes('--released');

    const positionalArgs = args.filter(arg => !arg.startsWith('-'));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = positionalArgs[0] || packageJson.version;

    if (!fs.existsSync(changelogPath)) {
        console.error(`Error: CHANGELOG.md not found at repo root.`);
        process.exit(1);
    }

    const fullChangelog = fs.readFileSync(changelogPath, 'utf8');

    // 2. Extract the block for the requested version
    // Matches "## [1.5.9]" or "## [1.5.9] - date" headings
    const escapedVersion = version.replace(/\./g, '\\.');
    const versionHeadingRe = new RegExp(
        `^## \\[${escapedVersion}\\][^\\n]*\\n`,
        'm'
    );
    const startMatch = versionHeadingRe.exec(fullChangelog);
    if (!startMatch) {
        console.error(`Error: Could not find version [${version}] in CHANGELOG.md.`);
        process.exit(1);
    }

    const startIdx = startMatch.index + startMatch[0].length;
    // Find next ## [...] heading or end of file
    const nextSectionMatch = /^## \[/m.exec(fullChangelog.slice(startIdx));
    const rawBlock = nextSectionMatch
        ? fullChangelog.slice(startIdx, startIdx + nextSectionMatch.index)
        : fullChangelog.slice(startIdx);

    console.log(`Compiling release notes for v${version} from CHANGELOG.md`);

    // 3. Strip technical bracket tags "- [tag-name] message" -> "- message"
    let cleanBody = rawBlock.replace(/^(\s*-\s+)\[[^\]]+\]\s*/gm, '$1');

    // 4. Parse sections and automatically strip empty/placeholder sections
    let normalized = cleanBody.replace(/\r\n/g, '\n');
    let parts = normalized.split('\n### ');
    let firstPart = parts[0];
    let activeSections = [];

    for (let i = 1; i < parts.length; i++) {
        let part = parts[i];
        let lines = part.split('\n');
        let heading = lines[0];
        let bodyLines = lines.slice(1);

        let realContentLines = bodyLines.filter(line => {
            let trimmedLine = line.trim();
            if (trimmedLine === '' || trimmedLine === '---' || /^\s*-\s*\.\.\.\s*$/.test(trimmedLine)) {
                return false;
            }
            return true;
        });

        if (realContentLines.length > 0) {
            activeSections.push('## ' + part);
        } else {
            console.log(`\n💡 Auto-stripped empty/placeholder section: ### ${heading.trim()}`);
        }
    }

    let finalCleanBody = (firstPart + '\n' + activeSections.join('\n'))
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n';

    // 5. Write compiled release notes
    const outDir = path.join(repoRoot, 'docs', 'changelogs');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outputPath = path.join(outDir, `compiled.release-notes.${version}.md`);
    fs.writeFileSync(outputPath, finalCleanBody, 'utf8');

    console.log(`\n🎉 Compiled release notes written to: ${path.relative(repoRoot, outputPath)}`);
    console.log('\n--- COMPILED PREVIEW ---');
    console.log(finalCleanBody.trim());
    console.log('------------------------\n');

    // 6. If --release flag, mark version heading with release date in CHANGELOG.md
    if (hasReleaseFlag) {
        const nowDate = new Date().toISOString().slice(0, 10);
        const updatedChangelog = fullChangelog.replace(
            versionHeadingRe,
            `## [${version}] - ${nowDate} — released\n`
        );
        fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');
        console.log(`Updated CHANGELOG.md: marked [${version}] as released on ${nowDate}`);
    } else {
        console.log(`Dry run complete. Use --release flag to mark [${version}] as released in CHANGELOG.md.`);
    }
}

main();
