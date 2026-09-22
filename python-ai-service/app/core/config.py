import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
# Look for backend/.env first, then local .env
BACKEND_DIR = BASE_DIR.parent if (BASE_DIR.parent / ".env").exists() else BASE_DIR
ENV_FILE_PATH = str(BACKEND_DIR / ".env") if (BACKEND_DIR / ".env").exists() else str(BASE_DIR / ".env")

class Settings(BaseSettings):
    BASE_DIR: Path = BASE_DIR
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "admin123"
    DB_NAME: str = "server_resale_expert_crm"

    JWT_SECRET: str = "your-secret-keyfsdfd"
    JWT_ALGORITHM: str = "HS256"

    AI_SERVICE_HOST: str = "127.0.0.1"
    AI_SERVICE_PORT: int = 9001
    HOST: str = "127.0.0.1"
    PORT: int = 9001
    DEBUG: bool = False

    DATASET_STORAGE_DIR: Path = BASE_DIR / "storage" / "datasets"
    MODEL_STORAGE_DIR: Path = BASE_DIR / "storage" / "models"

    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ENV_FILE_PATH
        extra = "allow"

settings = Settings()

