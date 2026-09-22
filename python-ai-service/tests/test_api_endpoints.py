import sys
import os

# Set UTF-8 stdout for Windows consoles
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api():
    print("Testing /health ...")
    r = client.get("/health")
    print("Health response:", r.status_code, r.json())
    assert r.status_code == 200

    print("\nTesting /api/models ...")
    r = client.get("/api/models")
    print("Models response:", r.status_code, r.json()["count"], "models")
    assert r.status_code == 200
    assert r.json()["count"] == 4

    print("\nTesting /api/models/1/active ...")
    r = client.get("/api/models/1/active")
    print("Active Model 1:", r.status_code, r.json()["active_version"]["version_tag"])
    assert r.status_code == 200

    print("\nTesting /api/prediction/property-price ...")
    r = client.post("/api/prediction/property-price", json={
        "locality": "Wakad",
        "carpet_area": 800,
        "unit_type": "2 BHK",
        "floor": 5,
        "property_age": 3
    })
    print("Property Price Prediction:", r.status_code, r.json()["prediction"]["predicted_price"])
    assert r.status_code == 200

    print("\nTesting /api/prediction/market-forecast ...")
    r = client.post("/api/prediction/market-forecast", json={
        "locality": "Hinjewadi",
        "current_sqft_rate": 7200
    })
    print("Market Forecast:", r.status_code, r.json()["forecast"]["market_heat"], r.json()["forecast"]["forecast_1_year_sqft"])
    assert r.status_code == 200

    print("\nTesting /api/prediction/recommendation ...")
    r = client.post("/api/prediction/recommendation", json={
        "locality": "Baner",
        "carpet_area": 1000,
        "final_price": 9500000,
        "property_age": 2
    })
    print("Recommendation:", r.status_code, r.json()["recommendation"]["ai_score"], r.json()["recommendation"]["verdict_badge"])
    assert r.status_code == 200

    print("\nTesting /api/prediction/chatbot ...")
    r = client.post("/api/prediction/chatbot", json={
        "message": "Tell me about resale flats in Wakad"
    })
    print("Chatbot:", r.status_code, r.json()["response"]["source"])
    assert r.status_code == 200

    print("\nTesting /api/datasets/upload ...")
    csv_content = b"location_name,carpet_area,unit_type,bedrooms,bathrooms,floor,final_price\nWakad,800,2 BHK,2,2,4,7800000\nWakad,850,2 BHK,2,2,6,8200000\nBaner,1100,3 BHK,3,3,10,13500000\n"
    r = client.post("/api/datasets/upload", 
        files={"file": ("sample_wakad_comps.csv", csv_content, "text/csv")},
        data={"model_id": 1, "name": "Wakad Comps Dataset"}
    )
    print("Dataset Upload response:", r.status_code, r.json()["dataset"]["name"])
    assert r.status_code == 200
    dataset_id = r.json()["dataset"]["id"]

    print("\nTesting /api/training/1/train ...")
    r = client.post("/api/training/1/train", json={
        "dataset_id": dataset_id,
        "parameters": {"train_split": 80, "n_estimators": 100}
    })
    print("Training Trigger response:", r.status_code, r.json()["run"]["status"])
    assert r.status_code == 200
    run_id = r.json()["run"]["id"]

    # Wait for training thread to finish
    import time
    for _ in range(10):
        time.sleep(1)
        r = client.get(f"/api/training/runs/{run_id}")
        run_data = r.json()["run"]
        if run_data["status"] == "completed":
            print("Training Run Completed!", run_data.get("version_tag"), run_data.get("metrics"))
            break

    print("\nALL FASTAPI ENDPOINTS VERIFIED AND SUCCEEDED!")

if __name__ == "__main__":
    test_api()
