import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('https://www.saucedemo.com/');
  }

  async expectLoaded() {
    await expect(this.page).toHaveTitle('Swag Labs');
    await expect(this.page.getByText('Login')).toBeVisible();
  }

  async login(username: string, password: string) {
    await this.page.getByPlaceholder('Username').fill(username);
    await this.page.getByPlaceholder('Password').fill(password);
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async expectLoginError(message: string) {
    await expect(this.page.locator('[data-test="error"]')).toContainText(message);
  }
}
