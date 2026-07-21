# SonarCloud CI Setup Reference Guide

## 1. Project Configuration Files

Configure `sonar-project.properties` in the project root to define scope and exclusions:

> [!IMPORTANT]
> **UTF-8 Encoding without BOM**: You MUST save `sonar-project.properties` in UTF-8 format **without BOM**. Saving it with BOM (which is the default behavior of Windows PowerShell `Set-Content`) will cause the SonarScanner to fail to parse the first line, throwing an error: `You must define the following mandatory properties: sonar.organization`.

```properties
sonar.organization=loerei
sonar.projectKey=loerei_YumeShelf
sonar.projectName=YumeShelf
sonar.sources=src,native
sonar.tests=tests
sonar.test.inclusions=tests/**/*.test.ts,tests/**/*.spec.ts
sonar.exclusions=node_modules/**,dist/**,build/**,build_output/**,tests/**,**/*.test.ts,**/*.spec.ts
sonar.cpd.exclusions=tests/**,**/*.test.ts,**/*.spec.ts
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

---

## 2. GitHub Actions Workflows

### Option A: Static Analysis Workflow (Recommended for Speed)
Does not install dependencies, running in ~10–20 seconds:

```yaml
name: SonarCloud Analysis
on:
  push:
    branches:
      - main # Change to master if your default branch is master
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  sonarcloud:
    name: SonarCloud Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Disable shallow clone for accurate git history
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### Option B: Coverage-Based Workflow (With Caching)
Caching reduces setup time if tests must be executed in CI:

```yaml
name: SonarCloud Analysis with Coverage
on:
  push:
    branches:
      - main # Change to master if your default branch is master
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  sonarcloud:
    name: SonarCloud Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm' # Activates npm caching
      - name: Install dependencies
        run: npm install
      - name: Build Project
        run: npm run build
      - name: Run Tests & Coverage
        run: npm run test:coverage
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## 3. Disabling Automatic Analysis (Autoscan)

You must disable SonarCloud's built-in Automatic Analysis to avoid duplicate analysis conflicts.

1. Navigate to your project dashboard on [sonarcloud.io](https://sonarcloud.io/).
2. Click **Administration** in the left menu.
3. Select **Analysis Method**.
4. Gạt nút **Toggle OFF** cho **Automatic Analysis**.

---

## 4. Verification using GitHub CLI

To verify Quality Gate checks on local PRs, prevent dummy token auth failures:

```powershell
# Safe PR status check
$env:GITHUB_TOKEN=$null; gh pr checks <pr_number>
```

---

## 5. Scope Selection & Avoiding Testless Languages

Only include directories containing the main codebase being tested under `sonar.sources`. 

* **Excluding Non-Core Folders**: Do NOT add utility scripts, boilerplate, or native code folders (e.g. `native/`) if they do not have unit test coverage.
* **Why**: SonarCloud treats these as "New Code" on the first scan. This triggers the strict Quality Gate requiring `>= 80%` coverage, failing the build since no tests cover these files. It also surfaces pre-existing security warnings in boilerplates as new blocking issues.

---

## 6. Troubleshooting & Common Pitfalls

If your SonarCloud CI workflow fails, check for these 6 common issues:

1. **Incorrect Trigger Branch**: Ensure the branch in `.github/workflows/sonarcloud.yml` matches your repository's default branch (e.g. `master` vs `main`).
2. **UTF-8 BOM Error**: `sonar-project.properties` must be saved in UTF-8 **without BOM**. A BOM character at the start causes SonarScanner to fail parsing the first line (`You must define the following mandatory properties: sonar.organization`).
3. **Monorepo Build Order**: If packages in a monorepo import each other via built outputs (e.g. `dist/` or `build/`), you must run the build step (`npm run build`) *before* running tests in the CI.
4. **EBADPLATFORM Errors**: `npm ci` is extremely strict and will fail on platform-specific native binaries (like `esbuild` or `swc`) if they aren't fully synchronized. Use `npm install` instead in CI to bypass platform mismatches gracefully.
5. **Cross-Platform CRLF in Configs**: Temporary configuration files written by code (like OpenSSL extension configs for test certificates) must use Unix line endings (`\n`). Linux CLI tools (like `openssl`) will fail to parse CRLF (`\r\n`) configs.
6. **Test Runner Race Conditions**: Exclude build output folders (`--exclude **/dist/**`) from your test runner (Vitest/Jest) to prevent running tests twice (source vs compiled) and causing race conditions on temporary files.
