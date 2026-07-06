# Libri d'Impresa - Sito E-commerce

Sito web dinamico per una casa editrice indipendente con backend Node.js e database PostgreSQL.

## Installazione locale

```bash
npm install
npm start
```

Il server sara disponibile su `http://localhost:3000`

## Deploy su Render.com

### Passo 1: Carica su GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TUO-USERNAME/libri-dimpresa.git
git push -u origin main
```

### Passo 2: Deploy su Render

1. Vai su [render.com](https://render.com) e accedi
2. Clicca **"New"** → **"Blueprint"**
3. Connetti il tuo repository GitHub
4. Seleziona il repository `libri-dimpresa`
5. Render creera automaticamente:
   - Database PostgreSQL
   - Web Service
6. Clicca **"Apply"**

### Passo 3: Attendi il completamento

- Il database viene creato per primo
- Poi viene deployato il web service
- Il sito sara disponibile su: `https://nome-app.onrender.com`

## Struttura

```
/
├── server.js          # Server Express con API
├── database.js        # Connessione PostgreSQL
├── config.js          # Configurazione frontend
├── cart.js            # Gestione carrello
├── common.js          # Funzioni condivise
├── Stili.css          # Foglio di stile
├── index.html         # Home page
├── catalogo.html      # Catalogo prodotti
├── carrello.html      # Carrello
├── chi-siamo.html     # Pagina azienda
├── contatti.html      # Form contatti
├── admin.html         # Pannello admin
├── render.yaml        # Configurazione Render
└── README.md          # Documentazione
```

## API

### Pubbliche
- `GET /api/views` - Contatore visite reali
- `GET /api/countdown` - Countdown sincronizzato
- `GET /api/products` - Lista prodotti
- `GET /api/settings` - Impostazioni sito
- `POST /api/contact` - Invia messaggio
- `POST /api/newsletter` - Iscrizione newsletter

### Admin
- `GET /api/admin/stats` - Statistiche
- `GET /api/admin/contacts` - Messaggi ricevuti
- `PUT /api/admin/contacts/:id/read` - Segna come letto

## Funzionalita

- Contatore visite reali (una visita per utente per giorno)
- Utenti online reali (attivi negli ultimi 5 minuti)
- Countdown sincronizzato con il server
- Database PostgreSQL persistente
- Form contatti con anti-spam
- Newsletter
- Pannello admin

## Costi Render.com

- **Web Service**: Gratuito (si addormenta dopo 15 min inattivita)
- **PostgreSQL**: Gratuito (1 GB storage, scade dopo 90 giorni se inattivo)

Per un sito in produzione, considera i piani a pagamento per evitare lo sleep.
