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
      await profileLink.click();
      await waitAfterAction(page);
      console.log('📄  Navigated to profile via link.');
    }
  }

  // ── Extract certificates ──────────────────────────────────────────────────

  console.log('🔍  Extracting certificates…');

  const certificates = await page.evaluate((): Certificate[] => {
    const certs: Certificate[] = [];

    // Common Skilljar selectors for completed courses / certificates.
    const cardSelectors = [
      '.course-listing-item',
      '.course-card',
      '[data-course-id]',
      '.certificate-card',
      '.completed-course',
      '.training-item',
      'article.course',
    ];

    let cards: NodeListOf<Element> | Element[] = [];

    for (const sel of cardSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 0) {
        cards = found;
        break;
      }
    }

    // If no specific card selector matched, try a broader search for anything
    // that looks like a completed or certified item.
    if (cards.length === 0) {
      cards = Array.from(
        document.querySelectorAll('[class*="certificate"], [class*="complete"], [class*="course"]')
      ).filter((el) => el.querySelector('img, a'));
    }

    cards.forEach((card) => {
      // Title
      const titleEl = card.querySelector(
        'h2, h3, h4, .course-title, .title, [class*="title"]'
      );
      const title = titleEl?.textContent?.trim() ?? '';
      if (!title) return;

      // Link
      const linkEl = card.querySelector('a[href]') as HTMLAnchorElement | null;
      const courseUrl = linkEl?.href ?? window.location.href;

      // Badge image
      const imgEl = card.querySelector('img') as HTMLImageElement | null;
      const badgeImageUrl = imgEl?.src ?? '';

      // Issue date — look for date strings near the card.
      const dateEl = card.querySelector(
        'time, .date, .issued, .completed-date, [class*="date"]'
      );
      const issueDate =
        dateEl?.getAttribute('datetime') ??
        dateEl?.textContent?.trim() ??
        '';

      // Description
      const descEl = card.querySelector('p, .description, [class*="desc"]');
      const description = descEl?.textContent?.trim();

      certs.push({
        title,
        issueDate,
        courseUrl,
        badgeImageUrl,
        description: description || undefined,
      });
    });

    return certs;
  });

  // Also scan the page for any explicit "certificate" image links.
  const certImageLinks = await page.evaluate((): Certificate[] => {
    const results: Certificate[] = [];
    const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    links.forEach((link) => {
      if (
        link.href.includes('certificate') ||
        link.textContent?.toLowerCase().includes('certificate') ||
        link.textContent?.toLowerCase().includes('view certificate')
      ) {
        const title = link.getAttribute('aria-label') ?? link.textContent?.trim() ?? '';
        if (!title) return;
        const imgEl = link.querySelector('img') as HTMLImageElement | null;
        results.push({
          title,
          issueDate: '',
          courseUrl: link.href,
          badgeImageUrl: imgEl?.src ?? '',
        });
      }
    });
    return results;
  });

  // Merge unique entries (prefer cards over raw links to avoid duplicates).
  const seen = new Set<string>();
  const merged: Certificate[] = [];
  for (const c of [...certificates, ...certImageLinks]) {
    const key = `${c.title}__${c.courseUrl}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(c);
    }
  }

  console.log(`🏆  Found ${merged.length} certificate(s).`);

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
