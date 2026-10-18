import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import FileResponse

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.budgets import router as budgets_router
from app.api.categories import router as categories_router
from app.api.health import router as health_router
from app.api.transactions import router as transactions_router
from app.config import Settings, get_settings
from app.security import MutationProtectionMiddleware

settings = get_settings()

app = FastAPI(
    title=settings.name,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
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
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(transactions_router)
app.include_router(analytics_router)
app.include_router(budgets_router)


def _resolve_settings() -> Settings:
    override = app.dependency_overrides.get(get_settings)
    if override:
        return override()
    return get_settings()


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_static_or_spa(request: Request, full_path: str = ""):
    current_settings = _resolve_settings()
    if not current_settings.static_dir or not os.path.isdir(current_settings.static_dir):
        raise HTTPException(status_code=404, detail="Not Found")

    if (
        full_path.startswith("api/")
        or full_path == "health"
        or full_path == "docs"
        or full_path == "openapi.json"
        or full_path == "redoc"
    ):
        raise HTTPException(status_code=404, detail="Not Found")

    norm_static = os.path.normpath(current_settings.static_dir)

    if full_path:
        file_path = os.path.normpath(os.path.join(norm_static, full_path))
        if not file_path.startswith(norm_static):
            raise HTTPException(status_code=403, detail="Forbidden")
        if os.path.isfile(file_path):
            return FileResponse(file_path)

    index_file = os.path.join(norm_static, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)

    raise HTTPException(status_code=404, detail="Static index file not found")
