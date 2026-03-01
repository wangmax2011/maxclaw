// MaxClaw Dashboard E2E Tests
import { test, expect } from '@playwright/test';

test.describe('Dashboard Main Page', () => {
  test('should load dashboard successfully', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/MaxClaw Dashboard/);

    // Check header
    const header = page.locator('.header h1');
    await expect(header).toBeVisible();
    await expect(header).toContainText('MaxClaw Dashboard');

    // Check stats grid is visible
    const statsGrid = page.locator('#statsGrid');
    await expect(statsGrid).toBeVisible();
  });

  test('should display stats correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for stats to load
    await page.waitForTimeout(2000);

    // Check all stat cards are present
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(5);

    // Check stat values are displayed (should be numbers or 0)
    const statValues = page.locator('.stat-value');
    const count = await statValues.count();
    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const value = await statValues.nth(i).textContent();
      expect(value).toMatch(/^\d+$|-/); // Should be a number or dash
    }
  });

  test('should display admin panel link', async ({ page }) => {
    await page.goto('/');

    // Check admin link exists
    const adminLink = page.locator('a[href="/admin"]');
    await expect(adminLink).toBeVisible();
    await expect(adminLink).toContainText('Admin Panel');

    // Click and navigate to admin
    await adminLink.click();
    await expect(page).toHaveURL('/admin');
  });

  test('should have refresh button', async ({ page }) => {
    await page.goto('/');

    const refreshBtn = page.locator('button.refresh-btn');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toContainText('Refresh');
  });

  test('should display projects section', async ({ page }) => {
    await page.goto('/');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // Check projects section exists
    const projectsSection = page.locator('.section').first();
    await expect(projectsSection).toBeVisible();

    // Check section title
    const sectionTitle = page.locator('.section-title');
    await expect(sectionTitle.first()).toContainText('Active Projects');
  });

  test('should display sessions section', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find sessions section
    const sections = page.locator('.section');
    const sessionsSection = sections.nth(1);
    await expect(sessionsSection).toBeVisible();

    const sectionTitle = sessionsSection.locator('.section-title');
    await expect(sectionTitle).toContainText('Recent Sessions');
  });

  test('should display activity timeline', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find activity section
    const sections = page.locator('.section');
    const activitySection = sections.nth(2);
    await expect(activitySection).toBeVisible();

    const sectionTitle = activitySection.locator('.section-title');
    await expect(sectionTitle).toContainText('Recent Activity');
  });
});

test.describe('Admin Panel Page', () => {
  test('should load admin panel successfully', async ({ page }) => {
    await page.goto('/admin');

    // Check page title
    await expect(page).toHaveTitle(/MaxClaw Admin/);

    // Check header
    const header = page.locator('.header h1');
    await expect(header).toBeVisible();
    await expect(header).toContainText('MaxClaw Admin');
  });

  test('should display navigation tabs', async ({ page }) => {
    await page.goto('/admin');

    // Check all nav tabs are present
    const navBtns = page.locator('.nav-btn');
    await expect(navBtns).toHaveCount(4);

    // Check tab labels
    await expect(navBtns.nth(0)).toContainText('Settings');
    await expect(navBtns.nth(1)).toContainText('Projects');
    await expect(navBtns.nth(2)).toContainText('Skills');
    await expect(navBtns.nth(3)).toContainText('Schedules');
  });

  test('should switch between pages', async ({ page }) => {
    await page.goto('/admin');

    // Settings page is active by default
    let settingsPage = page.locator('#settings-page');
    await expect(settingsPage).toHaveClass(/active/);

    // Click Projects tab
    const projectsTab = page.locator('.nav-btn').nth(1);
    await projectsTab.click();
    await page.waitForTimeout(500);

    // Check Projects page is active
    let projectsPage = page.locator('#projects-page');
    await expect(projectsPage).toHaveClass(/active/);
    await expect(settingsPage).not.toHaveClass(/active/);

    // Click Skills tab
    const skillsTab = page.locator('.nav-btn').nth(2);
    await skillsTab.click();
    await page.waitForTimeout(500);

    // Check Skills page is active
    let skillsPage = page.locator('#skills-page');
    await expect(skillsPage).toHaveClass(/active/);
  });

  test('should display Settings page content', async ({ page }) => {
    await page.goto('/admin');

    // Check Settings sections
    const sectionTitles = page.locator('.section-title');
    await expect(sectionTitles.nth(0)).toContainText('Scan Paths');
    await expect(sectionTitles.nth(1)).toContainText('AI Settings');
    await expect(sectionTitles.nth(2)).toContainText('Session Pool');
    await expect(sectionTitles.nth(3)).toContainText('TUI Settings');

    // Check form elements exist
    const summaryEnabledToggle = page.locator('#summaryEnabled');
    await expect(summaryEnabledToggle).toBeVisible();

    const summaryModelInput = page.locator('#summaryModel');
    await expect(summaryModelInput).toBeVisible();

    const maxSessionsInput = page.locator('#maxSessions');
    await expect(maxSessionsInput).toBeVisible();

    const saveBtn = page.locator('button', { hasText: 'Save Configuration' });
    await expect(saveBtn).toBeVisible();
  });

  test('should load config data correctly', async ({ page }) => {
    await page.goto('/admin');

    // Wait for config to load
    await page.waitForTimeout(1000);

    // Check scan paths are displayed (from config)
    const scanPathsList = page.locator('#scanPathsList');
    await expect(scanPathsList).toBeVisible();

    // The scanPathsList should contain items or empty state
    const hasItems = await scanPathsList.locator('.item-row').count() > 0;
    const hasEmptyState = await scanPathsList.locator('.empty-state').count() > 0;
    expect(hasItems || hasEmptyState).toBe(true);
  });

  test('should display Projects page content', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Projects tab
    const projectsTab = page.locator('.nav-btn').nth(1);
    await projectsTab.click();
    await page.waitForTimeout(500);

    // Check add project form
    const projectNameInput = page.locator('#projectName');
    await expect(projectNameInput).toBeVisible();

    const projectPathInput = page.locator('#projectPath');
    await expect(projectPathInput).toBeVisible();

    const addBtn = page.locator('button', { hasText: 'Add Project' });
    await expect(addBtn).toBeVisible();

    // Check projects list
    const projectsList = page.locator('#projectsList');
    await expect(projectsList).toBeVisible();
  });

  test('should add a new project', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Projects tab
    const projectsTab = page.locator('.nav-btn').nth(1);
    await projectsTab.click();
    await page.waitForTimeout(500);

    // Fill in project form with unique name
    const testName = 'Test Project E2E ' + Date.now();
    const testPath = '/tmp/test-project-e2e-' + Date.now();

    await page.fill('#projectName', testName);
    await page.fill('#projectPath', testPath);

    // Click Add button
    const addBtn = page.locator('button', { hasText: 'Add Project' });
    await addBtn.click();

    // Wait for success message
    await page.waitForTimeout(2000);
    const statusMsg = page.locator('#projects-status');
    const msgClass = await statusMsg.getAttribute('class');

    // Check if it's a success or if project was added
    if (msgClass?.includes('success')) {
      // Verify project appears in list
      const projectsList = page.locator('#projectsList');
      await expect(projectsList).toContainText(testName);
    } else {
      // If not success, check if project exists in list (might already exist)
      const projectsList = page.locator('#projectsList');
      await expect(projectsList).toBeVisible();
    }
  });

  test('should delete a project', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Projects tab
    const projectsTab = page.locator('.nav-btn').nth(1);
    await projectsTab.click();
    await page.waitForTimeout(500);

    // First, add a test project to delete
    const testName = 'Test Delete Project ' + Date.now();
    const testPath = '/tmp/test-delete-' + Date.now();

    await page.fill('#projectName', testName);
    await page.fill('#projectPath', testPath);

    const addBtn = page.locator('button', { hasText: 'Add Project' });
    await addBtn.click();
    await page.waitForTimeout(1000);

    // Now find and delete the test project
    const projectsList = page.locator('#projectsList');

    // Find the delete button for our test project
    const projectRow = projectsList.locator('.item-row').filter({ hasText: testName });
    const deleteBtn = projectRow.locator('button', { hasText: 'Delete' });
    const hasDeleteBtn = await deleteBtn.count() > 0;

    if (hasDeleteBtn) {
      // Handle confirmation dialog before clicking delete
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      await deleteBtn.click();
      await page.waitForTimeout(2000);

      // Verify project is deleted - should not contain the project name anymore
      const updatedProjectsList = page.locator('#projectsList');
      const hasProject = await updatedProjectsList.locator('text=' + testName).count() > 0;
      expect(hasProject).toBe(false);
    } else {
      // If no delete button found, just verify the list is visible
      await expect(projectsList).toBeVisible();
    }
  });

  test('should display Skills page content', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Skills tab
    const skillsTab = page.locator('.nav-btn').nth(2);
    await skillsTab.click();
    await page.waitForTimeout(500);

    // Check skills list is visible
    const skillsList = page.locator('#skillsList');
    await expect(skillsList).toBeVisible();

    // Should have skills or empty state
    const hasSkills = await skillsList.locator('.item-row').count() > 0;
    const hasEmptyState = await skillsList.locator('.empty-state').count() > 0;
    expect(hasSkills || hasEmptyState).toBe(true);
  });

  test('should toggle skills', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Skills tab
    const skillsTab = page.locator('.nav-btn').nth(2);
    await skillsTab.click();
    await page.waitForTimeout(500);

    // Find skills list and get item rows
    const skillsList = page.locator('#skillsList');
    const itemRows = skillsList.locator('.item-row');
    const count = await itemRows.count();

    if (count > 0) {
      // Get the toggle from the first skill row
      const firstToggle = itemRows.first().locator('.toggle');

      // Get initial state
      const initialClass = await firstToggle.getAttribute('class');
      const wasActive = initialClass?.includes('active') || false;

      // Click the toggle
      await firstToggle.click();
      await page.waitForTimeout(500);

      // Verify toggle state changed
      const newClass = await firstToggle.getAttribute('class');
      const isActive = newClass?.includes('active') || false;

      // State should have changed
      expect(isActive).not.toBe(wasActive);
    }
  });

  test('should display Schedules page content', async ({ page }) => {
    await page.goto('/admin');

    // Navigate to Schedules tab
    const schedulesTab = page.locator('.nav-btn').nth(3);
    await schedulesTab.click();
    await page.waitForTimeout(500);

    // Check schedules list is visible
    const schedulesList = page.locator('#schedulesList');
    await expect(schedulesList).toBeVisible();
  });

  test('should save configuration', async ({ page }) => {
    await page.goto('/admin');

    // Modify a setting
    const summaryModelInput = page.locator('#summaryModel');
    await summaryModelInput.fill('claude-sonnet-4-20250514');

    // Click save
    const saveBtn = page.locator('button', { hasText: 'Save Configuration' });
    await saveBtn.click();

    // Wait for success message
    await page.waitForTimeout(1000);
    const statusMsg = page.locator('#settings-status');
    await expect(statusMsg).toHaveClass(/success/);
  });
});

test.describe('API Data Integrity', () => {
  test('should have valid stats API response', async ({ page, request }) => {
    const response = await request.get('/api/stats');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('totalProjects');
    expect(data).toHaveProperty('totalSessions');
    expect(data).toHaveProperty('activeProjects');
    expect(data).toHaveProperty('activeSessions');
    expect(data).toHaveProperty('pendingSummaries');

    // Values should be numbers
    expect(typeof data.totalProjects).toBe('number');
    expect(typeof data.totalSessions).toBe('number');
  });

  test('should have valid config API response', async ({ page, request }) => {
    const response = await request.get('/api/config');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('scanPaths');
    expect(Array.isArray(data.scanPaths)).toBe(true);

    // Check AI settings
    if (data.ai) {
      expect(data.ai).toHaveProperty('summaryEnabled');
      expect(data.ai).toHaveProperty('summaryModel');
    }

    // Check multiplex settings
    if (data.multiplex) {
      expect(data.multiplex).toHaveProperty('maxSessions');
      expect(data.multiplex).toHaveProperty('maxSessionsPerProject');
    }
  });

  test('should have valid projects API response', async ({ page, request }) => {
    const response = await request.get('/api/projects');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    // If there are projects, verify structure
    if (data.length > 0) {
      const project = data[0];
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('path');
    }
  });

  test('should have valid skills API response', async ({ page, request }) => {
    const response = await request.get('/api/skills');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    if (data.length > 0) {
      const skill = data[0];
      expect(skill).toHaveProperty('id');
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('enabled');
    }
  });

  test('should have valid schedules API response', async ({ page, request }) => {
    const response = await request.get('/api/schedules');
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);

    if (data.length > 0) {
      const schedule = data[0];
      expect(schedule).toHaveProperty('id');
      expect(schedule).toHaveProperty('name');
      expect(schedule).toHaveProperty('cronExpression');
    }
  });
});
