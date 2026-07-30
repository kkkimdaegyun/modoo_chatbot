from pydantic import BaseModel, Field


class ConversationTurn(BaseModel):
    role: str
    content: str = Field(max_length=6000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    conversation_history: list[ConversationTurn] = Field(default_factory=list, max_length=12)


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, object]]
    conversation_id: str | None = None


class GeneratedAnswer(BaseModel):
    answer: str
    cited_source_ids: list[str] = Field(default_factory=list)

    def valid_source_ids(self, allowed: set[str]) -> list[str]:
        return [source_id for source_id in self.cited_source_ids if source_id in allowed]
