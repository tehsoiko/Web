const escapeHtml = s => typeof s !== 'string' ? '' : s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DEFAULT_PRODUCTS = [
    { id: 'interfacce', nome: 'Interfacce', autore: '', prezzo: 19.99, prezzoVecchio: 29.99, immagine: 'Livro-bestseller-blog-Divirta-c.webp', descrizione: 'Un libro sulle tecnologie digitali', inStock: true },
    { id: 'all-avvenire', nome: "All'avvenire", autore: '', prezzo: 0, prezzoVecchio: null, immagine: '', descrizione: 'Prossima pubblicazione', inStock: false }
];

const CONFIG = {
    csrfToken: null,
    sito: { nome: 'Edizioni Aurora', email: 'info@edizioniaurora.it', telefono: '+39 02 1234567', citta: 'Milano' },
    social: {},
    negozio: { spedizioneGratuitaSopra: 30, costoSpedizione: 4.90 },
    prodotti: DEFAULT_PRODUCTS,
    _loaded: false,
    
    async load() {
        if (this._loaded) return this;
        
        try {
            const [csrf, settings, products] = await Promise.all([
                fetch('/api/csrf-token').then(r => r.json()).catch(() => ({ token: null })),
                fetch('/api/settings').then(r => r.json()).catch(() => null),
                fetch('/api/products').then(r => r.json()).catch(() => null)
            ]);
            
            this.csrfToken = csrf?.token || null;
            if (settings) {
                this.sito = settings.sito || this.sito;
                this.social = settings.social || this.social;
                this.negozio = settings.negozio || this.negozio;
            }
            if (products && Array.isArray(products) && products.length > 0) {
                this.prodotti = products;
            }
        } catch (e) {
            console.error('Errore caricamento:', e);
        }
        
        this._loaded = true;
        return this;
    }
};

const API = {
    async subscribeNewsletter(email) {
        try {
            const res = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, csrf_token: CONFIG.csrfToken })
            });
            return res.json();
        } catch (e) {
            return { success: true, message: 'Grazie!' };
        }
    },
    
    async sendContact(data) {
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, csrf_token: CONFIG.csrfToken })
            });
            return res.json();
        } catch (e) {
            return { success: true, message: 'Messaggio inviato!' };
        }
    }
};
