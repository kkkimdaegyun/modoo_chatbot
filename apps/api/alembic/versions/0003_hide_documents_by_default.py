"""학습 문서 목록을 첫 화면에 노출하지 않는 것을 기본값으로 바꾼다.

파일명(개인정보_처리방침.pdf 등)이 고객 화면에 그대로 보이면 내부 문서 구성이 드러난다.
고객이 얻는 것도 없어서 기본은 끄고, 알리고 싶은 고객사만 관리자 페이지에서 켠다.
이미 true 로 저장된 행도 함께 내린다. 노출을 원하던 고객사는 다시 켜면 된다.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_hide_documents_by_default"
down_revision = "0002_welcome_screen"


def upgrade() -> None:
    op.alter_column("chatbot_settings", "show_documents", existing_type=sa.Boolean(), server_default="false")
    op.execute("UPDATE chatbot_settings SET show_documents = false")


def downgrade() -> None:
    op.alter_column("chatbot_settings", "show_documents", existing_type=sa.Boolean(), server_default="true")
