"""API routers, one module per resource group.

Each exports `router`; `main.py` mounts them in the order listed here, which is
also the order they appear in the generated OpenAPI docs.
"""
from app.routers import (
                         analytics,
                         auth,
                         goals,
                         market,
                         ml,
                         notifications,
                         preferences,
                         referrals,
                         rewards,
                         transactions,
                         wallet,
)

ALL_ROUTERS = [
    auth.router,
    market.router,
    transactions.router,
    wallet.router,
    rewards.router,
    analytics.router,
    goals.router,
    preferences.router,
    referrals.router,
    notifications.router,
    ml.router,
]
