const Cart = {
    items: [],
    
    init() {
        try {
            const saved = localStorage.getItem('cart');
            if (saved) this.items = JSON.parse(saved).filter(i => i?.id && /^[a-zA-Z0-9_-]{1,100}$/.test(i.id) && typeof i.prezzo === 'number' && i.prezzo >= 0 && typeof i.qty === 'number' && i.qty > 0);
        } catch (e) { this.items = []; }
        this.updateUI();
    },
    
    save() { localStorage.setItem('cart', JSON.stringify(this.items)); this.updateUI(); this.refresh(); },
    refresh() { const c = document.getElementById('cartContainer'); if (c) this.render(c); },
    
    add(id, qty = 1) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return;
        const p = CONFIG.prodotti?.find(x => x.id === id);
        if (!p) return;
        const ex = this.items.find(i => i.id === id);
        if (ex) ex.qty = Math.min(ex.qty + qty, 99);
        else this.items.push({ id, nome: p.nome, prezzo: p.prezzo, immagine: p.immagine, qty: Math.min(qty, 99) });
        this.save();
        this.showNotification(`${escapeHtml(p.nome)} aggiunto`);
    },
    
    remove(id) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return; this.items = this.items.filter(i => i.id !== id); this.save(); },
    updateQty(id, qty) { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return; const i = this.items.find(x => x.id === id); if (i) { if (qty <= 0 || qty > 99) this.remove(id); else { i.qty = qty; this.save(); } } },
    clear() { this.items = []; this.save(); },
    total() { return this.items.reduce((s, i) => s + i.prezzo * i.qty, 0); },
    count() { return this.items.reduce((s, i) => s + i.qty, 0); },
    shipping() { const t = this.total(); return t === 0 ? 0 : t >= (CONFIG.negozio?.spedizioneGratuitaSopra || 30) ? 0 : CONFIG.negozio?.costoSpedizione || 4.90; },
    grandTotal() { return this.total() + this.shipping(); },
    
    updateUI() {
        const c = this.count();
        const badge = document.getElementById('cartBadge');
        if (badge) badge.setAttribute('data-count', c);
    },
    
    showNotification(msg) {
        let n = document.querySelector('.cart-notification');
        if (!n) { n = document.createElement('div'); n.className = 'cart-notification'; document.body.appendChild(n); }
        n.textContent = msg;
        setTimeout(() => n.classList.add('show'), 10);
        setTimeout(() => { n.classList.remove('show'); }, 2000);
    },
    
    render(c) {
        if (!c) return;
        if (!this.items.length) {
            c.innerHTML = '<div class="empty-cart"><svg viewBox="0 0 24 24" width="64" height="64" stroke="var(--muted)" fill="none" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><h3>Il carrello e vuoto</h3><p>Aggiungi libri dal <a href="catalogo.html">catalogo</a></p></div>';
            return;
        }
        
        let h = '<div class="cart-items">';
        this.items.forEach(i => {
            h += `<div class="cart-item">
                <div class="cart-item-img">${i.immagine ? `<img src="${escapeHtml(i.immagine)}" alt="${escapeHtml(i.nome)}" loading="lazy">` : '<div class="cart-item-placeholder">📚</div>'}</div>
                <div class="cart-item-info"><h4>${escapeHtml(i.nome)}</h4><p class="cart-item-price">€ ${i.prezzo.toFixed(2)}</p></div>
                <div class="cart-item-qty"><button onclick="Cart.updateQty('${escapeHtml(i.id)}', ${i.qty - 1})">-</button><span>${i.qty}</span><button onclick="Cart.updateQty('${escapeHtml(i.id)}', ${i.qty + 1})">+</button></div>
                <div class="cart-item-total">€ ${(i.prezzo * i.qty).toFixed(2)}</div>
                <button class="cart-item-remove" onclick="Cart.remove('${escapeHtml(i.id)}')"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>`;
        });
        h += '</div>';
        
        const sh = this.shipping();
        h += `<div class="cart-summary">
            <div class="cart-row"><span>Subtotale</span><span>€ ${this.total().toFixed(2)}</span></div>
            <div class="cart-row"><span>Spedizione</span><span>${sh === 0 ? '<strong style="color:var(--success)">Gratuita</strong>' : `€ ${sh.toFixed(2)}`}</span></div>
            ${sh > 0 ? `<p class="cart-shipping-note">Gratis sopra € ${(CONFIG.negozio?.spedizioneGratuitaSopra || 30).toFixed(2)}</p>` : ''}
            <div class="cart-row cart-total"><span>Totale</span><span>€ ${this.grandTotal().toFixed(2)}</span></div>
        </div>
        <div class="cart-actions"><a href="catalogo.html" class="btn btn-outline">Continua</a><button class="btn" onclick="Cart.checkout()">Ordina</button></div>`;
        c.innerHTML = h;
    },
    
    checkout() {
        if (!this.items.length) return;
        const ord = this.items.map(i => `${i.qty}x ${i.nome} - € ${(i.prezzo * i.qty).toFixed(2)}`).join('\n');
        const subj = encodeURIComponent(`Ordine - ${this.count()} libri`);
        const body = encodeURIComponent(`Ordine:\n${ord}\n\nSubtotale: € ${this.total().toFixed(2)}\nSpedizione: ${this.shipping() === 0 ? 'Gratuita' : `€ ${this.shipping().toFixed(2)}`}\nTOTALE: € ${this.grandTotal().toFixed(2)}\n\nDati cliente:\nNome: \nEmail: \nIndirizzo: `);
        window.location.href = `mailto:${CONFIG.sito?.email || 'info@edizioniaurora.it'}?subject=${subj}&body=${body}`;
    }
};
