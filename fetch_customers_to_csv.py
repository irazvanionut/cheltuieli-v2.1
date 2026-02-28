#!/usr/bin/env python3
import csv
import json
import os
import sys
import urllib.error
import urllib.request


API_URL = "http://10.170.4.101:5020/api/Entity/Get"
OUTPUT_CSV = "customers.csv"
TOKEN_ENV_VAR = "API_BEARER_TOKEN"

PAYLOAD = {
    "dataSetName": "CustomerProjectionPlugIn",
    "query": {
        "selectFields": [
            {"name": "Name"},
            {"name": "AddressText"},
            {"name": "PhoneNumber"},
            {"name": "EmailAddress"},
            {"name": "Type"},
            {"name": "Id"},
        ],
        "where": [],
        "orderBy": [],
        "pagination": {"skip": 0, "take": 25000, "useLastRecords": False},
    },
    "formatOptions": 1,
    "endpoint": "/proxy/http://10.170.4.101:5020//api/Entity/Get",
}

CSV_COLUMNS = ["Name", "AddressText", "PhoneNumber", "EmailAddress", "Type", "Id"]
KEY_ALIASES = {
    "Name": ["Name", "name"],
    "AddressText": ["AddressText", "addressText"],
    "PhoneNumber": ["PhoneNumber", "phoneNumber"],
    "EmailAddress": ["EmailAddress", "emailAddress"],
    "Type": ["Type", "type"],
    "Id": ["Id", "id"],
}


def load_env_file(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def extract_records(response_json: dict) -> list:
    if isinstance(response_json, list):
        return response_json

    if not isinstance(response_json, dict):
        return []

    for key in ("data", "items", "results", "result", "rows"):
        value = response_json.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = extract_records(value)
            if nested:
                return nested

    return []


def fetch_data(token: str) -> dict:
    body = json.dumps(PAYLOAD).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        content = response.read().decode("utf-8")
        return json.loads(content)


def write_csv(records: list, output_path: str) -> None:
    def pick_value(record: dict, column: str) -> str:
        for key in KEY_ALIASES[column]:
            if key in record:
                return record.get(key, "")
        return ""

    with open(output_path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for record in records:
            if not isinstance(record, dict):
                continue
            writer.writerow({column: pick_value(record, column) for column in CSV_COLUMNS})


def main() -> int:
    load_env_file()
    token = os.getenv(TOKEN_ENV_VAR, "").strip()
    if not token:
        print(
            "Missing bearer token. Store it in /opt/erpcustomers/.env as API_BEARER_TOKEN=your_token",
            file=sys.stderr,
        )
        return 1

    try:
        response_json = fetch_data(token)
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code}: {error.reason}", file=sys.stderr)
        print(error_body, file=sys.stderr)
        return 1
    except urllib.error.URLError as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as error:
        print(f"Invalid JSON response: {error}", file=sys.stderr)
        return 1

    records = extract_records(response_json)
    if not records:
        print("No records found in response. Writing only CSV headers.")

    write_csv(records, OUTPUT_CSV)
    print(f"Wrote {len(records)} records to {OUTPUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
