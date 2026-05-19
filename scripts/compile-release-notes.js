const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');

function main() {
    // 1. Resolve version
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = process.argv[2] || packageJson.version;
    
    const changelogPath = path.join(repoRoot, 'local', 'changelogs', `changelog.${version}.md`);
    
    if (!fs.existsSync(changelogPath)) {
        console.error(`Error: Changelog file for version ${version} not found at: ${path.relative(repoRoot, changelogPath)}`);
        process.exit(1);
    }
    
    console.log(`Compiling release-ready notes from changelog: ${path.relative(repoRoot, changelogPath)}`);
    let content = fs.readFileSync(changelogPath, 'utf8');
    
    // 2. Parse YAML Frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!frontmatterMatch) {
        console.error(`Error: Could not parse YAML Frontmatter in: ${path.relative(repoRoot, changelogPath)}`);
        process.exit(1);
    }
    
    const yamlBlock = frontmatterMatch[1];
    const lines = yamlBlock.split(/\r?\n/);
    const metadata = {};
    lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
            metadata[key] = val;
        }
    });
    
    // 3. Strip frontmatter
    let mainBody = content.slice(frontmatterMatch[0].length);
    
    // 4. Strip technical brackets in bullet points like "- [tag-name] message"
    // Regex: Match beginning of line, optional spaces, bullet, spaces, bracketed tag, optional spaces
    let cleanBody = mainBody.replace(/^(\s*-\s+)\[[^\]]+\]\s*/gm, '$1');
    
    // 4b. Parse sections and automatically strip empty/placeholder sections (e.g. only containing "- ...")
    let normalized = cleanBody.replace(/\r\n/g, '\n');
    let parts = normalized.split('\n## ');
    let firstPart = parts[0];
    let activeSections = [];
    
    for (let i = 1; i < parts.length; i++) {
        let part = parts[i];
        let lines = part.split('\n');
        let heading = lines[0];
        let bodyLines = lines.slice(1);
        
        let realContentLines = bodyLines.filter(line => {
            let trimmedLine = line.trim();
            // Filter out empty lines, section dividers '---', and placeholder bullet points like '- ...'
            if (trimmedLine === '' || trimmedLine === '---' || /^\s*-\s*\.\.\.\s*$/.test(trimmedLine)) {
                return false;
            }
            return true;
        });
        
        if (realContentLines.length > 0) {
            activeSections.push('## ' + part);
        } else {
            console.log(`\n💡 Auto-stripped empty/placeholder section: ## ${heading.trim()}`);
        }
    }
    
    let finalCleanBody = (firstPart + '\n' + activeSections.join('\n'))
        .replace(/\n{3,}/g, '\n\n') // Normalize multiple consecutive newlines to max 2
        .trim() + '\n';
    
    // 5. Output compiled release notes
    const outDir = path.join(repoRoot, 'local', 'changelogs');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    const outputPath = path.join(outDir, `compiled.release-notes.${version}.md`);
    fs.writeFileSync(outputPath, finalCleanBody, 'utf8');
    
    console.log(`\n🎉 Compiled release notes written to: ${path.relative(repoRoot, outputPath)}`);
    console.log('\n--- COMPILED PREVIEW ---');
    console.log(finalCleanBody.trim());
    console.log('------------------------\n');
    
    // 6. Automatically update changelog status metadata to 'released' and set timestamps
    const nowIso = new Date().toISOString();
    const updatedYamlBlock = [
        '---',
        `version: "${version}"`,
        `status: "released"`,
        `released_at: "${nowIso}"`,
        `last_updated_by: "release-compiler-script"`,
        `last_updated_at: "${nowIso}"`,
        '---'
    ].join('\n');
    
    const updatedChangelogContent = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, updatedYamlBlock + '\n');
    fs.writeFileSync(changelogPath, updatedChangelogContent, 'utf8');
    console.log(`Updated changelog metadata: status='released', released_at='${nowIso}'`);
}

main();
