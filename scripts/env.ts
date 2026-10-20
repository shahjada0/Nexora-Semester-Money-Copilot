/** Load .env.local / .env for CLI scripts (Next.js loads them for the app itself). Existing env vars win. */
import fs from 'node:fs';
import path from 'node:path';

for (const name of ['.env.local', '.env']) {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
