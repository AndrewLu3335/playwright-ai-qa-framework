import { expect, test } from '../../../fixtures/test';

const laceUpApiUrl = process.env.LACEUP_API_URL ?? 'http://localhost:8000';
const laceUpUiUrl = process.env.LACEUP_UI_URL ?? 'http://localhost:3000';

test.describe('Lace Up run list', () => {
  // Confirms that the protected API response drives the authenticated run list.
  test('renders the authenticated runs API response', async ({ page }) => {
    const runsResponsePromise = page.waitForResponse((response) => (
      response.url() === `${laceUpApiUrl}/api/runs/`
      && response.request().method() === 'GET'
    ));

    await page.goto('/runs');

    const runsResponse = await runsResponsePromise;
    expect(runsResponse.status()).toBe(200);
    const runs = await runsResponse.json();
    expect(Array.isArray(runs)).toBeTruthy();

    await expect(page).toHaveURL(/\/runs$/);
    await expect(page.getByRole('heading', { name: /My Running Records/ })).toBeVisible();
    await expect(page.getByTestId('run-record-list')).toBeVisible();

    const runCards = page.getByTestId('run-record-card');
    await expect(runCards).toHaveCount(runs.length);
    if (runs.length > 0) {
      await expect(runCards.first()).toContainText(`${runs[0].distance_km} km`);
    }
  });

  // Confirms that users without a Django Session cannot open the run list.
  test('redirects unauthenticated users to login', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: laceUpUiUrl,
      storageState: { cookies: [], origins: [] },
    });

    try {
      const page = await context.newPage();
      await page.goto('/runs');

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByAltText('Connect with Strava')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
