import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from app.services.dataset_service import dataset_service

logger = logging.getLogger("ai_service.datasets_router")

router = APIRouter(prefix="/datasets", tags=["Datasets"])

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    model_id: int = Form(...),
    name: Optional[str] = Form(None)
):
    """
    Ingests a CSV or JSON training dataset for a model.
    """
    try:
        content = await file.read()
        res = dataset_service.save_uploaded_file(
            file_content=content,
            filename=file.filename or "uploaded_dataset.csv",
            model_id=model_id,
            name=name
        )
        return {
            "success": True,
            "message": "Dataset uploaded and registered successfully",
            "dataset": res
        }
    except Exception as e:
        logger.error(f"Error uploading dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", include_in_schema=False)
@router.get("/")
def get_all_datasets(model_id: Optional[int] = Query(None)):
    """
    Lists registered datasets, optionally filtered by model_id.
    """
    items = dataset_service.get_all_datasets(model_id=model_id)
    return {
        "success": True,
        "count": len(items),
        "datasets": items
    }

@router.get("/{id}")
def get_dataset(id: int):
    """
    Retrieves dataset metadata and preview sample rows.
    """
    ds = dataset_service.get_dataset_by_id(id)
    if not ds:
        raise HTTPException(status_code=404, detail=f"Dataset with ID {id} not found")
    return {
        "success": True,
        "dataset": ds
    }

@router.delete("/{id}")
def delete_dataset(id: int):
    """
    Removes dataset and associated physical file.
    """
    success = dataset_service.delete_dataset(id)
    return {
        "success": success,
        "message": f"Dataset {id} deleted successfully"
    }
