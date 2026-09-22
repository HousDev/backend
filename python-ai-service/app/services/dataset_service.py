import os
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import shutil

from app.core.config import settings
from app.database.connection import fetch_all, fetch_one, execute_query

logger = logging.getLogger("ai_service.dataset_service")

DATASETS_DIR = settings.BASE_DIR / "data" / "datasets"
DATASETS_DIR.mkdir(parents=True, exist_ok=True)
META_FILE = DATASETS_DIR / "datasets_meta.json"

class DatasetService:
    def __init__(self):
        self._ensure_meta_file()

    def _ensure_meta_file(self):
        if not META_FILE.exists():
            with open(META_FILE, "w") as f:
                json.dump([], f)

    def _read_local_meta(self) -> List[Dict[str, Any]]:
        try:
            with open(META_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []

    def _write_local_meta(self, items: List[Dict[str, Any]]):
        with open(META_FILE, "w") as f:
            json.dump(items, f, indent=2)

    def save_uploaded_file(self, file_content: bytes, filename: str, model_id: int, name: Optional[str] = None) -> Dict[str, Any]:
        """
        Saves uploaded dataset, calculates row/feature counts, and registers it.
        """
        ext = Path(filename).suffix.lower()
        clean_name = f"dataset_{int(datetime.utcnow().timestamp())}_{filename}"
        target_path = DATASETS_DIR / clean_name

        with open(target_path, "wb") as f:
            f.write(file_content)

        # Parse with pandas
        try:
            if ext == ".csv":
                df = pd.read_csv(target_path)
            elif ext == ".json":
                df = pd.read_json(target_path)
            else:
                df = pd.DataFrame()
            row_count = len(df)
            col_count = len(df.columns)
            feature_names = list(df.columns)
        except Exception as e:
            logger.warning(f"Error parsing dataset file {filename}: {e}")
            row_count = 0
            col_count = 0
            feature_names = []

        ds_name = name or filename
        created_at = datetime.utcnow().isoformat()
        dataset_id = int(datetime.utcnow().timestamp())

        # Try saving to MySQL datasets table
        try:
            execute_query("""
                INSERT INTO datasets (id, model_id, name, file_name, file_path, row_count, feature_count, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (dataset_id, model_id, ds_name, filename, str(target_path), row_count, col_count, datetime.utcnow()))
        except Exception as e:
            logger.debug(f"MySQL datasets insert fallback to file: {e}")

        # Always save to local meta as well
        local_items = self._read_local_meta()
        item = {
            "id": dataset_id,
            "model_id": model_id,
            "name": ds_name,
            "file_name": filename,
            "file_path": str(target_path),
            "row_count": row_count,
            "feature_count": col_count,
            "features": feature_names,
            "created_at": created_at
        }
        local_items.insert(0, item)
        self._write_local_meta(local_items)

        return item

    def get_all_datasets(self, model_id: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            if model_id:
                rows = fetch_all("SELECT * FROM datasets WHERE model_id = %s ORDER BY id DESC", (model_id,))
            else:
                rows = fetch_all("SELECT * FROM datasets ORDER BY id DESC")
            if rows:
                return [dict(r) for r in rows]
        except Exception:
            pass

        items = self._read_local_meta()
        if model_id:
            items = [d for d in items if d.get("model_id") == model_id]
        return items

    def get_dataset_by_id(self, dataset_id: int) -> Optional[Dict[str, Any]]:
        try:
            row = fetch_one("SELECT * FROM datasets WHERE id = %s", (dataset_id,))
            if row:
                d = dict(row)
                # Load sample preview
                d["sample_rows"] = self._get_sample_rows(d.get("file_path"))
                return d
        except Exception:
            pass

        items = self._read_local_meta()
        for d in items:
            if d.get("id") == dataset_id:
                item = dict(d)
                item["sample_rows"] = self._get_sample_rows(item.get("file_path"))
                return item
        return None

    def _get_sample_rows(self, file_path: Optional[str]) -> List[Dict[str, Any]]:
        if not file_path or not os.path.exists(file_path):
            return []
        try:
            ext = Path(file_path).suffix.lower()
            if ext == ".csv":
                df = pd.read_csv(file_path, nrows=5)
            elif ext == ".json":
                df = pd.read_json(file_path).head(5)
            else:
                return []
            return df.fillna("").to_dict(orient="records")
        except Exception:
            return []

    def delete_dataset(self, dataset_id: int) -> bool:
        # Get path first
        target = self.get_dataset_by_id(dataset_id)
        if target and target.get("file_path") and os.path.exists(target["file_path"]):
            try:
                os.remove(target["file_path"])
            except Exception:
                pass

        try:
            execute_query("DELETE FROM datasets WHERE id = %s", (dataset_id,))
        except Exception:
            pass

        items = self._read_local_meta()
        items = [d for d in items if d.get("id") != dataset_id]
        self._write_local_meta(items)
        return True

dataset_service = DatasetService()
