# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Restaurant expense management app ("Cheltuieli V2") with AI-powered autocomplete. Romanian-language domain (field names, UI text, error messages are in Romanian).

## Commands

### Docker (full stack)
```bash
docker-compose up -d          # Start all services
docker-compose down           # Stop all services
docker-compose logs -f backend  # Follow backend logs
```

### Backend (local development)
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend (local development)
```bash
cd frontend
npm install
npm run dev       # Dev server on :3000
npm run build     # tsc && vite build
npm run lint      # ESLint
```

### Ports
- Frontend: 3000, Backend API: 8000, PostgreSQL: 5432

### Testing
No test framework is currently configured for either backend or frontend.

## Architecture

### Backend (Python FastAPI + async SQLAlchemy)
- **`app/main.py`** — FastAPI app setup, CORS, mounts `api_router` at `/api`
- **`app/core/config.py`** — `Settings` via pydantic-settings, loaded from `.env`
- **`app/core/database.py`** — Async engine (asyncpg), `get_db` dependency yields `AsyncSession` with auto-commit/rollback
- **`app/core/security.py`** — JWT auth (HS256), bcrypt passwords, role-based access via `require_admin`/`require_sef`/`require_operator` dependency factories
- **`app/api/__init__.py`** — Aggregates all routers: auth, nomenclator, cheltuieli, portofele, rapoarte, settings. Note: `portofele.py` also contains alimentari and transferuri endpoints; `rapoarte.py` also contains exercitii endpoints. All routers are mounted flat at `/api` (no per-router prefix).
- **`app/models/models.py`** — All SQLAlchemy models in a single file (uses `declarative_base()` from database.py)
- **`app/schemas/schemas.py`** — All Pydantic schemas in a single file
- **`app/services/ai_service.py`** — Ollama integration: embedding generation (384-dim vectors), dual autocomplete (pg_trgm + pgvector), AI chat

### Frontend (React 18 + TypeScript + Vite)
- **`src/App.tsx`** — Routes: `/login`, `/` (Dashboard), `/cheltuieli`, `/rapoarte`, `/settings/*`. Protected routes wrap with `<Layout>`.
- **`src/hooks/useAppStore.ts`** — Zustand store with persist middleware. Holds auth state (user/token), current exercitiu, theme. Persists token/theme/sidebarOpen to localStorage under key `cheltuieli-storage`.
- **`src/services/api.ts`** — Singleton `ApiService` class wrapping axios. Base URL from `VITE_API_URL`. Auto-attaches Bearer token, redirects to `/login` on 401.
- **`src/types/index.ts`** — All TypeScript interfaces in one file
- **`src/pages/CheltuieliPage.tsx`** — 3 tabs (Cheltuieli, Alimentari, Transferuri) with full CRUD, autocomplete, date range filters, currency selector
- **`src/pages/RapoartePage.tsx`** — Summary cards, daily report, solduri portofele, alimentari/transferuri sections, category breakdown, CSV/Excel export
- **`src/pages/settings/`** — Separate settings sub-pages: Categorii, Grupe, Nomenclator, Ollama, Portofele, UI, Users
- Vite config: `@` alias maps to `./src`, dev proxy `/api` → backend

### Database (PostgreSQL 16 + pgvector + pg_trgm)
- Schema defined in `docker/init.sql` (not via Alembic migrations — tables created at container init)
- Key tables: `settings`, `users`, `portofele`, `categorii`, `grupe`, `nomenclator` (with 384-dim vector embedding), `exercitii` (daily accounting period), `cheltuieli` (transactions), `transferuri`, `alimentari`, `chat_history`. The `cheltuieli`, `alimentari`, and `transferuri` tables have a `moneda` column (VARCHAR(3), default 'RON') supporting RON/EUR/USD.
- DB functions: `autocomplete_nomenclator()` (trigram search), `get_sold_portofel()` (balance calculation)
- Views: `v_raport_zilnic`, `v_solduri_portofele`, `v_sumar_categorii`
- `updated_at` triggers on all relevant tables

## Key Domain Concepts

- **Exercitiu** — Daily accounting period, opens/closes at 07:00
- **Portofel** — Cash register / wallet (Zi, Dimineata, Soferi, Apl, Seara, Banca, Prot)
- **Categorie** — Top-level category (Cheltuieli, Marfa, Salarii, Tips, FormePlata). `afecteaza_sold` controls whether it affects balance
- **Grupa** — Sub-group within a category
- **Nomenclator** — Master data items for autocomplete, linked to categorie+grupa, with optional vector embeddings
- **Cheltuiala.sens** — Transaction direction: Cheltuiala, Incasare, Alimentare, Transfer
- **Cheltuiala.neplatit** — Unpaid goods, tracked separately in reports
- **Roles**: operator (enters expenses), sef (verifies + reports + closes day), admin (full access + settings)

## Autocomplete Strategy

Two-phase search: (1) PostgreSQL pg_trgm trigram similarity on `nomenclator.denumire` — always runs, fast. (2) pgvector cosine similarity on 384-dim embeddings — only runs when trigram returns < 3 results and AI is enabled in settings. Results are merged and deduplicated.
