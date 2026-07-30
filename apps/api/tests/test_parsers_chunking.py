from pathlib import Path

from app.services.chunking import StructureAwareChunker
from app.services.parsers import DocumentParser, ParsedBlock


def test_txt_ingestion_preserves_sections(tmp_path: Path) -> None:
    path = tmp_path / "policy.txt"
    path.write_text("# 환불 정책\n\n구매일로부터 7일 이내 신청할 수 있습니다.", encoding="utf-8")
    parsed = DocumentParser().parse(path)
    assert parsed.blocks[0].section_title == "환불 정책"
    assert parsed.page_count == 1
    assert "7일" in parsed.blocks[1].text


def test_qa_csv_detection(tmp_path: Path) -> None:
    path = tmp_path / "qa.csv"
    path.write_text("question,answer,category\n환불은?,7일 이내입니다.,환불\n", encoding="utf-8")
    parsed = DocumentParser().parse(path)
    assert parsed.source_type == "qa"
    assert parsed.qa_items[0]["category"] == "환불"
    assert "질문: 환불은?" in parsed.blocks[0].text


def test_chunk_metadata_is_preserved() -> None:
    blocks = [
        ParsedBlock("환불 정책입니다. " * 20, page_number=3, section_title="환불", paragraph_number=1),
        ParsedBlock("구매일로부터 7일 이내입니다. " * 20, page_number=3, section_title="환불", paragraph_number=2),
    ]
    chunks = StructureAwareChunker(target=30, maximum=50, overlap=5, minimum=5).chunk(blocks)
    assert chunks
    assert all(chunk.page_number == 3 for chunk in chunks)
    assert all(chunk.section_title == "환불" for chunk in chunks)
    assert all(chunk.token_count <= 60 for chunk in chunks)


def test_pdf_without_text_requires_ocr(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "scan.pdf"
    path.write_bytes(b"%PDF")

    class Page:
        def extract_text(self):
            return ""

    class Reader:
        is_encrypted = False
        pages = [Page()]

    monkeypatch.setattr("pypdf.PdfReader", lambda _: Reader())
    try:
        DocumentParser().parse(path)
    except ValueError as exc:
        assert "OCR" in str(exc)
    else:
        raise AssertionError("scanned PDF must be rejected")
