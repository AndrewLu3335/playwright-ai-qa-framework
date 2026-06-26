import { expect, type Page } from '@playwright/test';

type CheckoutCustomer = {
  firstName: string;
  lastName: string;
  postalCode: string;
};

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async fillCustomerInformation(customer: CheckoutCustomer) {
    await this.page.getByPlaceholder('First Name').fill(customer.firstName);
    await this.page.getByPlaceholder('Last Name').fill(customer.lastName);
    await this.page.getByPlaceholder('Zip/Postal Code').fill(customer.postalCode);
  }

  async continue() {
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  async expectOverviewForProduct(productName: string) {
    await expect(this.page.getByText('Checkout: Overview')).toBeVisible();
    await expect(this.page.getByText(productName)).toBeVisible();
  }

  async finish() {
    await this.page.getByRole('button', { name: 'Finish' }).click();
  }

  async expectOrderComplete() {
    await expect(this.page.getByText('Thank you for your order!')).toBeVisible();
  }
}
