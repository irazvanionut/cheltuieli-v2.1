import json
from pathlib import Path
from datetime import datetime

INPUT_JSON = "reviews_output.json"
OUTPUT_JSON = "classified_reviews.json"

NEGATIVE_WORDS = [
    "nu recomand", "groaznic", "foarte prost", "oribil",
    "problema", "plangere", "plângere",
    "par in farfurie", "păr în farfurie", "mizerie",
    "n-au nici una", "nu au nici una", "nu au nimic",
    "dezamagit", "dezamăgit", "deranjant"
]

POSITIVE_WORDS = [
    "super", "excelent", "recomand", "foarte bun",
    "minunat", "de nota zece", "exceptional", "excepțional",
    "frumos", "primitoare", "bine-venit", "bine venit"
]


def load_reviews(path=INPUT_JSON):
    if not Path(path).exists():
        raise FileNotFoundError(f"{path} not found")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def to_lower(text):
    return text.lower() if isinstance(text, str) else ""


def classify_sentiment(review):
    rating = review.get("rating")
    text = review.get("snippet") or review.get("description") or ""
    text_l = to_lower(text)

    if rating is not None:
        if rating <= 2:
            base = "negative"
        elif rating == 3:
            base = "neutral"
        else:
            base = "positive"
    else:
        base = "neutral"

    if any(word in text_l for word in NEGATIVE_WORDS):
        return "negative"
    if any(word in text_l for word in POSITIVE_WORDS):
        if base != "negative":
            return "positive"

    return base


def classify_category(review):
    text = review.get("snippet") or review.get("description") or ""
    text_l = to_lower(text)

    if any(w in text_l for w in ["mâncare", "mancare", "meniu", "feluri"]):
        return "food"
    if any(w in text_l for w in ["servire", "chelner", "ospatar", "ospătar"]):
        return "service"
    if any(w in text_l for w in ["ambianta", "ambianță", "muzica", "muzică", "atmosfera", "atmosferă"]):
        return "atmosphere"
    if any(w in text_l for w in ["curat", "mizerie", "igiena", "igienă", "păr în farfurie", "par in farfurie"]):
        return "hygiene"
    if any(w in text_l for w in ["nu au", "nu au nici una", "nu au nimic", "nu mai avem", "nu este", "nu e"]):
        return "availability"
    if any(w in text_l for w in ["câini", "caini", "pisici", "câine", "caine", "animal"]):
        return "animals"

    return "other"


def parse_iso(date_str):
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def main():
    reviews = load_reviews()

    classified = []
    for r in reviews:
        sentiment = classify_sentiment(r)
        category = classify_category(r)
        iso_date = r.get("iso_date") or r.get("iso_date_of_last_edit")
        dt = parse_iso(iso_date)

        classified.append({
            "review_id": r.get("review_id"),
            "rating": r.get("rating"),
            "date": r.get("date"),
            "iso_date": iso_date,
            "sentiment": sentiment,
            "category": category,
            "user_name": (r.get("user") or {}).get("name") if isinstance(r.get("user"), dict) else None,
            "snippet": r.get("snippet") or r.get("description"),
            "link": r.get("link"),
        })

    classified.sort(key=lambda x: parse_iso(x["iso_date"]) or datetime.min, reverse=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(classified, f, ensure_ascii=False, indent=2)

    print(f"Saved classified reviews to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
