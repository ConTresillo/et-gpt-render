# ET-MCP — EarthTekniks MCP Servers (standalone)

Python MCP servers for EarthTekniks — 17 tools across 3 domain servers. No frontend, no auth, no LLM needed. Just tools.

```
LLM / Inspector / Claude Desktop → MCP (stdio or HTTP) → tools → answer
```

## What's inside

| Server | Command | Tools | What it does |
|--------|---------|-------|--------------|
| `calc` / `calculator` | `--server calc` | 6 | 11 optics calculators (FOV, working distance, DOF, exposure, focal length, line-scan, etc.) + reference tables (sensor sizes, f-stops, pixel formats) |
| `site` | `--server site` | 2 | Company / project / vision KB — BM25+grep search over 25 docs, no DB needed |
| `catalog` | `--server catalog` | 9 | Lens catalog — Supabase Postgres (read-only) + safe SQL, schema-aware search |
| `all` | `--server all` | 17 | All 3 servers in one process |

```
src/et_mcp/
├── server.py              # FastMCP entry: --server calc|site|catalog|all, --transport stdio|streamable-http
├── settings.py            # env-only config (pydantic-settings, no hardcoding)
├── retrieval/             # shared hybrid retrieval (Qdrant + BM25, optional)
├── services/
│   ├── calc/              # pure math + knowledge docs + BM25 index
│   ├── catalog/           # DB (psycopg2, read-only, timeout + row cap) + SQL validator (sqlglot)
│   └── site/              # KB chunker + BM25 index
└── tools/                 # thin MCP adapters — no business logic
```

## Requirements

- Python 3.12+
- `SUPABASE_DB_URL` — only for `catalog` tools (read-only Postgres). `site` + `calc` work without it.
- Internet on first run — downloads `BAAI/bge-small-en-v1.5` (~40MB, via `fastembed`) for optional vector stages. Falls back to BM25 if offline.

## Quickstart

```bash
# 1. install
pip install -e .

# 2. env - copy and fill DB URL (catalog only)
cp .env.example .env
# edit .env: set SUPABASE_DB_URL to the Supabase *Session pooler* URI of a read-only role
# (db.<ref>.supabase.co direct hosts are IPv6-only and time out on IPv4 networks)

# 3. run - pick one
python -m et_mcp.server --server all --transport stdio                          # for Claude Desktop / Inspector stdio
python -m et_mcp.server --server catalog --transport streamable-http --port 8001  # HTTP
python -m et_mcp.server --server site    --transport streamable-http --port 8002
python -m et_mcp.server --server calc    --transport streamable-http --port 8003
python -m et_mcp.server --server all     --transport streamable-http --port 8001  # all 17 tools on one port
```

Ports: catalog 8001, site 8002, calc 8003 when split; `--server all` on 8001 serves all 17 tools.
The chatbot connects with transport **HTTP** (streamable) to `http://<host>:<port>/mcp`.

Verify HTTP (expects a JSON-RPC response):

```bash
curl -s http://127.0.0.1:8001/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

When bound to `127.0.0.1` the server only accepts `localhost` Host headers. For Docker, LAN or a domain, add `--allowed-host et-mcp:8001` (repeatable) or `MCP_ALLOWED_HOSTS=...`; otherwise requests get `421 Invalid Host header`.

### Docker

```bash
cp .env.example .env  # set SUPABASE_DB_URL
docker build -f Dockerfile.mcp -t et-mcp .
docker run --env-file .env -p 127.0.0.1:8001:8001 et-mcp python -m et_mcp.server --server all --transport streamable-http --port 8001 --host 0.0.0.0
# or the three split servers:
docker compose up -d --build
```

`Dockerfile.mcp` is standalone — no chatbot, no Node.

## MCP clients

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "et-mcp": {
      "command": "python",
      "args": ["-m", "et_mcp.server", "--server", "all"],
      "cwd": "/absolute/path/to/mcp-server"
    }
  }
}
```

Or split (3 servers, uses same `.venv`):
```json
{
  "mcpServers": {
    "et-mcp-calc":    { "command": "python", "args": ["-m","et_mcp.server","--server","calc"], "cwd": "/absolute/path/to/mcp-server" },
    "et-mcp-site":    { "command": "python", "args": ["-m","et_mcp.server","--server","site"], "cwd": "/absolute/path/to/mcp-server" },
    "et-mcp-catalog": { "command": "python", "args": ["-m","et_mcp.server","--server","catalog"], "cwd": "/absolute/path/to/mcp-server" }
  }
}
```

Use an absolute `cwd` (the `mcp-server` folder) and, if Claude can't find `python`, an absolute `command` such as `/absolute/path/to/mcp-server/.venv/bin/python` (Windows: `...\.venv\Scripts\python.exe`).

### Inspector

```bash
npx -y @modelcontextprotocol/inspector -- python -m et_mcp.server --server all
# or HTTP: python -m et_mcp.server --server all --transport streamable-http --port 8001
# then open http://127.0.0.1:6274, connect to http://127.0.0.1:8001/mcp
```

## Tools reference

**calc (6)** — `search_calculator` → `get_calculator` → `calculate` is the main flow; `search_lookups` → `get_reference` → `lookup` for reference tables.

| Tool | Purpose |
|------|---------|
| `search_calculator` | Find calculators for NL query |
| `get_calculator` | Inputs / gotchas / related for a `formula_id` |
| `calculate` | Run a calculator (`formula_id` + `args` dict) |
| `search_lookups` | Find reference tables |
| `get_reference` | Schema for a reference table |
| `lookup` | Single value lookup from reference table |

**site (2)**

| Tool | Purpose |
|------|---------|
| `search_knowledge_base` | BM25+grep over 25 docs, returns `confident` flag — don't answer from memory if `false` |
| `get_document` | Full doc by `doc_id` |

**catalog (9)**

| Tool | Purpose |
|------|---------|
| `list_families` | Lens families |
| `list_tables` | Tables, optional `family` filter |
| `describe_table` | Columns, purpose, signature columns — call before `run_select` |
| `search_knowledge` | Which table/family fits an NL use-case |
| `get_table_knowledge` | Full doc for a table: column meanings, NL→SQL examples, gotchas |
| `lookup_model` | Which table/family a model belongs to |
| `get_product` | Full row(s) for a model name |
| `search_products` | Filtered search (`table`/`family`/`filters`/`columns`/`sort`/`limit`) |
| `run_select` | Escape hatch: validated read-only `SELECT` (sqlglot, single statement, timeout 8s, 500 rows) |

## Smoke tests

No LLM needed — all direct Python / curl.

```bash
# 0. import check (no DB needed)
python -c "from et_mcp.tools.registry import TOOLSETS; print({k: len(v) for k,v in TOOLSETS.items()})"
# expect: {'calc': 6, 'site': 2, 'catalog': 9}

# 1. calc — BM25 + math (no DB)
python -c "
from et_mcp.services.calc.retrieval import search
from et_mcp.services.calc.dispatch import DISPATCH
from et_mcp.tools.calc import calculate
print(search('field of view for 12mm lens at 500mm', top_k=3))
# pick a formula_id from above, e.g. fov_using_sensor_size
print(calculate('fov_using_sensor_size', {'sensor_size_mm': 8.8, 'working_distance_mm': 500, 'focal_length_mm': 12}))
"

# 2. site — BM25+grep (no DB)
python -c "
from et_mcp.tools.site import search_knowledge_base, get_document
print(search_knowledge_base('garuda inspection system', top_k=3))
print(get_document('company_overview')['title'])
"

# 3. catalog — needs SUPABASE_DB_URL in .env (read-only)
python -c "
from et_mcp.tools.catalog import list_families, list_tables, describe_table
print(list_families())
print(list_tables('line_scan'))
print(describe_table('line_scan_lens_8k5u'))
"
python -c "
from et_mcp.tools.catalog import search_knowledge, get_table_knowledge
print(search_knowledge('lens for conveyor belt inspection', top_k=3))
print(get_table_knowledge('line_scan_lens_8k5u')['purpose'][:200])
"
python -c "
from et_mcp.tools.catalog import search_products, run_select
print(search_products(table='line_scan_lens_8k5u', filters=[{'column':'focus_length_mm','op':'>=','value':12}], limit=2))
print(run_select('SELECT model_name, focus_length_mm FROM line_scan_lens_8k5u LIMIT 2'))
"

# 4. MCP stdio smoke (spawns server, lists tools, exits)
python -c "
import asyncio, sys
from mcp.client.stdio import stdio_client
from mcp import StdioServerParameters
async def main():
    params = StdioServerParameters(command=sys.executable, args=['-m','et_mcp.server','--server','all'])
    async with stdio_client(params) as (read, write):
        from mcp.client.session import ClientSession
        async with ClientSession(read, write) as s:
            await s.initialize()
            tools = await s.list_tools()
            print([t.name for t in tools.tools])
asyncio.run(main())
"
# expect 17 tool names

# 5. HTTP smoke (needs server running in another terminal)
# terminal A: python -m et_mcp.server --server all --transport streamable-http --port 8001
# terminal B:
# (see "Verify HTTP" above for a curl initialize request)
```

### Test suite

```bash
pip install -e '.[dev]'
pytest -q     # calculators, reference lookups, site retrieval, SQL guard, server wiring (no DB, no network)
```

If catalog tests return `hint: check SUPABASE_DB_URL` — set it in `.env`. Site/calc failures without DB are bugs.

## Environment

All via `.env` (see `.env.example`), loaded through `settings.py`. Real environment variables override `.env`.

| Var | Required | Default | Used for |
|-----|----------|---------|----------|
| `SUPABASE_DB_URL` | catalog only | — | read-only catalog connection (Session pooler URI) |
| `SUPABASE_POOLER_DB_URL` | no | — | explicit Session pooler URI, preferred over `SUPABASE_DB_URL` when supplied |
| `CATALOG_SCHEMA` | no | `ragav` | schema holding the catalog tables |
| `CATALOG_HIDE_PRICES` | no | `false` | drop price columns and reject price queries (set `true` for customer chat) |
| `MCP_ALLOWED_HOSTS` | no | — | extra Host headers accepted over HTTP (comma-separated) |
| `ETK_CACHE_TTL_S` | no | `300` | query cache lifetime |
| `QDRANT_URL` | no | `.qdrant_storage` | local dir auto-created |
| `EMBEDDING_MODEL_NAME` | no | `BAAI/bge-small-en-v1.5` | vector stages (optional) |
| `DB_STATEMENT_TIMEOUT_MS` | no | `8000` | per-query timeout |
| `DB_ROW_LIMIT` | no | `500` | max rows per query |
| `SITE_MIN_CONFIDENCE` | no | `0.35` | site confidence gate |
| `DISABLE_SITE_VECTOR` | no | `true` | site = BM25+grep only |

## Troubleshooting

- `Catalog query failed: ... timeout expired` with an IPv6 address — the direct `db.<ref>.supabase.co` host is IPv6-only. Use the Session pooler URI from Supabase → Connect.
- `Catalog DB is not configured` — set `SUPABASE_DB_URL` in `.env`. Site/calc still work.
- `421 Invalid Host header` — add the hostname clients use with `--allowed-host` / `MCP_ALLOWED_HOSTS`.
- `mcp not installed. Run: pip install -e .` — `pip install -e .` from repo root (Python 3.12+).
- `Model not found / fastembed download failed` — first run needs internet; falls back to BM25 if offline. Re-run with internet to cache.
- `ModuleNotFoundError: et_mcp` — `pip install -e .` or `PYTHONPATH=src`.
- `address already in use :8001` — another MCP server on port; use `--port 8002`.
