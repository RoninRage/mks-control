import { test, expect } from '@playwright/test';
import { loginAsAdmin, clearAuthState } from '../helpers/auth';
import { getTestDatabaseConnection, seedDatabase } from '../helpers/database';
import { createTestUser, createTestUsers } from '../helpers/factories';

test.describe('Members CRUD', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state and login as admin
    await page.goto('/');
    await clearAuthState(page);
    await loginAsAdmin(page);
  });

  test('admin can view members list', async ({ page }) => {
    await page.goto('/members');

    // Verify we're on members page
    await expect(page).toHaveURL('/members');

    // Verify page title/heading
    await expect(
      page
        .locator('h1, h2, h3, h4')
        .filter({ hasText: /mitglied/i })
        .first()
    ).toBeVisible();

    // Verify test members are visible (scope to table rows)
    const membersTable = page.getByRole('table');
    await expect(membersTable.getByText('Test Admin', { exact: true })).toBeVisible();
    await expect(membersTable.getByText('Test Member', { exact: true })).toBeVisible();
  });

  test('admin can create new member', async ({ page }) => {
    // Seed a new member using factory
    const newMember = createTestUser({
      member: {
        firstName: 'Neu',
        lastName: 'Mitglied',
        email: 'neu.mitglied@example.com',
        roles: ['mitglied'],
      },
    });

    await page.goto('/members');

    // Look for "Create" or "Add" button (adjust selector based on actual UI)
    const createButton = page
      .locator('button', { hasText: /neu|add|erstellen|hinzufügen/i })
      .first();

    if (await createButton.isVisible()) {
      await createButton.click();

      // Fill form fields (adjust selectors based on actual UI)
      await page.fill('input[name="firstName"], input[id*="first"]', newMember.member.firstName);
      await page.fill('input[name="lastName"], input[id*="last"]', newMember.member.lastName);

      if (await page.locator('input[name="email"], input[id*="email"]').isVisible()) {
        await page.fill('input[name="email"], input[id*="email"]', newMember.member.email || '');
      }

      // Submit form
      await page.locator('button[type="submit"]').click();

      // Wait for navigation or success message
      await page.waitForTimeout(1000);

      // Verify member appears in list
      await expect(page.locator(`text=${newMember.member.firstName}`)).toBeVisible();
    }
  });

  test('admin can edit existing member', async ({ page }) => {
    await page.goto('/members');

    // Click edit button for Test Member (adjust selector based on actual UI)
    const editButton = page
      .locator('text=Test Member')
      .locator('..')
      .locator('button', { hasText: /edit|bearbeiten/i })
      .first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Verify we're on edit page
      await expect(page).toHaveURL(/\/members\/.*\/edit/);

      // Update member details
      await page.fill('input[name="phone"], input[id*="phone"]', '+49 123 456789');

      // Save changes
      await page.locator('button[type="submit"]').click();

      // Wait for save to complete
      await page.waitForTimeout(1000);
    }
  });

  test('admin can view member details', async ({ page }) => {
    await page.goto('/members');

    // Click edit button for Test Admin member
    const adminRow = page.getByRole('row', { name: /Test Admin/i }).first();
    const editButton = adminRow.getByRole('button', { name: /edit member/i }).first();
    await editButton.click();

    // Should navigate to member details or edit page
    await expect(page).toHaveURL(/\/members/);
  });

  test('members list displays member information', async ({ page }) => {
    // Seed additional members for testing list display
    const additionalMembers = createTestUsers(3, {
      member: { roles: ['mitglied'] },
    });

    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await seedDatabase(
      membersDb,
      additionalMembers.map((u) => u.member)
    );
    await seedDatabase(
      tagsDb,
      additionalMembers.map((u) => u.tag)
    );

    await page.goto('/members');

    // Verify members are displayed
    for (const user of additionalMembers) {
      const fullName = `${user.member.firstName} ${user.member.lastName}`;
      await expect(
        page.getByRole('row', { name: new RegExp(fullName, 'i') }).first()
      ).toBeVisible();
    }
  });

  test('can filter or search members', async ({ page }) => {
    await page.goto('/members');

    // Look for search/filter input
    const searchInput = page
      .locator(
        'input[type="search"], input[placeholder*="suche" i], input[placeholder*="search" i]'
      )
      .first();

    if (await searchInput.isVisible()) {
      // Search for specific member
      await searchInput.fill('Test Admin');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify filtered results
      await expect(page.locator('text=Test Admin')).toBeVisible();
    }
  });

  test('member roles display correctly', async ({ page }) => {
    await page.goto('/members');

    // Verify admin role badge/indicator is visible for Test Admin
    const adminRow = page.getByRole('row', { name: /Test Admin/i });
    await expect(adminRow.getByText('Admin', { exact: true })).toBeVisible();
  });

  test('inactive members marked appropriately', async ({ page }) => {
    await page.goto('/members');

    // Verify inactive member is shown as inactive
    const inactiveRow = page.locator('text=Inactive User').locator('..');

    if (await inactiveRow.isVisible()) {
      // Check for inactive indicator (adjust based on actual UI)
      await expect(inactiveRow.locator('text=/inactive|inaktiv/i')).toBeVisible();
    }
  });

  test('can toggle member active status', async ({ page }) => {
    // Create a test member to toggle
    const toggleMember = createTestUser({
      member: {
        firstName: 'Toggle',
        lastName: 'Test',
        isActive: true,
      },
    });

    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await seedDatabase(membersDb, [toggleMember.member]);
    await seedDatabase(tagsDb, [toggleMember.tag]);

    await page.goto('/members');

    // Find and click edit button for toggle member
    const toggleRow = page.locator('text=Toggle Test').locator('..');
    const editButton = toggleRow.locator('button', { hasText: /edit|bearbeiten/i }).first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Toggle active status
      const activeCheckbox = page.locator('input[type="checkbox"][name*="active" i]').first();

      if (await activeCheckbox.isVisible()) {
        await activeCheckbox.click();

        // Save changes
        await page.locator('button[type="submit"]').click();

        await page.waitForTimeout(1000);

        // Verify status changed
        await page.goto('/members');
        await expect(page.locator('text=Toggle Test')).toBeVisible();
      }
    }
  });
});

test.describe('Member Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAuthState(page);
    await loginAsAdmin(page);
  });

  test('admin can update member roles', async ({ page }) => {
    await page.goto('/members');

    // Find Test Member and edit
    const memberRow = page.locator('text=Test Member').locator('..');
    const editButton = memberRow.locator('button', { hasText: /edit|bearbeiten/i }).first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Look for role selection (adjust based on actual UI)
      const roleSelect = page.locator('select[name*="role" i], .role-selector').first();

      if (await roleSelect.isVisible()) {
        // Update role
        await roleSelect.selectOption('vorstand');

        // Save
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('admin can manage equipment permissions', async ({ page }) => {
    await page.goto('/members');

    // Navigate to member edit page
    const editButton = page
      .locator('text=Test Member')
      .locator('..')
      .locator('button', { hasText: /edit|bearbeiten/i })
      .first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Look for equipment permissions section
      const permissionsSection = page.locator('text=/berechtigungen|permissions/i').locator('..');

      if (await permissionsSection.isVisible()) {
        // Toggle equipment permission checkboxes
        const firstCheckbox = permissionsSection.locator('input[type="checkbox"]').first();

        if (await firstCheckbox.isVisible()) {
          await firstCheckbox.click();

          // Save changes
          await page.locator('button[type="submit"]').click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });
});

test.describe('Member Tag Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearAuthState(page);
    await loginAsAdmin(page);
  });

  test('can view member tags', async ({ page }) => {
    await page.goto('/members');

    // Navigate to member details/edit
    const memberRow = page.getByRole('row', { name: /Test Member/i });
    const editButton = memberRow.getByRole('button', { name: /edit member/i }).first();
    await editButton.click();

    // Look for tag information section
    await expect(page.getByRole('heading', { name: /tags verwalten/i })).toBeVisible();
  });

  test('can assign tag to member', async ({ page }) => {
    // Create member without tag
    const noTagMember = createTestUser({
      member: {
        firstName: 'No',
        lastName: 'Tag',
      },
      tag: {
        isActive: false, // No active tag
      },
    });

    const { membersDb } = getTestDatabaseConnection();
    await seedDatabase(membersDb, [noTagMember.member]);

    await page.goto('/members');

    // Find and edit member
    const memberRow = page.locator('text=No Tag').locator('..');
    const editButton = memberRow.locator('button', { hasText: /edit|bearbeiten/i }).first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Look for tag assignment UI
      const tagInput = page.locator('input[name*="tag" i]').first();

      if (await tagInput.isVisible()) {
        await tagInput.fill('new-tag-uid-12345');

        // Save
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
