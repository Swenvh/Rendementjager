import { defaultDbPath } from '../paths.js';
import { seed } from '../seed.js';
import { createSqliteRepository } from '../sqlite-repository.js';

const path = defaultDbPath();
const repo = createSqliteRepository(path);
const result = await seed(repo);
await repo.close();
for (const t of result.inserted) console.log(`+ ${t}`);
for (const t of result.skipped) console.log(`= ${t} (already present)`);
console.log(`DB: ${path}`);
