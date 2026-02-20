import json
import csv
import time
from pathlib import Path

import requests

STATE_FILE = "state.json"


def load_config(path="config.json"):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_state(path=STATE_FILE):
    if not Path(path).exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state, path=STATE_FILE):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def fetch_reviews_page(url, api_key, retries=3, delay=5):
    separator = "&" if "?" in url else "?"
    if "api_key=" not in url:
        url = f"{url}{separator}api_key={api_key}"

    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            else:
                print(f"[Attempt {attempt}] HTTP {resp.status_code} for URL: {url}")
        except requests.exceptions.RequestException as e:
            print(f"[Attempt {attempt}] Request error: {e}")

        if attempt < retries:
            print(f"Waiting {delay} seconds before retry...")
            time.sleep(delay)

    return {"error": f"Failed after {retries} attempts"}


def main():
    config = load_config()
    api_key = config["api_key"]
    data_id = config["data_id"]
    hl = config.get("hl", "en")
    max_pages = int(config.get("max_pages", 1))
    output_prefix = config.get("output_prefix", "reviews")
    start_from_last_state = bool(config.get("start_from_last_state", False))

    state = load_state()

    # decidem de unde începem
    if start_from_last_state and "last_next_url" in state:
        current_url = state["last_next_url"]
        print("Starting from last_next_url in state.json")
    else:
        current_url = (
            "https://serpapi.com/search.json"
            f"?engine=google_maps_reviews&data_id={data_id}&hl={hl}&sort_by=newestFirst"
        )
        print("Starting from base_url (page 1)")

    all_reviews = []
    all_pages = []          # <--- NEW: list of full responses
    last_next_url = None

    for page in range(max_pages):
        print(f"=== Page {page + 1} ===")
        data = fetch_reviews_page(current_url, api_key)

        if "error" in data:
            print(data["error"])
            break

        # păstrăm tot JSON-ul pentru pagina asta
        all_pages.append(data)   # <--- NEW

        reviews = data.get("reviews", [])
        print(f"Found {len(reviews)} reviews on this page")
        all_reviews.extend(reviews)

        pagination = data.get("serpapi_pagination", {})
        next_url = pagination.get("next")
        last_next_url = next_url

        if not next_url:
            print("No more pages.")
            break

        current_url = next_url

    print(f"Total reviews collected in this run: {len(all_reviews)}")

    # salvăm ultimul next în state.json
    if last_next_url:
        state["last_next_url"] = last_next_url
        save_state(state)
        print(f"Saved last_next_url to {STATE_FILE}")
    else:
        print("No next URL to save in state.json")

    if not all_reviews:
        print("No reviews to save.")
        return

    # ---------- 1) full JSON pentru toate paginile ----------
    full_json_path = Path(f"{output_prefix}_full.json")
    with full_json_path.open("w", encoding="utf-8") as f:
        json.dump(all_pages, f, ensure_ascii=False, indent=2)
    print(f"Saved full API responses to: {full_json_path}")

    # ---------- 2) doar lista de reviews (cum aveai înainte) ----------
    json_path = Path(f"{output_prefix}.json")
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(all_reviews, f, ensure_ascii=False, indent=2)
    print(f"Saved reviews JSON to: {json_path}")

    # ---------- CSV ----------
    csv_path = Path(f"{output_prefix}.csv")

    fieldnames = [
        "review_id",
        "rating",
        "snippet",
        "description",
        "iso_date_of_last_edit",
        "date",
        "user_name",
        "likes",
        "link",
    ]

    rows = []
    for r in all_reviews:
        user = r.get("user", {}) if isinstance(r.get("user"), dict) else {}
        rows.append({
            "review_id": r.get("review_id"),
            "rating": r.get("rating"),
            "snippet": r.get("snippet"),
            "description": r.get("description"),
            "iso_date_of_last_edit": r.get("iso_date_of_last_edit"),
            "date": r.get("date"),
            "user_name": user.get("name"),
            "likes": r.get("likes"),
            "link": r.get("link"),
        })

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved CSV to: {csv_path}")


if __name__ == "__main__":
    main()
