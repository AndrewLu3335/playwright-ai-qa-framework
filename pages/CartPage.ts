import { expect, type Page } from '@playwright/test';

export class CartPage {
  constructor(private readonly page: Page) {}

  async expectProductInCart(productName: string) {
    await expect(this.cartItem(productName)).toBeVisible();
  }

  async expectProductNotInCart(productName: string) {
    await expect(this.cartItem(productName)).toHaveCount(0);
  }

  async removeProduct(productName: string) {
    await this.cartItem(productName).getByRole('button', { name: 'Remove' }).click();
  }

  async checkout() {
    await this.page.getByRole('button', { name: 'Checkout' }).click();
  }

  private cartItem(productName: string) {
    return this.page.locator('[data-test="inventory-item"]').filter({ hasText: productName });
  }
}
