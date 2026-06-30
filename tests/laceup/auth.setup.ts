import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const authFile = path.join(process.cwd(), 'playwright/.auth/laceup.json');
const username = process.env.LACEUP_E2E_USERNAME ?? 'e2e_playwright_api';

// Creates the reusable Django Session used by authenticated Lace Up API tests.
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
