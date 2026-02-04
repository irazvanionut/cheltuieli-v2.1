# 🍽️ Cheltuieli V2

Aplicație de management cheltuieli pentru restaurant cu AI autocomplete.

## 🚀 Caracteristici

- ✅ **Autentificare** cu cod/card
- ✅ **Autocomplete AI** cu Ollama (pg_trgm + vector embeddings)
- ✅ **Gestiune portofele** (Zi, Dimineata, Soferi, Apl, Seara, Banca, Prot)
- ✅ **Categorii**: Cheltuieli, Marfă, Salarii, Tips, FormePlata
- ✅ **Exercițiu zilnic** cu deschidere/închidere la 07:00
- ✅ **Rapoarte** grupate pe Categorie → Grupă → Denumire
- ✅ **Marfă neplătită** - tracked separat
- ✅ **Verificare cheltuieli** de către manager
- ✅ **Transferuri** între portofele
- ✅ **Setări complete** pentru toate entitățile
- ✅ **Tema Dark/Light**
- ✅ **Mobile-friendly** (PWA ready)

## 🛠️ Tech Stack

### Backend
- **Python 3.11** + **FastAPI**
- **PostgreSQL 16** + **pgvector** + **pg_trgm**
- **SQLAlchemy** (async)
- **Ollama** pentru AI embeddings & chat

### Frontend
- **React 18** + **TypeScript**
- **Vite** pentru build
- **Tailwind CSS** pentru styling
- **React Query** pentru data fetching
- **Zustand** pentru state management

## 📦 Instalare

### Cerințe
- Docker & Docker Compose
- (Opțional) Ollama pentru AI features

### Quick Start

```bash
# Clone repository
git clone <repo-url>
cd cheltuieli-v2

# Configurare
cp backend/.env.example backend/.env
# Editează .env cu valorile tale

# Pornire cu Docker
docker-compose up -d

# Accesare
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs
# Database: localhost:5432
```

### Dezvoltare locală (fără Docker)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # sau venv\Scripts\activate pe Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (alt terminal)
cd frontend
npm install
npm run dev
```

## 🔐 Autentificare

Utilizator default:
- **Username**: admin
- **Cod acces**: 1234
- **Rol**: admin

## 📁 Structură Proiect

```
cheltuieli-v2/
├── docker-compose.yml
├── docker/
│   └── init.sql          # Schema DB + date inițiale
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py       # FastAPI app
│       ├── api/          # Routers
│       ├── core/         # Config, DB, Security
│       ├── models/       # SQLAlchemy models
│       ├── schemas/      # Pydantic schemas
│       └── services/     # AI service
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.tsx
        ├── components/   # UI components
        ├── pages/        # Page components
        ├── hooks/        # Custom hooks & store
        ├── services/     # API service
        └── types/        # TypeScript types
```

## 🌐 API Endpoints

### Auth
- `POST /api/auth/login` - Autentificare
- `GET /api/auth/me` - User curent
- `GET /api/auth/users` - Lista users (admin)

### Exerciții
- `GET /api/exercitii/curent` - Exercițiu activ
- `POST /api/exercitii/inchide` - Închide ziua
- `POST /api/exercitii` - Deschide zi nouă

### Cheltuieli
- `GET /api/cheltuieli` - Lista cheltuieli
- `POST /api/cheltuieli` - Adaugă cheltuială
- `PATCH /api/cheltuieli/{id}` - Actualizează
- `DELETE /api/cheltuieli/{id}` - Șterge
- `POST /api/cheltuieli/{id}/verifica` - Verifică

### Autocomplete
- `GET /api/autocomplete?q=` - AI autocomplete

### Rapoarte
- `GET /api/rapoarte/zilnic` - Raport zilnic
- `GET /api/rapoarte/perioada` - Raport perioadă

### Setări
- `GET /api/settings` - Lista setări
- `PATCH /api/settings/{cheie}` - Actualizează
- `GET /api/settings/ollama/test` - Test conexiune AI

## 🔧 Configurare Ollama

1. Instalează Ollama: https://ollama.ai
2. Descarcă modelele:
   ```bash
   ollama pull mxbai-embed-large  # pentru embeddings
   ollama pull llama3.2:3b        # pentru chat (opțional)
   ```
3. Configurează în Setări → Conexiune AI

## 📝 Licență

MIT
