import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Body
from app.services.training_runner import training_runner

logger = logging.getLogger("ai_service.training_router")

router = APIRouter(prefix="/training", tags=["Training"])

class TrainRequest(BaseModel):
    dataset_id: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None

@router.post("/{model_id}/train")
def trigger_training(
    model_id: int,
    payload: Optional[TrainRequest] = Body(default=None)
):
    """
    Triggers model training pipeline asynchronously.
    """
    dataset_id = payload.dataset_id if payload else None
    params = payload.parameters if payload and payload.parameters else {}

    run = training_runner.start_training(
        model_id=model_id,
        dataset_id=dataset_id,
        parameters=params
    )
    return {
        "success": True,
        "message": f"Training initiated for model {model_id}",
        "run": run
    }

@router.get("/runs")
def list_runs(model_id: Optional[int] = Query(None)):
    """
    Returns list of all training runs and their progress/metrics.
    """
    runs = training_runner.get_all_runs(model_id=model_id)
    return {
        "success": True,
        "count": len(runs),
        "runs": runs
    }

@router.get("/runs/{run_id}")
def get_run(run_id: int):
    """
    Returns specific training run status and evaluation results.
    """
    run = training_runner.get_run_by_id(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Training run {run_id} not found")
    return {
        "success": True,
        "run": run
    }
