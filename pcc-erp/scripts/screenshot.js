const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 }
  });
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login');
  
  // Wait for Dev Mode buttons
  await page.waitForSelector('button');
  
  // Click the Admin button or similar
  await page.click('button:has-text("Admin"), button:has-text("ผู้ดูแลระบบ")');
  await page.click('button:has-text("เข้าสู่ระบบ")');

  console.log('Waiting for dashboard redirection...');
  await page.waitForURL('**/dashboard');
  console.log('Logged in successfully!');

  console.log('Navigating to job-orders...');
  await page.goto('http://localhost:3000/job-orders');

  await page.waitForTimeout(2000);

  // Take screenshot of default Queue tab
  const screenshotPathQueue = '/Users/necxa/.gemini/antigravity/brain/7a6da505-5014-4677-aaae-64904a4ffd1e/queue_tab_live.png';
  await page.screenshot({ path: screenshotPathQueue, fullPage: true });
  console.log('Queue tab screenshot saved to:', screenshotPathQueue);

  // Dump Queue UI details
  const queueText = await page.evaluate(() => document.body.innerText);
  console.log('--- PAGE BODY INNER TEXT (QUEUE TAB) ---');
  console.log(queueText.substring(0, 2000));

  // Click the "ย้อนหลัง" tab
  console.log('Clicking ย้อนหลัง tab...');
  await page.click('button:has-text("ย้อนหลัง")');
  await page.waitForTimeout(2000);

  // Take screenshot of History tab
  const screenshotPathHistory = '/Users/necxa/.gemini/antigravity/brain/7a6da505-5014-4677-aaae-64904a4ffd1e/history_tab_live.png';
  await page.screenshot({ path: screenshotPathHistory, fullPage: true });
  console.log('History tab screenshot saved to:', screenshotPathHistory);

  // Dump History UI details
  const historyText = await page.evaluate(() => document.body.innerText);
  console.log('--- PAGE BODY INNER TEXT (HISTORY TAB) ---');
  console.log(historyText.substring(0, 2000));

  await browser.close();
}

main().catch(console.error);


