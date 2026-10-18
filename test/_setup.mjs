/**
 * Global test environment setup (Issue #146)
 *
 * Guarantees that running tests never writes to or alters production ~/.dsh files.
 */

import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const sandboxHome = mkdtempSync(path.join(tmpdir(), 'dsh-clinebot-test-home-'))
process.env.HOME = sandboxHome
process.env.DSH_HOME = path.join(sandboxHome, '.dsh')
mkdirSync(process.env.DSH_HOME, { recursive: true })
