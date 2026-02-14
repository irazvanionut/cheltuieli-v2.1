from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
from pathlib import Path


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://cheltuieli_user:cheltuieli_pass_2024@localhost:5432/cheltuieli"

    # Security
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Ollama AI
    OLLAMA_HOST: str = "http://localhost:11434"
    EMBEDDING_MODEL: str = "mxbai-embed-large"
    CHAT_MODEL: str = "llama3.2:3b"

    # Application
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    APP_NAME: str = "Cheltuieli V2"
    APP_VERSION: str = "2.0.0"

    # CORS
    CORS_ORIGINS: list = ["*"]

    # Legacy API
    LEGACY_BEARER_TOKEN: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


def load_legacy_token() -> str:
    """Load bearer token from /opt/cheltuieli-v2.1/.set file."""
    set_file = Path("/opt/cheltuieli-v2.1/.set")
    if set_file.exists():
        for line in set_file.read_text().strip().splitlines():
            if line.startswith("bearer"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    return parts[1].strip()
    return ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
