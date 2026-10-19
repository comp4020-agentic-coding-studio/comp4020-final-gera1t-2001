// The site's one layout (final brief Step 5): every page goes through page(),
// which owns the <head>, the stylesheet, the favicon and the header. Nothing
// page-specific lives here; a page brings its own <main>.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { User } from "./accounts.ts";

export const SITE_NAME = "House Game";

const assetsDir = resolve(import.meta.dirname, "assets");

// Read once at boot. The stylesheet's URL carries a hash of its content, so a
// deploy that changes it changes the URL too and no browser keeps a stale copy.
export const SITE_CSS = readFileSync(resolve(assetsDir, "site.css"), "utf8");
export const SITE_CSS_VERSION = createHash("sha256").update(SITE_CSS).digest("hex").slice(0, 12);
export const FAVICON_SVG = readFileSync(resolve(assetsDir, "favicon.svg"), "utf8");

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Young+Serif&display=swap";

export type NavItem = "table" | "results" | "about" | "profile" | "login" | "register";

export interface PageOptions {
  user?: User;
  // Which nav item this page is, for aria-current. Omitted on pages that
  // aren't in the nav (home, forgot password).
  current?: NavItem;
  // Carried onto the Log in and Register links, so a visitor who lands on
  // /login from a protected page and switches to /register (or back) doesn't
  // lose where they were headed.
  next?: string;
  // Extra markup at the end of the nav, e.g. the table's connection pill.
  // The layout only places it; the page owns what it is.
  navExtra?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function navLink(href: string, label: string, item: NavItem, current: NavItem | undefined): string {
  return `<a href="${escapeHtml(href)}"${item === current ? ` aria-current="page"` : ""}>${label}</a>`;
}

function siteHeader({ user, current, next, navExtra }: PageOptions): string {
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  const account = user
    ? `${navLink("/profile", "Profile", "profile", current)}
      <form method="post" action="/logout"><button type="submit">Log out</button></form>`
    : `${navLink(`/login${suffix}`, "Log in", "login", current)}
      ${navLink(`/register${suffix}`, "Register", "register", current)}`;
  return `<header class="site-head">
    <a class="wordmark" href="/">${SITE_NAME}</a>
    <nav class="site-nav" aria-label="Main">
      ${navLink("/tables/1", "Table", "table", current)}
      ${navLink("/results", "Results", "results", current)}
      ${navLink("/readme/", "About", "about", current)}
      ${account}
      ${navExtra ?? ""}
    </nav>
  </header>`;
}

// title: the page's own name, shown as "<title> · House Game"; null for the
// home page, which is just "House Game".
export function page(title: string | null, body: string, options: PageOptions = {}): string {
  const fullTitle = title === null ? SITE_NAME : `${title} · ${SITE_NAME}`;
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fullTitle)}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${FONTS_HREF}" />
    <link rel="stylesheet" href="/assets/site.css?v=${SITE_CSS_VERSION}" />
  </head>
  <body>
    ${siteHeader(options)}
    ${body}
  </body>
</html>
`;
}

// The error summary's box from docs/design/auth.css. Step 6 gives it a
// heading and per-field links; until then it is the same list as before.
export function errorList(errors: string[]): string {
  if (errors.length === 0) return "";
  return `<div class="summary" role="alert"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`;
}
