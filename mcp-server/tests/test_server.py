"""Server wiring: all 17 tools exposed; error payloads flagged isError."""
import json

from mcp.shared.memory import create_connected_server_and_client_session

from et_mcp.server import build_mcp


async def test_all_tools_and_error_flag():
    mcp = build_mcp("all")
    async with create_connected_server_and_client_session(mcp._mcp_server) as client:
        tools = (await client.list_tools()).tools
        assert len(tools) == 17
        ok = await client.call_tool("calculate", {"formula_id": "focal_length", "args": {"object_size_mm": 300, "working_distance_mm": 500, "sensor_size_mm": 8.8}})
        assert not ok.isError and json.loads(ok.content[0].text)["focal_length_mm"] == 14.2
        bad = await client.call_tool("calculate", {"formula_id": "nope", "args": {}})
        assert bad.isError
        assert "Unknown formula_id" in json.loads(bad.content[0].text)["error"]


def test_allowed_hosts_are_applied_at_construction():
    mcp = build_mcp("calc", host="0.0.0.0", port=8003, allowed_hosts=["et-mcp:8003"])
    sec = mcp.settings.transport_security
    assert sec.enable_dns_rebinding_protection and "et-mcp:8003" in sec.allowed_hosts
    assert mcp.settings.host == "0.0.0.0" and mcp.settings.port == 8003


async def test_product_database_failure_sets_mcp_error_flag(monkeypatch):
    from et_mcp.services.catalog import query
    monkeypatch.setattr(query.indexes, "find_model", lambda _: {
        "matches": [{"model_name": "TEST", "table": "fa_lenses", "product_type": "fa"}]
    })
    monkeypatch.setattr(query, "_run", lambda _: {"error": "Database connection failed"})
    mcp = build_mcp("catalog")
    async with create_connected_server_and_client_session(mcp._mcp_server) as client:
        result = await client.call_tool("get_product", {"model_name": "TEST"})
        assert result.isError
        assert result.structuredContent["error"] == "Database connection failed"
