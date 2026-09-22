import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from app.services.model_manager import model_manager

logger = logging.getLogger("ai_service.models_router")

router = APIRouter(prefix="/models", tags=["Models"])

@router.get("", include_in_schema=False)
@router.get("/")
def list_models():
    """
    Returns the list of all AI models and their active versions.
    """
    models = model_manager.get_all_models()
    return {
        "success": True,
        "count": len(models),
        "models": models
    }

@router.get("/{model_id}")
def get_model(model_id: int):
    """
    Returns specific model metadata and active version.
    """
    model = model_manager.get_model_by_id(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model with ID {model_id} not found")
    return {
        "success": True,
        "model": model
    }

@router.get("/{model_id}/versions")
def get_model_versions(model_id: int):
    """
    Returns all trained versions, parameters, and genuine evaluation metrics for a model.
    """
    versions = model_manager.get_model_versions(model_id)
    return {
        "success": True,
        "model_id": model_id,
        "count": len(versions),
        "versions": versions
    }

@router.get("/{model_id}/active")
def get_active_version(model_id: int):
    """
    Returns the currently active production version for this model.
    """
    active = model_manager.get_active_version(model_id)
    if not active:
        raise HTTPException(status_code=404, detail=f"No active version found for model {model_id}")
    return {
        "success": True,
        "model_id": model_id,
        "active_version": active
    }

@router.post("/{model_id}/activate/{version_id}")
def activate_model_version(model_id: int, version_id: int):
    """
    Promotes a specific trained version to active production status.
    """
    res = model_manager.activate_version(model_id, version_id)
    return res
