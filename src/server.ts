import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { marked } from "marked";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

// Opening the database here (rather than only in step 3's schema code) is
// what step 2 needs to show: the file lives under /data in production, with
// a gitignored local default for dev.
import "./db.ts";

const projectRoot = resolve(import.meta.dirname, "..");

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    ${body}
  </body>
</html>
`;

const app = new Hono();

app.get("/", (c) =>
  c.html(
    page(
      "comp4020-final",
      `<main>
        <h1>comp4020-final</h1>
        <p>This site's direction is not decided yet — see <a href="/readme/">the README</a>
        for where things stand.</p>
      </main>`,
    ),
  ),
);

app.get("/readme", (c) => c.redirect("/readme/", 301));

app.get("/readme/", (c) => {
  const markdown = readFileSync(resolve(projectRoot, "README.md"), "utf8");
  return c.html(page("About this app", `<main>${marked.parse(markdown, { async: false })}</main>`));
});

// Relative links in README.md (e.g. an image) resolve against /readme/ once
// served, so a sibling file at the repo root has to answer at /readme/<name>
// too. Scoped to image extensions and to paths that stay under the repo
// root, so this can't be used to read arbitrary files (source, .env, etc).
const ASSET_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

app.get("/readme/:asset{.+}", (c) => {
  const asset = c.req.param("asset");
  const type = ASSET_TYPES[extname(asset).toLowerCase()];
  const target = resolve(projectRoot, asset);
  if (!type || !target.startsWith(projectRoot + "/") || !existsSync(target) || !statSync(target).isFile()) {
    return c.notFound();
  }
  return new Response(new Uint8Array(readFileSync(target)), { headers: { "content-type": type } });
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on 0.0.0.0:${info.port}`);
});
