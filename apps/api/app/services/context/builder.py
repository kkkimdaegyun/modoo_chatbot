from typing import Any
from xml.sax.saxutils import escape

from app.core.config import settings


class ContextBuilder:
    def build(self, results: list[dict[str, Any]], max_tokens: int | None = None) -> tuple[str, list[dict[str, Any]], int]:
        budget = max_tokens or settings.max_context_tokens
        selected: list[dict[str, Any]] = []
        total_tokens = 0
        blocks: list[str] = []
        for item in results:
            token_count = int(item.get("token_count") or max(1, len(item["content"]) // 3))
            if total_tokens + token_count > budget:
                continue
            # 토큰 예산에 걸려 건너뛴 항목이 있어도 번호가 비지 않도록 선택된 순서대로 매긴다.
            # (S1, S2, S4 처럼 비면 화면의 [1][2][3] 칩과 각주 번호가 어긋난다)
            source_id = f"S{len(selected) + 1}"
            selected_item = {**item, "source_id": source_id}
            selected.append(selected_item)
            total_tokens += token_count
            metadata = []
            if item.get("page_number"):
                metadata.append(f"<page>{item['page_number']}</page>")
            if item.get("section_title"):
                metadata.append(f"<section>{escape(str(item['section_title']))}</section>")
            blocks.append(
                f'<source id="{source_id}">\n'
                f"<type>{escape(str(item.get('source_type', 'document')))}</type>\n"
                f"<document>{escape(str(item['document_name']))}</document>\n"
                f"{''.join(metadata)}\n"
                f"<content>{escape(str(item['content']))}</content>\n"
                "</source>"
            )
        return "<retrieved_context>\n" + "\n".join(blocks) + "\n</retrieved_context>", selected, total_tokens

    @staticmethod
    def public_sources(selected: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "id": item["source_id"],
                "document_name": item["document_name"],
                "page_number": item.get("page_number"),
                "section_title": item.get("section_title"),
                "excerpt": item["content"][:320],
                "source_type": item.get("source_type", "document"),
            }
            for item in selected
        ]
