---
name: sonarcloud-ci-workflow
description: Use when configuring, optimizing, or troubleshooting SonarCloud CI workflows in GitHub Actions.
---

# SonarCloud CI Workflow

For property templates, workflow YAML, PR check commands, and CI troubleshooting, see [REFERENCE.md](REFERENCE.md).

## Workflow

1. **Configure GitHub Secret**: Ask the user for their SonarCloud token and run `gh secret set SONAR_TOKEN --body "<token>"`.
2. **Configure `sonar-project.properties`**: Save as UTF-8 **without BOM** in the project root:
   - Set `sonar.sources` and exclusions to prevent false-positive duplication checks on test and build files.
   - Add `sonar.coverage.exclusions=**/*` on free plans to bypass coverage gate requirements.
3. **Write `.github/workflows/sonarcloud.yml`**:
   - Match the repository's default branch trigger (`main` or `master`).
   - **Static Analysis (Fast)**: Omit dependency installation; run checkout (`fetch-depth: 0`) and `SonarSource/sonarqube-scan-action@v5.0.0`. NEVER use deprecated `SonarSource/sonarcloud-github-action`.
   - **Coverage Analysis**: Enable Node caching (`cache: 'npm'`), run builds before tests in monorepos, and use `npm install` instead of `npm ci` when platform-specific native binaries cause `EBADPLATFORM` errors.
4. **Disable Automatic Analysis**: In SonarCloud Administration -> **Analysis Method**, toggle **Automatic Analysis** **OFF**.
5. **Verify & Troubleshoot**:
   - Follow `sonar-remediation` for pre-push code quality checks.
   - On CI failures, check Section 6 of [REFERENCE.md](REFERENCE.md) for race conditions, CRLF line endings, and BOM errors.
