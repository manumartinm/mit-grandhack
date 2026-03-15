import json
import math
import os
from typing import Any

import httpx
from sqlalchemy import text

from database import engine

try:
    import iris  # type: ignore
except Exception:  # pragma: no cover - optional dependency at runtime
    iris = None


class FHIRClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("IRIS_FHIR_BASE", "").rstrip("/")
        self.user = os.getenv("IRIS_USER", "_SYSTEM")
        self.password = os.getenv("IRIS_PASSWORD", "SYS")
        self.timeout = float(os.getenv("IRIS_HTTP_TIMEOUT", "10"))

    @property
    def enabled(self) -> bool:
        return bool(self.base_url)

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if not self.enabled:
            return {}
        url = f"{self.base_url}/{path.lstrip('/')}"
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(
                    method,
                    url,
                    auth=(self.user, self.password),
                    json=payload,
                    headers={"Content-Type": "application/fhir+json"},
                )
                response.raise_for_status()
                if not response.text:
                    return {}
                return response.json()
        except Exception as exc:
            print(f"WARNING: FHIR request failed ({method} {url}): {exc}")
            return {}

    def create_patient(self, patient_row: Any) -> str | None:
        if not self.enabled:
            return None
        payload = {
            "resourceType": "Patient",
            "active": True,
            "identifier": [
                {
                    "system": "https://pneumoscan.local/patients",
                    "value": str(getattr(patient_row, "id", "")),
                }
            ],
            "name": [{"text": getattr(patient_row, "full_name", "Unknown")}],
            "gender": (getattr(patient_row, "gender", None) or "unknown").lower(),
            "birthDate": getattr(patient_row, "date_of_birth", None),
        }
        body = self._request("POST", "Patient", payload)
        return body.get("id")

    def create_observation(self, fhir_patient_id: str, session_row: Any) -> str | None:
        if not self.enabled or not fhir_patient_id:
            return None
        payload = {
            "resourceType": "Observation",
            "status": "final",
            "code": {
                "text": "Respiratory screening risk summary",
            },
            "subject": {"reference": f"Patient/{fhir_patient_id}"},
            "valueString": json.dumps(
                {
                    "risk_bucket": getattr(session_row, "risk_bucket", None),
                    "confidence": getattr(session_row, "confidence", None),
                }
            ),
        }
        body = self._request("POST", "Observation", payload)
        return body.get("id")

    def get_patient_count(self) -> int:
        body = self._request("GET", "Patient?_summary=count")
        return int(body.get("total") or 0)

    def get_observation_count(self) -> int:
        body = self._request("GET", "Observation?_summary=count")
        return int(body.get("total") or 0)


class IRISVectorClient:
    def __init__(self) -> None:
        self.host = os.getenv("IRIS_HOST", "")
        self.port = int(os.getenv("IRIS_NATIVE_PORT", "1972"))
        self.namespace = os.getenv("IRIS_NAMESPACE", "USER")
        self.user = os.getenv("IRIS_USER", "_SYSTEM")
        self.password = os.getenv("IRIS_PASSWORD", "SYS")

    @property
    def enabled(self) -> bool:
        return bool(self.host) and iris is not None

    def _connect(self):
        if not self.enabled:
            return None
        try:
            return iris.connect(self.host, self.port, self.namespace, self.user, self.password)
        except Exception as exc:
            print(f"WARNING: IRIS SQL connection failed: {exc}")
            return None

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = 0.0
        norm_a = 0.0
        norm_b = 0.0
        for x, y in zip(a, b):
            dot += x * y
            norm_a += x * x
            norm_b += y * y
        if norm_a <= 0.0 or norm_b <= 0.0:
            return 0.0
        return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))

    def _ensure_mysql_fallback_table(self) -> None:
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS notes_vectors_fallback (
                          id BIGINT AUTO_INCREMENT PRIMARY KEY,
                          patient_id INT NOT NULL,
                          text_content TEXT NOT NULL,
                          record_type VARCHAR(100) NOT NULL,
                          embedding_json LONGTEXT NOT NULL,
                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                          INDEX idx_notes_vectors_patient (patient_id),
                          INDEX idx_notes_vectors_created (created_at)
                        )
                        """
                    )
                )
        except Exception as exc:
            print(f"WARNING: Could not ensure fallback vector table: {exc}")

    def _fallback_upsert(
        self, patient_id: int, text_value: str, record_type: str, embedding: list[float]
    ) -> int | None:
        self._ensure_mysql_fallback_table()
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    text(
                        """
                        INSERT INTO notes_vectors_fallback
                          (patient_id, text_content, record_type, embedding_json)
                        VALUES (:patient_id, :text_content, :record_type, :embedding_json)
                        """
                    ),
                    {
                        "patient_id": patient_id,
                        "text_content": text_value,
                        "record_type": record_type,
                        "embedding_json": json.dumps(embedding),
                    },
                )
                inserted = result.lastrowid
            return int(inserted) if inserted is not None else None
        except Exception as exc:
            print(f"WARNING: Could not insert fallback vector row: {exc}")
            return None

    def _fallback_search(
        self, query_embedding: list[float], patient_id: int | None = None, top_k: int = 5
    ) -> list[dict[str, Any]]:
        self._ensure_mysql_fallback_table()
        try:
            sql = """
                SELECT id, patient_id, text_content, record_type, embedding_json, created_at
                FROM notes_vectors_fallback
            """
            params: dict[str, Any] = {}
            if patient_id is not None:
                sql += " WHERE patient_id = :patient_id"
                params["patient_id"] = patient_id
            sql += " ORDER BY created_at DESC LIMIT 1000"
            with engine.begin() as conn:
                rows = conn.execute(text(sql), params).mappings().all()

            ranked: list[dict[str, Any]] = []
            for row in rows:
                try:
                    candidate = json.loads(row["embedding_json"])
                    candidate = [float(x) for x in candidate]
                except Exception:
                    continue
                similarity = self._cosine_similarity(query_embedding, candidate)
                ranked.append(
                    {
                        "id": int(row["id"]),
                        "patient_id": int(row["patient_id"]),
                        "text": row["text_content"],
                        "record_type": row["record_type"],
                        "similarity": float(similarity),
                    }
                )
            ranked.sort(key=lambda item: item["similarity"], reverse=True)
            return ranked[: max(top_k, 1)]
        except Exception as exc:
            print(f"WARNING: Could not run fallback vector search: {exc}")
            return []

    def ensure_table(self) -> None:
        # Always ensure fallback to keep demo flow unblocked.
        self._ensure_mysql_fallback_table()
        conn = self._connect()
        if conn is None:
            return
        try:
            cur = conn.cursor()
            cur.execute("CREATE SCHEMA IF NOT EXISTS PneumoScan")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS PneumoScan.NotesVectors (
                  ID BIGINT IDENTITY,
                  PatientId INT,
                  TextContent VARCHAR(2000),
                  RecordType VARCHAR(100),
                  Embedding VECTOR(DOUBLE,1536),
                  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (ID)
                )
                """
            )
            conn.commit()
        except Exception as exc:
            print(f"WARNING: Could not ensure IRIS vector table: {exc}")
        finally:
            conn.close()

    def upsert(self, patient_id: int, text: str, record_type: str, embedding: list[float]) -> int | None:
        text_value = text[:2000]
        record_type_value = record_type[:100]
        conn = self._connect()
        if conn is None:
            return self._fallback_upsert(patient_id, text_value, record_type_value, embedding)
        try:
            embedding_literal = json.dumps(embedding)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO PneumoScan.NotesVectors (PatientId, TextContent, RecordType, Embedding)
                VALUES (?, ?, ?, TO_VECTOR(?, DOUBLE))
                """,
                [patient_id, text_value, record_type_value, embedding_literal],
            )
            conn.commit()
            cur.execute("SELECT LAST_IDENTITY()")
            row = cur.fetchone()
            return int(row[0]) if row else None
        except Exception as exc:
            print(f"WARNING: Could not insert vector row: {exc}")
            return self._fallback_upsert(patient_id, text_value, record_type_value, embedding)
        finally:
            conn.close()

    def search(self, query_embedding: list[float], patient_id: int | None = None, top_k: int = 5) -> list[dict[str, Any]]:
        conn = self._connect()
        if conn is None:
            return self._fallback_search(query_embedding, patient_id=patient_id, top_k=top_k)
        try:
            embedding_literal = json.dumps(query_embedding)
            cur = conn.cursor()
            if patient_id is None:
                cur.execute(
                    """
                    SELECT TOP ? ID, PatientId, TextContent, RecordType,
                      1 - VECTOR_COSINE(Embedding, TO_VECTOR(?, DOUBLE)) AS similarity
                    FROM PneumoScan.NotesVectors
                    ORDER BY similarity DESC
                    """,
                    [max(top_k, 1), embedding_literal],
                )
            else:
                cur.execute(
                    """
                    SELECT TOP ? ID, PatientId, TextContent, RecordType,
                      1 - VECTOR_COSINE(Embedding, TO_VECTOR(?, DOUBLE)) AS similarity
                    FROM PneumoScan.NotesVectors
                    WHERE PatientId = ?
                    ORDER BY similarity DESC
                    """,
                    [max(top_k, 1), embedding_literal, patient_id],
                )
            rows = cur.fetchall()
            return [
                {
                    "id": row[0],
                    "patient_id": row[1],
                    "text": row[2],
                    "record_type": row[3],
                    "similarity": float(row[4]),
                }
                for row in rows
            ]
        except Exception as exc:
            print(f"WARNING: Could not run vector search: {exc}")
            return self._fallback_search(query_embedding, patient_id=patient_id, top_k=top_k)
        finally:
            conn.close()


fhir_client = FHIRClient()
iris_vector_client = IRISVectorClient()
