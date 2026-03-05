"""
Competitor Price Comparison — scraping + matching + REST API.

Scrapers are registered in _SCRAPERS dict keyed by scraper_key.
To add a new site: write a scrape_<key> function, add it to _SCRAPERS,
insert a row in competitor_sites via the Settings UI.
"""

import asyncio
import unicodedata
from datetime import datetime
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Callable, Optional

import numpy as np

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.core.security import require_admin, require_sef
from app.models.models import CompetitorSite, CompetitorProduct, CompetitorPriceChange

router = APIRouter(tags=["competitori"])

# ─── Stopwords removed during name normalisation ──────────────────────────────
_STOPWORDS = {
    "cu", "de", "la", "si", "in", "pe", "din", "cu", "o", "un", "al", "ale",
    "sau", "fara", "ca", "mai", "pentru", "kg", "gr", "g", "ml", "l", "buc",
    "portie", "portii",
}


def _normalize(text: str) -> str:
    """Strip diacritics, lowercase, remove stopwords."""
    # Strip diacritics
    nfkd = unicodedata.normalize("NFKD", text)
    without_diacritics = "".join(c for c in nfkd if not unicodedata.combining(c))
    # Lowercase + split on non-alpha
    import re
    words = re.split(r"[^a-z0-9]+", without_diacritics.lower())
    words = [w for w in words if w and w not in _STOPWORDS]
    return " ".join(words)


def _cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two embedding vectors."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


def match_products(
    a: list[dict],
    b: list[dict],
    threshold: float = 0.70,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Match products between list a and b by name similarity.

    Scoring strategy (per pair):
    - If both products have an 'embedding' list: hybrid score =
        0.40 * SequenceMatcher_ratio + 0.60 * cosine_similarity
    - Otherwise: pure SequenceMatcher_ratio

    Pairs whose score >= threshold are considered matched.

    Returns:
        matched_pairs  — list of dicts with keys: denumire_a, pret_a, unitate_a,
                         categorie_a, denumire_b, pret_b, unitate_b, categorie_b,
                         diff, score, score_seq, score_vec
        only_a         — unmatched items from a
        only_b         — unmatched items from b
    """
    norm_a = [_normalize(x["denumire"]) for x in a]
    norm_b = [_normalize(x["denumire"]) for x in b]

    matched_pairs: list[dict] = []
    used_b: set[int] = set()

    for i, item_a in enumerate(a):
        emb_a = item_a.get("embedding")
        best_score = 0.0
        best_seq = 0.0
        best_vec = 0.0
        best_j = -1

        for j, item_b in enumerate(b):
            if j in used_b:
                continue

            seq_score = SequenceMatcher(None, norm_a[i], norm_b[j]).ratio()

            emb_b = item_b.get("embedding")
            if emb_a and emb_b:
                vec_score = _cosine(emb_a, emb_b)
                score = 0.40 * seq_score + 0.60 * vec_score
            else:
                vec_score = 0.0
                score = seq_score

            if score > best_score:
                best_score = score
                best_seq = seq_score
                best_vec = vec_score
                best_j = j

        if best_j >= 0 and best_score >= threshold:
            item_b = b[best_j]
            pret_a = float(item_a.get("pret") or 0)
            pret_b = float(item_b.get("pret") or 0)
            matched_pairs.append({
                "denumire_a": item_a["denumire"],
                "pret_a": pret_a,
                "unitate_a": item_a.get("unitate") or "",
                "categorie_a": item_a.get("categorie") or "",
                "denumire_b": item_b["denumire"],
                "pret_b": pret_b,
                "unitate_b": item_b.get("unitate") or "",
                "categorie_b": item_b.get("categorie") or "",
                "diff": round(pret_a - pret_b, 2),
                "score": round(best_score, 3),
                "score_seq": round(best_seq, 3),
                "score_vec": round(best_vec, 3),
            })
            used_b.add(best_j)

    matched_a_denums = {p["denumire_a"] for p in matched_pairs}
    only_a = [x for x in a if x["denumire"] not in matched_a_denums]
    only_b = [b[j] for j in range(len(b)) if j not in used_b]

    # Sort matched by abs diff descending
    matched_pairs.sort(key=lambda x: abs(x["diff"]), reverse=True)

    return matched_pairs, only_a, only_b


# ─── Scrapers ─────────────────────────────────────────────────────────────────

async def scrape_margineni(url: str) -> list[dict]:
    """
    Scrape restaurantmargineni.ro — WooCommerce custom theme.

    Strategy:
    1. Load /meniu/ page and collect all /categorie-produs/... hrefs
    2. Visit each category page and extract products from .product_box cards
       - Name: <a> inside .product_box (first link text, or h2/h3 inside)
       - Price: text containing "lei" — "28,00 lei" → 28.0
       - Unitate: gramaj from product name e.g. "SALATA BULGAREASCA – 600g"
    3. Return flat list with categorie = URL slug converted to readable name
    """
    from playwright.async_api import async_playwright
    import re

    BASE = "https://restaurantmargineni.ro"

    def parse_price(raw: str) -> float | None:
        """Parse "28,00 lei" or "28.00" → 28.0"""
        raw = raw.replace("lei", "").strip()
        # Romanian decimal: comma is decimal separator, dot is thousands
        # "1.234,56" → 1234.56  |  "28,00" → 28.0
        if "," in raw and "." in raw:
            raw = raw.replace(".", "").replace(",", ".")
        elif "," in raw:
            raw = raw.replace(",", ".")
        nums = re.findall(r"\d+\.?\d*", raw)
        return float(nums[0]) if nums else None

    def slug_to_name(slug: str) -> str:
        """'/categorie-produs/salate-aperitiv/' → 'Salate Aperitiv'"""
        slug = slug.strip("/").split("/")[-1]
        return slug.replace("-", " ").title()

    results: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        try:
            # Step 1: collect all category links from /meniu/
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            hrefs: list[str] = await page.eval_on_selector_all(
                "a[href*='/categorie-produs/']",
                "els => [...new Set(els.map(e => e.href))]"
            )
            cat_links = [h for h in hrefs if "/categorie-produs/" in h]
            if not cat_links:
                print("[Competitori] margineni: no category links found on meniu page")
                cat_links = [url]

            print(f"[Competitori] margineni: found {len(cat_links)} categories")

            # Step 2: visit each category page and extract products
            for cat_url in cat_links:
                cat_name = slug_to_name(cat_url)
                try:
                    await page.goto(cat_url, timeout=25000, wait_until="domcontentloaded")

                    # Extract all product data in one JS call for speed
                    products_js: list[dict] = await page.evaluate("""
                        () => {
                            const results = [];
                            // Try .product_box containers first (custom theme)
                            let cards = document.querySelectorAll('.product_box, .product');
                            if (!cards.length) {
                                cards = document.querySelectorAll('li.type-product, .wc-block-grid__product');
                            }
                            cards.forEach(card => {
                                // Name: prefer h2/h3 text, fallback to first <a> text
                                const nameEl = card.querySelector('h2, h3, .woocommerce-loop-product__title, .wc-block-grid__product-title')
                                           || card.querySelector('a');
                                const name = nameEl ? nameEl.innerText.trim() : '';

                                // Price: find element containing "lei" or with class price/amount
                                let priceTxt = '';
                                const priceEl = card.querySelector('.price, .amount, bdi, [class*="price"]');
                                if (priceEl) {
                                    priceTxt = priceEl.innerText.trim();
                                } else {
                                    // fallback: any text node containing "lei"
                                    card.querySelectorAll('*').forEach(el => {
                                        if (!priceTxt && el.children.length === 0
                                            && (el.innerText||'').includes('lei')) {
                                            priceTxt = el.innerText.trim();
                                        }
                                    });
                                }
                                if (name) results.push({ name, priceTxt });
                            });
                            return results;
                        }
                    """)

                    for item in products_js:
                        raw_name = item.get("name", "").strip()
                        if not raw_name:
                            continue

                        # Split "SALATA BULGAREASCA – 600g" into name + unitate
                        unitate = ""
                        match = re.search(r"[–\-]\s*(\d+\s*[gGmMlLkK][gGlL]?\b.*)", raw_name)
                        if match:
                            unitate = match.group(1).strip()
                            raw_name = raw_name[:match.start()].strip(" –-").strip()

                        pret = parse_price(item.get("priceTxt", ""))
                        results.append({
                            "categorie": cat_name,
                            "denumire": raw_name.upper(),
                            "pret": pret,
                            "unitate": unitate,
                        })

                    print(f"[Competitori] margineni {cat_name}: {len(products_js)} products")

                except Exception as e:
                    print(f"[Competitori] margineni error on {cat_url}: {e}")

        except Exception as e:
            print(f"[Competitori] margineni main error: {e}")
            raise
        finally:
            await browser.close()

    print(f"[Competitori] margineni: TOTAL {len(results)} products")
    return results


async def scrape_lanuci(url: str) -> list[dict]:
    """
    Scrape lanuci.ro — Wix Thunderbolt / Online Ordering page.

    Strategy (multi-phase):
    1. Intercept Wix Catalog / Restaurants API XHR responses → full product list without DOM parsing.
    2. If API capture insufficient: incremental scroll + DOM extraction at each step
       so products removed by Wix virtual-rendering are still captured.
    3. Section heading tracked in DOM order (h2/h3 tags) for category assignment.
    """
    from playwright.async_api import async_playwright
    import re, json as _json

    def parse_price_ro(raw: str) -> float | None:
        """Parse '27,00 lei' or '27.00' → 27.0"""
        raw = raw.replace("lei", "").replace("\xa0", "").strip()
        if "," in raw and "." in raw:
            raw = raw.replace(".", "").replace(",", ".")
        elif "," in raw:
            raw = raw.replace(",", ".")
        nums = re.findall(r"\d+\.?\d*", raw)
        return float(nums[0]) if nums else None

    # Inline JS for DOM extraction — class-independent price-anchor strategy
    _JS_EXTRACT = r"""
    () => {
        const PRICE_RE = /\d+[,.]\d+\s*lei/;

        function countPrices(el) {
            return ((el.innerText||'').match(/\d+[,.]\d+\s*lei/g)||[]).length;
        }

        const cardSet = new Set();
        document.querySelectorAll('*').forEach(el => {
            if (el.children.length > 0) return;
            const t = (el.innerText||'').trim();
            if (!PRICE_RE.test(t) || t.length > 50) return;
            let card = el.parentElement;
            for (let i = 0; i < 15; i++) {
                if (!card || card === document.body) break;
                const ct = (card.innerText||'').trim();
                if (ct.length > 1500) break;
                const parent = card.parentElement;
                const pt = parent ? (parent.innerText||'').trim() : '';
                if (pt.length > 1500 || countPrices(parent) > 1) break;
                card = parent;
            }
            if (card && card !== document.body) cardSet.add(card);
        });

        const items = [];
        const seen = new Set();
        let section = '';

        const allEls = Array.from(document.querySelectorAll('h2, h3, div, p, section, article'));
        allEls.forEach(el => {
            if (el.tagName === 'H2' || el.tagName === 'H3') {
                const txt = (el.innerText||'').trim();
                if (txt && txt.length <= 100 && !PRICE_RE.test(txt))
                    section = txt.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
                return;
            }
            if (!cardSet.has(el)) return;
            const cardText = (el.innerText||'').trim();
            if (seen.has(cardText) || cardText.length < 3) return;
            seen.add(cardText);
            const lines = cardText.split('\n').map(l => l.trim()).filter(l => l);
            if (!lines.length) return;
            const name = lines[0];
            const pm = cardText.match(/\d+[,.]\d+\s*lei/g);
            if (!pm) return;
            const priceTxt = pm[pm.length - 1];
            const pi = lines.findIndex(l => PRICE_RE.test(l));
            const desc = pi > 1 ? lines.slice(1, pi).join(' ') : '';
            items.push({ name, priceTxt, desc, section });
        });
        return items;
    }
    """

    api_items: list[dict] = []   # products captured from Wix API XHRs
    dom_items: dict[str, dict] = {}  # products from DOM, keyed for dedup

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        # ── Phase 1: intercept Wix Catalog / Restaurants API responses ──────────
        async def on_response(response):
            try:
                r_url = response.url
                # Wix uses catalog.wixapis.com and wix.com/_api/wix-restaurants-*
                is_wix_api = any(x in r_url for x in [
                    "catalog.wixapis.com",
                    "wix-restaurants",
                    "restaurants/v",
                    "menusGroups",
                    "menu-items",
                    "online-ordering",
                    "getMenu",
                ])
                if not is_wix_api:
                    return
                if response.status != 200:
                    return
                ct = response.headers.get("content-type", "")
                if "json" not in ct:
                    return
                try:
                    data = await response.json()
                except Exception:
                    return

                # Dig into common Wix response shapes
                def extract_from(obj, depth=0):
                    if depth > 5:
                        return
                    if isinstance(obj, list) and len(obj) > 3:
                        # list of objects with name+price → looks like menu items
                        has_name = any(
                            isinstance(x, dict) and ("name" in x or "title" in x)
                            for x in obj[:5]
                        )
                        has_price = any(
                            isinstance(x, dict) and any(
                                k in str(x).lower() for k in ("price", "amount", "cost")
                            )
                            for x in obj[:5]
                        )
                        if has_name and has_price:
                            api_items.extend(obj)
                            return
                    if isinstance(obj, dict):
                        for v in obj.values():
                            extract_from(v, depth + 1)

                extract_from(data)
                if api_items:
                    print(f"[Competitori] lanuci API: captured {len(api_items)} items from {r_url[:80]}")
            except Exception:
                pass

        page.on("response", on_response)

        try:
            await page.goto(url, timeout=90000, wait_until="load")
            await asyncio.sleep(8)  # let Wix app bootstrap and fire catalog XHRs

            # ── Phase 2: incremental scroll + DOM extraction ─────────────────────
            # Small step size (300px) so lazy-loaded items enter viewport one by one.
            # We extract at each step — critical for pages with virtual scrolling
            # that unmounts out-of-viewport items.
            step = 300
            pos = 0
            no_new_rounds = 0

            while True:
                await page.evaluate(f"window.scrollTo(0, {pos})")
                await asyncio.sleep(0.7)

                height: int = await page.evaluate("document.documentElement.scrollHeight")

                # Extract whatever is currently in the DOM
                try:
                    batch = await page.evaluate(_JS_EXTRACT)
                    before = len(dom_items)
                    for item in batch:
                        key = f"{item.get('name','')}|{item.get('priceTxt','')}"
                        if key and key != "|":
                            dom_items[key] = item
                    if len(dom_items) > before:
                        no_new_rounds = 0
                    else:
                        no_new_rounds += 1
                except Exception as e:
                    print(f"[Competitori] lanuci: JS extract error at pos={pos}: {e}")

                if pos >= height:
                    # Give Wix one more cycle to load anything at the very bottom
                    await asyncio.sleep(2)
                    new_height: int = await page.evaluate("document.documentElement.scrollHeight")
                    if new_height == height:
                        break
                    height = new_height

                pos += step

                # Safety: if no new products for 30 consecutive steps (~9 000 px) → done
                if no_new_rounds >= 30 and pos > height:
                    break

            # Final full-page extract after all scrolling
            await asyncio.sleep(2)
            try:
                final_batch = await page.evaluate(_JS_EXTRACT)
                for item in final_batch:
                    key = f"{item.get('name','')}|{item.get('priceTxt','')}"
                    if key and key != "|":
                        dom_items[key] = item
            except Exception:
                pass

            print(f"[Competitori] lanuci: DOM collected {len(dom_items)} unique products, API captured {len(api_items)} items")

        except Exception as e:
            print(f"[Competitori] lanuci error: {e}")
            import traceback; traceback.print_exc()
            raise
        finally:
            await browser.close()

    # ── Phase 3: parse captured data ───────────────────────────────────────────
    results: list[dict] = []

    # Try API data first if substantial
    if len(api_items) >= 10:
        print(f"[Competitori] lanuci: using API data ({len(api_items)} raw items)")
        for item in api_items:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or item.get("title") or "").strip()
            if not name:
                continue
            # Price: look for price/amount/cost fields (possibly nested)
            pret = None
            for field in ("price", "priceAmount", "amount", "cost"):
                v = item.get(field)
                if v is not None:
                    try:
                        pret = float(str(v).replace(",", ".")) / 100  # Wix stores in agorot/bani
                        break
                    except Exception:
                        pass
            # If pret looks unreasonably small (< 1), multiply
            if pret is not None and pret < 1:
                pret = pret * 100
            categorie = (
                item.get("category") or item.get("sectionTitle") or
                item.get("categoryTitle") or item.get("section") or ""
            )
            desc = (item.get("description") or item.get("desc") or "")
            unitate = ""
            if desc:
                g_match = re.search(r"\((\d+\s*[gGmMlL][gGlL]?\b[^)]*)\)", desc)
                if g_match:
                    unitate = g_match.group(1)
            results.append({
                "categorie": str(categorie),
                "denumire": name.upper(),
                "pret": pret,
                "unitate": unitate,
            })

    # Fall back to DOM data (or augment if API gave partial results)
    dom_list = list(dom_items.values())
    print(f"[Competitori] lanuci: parsing DOM items ({len(dom_list)})")

    import re as _re
    for item in dom_list:
        raw_name = item.get("name", "").strip()
        if not raw_name:
            continue
        pret = parse_price_ro(item.get("priceTxt", ""))
        if pret is None:
            continue
        desc = item.get("desc", "")
        categorie = item.get("section", "") or ""
        categorie = _re.sub(r"[^\w\s\-&]", "", categorie, flags=_re.UNICODE).strip()

        unitate = ""
        g_match = _re.search(r"\((\d+\s*[gGmMlL][gGlL]?\b[^)]*)\)", desc)
        if g_match:
            unitate = g_match.group(1)

        # Dedup against API results (by normalised name)
        if results:
            norm_new = _normalize(raw_name)
            already = any(_normalize(r["denumire"]) == norm_new for r in results)
            if already:
                continue

        results.append({
            "categorie": categorie,
            "denumire": raw_name.upper(),
            "pret": pret,
            "unitate": unitate,
        })

    print(f"[Competitori] lanuci: TOTAL {len(results)} products")
    return results


async def scrape_lamama(url: str) -> list[dict]:
    """
    Scrape comenzi.lamama.ro — TapTasty/TastyIgniter SPA.

    Strategy 1 (primary): Direct httpx API calls to app.cdntaptasty.com.
      – GET /noauth/company-generals to find location_id
      – Try multiple menu endpoint + param combinations

    Strategy 2 (fallback): Playwright browser intercept.
      – Captures cdntaptasty API responses made by the app itself
      – Pre-seeds localStorage to dismiss cookie consent
      – MutationObserver auto-clicks any accept button
    """
    import httpx
    import json as _json
    import re as _re

    API      = "https://app.cdntaptasty.com"
    HOSTNAME = "comenzi.lamama.ro"
    COMPANY  = 197

    KNOWN_SECTIONS = ["Meniu Restaurant", "Oala cu Răsfăț", "Mama Bo", "DePost Vegan"]

    results: list[dict] = []
    seen: set[str] = set()

    def add_product(name, pret, categorie="", unitate=""):
        key = str(name).strip().upper()
        if not key or key in seen:
            return
        try:
            p = float(str(pret).replace(",", "."))
        except Exception:
            return
        if p <= 0:
            return
        seen.add(key)
        results.append({"categorie": categorie, "denumire": key, "pret": p, "unitate": unitate})

    def parse_price(v):
        if v is None:
            return None
        try:
            f = float(str(v).replace(",", "."))
            return f if f > 0 else None
        except Exception:
            return None

    def extract_items(data, cat=""):
        """Recursively extract products from any TastyIgniter/TapTasty shape."""
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                attrs = item.get("attributes") or item
                name = (attrs.get("menu_name") or attrs.get("name") or
                        attrs.get("title") or attrs.get("denumire") or "")
                pret = parse_price(
                    attrs.get("menu_price") or attrs.get("price") or
                    attrs.get("pret") or attrs.get("amount")
                )
                item_cat = (cat or attrs.get("category_name") or
                            attrs.get("category") or attrs.get("categorie") or "")
                unit = attrs.get("unit") or attrs.get("unitate") or ""
                if name and pret is not None:
                    add_product(name, pret, item_cat, unit)
                for sub_k in ("products", "menus", "items", "menu_items", "children"):
                    sub = attrs.get(sub_k)
                    if isinstance(sub, list) and sub:
                        extract_items(sub, item_cat or name)
        elif isinstance(data, dict):
            # TastyIgniter JSON:API with included
            included = data.get("included") or []
            menu_items = [x for x in included if x.get("type") == "menus"]
            cat_items  = [x for x in included if x.get("type") == "categories"]
            cat_by_id  = {}
            for ci in cat_items:
                a = ci.get("attributes") or {}
                cat_by_id[ci.get("id")] = a.get("name") or a.get("title") or ""
            for mi in menu_items:
                attrs = mi.get("attributes") or {}
                cat_ids = [
                    r.get("id")
                    for r in ((mi.get("relationships") or {}).get("categories", {}).get("data") or [])
                ]
                cname = next((cat_by_id.get(cid) for cid in cat_ids if cat_by_id.get(cid)), "")
                add_product(attrs.get("menu_name", ""),
                            parse_price(attrs.get("menu_price")), cname)
            # Nested keys
            for k in ("categories", "menu_top_categories", "sections",
                      "products", "menus", "items", "data"):
                v = data.get(k)
                if isinstance(v, list) and v:
                    extract_items(v, cat)
                elif isinstance(v, dict):
                    extract_items(v, cat)

    # ── Strategy 1: Direct HTTP API ───────────────────────────────────────────
    api_headers = {
        "User-Agent": "TapTasty/5.0 (Android; ro.lamama.comenzi)",
        "Accept": "application/json",
        "X-Requested-With": "ro.lamama.comenzi",
        "Origin": f"https://{HOSTNAME}",
        "Referer": f"https://{HOSTNAME}/",
    }

    location_id = None

    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=api_headers) as client:
        # Step 1a: company-generals → find location_id
        try:
            r = await client.get(f"{API}/noauth/company-generals",
                                 params={"hostname": HOSTNAME})
            generals = r.json()
            d = generals.get("data") or {}
            print(f"[LaMama] company-generals keys: {list(d.keys()) if isinstance(d, dict) else type(d)}")
            print(f"[LaMama] company-generals sample: {_json.dumps(d)[:1500]}")
            if isinstance(d, dict):
                for k in ("location_id", "default_location_id", "locationId", "location"):
                    if d.get(k):
                        location_id = d[k]
                        break
                if not location_id:
                    for loc_key in ("locations", "location", "branches"):
                        locs = d.get(loc_key)
                        if isinstance(locs, list) and locs:
                            loc0 = locs[0]
                            location_id = (loc0.get("location_id") or
                                           loc0.get("id") or loc0.get("slug"))
                            break
                # Extract from app_link: taptasty://company/197/location/TOKEN
                app_link = str(d.get("app_link") or d.get("appLink") or "")
                if "location/" in app_link and not location_id:
                    m = _re.search(r"location/([^/\s\"']+)", app_link)
                    if m:
                        location_id = m.group(1)
            print(f"[LaMama] location_id={location_id}")
        except Exception as e:
            print(f"[LaMama] company-generals error: {e}")

        # Step 1b: try locations endpoint if still not found
        if not location_id:
            for ep in [f"{API}/noauth/locations",
                       f"{API}/api/v2/locations",
                       f"{API}/noauth/company-locations"]:
                try:
                    r = await client.get(ep, params={"company_id": COMPANY})
                    if r.status_code == 200:
                        d = r.json()
                        print(f"[LaMama] {ep}: {_json.dumps(d)[:400]}")
                        locs = d.get("data") or d
                        if isinstance(locs, list) and locs:
                            location_id = (locs[0].get("location_id") or
                                           locs[0].get("id") or locs[0].get("slug"))
                            if location_id:
                                break
                except Exception as e:
                    print(f"[LaMama] {ep}: {e}")

        # Step 1c: Try menu endpoints with all param variations
        param_sets: list[dict] = []
        if location_id:
            param_sets += [
                {"company_id": COMPANY, "location": location_id},
                {"company_id": COMPANY, "location_id": location_id},
            ]
        param_sets.append({"company_id": COMPANY})

        menu_eps = [
            f"{API}/noauth/menu",
            f"{API}/noauth/menus",
            f"{API}/noauth/menu-categories",
            f"{API}/api/v2/menus",
            f"{API}/api/v2/categories",
        ]

        for ep in menu_eps:
            for params in param_sets:
                try:
                    r = await client.get(ep, params=params)
                    if r.status_code != 200:
                        continue
                    resp_json = r.json()
                    status = resp_json.get("status")
                    data   = resp_json.get("data") or resp_json
                    n = len(data) if isinstance(data, (list, dict)) else 0
                    print(f"[LaMama] {ep} {params}: status={status} len={n}")
                    if (isinstance(data, list) and len(data) > 0) or \
                       (isinstance(data, dict) and data):
                        extract_items(data)
                        if results:
                            break
                except Exception as e:
                    print(f"[LaMama] {ep} {params}: {e}")
            if results:
                break

    if results:
        print(f"[LaMama] API strategy: {len(results)} products")
        return results

    # ── Strategy 2: Playwright browser intercept ───────────────────────────────
    print("[LaMama] API strategy found 0 products — falling back to Playwright")
    from playwright.async_api import async_playwright

    captured: list[dict] = []

    async def on_response(response):
        try:
            if response.status != 200:
                return
            ct = response.headers.get("content-type", "")
            if "json" not in ct:
                return
            r_url = response.url
            # Skip analytics/tracking — but DO capture cdntaptasty API calls
            if any(x in r_url for x in ["analytics", "tracking", "google",
                                         "facebook", "firebase", "sentry"]):
                return
            data = await response.json()
            captured.append({"url": r_url, "data": data})
            print(f"[LaMama] PW captured: {r_url[:120]}")
        except Exception:
            pass

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Linux; Android 12; Pixel 6) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/112.0.0.0 Mobile Safari/537.36"
            ),
            viewport={"width": 390, "height": 844},
        )

        # Pre-seed localStorage + MutationObserver auto-clicker for consent dialogs
        await context.add_init_script("""
            const consentKeys = {
                cookies_accepted: 'true', cookie_consent: '1', gdpr_accepted: '1',
                cookieConsent: 'true', cookiesAccepted: 'true',
                consent_given: '1', privacy_accepted: 'true', terms_accepted: 'true'
            };
            for (const [k, v] of Object.entries(consentKeys)) {
                try { localStorage.setItem(k, v); } catch(e) {}
            }
            // Auto-click consent buttons as they appear
            const ACCEPT_TEXTS = ['accepta', 'accept', 'agree', 'ok', 'continua', 'da', 'yes'];
            const dismiss = () => {
                for (const el of document.querySelectorAll(
                        'button, a, ion-button, [role="button"], .btn')) {
                    const t = (el.textContent || '').toLowerCase().trim();
                    if (ACCEPT_TEXTS.some(tx => t === tx || t.startsWith(tx))) {
                        el.click();
                    }
                }
            };
            const obs = new MutationObserver(dismiss);
            obs.observe(document.documentElement, { childList: true, subtree: true });
        """)

        page = await context.new_page()
        page.on("response", on_response)

        try:
            await page.goto(url, timeout=60000, wait_until="domcontentloaded")
            await asyncio.sleep(4)

            # Extra dismiss attempt after initial load
            await page.evaluate("""
                const texts = ['accepta', 'accept', 'agree', 'ok', 'continua', 'da'];
                for (const el of document.querySelectorAll(
                        'button, a, ion-button, [role="button"]')) {
                    const t = (el.textContent || '').toLowerCase().trim();
                    if (texts.some(tx => t === tx || t.startsWith(tx))) {
                        el.click();
                    }
                }
            """)
            await asyncio.sleep(2)

            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                pass
            await asyncio.sleep(5)

            # Scroll through the menu to trigger lazy loading
            for _ in range(25):
                await page.evaluate("window.scrollBy(0, 500)")
                await asyncio.sleep(0.4)

            # Click category tabs / segment buttons
            clicked: set[str] = set()
            for sel in ["ion-tab-button", ".tab-button", "ion-segment-button",
                        "[class*='category']", "[class*='tab']"]:
                try:
                    tabs = await page.query_selector_all(sel)
                    for tab in tabs[:8]:
                        txt = (await tab.inner_text()).strip()
                        if txt and txt not in clicked:
                            clicked.add(txt)
                            await tab.click()
                            await asyncio.sleep(2.5)
                except Exception:
                    pass

            for section in KNOWN_SECTIONS:
                try:
                    el = page.get_by_text(section, exact=False)
                    if await el.count() > 0:
                        await el.first.click()
                        await asyncio.sleep(2.5)
                except Exception:
                    pass

            await asyncio.sleep(4)
            print(f"[LaMama] PW: {len(captured)} JSON responses captured")

        except Exception as e:
            print(f"[LaMama] PW error: {e}")
            import traceback; traceback.print_exc()
        finally:
            await browser.close()

    # Parse all captured responses
    for resp in captured:
        data  = resp["data"]
        r_url = resp["url"]
        print(f"[LaMama] parsing: {r_url[:100]}")
        extract_items(data)

    print(f"[LaMama] TOTAL {len(results)} products extracted")
    return results


def _parse_ocr_text(full_text: str) -> list[dict]:
    """
    Parsează textul OCR din meniul Ekko Lounge și returnează produse cu prețuri.

    Strategii detectare preț:
    1. Linie: "Denumire  45" sau "Denumire  45 lei"  (spații >= 2 înainte de număr)
    2. Două linii: denumire urmată de linie-cu-număr
    3. Preț inline: "Denumire 45 lei alte cuvinte"
    Titluri de secțiune: linii scurte fără cifre sau ALL-CAPS fără preț.
    """
    import re as _re

    PRICE_AT_END = _re.compile(
        r"^(.+?)\s{2,}(\d+(?:[.,]\d{1,2})?)\s*(?:lei|ron)?$",
        _re.IGNORECASE,
    )
    PRICE_ONLY   = _re.compile(r"^\d+(?:[.,]\d{1,2})?\s*(?:lei|ron)?$", _re.IGNORECASE)
    HAS_PRICE    = _re.compile(r"\b(\d+(?:[.,]\d{1,2})?)\s*lei\b", _re.IGNORECASE)
    NOISE        = _re.compile(r"^[^\w]+$")  # linii cu doar semne

    def parse_p(txt: str) -> float | None:
        txt = _re.sub(r"[^\d.,]", "", txt)
        if "," in txt and "." in txt:
            txt = txt.replace(".", "").replace(",", ".")
        elif "," in txt:
            txt = txt.replace(",", ".")
        try:
            v = float(txt)
            return v if 1 <= v <= 9999 else None
        except Exception:
            return None

    results: list[dict] = []
    seen: set[str] = set()

    # Caractere OCR-garbage la început de cuvânt
    JUNK_PREFIX = _re.compile(r'^[\s|„"\'""«»\-–—_.:,;!?()\[\]{}]+')
    # Nume valid: cel puțin 3 litere reale
    VALID_NAME  = _re.compile(r'[A-Za-zÀ-ÿĂăÂâÎîȘșȚț]{3,}')

    # Artefacte OCR la prefix: token-uri scurte (1-4 litere) + separatori, repetate
    OCR_PREFIX_GARBAGE = _re.compile(
        r'^(?:[A-ZĂÂÎȘȚ]{1,4}[\s|:()\[\].,_"„-]{1,5}){2,}',
        _re.UNICODE,
    )

    def clean_name(raw: str) -> str:
        # Elimină prefix junk simplu (|, „, ", etc.)
        cleaned = JUNK_PREFIX.sub("", raw)
        # Elimină artefacte OCR de tip chenar: "I : | SURE, UTA ", "EE ORE __ ", etc.
        cleaned = OCR_PREFIX_GARBAGE.sub("", cleaned)
        # Curăță | rămas inline
        cleaned = _re.sub(r'\s*\|\s*', ' ', cleaned)
        cleaned = _re.sub(r'\s{2,}', ' ', cleaned).strip(" |_-–—.,")
        return cleaned

    def add(name: str, pret: float, cat: str) -> None:
        cleaned = clean_name(name)
        key = cleaned.upper()
        # Respinge dacă nu are suficiente litere reale
        if not key or key in seen or not VALID_NAME.search(key):
            return
        seen.add(key)
        results.append({"categorie": cat, "denumire": key, "pret": round(pret, 2), "unitate": ""})

    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    current_cat = ""
    prev_name: str | None = None

    for ln in lines:
        if NOISE.match(ln):
            continue

        # Preț pe linie proprie după o denumire
        if prev_name and PRICE_ONLY.match(ln):
            p = parse_p(ln)
            if p:
                add(prev_name, p, current_cat)
                prev_name = None
                continue

        # Preț la final pe aceeași linie
        m = PRICE_AT_END.match(ln)
        if m:
            p = parse_p(m.group(2))
            if p:
                add(m.group(1), p, current_cat)
                prev_name = None
                continue

        # Preț inline "Denumire 45 lei ..."
        m2 = HAS_PRICE.search(ln)
        if m2:
            name_part = ln[:m2.start()].strip(" :-–")
            p = parse_p(m2.group(1))
            if name_part and p:
                add(name_part, p, current_cat)
                prev_name = None
                continue

        # Titlu secțiune: max 40 chars, fără cifre, cel puțin 3 litere reale
        if len(ln) <= 40 and not _re.search(r"\d", ln) and VALID_NAME.search(ln):
            # Curăță categoria de artefacte OCR
            cat_clean = _re.sub(r'[|_{}()\[\]]', '', ln).strip()
            if cat_clean:
                current_cat = cat_clean.title()
            prev_name = None
            continue

        # Candidat denumire pentru linia următoare
        prev_name = ln if len(ln) > 3 else None

    return results


async def _scrape_ekko_ocr(pdf_bytes: bytes) -> list[dict]:
    """OCR fallback: pdf2image → pytesseract → parsare text."""
    import io as _io
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ImportError as e:
        raise RuntimeError(f"[Ekko] OCR deps lipsă: {e}. Instalează pdf2image + pytesseract.")

    loop = asyncio.get_event_loop()

    def _ocr_sync() -> str:
        from PIL import Image, ImageEnhance, ImageFilter
        import io as _io

        pages = convert_from_bytes(pdf_bytes, dpi=350, fmt="jpeg")
        print(f"[Ekko] OCR: {len(pages)} pagini detectate")
        texts: list[str] = []
        for i, img in enumerate(pages):
            # Preprocesare: grayscale + contrast mărit
            gray = img.convert("L")
            enhanced = ImageEnhance.Contrast(gray).enhance(1.5)
            # PSM 4 = single column, variable text sizes (bun pentru meniuri)
            txt = pytesseract.image_to_string(
                enhanced, lang="ron+eng",
                config="--psm 4 --oem 3",
            )
            texts.append(txt)
            print(f"[Ekko] OCR pagina {i+1}: {len(txt)} chars")
        return "\n".join(texts)

    full_text = await loop.run_in_executor(None, _ocr_sync)
    print(f"[Ekko] OCR total text: {len(full_text)} chars")

    if len(full_text.strip()) < 20:
        raise RuntimeError("[Ekko] OCR a returnat text insuficient. Verifică calitatea PDF-ului.")

    results = _parse_ocr_text(full_text)
    print(f"[Ekko] OCR TOTAL {len(results)} produse extrase")
    return results


async def scrape_ekko(url: str) -> list[dict]:
    """
    Scrape meniu Ekko Lounge dintr-un PDF static (dish.co CDN).

    Strategy 1 (primary): pdfplumber — extrage text embedded din PDF.
      – Detectează rânduri cu preț (RON sau număr) și asociază denumirea.
      – Titlurile de secțiune sunt linii fără preț ce conțin CAPS sau text scurt.

    Strategy 2 (fallback): loghează eroare clară dacă PDF-ul e image-based.
    """
    import re
    import io
    import httpx

    def parse_price_ekko(txt: str) -> float | None:
        """'28 lei', '28,00', '28.00', '28' → 28.0"""
        txt = txt.replace("lei", "").replace("ron", "").replace("RON", "").strip()
        if "," in txt and "." in txt:
            txt = txt.replace(".", "").replace(",", ".")
        elif "," in txt:
            txt = txt.replace(",", ".")
        nums = re.findall(r"^\d+\.?\d*$", txt.strip())
        return float(nums[0]) if nums else None

    # Regex: linie cu preț la final  →  "Denumire produs  45"  sau  "Denumire  45 lei"
    PRICE_AT_END = re.compile(
        r"^(.+?)\s{2,}(\d+(?:[.,]\d{1,2})?)\s*(?:lei|ron)?$",
        re.IGNORECASE,
    )
    # Sau o linie care e doar un număr (preț pe linie proprie)
    PRICE_ONLY = re.compile(r"^\d+(?:[.,]\d{1,2})?\s*(?:lei|ron)?$", re.IGNORECASE)
    # Linie care conține un preț undeva
    HAS_PRICE  = re.compile(r"\b(\d+(?:[.,]\d{1,2})?)\s*(?:lei|ron)\b", re.IGNORECASE)

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            pdf_bytes = resp.content
        print(f"[Ekko] PDF downloaded: {len(pdf_bytes)} bytes")
    except Exception as e:
        raise RuntimeError(f"[Ekko] Nu am putut descărca PDF-ul: {e}")

    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("[Ekko] pdfplumber nu este instalat (pip install pdfplumber)")

    results: list[dict] = []
    seen: set[str] = set()

    def add_product(name: str, pret: float, categorie: str) -> None:
        key = name.strip().upper()
        if not key or key in seen or len(key) < 3:
            return
        seen.add(key)
        results.append({
            "categorie": categorie,
            "denumire": key,
            "pret": round(pret, 2),
            "unitate": "",
        })

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        total_chars = 0
        all_lines: list[str] = []

        for page in pdf.pages:
            # ── Încearcă extragere din tabele ──────────────────────────────
            tables = page.extract_tables()
            for table in tables:
                for row in (table or []):
                    row = [str(c or "").strip() for c in row]
                    # Caută coloană cu preț și coloană cu denumire
                    pret_col = -1
                    for ci, cell in enumerate(row):
                        if PRICE_ONLY.match(cell) or (HAS_PRICE.search(cell) and len(cell) < 15):
                            pret_col = ci
                            break
                    if pret_col >= 0:
                        name_cell = " ".join(
                            row[ci] for ci in range(len(row))
                            if ci != pret_col and row[ci]
                        ).strip()
                        p_str = re.sub(r"[^\d.,]", "", row[pret_col])
                        p = parse_price_ekko(p_str)
                        if name_cell and p:
                            add_product(name_cell, p, "")

            # ── Extragere text simplu ──────────────────────────────────────
            text = page.extract_text() or ""
            total_chars += len(text)
            for ln in text.splitlines():
                ln = ln.strip()
                if ln:
                    all_lines.append(ln)

        if total_chars < 50:
            print("[Ekko] Strategy 1 eșuat (PDF image-based). Încerc Strategy 2 (OCR)...")
            return await _scrape_ekko_ocr(pdf_bytes)

        # ── Parsare text linie cu linie ────────────────────────────────────
        current_cat = ""
        prev_name: str | None = None

        for ln in all_lines:
            # Detectează secțiune: linie scurtă fără preț sau CAPS
            if len(ln) <= 40 and not re.search(r"\d", ln):
                current_cat = ln.title()
                prev_name = None
                continue

            # Preț pe linie proprie (imediat după denumire)
            if prev_name and PRICE_ONLY.match(ln):
                p = parse_price_ekko(ln)
                if p:
                    add_product(prev_name, p, current_cat)
                    prev_name = None
                continue

            # Preț la finalul liniei: "Denumire  45" sau "Denumire  45 lei"
            m = PRICE_AT_END.match(ln)
            if m:
                p = parse_price_ekko(m.group(2))
                if p:
                    add_product(m.group(1), p, current_cat)
                    prev_name = None
                    continue

            # Preț inline: "Denumire 45 lei restul"
            m2 = HAS_PRICE.search(ln)
            if m2:
                name_part = ln[:m2.start()].strip(" :-–")
                p = parse_price_ekko(m2.group(1))
                if name_part and p:
                    add_product(name_part, p, current_cat)
                    prev_name = None
                    continue

            # Linie fără preț → candidat denumire pentru linia următoare
            if len(ln) > 3:
                prev_name = ln
            else:
                prev_name = None

    print(f"[Ekko] TOTAL {len(results)} produse extrase din PDF")
    return results


# ─── Scraper registry ─────────────────────────────────────────────────────────

_SCRAPERS: dict[str, Callable] = {
    "margineni": scrape_margineni,
    "lanuci": scrape_lanuci,
    "lamama": scrape_lamama,
    "ekko": scrape_ekko,
}


async def run_scraper(key: str, url: str) -> list[dict]:
    fn = _SCRAPERS.get(key)
    if not fn:
        raise ValueError(f"Scraper '{key}' neimplementat")
    return await fn(url)


# ─── Internal scrape + save ───────────────────────────────────────────────────

async def _generate_embeddings_for_products(products: list[dict]) -> None:
    """
    Add 'embedding' key to each product dict in-place by calling Ollama.
    Batches of 10 concurrent requests; silently skips on error.
    """
    from app.services.ai_service import ai_service
    from app.core.database import AsyncSessionLocal as _ASL

    # Refresh AI settings from DB so we use the correct host/model
    try:
        async with _ASL() as _s:
            await ai_service.update_settings(_s)
    except Exception:
        pass

    BATCH = 10
    for i in range(0, len(products), BATCH):
        batch = products[i : i + BATCH]
        embeddings = await asyncio.gather(
            *[ai_service.generate_embedding_async(p["denumire"]) for p in batch],
            return_exceptions=True,
        )
        for p, emb in zip(batch, embeddings):
            if isinstance(emb, list) and emb:
                p["embedding"] = emb


async def _do_scrape_site(site_id: int) -> dict:
    """Scrape one site, generate embeddings, save products, detect price changes."""
    async with AsyncSessionLocal() as session:
        site = await session.get(CompetitorSite, site_id)
        if not site:
            return {"error": "Site negăsit"}

        try:
            products = await run_scraper(site.scraper_key, site.url)
        except Exception as e:
            async with AsyncSessionLocal() as s2:
                s2_site = await s2.get(CompetitorSite, site_id)
                if s2_site:
                    s2_site.scrape_error = str(e)[:500]
                    await s2.commit()
            return {"error": str(e)}

    # Generate Ollama embeddings for all scraped product names
    try:
        await _generate_embeddings_for_products(products)
        embedded = sum(1 for p in products if p.get("embedding"))
        print(f"[Competitori] site {site_id}: embedded {embedded}/{len(products)} products")
    except Exception as e:
        print(f"[Competitori] site {site_id}: embedding error (non-fatal): {e}")

    # Detect price changes by comparing with existing products
    async with AsyncSessionLocal() as session:
        old_rows = (await session.execute(
            select(CompetitorProduct).where(CompetitorProduct.site_id == site_id)
        )).scalars().all()
        old_by_name = {r.denumire: r.pret for r in old_rows}

        changes = []
        for p in products:
            old_pret = old_by_name.get(p["denumire"])
            new_pret = Decimal(str(p["pret"])) if p.get("pret") is not None else None
            if old_pret is not None and new_pret is not None and old_pret != new_pret:
                changes.append(CompetitorPriceChange(
                    site_id=site_id,
                    denumire=p["denumire"],
                    pret_vechi=old_pret,
                    pret_nou=new_pret,
                ))

        # Replace all products for this site
        await session.execute(sql_delete(CompetitorProduct).where(CompetitorProduct.site_id == site_id))
        for p in products:
            session.add(CompetitorProduct(
                site_id=site_id,
                categorie=p.get("categorie") or None,
                denumire=p["denumire"],
                pret=Decimal(str(p["pret"])) if p.get("pret") is not None else None,
                unitate=p.get("unitate") or None,
                extra=p.get("extra") or None,
                embedding=p.get("embedding") or None,
            ))
        for c in changes:
            session.add(c)

        site = await session.get(CompetitorSite, site_id)
        if site:
            site.last_scraped_at = datetime.now()
            site.scrape_error = None

        await session.commit()

    return {
        "site_id": site_id,
        "products": len(products),
        "changes": len(changes),
        "embedded": sum(1 for p in products if p.get("embedding")),
    }


# ─── REST endpoints ───────────────────────────────────────────────────────────

@router.get("/competitori/sites")
async def list_sites(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func as sql_func
    rows = (await db.execute(
        select(CompetitorSite).order_by(CompetitorSite.id)
    )).scalars().all()

    # Count products per site in one query
    counts_q = await db.execute(
        select(
            CompetitorProduct.site_id,
            sql_func.count(CompetitorProduct.id).label("cnt"),
        ).group_by(CompetitorProduct.site_id)
    )
    product_counts = {r.site_id: r.cnt for r in counts_q}

    return [
        {
            "id": s.id,
            "nume": s.nume,
            "url": s.url,
            "scraper_key": s.scraper_key,
            "activ": s.activ,
            "last_scraped_at": s.last_scraped_at.isoformat() if s.last_scraped_at else None,
            "scrape_error": s.scrape_error,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "product_count": product_counts.get(s.id, 0),
        }
        for s in rows
    ]


@router.post("/competitori/sites", status_code=201)
async def add_site(
    body: dict,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    site = CompetitorSite(
        nume=body.get("nume", ""),
        url=body.get("url", ""),
        scraper_key=body.get("scraper_key", ""),
        activ=body.get("activ", True),
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return {"id": site.id, "message": "Site adăugat"}


@router.put("/competitori/sites/{site_id}")
async def update_site(
    site_id: int,
    body: dict,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(CompetitorSite, site_id)
    if not site:
        raise HTTPException(404, "Site negăsit")
    for field in ("nume", "url", "scraper_key", "activ"):
        if field in body:
            setattr(site, field, body[field])
    await db.commit()
    return {"message": "Site actualizat"}


@router.delete("/competitori/sites/{site_id}")
async def delete_site(
    site_id: int,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(CompetitorSite, site_id)
    if not site:
        raise HTTPException(404, "Site negăsit")
    await db.delete(site)
    await db.commit()
    return {"message": "Site șters"}


@router.post("/competitori/sites/{site_id}/scrape")
async def scrape_site(
    site_id: int,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    site = await db.get(CompetitorSite, site_id)
    if not site:
        raise HTTPException(404, "Site negăsit")
    if site.scraper_key not in _SCRAPERS:
        raise HTTPException(400, f"Scraper '{site.scraper_key}' neimplementat")

    result = await _do_scrape_site(site_id)
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


@router.post("/competitori/sites/{site_id}/embed")
async def embed_site_products(
    site_id: int,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    (Re)generate Ollama embeddings for all products of a site.
    Useful when Ollama wasn't available during scrape, or after changing the model.
    """
    prods = (await db.execute(
        select(CompetitorProduct).where(CompetitorProduct.site_id == site_id)
    )).scalars().all()

    if not prods:
        raise HTTPException(404, "Niciun produs găsit pentru acest site. Faceți scrape mai întâi.")

    # Build list of dicts for the helper (it mutates them in-place)
    prod_dicts = [{"denumire": p.denumire} for p in prods]
    await _generate_embeddings_for_products(prod_dicts)

    done = 0
    for p, d in zip(prods, prod_dicts):
        emb = d.get("embedding")
        if emb:
            p.embedding = emb
            done += 1

    await db.commit()
    return {"total": len(prods), "embedded": done, "errors": len(prods) - done}


@router.get("/competitori/scrapers")
async def list_scrapers(current_user=Depends(require_admin)):
    return {"scrapers": list(_SCRAPERS.keys())}


@router.get("/competitori/compare")
async def compare(
    current_user=Depends(require_sef),
    db: AsyncSession = Depends(get_db),
    site_a: Optional[int] = None,
    site_b: Optional[int] = None,
    threshold: float = 0.70,
):
    """Return matched pairs + unmatched for all active sites (or specified pair)."""
    sites_rows = (await db.execute(
        select(CompetitorSite).where(CompetitorSite.activ == True).order_by(CompetitorSite.id)
    )).scalars().all()

    if not sites_rows:
        return {"sites": [], "matched": [], "only": {}, "total_matched": 0, "last_scraped": {}}

    # Load products for each site
    site_products: dict[int, list[dict]] = {}
    for site in sites_rows:
        prods = (await db.execute(
            select(CompetitorProduct).where(CompetitorProduct.site_id == site.id)
        )).scalars().all()
        site_products[site.id] = [
            {
                "denumire": p.denumire,
                "pret": float(p.pret) if p.pret is not None else None,
                "unitate": p.unitate or "",
                "categorie": p.categorie or "",
                "embedding": p.embedding,  # list[float] or None — used by match_products
            }
            for p in prods
        ]

    # Compare first two active sites (or specified pair)
    ids = [s.id for s in sites_rows]
    if len(ids) < 2:
        id_a = ids[0]
        products_a = site_products[id_a]
        return {
            "sites": [
                {"id": s.id, "nume": s.nume, "last_scraped_at": s.last_scraped_at.isoformat() if s.last_scraped_at else None}
                for s in sites_rows
            ],
            "matched": [],
            "only": {str(id_a): products_a},
            "total_matched": 0,
            "last_scraped": {str(id_a): sites_rows[0].last_scraped_at.isoformat() if sites_rows[0].last_scraped_at else None},
        }

    id_a = site_a if site_a and site_a in site_products else ids[0]
    id_b = site_b if site_b and site_b in site_products else ids[1]

    matched, only_a, only_b = match_products(
        site_products.get(id_a, []),
        site_products.get(id_b, []),
        threshold=threshold,
    )

    return {
        "sites": [
            {
                "id": s.id,
                "nume": s.nume,
                "last_scraped_at": s.last_scraped_at.isoformat() if s.last_scraped_at else None,
                "scrape_error": s.scrape_error,
            }
            for s in sites_rows
        ],
        "site_a_id": id_a,
        "site_b_id": id_b,
        "matched": matched,
        "only": {
            str(id_a): [{k: v for k, v in x.items() if k != "embedding"} for x in only_a],
            str(id_b): [{k: v for k, v in x.items() if k != "embedding"} for x in only_b],
        },
        "total_matched": len(matched),
        "last_scraped": {
            str(s.id): s.last_scraped_at.isoformat() if s.last_scraped_at else None
            for s in sites_rows
        },
    }


@router.get("/competitori/summarize")
async def summarize_comparison(
    current_user=Depends(require_sef),
    db: AsyncSession = Depends(get_db),
    site_a: Optional[int] = None,
    site_b: Optional[int] = None,
    threshold: float = 0.70,
):
    """
    Generate an AI (Ollama) strategic summary of the price comparison.
    Builds a structured prompt from matched/unmatched products and sends it
    to the configured chat model.
    """
    import httpx
    from app.services.ai_service import ai_service
    from app.models.models import Setting

    await ai_service.update_settings(db)

    # ── load sites ────────────────────────────────────────────────────────────
    sites_rows = (await db.execute(
        select(CompetitorSite).where(CompetitorSite.activ == True).order_by(CompetitorSite.id)
    )).scalars().all()

    if not sites_rows or len(sites_rows) < 2:
        raise HTTPException(400, "Sunt necesare cel puțin 2 site-uri active cu produse scrape-uite.")

    ids = [s.id for s in sites_rows]
    id_a = site_a if site_a in ids else ids[0]
    id_b = site_b if site_b in ids else ids[1]
    name_a = next(s.nume for s in sites_rows if s.id == id_a)
    name_b = next(s.nume for s in sites_rows if s.id == id_b)

    # ── load products ─────────────────────────────────────────────────────────
    def _load(sid):
        return []  # placeholder replaced below

    async def load_prods(sid):
        rows = (await db.execute(
            select(CompetitorProduct).where(CompetitorProduct.site_id == sid)
        )).scalars().all()
        return [
            {
                "denumire": p.denumire,
                "pret": float(p.pret) if p.pret is not None else None,
                "categorie": p.categorie or "",
                "unitate": p.unitate or "",
                "embedding": p.embedding,
            }
            for p in rows
        ]

    list_a, list_b = await asyncio.gather(load_prods(id_a), load_prods(id_b))

    if not list_a or not list_b:
        raise HTTPException(400, "Unul dintre site-uri nu are produse. Faceți scrape mai întâi.")

    # ── compare ───────────────────────────────────────────────────────────────
    matched, only_a, only_b = match_products(list_a, list_b, threshold=threshold)

    more_exp = [m for m in matched if m["diff"] > 0]   # we (A) are more expensive
    cheaper  = [m for m in matched if m["diff"] < 0]   # we (A) are cheaper
    same     = [m for m in matched if m["diff"] == 0]

    uses_vectors = any(m.get("score_vec", 0) > 0 for m in matched)

    # ── build prompt ──────────────────────────────────────────────────────────
    lines: list[str] = [
        f"DATE COMPARAȚIE PREȚURI: {name_a} vs {name_b}",
        "",
        "SUMAR:",
        f"  Produse comune identificate: {len(matched)}",
        f"  Produse unde {name_a} este mai scump: {len(more_exp)}",
        f"  Produse unde {name_a} este mai ieftin: {len(cheaper)}",
        f"  Produse cu prețuri identice: {len(same)}",
        f"  Produse exclusive {name_a}: {len(only_a)}",
        f"  Produse exclusive {name_b}: {len(only_b)}",
        "",
    ]

    top_exp = sorted(more_exp, key=lambda x: x["diff"], reverse=True)[:20]
    if top_exp:
        lines.append(f"PRODUSE UNDE {name_a.upper()} ESTE MAI SCUMP (top {len(top_exp)}, ordonate descrescător):")
        for m in top_exp:
            lines.append(
                f"  {m['denumire_a']}: {name_a} {m['pret_a']:.2f} lei  |  "
                f"{name_b} {m['pret_b']:.2f} lei  |  diferență +{m['diff']:.2f} lei"
            )
        lines.append("")

    top_cheap = sorted(cheaper, key=lambda x: x["diff"])[:20]
    if top_cheap:
        lines.append(f"PRODUSE UNDE {name_a.upper()} ESTE MAI IEFTIN (top {len(top_cheap)}, ordonate crescător):")
        for m in top_cheap:
            lines.append(
                f"  {m['denumire_a']}: {name_a} {m['pret_a']:.2f} lei  |  "
                f"{name_b} {m['pret_b']:.2f} lei  |  diferență {m['diff']:.2f} lei"
            )
        lines.append("")

    excl_b = sorted(only_b, key=lambda x: x.get("pret") or 0, reverse=True)[:15]
    if excl_b:
        lines.append(f"PRODUSE EXCLUSIVE {name_b.upper()} (lipsesc la {name_a}, ordonate după preț):")
        for p in excl_b:
            pret_str = f"{p['pret']:.2f} lei" if p.get("pret") is not None else "preț necunoscut"
            cat_str = f" [{p['categorie']}]" if p.get("categorie") else ""
            lines.append(f"  {p['denumire']}{cat_str}: {pret_str}")
        lines.append("")

    excl_a = sorted(only_a, key=lambda x: x.get("pret") or 0, reverse=True)[:15]
    if excl_a:
        lines.append(f"PRODUSE EXCLUSIVE {name_a.upper()} (lipsesc la {name_b}, ordonate după preț):")
        for p in excl_a:
            pret_str = f"{p['pret']:.2f} lei" if p.get("pret") is not None else "preț necunoscut"
            cat_str = f" [{p['categorie']}]" if p.get("categorie") else ""
            lines.append(f"  {p['denumire']}{cat_str}: {pret_str}")
        lines.append("")

    data_text = "\n".join(lines)

    system_prompt = (
        "Ești un analist obiectiv de prețuri în industria restaurantelor din România. "
        "Primești date reale de comparație prețuri între două restaurante și faci o analiză clară, corectă și echilibrată. "
        "Reguli stricte:\n"
        "- Folosește întotdeauna numele exacte ale restaurantelor din date, nu 'noi' sau 'competitor'.\n"
        "- Fii obiectiv — nu ești angajatul niciunuia dintre restaurante.\n"
        "- Răspunde în română.\n"
        "- Structurează răspunsul cu secțiuni clare.\n"
        "- Fii explicit cu cifrele: menționează prețurile concrete când e relevant.\n"
        "- Nu inventa date care nu există în input."
    )

    user_prompt = (
        f"{data_text}\n"
        f"Analizează obiectiv aceste date și structurează răspunsul în 4 secțiuni:\n\n"
        f"1. POZIȚIE GENERALĂ — cum se compară {name_a} față de {name_b} ca nivel general de prețuri\n"
        f"2. UNDE PIERDE {name_a.upper()} — produsele cu cea mai mare diferență negativă față de {name_b}, cu prețurile exacte\n"
        f"3. UNDE CÂȘTIGĂ {name_a.upper()} — produsele unde {name_a} are prețuri mai competitive sau ofertă exclusivă\n"
        f"4. RECOMANDĂRI — câte 2-3 recomandări concrete pentru fiecare restaurant (ce ar putea face {name_a} și ce ar putea face {name_b})\n"
    )

    # ── call Ollama ───────────────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{ai_service._host}/api/chat",
                json={
                    "model": ai_service._chat_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_prompt},
                    ],
                    "stream": False,
                },
            )
            if resp.status_code != 200:
                raise HTTPException(502, f"Ollama a returnat {resp.status_code}: {resp.text[:200]}")
            summary = resp.json().get("message", {}).get("content", "")
    except httpx.TimeoutException:
        raise HTTPException(504, "Ollama a depășit timpul de răspuns (180s). Verificați că modelul este pornit.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Eroare comunicare Ollama: {e}")

    return {
        "summary": summary,
        "uses_vectors": uses_vectors,
        "stats": {
            "name_a": name_a,
            "name_b": name_b,
            "matched": len(matched),
            "more_expensive": len(more_exp),
            "cheaper": len(cheaper),
            "same": len(same),
            "only_a": len(only_a),
            "only_b": len(only_b),
        },
    }


@router.get("/competitori/price-changes")
async def price_changes(
    limit: int = 100,
    site_id: Optional[int] = None,
    current_user=Depends(require_sef),
    db: AsyncSession = Depends(get_db),
):
    q = select(CompetitorPriceChange, CompetitorSite.nume).join(
        CompetitorSite, CompetitorPriceChange.site_id == CompetitorSite.id
    ).order_by(CompetitorPriceChange.changed_at.desc()).limit(limit)
    if site_id:
        q = q.where(CompetitorPriceChange.site_id == site_id)

    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.CompetitorPriceChange.id,
            "site_id": r.CompetitorPriceChange.site_id,
            "site_nume": r.nume,
            "denumire": r.CompetitorPriceChange.denumire,
            "pret_vechi": float(r.CompetitorPriceChange.pret_vechi) if r.CompetitorPriceChange.pret_vechi is not None else None,
            "pret_nou": float(r.CompetitorPriceChange.pret_nou) if r.CompetitorPriceChange.pret_nou is not None else None,
            "changed_at": r.CompetitorPriceChange.changed_at.isoformat(),
        }
        for r in rows
    ]


# ─── Background scrape loop (called from main.py lifespan) ───────────────────

COMPETITOR_SCRAPE_WEEKDAY = 0   # 0 = luni (Monday)
COMPETITOR_SCRAPE_HOUR    = 3   # 03:00


async def competitor_scrape_loop():
    """Background task: scrape all active competitor sites once a week (Monday 03:00)."""
    from datetime import time, timedelta

    while True:
        try:
            now = datetime.now()

            # Calculate next Monday 03:00
            days_ahead = COMPETITOR_SCRAPE_WEEKDAY - now.weekday()  # 0=Mon
            if days_ahead < 0:
                days_ahead += 7
            elif days_ahead == 0 and now.hour >= COMPETITOR_SCRAPE_HOUR:
                days_ahead = 7  # today is Monday but past 03:00 → next Monday

            target = datetime.combine(
                now.date() + timedelta(days=days_ahead),
                time(COMPETITOR_SCRAPE_HOUR, 0),
            )
            wait_secs = (target - now).total_seconds()
            print(f"[Competitori] next scrape at {target} (in {wait_secs/3600:.1f}h)")
            await asyncio.sleep(wait_secs)

            print("[Competitori] Starting weekly scrape...")
            async with AsyncSessionLocal() as session:
                sites = (await session.execute(
                    select(CompetitorSite).where(CompetitorSite.activ == True)
                )).scalars().all()

            for site in sites:
                try:
                    print(f"[Competitori] Scraping site {site.id} ({site.scraper_key})...")
                    result = await _do_scrape_site(site.id)
                    print(f"[Competitori] Site {site.id} done: {result}")
                except Exception as e:
                    print(f"[Competitori] Site {site.id} error: {e}")

            print("[Competitori] Weekly scrape complete")

        except asyncio.CancelledError:
            print("[Competitori] scrape loop stopped")
            return
        except Exception as e:
            print(f"[Competitori] scrape loop error: {e}")
            await asyncio.sleep(3600)
