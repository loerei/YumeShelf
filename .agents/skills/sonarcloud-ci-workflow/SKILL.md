---
name: sonarcloud-ci-workflow
description: Configure, integrate, optimize, and troubleshoot SonarCloud CI-based analysis workflows via GitHub Actions. Use when setting up SonarCloud scanning, configuring workflows, optimizing Sonar projects, or troubleshooting CI analysis failures.
---

# SonarCloud CI Workflow

Use this skill to configure, integrate, optimize, and troubleshoot SonarCloud CI-based analysis workflows via GitHub Actions.

## Quick start

To integrate SonarCloud scanning into GitHub Actions:

1. **Ask for Token & Setup via CLI**: Ask the user for their SonarCloud token. If provided, use GitHub CLI (`gh secret set SONAR_TOKEN --body "<token>"`) to automatically configure the secret for them.
2. Setup `sonar-project.properties` in project root.
3. Setup GitHub Actions workflow `.github/workflows/sonarcloud.yml`.
4. Disable "Automatic Analysis" in SonarCloud Administration.

## Workflows

### Setup & Optimization Checklist

* [ ] **Setup GitHub Secret**: Ask the user for their SonarCloud token and run `gh secret set SONAR_TOKEN --body "<token>"` to configure the secret in GitHub.
* [ ] **Configure Project Properties**: Create `sonar-project.properties`.
  - Ensure `sonar.sources` and exclusions are set to prevent false-positive duplication checks (e.g. excluding test and build files).
  - Always add `sonar.coverage.exclusions=**/*` to bypass test coverage requirements on free plans without upgrading.
  - Ensure the file is saved as UTF-8 **without BOM**.
* [ ] **Write Optimized Workflow**: Create `.github/workflows/sonarcloud.yml`.
  - **Branch Trigger**: Ensure the branch trigger (e.g. `main` or `master`) matches the repository's default branch.
  - **Static Analysis (Fast)**: Do NOT install dependencies. Only run checkout (`fetch-depth: 0`) and SonarSource scan action.
  - **Coverage Analysis**: If coverage is required, use Node caching (`cache: 'npm'`) and run builds before tests in monorepos. Use `npm install` instead of `npm ci` if there are native platform-specific binaries to avoid EBADPLATFORM errors.
* [ ] **Deactivate Autoscan**: In SonarCloud console -> **Administration** -> **Analysis Method**, toggle OFF **Automatic Analysis**.
* [ ] **Verify & Troubleshoot**: 
  - For local pre-commit verification before pushing, follow the local code scan guidelines in [/sonarqube-workflow](file:///d:/Projects/HoverSource/.agents/skills/sonarqube-workflow/SKILL.md).
  - If the quality gate or test run fails on CI, refer to [REFERENCE.md](REFERENCE.md) section 6 to troubleshoot common race conditions, CRLF line endings, and BOM issues.

## Advanced features

For template configurations, properties files, PR check validation, and troubleshooting details, see [REFERENCE.md](REFERENCE.md).
