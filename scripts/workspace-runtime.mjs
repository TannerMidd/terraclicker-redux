/**
 * Keep disposable browser/test state beside the repository.
 *
 * This workspace lives on F:, while Windows defaults TEMP/TMP to C:. Playwright
 * creates a fresh browser profile under the process temp directory on every
 * launch, so visual checks could otherwise consume the system drive.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot =
  process.env.TC_RUNTIME_ROOT ??
  fileURLToPath(new URL('../.runtime/', import.meta.url));
const tempRoot = path.join(runtimeRoot, 'tmp');
const browserCacheRoot = path.join(
  path.parse(runtimeRoot).root, 'Caches', 'ms-playwright');

mkdirSync(tempRoot, { recursive: true });

process.env.TEMP = tempRoot;
process.env.TMP = tempRoot;
process.env.TMPDIR = tempRoot;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserCacheRoot;
