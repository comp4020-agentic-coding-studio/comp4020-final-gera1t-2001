// The only file in this app allowed to import "@pokertools/engine" — see
// docs/adr/0002-poker-engine.md. The library is new and moves fast (one
// major version and four patches in 48 hours, per the ADR's spike), so it's
// pinned to an exact version in package.json (no ^) and funneled through
// this one module: swapping it later, or wrapping its rough edges, means
// changing this file, not every call site.
//
// Nothing here adds behavior yet (that starts at Step 2) — this just
// establishes the single seam the rest of the app is allowed to depend on.
export * from "@pokertools/engine";
