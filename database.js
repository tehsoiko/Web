const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
}

async function initDatabase() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS views (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                view_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT unique_session_date UNIQUE(session_id, view_date)
            )
        `);
        
        await query(`
            CREATE TABLE IF NOT EXISTS active_sessions (
                session_id VARCHAR(255) PRIMARY KEY,
                last_activity TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await query(`
            CREATE TABLE IF NOT EXISTS countdown (
                id INTEGER PRIMARY KEY DEFAULT 1,
                end_time BIGINT NOT NULL
            )
        `);
        
        const countdownCheck = await query('SELECT * FROM countdown WHERE id = 1');
        if (countdownCheck.rows.length === 0) {
            await query('INSERT INTO countdown (id, end_time) VALUES (1, $1)', [Date.now() + 10 * 60 * 1000]);
        }
        
        await query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(100) PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                autore VARCHAR(255),
                prezzo DECIMAL(10,2) NOT NULL,
                prezzo_vecchio DECIMAL(10,2),
                immagine VARCHAR(500),
                descrizione TEXT,
                in_stock BOOLEAN DEFAULT true,
                checkout_url VARCHAR(500)
            )
        `);
        
        const productsCheck = await query('SELECT COUNT(*) FROM products');
        if (parseInt(productsCheck.rows[0].count) === 0) {
            const products = [
                ['interfacce', 'Interfacce', '', 19.99, 29.99, 'Livro-bestseller-blog-Divirta-c.webp', 'Un libro sulle tecnologie digitali', true, ''],
                ['leadership-digitale', 'Leadership nel digitale', 'Marco Rossi', 24.99, null, '', 'Guida alla leadership moderna', true, ''],
                ['crescita-personale', 'Crescita personale', 'Giulia Bianchi', 18.99, null, '', 'Sviluppa il tuo potenziale', true, ''],
                ['marketing-strategico', 'Marketing strategico', 'Luca Verdi', 22.99, null, '', 'Strategie di marketing efficaci', true, ''],
                ['mindset', 'Mindset', 'Anna Neri', 16.99, null, '', 'La mentalita del successo', true, ''],
                ['finanza', 'Finanza per tutti', 'Paolo Blu', 21.99, null, '', 'Gestione finanziaria semplificata', true, '']
            ];
            
            for (const p of products) {
                await query(
                    'INSERT INTO products (id, nome, autore, prezzo, prezzo_vecchio, immagine, descrizione, in_stock, checkout_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                    p
                );
            }
        }
        
        await query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                subject VARCHAR(255),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                is_read BOOLEAN DEFAULT false
            )
        `);
        
        await query(`
            CREATE TABLE IF NOT EXISTS newsletter (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await query(`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT
            )
        `);
        
        const settingsCheck = await query('SELECT COUNT(*) FROM settings');
        if (parseInt(settingsCheck.rows[0].count) === 0) {
            const settings = [
                ['site_name', 'Libri d\'Impresa'],
                ['email', 'info@libridimpresa.it'],
                ['phone', '+39 02 1234567'],
                ['city', 'Milano'],
                ['free_shipping_above', '30'],
                ['shipping_cost', '4.90'],
                ['currency', 'EUR'],
                ['currency_symbol', 'EUR'],
                ['social_facebook', ''],
                ['social_instagram', ''],
                ['social_twitter', ''],
                ['social_linkedin', ''],
                ['social_whatsapp', '']
            ];
            
            for (const [key, value] of settings) {
                await query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
            }
        }
        
        console.log('Database inizializzato correttamente');
    } catch (err) {
        console.error('Errore inizializzazione database:', err);
    }
}

module.exports = { query, pool, initDatabase };
