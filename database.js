const { Pool } = require('pg');
let pool = null, dbConnected = false;

async function initPool() {
    if (!process.env.DATABASE_URL) { console.log('Nessun DATABASE_URL - uso memoria'); return false; }
    try {
        pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
        await pool.query('SELECT NOW()');
        console.log('PostgreSQL connesso');
        return true;
    } catch (e) { console.error('DB error:', e.message); return false; }
}

async function query(text, params) {
    if (!pool) throw new Error('DB non connesso');
    return pool.query(text, params);
}

async function initDatabase() {
    dbConnected = await initPool();
    if (!dbConnected) return;
    
    try {
        await query(`CREATE TABLE IF NOT EXISTS views (id SERIAL PRIMARY KEY, session_id VARCHAR(36) NOT NULL, view_date DATE NOT NULL, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(session_id, view_date))`);
        await query(`CREATE TABLE IF NOT EXISTS active_sessions (session_id VARCHAR(36) PRIMARY KEY, last_activity TIMESTAMP DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS countdown (id INTEGER PRIMARY KEY DEFAULT 1, end_time BIGINT NOT NULL, expired BOOLEAN DEFAULT false)`);
        
        const c = await query('SELECT * FROM countdown WHERE id = 1');
        if (!c.rows.length) await query('INSERT INTO countdown (id, end_time, expired) VALUES (1, $1, false)', [Date.now() + 600000]);
        
        await query(`CREATE TABLE IF NOT EXISTS products (id VARCHAR(100) PRIMARY KEY, nome VARCHAR(255) NOT NULL, autore VARCHAR(255), prezzo DECIMAL(10,2) NOT NULL, prezzo_vecchio DECIMAL(10,2), immagine VARCHAR(500), descrizione TEXT, in_stock BOOLEAN DEFAULT true, checkout_url VARCHAR(500))`);
        
        const p = await query('SELECT COUNT(*) FROM products');
        if (!parseInt(p.rows[0].count)) {
            await query('INSERT INTO products (id, nome, autore, prezzo, prezzo_vecchio, immagine, descrizione, in_stock) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', ['interfacce', 'Interfacce', '', 19.99, 29.99, 'Livro-bestseller-blog-Divirta-c.webp', 'Un libro sulle tecnologie digitali', true]);
            await query('INSERT INTO products (id, nome, autore, prezzo, immagine, descrizione, in_stock) VALUES ($1,$2,$3,$4,$5,$6,$7)', ['all-avvenire', "All'avvenire", '', 0, '', 'Prossima pubblicazione', false]);
        }
        
        await query(`CREATE TABLE IF NOT EXISTS contacts (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) NOT NULL, subject VARCHAR(200), message TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), is_read BOOLEAN DEFAULT false)`);
        await query(`CREATE TABLE IF NOT EXISTS newsletter (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`);
        
        const s = await query('SELECT COUNT(*) FROM settings');
        if (!parseInt(s.rows[0].count)) {
            for (const [k, v] of [['site_name', 'Edizioni Aurora'], ['email', 'info@edizioniaurora.it'], ['phone', '+39 02 1234567'], ['city', 'Milano'], ['free_shipping_above', '30'], ['shipping_cost', '4.90']]) await query('INSERT INTO settings (key, value) VALUES ($1, $2)', [k, v]);
        }
        console.log('DB inizializzato');
    } catch (e) { console.error('Init DB error:', e.message); }
}

function isConnected() { return dbConnected; }
async function closePool() { if (pool) await pool.end(); }

module.exports = { query, initDatabase, isConnected, closePool };
