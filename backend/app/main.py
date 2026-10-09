from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.analytics import router as analytics_router
from app.api.categories import router as categories_router
from app.api.health import router as health_router
from app.api.transactions import router as transactions_router
from app.config import get_settings
from app.security import MutationProtectionMiddleware

settings = get_settings()

app = FastAPI(
    title=settings.name,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)
app.add_middleware(
    MutationProtectionMiddleware,
    allowed_origins=settings.allowed_origins,
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)

app.include_router(health_router)
app.include_router(categories_router)
app.include_router(transactions_router)
app.include_router(analytics_router)
