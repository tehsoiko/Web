const Theme = {
    allowedThemes: ['normale', 'alba', 'fuoco'],
    
    init() {
        let saved = localStorage.getItem('theme') || 'normale';
        
        if (!this.allowedThemes.includes(saved)) {
            saved = 'normale';
        }
        
        document.documentElement.setAttribute('data-theme', saved);
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            const theme = btn.dataset.theme;
            if (!this.allowedThemes.includes(theme)) return;
            
            if (theme === saved) btn.classList.add('active');
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            });
        });
    }
};

const ScrollEffects = {
    init() {
        const prog = document.querySelector('.progress');
        const toTop = document.getElementById('toTop');
        const nav = document.querySelector('.navbar');
        
        if (!prog && !toTop && !nav) return;
        
        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            const max = document.body.scrollHeight - window.innerHeight;
            
            if (prog && max > 0) {
                prog.style.width = `${Math.min(100, Math.max(0, (y/max)*100))}%`;
            }
            if (toTop) toTop.classList.toggle('show', y > 300);
            if (nav) nav.classList.toggle('scrolled', y > 50);
        });
        
        if (toTop) {
            toTop.addEventListener('click', () => {
                const start = window.scrollY;
                const t0 = performance.now();
                const ease = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
                const run = t => {
                    const p = Math.min((t - t0) / 1500, 1);
                    window.scrollTo(0, start * (1 - ease(p)));
                    if (p < 1) requestAnimationFrame(run);
                };
                requestAnimationFrame(run);
            });
        }
    }
};

const FAQ = {
    init() {
        document.querySelectorAll('.faq-q').forEach(q => {
            q.addEventListener('click', () => {
                q.parentElement.classList.toggle('open');
            });
        });
    }
};

const SocialLinks = {
    allowedNetworks: ['facebook', 'instagram', 'twitter', 'linkedin', 'whatsapp'],
    
    init() {
        document.querySelectorAll('[data-social]').forEach(el => {
            const key = el.dataset.social;
            
            if (!this.allowedNetworks.includes(key)) return;
            
            if (CONFIG.social && CONFIG.social[key]) {
                const url = key === 'whatsapp' 
                    ? `https://wa.me/${encodeURIComponent(CONFIG.social.whatsapp)}` 
                    : CONFIG.social[key];
                
                try {
                    new URL(url);
                    el.href = url;
                } catch (e) {
                    el.href = '#';
                }
            }
        });
    }
};

const ContactInfo = {
    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    },
    
    init() {
        if (!CONFIG.sito) return;
        
        const setEmail = (el, value) => {
            if (el && typeof value === 'string') {
                el.textContent = this.escapeHtml(value);
            }
        };
        
        setEmail(document.getElementById('contactEmail'), CONFIG.sito.email);
        setEmail(document.getElementById('contactPhone'), CONFIG.sito.telefono);
        setEmail(document.getElementById('contactCity'), CONFIG.sito.citta);
        
        const cEmailEl = document.getElementById('cEmail');
        if (cEmailEl && CONFIG.sito.email) {
            cEmailEl.innerHTML = this.escapeHtml(CONFIG.sito.email) + '<br>supporto@libridimpresa.it';
        }
        setEmail(document.getElementById('cPhone'), CONFIG.sito.telefono);
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
