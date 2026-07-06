# ASSESSMENT SICUREZZA - Libri d'Impresa E-Commerce

## Data: Luglio 2026

---

## PANORAMICA

Questo è un **e-commerce frontend-only** che utilizza:
- Carrello in localStorage
- Checkout tramite email o link esterni (Stripe/PayPal)
- Contatore visite con CountAPI

**NON è un e-commerce completo** con backend proprio.

---

## VULNERABILITÀ IDENTIFICATE

### ALTO RISCHIO

**1. Nessun Backend / Validazione Server-Side** ⚠️ CRITICO
- Il carrello è gestito interamente nel browser
- Un utente può modificare prezzi/quantità via console
- **Soluzione**: Implementare backend con database

**2. Checkout Insicuro**
- L'ordine viene inviato via email (mailto:)
- Nessuna conferma, nessuna tracciabilità
- **Soluzione**: Usare Stripe Payment Links o gateway PayPal

**3. API Key Esposte** ⚠️
- Se inserisci checkoutUrl con token, sono visibili nel codice
- **Soluzione**: Usare link pubblici (Stripe Payment Links non ha segreti)

**4. Nessuna Autenticazione**
- Chiunque può "ordinare"
- Nessun storico ordini per utente
- **Soluzione**: Implementare sistema auth se necessario

### MEDIO RISCHIO

**5. XSS (Cross-Site Scripting)**
- I campi del form non sono sanificati
- **Soluzione**: Implementare CSP header

**6. CSRF Non Implementato**
- **Soluzione**: Aggiungere CSRF token

**7. localStorage Manipolabile**
- Il carrello può essere modificato dall'utente
- **Soluzione**: Validare prezzi server-side

### BASSO RISCHIO

**8. Cookie Senza Flag Sicuri**
**9. Manca HTTPS Enforcement**
**10. Intestazioni di Sicurezza Mancanti**

---

## MISURE DI PROTEZIONE GIÀ IMPLEMENTATE

✅ **Honeypot field** - Anti-bot nel form contatti
✅ **Time check** - Verifica tempo compilazione form
✅ **Carrello localStorage** - Nessun dato sensibile salvato
✅ **Checkout esterno** - Pagamenti gestiti da terze parti
✅ **Contatore visite** - CountAPI senza API key sensibili
✅ **Nessuna API key hardcoded** - Config vuoto di default

---

## PER UN E-COMMERCE REALE

### Opzione 1: Stripe Payment Links (CONSIGLIATO)
```
1. Vai su stripe.com → Products → Create payment link
2. Copia il link nel config.js → prodotti[].checkoutUrl
3. Stripe gestisce pagamenti sicuri
4. Nessun backend richiesto
```

### Opzione 2: Shopify/Gumroad
```
1. Crea prodotti su Gumroad/Shopify
2. Linka i prodotti dal catalogo
3. Loro gestiscono tutto
```

### Opzione 3: Backend Completo
```
- Node.js + Express + MongoDB/PostgreSQL
- Stripe SDK per pagamenti
- Autenticazione JWT
- Dashboard admin
```

---

## CONFIGURAZIONE SICURA

### Per Stripe Payment Links:
1. Registrati su stripe.com
2. Crea un prodotto
3. Genera Payment Link
4. Incolla in `config.js`:
```js
prodotti: [{
    id: "interfacce",
    nome: "Interfacce",
    prezzo: 19.99,
    checkoutUrl: "https://buy.stripe.com/xxxxx"
}]
```

### Per CountAPI (già configurato):
- Namespace: `libridimpresa-visite`
- Key: `visits`
- Nessuna API key richiesta

---

## SCORE FINALE

| Categoria | Punteggio |
|-----------|-----------|
| Input Validation | 3/10 |
| Authentication | N/A |
| Authorization | N/A |
| Data Protection | 4/10 |
| Payment Security | 6/10 (con Stripe Links) |
| Error Handling | 5/10 |
| Logging | 2/10 |
| Security Headers | 2/10 |

**TOTALE: 4/10** ⚠️

---

## CONCLUSIONE

Questo è un **catalogo prodotti con carrello frontend**. Per pagamenti reali:

| Scenario | Soluzione |
|----------|-----------|
| Vendita occasionale | Stripe Payment Links |
| Più prodotti | Gumroad / Shopify |
| E-commerce completo | Backend + Stripe SDK |

**Limitazioni attuali:**
- ❌ Nessun controllo inventario
- ❌ Nessun storico ordini
- ❌ Nessuna email di conferma automatica
- ❌ Prezzi modificabili dal client

**Vantaggi:**
- ✅ Semplice, niente backend
- ✅ Hosting economico (statico)
- ✅ Pagamenti sicuri se usi Stripe Links
