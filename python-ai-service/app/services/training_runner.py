import os
import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from app.core.config import settings
from app.database.connection import fetch_all, fetch_one, execute_query
from app.pipelines.property_price.pipeline import property_price_pipeline
from app.pipelines.market_trend.pipeline import market_trend_pipeline
from app.pipelines.recommendation.pipeline import recommendation_pipeline
from app.pipelines.chatbot.pipeline import chatbot_pipeline

logger = logging.getLogger("ai_service.training_runner")

RUNS_FILE = settings.BASE_DIR / "data" / "training_runs.json"
RUNS_FILE.parent.mkdir(parents=True, exist_ok=True)

class TrainingRunner:
    def __init__(self):
        self._ensure_file()

    def _ensure_file(self):
        if not RUNS_FILE.exists():
            with open(RUNS_FILE, "w") as f:
                json.dump([], f)

    def _read_runs(self) -> List[Dict[str, Any]]:
        try:
            with open(RUNS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []

    def _write_runs(self, runs: List[Dict[str, Any]]):
        with open(RUNS_FILE, "w") as f:
            json.dump(runs, f, indent=2)

    def start_training(self, model_id: int, dataset_id: Optional[int] = None, parameters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Registers training run and dispatches pipeline training asynchronously.
        """
        import time
        run_id = int(time.time() * 1000)
        now_str = datetime.utcnow().isoformat() + "Z"
        params = parameters or {}

        # Initial record
        record = {
            "id": run_id,
            "model_id": model_id,
            "dataset_id": dataset_id,
            "status": "running",
            "progress_pct": 10,
            "parameters": params,
            "metrics": None,
            "started_at": now_str,
            "completed_at": None,
            "error": None
        }

        # Save to DB if available
        try:
            execute_query("""
                INSERT INTO training_runs (id, model_id, dataset_id, status, parameters, started_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (run_id, model_id, dataset_id, "running", json.dumps(params), datetime.utcnow()))
        except Exception as e:
            logger.debug(f"DB training_runs insert fallback: {e}")

        runs = self._read_runs()
        runs.insert(0, record)
        self._write_runs(runs)

        # Launch thread
        thread = threading.Thread(target=self._execute_pipeline, args=(run_id, model_id, dataset_id, params))
        thread.daemon = True
        thread.start()

        return record

    def _execute_pipeline(self, run_id: int, model_id: int, dataset_id: Optional[int], parameters: Dict[str, Any]):
        try:
            # Resolve dataset path if dataset_id provided
            dataset_path = None
            if dataset_id:
                from app.services.dataset_service import dataset_service
                ds = dataset_service.get_dataset_by_id(dataset_id)
                if ds:
                    dataset_path = ds.get("file_path")

            train_split = int(parameters.get("train_split") or 80)
            learning_rate = float(parameters.get("learning_rate") or 0.04)
            n_estimators = int(parameters.get("n_estimators") or (180 if model_id == 1 else 100))

            # Dispatch to appropriate model pipeline
            if model_id == 1:
                result = property_price_pipeline.train(
                    dataset_path=dataset_path,
                    train_split=train_split,
                    learning_rate=learning_rate,
                    n_estimators=n_estimators
                )
            elif model_id == 2:
                result = market_trend_pipeline.train(
                    dataset_path=dataset_path,
                    train_split=train_split,
                    n_estimators=n_estimators
                )
            elif model_id == 3:
                result = recommendation_pipeline.train(
                    dataset_path=dataset_path,
                    train_split=train_split,
                    n_estimators=n_estimators
                )
            elif model_id == 4:
                result = chatbot_pipeline.train(dataset_path=dataset_path, train_split=train_split)
            else:
                raise ValueError(f"Unknown model_id: {model_id}")

            metrics = result.get("metrics", {})
            completed_at = datetime.utcnow().isoformat() + "Z"

            # Update DB
            try:
                execute_query("""
                    UPDATE training_runs 
                    SET status = 'completed', metrics = %s, completed_at = %s 
                    WHERE id = %s
                """, (json.dumps(metrics), datetime.utcnow(), run_id))
            except Exception:
                pass

            # Update local file
            runs = self._read_runs()
            for r in runs:
                if r["id"] == run_id:
                    r["status"] = "completed"
                    r["progress_pct"] = 100
                    r["metrics"] = metrics
                    r["version_tag"] = result.get("version_tag")
                    r["completed_at"] = completed_at
                    break
            self._write_runs(runs)

        except Exception as e:
            logger.error(f"Training run {run_id} failed: {e}", exc_info=True)
            runs = self._read_runs()
            for r in runs:
                if r["id"] == run_id:
                    r["status"] = "failed"
                    r["error"] = str(e)
                    r["completed_at"] = datetime.utcnow().isoformat() + "Z"
                    break
            self._write_runs(runs)

            try:
                execute_query("UPDATE training_runs SET status = 'failed' WHERE id = %s", (run_id,))
            except Exception:
                pass

    def get_all_runs(self, model_id: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            if model_id:
                rows = fetch_all("SELECT * FROM training_runs WHERE model_id = %s ORDER BY id DESC", (model_id,))
            else:
                rows = fetch_all("SELECT * FROM training_runs ORDER BY id DESC")
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
        except Exception:
            pass

        runs = self._read_runs()
        if model_id:
            runs = [r for r in runs if r.get("model_id") == model_id]
        return runs

    def get_run_by_id(self, run_id: int) -> Optional[Dict[str, Any]]:
        try:
            row = fetch_one("SELECT * FROM training_runs WHERE id = %s", (run_id,))
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

        runs = self._read_runs()
        for r in runs:
            if r.get("id") == run_id:
                return r
        return None

training_runner = TrainingRunner()
