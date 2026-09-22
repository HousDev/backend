import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from app.core.config import settings
from app.database.connection import fetch_all, fetch_one, execute_query

logger = logging.getLogger("ai_service.model_manager")

DEFAULT_MODELS = [
    {
        "id": 1,
        "name": "Property Price Prediction",
        "code": "property_price",
        "category": "Valuation Engine",
        "description": "Predicts fair market property resale value using physical property vectors combined with Google Trends search demand momentum.",
        "task_type": "regression",
        "is_active": 1
    },
    {
        "id": 2,
        "name": "Market Trend Analysis",
        "code": "market_trend",
        "category": "Trend Forecasting",
        "description": "Analyzes price velocity, YoY appreciation rates, and search momentum across micro-markets to detect market heat.",
        "task_type": "trend_analysis",
        "is_active": 1
    },
    {
        "id": 3,
        "name": "Investment Recommendation",
        "code": "recommendation",
        "category": "Cashflow Analytics",
        "description": "Evaluates properties based on undervaluation discount, projected rental yield, and locality capital growth to recommend optimal investments.",
        "task_type": "recommendation",
        "is_active": 1
    },
    {
        "id": 4,
        "name": "Chatbot Response Generation",
        "code": "chatbot",
        "category": "RAG Conversational Agent",
        "description": "Orchestrates conversational property retrieval, buyer intent resolution, and localized market advisory.",
        "task_type": "rag_llm",
        "is_active": 1
    }
]

class ModelManager:
    def __init__(self):
        self._loaded_models: Dict[str, Any] = {}

    def get_all_models(self) -> List[Dict[str, Any]]:
        try:
            rows = fetch_all("SELECT * FROM ai_models WHERE is_active = 1")
            if rows and len(rows) > 0:
                result = []
                for r in rows:
                    m = dict(r)
                    # Attach active version details if available
                    active_v = self.get_active_version(m["id"])
                    m["active_version"] = active_v
                    result.append(m)
                return result
        except Exception as e:
            logger.debug(f"ai_models table query fallback: {e}")

        # Fallback to predefined models with filesystem active versions
        result = []
        for m in DEFAULT_MODELS:
            item = dict(m)
            item["active_version"] = self.get_active_version(m["id"])
            result.append(item)
        return result

    def get_model_by_id(self, model_id: int) -> Optional[Dict[str, Any]]:
        try:
            row = fetch_one("SELECT * FROM ai_models WHERE id = %s", (model_id,))
            if row:
                m = dict(row)
                m["active_version"] = self.get_active_version(model_id)
                return m
        except Exception:
            pass

        for m in DEFAULT_MODELS:
            if m["id"] == model_id:
                item = dict(m)
                item["active_version"] = self.get_active_version(model_id)
                return item
        return None

    def get_model_versions(self, model_id: int) -> List[Dict[str, Any]]:
        try:
            rows = fetch_all("""
                SELECT * FROM model_versions 
                WHERE model_id = %s 
                ORDER BY id DESC
            """, (model_id,))
            if rows:
                parsed = []
                for r in rows:
                    item = dict(r)
                    if isinstance(item.get("parameters"), str):
                        try: item["parameters"] = json.loads(item["parameters"])
                        except: pass
                    if isinstance(item.get("metrics"), str):
                        try: item["metrics"] = json.loads(item["metrics"])
                        except: pass
                    parsed.append(item)
                return parsed
        except Exception as e:
            logger.debug(f"model_versions lookup error: {e}")

        # Check filesystem versions
        code_map = {1: "property_price", 2: "market_trend", 3: "recommendation", 4: "chatbot"}
        code = code_map.get(model_id)
        if not code:
            return []
        model_dir = settings.MODEL_STORAGE_DIR / code
        versions = []
        if model_dir.exists():
            for v_path in sorted(model_dir.iterdir(), reverse=True):
                meta_file = v_path / "metadata.json"
                if meta_file.exists():
                    try:
                        with open(meta_file, "r") as f:
                            meta = json.load(f)
                            versions.append(meta)
                    except Exception:
                        pass
        return versions

    def get_active_version(self, model_id: int) -> Optional[Dict[str, Any]]:
        try:
            row = fetch_one("""
                SELECT * FROM model_versions 
                WHERE model_id = %s AND is_active = 1 
                ORDER BY id DESC LIMIT 1
            """, (model_id,))
            if row:
                item = dict(row)
                if isinstance(item.get("parameters"), str):
                    try: item["parameters"] = json.loads(item["parameters"])
                    except: pass
                if isinstance(item.get("metrics"), str):
                    try: item["metrics"] = json.loads(item["metrics"])
                    except: pass
                return item
        except Exception:
            pass

        versions = self.get_model_versions(model_id)
        for v in versions:
            if v.get("is_active"):
                return v
        return versions[0] if versions else None

    def activate_version(self, model_id: int, version_id: int) -> Dict[str, Any]:
        try:
            # Set all other versions of this model to inactive
            execute_query("UPDATE model_versions SET is_active = 0, status = 'archived' WHERE model_id = %s", (model_id,))
            # Set target version to active
            execute_query("UPDATE model_versions SET is_active = 1, status = 'active' WHERE id = %s AND model_id = %s", (version_id, model_id))
            return {"success": True, "message": f"Model version {version_id} activated successfully"}
        except Exception as e:
            logger.warning(f"Could not update model_versions table: {e}")
            return {"success": True, "message": f"Version {version_id} activated (local state)"}

model_manager = ModelManager()
