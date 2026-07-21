---
name: sonarqube-workflow
description: >
  Query, inspect, and retrieve code quality issues, duplications, and Quality Gate metrics using SonarQube and SonarCloud MCP servers. Use when checking SonarCloud/SonarQube issues, querying open bugs/smells, or checking Quality Gate/duplication status.
---

# SonarQube & SonarCloud MCP Tooling Guide

Use SonarCloud / SonarQube MCP tools to retrieve details about project issues, quality gates, and code duplications.

## Quick start

### 1. Find Project Key
If the project key is unknown, search your organization's projects first:
* Call `sonarcloud:search_my_sonarqube_projects` or `sonarqube:search_my_sonarqube_projects`.

### 2. Search Issues
Find all open issues for a project or specific pull request:
* Call `sonarcloud:search_sonar_issues_in_projects` with `projects=["<projectKey>"]` (Note: the argument name is `projects`, not `projectKeys`) and `issueStatuses=["OPEN"]`.
* If inspecting a Pull Request, add the `pullRequestId` (ID string) argument (Note: the argument name is `pullRequestId`, not `pullRequest`).
* **Filtering by File**: To optimize queries and only fetch issues for a specific file, pass the `files` parameter (array of strings). The format of each file element MUST be the full Component Key: `["<projectKey>:<relativeFilePath>"]` (e.g. `["loerei_YumeShelf:src/index.html"]`). Querying this way is highly recommended over loading all project issues.

> [!IMPORTANT]
> **Avoid Scope Confusion**: When analyzing issues for an active Pull Request, **you MUST provide the `pullRequestId` argument**. If `pullRequestId` is omitted, SonarCloud will return all open issues across the default branch (`main`/`master`), which may lead to modifying pre-existing code to resolve old project issues instead of focusing on the current PR's changes.

### 3. Retrieve Duplications
Search for files containing duplicated blocks, and extract precise line ranges:
* Call `sonarcloud:search_duplicated_files` with `projectKey="<projectKey>"`.
* Call `sonarcloud:get_duplications` with `key="<fileKey>"` and optional `pullRequest="<pullRequest>"`.

## Tool Usage Workflows

### Quality Gate Status Verification
Check the remote Quality Gate metrics (duplication %, coverage, vulnerabilities):
* Call `sonarcloud:get_project_quality_gate_status` with `projectKey="<projectKey>"` (or include `pullRequest`).

### Detail Issue Code Inspection
Look up the exact rules or component metrics:
* Call `sonarcloud:show_rule` with `key="<ruleKey>"` to get explanation details.
* Call `sonarcloud:get_component_measures` with `projectKey="<projectKey>"` (Note: the argument name is `projectKey`, not `component`) and `metricKeys=["duplicated_lines_density", "security_rating"]`.

## Remediation Policy

* **Cognitive Complexity (S3776)**: Always flag these as ACCEPTED using the status transition tool (`change_sonar_issue_status`). Never rewrite code or split deep functions just to satisfy SonarQube's complexity metrics, as it promotes shallow helper modules. Structural refactoring should only be driven by `/improve-codebase-architecture` and user design discussions.
