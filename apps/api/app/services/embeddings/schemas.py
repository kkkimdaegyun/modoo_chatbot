from pydantic import BaseModel, field_validator


class EmbeddingVector(BaseModel):
    values: list[float]

    @field_validator("values")
    @classmethod
    def validate_values(cls, values: list[float]) -> list[float]:
        import math
        if not values or any(not math.isfinite(value) for value in values):
            raise ValueError("Embedding vector contains empty, NaN, or infinite values")
        return values
