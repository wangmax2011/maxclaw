import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test data setup
const TEST_DATA_DIR = path.join(os.tmpdir(), `maxclaw-e2e-${Date.now()}`);
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'data.db');

async function setupTestData() {
  // Create test directory
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  // Create test projects using CLI
  const projectPaths = [
    path.join(TEST_DATA_DIR, 'project-a'),
    path.join(TEST_DATA_DIR, 'project-b'),
    path.join(TEST_DATA_DIR, 'project-c'),
  ];

  for (const projectPath of projectPaths) {
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
      name: path.basename(projectPath),
      version: '1.0.0',
    }));
  }

  // Register projects
  try {
    execSync(`npm run build 2>/dev/null || true`, { cwd: process.cwd() });
    for (const projectPath of projectPaths) {
      execSync(`node dist/index.js add ${projectPath} --name ${path.basename(projectPath)}`, {
        cwd: process.cwd(),
        env: { ...process.env, MAXCLAW_DATA_DIR: TEST_DATA_DIR },
      });
    }
  } catch (e) {
    // Ignore errors during setup
  }
}

async function cleanupTestData() {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

test.describe('MaxClaw Dashboard', () => {
  test.beforeAll(async () => {
    await setupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('dashboard page loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle('MaxClaw Dashboard');

    // Check header
    await expect(page.locator('h1')).toContainText('MaxClaw Dashboard');
    await expect(page.locator('.header p')).toContainText('Local Project Assistant Overview');
  });

  test('stats cards are displayed', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check stat cards exist
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(5);

    // Check stat labels
    await expect(page.locator('.stat-label')).toContainText(['Active Projects', 'Running Sessions', 'Total Projects', 'Total Sessions', 'Pending Summaries']);
  });

  test('projects section displays correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check section title
    await expect(page.locator('.section-title')).toContainText('Active Projects');

    // Check refresh button
    await expect(page.locator('.refresh-btn')).toContainText('Refresh');
  });

  test('sessions section displays correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check section title
    await expect(page.locator('.section-title')).toContainText('Recent Sessions');

    // Check sessions list exists
    await expect(page.locator('#sessionsList')).toBeVisible();
  });

  test('activity section displays correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Check section title
    await expect(page.locator('.section-title')).toContainText('Recent Activity');

    // Check activity timeline exists
    await expect(page.locator('#activityTimeline')).toBeVisible();
  });

  test('footer shows correct information', async ({ page }) => {
    await page.goto('/');

    // Check footer
    const footer = page.locator('.footer');
    await expect(footer).toContainText('MaxClaw Dashboard');
    await expect(footer).toContainText('Running locally on your machine');
    await expect(footer).toContainText('All data stays on your device');
  });

  test('refresh button works', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForTimeout(2000);

    // Click refresh button
    await page.click('.refresh-btn');

    // Wait for data to reload
    await page.waitForTimeout(1000);

    // Page should still be functional
    await expect(page.locator('h1')).toContainText('MaxClaw Dashboard');
  });

  test('API endpoints return valid data', async ({ request }) => {
    // Test stats API
    const statsResponse = await request.get('/api/stats');
    expect(statsResponse.ok()).toBeTruthy();
    const stats = await statsResponse.json();
    expect(stats).toHaveProperty('totalProjects');
    expect(stats).toHaveProperty('totalSessions');
    expect(stats).toHaveProperty('activeProjects');
    expect(stats).toHaveProperty('activeSessions');
    expect(stats).toHaveProperty('pendingSummaries');
    expect(typeof stats.totalProjects).toBe('number');
    expect(typeof stats.totalSessions).toBe('number');

    // Test projects API
    const projectsResponse = await request.get('/api/projects');
    expect(projectsResponse.ok()).toBeTruthy();
    const projects = await projectsResponse.json();
    expect(Array.isArray(projects)).toBeTruthy();

    // Test sessions API
    const sessionsResponse = await request.get('/api/sessions');
    expect(sessionsResponse.ok()).toBeTruthy();
    const sessions = await sessionsResponse.json();
    expect(Array.isArray(sessions)).toBeTruthy();

    // Test activities API
    const activitiesResponse = await request.get('/api/activities');
    expect(activitiesResponse.ok()).toBeTruthy();
    const activities = await activitiesResponse.json();
    expect(Array.isArray(activities)).toBeTruthy();
  });

  test('responsive design - mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Page should still be visible and functional
    await expect(page.locator('h1')).toContainText('MaxClaw Dashboard');

    // Stats should stack vertically on mobile
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible();
  });

  test('dark theme is applied', async ({ page }) => {
    await page.goto('/');

    // Check background color (dark theme)
    const body = page.locator('body');
    const backgroundColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Dark background should be rgb(15, 15, 15) or similar
    expect(backgroundColor).toContain('15');
  });
});
