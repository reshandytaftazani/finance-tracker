from collections.abc import Awaitable, Callable, Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class MutationProtectionMiddleware(BaseHTTPMiddleware):
    """Protects localhost endpoints from cross-site mutations and malicious origins."""

    def __init__(self, app, allowed_origins: Iterable[str]) -> None:
        super().__init__(app)
        self.allowed_origins = set(allowed_origins)
        self.mutation_methods = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method in self.mutation_methods:
            # 1. Reject cross-site requests via Sec-Fetch-Site (modern browsers)
            sec_fetch_site = request.headers.get("sec-fetch-site")
            if sec_fetch_site == "cross-site":
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Cross-site mutation request rejected"},
                )

            # 2. Check Origin header (sent by browsers on cross-origin and state-changing requests)
            origin = request.headers.get("origin")
            if origin and origin not in self.allowed_origins:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed"},
                )

            # 3. Check Content-Type for mutation methods with body
            if request.method in {"POST", "PUT", "PATCH"}:
                content_type = request.headers.get("content-type", "")
                content_length = request.headers.get("content-length")
                has_body = (content_length is not None and content_length != "0") or bool(
                    content_type
                )
                if has_body and not content_type.lower().startswith("application/json"):
                    return JSONResponse(
                        status_code=415,
                        content={
                            "detail": "Unsupported Media Type: expected application/json"
                        },
                    )

        return await call_next(request)
