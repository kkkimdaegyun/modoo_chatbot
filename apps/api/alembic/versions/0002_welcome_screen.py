"""채팅 첫 화면 문구와 예시 질문 카드를 관리자가 정할 수 있게 컬럼을 추가한다."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_welcome_screen"
down_revision = "0001_initial"


def upgrade() -> None:
    # 이미 운영 중인 고객사 DB 에도 그대로 올라가야 하므로 전부 nullable/server_default 를 준다.
    op.add_column("chatbot_settings", sa.Column("chat_title", sa.String(120)))
    op.add_column("chatbot_settings", sa.Column("welcome_heading", sa.String(200)))
    op.add_column("chatbot_settings", sa.Column("welcome_message", sa.Text()))
    op.add_column("chatbot_settings", sa.Column("suggestions", postgresql.JSONB(), server_default="[]"))
    op.add_column("chatbot_settings", sa.Column("show_documents", sa.Boolean(), nullable=False, server_default="true"))


def downgrade() -> None:
    for column in ["show_documents", "suggestions", "welcome_message", "welcome_heading", "chat_title"]:
        op.drop_column("chatbot_settings", column)
