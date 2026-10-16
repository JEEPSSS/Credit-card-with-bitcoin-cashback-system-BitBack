"""BitBack API.

Application assembly only: configuration, middleware, startup work and router
mounting. Every endpoint lives in `app/routers/`.
"""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.btc_service import get_btc_price
from app.clock import utcnow
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import CategoryCashback
from app.rate_limit import client_ip
from app.routers import ALL_ROUTERS
from app.services import evaluate_price_alerts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
log = logging.getLogger("bitback")

SEED_CATEGORIES = [
    ("dining", 0.03, "utensils", "Restaurants and cafes"),
    ("transport", 0.015, "car", "Rides, fuel, transit"),
    ("shopping", 0.02, "shopping-bag", "Retail and online shopping"),
    ("entertainment", 0.02, "gamepad-2", "Streaming, gaming, events"),
    ("groceries", 0.02, "carrot", "Supermarkets and food delivery"),
    ("travel", 0.03, "plane", "Airlines, hotels, bookings"),
    ("health", 0.015, "heart-pulse", "Pharmacy, gym, medical"),
    ("education", 0.01, "book-open", "Courses, books, supplies"),
    ("bills", 0.01, "file-text", "Utilities, subscriptions, rent"),
    ("general", 0.015, "credit-card", "Everything else"),
]

ALERT_POLL_SECONDS = 60


def seed_categories() -> None:
    db = SessionLocal()
    try:
        if db.query(CategoryCashback).count() == 0:
            db.add_all([CategoryCashback(category=c, base_rate=r, icon=i, description=d)
                        for c, r, i, d in SEED_CATEGORIES])
            db.commit()
            log.info("seeded %d cashback categories", len(SEED_CATEGORIES))
    finally:
        db.close()


def _sweep_alerts() -> int:
    """One pass over pending alerts against a live price. Never a stale one:
    an alert fired against the fallback price would tell a user bitcoin crossed
    a level it never reached."""
    snap = get_btc_price()
    if snap["stale"]:
        return 0
    db = SessionLocal()
    try:
        return evaluate_price_alerts(db, snap["price"])
    finally:
        db.close()


async def _alert_worker() -> None:
    """Evaluate price alerts on a timer.

    This runs here rather than inside `GET /api/btc/price` so that a read
    endpoint stays a read. Its cost is also now bounded by the poll interval
    instead of scaling with how often anyone opens the app.

    The first sweep runs immediately rather than after one interval. A free
    Render instance sleeps after 15 idle minutes and is woken by the next
    request - typically someone opening the app - so a sweep that waited a
    minute after boot would miss the moment someone is actually looking.
    Alerts cannot fire while the instance sleeps; that limit of the free tier
    is documented in DEPLOY.md rather than hidden.
    """
    while True:
        try:
            fired = await asyncio.to_thread(_sweep_alerts)
            if fired:
                log.info("price alerts triggered: %d", fired)
        except Exception:
            log.exception("price alert sweep failed")
        await asyncio.sleep(ALERT_POLL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic owns the schema (`alembic upgrade head` runs in the Render build).
    # create_all is only a zero-setup convenience for a local SQLite checkout:
    # run against Postgres it would create tables Alembic has no record of,
    # and the next `alembic upgrade head` would fail trying to create them again.
    if settings.is_sqlite:
        Base.metadata.create_all(bind=engine)
    seed_categories()
    worker = asyncio.create_task(_alert_worker())
    log.info("BitBack API ready (environment=%s)", settings.environment)
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker


app = FastAPI(
    title="BitBack API",
    version="1.1.0",
    description="Bitcoin cashback card simulation backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Credentials are carried in the Authorization header, not cookies, so this
    # stays off. `allow_credentials=True` alongside `allow_origins=["*"]` is
    # rejected by browsers anyway.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in ALL_ROUTERS:
    app.include_router(router)

# The standalone survey page (Chapter 3.6). Same-origin as the API it posts
# to, so no CORS configuration is needed for it specifically. Mounted after
# the API routers so it never shadows an /api/* path.
_SURVEY_DIR = Path(__file__).parent / "app" / "static" / "survey"
if _SURVEY_DIR.exists():
    app.mount("/survey", StaticFiles(directory=_SURVEY_DIR, html=True), name="survey")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the traceback, return a message that leaks nothing about it."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong on our side. Try again."},
    )


@app.get("/api/health", tags=["meta"])
def health():
    """Liveness plus a database round trip, for Render's health check.

    Reporting "ok" while the database is unreachable would tell the platform
    the service is fine when every real request fails.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        log.exception("health check: database unreachable")
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            content={"status": "degraded", "database": "unreachable"})
    price = get_btc_price()
    return {"status": "ok", "version": app.version, "time": utcnow(), "database": "ok",
            "price_source": price["source"], "price_stale": price["stale"]}


@app.get("/api/meta/client-ip", tags=["meta"])
def whoami(request: Request):
    """The address rate limits key on for this caller, and where it came from.

    For checking CLIENT_IP_SOURCE on a real deployment: call it twice, once
    with a made-up `X-Forwarded-For` header. If the reported address follows
    the made-up value, a client can dodge every rate limit by changing it.
    It only ever reports the caller's own address.
    """
    return {"ip": client_ip(request), "source": settings.client_ip_source}
