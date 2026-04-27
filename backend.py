import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DB_PATH = os.environ.get("REPORTS_DB", "/data/reports.db")

app = FastAPI()


def get_conn():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                resolved BOOLEAN NOT NULL DEFAULT 0,
                struct TEXT,
                report TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


class ReportIn(BaseModel):
    report: Optional[str] = None
    struct: Optional[dict] = None


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/reports")
def create_report(payload: ReportIn):
    struct_json = None

    if payload.struct is not None:
        try:
            struct_json = json.dumps(payload.struct, ensure_ascii=False)
        except TypeError:
            raise HTTPException(status_code=400, detail="struct must be JSON serializable")

    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO reports (resolved, struct, report, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                0,
                struct_json,
                payload.report,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT id, resolved, struct, report, created_at
            FROM reports
            WHERE id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()

    return dict(row)


@app.get("/reports")
def list_reports():
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, resolved, struct, report, created_at
            FROM reports
            ORDER BY resolved ASC, id DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


@app.patch("/reports/{report_id}/resolved")
def set_resolved(report_id: int, resolved: bool = True):
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE reports SET resolved = ? WHERE id = ?",
            (1 if resolved else 0, report_id),
        )
        conn.commit()

        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Report not found")

    return {"id": report_id, "resolved": resolved}
