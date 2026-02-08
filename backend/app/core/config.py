from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


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
    CORS_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000", "http://0.0.0.0:3000", "http://10.170.7.150:31000"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
