const path = require('path');
const { getConfig } = require('./tools/config-helper.js');

const commands = {
    patch: {
        desc: 'Safe file patching resistant to Windows CRLF errors',
        run: async (args) => require('./tools/smart-patcher.js').run(args)
    },
    map: {
        desc: 'Generate static source code structure map using AST Tree-sitter',
        run: async (args) => require('./tools/generate-repo-map.js').run(args)
    },
    dep: {
        desc: 'Manage, scan, and query codebase dependency graph',
        run: async (args) => require('./tools/dependency-manager.js').run(args)
    }
};

function showHelp(config) {
    console.log(`=== ${config.projectName} SOP Command Line Interface ===`);
    console.log('Usage: node SOP/cli.js <command> [arguments]\n');
    console.log('Supported commands:');
    for (const [cmd, info] of Object.entries(commands)) {
        console.log(`  ${cmd.padEnd(10)} : ${info.desc}`);
    }
}

async function main() {
    const config = getConfig();
    const args = process.argv.slice(2);
    const cmd = args[0];

    if (!cmd || cmd === '--help' || cmd === '-h' || !commands[cmd]) {
        showHelp(config);
        process.exit(cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0);
    }

    try {
        const subArgs = args.slice(1);
        const result = await commands[cmd].run(subArgs);
        
        // Output standard JSON interface if result is returned
        if (result !== undefined) {
             console.log(JSON.stringify(result, null, 2));
        }
    } catch (err) {
        console.error(JSON.stringify({
            status: 'fatal',
            command: cmd,
            code: err.code || 'UNKNOWN_ERROR',
            message: err.message,
            stack: err.stack,
            remediation: err.remediation || "Check command arguments and ensure target paths are correct."
        }, null, 2));
        process.exit(1);
    }
}

main();
