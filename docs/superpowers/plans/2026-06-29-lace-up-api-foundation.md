# Lace Up API Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated, read-only Lace Up API coverage to the Playwright framework while preserving the existing SauceDemo UI suite and AI reporting.

**Architecture:** Playwright uses a setup project to request a local Django Session and persist it as ignored storage state. A dependent API project reuses that session for authenticated checks, while fresh request contexts verify public and unauthorized behavior.

**Tech Stack:** Playwright Test 1.61, TypeScript 6, Django Session authentication, Docker Compose

---

## File Structure

- Modify `playwright.config.ts`: isolate SauceDemo UI, Lace Up auth setup, and Lace Up API projects.
- Modify `.env.example`: document non-secret Lace Up runtime configuration.
- Create `tests/laceup/auth.setup.ts`: obtain and save the local Django Session.
- Create `tests/laceup/api/runs.spec.ts`: public, unauthorized, and authenticated API tests.
- Modify `package.json`: run API tests through the `laceup-api` project.
- Modify `README.md`: document structure, prerequisites, and commands.

Existing uncommitted MIT License edits in `README.md`, `package.json`, and `package-lock.json` belong to the user. Do not stage, revert, or rewrite those lines while implementing this plan.

### Task 1: Configure Isolated Playwright Projects

**Files:**
- Modify: `playwright.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Confirm the current API command has no implemented tests**

Run:

```bash
npm run test:api -- --list
```

Expected: the command reports that no tests are found under the current `tests/api` path.

- [ ] **Step 2: Add Lace Up runtime constants**

In `playwright.config.ts`, directly after the import, add:

```typescript
const laceUpApiUrl = process.env.LACEUP_API_URL ?? 'http://localhost:8000';
const laceUpAuthFile = 'playwright/.auth/laceup.json';
```

- [ ] **Step 3: Isolate the SauceDemo project and add Lace Up projects**

Replace the active `chromium` project with these three active project entries, leaving the existing commented examples unchanged:

```typescript
{
  name: 'chromium',
  testMatch: '**/ui/**/*.spec.ts',
  use: { ...devices['Desktop Chrome'] },
},
{
  name: 'laceup-auth',
  testMatch: '**/laceup/auth.setup.ts',
  use: {
    baseURL: laceUpApiUrl,
  },
},
{
  name: 'laceup-api',
  testMatch: '**/laceup/api/**/*.spec.ts',
  dependencies: ['laceup-auth'],
  use: {
    baseURL: laceUpApiUrl,
    storageState: laceUpAuthFile,
  },
},
```

- [ ] **Step 4: Document non-secret environment values**

Append to `.env.example`:

```dotenv
LACEUP_API_URL=http://localhost:8000
LACEUP_E2E_USERNAME=e2e_playwright_api
```

- [ ] **Step 5: Verify SauceDemo discovery remains isolated**

Run:

```bash
npx playwright test --list --project=chromium
```

Expected: exactly the existing three files under `tests/ui/` are listed; no Lace Up test is listed.

- [ ] **Step 6: Commit project configuration**

```bash
git add playwright.config.ts .env.example
git commit -m "Configure Lace Up API test projects"
```

### Task 2: Add Session Setup And Read-Only API Tests

**Files:**
- Create: `tests/laceup/auth.setup.ts`
- Create: `tests/laceup/api/runs.spec.ts`

- [ ] **Step 1: Create the authentication setup**

Create `tests/laceup/auth.setup.ts`:

```typescript
import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const authFile = path.join(process.cwd(), 'playwright/.auth/laceup.json');
const username = process.env.LACEUP_E2E_USERNAME ?? 'e2e_playwright_api';

setup('authenticate Lace Up API', async ({ request }) => {
  expect(
    username.startsWith('e2e_'),
    'LACEUP_E2E_USERNAME must begin with e2e_',
  ).toBeTruthy();

  const response = await request.post('/api/test/login/', {
    data: { username },
  });
  const responseText = await response.text();

  expect(response.status(), responseText.slice(0, 500)).toBe(200);
  expect(JSON.parse(responseText)).toMatchObject({ username });

  await mkdir(path.dirname(authFile), { recursive: true });
  await request.storageState({ path: authFile });
});
```

- [ ] **Step 2: Create the API behavior tests**

Create `tests/laceup/api/runs.spec.ts`:

```typescript
import { expect, test } from '../../../fixtures/test';

const laceUpApiUrl = process.env.LACEUP_API_URL ?? 'http://localhost:8000';

test.describe('Lace Up runs API', () => {
  test('returns the public health status', async ({ playwright }) => {
    const publicApi = await playwright.request.newContext({
      baseURL: laceUpApiUrl,
    });

    try {
      const response = await publicApi.get('/api/health/');

      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await publicApi.dispose();
    }
  });

  test('rejects unauthenticated access to runs', async ({ playwright }) => {
    const publicApi = await playwright.request.newContext({
      baseURL: laceUpApiUrl,
    });

    try {
      const response = await publicApi.get('/api/runs/');

      expect([401, 403]).toContain(response.status());
    } finally {
      await publicApi.dispose();
    }
  });

  test('lists runs for an authenticated E2E user', async ({ request }) => {
    const response = await request.get('/api/runs/');

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBeTruthy();
  });
});
```

- [ ] **Step 3: Start the Lace Up API with local E2E authentication**

Run from the Lace Up repository without reading or printing its `.env` file:

```bash
cd /Users/lujingsheng/lace_up
docker compose -f compose.dev.yaml -f compose.e2e.yaml up -d db backend
```

Wait until this command returns `200`:

```bash
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  http://localhost:8000/api/health/
```

- [ ] **Step 4: Run the Lace Up project and verify all tests pass**

From the Playwright repository, run:

```bash
npx playwright test --project=laceup-api
```

Expected: the authentication setup and all three API tests pass.

- [ ] **Step 5: Verify storage state is ignored without printing it**

Run:

```bash
test -s playwright/.auth/laceup.json
git check-ignore -q playwright/.auth/laceup.json
```

Expected: both commands exit with status `0`; do not display the file contents.

- [ ] **Step 6: Verify TypeScript and test discovery**

Run:

```bash
npx tsc --noEmit
npx playwright test --list --project=laceup-api
```

Expected: TypeScript exits with status `0`; the auth dependency and three API tests are discoverable.

- [ ] **Step 7: Commit authentication and API tests**

```bash
git add tests/laceup/auth.setup.ts tests/laceup/api/runs.spec.ts
git commit -m "Add authenticated Lace Up API tests"
```

### Task 3: Add Commands And Documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Update the API script without changing package metadata**

Change only the existing `test:api` value in `package.json`:

```json
"test:api": "npx playwright test --project=laceup-api"
```

Do not change the `license` field as part of the feature branch.

- [ ] **Step 2: Document the Lace Up test structure**

Add the following entries under the existing `tests/` tree in `README.md`:

```text
  laceup/
    auth.setup.ts          Local E2E Session setup
    api/
      runs.spec.ts         Public, permission, and authenticated API tests
```

- [ ] **Step 3: Document the API prerequisites and command**

Under `Running Tests`, add:

````markdown
### Lace Up API Tests

Start the Lace Up backend with local E2E authentication:

```bash
cd /Users/lujingsheng/lace_up
docker compose -f compose.dev.yaml -f compose.e2e.yaml up -d db backend
```

Run the API suite:

```bash
npm run test:api
```

The suite verifies the public health endpoint, unauthorized access control, and authenticated access to the runs API. Authentication state is written to the ignored `playwright/.auth/` directory and must never be committed.
````

- [ ] **Step 4: Update the roadmap**

Remove `API test layer` from the planned improvements because this phase implements it. Leave the other roadmap items unchanged.

- [ ] **Step 5: Run the documented command and static checks**

```bash
npm run test:api
npx tsc --noEmit
git diff --check
```

Expected: the auth setup and three API tests pass; TypeScript and diff checks exit with status `0`.

- [ ] **Step 6: Confirm the feature does not introduce License edits**

Run:

```bash
git diff -- README.md package.json package-lock.json
```

Expected: only feature-related README and `test:api` changes appear; no License change is introduced by the feature branch and `package-lock.json` remains unchanged.

- [ ] **Step 7: Commit commands and documentation**

```bash
git add package.json README.md
git commit -m "Document Lace Up API test workflow"
```

### Task 4: Final Verification

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] **Step 1: Verify project isolation**

```bash
npx playwright test --list --project=chromium
npx playwright test --list --project=laceup-api
```

Expected: `chromium` lists only SauceDemo UI tests; `laceup-api` lists only the Lace Up auth dependency and API tests.

- [ ] **Step 2: Run the complete API workflow**

```bash
npm run test:api
```

Expected: 4 tests pass in total: one auth setup and three API tests.

- [ ] **Step 3: Run TypeScript and repository checks**

```bash
npx tsc --noEmit
git diff main...HEAD --check
git status --short
```

Expected: TypeScript and diff checks pass, and the feature worktree is clean.

- [ ] **Step 4: Confirm no sensitive artifact is tracked**

```bash
git ls-files playwright/.auth test-results playwright-report
```

Expected: no output.
