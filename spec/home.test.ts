import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// A visitor has to be able to find the table from the home page. Checked on
// the parsed DOM and a resolved URL, not a raw string: asserting on
// `html.includes("/tables/1")` would also pass for a link that happens to
// mention that text without being a usable href (or a relative href that
// resolves somewhere else entirely once the browser applies the page's base
// URL).
it("the home page has a link to the poker table", async () => {
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);

  const doc = new JSDOM(await res.text()).window.document;
  const hrefs = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
  const tableLink = hrefs.find((href) => new URL(href, baseUrl).pathname === "/tables/1");

  expect(tableLink, `home page's links were: ${JSON.stringify(hrefs)}`).toBeDefined();
});
