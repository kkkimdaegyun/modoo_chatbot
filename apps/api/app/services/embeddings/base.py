from abc import ABC, abstractmethod


class EmbeddingService(ABC):
    @abstractmethod
    def encode_documents(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    def encode_query(self, text: str) -> list[float]: ...

    @abstractmethod
    def health_check(self) -> dict[str, object]: ...
