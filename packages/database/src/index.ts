export * from './repository.js';
export * from './sqlite-repository.js';
export * from './connection.js';
export * from './tables.js';
export * from './paths.js';
export * from './seed.js';

import { defaultDbPath } from './paths.js';
import { createSqliteRepository } from './sqlite-repository.js';
import type { Repository } from './repository.js';

/** Opens the default repository (RJ_DB_PATH, SQLite) with migrations applied. */
export function openRepository(path: string = defaultDbPath()): Repository {
  return createSqliteRepository(path);
}
