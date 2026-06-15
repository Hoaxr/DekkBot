import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

export function initDB() {
    db = new Database(path.join(__dirname, 'crypto_bot.sqlite'));
    
    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            side TEXT,
            amount REAL,
            price REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            strategy TEXT,
            profit REAL
        )
    `);

    try {
        db.exec('ALTER TABLE trades ADD COLUMN profit REAL');
    } catch (e) {
        // column already exists
    }
    
    
    console.log('Database initialized.');
}

export function logTrade(symbol, side, amount, price, strategy, profit = null) {
    const stmt = db.prepare('INSERT INTO trades (symbol, side, amount, price, strategy, profit) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(symbol, side, amount, price, strategy, profit);
}

export function getRecentTrades(limit = 50) {
    const stmt = db.prepare('SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?');
    return stmt.all(limit);
}

export function getHistoricalTrades(symbol = null) {
    if (symbol) {
        const stmt = db.prepare('SELECT * FROM trades WHERE symbol = ? AND profit IS NOT NULL ORDER BY timestamp ASC');
        return stmt.all(symbol);
    }
    const stmt = db.prepare('SELECT * FROM trades WHERE profit IS NOT NULL ORDER BY timestamp ASC');
    return stmt.all();
}

export function getLastTrade(symbol) {
    const stmt = db.prepare('SELECT side, price FROM trades WHERE symbol = ? ORDER BY timestamp DESC LIMIT 1');
    return stmt.get(symbol);
}

export function clearDB() {
    db.exec('DELETE FROM trades');
}
