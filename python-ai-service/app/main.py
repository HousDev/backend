import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.datasets.router import router as datasets_router
from app.api.models.router import router as models_router
from app.api.training.router import router as training_router
from app.api.prediction.router import router as prediction_router

from app.pipelines.property_price.pipeline import property_price_pipeline
from app.pipelines.market_trend.pipeline import market_trend_pipeline
from app.pipelines.recommendation.pipeline import recommendation_pipeline
from app.pipelines.chatbot.pipeline import chatbot_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ai_service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Resale Expert AI Service...")
    # Ensure baseline v1 models are trained & available on startup
    try:
        v1_price = settings.MODEL_STORAGE_DIR / "property_price" / "v1"
        if not v1_price.exists():
            logger.info("Training initial Property Price v1 model...")
            property_price_pipeline.train()

        v1_trend = settings.MODEL_STORAGE_DIR / "market_trend" / "v1"
        if not v1_trend.exists():
            logger.info("Training initial Market Trend v1 model...")
            market_trend_pipeline.train()

        v1_rec = settings.MODEL_STORAGE_DIR / "recommendation" / "v1"
        if not v1_rec.exists():
            logger.info("Training initial Recommendation v1 model...")
            recommendation_pipeline.train()

        v1_chat = settings.MODEL_STORAGE_DIR / "chatbot" / "v1"
        if not v1_chat.exists():
            logger.info("Initializing Chatbot index v1...")
            chatbot_pipeline.train()

        logger.info("All 4 AI models initialized and ready for production serving.")
    except Exception as e:
        logger.warning(f"Startup model bootstrap warning: {e}")

    yield
    logger.info("Shutting down Resale Expert AI Service...")

app = FastAPI(
    title="Resale Expert AI Intelligence Service",
    version="1.0.0",
    description="Production-grade AI/ML service for Pune Real Estate market intelligence, valuation, and forecasting.",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api
app.include_router(datasets_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(training_router, prefix="/api")
app.include_router(prediction_router, prefix="/api")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "resale-expert-python-ai",
        "version": "1.0.0"
    }

@app.get("/")
def root():
    return {
        "message": "Resale Expert AI Service is running.",
        "docs_url": "/docs",
        "api_prefix": "/api"
    }

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
