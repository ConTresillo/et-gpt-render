"""Read-only direct MCP diagnostics. Does not import or modify the server."""
import asyncio
import json
import socket
import sys
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "mcp-server/src/et_mcp/services/catalog/data"
MODEL_INDEX = json.loads((DATA / "model_index.json").read_text(encoding="utf-8"))
model = next(iter(MODEL_INDEX))
table = MODEL_INDEX[model][0]["table"]
records = []


def unpack(result):
    if result.structuredContent is not None:
        return result.structuredContent
    texts = [part.text for part in result.content if part.type == "text"]
    values = []
    for text in texts:
        try:
            values.append(json.loads(text))
        except ValueError:
            values.append(text)
    return values[0] if len(values) == 1 else values


async def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002/mcp"
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=35)) as session:
            await session.initialize()
            discovered = {tool.name for tool in (await session.list_tools()).tools}
            print(f"HTTP initialize passed; discovered {len(discovered)} tools")

            async def call(name, args):
                start = time.monotonic()
                try:
                    result = await session.call_tool(name, args)
                    value = unpack(result)
                    error = value.get("error") if isinstance(value, dict) else None
                    if isinstance(value, dict) and isinstance(value.get("results"), list):
                        error = error or next((row.get("error") for row in value["results"] if isinstance(row, dict) and row.get("error")), None)
                    ok = not result.isError and not error and not (isinstance(value, dict) and value.get("valid") is False)
                    note = str(error) if error else f"Returned {type(value).__name__}"
                    if name == "calculate" and ok:
                        note = json.dumps(value)
                except Exception as error:
                    value, ok, note = None, False, str(error)
                records.append({"tool": name, "ok": ok, "duration_ms": round((time.monotonic()-start)*1000), "note": note, "mcp_is_error": result.isError if value is not None else None})
                print(f"{'PASS' if ok else 'FAIL'} {name}: {note[:260]}")
                return value

            await call("search_calculator", {"query": "required focal length", "top_k": 3})
            await call("get_calculator", {"formula_id": "focal_length"})
            await call("calculate", {"formula_id": "focal_length", "args": {"sensor_size_mm": 8.8, "object_size_mm": 100, "working_distance_mm": 300}})
            lookups = await call("search_lookups", {"query": "sensor format sizes", "top_k": 3})
            reference_id = lookups["results"][0]["id"]
            reference = await call("get_reference", {"table_id": reference_id})
            await call("lookup", {"table_id": reference_id, "key": reference["available_keys"][0]})
            await call("search_knowledge_base", {"query": "Garuda inspection system", "top_k": 3})
            await call("get_document", {"doc_id": "company_overview"})
            await call("list_families", {})
            await call("list_tables", {})
            await call("describe_table", {"table": table})
            await call("search_knowledge", {"query": "factory automation lenses", "top_k": 3})
            await call("get_table_knowledge", {"table": table})
            await call("lookup_model", {"name": model})
            await call("get_product", {"model_name": model})
            await call("search_products", {"table": table, "columns": ["model_name"], "limit": 2})
            await call("run_select", {"sql": f"SELECT model_name FROM {table} LIMIT 2"})
            assert {record["tool"] for record in records} == discovered, "all discovered tools exercised"

    # Never print connection strings, credentials, or usernames.
    configured_host = None
    for line in (ROOT / "mcp-server/.env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            configured_host = urlparse(line.split("=", 1)[1].strip().strip("\"'")).hostname
    dns = {"host": configured_host}
    if configured_host:
        try:
            addresses = socket.getaddrinfo(configured_host, 5432)
            dns["resolved"] = True
            dns["families"] = sorted({"IPv6" if address[0] == socket.AF_INET6 else "IPv4" for address in addresses})
        except OSError as error:
            dns.update(resolved=False, error=str(error))
    print("DNS check:", json.dumps(dns))
    report = {"endpoint": url, "passed": sum(record["ok"] for record in records), "total": len(records), "tools": records, "dns": dns}
    path = ROOT / "docs/mcp-diagnostics.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Result: {report['passed']}/{report['total']} tools passed; report: {path}")


asyncio.run(main())
