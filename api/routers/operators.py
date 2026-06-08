"""GET /api/v1/operators — list all operators. Task 9.2"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from api.deps import get_db

router = APIRouter(tags=["operators"])


@router.get("/operators")
def list_operators(conn=Depends(get_db)):
    rows = conn.execute(text("SELECT id, name, slug FROM operators ORDER BY name")).fetchall()
    return [{"id": r[0], "name": r[1], "slug": r[2]} for r in rows]
