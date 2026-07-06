const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, initDatabase, isConnected } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');

console.log(`\n========================================
  ADMIN TOKEN: ${ADMIN_TOKEN}
  (Salva questo token per accedere alle API admin)
========================================\n`);

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
        siteName: "Edizioni Aurora",
        email: 'info@edizioniaurora.it',
        phone: '+39 02 1234567',
        city: 'Milano'
    },
    social: { facebook: '', instagram: '', twitter: '', linkedin: '', whatsapp: '' },
    csrfTokens: new Map(),
    botIps: new Map(),
    requestTimestamps: new Map(),
    failedAuthAttempts: new Map(),
    challenges: new Map()
};

const MAX_BOT_IPS = 1000;
const MAX_STORED_TIMESTAMPS = 100;
const MAX_FAILED_AUTH = 5;
const BOT_BLOCK_DURATION = 3600000;
const CHALLENGE_EXPIRY = 300000;

setInterval(() => {
    const now = Date.now();
    
    if (memoryStore.botIps.size > MAX_BOT_IPS) {
        const entries = Array.from(memoryStore.botIps.entries());
        memoryStore.botIps = new Map(entries.slice(-MAX_BOT_IPS));
    }
    
    for (const [ip, timestamp] of memoryStore.botIps.entries()) {
        if (now - timestamp > BOT_BLOCK_DURATION) {
            memoryStore.botIps.delete(ip);
        }
    }
    
    for (const [token, data] of memoryStore.csrfTokens.entries()) {
        if (now - data.created > 3600000) {
            memoryStore.csrfTokens.delete(token);
        }
    }
    
    for (const [challenge, data] of memoryStore.challenges.entries()) {
        if (now - data.created > CHALLENGE_EXPIRY) {
            memoryStore.challenges.delete(challenge);
        }
    }
    
    for (const [ip, attempts] of memoryStore.failedAuthAttempts.entries()) {
        if (attempts.timestamp && now - attempts.timestamp > 3600000) {
            memoryStore.failedAuthAttempts.delete(ip);
        }
    }
}, 300000);

function sanitize(str, maxLength = 1000) {
    if (typeof str !== 'string') return '';
    return str.substring(0, maxLength).replace(/[<>'"&]/g, c => ({
        '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;'
    }[c]));
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function isValidId(id) {
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

function generateCSRFToken() {
    const token = crypto.randomBytes(32).toString('hex');
    memoryStore.csrfTokens.set(token, { created: Date.now(), used: false });
    return token;
}

function validateCSRFToken(token) {
    const data = memoryStore.csrfTokens.get(token);
    if (!data) return false;
    if (data.used) return false;
    if (Date.now() - data.created > 3600000) {
        memoryStore.csrfTokens.delete(token);
        return false;
    }
    memoryStore.csrfTokens.set(token, { ...data, used: true });
    return true;
}

function generateChallenge() {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const challengeId = crypto.randomBytes(16).toString('hex');
    memoryStore.challenges.set(challengeId, { a, b, created: Date.now() });
    return { challengeId, question: `${a} + ${b} = ?` };
}

function validateChallenge(challengeId, answer) {
    const challenge = memoryStore.challenges.get(challengeId);
    if (!challenge) return false;
    if (Date.now() - challenge.created > CHALLENGE_EXPIRY) {
        memoryStore.challenges.delete(challengeId);
        return false;
    }
    const correct = parseInt(answer) === (challenge.a + challenge.b);
    if (correct) memoryStore.challenges.delete(challengeId);
    return correct;
}

function checkBotIndicators(req) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (memoryStore.botIps.has(ip)) {
        const blockedAt = memoryStore.botIps.get(ip);
        if (now - blockedAt < BOT_BLOCK_DURATION) {
            return true;
        }
        memoryStore.botIps.delete(ip);
    }
    
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent || userAgent.length < 10) {
        memoryStore.botIps.set(ip, now);
        return true;
    }
    
    const botPatterns = [
        /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, 
        /python/i, /node-fetch/i, /httpclient/i, /java\//i, /perl/i,
        /nikto/i, /nmap/i, /sqlmap/i, /masscan/i, /zgrab/i
    ];
    if (botPatterns.some(p => p.test(userAgent))) {
        memoryStore.botIps.set(ip, now);
        return true;
    }
    
    const acceptHeader = req.get('Accept') || '';
    if (!acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')) {
        const timestamps = memoryStore.requestTimestamps.get(ip) || [];
        if (timestamps.length > 5) {
            memoryStore.botIps.set(ip, now);
            return true;
        }
    }
    
    const timestamps = memoryStore.requestTimestamps.get(ip) || [];
    const recentRequests = timestamps.filter(t => now - t < 60000);
    
    if (recentRequests.length > 30) {
        memoryStore.botIps.set(ip, now);
        return true;
    }
    
    const veryRecent = recentRequests.filter(t => now - t < 1000);
    if (veryRecent.length > 5) {
        memoryStore.botIps.set(ip, now);
        return true;
    }
    
    recentRequests.push(now);
    memoryStore.requestTimestamps.set(ip, recentRequests.slice(-MAX_STORED_TIMESTAMPS));
    
    return false;
}

function recordFailedAuth(ip) {
    const attempts = memoryStore.failedAuthAttempts.get(ip) || { count: 0, timestamp: Date.now() };
    attempts.count++;
    attempts.timestamp = Date.now();
    memoryStore.failedAuthAttempts.set(ip, attempts);
    
    if (attempts.count >= MAX_FAILED_AUTH) {
        memoryStore.botIps.set(ip, Date.now());
        return true;
    }
    return false;
}

function clearFailedAuth(ip) {
    memoryStore.failedAuthAttempts.delete(ip);
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(compression());
app.use(cors({ origin: IS_PRODUCTION ? false : true }));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(__dirname));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const ip = req.ip || req.connection.remoteAddress;
        memoryStore.botIps.add(ip);
        res.status(429).json({ error: 'Troppe richieste' });
    }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Limite richieste raggiunto' })
});

const newsletterLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

app.use((req, res, next) => {
    if (checkBotIndicators(req)) {
        return res.status(403).json({ error: 'Accesso negato' });
    }
    next();
});

app.use((req, res, next) => {
    let sessionId = req.cookies?.sessionId;
    if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) {
        sessionId = uuidv4();
    }
    res.cookie('sessionId', sessionId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: 'strict'
    });
    req.sessionId = sessionId;
    next();
});

app.get('/api/csrf-token', (req, res) => {
    const token = generateCSRFToken();
    res.json({ token });
});

app.get('/api/views', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now();
        
        if (isConnected()) {
            try {
                await query(
                    'INSERT INTO views (session_id, view_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [req.sessionId, today]
                );
                
                await query(
                    `INSERT INTO active_sessions (session_id, last_activity) VALUES ($1, NOW()) 
                     ON CONFLICT (session_id) DO UPDATE SET last_activity = NOW()`,
                    [req.sessionId]
                );
                
                await query(
                    `DELETE FROM active_sessions WHERE last_activity < NOW() - INTERVAL '5 minutes'`
                );
                
                const totalResult = await query('SELECT COUNT(DISTINCT session_id) as total FROM views');
                const onlineResult = await query('SELECT COUNT(*) as online FROM active_sessions');
                
                const total = parseInt(totalResult.rows[0]?.total) || 0;
                const online = parseInt(onlineResult.rows[0]?.online) || 0;
                
                return res.json({ total, online });
            } catch (dbErr) {
                console.error('DB error:', dbErr.message);
            }
        }
        
        const viewKey = `${req.sessionId}_${today}`;
        if (!memoryStore.views.includes(viewKey)) {
            memoryStore.views.push(viewKey);
        }
        
        memoryStore.activeSessions[req.sessionId] = now;
        
        Object.keys(memoryStore.activeSessions).forEach(sid => {
            if (now - memoryStore.activeSessions[sid] > 5 * 60 * 1000) {
                delete memoryStore.activeSessions[sid];
            }
        });
        
        res.json({
            total: memoryStore.views.length,
            online: Object.keys(memoryStore.activeSessions).length
        });
    } catch (err) {
        console.error('Errore views:', err);
        res.json({ total: 0, online: 0 });
    }
});

app.get('/api/countdown', async (req, res) => {
    try {
        const now = Date.now();
        
        if (isConnected()) {
            try {
                const result = await query('SELECT end_time FROM countdown WHERE id = 1');
                let endTime = parseInt(result.rows[0]?.end_time) || memoryStore.countdownEnd;
                
                if (endTime <= now) {
                    endTime = now + 10 * 60 * 1000;
                    await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
                }
                
                return res.json({ endTime, now, remaining: Math.max(0, endTime - now) });
            } catch (dbErr) {
                console.error('DB error:', dbErr.message);
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

app.get('/api/products', async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT id, nome, autore, prezzo, descrizione, immagine, in_stock FROM products ORDER BY nome');
            return res.json(result.rows.map(p => ({
                id: p.id,
                nome: escapeHtml(p.nome),
                autore: escapeHtml(p.autore || ''),
                prezzo: parseFloat(p.prezzo),
                descrizione: escapeHtml(p.descrizione || ''),
                immagine: escapeHtml(p.immagine || ''),
                inStock: p.in_stock
            })));
        }
        res.json(memoryStore.products.map(p => ({
            id: p.id,
            nome: escapeHtml(p.nome),
            autore: escapeHtml(p.autore || ''),
            prezzo: p.prezzo,
            descrizione: escapeHtml(p.descrizione || ''),
            immagine: escapeHtml(p.immagine || ''),
            inStock: p.inStock
        })));
    } catch (err) {
        console.error('Errore prodotti:', err);
        res.json([]);
    }
});

app.get('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'ID non valido' });
    }
    
    try {
        if (isConnected()) {
            const result = await query('SELECT * FROM products WHERE id = $1', [id]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Non trovato' });
            }
            const p = result.rows[0];
            return res.json({
                id: p.id,
                nome: escapeHtml(p.nome),
                autore: escapeHtml(p.autore || ''),
                prezzo: parseFloat(p.prezzo),
                descrizione: escapeHtml(p.descrizione || ''),
                immagine: escapeHtml(p.immagine || ''),
                inStock: p.in_stock
            });
        }
        
        const product = memoryStore.products.find(p => p.id === id);
        if (!product) return res.status(404).json({ error: 'Non trovato' });
        res.json({
            id: product.id,
            nome: escapeHtml(product.nome),
            autore: escapeHtml(product.autore || ''),
            prezzo: product.prezzo,
            descrizione: escapeHtml(product.descrizione || ''),
            immagine: escapeHtml(product.immagine || ''),
            inStock: product.inStock
        });
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
                    social[row.key.replace('social_', '')] = escapeHtml(row.value || '');
                } else if (row.key === 'free_shipping_above' || row.key === 'shipping_cost') {
                    settings[row.key] = parseFloat(row.value) || 0;
                } else {
                    settings[row.key] = escapeHtml(row.value || '');
                }
            });
            
            return res.json({
                sito: {
                    nome: settings.site_name || memoryStore.settings.siteName,
                    email: settings.email || memoryStore.settings.email,
                    telefono: settings.phone || memoryStore.settings.phone,
                    citta: settings.city || memoryStore.settings.city
                },
                social,
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
    const { name, email, subject, message, website, csrf_token, challenge_id, challenge_answer } = req.body;
    
    if (website) {
        return res.status(200).json({ success: true });
    }
    
    if (!csrf_token || !validateCSRFToken(csrf_token)) {
        return res.status(403).json({ error: 'Token di sicurezza non valido' });
    }
    
    if (challenge_id && challenge_answer !== undefined) {
        if (!validateChallenge(challenge_id, challenge_answer)) {
            return res.status(400).json({ error: 'Verifica anti-bot errata' });
        }
    }
    
    const sanitizedName = sanitize(name, 100);
    const sanitizedEmail = sanitize(email, 255);
    const sanitizedSubject = sanitize(subject, 200);
    const sanitizedMessage = sanitize(message, 2000);
    
    if (!sanitizedName || sanitizedName.length < 2) {
        return res.status(400).json({ error: 'Nome non valido' });
    }
    
    if (!isValidEmail(sanitizedEmail)) {
        return res.status(400).json({ error: 'Email non valida' });
    }
    
    if (!sanitizedMessage || sanitizedMessage.length < 10) {
        return res.status(400).json({ error: 'Messaggio troppo corto' });
    }
    
    try {
        if (isConnected()) {
            await query(
                'INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4)',
                [sanitizedName, sanitizedEmail, sanitizedSubject || 'Info', sanitizedMessage]
            );
        } else {
            memoryStore.contacts.push({
                id: Date.now(),
                name: sanitizedName,
                email: sanitizedEmail,
                subject: sanitizedSubject || 'Info',
                message: sanitizedMessage,
                date: new Date().toISOString()
            });
        }
        
        console.log(`[CONTACT] ${sanitizedName} <${sanitizedEmail}>`);
        res.json({ success: true, message: 'Messaggio inviato!' });
    } catch (err) {
        console.error('Errore contatto:', err);
        res.status(500).json({ error: 'Errore durante l\'invio' });
    }
});

app.post('/api/newsletter', newsletterLimiter, async (req, res) => {
    const { email, csrf_token } = req.body;
    
    if (!csrf_token || !validateCSRFToken(csrf_token)) {
        return res.status(403).json({ error: 'Token non valido' });
    }
    
    const sanitizedEmail = sanitize(email, 255);
    
    if (!isValidEmail(sanitizedEmail)) {
        return res.status(400).json({ error: 'Email non valida' });
    }
    
    try {
        if (isConnected()) {
            await query('INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING', [sanitizedEmail]);
        } else if (!memoryStore.newsletter.includes(sanitizedEmail)) {
            memoryStore.newsletter.push(sanitizedEmail);
        }
        
        console.log(`[NEWSLETTER] ${sanitizedEmail}`);
        res.json({ success: true, message: 'Iscrizione completata!' });
    } catch (err) {
        console.error('Errore newsletter:', err);
        res.json({ success: true, message: 'Iscrizione completata!' });
    }
});

function authAdmin(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const token = req.headers['x-admin-token'] || req.query.token;
    
    if (!token || token !== ADMIN_TOKEN) {
        const blocked = recordFailedAuth(ip);
        return res.status(401).json({ error: blocked ? 'IP bloccato per troppi tentativi' : 'Non autorizzato' });
    }
    
    clearFailedAuth(ip);
    next();
}

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false
});

app.get('/api/challenge', (req, res) => {
    const { challengeId, question } = generateChallenge();
    res.json({ challengeId, question });
});

app.get('/api/admin/stats', authAdmin, async (req, res) => {
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

app.get('/api/admin/contacts', authAdmin, async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT id, name, email, subject, message, created_at, is_read FROM contacts ORDER BY created_at DESC LIMIT 100');
            return res.json(result.rows.map(c => ({
                id: c.id,
                name: escapeHtml(c.name),
                email: escapeHtml(c.email),
                subject: escapeHtml(c.subject || ''),
                message: escapeHtml(c.message),
                date: c.created_at,
                read: c.is_read
            })));
        }
        res.json(memoryStore.contacts.map(c => ({
            id: c.id,
            name: escapeHtml(c.name),
            email: escapeHtml(c.email),
            subject: escapeHtml(c.subject || ''),
            message: escapeHtml(c.message),
            date: c.date,
            read: c.read
        })));
    } catch (err) {
        console.error('Errore contatti:', err);
        res.json([]);
    }
});

app.put('/api/admin/contacts/:id/read', authAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID non valido' });
    }
    
    try {
        if (isConnected()) {
            await query('UPDATE contacts SET is_read = true WHERE id = $1', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Errore:', err);
        res.status(500).json({ error: 'Errore' });
    }
});

app.post('/api/admin/countdown/reset', authAdmin, async (req, res) => {
    const endTime = Date.now() + 10 * 60 * 1000;
    memoryStore.countdownEnd = endTime;
    
    if (isConnected()) {
        try {
            await query('UPDATE countdown SET end_time = $1 WHERE id = 1', [endTime]);
        } catch (err) {
            console.error('Errore reset:', err);
        }
    }
    
    res.json({ success: true, endTime });
});

app.get('/api/admin/newsletter', authAdmin, adminLimiter, async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT id, email, created_at FROM newsletter ORDER BY created_at DESC');
            return res.json(result.rows.map(n => ({
                id: n.id,
                email: escapeHtml(n.email),
                date: n.created_at
            })));
        }
        res.json(memoryStore.newsletter.map((email, i) => ({
            id: i + 1,
            email: escapeHtml(email),
            date: null
        })));
    } catch (err) {
        console.error('Errore newsletter:', err);
        res.json([]);
    }
});

app.delete('/api/admin/newsletter/:id', authAdmin, adminLimiter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
        return res.status(400).json({ error: 'ID non valido' });
    }
    
    try {
        if (isConnected()) {
            await query('DELETE FROM newsletter WHERE id = $1', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Errore:', err);
        res.status(500).json({ error: 'Errore' });
    }
});

app.post('/api/admin/products', authAdmin, adminLimiter, async (req, res) => {
    const { id, nome, autore, prezzo, prezzoVecchio, immagine, descrizione, inStock, checkoutUrl } = req.body;
    
    if (!id || !isValidId(id)) {
        return res.status(400).json({ error: 'ID prodotto non valido' });
    }
    if (!nome || typeof nome !== 'string' || nome.length < 2 || nome.length > 255) {
        return res.status(400).json({ error: 'Nome non valido' });
    }
    if (typeof prezzo !== 'number' || prezzo < 0 || prezzo > 99999) {
        return res.status(400).json({ error: 'Prezzo non valido' });
    }
    
    try {
        if (isConnected()) {
            const existing = await query('SELECT id FROM products WHERE id = $1', [id]);
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'Prodotto gia esistente' });
            }
            
            await query(
                'INSERT INTO products (id, nome, autore, prezzo, prezzo_vecchio, immagine, descrizione, in_stock, checkout_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [id, nome, autore || '', prezzo, prezzoVecchio || null, immagine || '', descrizione || '', inStock !== false, checkoutUrl || '']
            );
        } else {
            if (memoryStore.products.find(p => p.id === id)) {
                return res.status(400).json({ error: 'Prodotto gia esistente' });
            }
            memoryStore.products.push({
                id, nome, autore: autore || '', prezzo, prezzoVecchio: prezzoVecchio || null,
                immagine: immagine || '', descrizione: descrizione || '', inStock: inStock !== false, checkoutUrl: checkoutUrl || ''
            });
        }
        
        res.json({ success: true, product: { id, nome, prezzo } });
    } catch (err) {
        console.error('Errore creazione prodotto:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.put('/api/admin/products/:id', authAdmin, adminLimiter, async (req, res) => {
    const productId = req.params.id;
    
    if (!isValidId(productId)) {
        return res.status(400).json({ error: 'ID non valido' });
    }
    
    const { nome, autore, prezzo, prezzoVecchio, immagine, descrizione, inStock, checkoutUrl } = req.body;
    
    if (nome !== undefined && (typeof nome !== 'string' || nome.length < 2 || nome.length > 255)) {
        return res.status(400).json({ error: 'Nome non valido' });
    }
    if (prezzo !== undefined && (typeof prezzo !== 'number' || prezzo < 0 || prezzo > 99999)) {
        return res.status(400).json({ error: 'Prezzo non valido' });
    }
    
    try {
        if (isConnected()) {
            const existing = await query('SELECT id FROM products WHERE id = $1', [productId]);
            if (existing.rows.length === 0) {
                return res.status(404).json({ error: 'Prodotto non trovato' });
            }
            
            const updates = [];
            const values = [];
            let paramCount = 1;
            
            if (nome !== undefined) { updates.push(`nome = $${paramCount++}`); values.push(nome); }
            if (autore !== undefined) { updates.push(`autore = $${paramCount++}`); values.push(autore || ''); }
            if (prezzo !== undefined) { updates.push(`prezzo = $${paramCount++}`); values.push(prezzo); }
            if (prezzoVecchio !== undefined) { updates.push(`prezzo_vecchio = $${paramCount++}`); values.push(prezzoVecchio || null); }
            if (immagine !== undefined) { updates.push(`immagine = $${paramCount++}`); values.push(immagine || ''); }
            if (descrizione !== undefined) { updates.push(`descrizione = $${paramCount++}`); values.push(descrizione || ''); }
            if (inStock !== undefined) { updates.push(`in_stock = $${paramCount++}`); values.push(inStock !== false); }
            if (checkoutUrl !== undefined) { updates.push(`checkout_url = $${paramCount++}`); values.push(checkoutUrl || ''); }
            
            if (updates.length > 0) {
                values.push(productId);
                await query(`UPDATE products SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
            }
        } else {
            const product = memoryStore.products.find(p => p.id === productId);
            if (!product) {
                return res.status(404).json({ error: 'Prodotto non trovato' });
            }
            
            if (nome !== undefined) product.nome = nome;
            if (autore !== undefined) product.autore = autore || '';
            if (prezzo !== undefined) product.prezzo = prezzo;
            if (prezzoVecchio !== undefined) product.prezzoVecchio = prezzoVecchio;
            if (immagine !== undefined) product.immagine = immagine || '';
            if (descrizione !== undefined) product.descrizione = descrizione || '';
            if (inStock !== undefined) product.inStock = inStock !== false;
            if (checkoutUrl !== undefined) product.checkoutUrl = checkoutUrl || '';
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Errore aggiornamento prodotto:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.delete('/api/admin/products/:id', authAdmin, adminLimiter, async (req, res) => {
    const productId = req.params.id;
    
    if (!isValidId(productId)) {
        return res.status(400).json({ error: 'ID non valido' });
    }
    
    try {
        if (isConnected()) {
            await query('DELETE FROM products WHERE id = $1', [productId]);
        } else {
            memoryStore.products = memoryStore.products.filter(p => p.id !== productId);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Errore eliminazione prodotto:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.put('/api/admin/settings', authAdmin, adminLimiter, async (req, res) => {
    const allowedKeys = ['site_name', 'email', 'phone', 'city', 'free_shipping_above', 'shipping_cost',
        'social_facebook', 'social_instagram', 'social_twitter', 'social_linkedin', 'social_whatsapp'];
    
    const updates = {};
    
    for (const [key, value] of Object.entries(req.body)) {
        if (!allowedKeys.includes(key)) continue;
        
        if (key === 'free_shipping_above' || key === 'shipping_cost') {
            const numValue = parseFloat(value);
            if (isNaN(numValue) || numValue < 0 || numValue > 99999) continue;
            updates[key] = numValue;
        } else if (typeof value === 'string' && value.length <= 500) {
            updates[key] = value;
        }
    }
    
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nessun dato valido' });
    }
    
    try {
        if (isConnected()) {
            for (const [key, value] of Object.entries(updates)) {
                await query(
                    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                    [key, String(value)]
                );
            }
        } else {
            for (const [key, value] of Object.entries(updates)) {
                if (key.startsWith('social_')) {
                    memoryStore.social[key.replace('social_', '')] = value;
                } else if (key === 'site_name') memoryStore.settings.siteName = value;
                else if (key === 'email') memoryStore.settings.email = value;
                else if (key === 'phone') memoryStore.settings.phone = value;
                else if (key === 'city') memoryStore.settings.city = value;
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Errore aggiornamento settings:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/admin/settings', authAdmin, adminLimiter, async (req, res) => {
    try {
        if (isConnected()) {
            const result = await query('SELECT key, value FROM settings');
            const settings = {};
            result.rows.forEach(row => {
                settings[row.key] = row.value;
            });
            return res.json(settings);
        }
        res.json({
            site_name: memoryStore.settings.siteName,
            email: memoryStore.settings.email,
            phone: memoryStore.settings.phone,
            city: memoryStore.settings.city,
            social_facebook: memoryStore.social.facebook,
            social_instagram: memoryStore.social.instagram,
            social_twitter: memoryStore.social.twitter,
            social_linkedin: memoryStore.social.linkedin,
            social_whatsapp: memoryStore.social.whatsapp
        });
    } catch (err) {
        console.error('Errore get settings:', err);
        res.status(500).json({ error: 'Errore server' });
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
  Edizioni Aurora Server
  http://localhost:${PORT}
  Database: ${isConnected() ? 'PostgreSQL' : 'Memoria locale'}
========================================
`);
    });
});
