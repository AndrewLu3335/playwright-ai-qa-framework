import { expect, test } from '../../../fixtures/test';

const laceUpApiUrl = process.env.LACEUP_API_URL ?? 'http://localhost:8000';

test.describe('Lace Up runs API', () => {
  // Confirms that the public liveness endpoint is reachable without a session.
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

  // Confirms that run data remains protected when no session cookie is present.
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

  // Confirms that the setup-generated Django Session can read the user's runs.
  test('lists runs for an authenticated E2E user', async ({ request }) => {
    const response = await request.get('/api/runs/');

    expect(response.status()).toBe(200);
    expect(Array.isArray(await response.json())).toBeTruthy();
  });
});
