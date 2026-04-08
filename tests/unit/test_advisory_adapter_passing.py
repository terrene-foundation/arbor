"""Unit tests verifying adapter injection in both advisory endpoints (T125, M23).

Split per M23: one test per call site so a half-migration that wires /query
but forgets /stream fails loudly.

Uses AST inspection of advisory.py to verify the adapter-passing pattern
without requiring the full app stack (DataFlow, Kaizen, auth, etc.).
"""

from __future__ import annotations

import ast
import pathlib


def _get_advisory_ast() -> ast.Module:
    """Parse advisory.py into an AST."""
    advisory_path = (
        pathlib.Path(__file__).resolve().parents[2]
        / "src"
        / "hr_advisory"
        / "api"
        / "routers"
        / "advisory.py"
    )
    assert advisory_path.exists(), f"advisory.py not found at {advisory_path}"
    return ast.parse(advisory_path.read_text())


def _find_function(tree: ast.Module, name: str) -> ast.AsyncFunctionDef | None:
    """Find an async function definition by name."""
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    return None


def _function_calls_build_adapter(func_node: ast.AsyncFunctionDef) -> bool:
    """Check that the function body contains a call to build_adapter_from_context."""
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            # Direct call: build_adapter_from_context(...)
            if isinstance(node.func, ast.Name) and node.func.id == "build_adapter_from_context":
                return True
            # Attribute call: module.build_adapter_from_context(...)
            if (
                isinstance(node.func, ast.Attribute)
                and node.func.attr == "build_adapter_from_context"
            ):
                return True
    return False


def _function_passes_adapter_to_delegate_config(func_node: ast.AsyncFunctionDef) -> bool:
    """Check that DelegateConfig(...) is called with adapter= keyword."""
    for node in ast.walk(func_node):
        if isinstance(node, ast.Call):
            func = node.func
            is_delegate_config = (isinstance(func, ast.Name) and func.id == "DelegateConfig") or (
                isinstance(func, ast.Attribute) and func.attr == "DelegateConfig"
            )
            if is_delegate_config:
                for kw in node.keywords:
                    if kw.arg == "adapter":
                        return True
    return False


class TestQueryEndpointAdapterPassing:
    """advisory_query must build and pass an adapter to DelegateConfig."""

    def test_query_endpoint_calls_build_adapter_from_context(self) -> None:
        """advisory_query calls build_adapter_from_context."""
        tree = _get_advisory_ast()
        func = _find_function(tree, "advisory_query")
        assert func is not None, "advisory_query function not found"
        assert _function_calls_build_adapter(func), (
            "advisory_query does not call build_adapter_from_context — "
            "BYOK adapter injection is missing from the /query endpoint"
        )

    def test_query_endpoint_passes_adapter_to_delegate_config(self) -> None:
        """advisory_query passes adapter= to DelegateConfig."""
        tree = _get_advisory_ast()
        func = _find_function(tree, "advisory_query")
        assert func is not None, "advisory_query function not found"
        assert _function_passes_adapter_to_delegate_config(func), (
            "advisory_query does not pass adapter= to DelegateConfig — "
            "the Delegate will fall back to env-based resolution"
        )


class TestStreamEndpointAdapterPassing:
    """advisory_stream must build and pass an adapter to DelegateConfig."""

    def test_stream_endpoint_calls_build_adapter_from_context(self) -> None:
        """advisory_stream calls build_adapter_from_context."""
        tree = _get_advisory_ast()
        func = _find_function(tree, "advisory_stream")
        assert func is not None, "advisory_stream function not found"
        assert _function_calls_build_adapter(func), (
            "advisory_stream does not call build_adapter_from_context — "
            "BYOK adapter injection is missing from the /stream endpoint"
        )

    def test_stream_endpoint_passes_adapter_to_delegate_config(self) -> None:
        """advisory_stream passes adapter= to DelegateConfig."""
        tree = _get_advisory_ast()
        func = _find_function(tree, "advisory_stream")
        assert func is not None, "advisory_stream function not found"
        assert _function_passes_adapter_to_delegate_config(func), (
            "advisory_stream does not pass adapter= to DelegateConfig — "
            "the Delegate will fall back to env-based resolution"
        )
