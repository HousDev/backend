import logging
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.pipelines.property_price.pipeline import property_price_pipeline
from app.pipelines.market_trend.pipeline import market_trend_pipeline
from app.pipelines.recommendation.pipeline import recommendation_pipeline
from app.pipelines.chatbot.pipeline import chatbot_pipeline

logger = logging.getLogger("ai_service.prediction_router")

router = APIRouter(prefix="/prediction", tags=["Prediction"])

class PropertyPriceRequest(BaseModel):
    locality: Optional[str] = "Wakad"
    location_name: Optional[str] = None
    carpet_area: Optional[float] = 750
    unit_type: Optional[str] = "2 BHK"
    bedrooms: Optional[int] = 2
    bathrooms: Optional[int] = 2
    floor: Optional[float] = 4.0
    property_age: Optional[float] = 4.0
    furnishing: Optional[str] = "Semi-Furnished"

class ChatbotRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, Any]]] = None

class RecommendationRequest(BaseModel):
    locality: Optional[str] = "Wakad"
    location_name: Optional[str] = None
    carpet_area: Optional[float] = 750
    final_price: Optional[float] = 7500000
    price: Optional[float] = None
    unit_type: Optional[str] = "2 BHK"
    property_age: Optional[float] = 3.0

class MarketForecastRequest(BaseModel):
    locality: Optional[str] = "Wakad"
    location_name: Optional[str] = None
    current_sqft_rate: Optional[float] = 8200
    inventory_count: Optional[int] = 120

@router.post("/property-price")
def predict_property_price(payload: PropertyPriceRequest):
    """
    Predicts property valuation and fair price range using trained GradientBoosting model & Google Trends search features.
    """
    try:
        data = payload.dict()
        res = property_price_pipeline.predict(data)
        return {
            "success": True,
            "prediction": res
        }
    except Exception as e:
        logger.error(f"Error in property price prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chatbot")
def predict_chatbot(payload: ChatbotRequest):
    """
    REX Chatbot response generation using RAG property search + Google Trends search signals.
    """
    try:
        data = payload.dict()
        res = chatbot_pipeline.predict(data)
        return {
            "success": True,
            "response": res
        }
    except Exception as e:
        logger.error(f"Error in chatbot response: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommendation")
def predict_recommendation(payload: RecommendationRequest):
    """
    Computes genuine AI Investment Score, 3-Yr ROI projection, rental yield, and investment verdict.
    """
    try:
        data = payload.dict()
        res = recommendation_pipeline.predict(data)
        return {
            "success": True,
            "recommendation": res
        }
    except Exception as e:
        logger.error(f"Error in recommendation prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/market-forecast")
def predict_market_forecast(payload: MarketForecastRequest):
    """
    Generates genuine market forecast, CAGR, and market heat index based on Google Trends + property signals.
    """
    try:
        data = payload.dict()
        res = market_trend_pipeline.predict(data)
        return {
            "success": True,
            "forecast": res
        }
    except Exception as e:
        logger.error(f"Error in market forecast: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
