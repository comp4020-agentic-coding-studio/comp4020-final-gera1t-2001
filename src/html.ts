export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    ${body}
  </body>
</html>
`;
}

export function errorList(errors: string[]): string {
  if (errors.length === 0) return "";
  return `<ul role="alert">${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
}
