import { expect, test } from '@playwright/test';

test.describe('experiencia pública', () => {
  test('muestra el acceso y permite cambiar entre tema claro y oscuro', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    const themeBefore = await page.locator('html').getAttribute('data-theme');
    if (themeBefore) {
      await page.getByRole('button', { name: 'Oscuro' }).click({ force: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'Claro' }).click({ force: true });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
  });

  test('navega al registro de tienda con plan y términos', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByRole('link', { name: 'Registrar mi tienda' }).click();
    await expect(page.getByRole('heading', { name: 'Registre su negocio' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  test('la aplicación tiene un icono propio y metadatos en español', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page).toHaveTitle('Saldio POS');
    const icon = page.locator('link[rel="icon"]');
    await expect(icon).toHaveAttribute('href', '/brand/saldio-icon.svg');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
