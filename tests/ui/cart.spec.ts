import { test } from '../../fixtures/test';
import { users } from '../../data/users';
import { CartPage } from '../../pages/CartPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { LoginPage } from '../../pages/LoginPage';

test.describe('cart', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);
  });

  test('adds and removes a product from the cart', async ({ page }) => {
    const inventoryPage = new InventoryPage(page);
    const cartPage = new CartPage(page);

    await inventoryPage.expectLoaded();
    await inventoryPage.addProductToCart('Sauce Labs Backpack');
    await inventoryPage.expectCartCount(1);

    await inventoryPage.openCart();
    await cartPage.expectProductInCart('Sauce Labs Backpack');

    await cartPage.removeProduct('Sauce Labs Backpack');
    await cartPage.expectProductNotInCart('Sauce Labs Backpack');
  });
});
