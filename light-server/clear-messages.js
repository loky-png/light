const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'dist', 'light.db'));

console.log('Clearing all messages...');
const result = db.prepare('DELETE FROM messages').run();
console.log(`Deleted ${result.changes} messages`);

db.close();
console.log('Done!');
