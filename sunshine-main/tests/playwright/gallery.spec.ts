import { test, expect } from '@playwright/test';

const BASE_URL = 'http://0.0.0.0:8005';

test('volunteer photo upload and admin review flow', async ({ page }) => {
  test.setTimeout(60000);
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));
  page.on('response', async response => {
    if (response.status() >= 400) {
      console.log('HTTP ERROR:', response.status(), response.url());
      try {
        const body = await response.text();
        console.log('ERROR BODY:', body.substring(0, 500));
      } catch (e) {
        console.log('Could not read error body');
      }
    }
  });

  // 0. Check homepage
  console.log('Checking homepage...');
  await page.goto(`${BASE_URL}/health`);
  console.log('Health check status:', await page.textContent('body'));

  // 1. Login as volunteer
  console.log('Logging in as volunteer...');
  await page.goto(`${BASE_URL}/auth/dev-login?email=v01@sunshine.dev`);
  await page.waitForURL(url => url.pathname.startsWith('/volunteer/'));
  await page.goto(`${BASE_URL}/volunteer/dashboard`);
  await expect(page).toHaveURL(`${BASE_URL}/volunteer/dashboard`);

  // 2. Find the shift and go to survey
  // The shift title was "K-Wing Patient Visits"
  await page.click('text="FILE REPORT"');
  await expect(page).toHaveURL(/\/volunteer\/survey\/[a-f0-9-]+/);

  // 3. Complete survey details
  await page.locator('button:has-text("★")').nth(3).click(); // Rate 4 stars
  await page.fill('textarea[name="notes"]', 'The visit went great! The dogs were very calm.');

  // 4. Upload photo
  const fileChooserPromise = page.waitForEvent('filechooser');
  console.log('Clicking browse...');
  await page.click('text="browse"');
  const fileChooser = await fileChooserPromise;
  console.log('Setting files...');
  await fileChooser.setFiles('tests/playwright/test-dog.png');

  // Wait for upload to complete and card to appear
  console.log('Waiting for asset card...');
  try {
    const assetCard = page.locator('#upload-results div[id^="asset-"]');
    await expect(assetCard).toBeVisible({ timeout: 15000 });
    console.log('Photo uploaded successfully');
  } catch (e) {
    await page.screenshot({ path: 'upload-failure.png' });
    const html = await page.content();
    console.log('HTML state at failure:', html.substring(0, 1000)); // Log some HTML
    throw e;
  }

  // 5. Tag a dog (drag and drop)
  // Find a dog in the palette
  const dogTag = page.locator('.cursor-grab:has-text("dog")').first();
  const dropZone = page.locator('div[id^="tags-"]').first();
  
  await dogTag.dragTo(dropZone);
  // Wait for HTMX to finish tagging
  await expect(page.locator('span:has-text("🐾")')).toBeVisible();
  console.log('Tagged successfully');

  // 6. Submit report
  await page.click('button:has-text("Submit Report")');
  await page.waitForURL(`${BASE_URL}/volunteer/dashboard`);
  console.log('Report submitted');

  // 6. Login as admin
  await page.goto(`${BASE_URL}/auth/dev-login?email=admin-1@sunshine.dev`);
  await expect(page).toHaveURL(`${BASE_URL}/admin/dashboard`);

  // 7. Go to Gallery Review Queue
  await page.goto(`${BASE_URL}/admin/gallery?filter=unverified`);
  
  // 8. Verify the photo is present and click Verify
  await expect(page.locator('div[id^="asset-"]')).toBeVisible();
  await page.click('button:has-text("Verify")');

  // 9. Check that it's moved to curated
  await page.goto(`${BASE_URL}/admin/gallery?filter=admin_starred`);
  await expect(page.locator('div[id^="asset-"]')).toBeVisible();
  console.log('Photo verified by admin');
});
