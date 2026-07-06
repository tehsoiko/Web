const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ONLINE_TIMEOUT = 5 * 60 * 1000;

app.use(helmet({
    contentSecurityPolicy: IS_PRODUCTION ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    } : false
}));
app.use(compression());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Troppe richieste, riprova piu tardi.' }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Troppi messaggi, riprova tra un\'ora.' }
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
    let sessionId = req.cookies?.sessionId;
    if (!sessionId) {
        sessionId = uuidv4();
        res.cookie('sessionId', sessionId, { 
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax'
        });
    }
    req.sessionId = sessionId;
    next();
});

app.get('/api/views', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();
        
        await query(
            'INSERT INTO views (session_id, view_date) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT unique_session_date DO NOTHING',
            [req.sessionId, today]
        );
        
        await query(
            'INSERT INTO active_sessions (session_id, last_activity) VALUES ($1, NOW()) ON CONFLICT (session_id) DO UPDATE SET last_activity = NOW()',
            [req.sessionId]
        );
        
        await query(
            'DELETE FROM active_sessions WHERE last_activity < NOW() - INTERVAL \'5 minutes\''
        );
        
        const totalResult = await query('SELECT COUNT(DISTINCT session_id) as total FROM views');
        const onlineResult = await query('SELECT COUNT(*) as online FROM active_sessions');
        
        res.json({
            total: parseInt(totalResult.rows[0].total),
            online: parseInt(onlineResult.rows[0].online)
        });
    } catch (err) {
        console.error('Errore views:', err);
        res.json({ total: 0, online: 1 });
    }
});

app.get('/api/countdown', async (req, res) => {
    try {
        const result = await query('SELECT end_time FROM countdown WHERE id = 1');
        let endTime = result.rows[0].end_time;
        const now = Date.now();
        
        if (endTime <= now) {
            endTime = now + 10 * 60 * 1000;
            await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
        }
        
        res.json({
            endTime: endTime,
            now: now,
            remaining: Math.max(0, endTime - now)
        });
    } catch (err) {
        console.error('Errore countdown:', err);
        res.json({ endTime: Date.now() + 10 * 60 * 1000, now: Date.now(), remaining: 10 * 60 * 1000 });
    }
});

app.post('/api/countdown/reset', async (req, res) => {
    try {
        const endTime = Date.now() + 10 * 60 * 1000;
        await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
        res.json({ success: true, endTime });
    } catch (err) {
        console.error('Errore reset countdown:', err);
        res.status(500).json({ error: 'Errore reset' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const result = await query('SELECT * FROM products ORDER BY nome');
        res.json(result.rows.map(p => ({
            id: p.id,
            nome: p.nome,
            autore: p.autore,
            prezzo: parseFloat(p.prezzo),
            prezzoVecchio: p.prezzo_vecchio ? parseFloat(p.prezzo_vecchio) : null,
            immagine: p.immagine,
            descrizione: p.descrizione,
            inStock: p.in_stock,
            checkoutUrl: p.checkout_url
        })));
    } catch (err) {
        console.error('Errore prodotti:', err);
        res.json([]);
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Prodotto non trovato' });
        }
        const p = result.rows[0];
        res.json({
            id: p.id,
            nome: p.nome,
            autore: p.autore,
            prezzo: parseFloat(p.prezzo),
            prezzoVecchio: p.prezzo_vecchio ? parseFloat(p.prezzo_vecchio) : null,
            immagine: p.immagine,
            descrizione: p.descrizione,
            inStock: p.in_stock,
            checkoutUrl: p.checkout_url
        });
    } catch (err) {
        console.error('Errore prodotto:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const result = await query('SELECT key, value FROM settings');
        const settings = {};
        const social = {};
        
        result.rows.forEach(row => {
            if (row.key.startsWith('social_')) {
                social[row.key.replace('social_', '')] = row.value || '';
            } else if (row.key === 'free_shipping_above' || row.key === 'shipping_cost') {
                settings[row.key] = parseFloat(row.value);
            } else {
                settings[row.key] = row.value;
            }
        });
        
        res.json({
            sito: {
                nome: settings.site_name || 'Libri d\'Impresa',
                email: settings.email || 'info@libridimpresa.it',
                telefono: settings.phone || '+39 02 1234567',
                citta: settings.city || 'Milano'
            },
            social: {
                facebook: social.facebook || '',
                instagram: social.instagram || '',
                twitter: social.twitter || '',
                linkedin: social.linkedin || '',
                whatsapp: social.whatsapp || ''
            },
            negozio: {
                spedizioneGratuitaSopra: settings.free_shipping_above || 30,
                costoSpedizione: settings.shipping_cost || 4.90,
                valuta: settings.currency || 'EUR',
                simboloValuta: settings.currency_symbol || 'EUR'
            }
        });
    } catch (err) {
        console.error('Errore settings:', err);
        res.json({
            sito: { nome: 'Libri d\'Impresa', email: 'info@libridimpresa.it', telefono: '+39 02 1234567', citta: 'Milano' },
            social: { facebook: '', instagram: '', twitter: '', linkedin: '', whatsapp: '' },
            negozio: { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90, valuta: 'EUR', simboloValuta: 'EUR' }
        });
    }
});

app.post('/api/contact', contactLimiter, async (req, res) => {
    const { name, email, subject, message, website } = req.body;
    
    if (website) {
        return res.json({ success: true });
    }
    
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Compila tutti i campi obbligatori' });
    }
    
    try {
        await query(
            'INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4)',
            [name, email, subject || 'Informazioni generali', message]
        );
        
        console.log(`[CONTACT] ${name} <${email}>: ${subject}`);
        res.json({ success: true, message: 'Messaggio inviato con successo!' });
    } catch (err) {
        console.error('Errore contatto:', err);
        res.status(500).json({ error: 'Errore durante l\'invio' });
    }
});

app.post('/api/newsletter', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email richiesta' });
    }
    
    try {
        await query(
            'INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING',
            [email]
        );
        
        console.log(`[NEWSLETTER] Iscrizione: ${email}`);
        res.json({ success: true, message: 'Iscrizione completata!' });
    } catch (err) {
        console.error('Errore newsletter:', err);
        res.json({ success: true, message: 'Iscrizione completata!' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        const viewsResult = await query('SELECT COUNT(DISTINCT session_id) as total FROM views');
        const contactsResult = await query('SELECT COUNT(*) as total FROM contacts');
        const unreadResult = await query('SELECT COUNT(*) as total FROM contacts WHERE is_read = false');
        const newsletterResult = await query('SELECT COUNT(*) as total FROM newsletter');
        
        res.json({
            views: parseInt(viewsResult.rows[0].total),
            contacts: parseInt(contactsResult.rows[0].total),
            unreadContacts: parseInt(unreadResult.rows[0].total),
            newsletterSubscribers: parseInt(newsletterResult.rows[0].total)
        });
    } catch (err) {
        console.error('Errore stats:', err);
        res.json({ views: 0, contacts: 0, unreadContacts: 0, newsletterSubscribers: 0 });
    }
});

app.get('/api/admin/contacts', async (req, res) => {
    try {
        const result = await query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(result.rows.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            subject: c.subject,
            message: c.message,
            date: c.created_at,
            read: c.is_read
        })));
    } catch (err) {
        console.error('Errore lista contatti:', err);
        res.json([]);
    }
});

app.put('/api/admin/contacts/:id/read', async (req, res) => {
    try {
        await query('UPDATE contacts SET is_read = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Errore marca letto:', err);
        res.status(500).json({ error: 'Errore' });
    }
});

app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const { nome, autore, prezzo, descrizione, inStock, checkoutUrl } = req.body;
        await query(
            'UPDATE products SET nome = $1, autore = $2, prezzo = $3, descrizione = $4, in_stock = $5, checkout_url = $6 WHERE id = $7',
            [nome, autore, prezzo, descrizione, inStock, checkoutUrl, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Errore update prodotto:', err);
        res.status(500).json({ error: 'Errore' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Errore del server' });
});

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`
========================================
  Libri d'Impresa Server
  http://localhost:${PORT}
========================================
  Database: PostgreSQL
========================================
`);
    });
});
