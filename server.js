const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
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

console.log(`\n========================================\n  ADMIN TOKEN: ${ADMIN_TOKEN}\n========================================\n`);

const escapeHtml = s => typeof s !== 'string' ? '' : s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sanitize = (s, m = 1000) => typeof s !== 'string' ? '' : s.substring(0, m).replace(/[<>'"&]/g, c => ({ '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;' }[c]));
const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 255;
const isValidId = id => /^[a-zA-Z0-9_-]{1,100}$/.test(id);

const store = {
    views: [], sessions: {},
    countdownEnd: Date.now() + 600000, countdownExpired: false,
    contacts: [], newsletter: [],
    products: [
        { id: 'interfacce', nome: 'Interfacce', autore: '', prezzo: 19.99, prezzoVecchio: 29.99, immagine: 'Livro-bestseller-blog-Divirta-c.webp', descrizione: 'Un libro sulle tecnologie digitali', inStock: true },
        { id: 'all-avvenire', nome: "All'avvenire", autore: '', prezzo: 0, prezzoVecchio: null, immagine: '', descrizione: 'Prossima pubblicazione', inStock: false }
    ],
    settings: { siteName: 'Edizioni Aurora', email: 'info@edizioniaurora.it', phone: '+39 02 1234567', city: 'Milano' },
    social: { facebook: '', instagram: '', twitter: '', linkedin: '', whatsapp: '' },
    csrfTokens: new Map()
};

app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], fontSrc: ["'self'", "https://fonts.gstatic.com"], imgSrc: ["'self'", "data:", "https:"], connectSrc: ["'self'"] } } }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
    let sid = req.cookies?.sessionId;
    if (!sid || !/^[a-f0-9-]{36}$/.test(sid)) sid = uuidv4();
    res.cookie('sessionId', sid, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict' });
    req.sessionId = sid;
    next();
});

app.get('/api/csrf-token', (req, res) => {
    const t = crypto.randomBytes(32).toString('hex');
    store.csrfTokens.set(t, Date.now());
    for (const [k, v] of store.csrfTokens) if (Date.now() - v > 3600000) store.csrfTokens.delete(k);
    res.json({ token: t });
});

app.get('/api/views', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0], now = Date.now();
        if (isConnected()) {
            await query('INSERT INTO views (session_id, view_date) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.sessionId, today]);
            await query('INSERT INTO active_sessions (session_id, last_activity) VALUES ($1,NOW()) ON CONFLICT (session_id) DO UPDATE SET last_activity=NOW()', [req.sessionId]);
            await query("DELETE FROM active_sessions WHERE last_activity < NOW() - INTERVAL '5 minutes'");
            const total = (await query('SELECT COUNT(DISTINCT session_id) FROM views')).rows[0]?.count || 0;
            const online = (await query('SELECT COUNT(*) FROM active_sessions')).rows[0]?.count || 0;
            return res.json({ total: parseInt(total), online: parseInt(online) });
        }
        const key = `${req.sessionId}_${today}`;
        if (!store.views.includes(key)) store.views.push(key);
        store.sessions[req.sessionId] = now;
        Object.keys(store.sessions).forEach(s => { if (now - store.sessions[s] > 300000) delete store.sessions[s]; });
        res.json({ total: store.views.length, online: Object.keys(store.sessions).length });
    } catch (e) { res.json({ total: 0, online: 0 }); }
});

app.get('/api/countdown', async (req, res) => {
    try {
        const now = Date.now();
        if (isConnected()) {
            const r = await query('SELECT end_time, expired FROM countdown WHERE id = 1');
            const end = parseInt(r.rows[0]?.end_time) || store.countdownEnd;
            const exp = r.rows[0]?.expired || false;
            if (exp) return res.json({ remaining: 0, expired: true });
            if (end <= now) { await query('UPDATE countdown SET expired=true WHERE id=1'); return res.json({ remaining: 0, expired: true }); }
            return res.json({ remaining: end - now, expired: false });
        }
        if (store.countdownExpired) return res.json({ remaining: 0, expired: true });
        if (store.countdownEnd <= now) { store.countdownExpired = true; return res.json({ remaining: 0, expired: true }); }
        res.json({ remaining: store.countdownEnd - now, expired: false });
    } catch (e) { res.json({ remaining: 600000, expired: false }); }
});

app.get('/api/products', async (req, res) => {
    try {
        if (isConnected()) {
            const r = await query('SELECT id, nome, autore, prezzo, prezzo_vecchio, descrizione, immagine, in_stock FROM products ORDER BY nome');
            return res.json(r.rows.map(p => ({ id: p.id, nome: escapeHtml(p.nome), autore: escapeHtml(p.autore || ''), prezzo: parseFloat(p.prezzo), prezzoVecchio: p.prezzo_vecchio ? parseFloat(p.prezzo_vecchio) : null, descrizione: escapeHtml(p.descrizione || ''), immagine: escapeHtml(p.immagine || ''), inStock: p.in_stock })));
        }
        res.json(store.products.map(p => ({ ...p, nome: escapeHtml(p.nome), autore: escapeHtml(p.autore || ''), descrizione: escapeHtml(p.descrizione || ''), immagine: escapeHtml(p.immagine || '') })));
    } catch (e) { res.json([]); }
});

app.get('/api/products/:id', async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID non valido' });
    try {
        if (isConnected()) {
            const r = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
            if (!r.rows.length) return res.status(404).json({ error: 'Non trovato' });
            const p = r.rows[0];
            return res.json({ id: p.id, nome: escapeHtml(p.nome), autore: escapeHtml(p.autore || ''), prezzo: parseFloat(p.prezzo), prezzoVecchio: p.prezzo_vecchio ? parseFloat(p.prezzo_vecchio) : null, descrizione: escapeHtml(p.descrizione || ''), immagine: escapeHtml(p.immagine || ''), inStock: p.in_stock });
        }
        const p = store.products.find(x => x.id === req.params.id);
        if (!p) return res.status(404).json({ error: 'Non trovato' });
        res.json({ ...p, nome: escapeHtml(p.nome) });
    } catch (e) { res.status(500).json({ error: 'Errore server' }); }
});

app.get('/api/settings', async (req, res) => {
    try {
        if (isConnected()) {
            const r = await query('SELECT key, value FROM settings');
            const s = {}, sc = {};
            r.rows.forEach(row => {
                if (row.key.startsWith('social_')) sc[row.key.replace('social_', '')] = escapeHtml(row.value || '');
                else if (row.key === 'free_shipping_above' || row.key === 'shipping_cost') s[row.key] = parseFloat(row.value) || 0;
                else s[row.key] = escapeHtml(row.value || '');
            });
            return res.json({ sito: { nome: s.site_name || store.settings.siteName, email: s.email || store.settings.email, telefono: s.phone || store.settings.phone, citta: s.city || store.settings.city }, social: sc, negozio: { spedizioneGratuitaSopra: s.free_shipping_above || 30, costoSpedizione: s.shipping_cost || 4.90 } });
        }
        res.json({ sito: store.settings, social: store.social, negozio: { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90 } });
    } catch (e) { res.json({ sito: store.settings, social: store.social, negozio: { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90 } }); }
});

app.post('/api/contact', rateLimit({ windowMs: 3600000, max: 5 }), async (req, res) => {
    const { name, email, subject, message, website, csrf_token } = req.body;
    if (website) return res.json({ success: true });
    if (!csrf_token || !store.csrfTokens.has(csrf_token)) return res.status(403).json({ error: 'Token non valido' });
    store.csrfTokens.delete(csrf_token);
    const n = sanitize(name, 100), e = sanitize(email, 255), su = sanitize(subject, 200), m = sanitize(message, 2000);
    if (!n || n.length < 2) return res.status(400).json({ error: 'Nome non valido' });
    if (!isValidEmail(e)) return res.status(400).json({ error: 'Email non valida' });
    if (!m || m.length < 10) return res.status(400).json({ error: 'Messaggio troppo corto' });
    try {
        if (isConnected()) await query('INSERT INTO contacts (name, email, subject, message) VALUES ($1,$2,$3,$4)', [n, e, su || 'Info', m]);
        else store.contacts.push({ id: Date.now(), name: n, email: e, subject: su || 'Info', message: m, date: new Date().toISOString() });
        res.json({ success: true, message: 'Messaggio inviato!' });
    } catch (err) { res.status(500).json({ error: 'Errore' }); }
});

app.post('/api/newsletter', rateLimit({ windowMs: 86400000, max: 3 }), async (req, res) => {
    const { email, csrf_token } = req.body;
    if (!csrf_token || !store.csrfTokens.has(csrf_token)) return res.status(403).json({ error: 'Token non valido' });
    store.csrfTokens.delete(csrf_token);
    const e = sanitize(email, 255);
    if (!isValidEmail(e)) return res.status(400).json({ error: 'Email non valida' });
    try {
        if (isConnected()) await query('INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING', [e]);
        else if (!store.newsletter.includes(e)) store.newsletter.push(e);
        res.json({ success: true, message: 'Iscrizione completata!' });
    } catch (err) { res.json({ success: true }); }
});

function authAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Non autorizzato' });
    next();
}

app.get('/api/admin/stats', authAdmin, async (req, res) => {
    try {
        if (isConnected()) {
            const v = (await query('SELECT COUNT(*) FROM views')).rows[0].count;
            const c = (await query('SELECT COUNT(*) FROM contacts')).rows[0].count;
            const n = (await query('SELECT COUNT(*) FROM newsletter')).rows[0].count;
            return res.json({ views: parseInt(v), contacts: parseInt(c), newsletterSubscribers: parseInt(n) });
        }
        res.json({ views: store.views.length, contacts: store.contacts.length, newsletterSubscribers: store.newsletter.length });
    } catch (e) { res.json({ views: 0, contacts: 0, newsletterSubscribers: 0 }); }
});

app.get('/api/admin/contacts', authAdmin, async (req, res) => {
    try {
        if (isConnected()) {
            const r = await query('SELECT id, name, email, subject, message, created_at FROM contacts ORDER BY created_at DESC LIMIT 100');
            return res.json(r.rows.map(c => ({ id: c.id, name: escapeHtml(c.name), email: escapeHtml(c.email), subject: escapeHtml(c.subject || ''), message: escapeHtml(c.message), date: c.created_at })));
        }
        res.json(store.contacts.map(c => ({ ...c, name: escapeHtml(c.name), email: escapeHtml(c.email) })));
    } catch (e) { res.json([]); }
});

app.post('/api/admin/products', authAdmin, async (req, res) => {
    const { id, nome, autore, prezzo, prezzoVecchio, immagine, descrizione, inStock } = req.body;
    if (!id || !isValidId(id)) return res.status(400).json({ error: 'ID non valido' });
    if (!nome || nome.length < 2) return res.status(400).json({ error: 'Nome non valido' });
    if (typeof prezzo !== 'number' || prezzo < 0) return res.status(400).json({ error: 'Prezzo non valido' });
    try {
        if (isConnected()) {
            if ((await query('SELECT id FROM products WHERE id = $1', [id])).rows.length) return res.status(400).json({ error: 'Esiste gia' });
            await query('INSERT INTO products (id, nome, autore, prezzo, prezzo_vecchio, immagine, descrizione, in_stock) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, nome, autore || '', prezzo, prezzoVecchio || null, immagine || '', descrizione || '', inStock !== false]);
        } else {
            if (store.products.find(p => p.id === id)) return res.status(400).json({ error: 'Esiste gia' });
            store.products.push({ id, nome, autore: autore || '', prezzo, prezzoVecchio: prezzoVecchio || null, immagine: immagine || '', descrizione: descrizione || '', inStock: inStock !== false });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.put('/api/admin/products/:id', authAdmin, async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID non valido' });
    const { nome, autore, prezzo, prezzoVecchio, immagine, descrizione, inStock } = req.body;
    try {
        if (isConnected()) {
            const upd = [], val = []; let i = 1;
            if (nome) { upd.push(`nome=$${i++}`); val.push(nome); }
            if (autore !== undefined) { upd.push(`autore=$${i++}`); val.push(autore || ''); }
            if (prezzo !== undefined) { upd.push(`prezzo=$${i++}`); val.push(prezzo); }
            if (prezzoVecchio !== undefined) { upd.push(`prezzo_vecchio=$${i++}`); val.push(prezzoVecchio || null); }
            if (immagine !== undefined) { upd.push(`immagine=$${i++}`); val.push(immagine || ''); }
            if (descrizione !== undefined) { upd.push(`descrizione=$${i++}`); val.push(descrizione || ''); }
            if (inStock !== undefined) { upd.push(`in_stock=$${i++}`); val.push(inStock !== false); }
            if (upd.length) { val.push(req.params.id); await query(`UPDATE products SET ${upd.join(',')} WHERE id=$${i}`, val); }
        } else {
            const p = store.products.find(x => x.id === req.params.id);
            if (!p) return res.status(404).json({ error: 'Non trovato' });
            if (nome) p.nome = nome;
            if (autore !== undefined) p.autore = autore || '';
            if (prezzo !== undefined) p.prezzo = prezzo;
            if (prezzoVecchio !== undefined) p.prezzoVecchio = prezzoVecchio;
            if (immagine !== undefined) p.immagine = immagine || '';
            if (descrizione !== undefined) p.descrizione = descrizione || '';
            if (inStock !== undefined) p.inStock = inStock !== false;
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.delete('/api/admin/products/:id', authAdmin, async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID non valido' });
    try {
        if (isConnected()) await query('DELETE FROM products WHERE id = $1', [req.params.id]);
        else store.products = store.products.filter(p => p.id !== req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.post('/api/admin/countdown/reset', authAdmin, async (req, res) => {
    const endTime = Date.now() + 600000;
    try {
        if (isConnected()) await query('UPDATE countdown SET end_time=$1, expired=false WHERE id=1', [endTime]);
        store.countdownEnd = endTime;
        store.countdownExpired = false;
        res.json({ success: true, endTime });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get('/api/admin/settings', authAdmin, async (req, res) => {
    try {
        if (isConnected()) {
            const r = await query('SELECT key, value FROM settings');
            return res.json(Object.fromEntries(r.rows.map(x => [x.key, x.value])));
        }
        res.json({ site_name: store.settings.siteName, email: store.settings.email, phone: store.settings.phone, city: store.settings.city, social_facebook: store.social.facebook, social_instagram: store.social.instagram, social_twitter: store.social.twitter, social_linkedin: store.social.linkedin, social_whatsapp: store.social.whatsapp });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.put('/api/admin/settings', authAdmin, async (req, res) => {
    const allowed = ['site_name', 'email', 'phone', 'city', 'free_shipping_above', 'shipping_cost', 'social_facebook', 'social_instagram', 'social_twitter', 'social_linkedin', 'social_whatsapp'];
    try {
        for (const [k, v] of Object.entries(req.body)) {
            if (!allowed.includes(k)) continue;
            const val = k === 'free_shipping_above' || k === 'shipping_cost' ? parseFloat(v) || 0 : String(v).substring(0, 500);
            if (isConnected()) await query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, String(val)]);
            else {
                if (k.startsWith('social_')) store.social[k.replace('social_', '')] = val;
                else if (k === 'site_name') store.settings.siteName = val;
                else if (k === 'email') store.settings.email = val;
                else if (k === 'phone') store.settings.phone = val;
                else if (k === 'city') store.settings.city = val;
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get('/api/admin/newsletter', authAdmin, async (req, res) => {
    try {
        if (isConnected()) {
            const r = await query('SELECT id, email, created_at FROM newsletter ORDER BY created_at DESC');
            return res.json(r.rows.map(n => ({ id: n.id, email: escapeHtml(n.email), date: n.created_at })));
        }
        res.json(store.newsletter.map((email, i) => ({ id: i + 1, email: escapeHtml(email) })));
    } catch (e) { res.json([]); }
});

app.delete('/api/admin/newsletter/:id', authAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'ID non valido' });
    try {
        if (isConnected()) await query('DELETE FROM newsletter WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Errore' }); }
});

app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

initDatabase().then(() => app.listen(PORT, () => console.log(`Edizioni Aurora - http://localhost:${PORT} - DB: ${isConnected() ? 'PostgreSQL' : 'Memoria'}`)));
