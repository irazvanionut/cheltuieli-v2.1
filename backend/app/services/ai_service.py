import httpx
import numpy as np
from typing import List, Dict, Optional
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.models import Nomenclator, Setting


class AIService:
    """AI Service pentru autocomplete și chat cu Ollama (via HTTP API)"""
    
    def __init__(self):
        self._host = settings.OLLAMA_HOST
        self._embedding_model = settings.EMBEDDING_MODEL
        self._chat_model = settings.CHAT_MODEL
    
    async def update_settings(self, db: AsyncSession):
        """Update AI settings from database"""
        result = await db.execute(
            select(Setting).where(Setting.cheie.in_([
                'ollama_host', 'ollama_embedding_model', 'ollama_chat_model'
            ]))
        )
        settings_db = {s.cheie: s.valoare for s in result.scalars().all()}
        
        if 'ollama_host' in settings_db:
            self._host = settings_db['ollama_host']
        if 'ollama_embedding_model' in settings_db:
            self._embedding_model = settings_db['ollama_embedding_model']
        if 'ollama_chat_model' in settings_db:
            self._chat_model = settings_db['ollama_chat_model']
    
    async def test_connection(self) -> Dict:
        """Test Ollama connection"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self._host}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = [m['name'] for m in data.get('models', [])]
                    return {
                        "status": "connected",
                        "host": self._host,
                        "models": models,
                        "embedding_model": self._embedding_model,
                        "chat_model": self._chat_model
                    }
        except Exception as e:
            pass
        
        return {
            "status": "disconnected",
            "host": self._host,
            "error": "Nu s-a putut conecta la Ollama"
        }
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    def generate_embedding(self, text: str) -> List[float]:
        """Generează embedding vector pentru text (sync for batch processing)"""
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self._host}/api/embeddings",
                    json={
                        "model": self._embedding_model,
                        "prompt": text
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get('embedding', [0.0] * 384)
        except Exception as e:
            print(f"Error generating embedding: {e}")
        
        return [0.0] * 384  # Fallback
    
    async def generate_embedding_async(self, text: str) -> List[float]:
        """Generează embedding vector pentru text (async)"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self._host}/api/embeddings",
                    json={
                        "model": self._embedding_model,
                        "prompt": text
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get('embedding', [0.0] * 384)
        except Exception as e:
            print(f"Error generating embedding: {e}")
        
        return [0.0] * 384  # Fallback
    
    async def autocomplete_ai(
        self,
        query: str,
        db: AsyncSession,
        limit: int = 10
    ) -> List[Dict]:
        """
        Autocomplete cu 2 metode:
        1. Trigram similarity (PostgreSQL pg_trgm) - RAPID
        2. Vector similarity (pgvector + embeddings) - PRECIS (dacă embeddings există)
        """
        results = []
        
        # Method 1: Trigram search (always works)
        sql = text("""
            SELECT * FROM autocomplete_nomenclator(:query, :limit)
        """)
        result = await db.execute(sql, {"query": query, "limit": limit})
        rows = result.fetchall()
        
        for row in rows:
            results.append({
                "id": row.id,
                "denumire": row.denumire,
                "categorie_id": row.categorie_id,
                "categorie_nume": row.categorie_nume,
                "grupa_id": row.grupa_id,
                "grupa_nume": row.grupa_nume,
                "tip_entitate": row.tip_entitate,
                "similarity": float(row.similarity) if row.similarity else 0.0,
                "source": "trigram"
            })
        
        # Method 2: Vector search (if enabled and no good results)
        if len(results) < 3:
            try:
                # Check if AI is enabled
                setting = await db.execute(
                    select(Setting).where(Setting.cheie == 'ai_autocomplete_enabled')
                )
                ai_enabled = setting.scalar_one_or_none()
                
                if ai_enabled and ai_enabled.valoare == 'true':
                    query_embedding = await self.generate_embedding_async(query)
                    
                    sql_vector = text("""
                        SELECT 
                            n.id,
                            n.denumire,
                            n.categorie_id,
                            c.nume as categorie_nume,
                            n.grupa_id,
                            g.nume as grupa_nume,
                            n.tip_entitate,
                            1 - (n.embedding <=> :embedding::vector) as similarity
                        FROM nomenclator n
                        LEFT JOIN categorii c ON n.categorie_id = c.id
                        LEFT JOIN grupe g ON n.grupa_id = g.id
                        WHERE n.activ = true
                          AND n.embedding IS NOT NULL
                        ORDER BY n.embedding <=> :embedding::vector
                        LIMIT :limit
                    """)
                    
                    result = await db.execute(sql_vector, {
                        "embedding": str(query_embedding),
                        "limit": limit
                    })
                    
                    existing_ids = {r["id"] for r in results}
                    for row in result.fetchall():
                        if row.id not in existing_ids and row.similarity > 0.5:
                            results.append({
                                "id": row.id,
                                "denumire": row.denumire,
                                "categorie_id": row.categorie_id,
                                "categorie_nume": row.categorie_nume,
                                "grupa_id": row.grupa_id,
                                "grupa_nume": row.grupa_nume,
                                "tip_entitate": row.tip_entitate,
                                "similarity": float(row.similarity),
                                "source": "vector"
                            })
            except Exception as e:
                print(f"Vector search error: {e}")
        
        # Sort by similarity
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:limit]
    
    async def generate_embeddings_for_nomenclator(self, db: AsyncSession) -> Dict:
        """Generate embeddings for all nomenclator items without embeddings"""
        result = await db.execute(
            select(Nomenclator).where(
                Nomenclator.activ == True,
                Nomenclator.embedding == None
            )
        )
        items = result.scalars().all()
        
        generated = 0
        errors = 0
        
        for item in items:
            try:
                embedding = self.generate_embedding(item.denumire)
                item.embedding = embedding
                generated += 1
            except Exception as e:
                print(f"Error generating embedding for {item.denumire}: {e}")
                errors += 1
        
        await db.commit()
        
        return {
            "total": len(items),
            "generated": generated,
            "errors": errors
        }
    
    async def chat(self, message: str, db: AsyncSession, user_id: int) -> str:
        """Chat with AI BigBoss"""
        try:
            # Build context from recent data
            context = await self._build_chat_context(db)
            
            system_prompt = f"""Ești asistentul AI pentru aplicația de gestiune cheltuieli a unui restaurant.
Răspunde în limba română, concis și la obiect.

Context actual:
{context}

Poți răspunde la întrebări despre:
- Cheltuieli și tranzacții
- Solduri portofele
- Statistici și rapoarte
- Furnizori și categorii
"""
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self._host}/api/chat",
                    json={
                        "model": self._chat_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": message}
                        ],
                        "stream": False
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get('message', {}).get('content', 'Nu am putut genera un răspuns.')
                else:
                    return f"Eroare Ollama: {response.status_code}"
            
        except Exception as e:
            return f"Eroare AI: {str(e)}"
    
    async def _build_chat_context(self, db: AsyncSession) -> str:
        """Build context for AI chat from current data"""
        context_parts = []
        
        # Get current exercitiu stats
        sql = text("""
            SELECT 
                e.data,
                COUNT(ch.id) as nr_cheltuieli,
                COALESCE(SUM(ch.suma), 0) as total
            FROM exercitii e
            LEFT JOIN cheltuieli ch ON ch.exercitiu_id = e.id AND ch.activ = true
            WHERE e.activ = true
            GROUP BY e.id, e.data
            LIMIT 1
        """)
        result = await db.execute(sql)
        row = result.fetchone()
        if row:
            context_parts.append(f"Ziua curentă: {row.data}, {row.nr_cheltuieli} cheltuieli, total: {row.total} lei")
        
        # Get portofele solduri
        sql = text("SELECT portofel, sold_zi_curenta FROM v_solduri_portofele")
        result = await db.execute(sql)
        solduri = [f"{r.portofel}: {r.sold_zi_curenta} lei" for r in result.fetchall()]
        if solduri:
            context_parts.append(f"Solduri portofele: {', '.join(solduri)}")
        
        return "\n".join(context_parts)


# Singleton instance
ai_service = AIService()
