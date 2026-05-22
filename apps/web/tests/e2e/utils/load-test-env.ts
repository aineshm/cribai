/**
 * Minimal .env.local loader for Playwright tests.
 *
 * The Next dev server already reads apps/web/.env.local at startup, but the
 * Playwright runner doesn't — Supabase service-role calls from the test
 * harness need NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SECRET_KEY explicitly. We avoid pulling in the `dotenv` package
 * just for this: ~30 lines of parser is cheaper than another dependency.
 *
 * Only KEY=VALUE lines are parsed; quotes and `export` prefixes are
 * stripped; existing process.env values are NOT overridden so command-line
 * overrides still win.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

export function loadTestEnvOnce(): void {
  if (loaded) return;
  loaded = true;

  // Resolve relative to this file so the loader works from any cwd that
  // Playwright might run from.
  const envPath = resolve(__dirname, '../../../.env.local');
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    let key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
