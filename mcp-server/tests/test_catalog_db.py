from types import SimpleNamespace

import psycopg2
import pytest
from pydantic import SecretStr

from et_mcp.services.catalog import db


def test_explicit_pooler_url_takes_precedence(monkeypatch):
    monkeypatch.setattr(db, "settings", SimpleNamespace(
        supabase_pooler_db_url=SecretStr("postgresql://reader:secret@pooler.example:5432/postgres"),
        supabase_db_url=SecretStr("postgresql://reader:secret@db.example.supabase.co/postgres"),
        database_url=None,
    ))
    assert "pooler.example" in db._dsn()


def test_empty_pooler_url_preserves_existing_connection(monkeypatch):
    original = "postgresql://reader:secret@db.example.supabase.co/postgres"
    monkeypatch.setattr(db, "settings", SimpleNamespace(
        supabase_pooler_db_url=SecretStr(" "), supabase_db_url=SecretStr(original), database_url=None,
    ))
    assert db._dsn() == original


def test_direct_endpoint_network_error_has_actionable_message(monkeypatch):
    monkeypatch.setattr(db, "DB_CONFIG", {"dsn": "postgresql://reader:secret@db.example.supabase.co/postgres"})
    def fail(**kwargs):
        raise psycopg2.OperationalError("could not translate host name")
    monkeypatch.setattr(db.psycopg2, "connect", fail)
    with pytest.raises(ConnectionError, match="SUPABASE_POOLER_DB_URL") as error:
        db.get_connection()
    assert "secret" not in str(error.value)


def test_authentication_errors_are_not_misclassified_as_network_errors(monkeypatch):
    monkeypatch.setattr(db, "DB_CONFIG", {"dsn": "postgresql://reader:secret@db.example.supabase.co/postgres"})
    def fail(**kwargs):
        raise psycopg2.OperationalError("password authentication failed")
    monkeypatch.setattr(db.psycopg2, "connect", fail)
    with pytest.raises(psycopg2.OperationalError, match="password authentication failed"):
        db.get_connection()
