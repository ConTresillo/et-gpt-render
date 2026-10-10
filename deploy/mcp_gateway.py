from et_mcp.server import build_mcp
from service_auth import ServiceAuth

server = build_mcp("all", host="0.0.0.0")
app = ServiceAuth(server.streamable_http_app())
