const fs = require('fs');
const path = require('path');

async function run(args) {
    if (args.length < 3) {
        const err = new Error('Missing arguments');
        err.remediation = 'Usage: node SOP/cli.js patch <target-file> <search-file> <replace-file>';
        throw err;
    }

    const targetPath = path.resolve(args[0]);
    const searchPath = path.resolve(args[1]);
    const replacePath = path.resolve(args[2]);

    if (!fs.existsSync(targetPath)) {
        const err = new Error(`Target file not found: ${targetPath}`);
        err.remediation = 'Check if targetPath is correct and relative to CWD.';
        throw err;
    }
    if (!fs.existsSync(searchPath)) {
        const err = new Error(`Search file not found: ${searchPath}`);
        err.remediation = 'Check if searchPath is correct and relative to CWD.';
        throw err;
    }
    if (!fs.existsSync(replacePath)) {
        const err = new Error(`Replace file not found: ${replacePath}`);
        err.remediation = 'Check if replacePath is correct and relative to CWD.';
        throw err;
    }

    let fileContent = fs.readFileSync(targetPath, 'utf8');
    let searchContent = fs.readFileSync(searchPath, 'utf8');
    let replaceContent = fs.readFileSync(replacePath, 'utf8');

    // Detect original line endings style
    const isCRLF = fileContent.includes('\r\n');

    // Normalize everything to LF (\n) for stable matching
    const normFile = fileContent.replace(/\r\n/g, '\n');
    const normSearch = searchContent.replace(/\r\n/g, '\n');
    const normReplace = replaceContent.replace(/\r\n/g, '\n');

    // Perform replacement
    const occurrences = normFile.split(normSearch).length - 1;
    if (occurrences === 0) {
        const searchLines = normSearch.split('\n');
        const err = new Error('Search content not found in target file (even after CRLF normalization)!');
        err.remediation = `The target string does not exist exactly. First 3 lines of search block:\n${searchLines.slice(0, 3).join('\n')}`;
        throw err;
    }

    if (occurrences > 1) {
        console.log(`WARNING: Found ${occurrences} identical occurrences of the search target. Replacing ALL of them.`);
    }

    // Use split & join to guarantee 100% safe literal replacement
    // (avoids any regex or replacement pattern escaping issues like $& or $$ in JS .replace)
    let patched = normFile.split(normSearch).join(normReplace);

    // Convert back to original line endings if CRLF was dominant
    if (isCRLF) {
        patched = patched.replace(/\n/g, '\r\n');
    }

    fs.writeFileSync(targetPath, patched, 'utf8');
    return { status: 'success', patchedOccurrences: occurrences, file: targetPath };
}

module.exports = { run };
