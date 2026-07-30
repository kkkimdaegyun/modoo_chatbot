import re
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings
from app.services.parsers import ParsedBlock


@dataclass(slots=True)
class Chunk:
    content: str
    token_count: int
    chunk_index: int
    page_number: int | None = None
    section_title: str | None = None
    sheet_name: str | None = None
    row_number: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class TokenCounter:
    def __init__(self) -> None:
        try:
            import tiktoken
            self.encoding = tiktoken.get_encoding("cl100k_base")
        except Exception:
            self.encoding = None

    def count(self, text: str) -> int:
        if self.encoding:
            return len(self.encoding.encode(text))
        return max(1, int(len(text) / 2.4))


class StructureAwareChunker:
    def __init__(self, target: int | None = None, maximum: int | None = None, overlap: int | None = None, minimum: int | None = None) -> None:
        self.target = target or settings.chunk_target_tokens
        self.maximum = maximum or settings.chunk_max_tokens
        self.overlap = overlap if overlap is not None else settings.chunk_overlap_tokens
        self.minimum = minimum or settings.chunk_min_tokens
        self.tokens = TokenCounter()

    def chunk(self, blocks: list[ParsedBlock]) -> list[Chunk]:
        atomic: list[ParsedBlock] = []
        for block in blocks:
            atomic.extend(self._split_long_block(block))
        groups: list[list[ParsedBlock]] = []
        current: list[ParsedBlock] = []
        current_tokens = 0
        for block in atomic:
            count = self.tokens.count(block.text)
            boundary_changed = current and (
                block.page_number != current[-1].page_number or
                (block.section_title and block.section_title != current[-1].section_title)
            )
            if current and (current_tokens + count > self.target or boundary_changed and current_tokens >= self.minimum):
                groups.append(current)
                current = self._overlap_blocks(current)
                current_tokens = sum(self.tokens.count(item.text) for item in current)
            current.append(block)
            current_tokens += count
            if current_tokens >= self.maximum:
                groups.append(current)
                current = self._overlap_blocks(current)
                current_tokens = sum(self.tokens.count(item.text) for item in current)
        if current:
            current_size = sum(self.tokens.count(item.text) for item in current)
            previous_size = sum(self.tokens.count(item.text) for item in groups[-1]) if groups else 0
            if groups and current_size < self.minimum and previous_size + current_size <= self.maximum:
                groups[-1].extend(item for item in current if item not in groups[-1])
            else:
                groups.append(current)
        chunks = [self._make_chunk(group, index) for index, group in enumerate(groups)]
        return [chunk for chunk in chunks if chunk.content.strip()]

    def _split_long_block(self, block: ParsedBlock) -> list[ParsedBlock]:
        if self.tokens.count(block.text) <= self.maximum:
            return [block]
        sentences = [part.strip() for part in re.split(r"(?<=[.!?。！？다요])\s+|\n+", block.text) if part.strip()]
        output: list[ParsedBlock] = []
        current: list[str] = []
        for sentence in sentences:
            if current and self.tokens.count(" ".join(current + [sentence])) > self.maximum:
                output.append(self._clone(block, " ".join(current)))
                current = []
            if self.tokens.count(sentence) > self.maximum:
                size = max(200, int(len(sentence) * self.maximum / self.tokens.count(sentence)))
                output.extend(self._clone(block, sentence[i:i + size]) for i in range(0, len(sentence), size))
            else:
                current.append(sentence)
        if current:
            output.append(self._clone(block, " ".join(current)))
        return output

    def _overlap_blocks(self, blocks: list[ParsedBlock]) -> list[ParsedBlock]:
        if not self.overlap:
            return []
        selected: list[ParsedBlock] = []
        count = 0
        for block in reversed(blocks):
            block_tokens = self.tokens.count(block.text)
            if count + block_tokens > self.overlap:
                break
            selected.insert(0, block)
            count += block_tokens
        return selected

    def _make_chunk(self, blocks: list[ParsedBlock], index: int) -> Chunk:
        content = "\n\n".join(block.text for block in blocks)
        pages = sorted({block.page_number for block in blocks if block.page_number is not None})
        return Chunk(
            content=content,
            token_count=self.tokens.count(content),
            chunk_index=index,
            page_number=pages[0] if pages else None,
            section_title=next((block.section_title for block in blocks if block.section_title), None),
            sheet_name=next((block.sheet_name for block in blocks if block.sheet_name), None),
            row_number=next((block.row_number for block in blocks if block.row_number), None),
            metadata={"page_numbers": pages, "paragraph_numbers": [block.paragraph_number for block in blocks if block.paragraph_number]},
        )

    @staticmethod
    def _clone(block: ParsedBlock, text: str) -> ParsedBlock:
        return ParsedBlock(text=text, page_number=block.page_number, section_title=block.section_title, paragraph_number=block.paragraph_number, sheet_name=block.sheet_name, row_number=block.row_number, metadata=dict(block.metadata))
