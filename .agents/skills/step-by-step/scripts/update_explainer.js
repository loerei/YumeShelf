#!/usr/bin/env node

/**
 * Step-by-Step Generative UI Explainer Updater
 * Injects dynamic SVG diagrams and step progression into an Antigravity Artifact HTML file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    artifactDir: '',
    workspace: process.cwd(),
    title: 'System Architecture & Flow',
    step: 1,
    stepName: '',
    note: '',
    svgFile: '',
    svg: '',
    reset: false,
    fileName: 'explainer.html',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--artifact-dir' || arg === '--brain-dir' || arg === '-a') {
      options.artifactDir = path.resolve(args[++i]);
    } else if (arg === '--workspace' || arg === '-w') {
      options.workspace = path.resolve(args[++i]);
    } else if (arg === '--title') {
      options.title = args[++i];
    } else if (arg === '--step') {
      options.step = parseInt(args[++i], 10) || 1;
    } else if (arg === '--step-name' || arg === '--name') {
      options.stepName = args[++i];
    } else if (arg === '--note') {
      options.note = args[++i];
    } else if (arg === '--svg-file') {
      options.svgFile = path.resolve(args[++i]);
    } else if (arg === '--svg') {
      options.svg = args[++i];
    } else if (arg === '--file-name') {
      options.fileName = args[++i];
    } else if (arg === '--reset') {
      options.reset = true;
    }
  }

  // Fallback to artifactDir or workspace .scratch
  if (!options.artifactDir) {
    options.artifactDir = path.join(options.workspace, '.scratch');
  }

  if (!options.stepName) {
    options.stepName = `Step ${options.step}`;
  }

  return options;
}

function getTemplatePath() {
  const localTemplate = path.join(__dirname, '..', 'template', 'explainer_template.html');
  if (fs.existsSync(localTemplate)) {
    return localTemplate;
  }
  throw new Error(`Template not found at ${localTemplate}`);
}

function loadOrUpdateState(targetDir, options) {
  const statePath = path.join(targetDir, 'explainer_state.json');
  let state = {
    title: options.title,
    steps: [],
  };

  if (!options.reset && fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (_) {
      // fallback to initial state
    }
  }

  state.title = options.title || state.title;

  // Update or insert step
  const existingIdx = state.steps.findIndex(s => s.number === options.step);
  const stepEntry = {
    number: options.step,
    name: options.stepName,
  };

  if (existingIdx >= 0) {
    state.steps[existingIdx] = stepEntry;
  } else {
    state.steps.push(stepEntry);
    state.steps.sort((a, b) => a.number - b.number);
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function buildTimelineHtml(state, currentStep) {
  return state.steps
    .map(s => {
      const isActive = s.number === currentStep;
      if (isActive) {
        return `    <div class="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm whitespace-nowrap flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>${s.number}. ${s.name}</div>`;
      }
      return `    <div class="px-3 py-1 rounded-full text-xs font-medium bg-[var(--background)] text-[var(--muted-foreground)] border border-[var(--border)] whitespace-nowrap">${s.number}. ${s.name}</div>`;
    })
    .join('\n');
}

function main() {
  try {
    const options = parseArgs();

    // Ensure target directory exists
    if (!fs.existsSync(options.artifactDir)) {
      fs.mkdirSync(options.artifactDir, { recursive: true });
    }

    // Resolve SVG content
    let svgContent = options.svg;
    if (options.svgFile && fs.existsSync(options.svgFile)) {
      svgContent = fs.readFileSync(options.svgFile, 'utf8');
    }

    if (!svgContent || !svgContent.trim()) {
      svgContent = `
        <svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
          <rect x="50" y="50" width="500" height="100" rx="8" class="svg-node active" />
          <text x="300" y="100" class="svg-text svg-text-title">${options.stepName}</text>
        </svg>
      `;
    }

    // Load template
    const templatePath = getTemplatePath();
    let template = fs.readFileSync(templatePath, 'utf8');

    // Update state & timeline
    const state = loadOrUpdateState(options.artifactDir, options);
    const timelineHtml = buildTimelineHtml(state, options.step);

    // Replace placeholders
    const noteText = options.note || `Step ${options.step}: ${options.stepName}`;

    let rendered = template
      .replace(/<!-- \{\{TITLE\}\} -->/g, state.title)
      .replace(/<!-- \{\{STEP_NUMBER\}\} -->/g, String(options.step))
      .replace(/<!-- \{\{STEPS_TIMELINE\}\} -->/g, timelineHtml)
      .replace(/<!-- \{\{SVG_CONTENT\}\} -->/g, svgContent.trim())
      .replace(/<!-- \{\{NOTE_CONTENT\}\} -->/g, noteText);

    const outFilePath = path.join(options.artifactDir, options.fileName);
    fs.writeFileSync(outFilePath, rendered, 'utf8');

    console.log(`[+] Generative UI Explainer Artifact updated: ${outFilePath}`);
  } catch (err) {
    console.error(`[-] Error updating explainer: ${err.message}`);
    process.exit(1);
  }
}

main();
