# Playwright E2E Automation Framework with AI-assisted QA

End-to-end QA automation framework built with Playwright and TypeScript. The project demonstrates a maintainable UI test architecture using Page Object Model, test data separation, tagged test execution, and failure diagnostics through Playwright reports, screenshots, videos, and traces.

## Tech Stack

- Playwright Test
- TypeScript
- Page Object Model
- HTML test reports
- Trace, screenshot, and video artifacts

## Current Coverage

The current UI suite uses https://www.saucedemo.com/ as the test application and covers:

- Successful login
- Invalid login error validation
- Add product to cart
- Remove product from cart
- Complete checkout flow

## Project Structure

```text
data/
  users.ts                 Test users and checkout data

pages/
  LoginPage.ts             Login page actions and assertions
  InventoryPage.ts         Product listing and cart entry actions
  CartPage.ts              Cart assertions and checkout entry
  CheckoutPage.ts          Checkout information and order completion

tests/
  ui/
    login.spec.ts          Login smoke and negative tests
    cart.spec.ts           Cart workflow tests
    checkout.spec.ts       End-to-end checkout regression test

playwright.config.ts       Playwright runtime configuration
tsconfig.json              TypeScript project configuration
```

## Installation

```bash
npm install
npx playwright install chromium
```

## Running Tests

Run the full suite:

```bash
npm test
```

Run UI tests:

```bash
npm run test:ui
```

Run smoke tests:

```bash
npm run test:smoke
```

Run regression tests:

```bash
npm run test:regression
```

Run tests in headed mode:

```bash
npm run test:headed
```

Open the HTML report:

```bash
npm run report
```

## Test Strategy

This project separates test intent from page implementation details:

- Specs describe business behavior.
- Page objects own selectors, actions, and page-level assertions.
- Test data is isolated under `data/`.
- Tags such as `@smoke` and `@regression` support targeted execution.
- Failure artifacts help with debugging without adding noise to passing runs.

## Diagnostics

The Playwright configuration currently enables:

- HTML report generation
- Screenshot capture on failure
- Video retention on failure
- Trace collection on first retry
- CI-only retries
- CI protection against committed `test.only`

## Roadmap

Planned improvements:

- GitHub Actions workflow for CI execution
- API test layer
- Cross-browser and mobile projects
- AI-assisted failure analysis from screenshots and traces
- README badges and published test report artifacts

## License

ISC
