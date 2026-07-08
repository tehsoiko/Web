const Theme = {
    init() {
        const t = localStorage.getItem('theme') || 'normale';
        const theme = ['normale', 'alba', 'fuoco'].includes(t) ? t : 'normale';
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
            btn.onclick = () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.documentElement.setAttribute('data-theme', btn.dataset.theme);
                localStorage.setItem('theme', btn.dataset.theme);
            };
        });
    }
};

const VisitCounter = {
    async init() {
        try {
            const d = await (await fetch('/api/views')).json();
            const total = document.getElementById('totalVisits'), online = document.getElementById('onlineNow');
            if (total) total.textContent = d.total || 0;
            if (online) online.textContent = d.online || 0;
        } catch (e) {}
    }
};

const Countdown = {
    endTime: null,
    expired: false,
    
    async init() {
        const el = document.getElementById('countdown');
        if (!el) return;
        
        try {
            const d = await (await fetch('/api/countdown')).json();
            if (d.expired) { el.classList.add('hidden'); this.expired = true; return; }
            this.endTime = Date.now() + d.remaining;
        } catch (e) { this.endTime = Date.now() + 600000; }
        
        const update = () => {
            if (this.expired) return;
            const r = this.endTime - Date.now();
            if (r <= 0) { el.classList.add('hidden'); this.expired = true; return; }
            document.getElementById('d').textContent = String(Math.floor(r / 86400000)).padStart(2, '0');
            document.getElementById('h').textContent = String(Math.floor((r % 86400000) / 3600000)).padStart(2, '0');
            document.getElementById('m').textContent = String(Math.floor((r % 3600000) / 60000)).padStart(2, '0');
            document.getElementById('s').textContent = String(Math.floor((r % 60000) / 1000)).padStart(2, '0');
        };
        update();
        setInterval(update, 1000);
    }
};

const Catalog = {
    async init() {
        const grid = document.getElementById('catalogGrid');
        if (!grid) return;
        
        let products = CONFIG.prodotti;
        
        if (!products || !products.length) {
            products = [
                { id: 'interfacce', nome: 'Interfacce', autore: '', prezzo: 19.99, immagine: 'Livro-bestseller-blog-Divirta-c.webp', inStock: true },
                { id: 'all-avvenire', nome: "All'avvenire", autore: '', prezzo: 0, immagine: '', inStock: false }
            ];
        }
        
        grid.innerHTML = products.map(p => `
            <div class="book">
                <div class="book-cover" style="${p.immagine ? 'background-image:url(' + escapeHtml(p.immagine) + ');background-size:cover;background-position:center;' : ''}">${!p.immagine ? '<span style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-size:2em;">📚</span>' : ''}</div>
                <div class="book-body">
                    <h3 class="book-title">${escapeHtml(p.nome)}</h3>
                    <p class="book-author">${escapeHtml(p.autore || '')}</p>
                    ${p.inStock !== false ? `<p class="book-price">€ ${p.prezzo.toFixed(2)}</p><button class="btn btn-add" onclick="Cart.add('${escapeHtml(p.id)}')">Aggiungi</button>` : '<p style="color:var(--muted);font-style:italic;">Prossimamente</p>'}
                </div>
            </div>
        `).join('');
    }
};

const ScrollEffects = {
    init() {
        const prog = document.querySelector('.progress'), toTop = document.getElementById('toTop'), nav = document.querySelector('.navbar');
        if (!prog && !toTop && !nav) return;
        window.addEventListener('scroll', () => {
            const y = window.scrollY, max = document.body.scrollHeight - window.innerHeight;
            if (prog && max > 0) prog.style.width = `${Math.min(100, (y / max) * 100)}%`;
            if (toTop) toTop.classList.toggle('show', y > 300);
            if (nav) nav.classList.toggle('scrolled', y > 50);
        });
        if (toTop) toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

const FAQ = {
    init() { document.querySelectorAll('.faq-q').forEach(q => q.onclick = () => q.parentElement.classList.toggle('open')); }
};

const SocialLinks = {
    init() {
        if (!CONFIG.social) return;
        document.querySelectorAll('[data-social]').forEach(el => {
            const k = el.dataset.social;
            if (!CONFIG.social[k]) return;
            el.href = k === 'whatsapp' ? `https://wa.me/${encodeURIComponent(CONFIG.social[k])}` : CONFIG.social[k];
        });
    }
};

const ContactInfo = {
    init() {
        if (!CONFIG.sito) return;
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
        set('contactEmail', CONFIG.sito.email);
        set('contactPhone', CONFIG.sito.telefono);
        set('contactCity', CONFIG.sito.citta);
    }
};

async function initPage() {
    await CONFIG.load();
    Theme.init();
    ScrollEffects.init();
    FAQ.init();
    SocialLinks.init();
    ContactInfo.init();
    if (typeof Cart !== 'undefined') Cart.init();
    if (typeof VisitCounter !== 'undefined') VisitCounter.init();
    if (typeof Countdown !== 'undefined') Countdown.init();
    if (typeof Catalog !== 'undefined') Catalog.init();
}

document.addEventListener('DOMContentLoaded', initPage);
