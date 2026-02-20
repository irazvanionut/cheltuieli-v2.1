import json
import csv
from pathlib import Path
import requests


CONFIG_FILE = "config.json"
OUTPUT_JSON = "reviews_output.json"
OUTPUT_CSV = "reviews_output.csv"


def load_config(path=CONFIG_FILE):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_existing_reviews(path=OUTPUT_JSON):
    if not Path(path).exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_page(url, api_key):
    sep = "&" if "?" in url else "?"
    if "api_key=" not in url:
        url = f"{url}{sep}api_key={api_key}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return r.json()


def save_all(reviews, prefix="reviews_output"):
    json_path = Path(f"{prefix}.json")
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)

    csv_path = Path(f"{prefix}.csv")
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
    for r in reviews:
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

    print(f"Saved {len(reviews)} reviews to {json_path} and {csv_path}")


def main():
    config = load_config()
    api_key = config["api_key"]
    data_id = config["data_id"]
    hl = config.get("hl", "en")
    max_pages = int(config.get("max_pages", 5))
    prefix = config.get("output_prefix", "reviews_output")

    # 1) reviews we already have
    existing = load_existing_reviews()
    known_ids = {r.get("review_id") for r in existing if r.get("review_id")}
    print(f"Known reviews: {len(known_ids)}")

    # 2) start from newest
    current_url = (
        "https://serpapi.com/search.json"
        f"?engine=google_maps_reviews&data_id={data_id}&hl={hl}&sort_by=newestFirst"
    )

    new_reviews = []
    stop = False

    for page in range(max_pages):
        if stop:
            break

        print(f"=== Page {page + 1} ===")
        data = fetch_page(current_url, api_key)

        reviews = data.get("reviews", [])
        print(f"Found {len(reviews)} reviews on this page")

        for r in reviews:
            rid = r.get("review_id")
            if rid and rid in known_ids:
                # we reached the first already-known review → stop everything
                print("Reached already-known review, stopping here.")
                stop = True
                break
            new_reviews.append(r)

        if stop:
            break

        pagination = data.get("serpapi_pagination", {})
        next_url = pagination.get("next")
        if not next_url:
            print("No more pages.")
            break
        current_url = next_url

    print(f"New reviews found this run: {len(new_reviews)}")

    # 3) merge old + new (new first)
    all_reviews = new_reviews + existing
    save_all(all_reviews, prefix)


if __name__ == "__main__":
    main()
