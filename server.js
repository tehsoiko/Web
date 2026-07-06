const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query, initDatabase, isConnected } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const memoryStore = {
    views: [],
    activeSessions: {},
    countdownEnd: Date.now() + 10 * 60 * 1000,
    contacts: [],
    newsletter: [],
    products: [
        { id: 'interfacce', nome: 'Interfacce', autore: '', prezzo: 19.99, prezzoVecchio: 29.99, immagine: 'Livro-bestseller-blog-Divirta-c.webp', descrizione: 'Un libro sulle tecnologie digitali', inStock: true, checkoutUrl: '' },
        { id: 'leadership-digitale', nome: 'Leadership nel digitale', autore: 'Marco Rossi', prezzo: 24.99, prezzoVecchio: null, immagine: '', descrizione: 'Guida alla leadership moderna', inStock: true, checkoutUrl: '' },
        { id: 'crescita-personale', nome: 'Crescita personale', autore: 'Giulia Bianchi', prezzo: 18.99, prezzoVecchio: null, immagine: '', descrizione: 'Sviluppa il tuo potenziale', inStock: true, checkoutUrl: '' },
        { id: 'marketing-strategico', nome: 'Marketing strategico', autore: 'Luca Verdi', prezzo: 22.99, prezzoVecchio: null, immagine: '', descrizione: 'Strategie di marketing efficaci', inStock: true, checkoutUrl: '' },
        { id: 'mindset', nome: 'Mindset', autore: 'Anna Neri', prezzo: 16.99, prezzoVecchio: null, immagine: '', descrizione: 'La mentalita del successo', inStock: true, checkoutUrl: '' },
        { id: 'finanza', nome: 'Finanza per tutti', autore: 'Paolo Blu', prezzo: 21.99, prezzoVecchio: null, immagine: '', descrizione: 'Gestione finanziaria semplificata', inStock: true, checkoutUrl: '' }
    ],
    settings: {
        siteName: "Libri d'Impresa",
        email: 'info@libridimpresa.it',
        phone: '+39 02 1234567',
        city: 'Milano'
    },
    social: { facebook: '', instagram: '', twitter: '', linkedin: '', whatsapp: '' }
};

app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Troppe richieste, riprova piu tardi.' }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
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
        
        if (isConnected()) {
            try {
                // Registra la visita di oggi
                await query(
                    'INSERT INTO views (session_id, view_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [req.sessionId, today]
                );
                
                // Aggiorna o crea sessione attiva
                await query(
                    `INSERT INTO active_sessions (session_id, last_activity) VALUES ($1, NOW()) 
                     ON CONFLICT (session_id) DO UPDATE SET last_activity = NOW()`,
                    [req.sessionId]
                );
                
                // Rimuovi sessioni scadute (più di 5 minuti)
                await query(
                    `DELETE FROM active_sessions WHERE last_activity < NOW() - INTERVAL '5 minutes'`
                );
                
                // Conta visitatori totali (sessioni uniche)
                const totalResult = await query('SELECT COUNT(DISTINCT session_id) as total FROM views');
                
                // Conta utenti online
                const onlineResult = await query('SELECT COUNT(*) as online FROM active_sessions');
                
                const total = parseInt(totalResult.rows[0]?.total) || 0;
                const online = parseInt(onlineResult.rows[0]?.online) || 0;
                
                console.log(`Views API - Total: ${total}, Online: ${online}`);
                
                return res.json({ total, online });
            } catch (dbErr) {
                console.error('DB error in views:', dbErr.message);
            }
        }
        
        // Fallback memoria locale
        const viewKey = `${req.sessionId}_${today}`;
        if (!memoryStore.views.includes(viewKey)) {
            memoryStore.views.push(viewKey);
        }
        
        memoryStore.activeSessions[req.sessionId] = now;
        
        // Rimuovi sessioni inattive da più di 5 minuti
        Object.keys(memoryStore.activeSessions).forEach(sid => {
            if (now - memoryStore.activeSessions[sid] > 5 * 60 * 1000) {
                delete memoryStore.activeSessions[sid];
            }
        });
        
        const total = memoryStore.views.length;
        const online = Object.keys(memoryStore.activeSessions).length;
        
        console.log(`Views API (memory) - Total: ${total}, Online: ${online}`);
        
        res.json({ total, online });
    } catch (err) {
        console.error('Errore views:', err);
        res.json({ total: 1, online: 1 });
    }
});

app.get('/api/countdown', async (req, res) => {
    try {
        const now = Date.now();
        
        if (isConnected()) {
            try {
                const result = await query('SELECT end_time FROM countdown WHERE id = 1');
                let endTime = result.rows[0]?.end_time || memoryStore.countdownEnd;
                
                if (endTime <= now) {
                    endTime = now + 10 * 60 * 1000;
                    await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
                }
                
                return res.json({
                    endTime: endTime,
                    now: now,
                    remaining: Math.max(0, endTime - now)
                });
            } catch (dbErr) {
                console.error('DB error in countdown:', dbErr.message);
            }
        }
        
        if (memoryStore.countdownEnd <= now) {
            memoryStore.countdownEnd = now + 10 * 60 * 1000;
        }
        
        res.json({
            endTime: memoryStore.countdownEnd,
            now: now,
            remaining: Math.max(0, memoryStore.countdownEnd - now)
        });
    } catch (err) {
        console.error('Errore countdown:', err);
        res.json({ endTime: Date.now() + 10 * 60 * 1000, now: Date.now(), remaining: 10 * 60 * 1000 });
    }
});

app.post('/api/countdown/reset', async (req, res) => {
    const endTime = Date.now() + 10 * 60 * 1000;
    memoryStore.countdownEnd = endTime;
    
    if (isConnected()) {
        try {
            await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
        } catch (err) {
            console.error('Errore reset countdown:', err);
        }
    }
    
    res.json({ success: true, endTime });
});

app.get('/api/products', async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT * FROM products ORDER BY nome');
            return res.json(result.rows.map(p => ({
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
        }
        res.json(memoryStore.products);
    } catch (err) {
        console.error('Errore prodotti:', err);
        res.json(memoryStore.products);
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Prodotto non trovato' });
            }
            const p = result.rows[0];
            return res.json({
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
        }
        const product = memoryStore.products.find(p => p.id === req.params.id);
        if (!product) return res.status(404).json({ error: 'Prodotto non trovato' });
        res.json(product);
    } catch (err) {
        console.error('Errore prodotto:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        if (isConnected()) {
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
            
            return res.json({
                sito: {
                    nome: settings.site_name || memoryStore.settings.siteName,
                    email: settings.email || memoryStore.settings.email,
                    telefono: settings.phone || memoryStore.settings.phone,
                    citta: settings.city || memoryStore.settings.city
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
                    valuta: 'EUR',
                    simboloValuta: 'EUR'
                }
            });
        }
        res.json({
            sito: memoryStore.settings,
            social: memoryStore.social,
            negozio: { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90, valuta: 'EUR', simboloValuta: 'EUR' }
        });
    } catch (err) {
        console.error('Errore settings:', err);
        res.json({
            sito: memoryStore.settings,
            social: memoryStore.social,
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
        if (isConnected()) {
            await query(
                'INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4)',
                [name, email, subject || 'Informazioni generali', message]
            );
        } else {
            memoryStore.contacts.push({
                id: Date.now(),
                name,
                email,
                subject: subject || 'Informazioni generali',
                message,
                date: new Date().toISOString()
            });
        }
        
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
        if (isConnected()) {
            await query('INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
        } else if (!memoryStore.newsletter.includes(email)) {
            memoryStore.newsletter.push(email);
        }
        
        console.log(`[NEWSLETTER] Iscrizione: ${email}`);
        res.json({ success: true, message: 'Iscrizione completata!' });
    } catch (err) {
        console.error('Errore newsletter:', err);
        res.json({ success: true, message: 'Iscrizione completata!' });
    }
});

app.get('/api/admin/stats', async (req, res) => {
    try {
        if (isConnected()) {
            const viewsResult = await query('SELECT COUNT(*) as total FROM views');
            const contactsResult = await query('SELECT COUNT(*) as total FROM contacts');
            const unreadResult = await query('SELECT COUNT(*) as total FROM contacts WHERE is_read = false');
            const newsletterResult = await query('SELECT COUNT(*) as total FROM newsletter');
            
            return res.json({
                views: parseInt(viewsResult.rows[0].total),
                contacts: parseInt(contactsResult.rows[0].total),
                unreadContacts: parseInt(unreadResult.rows[0].total),
                newsletterSubscribers: parseInt(newsletterResult.rows[0].total)
            });
        }
        res.json({
            views: memoryStore.views.length,
            contacts: memoryStore.contacts.length,
            unreadContacts: memoryStore.contacts.filter(c => !c.read).length,
            newsletterSubscribers: memoryStore.newsletter.length
        });
    } catch (err) {
        console.error('Errore stats:', err);
        res.json({ views: 0, contacts: 0, unreadContacts: 0, newsletterSubscribers: 0 });
    }
});

app.get('/api/admin/contacts', async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT * FROM contacts ORDER BY created_at DESC');
            return res.json(result.rows.map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                subject: c.subject,
                message: c.message,
                date: c.created_at,
                read: c.is_read
            })));
        }
        res.json(memoryStore.contacts);
    } catch (err) {
        console.error('Errore lista contatti:', err);
        res.json([]);
    }
});

app.put('/api/admin/contacts/:id/read', async (req, res) => {
    try {
        if (isConnected()) {
            await query('UPDATE contacts SET is_read = true WHERE id = $1', [req.params.id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Errore marca letto:', err);
        res.status(500).json({ error: 'Errore' });
    }
});

app.put('/api/admin/products/:id', async (req, res) => {
    try {
        const { nome, autore, prezzo, descrizione, inStock, checkoutUrl } = req.body;
        if (isConnected()) {
            await query(
                'UPDATE products SET nome = $1, autore = $2, prezzo = $3, descrizione = $4, in_stock = $5, checkout_url = $6 WHERE id = $7',
                [nome, autore, prezzo, descrizione, inStock, checkoutUrl, req.params.id]
            );
        }
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
  Database: ${isConnected() ? 'PostgreSQL' : 'Memoria locale'}
========================================
`);
    });
});
