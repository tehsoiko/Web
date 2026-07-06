const CONFIG = {
    _loaded: false,
    _listeners: [],
    csrfToken: null,
    
    onReady(callback) {
        if (this._loaded) callback();
        else this._listeners.push(callback);
    },
    
    async load() {
        try {
            const csrfRes = await fetch('/api/csrf-token');
            const csrfData = await csrfRes.json();
            this.csrfToken = csrfData.token;
            
            const res = await fetch('/api/settings');
            const data = await res.json();
            
            this.sito = data.sito;
            this.social = data.social;
            this.negozio = data.negozio;
            
            const productsRes = await fetch('/api/products');
            this.prodotti = await productsRes.json();
            
            this._loaded = true;
            this._listeners.forEach(cb => cb());
            
            return this;
        } catch (e) {
            console.error('Errore caricamento config:', e);
            this.sito = { nome: "Edizioni Aurora", email: "info@edizioniaurora.it", telefono: "+39 02 1234567", citta: "Milano" };
            this.social = { facebook: "", instagram: "", twitter: "", linkedin: "", whatsapp: "" };
            this.negozio = { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90, valuta: "EUR", simboloValuta: "EUR" };
            this.prodotti = [];
            this._loaded = true;
            return this;
        }
    }
};

const API = {
    async getViews() {
        const res = await fetch('/api/views');
        return res.json();
    },
    
    async getCountdown() {
        const res = await fetch('/api/countdown');
        return res.json();
    },
    
    async getProducts() {
        const res = await fetch('/api/products');
        return res.json();
    },
    
    async getProduct(id) {
        const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
        return res.json();
    },
    
    async getChallenge() {
        const res = await fetch('/api/challenge');
        return res.json();
    },
    
    async sendContact(data) {
        const res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, csrf_token: CONFIG.csrfToken })
        });
        return res.json();
    },
    
    async subscribeNewsletter(email) {
        const res = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, csrf_token: CONFIG.csrfToken })
        });
        return res.json();
    }
};

if (typeof module !== 'undefined') module.exports = { CONFIG, API };
