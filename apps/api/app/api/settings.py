from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import workspace_id
from app.core.security import require_admin
from app.db.session import get_db
from app.models import ChatbotSetting
from app.schemas.api import SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_admin)])


def get_or_create(db: Session) -> ChatbotSetting:
    item = db.scalar(select(ChatbotSetting).where(ChatbotSetting.workspace_id == workspace_id()))
    if not item:
        item = ChatbotSetting(workspace_id=workspace_id())
        db.add(item)
        db.commit()
        db.refresh(item)
    return item


@router.get("")
def get_settings(db: Session = Depends(get_db)) -> dict[str, object]:
    item = get_or_create(db)
    return {"system_prompt": item.system_prompt, "final_context_top_k": item.final_context_top_k, "max_context_tokens": item.max_context_tokens, "qa_priority_boost": item.qa_priority_boost}


@router.put("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> dict[str, object]:
    item = get_or_create(db)
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return payload.model_dump()
