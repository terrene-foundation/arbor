"""Kaizen compatibility shims for kailash-kaizen 2.3.1.

Extracted from agents/specialists/_base.py during Phase 1A cleanup (T110).
Agent(model, system_prompt) replaced old BaseAgent(agent_id, config, signature).
Agent.run(task) is task-based; this mixin provides run(**kwargs) -> run_sync(task).
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class _KaizenCompatMixin:
    """Compatibility shims for kailash-kaizen 2.3.1.

    Agent(model, system_prompt) replaced old BaseAgent(agent_id, config, signature).
    Agent.run(task) is task-based; this mixin provides run(**kwargs) -> run_sync(task).
    """

    shared_memory: Any = None
    agent_id: str = ""

    def run(self, **inputs: Any) -> Dict[str, Any]:
        """Convert keyword inputs to a task string for Agent.run_sync(task)."""
        task = json.dumps(inputs, default=str)
        result = super().run_sync(task)  # type: ignore[misc]
        text = result.text if hasattr(result, "text") else str(result)
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return {"answer_text": text}

    def write_to_memory(
        self,
        content: Any,
        tags: Optional[List[str]] = None,
        importance: float = 0.5,
        segment: str = "execution",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Write insights to shared memory if available."""
        if not self.shared_memory:
            return
        content_str = json.dumps(content) if isinstance(content, (dict, list)) else str(content)
        insight: Dict[str, Any] = {
            "agent_id": getattr(self, "agent_id", ""),
            "content": content_str,
            "tags": tags or [],
            "importance": importance,
            "segment": segment,
            "metadata": metadata or {},
        }
        if hasattr(self.shared_memory, "write_insight"):
            self.shared_memory.write_insight(insight)

    def extract_str(self, result: Dict[str, Any], field_name: str, default: str = "") -> str:
        """Extract a string field from result with type safety."""
        field_value = result.get(field_name, default)
        return str(field_value) if field_value is not None else default

    def extract_list(
        self, result: Dict[str, Any], field_name: str, default: Optional[List] = None
    ) -> List:
        """Extract a list field from result, parsing JSON strings if needed."""
        if default is None:
            default = []
        field_value = result.get(field_name, default)
        if isinstance(field_value, list):
            return field_value
        if isinstance(field_value, str):
            try:
                parsed = json.loads(field_value) if field_value else default
                return parsed if isinstance(parsed, list) else default
            except Exception:
                return default
        return default

    def extract_dict(
        self, result: Dict[str, Any], field_name: str, default: Optional[Dict] = None
    ) -> Dict:
        """Extract a dict field from result, parsing JSON strings if needed."""
        if default is None:
            default = {}
        field_value = result.get(field_name, default)
        if isinstance(field_value, dict):
            return field_value
        if isinstance(field_value, str):
            try:
                parsed = json.loads(field_value) if field_value else default
                return parsed if isinstance(parsed, dict) else default
            except Exception:
                return default
        return default
