import sys
import os

# Set UTF-8 stdout for Windows consoles
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Add python-ai-service to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.pipelines.property_price.pipeline import property_price_pipeline
from app.pipelines.market_trend.pipeline import market_trend_pipeline
from app.pipelines.recommendation.pipeline import recommendation_pipeline
from app.pipelines.chatbot.pipeline import chatbot_pipeline

def test_all():
    print("--- 1. Testing Property Price Pipeline ---")
    t1 = property_price_pipeline.train()
    print("Price Train Metrics:", t1["metrics"])
    p1 = property_price_pipeline.predict({
        "location_name": "Hinjewadi",
        "carpet_area": 850,
        "unit_type": "2 BHK",
        "bedrooms": 2,
        "bathrooms": 2,
        "floor": 6,
        "property_age": 3
    })
    print("Price Prediction:", p1)
    assert p1["predicted_price"] > 0
    assert "google_trends_applied" in p1

    print("\n--- 2. Testing Market Trend Pipeline ---")
    t2 = market_trend_pipeline.train()
    print("Trend Train Metrics:", t2["metrics"])
    p2 = market_trend_pipeline.predict({
        "locality": "Wakad",
        "current_sqft_rate": 8100
    })
    print("Trend Prediction:", p2)
    assert p2["forecast_1_year_sqft"] > 0
    assert "google_trends_signal" in p2

    print("\n--- 3. Testing Recommendation Pipeline ---")
    t3 = recommendation_pipeline.train()
    print("Rec Train Metrics:", t3["metrics"])
    p3 = recommendation_pipeline.predict({
        "location_name": "Baner",
        "carpet_area": 900,
        "final_price": 8500000,
        "property_age": 2
    })
    print("Rec Prediction:", p3)
    assert p3["ai_score"] > 0
    assert "projected_3yr_roi_pct" in p3

    print("\n--- 4. Testing Chatbot Pipeline ---")
    t4 = chatbot_pipeline.train()
    print("Chatbot Train Metrics:", t4["metrics"])
    p4 = chatbot_pipeline.predict({
        "message": "What are 2 BHK flats in Wakad and how is the trend?"
    })
    print("Chatbot Response:", p4["reply"][:200], "...")

    print("\nALL 4 AI/ML PIPELINES SUCCESSFULLY TESTED AND WORKING!")

if __name__ == "__main__":
    test_all()
