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
    <style>
      /* A <select>'s closed box sizes to its longest <option> text by
         default, which on narrow screens can push it (and so the whole
         page) wider than the viewport — this caps every form control to
         its container instead. */
      input, select, textarea, button {
        max-width: 100%;
        box-sizing: border-box;
      }
      select {
        text-overflow: ellipsis;
      }
    </style>
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
