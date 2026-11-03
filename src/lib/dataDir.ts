import os from 'node:os'
import path from 'node:path'

/**
 * Where development-only files live (embedded database, generated secrets).
 * Kept outside the project on purpose: the dev server watches every file in the project root,
 * so a database writing inside it triggers recompiles and page reloads in an endless loop.
 */
export function dataDir() {
  return process.env.FUTICK_DATA_DIR?.trim() || path.join(os.homedir(), '.futick')
}
