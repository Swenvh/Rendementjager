import { loadMigrations, migrate, openSqlite } from '../connection.js';
import { defaultDbPath } from '../paths.js';

const path = defaultDbPath();
const db = openSqlite(path);
const applied = migrate(db, loadMigrations());
db.close();
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
console.log(`DB: ${path}`);
