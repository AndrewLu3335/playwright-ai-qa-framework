export const users = {
  standard: {
    username: 'standard_user',
    password: 'secret_sauce',
  },
  invalid: {
    username: 'standard_user',
    password: 'wrong_password',
  },
} as const;

export const checkoutCustomer = {
  firstName: 'Test',
  lastName: 'User',
  postalCode: 'M5V 2T6',
} as const;
