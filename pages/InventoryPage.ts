import { expect, type Page } from '@playwright/test';

export class InventoryPage {
  constructor(private readonly page: Page) {}

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/inventory\.html$/);
    await expect(this.page.getByText('Products')).toBeVisible();
  }

  async addProductToCart(productName: string) {
    await this.product(productName).getByRole('button', { name: 'Add to cart' }).click();
  }

  async expectCartCount(count: number) {
    await expect(this.page.locator('[data-test="shopping-cart-badge"]')).toHaveText(String(count));
  }

  async openCart() {
    await this.page.locator('[data-test="shopping-cart-link"]').click();
  }

  private product(productName: string) {
    return this.page.locator('[data-test="inventory-item"]').filter({ hasText: productName });
  }
}
