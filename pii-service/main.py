"""PII redaction service: thin HTTP wrapper over Microsoft Presidio.
POST /redact {"text": "..."} -> {"text": "...redacted...", "entities": [{"type","start","end","score"}]}
Placeholders look like <EMAIL_ADDRESS>. Technical values (mm, f/2.8, model codes) are left alone."""
from fastapi import FastAPI
from pydantic import BaseModel, Field
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

ENTITIES = ["EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "US_SSN", "IP_ADDRESS",
            "IBAN_CODE", "US_PASSPORT", "US_BANK_NUMBER", "IN_PAN", "IN_AADHAAR",
            "IN_PASSPORT", "IN_VOTER", "PERSON"]
MIN_SCORE = 0.5

nlp = NlpEngineProvider(nlp_configuration={
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_md"}],
}).create_engine()
analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])
# Presidio's built-ins reject many real-world formats; add plain pattern recognizers.
# ponytail: regex only (no checksum) for these; false positives are tolerable, misses are not.
for name, regex, score in [
    ("IN_MOBILE", r"(?<![\d.])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\d.])", 0.7),
    ("US_PHONE", r"(?<!\d)\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?!\d)", 0.7),
    ("IN_PAN", r"(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])", 0.85),
    ("IN_AADHAAR", r"(?<![\d.])\d{4}\s\d{4}\s\d{4}(?![\d.])", 0.7),
    ("PASSPORT", r"(?<![A-Za-z0-9])[A-Z]\d{7}(?![A-Za-z0-9])", 0.6),
    ("IN_MOBILE_SPLIT", r"(?<![\d.])[6-9]\d{4}[\s-]\d{5}(?![\d.])", 0.7),
    ("PHONE_GROUPED", r"(?<![\d.])(?:\+\d{1,3}[\s-])?\(?\d{2,5}\)?[\s-]\d{3,5}[\s-]\d{4}(?![\d.])", 0.6),
    ("US_SSN", r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)", 0.85),
    # AMEX: 15-digit starting with 34 or 37
    ("CREDIT_CARD", r"(?<!\d)3[47]\d{13}(?!\d)", 0.85),
    # Compact IBAN (no spaces): e.g. DE89370400440532013000
    ("IBAN_CODE", r"(?<![A-Z0-9])[A-Z]{2}\d{2}[A-Z0-9]{11,30}(?![A-Z0-9])", 0.75),
    # Two-word capitalized names (First Last) as fallback when spaCy NER misses them
    ("PERSON", r"\b(?:Dr\.\s+)?[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b", 0.55),
]:
    analyzer.registry.add_recognizer(PatternRecognizer(supported_entity=name, patterns=[Pattern(name, regex, score)]))
ENTITIES.extend(["IN_MOBILE", "US_PHONE", "PASSPORT", "IN_MOBILE_SPLIT", "PHONE_GROUPED"])
anonymizer = AnonymizerEngine()
app = FastAPI()

class In(BaseModel):
    text: str = Field(max_length=20000)

@app.get("/health")
def health():
    return {"ok": True}

class Batch(BaseModel):
    texts: list[str] = Field(max_length=200)

@app.post("/redact-batch")
def redact_batch(body: Batch):
    return {"texts": [redact(In(text=t[:20000]))["text"] for t in body.texts]}

@app.post("/redact")
def redact(body: In):
    # Default region for bare national phone numbers; override per deployment.
    found = analyzer.analyze(text=body.text, language="en", entities=ENTITIES,
                             score_threshold=MIN_SCORE)
    # Product codes (LM8HC, F2.8) are not people: drop PERSON spans containing digits
    # or written as a single all-caps token.
    def _not_person(r):
        span = body.text[r.start:r.end]
        return not (r.entity_type == "PERSON" and (any(c.isdigit() for c in span) or (span.isupper() and " " not in span)))
    found = [r for r in found if _not_person(r)]
    ops = {e: OperatorConfig("replace", {"new_value": f"<{e}>"}) for e in ENTITIES}
    out = anonymizer.anonymize(text=body.text, analyzer_results=found, operators=ops)
    return {"text": out.text,
            "entities": [{"type": r.entity_type, "start": r.start, "end": r.end, "score": round(r.score, 2)} for r in found]}
