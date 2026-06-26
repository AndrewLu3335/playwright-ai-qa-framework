import { test } from '@playwright/test';
import { checkoutCustomer, users } from '../../data/users';
import { CartPage } from '../../pages/CartPage';
import { CheckoutPage } from '../../pages/CheckoutPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { LoginPage } from '../../pages/LoginPage';

test.describe('checkout', () => {
  test('@regression completes an order for a standard user', async ({ page }) => {
    const loginPage = new  LoginPage(page);
    const inventoryPage = new InventoryPage(page);
    const cartPage = new CartPage(page);
    const checkoutPage = new CheckoutPage(page);

    await loginPage.goto();
    await loginPage.login(users.standard.username, users.standard.password);

    await inventoryPage.addProductToCart('Sauce Labs Backpack');
    await inventoryPage.openCart();

    await cartPage.expectProductInCart('Sauce Labs Backpack');
    await cartPage.checkout();

    await checkoutPage.fillCustomerInformation(checkoutCustomer);
    await checkoutPage.continue();
    await checkoutPage.expectOverviewForProduct('Sauce Labs Backpack');
    await checkoutPage.finish();
    await checkoutPage.expectOrderComplete();
  });
});
