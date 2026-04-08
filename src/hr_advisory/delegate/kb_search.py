"""KB search with Python content fallback.

The Delegate tool layer uses these functions to search the knowledge base.
"""


def _search_kb_with_fallback(query: str, domain: str | None = None, limit: int = 5) -> list:
    """Search KB via DataFlow, falling back to Python content modules if DB is empty."""
    # Try the DB first
    try:
        from hr_advisory.kb.admin import search_provisions

        results = search_provisions(query=query, domain=domain, limit=limit)
        if results:
            return results
    except Exception:
        pass

    # Fallback: search the Python content modules directly
    return _search_python_kb(query, domain, limit)


def _search_python_kb(query: str, domain: str | None = None, limit: int = 5) -> list:
    """Search provisions from Python KB content modules (no DB needed)."""
    from hr_advisory.kb.content import (
        employment_act,
        cpf,
        foreign_manpower,
        tafep,
        remaining_domains,
    )
    from hr_advisory.kb.content import industrial_relations

    # Map domain filter names to content modules
    domain_modules = {
        "Employment Act": [employment_act],
        "CPF": [cpf],
        "Foreign Manpower": [foreign_manpower],
        "Fair Employment": [tafep],
        "Workplace Safety and Health": [remaining_domains],
        "Tax": [remaining_domains],
        "Industrial Relations": [industrial_relations],
        "Retrenchment": [industrial_relations],
    }

    all_modules = [
        employment_act,
        cpf,
        foreign_manpower,
        tafep,
        remaining_domains,
        industrial_relations,
    ]
    modules_to_search = domain_modules.get(domain, []) if domain else all_modules

    # Collect all provisions from selected modules
    all_provisions = []
    for mod in modules_to_search:
        try:
            bundle = mod.get_bundle()
            for prov in bundle.get("provisions", []):
                all_provisions.append(prov)
        except Exception:
            continue

    if not all_provisions:
        return []

    # Score by keyword overlap
    query_lower = query.lower()
    stop = {
        "a",
        "an",
        "the",
        "is",
        "are",
        "was",
        "were",
        "be",
        "have",
        "has",
        "do",
        "does",
        "did",
        "will",
        "would",
        "can",
        "need",
        "must",
        "i",
        "me",
        "my",
        "we",
        "you",
        "your",
        "he",
        "she",
        "it",
        "they",
        "this",
        "that",
        "what",
        "which",
        "who",
        "how",
        "when",
        "where",
        "why",
        "if",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "with",
        "by",
        "from",
        "about",
        "not",
        "no",
        "or",
        "and",
        "but",
        "so",
        "as",
    }
    query_words = [w for w in query_lower.split() if len(w) > 2 and w not in stop]

    if not query_words:
        return all_provisions[:limit]

    scored = []
    for prov in all_provisions:
        searchable = " ".join(
            str(prov.get(f, "")) for f in ("section", "title", "formal_text", "plain_summary")
        ).lower()
        score = sum(1 for w in query_words if w in searchable)
        if score > 0:
            scored.append((score, prov))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:limit]]
