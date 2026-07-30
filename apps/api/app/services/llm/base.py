from abc import ABC, abstractmethod
from collections.abc import Iterator


class LLMProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str) -> str: ...

    @abstractmethod
    def generate_stream(self, prompt: str) -> Iterator[str]: ...

    @abstractmethod
    def health_check(self) -> dict[str, object]: ...
