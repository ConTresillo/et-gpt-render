"""Catalog execution failures must not look like successful empty lookups."""
from et_mcp.services.catalog import query


def test_get_product_surfaces_database_error(monkeypatch):
    monkeypatch.setattr(query.indexes, "find_model", lambda _: {
        "matches": [{"model_name": "TEST", "table": "fa_lenses", "product_type": "fa"}]
    })
    monkeypatch.setattr(query, "_run", lambda _: {"error": "Database connection failed"})
    result = query.get_product("TEST")
    assert result["error"] == "Database connection failed"
    assert result["results"][0]["error"] == result["error"]
    assert result["results"][0]["row"] is None


def test_get_product_preserves_successful_rows(monkeypatch):
    monkeypatch.setattr(query.indexes, "find_model", lambda _: {
        "matches": [{"model_name": "TEST", "table": "fa_lenses", "product_type": "fa"}]
    })
    monkeypatch.setattr(query, "_run", lambda _: {"rows": [{"model_name": "TEST"}]})
    result = query.get_product("TEST")
    assert "error" not in result
    assert result["results"][0]["row"] == {"model_name": "TEST"}
