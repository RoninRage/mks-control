import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import {
  deleteDocumentsByType,
  getTestDatabaseConnection,
  seedDatabase,
} from '../helpers/database';
import { createTestArea } from '../helpers/factories';

test.describe('Areas Page', () => {
  test.describe('Empty state', () => {
    test.beforeEach(async ({ page }) => {
      const { membersDb } = getTestDatabaseConnection();
      await deleteDocumentsByType(membersDb, 'area');

      await loginAsAdmin(page);
      await page.goto('/areas');
    });

    test('shows empty state and create action', async ({ page }) => {
      await expect(page.getByTestId('areas-empty')).toBeVisible();

      await page.getByTestId('areas-empty-create').click();
      await expect(page).toHaveURL('/areas/create');
    });
  });

  test.describe('List state', () => {
    test.beforeEach(async ({ page }) => {
      const { membersDb } = getTestDatabaseConnection();
      await deleteDocumentsByType(membersDb, 'area');

      const areas = [
        createTestArea({
          id: 'area-1',
          name: 'Elektronik',
          description: 'Bereich für elektronische Projekte und Arbeiten',
        }),
        createTestArea({
          id: 'area-2',
          name: '3D Druck',
          description: 'Bereich für 3D-Drucker und additive Fertigung',
        }),
      ];

      await seedDatabase(membersDb, areas);

      await loginAsAdmin(page);
      await page.goto('/areas');
    });

    test('renders list with count and details', async ({ page }) => {
      await expect(page.getByTestId('areas-count')).toContainText('2 Bereiche');
      await expect(page.getByTestId('area-card')).toHaveCount(2);

      await expect(page.getByText('Elektronik')).toBeVisible();
      await expect(page.getByText('3D Druck')).toBeVisible();
    });

    test('create button navigates to create page', async ({ page }) => {
      await page.getByTestId('areas-create').click();
      await expect(page).toHaveURL('/areas/create');
    });

    test('edit button navigates to edit page', async ({ page }) => {
      const areaCard = page.locator('[data-area-id="area-1"]');
      await areaCard.getByTestId('area-edit').click();
      await expect(page).toHaveURL('/areas/area-1/edit');
    });

    test('delete flow removes area after confirmation', async ({ page }) => {
      const areaCard = page.locator('[data-area-id="area-2"]');
      await areaCard.getByTestId('area-delete').click();

      const dialog = page.locator('.q-dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Löschen' }).click();

      await expect(page.locator('[data-area-id="area-2"]')).toHaveCount(0);
      await expect(page.getByTestId('areas-count')).toContainText('1 Bereiche');
    });
  });
});
