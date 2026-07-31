"""답변 소요 시간을 최근 것만 메모리에 모아 두는 아주 얇은 계측기.

관리자 화면의 "평균 답변 시간" 카드에만 쓰이므로 DB에 남기지 않는다.
프로세스를 재시작하면 값이 초기화된다.
"""

import time
from collections import deque
from threading import Lock

_MAX_SAMPLES = 50
_samples: deque[float] = deque(maxlen=_MAX_SAMPLES)
_lock = Lock()


def record_answer_seconds(seconds: float) -> None:
    """질문 하나를 끝까지 답변하는 데 걸린 시간을 기록한다."""
    if seconds <= 0:
        return
    with _lock:
        _samples.append(seconds)


def answer_time_summary() -> dict[str, object]:
    with _lock:
        values = list(_samples)
    if not values:
        return {"answer_samples": 0, "answer_seconds_avg": None, "answer_seconds_last": None}
    return {
        "answer_samples": len(values),
        "answer_seconds_avg": round(sum(values) / len(values), 1),
        "answer_seconds_last": round(values[-1], 1),
    }
