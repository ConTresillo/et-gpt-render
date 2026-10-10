"""ASGI boundary for public demo services; tool implementations stay unchanged."""
import hmac
import os


class ServiceAuth:
    def __init__(self, app):
        self.app = app
        self.key = os.environ.get("SERVICE_AUTH_KEY", "")
        if len(self.key) < 32:
            raise RuntimeError("SERVICE_AUTH_KEY must contain at least 32 characters")

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.app(scope, receive, send)
        if scope["type"] != "http":
            return await send({"type": "websocket.close", "code": 1008})
        if scope["path"] == "/health" and scope["method"] == "GET":
            status, body = 200, b'{"ok":true}'
        else:
            headers = dict(scope.get("headers", []))
            token = headers.get(b"authorization", b"")
            if hmac.compare_digest(token, ("Bearer " + self.key).encode()):
                return await self.app(scope, receive, send)
            status, body = 401, b'{"error":"unauthorized"}'
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})
