import { expect, test } from '../../../fixtures/test';

const laceUpApiUrl = process.env.LACEUP_API_URL ?? 'http://localhost:8000';

test.describe('Lace Up runs API', () => {
  test('returns the public health status', async ({ playwright }) => {
    const publicApi = await playwright.request.newContext({
      baseURL: laceUpApiUrl,
      storageState: { cookies: [], origins: [] },
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
      storageState: { cookies: [], origins: [] },
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
