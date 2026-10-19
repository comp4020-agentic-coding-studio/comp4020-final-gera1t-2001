// Multi-user testing with Fly logs: one line per event, as key=value pairs,
// so `flyctl logs` can be read and grepped while several people play. Every
// line names the machine, because once the app is scaled out (`fly scale
// count 2`) two users can be on different machines, and the log is the only
// place that shows it. Fly sets FLY_MACHINE_ID; locally it reads "local".
//
// Example: event=join table=1 user=5 name=lynx clients_in_table=2 machine=e82…
const MACHINE = process.env.FLY_MACHINE_ID ?? "local";

export type LogValue = string | number | boolean | null | undefined;

function format(value: LogValue): string {
  if (value === null || value === undefined) return "-";
  const s = String(value);
  // Bare when it's one token; quoted (JSON string rules) when it has spaces,
  // quotes or "=", so a display name can't break the line's key=value shape.
  return /^[^\s"=]+$/.test(s) ? s : JSON.stringify(s);
}

export function logEvent(event: string, fields: Record<string, LogValue> = {}): void {
  const parts = [`event=${event}`];
  for (const [key, value] of Object.entries(fields)) parts.push(`${key}=${format(value)}`);
  parts.push(`machine=${MACHINE}`);
  console.log(parts.join(" "));
}
