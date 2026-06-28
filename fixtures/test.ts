import { expect, test as base } from '@playwright/test';
import fs from 'node:fs/promises';

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.split('?')[0].split('#')[0];
  }
}

function redact(value: string) {
  return value.replace(
    /(authorization|token|api[_-]?key|password|secret)\s*[:=]\s*\S+/gi,
    '$1=[REDACTED]',
  );
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const failedRequests: Array<Record<string, string>> = [];
    const httpErrors: Array<Record<string, string | number>> = [];
    const consoleErrors: Array<Record<string, string>> = [];
    let navigation: Record<string, string | number> | null = null;

    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: sanitizeUrl(request.url()),
        method: request.method(),
        errorText: request.failure()?.errorText || 'Unknown network failure',
      });
    });

    page.on('response', (response) => {
      if (response.request().resourceType() === 'document') {
        navigation = {
          url: sanitizeUrl(response.url()),
          status: response.status(),
        };
      }

      if (response.status() >= 400) {
        httpErrors.push({
          url: sanitizeUrl(response.url()),
          method: response.request().method(),
          status: response.status(),
        });
      }
    });

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({
          text: redact(message.text()).slice(0, 500),
          url: sanitizeUrl(message.location().url || page.url()),
        });
      }
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus) {
      const evidence = {
        page: {
          url: sanitizeUrl(page.url()),
          title: await page.title().catch(() => 'Unavailable'),
          readyState: await page
            .evaluate(() => document.readyState)
            .catch(() => 'unavailable'),
        },
        navigation,
        failedRequests: failedRequests.slice(0, 20),
        httpErrors: httpErrors.slice(0, 20),
        consoleErrors: consoleErrors.slice(0, 20),
      };
      const evidenceFile = testInfo.outputPath('technical-evidence.json');

      await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
      await testInfo.attach('technical-evidence', {
        path: evidenceFile,
        contentType: 'application/json',
      });
    }
  },
});

export { expect };
