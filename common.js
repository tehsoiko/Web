// FUNZIONI CONDIVISE

const Theme = {
    init() {
        const saved = localStorage.getItem('theme') || 'normale';
        document.documentElement.setAttribute('data-theme', saved);
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === saved) btn.classList.add('active');
            
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.documentElement.setAttribute('data-theme', btn.dataset.theme);
                localStorage.setItem('theme', btn.dataset.theme);
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
            
            if (prog) prog.style.width = `${(y/max)*100}%`;
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
    init() {
        document.querySelectorAll('[data-social]').forEach(el => {
            const key = el.dataset.social;
            if (CONFIG.social && CONFIG.social[key]) {
                el.href = key === 'whatsapp' 
                    ? `https://wa.me/${CONFIG.social.whatsapp}` 
                    : CONFIG.social[key];
            }
        });
    }
};

const ContactInfo = {
    init() {
        if (!CONFIG.sito) return;
        
        const emailEl = document.getElementById('contactEmail');
        const phoneEl = document.getElementById('contactPhone');
        const cityEl = document.getElementById('contactCity');
        const cEmailEl = document.getElementById('cEmail');
        const cPhoneEl = document.getElementById('cPhone');
        
        if (emailEl) emailEl.textContent = CONFIG.sito.email;
        if (phoneEl) phoneEl.textContent = CONFIG.sito.telefono;
        if (cityEl) cityEl.textContent = CONFIG.sito.citta;
        if (cEmailEl) cEmailEl.innerHTML = CONFIG.sito.email + '<br>supporto@libridimpresa.it';
        if (cPhoneEl) cPhoneEl.textContent = CONFIG.sito.telefono;
    }
};

async function initPage() {
    await CONFIG.load();
    
    Theme.init();
    ScrollEffects.init();
    FAQ.init();
    SocialLinks.init();
    ContactInfo.init();
    
    if (typeof Cart !== 'undefined') {
        Cart.init();
    }
    if (typeof VisitCounter !== 'undefined') {
        VisitCounter.init();
    }
    if (typeof Countdown !== 'undefined') {
        Countdown.init();
    }
    if (typeof Catalog !== 'undefined') {
        Catalog.init();
    }
}

document.addEventListener('DOMContentLoaded', initPage);
