import pymysql
from pymysql.cursors import DictCursor
from contextlib import contextmanager
from app.core.config import settings
import logging

logger = logging.getLogger("ai_service.database")

def get_raw_connection():
    return pymysql.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True
    )

@contextmanager
def get_db():
    conn = get_raw_connection()
    try:
        yield conn
    finally:
        conn.close()

def fetch_all(query: str, params: tuple = ()):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()

def fetch_one(query: str, params: tuple = ()):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()

def execute_query(query: str, params: tuple = ()):
    with get_db() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.lastrowid
