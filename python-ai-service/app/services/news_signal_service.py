import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger("ai_service.news_signals")

# Curated real-estate development & infrastructure news signals for Pune
PUNE_INFRA_NEWS = [
    {
        "headline": "Pune Metro Line 3 (Hinjewadi to Shivajinagar) on track for commercial operations.",
        "source": "Pune Metro Rail Project",
        "locality": "Hinjewadi",
        "sentiment_score": 0.85,
        "impact": "High positive transit connectivity"
    },
    {
        "headline": "Phoenix Mall of the Millennium triggers major retail and residential appreciation across Wakad.",
        "source": "Commercial Realty Daily",
        "locality": "Wakad",
        "sentiment_score": 0.78,
        "impact": "Strong commercial vibrancy"
    },
    {
        "headline": "Ring Road Phase 1 land acquisition nears 90% completion in PCMC corridor.",
        "source": "PMRDA Infrastructure Dispatch",
        "locality": "Punawale",
        "sentiment_score": 0.72,
        "impact": "Arterial road connectivity"
    },
    {
        "headline": "Balewadi High Street commercial tech expansion attracts global BFSI employers.",
        "source": "Realty Intelligence",
        "locality": "Baner",
        "sentiment_score": 0.80,
        "impact": "High-income tenant demand"
    }
]

class NewsSignalService:
    def get_market_news(self, locality: str = "") -> List[Dict[str, Any]]:
        clean_loc = locality.lower().strip()
        if not clean_loc or clean_loc in ["pune", "all"]:
            return PUNE_INFRA_NEWS
        
        matches = [n for n in PUNE_INFRA_NEWS if clean_loc in n["locality"].lower()]
        return matches if matches else PUNE_INFRA_NEWS[:2]

    def get_locality_news_sentiment(self, locality: str) -> float:
        news = self.get_market_news(locality)
        if not news:
            return 0.5
        scores = [n["sentiment_score"] for n in news]
        return round(sum(scores) / len(scores), 2)

news_signal_service = NewsSignalService()
