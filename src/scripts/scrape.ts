/**
 * Scraper: fetches completed certificates from the Anthropic Skilljar profile.
 *
 * Usage:
 *   SKILLJAR_EMAIL=you@example.com SKILLJAR_PASSWORD=secret bun run src/scripts/scrape.ts
 *
 * Output:
 *   data/certificates.json  — JSON array of Certificate objects
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Certificate } from '../types/certificate.ts';

const BASE_URL = 'https://anthropic.skilljar.com';
const __dirname = dirname(fileURLToPath(import.meta.url));

async function waitAfterAction(page: any, timeout = 15000) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
    await page.waitForLoadState('load', { timeout: 5000 });
  } catch {
    // Some pages keep background requests alive indefinitely.
    // Continue if no meaningful navigation signal appears in time.
  }
}

async function getCertificateImageUrl(page: any, certUrl: string): Promise<string> {
  try {
    const response = await page.goto(certUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    if (!response || !response.ok()) {
      return '';
    }

    await waitAfterAction(page);

    const imageUrl = await page.evaluate(() => {
      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const extractBackgroundImageUrl = (value: string): string => {
        const match = value.match(/url\(["']?([^"')]+)["']?\)/i);
        return clean(match?.[1]);
      };

      const element = document.querySelector('.certificate-image') as HTMLElement | null;
      if (!element) return '';

      if (element instanceof HTMLImageElement) {
        return clean(element.currentSrc || element.src);
      }

      const childImage = element.querySelector('img') as HTMLImageElement | null;
      if (childImage) {
        return clean(childImage.currentSrc || childImage.src);
      }

      const inlineStyleUrl = extractBackgroundImageUrl(element.style.backgroundImage || '');
      if (inlineStyleUrl) {
        return inlineStyleUrl;
      }

      const computedStyleUrl = extractBackgroundImageUrl(
        window.getComputedStyle(element).backgroundImage || ''
      );
      if (computedStyleUrl) {
        return computedStyleUrl;
      }

      return clean(element.getAttribute('src'));
    });

    return imageUrl ? new URL(imageUrl, certUrl).toString() : '';
  } catch {
    return '';
  }
}

// ─── Validate environment ────────────────────────────────────────────────────

const email = process.env.SKILLJAR_EMAIL;
const password = process.env.SKILLJAR_PASSWORD;

if (!email || !password) {
  console.error(
    '❌  SKILLJAR_EMAIL and SKILLJAR_PASSWORD environment variables are required.'
  );
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
});
const page = await context.newPage();

try {
  console.log('🌐  Navigating to Skilljar…');
  await page.goto(BASE_URL, { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});

  // ── Login ─────────────────────────────────────────────────────────────────

  // Check whether a sign-in link / button exists on the current page.
  const signInSelectors = [
    'a[href*="sign_in"]',
    'a[href*="login"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'a:has-text("Sign in")',
    'a:has-text("Log in")',
  ];

  let isLoggedIn = false;

  for (const selector of signInSelectors) {
    const el = page.locator(selector).first();
    if ((await el.count()) > 0) {
      console.log('🔐  Found sign-in link, attempting login…');
      await el.click();
      await waitAfterAction(page);
      break;
    }
  }

  // Fill credentials if a login form is present.
  const emailField = page
    .locator('input[type="email"], input[name="email"], input[name="user[email]"]')
    .first();

  if ((await emailField.count()) > 0) {
    console.log('📝  Filling in credentials…');
    await emailField.fill(email);

    const passwordField = page
      .locator(
        'input[type="password"], input[name="password"], input[name="user[password]"]'
      )
      .first();
    await passwordField.fill(password);

    // Submit the form.
    const submitButton = page
      .locator(
        'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in")'
      )
      .first();

    if ((await submitButton.count()) > 0) {
      await submitButton.click();
    } else {
      await passwordField.press('Enter');
    }

    await waitAfterAction(page);
    console.log('✅  Logged in (form submitted).');
    isLoggedIn = true;
  } else {
    console.log('ℹ️   No login form detected — may already be authenticated or no login required.');
    isLoggedIn = true;
  }

  // ── Navigate to certificate / profile page ────────────────────────────────

  const profilePaths = [
    '/accounts/profile/',
    '/profile',
    '/profiles/me',
    '/certificates',
    '/my-courses',
    '/dashboard',
  ];

  let foundProfile = false;
  for (const path of profilePaths) {
    const url = `${BASE_URL}${path}`;
    const response = await page.goto(url, { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});
    if (response && response.ok()) {
      console.log(`📄  Loaded profile page: ${url}`);
      foundProfile = true;
      break;
    }
  }

  if (!foundProfile) {
    // Fall back to main page and look for a profile / dashboard link.
    await page.goto(BASE_URL, { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});
    const profileLink = page
      .locator(
        'a[href*="profile"], a[href*="dashboard"], a[href*="my-courses"], a:has-text("My Courses"), a:has-text("Profile")'
      )
      .first();
    if ((await profileLink.count()) > 0) {
      const href = await profileLink.getAttribute('href');
      if (href) {
        const targetUrl = new URL(href, BASE_URL).toString();
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await waitAfterAction(page);
        console.log(`📄  Navigated to profile via href: ${targetUrl}`);
      }
    }
  }

  // ── Extract certificates ──────────────────────────────────────────────────

  console.log('🔍  Extracting certificates…');

  const certificates = await page.evaluate((): Certificate[] => {
    const clean = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();

    const isDash = (value: string): boolean => {
      const normalized = clean(value);
      return normalized === '' || normalized === '--';
    };

    const parseFromTable = (): Certificate[] => {
      const table = document.querySelector('#profile-course-table');
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const certs: Certificate[] = [];

      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;

        const titleLink = cells[0]?.querySelector('a[href]') as HTMLAnchorElement | null;
        const title = clean(titleLink?.textContent);
        if (!title) continue;

        const courseUrl = clean(titleLink?.href) || window.location.href;

        // In this table structure, the status column contains "View certificate"
        // when a cert exists.
        const statusCell = cells[2];
        const statusLinks = Array.from(statusCell?.querySelectorAll('a[href]') ?? []) as HTMLAnchorElement[];
        const certLink =
          statusLinks.find((link) =>
            clean(link.href).includes('verify.skilljar.com') ||
            clean(link.textContent).toLowerCase().includes('view certificate')
          ) ?? null;
        if (!certLink) continue;

        const certUrl = clean(certLink.href) || courseUrl;

        // Prefer the "Certificate completed" column (index 4),
        // fallback to "Completed" (index 3).
        const certificateCompleted = clean(cells[4]?.querySelector('.nowrap')?.textContent || cells[4]?.textContent);
        const completed = clean(cells[3]?.querySelector('.nowrap')?.textContent || cells[3]?.textContent);
        const issueDate = !isDash(certificateCompleted)
          ? certificateCompleted
          : (!isDash(completed) ? completed : '');

        certs.push({
          title,
          issueDate,
          courseUrl: certUrl,
          badgeImageUrl: '',
          description: undefined,
        });
      }

      return certs;
    };

    return parseFromTable();
  });

  console.log(`🏆  Found ${certificates.length} certificate(s).`);

  for (const cert of certificates) {
    cert.badgeImageUrl = await getCertificateImageUrl(page, cert.courseUrl);
  }

  const merged = certificates;

  // ── Write output ──────────────────────────────────────────────────────────

  const outDir = join(__dirname, '../../data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'certificates.json');
  writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`💾  Written to ${outPath}`);
} catch (err) {
  console.error('❌  Scraper error:', err);
  process.exit(1);
} finally {
  await browser.close();
}
