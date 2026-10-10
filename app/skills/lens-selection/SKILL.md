---
name: lens-selection
description: Pick candidate lenses from the catalog and compare them honestly.
---
# Lens selection

1. Distinguish a catalog listing/comparison from application suitability. For a listing, search the stated filters immediately; do not demand working distance or field of view to list catalog rows. For a suitability recommendation, establish sensor size, working distance, field of view (whole area vs smallest feature), mount and resolution; ask for missing essential information.
2. Use `lookup_model` / `search_knowledge` to find the right table or family, then `describe_table` and `get_table_knowledge` before `search_products`. Read the actual column meanings: MOD is minimum object distance, not modulation transfer. Do not infer working-distance suitability from it alone.
3. Search every grounded family/table; present up to 3-5 candidates with the exact model names and the specs that matter.
4. Explain trade-offs (field of view, distortion, working distance range, mount compatibility) and what could not be verified.
5. Cite each candidate using its returned sourceReferences ID. If fewer rows match than requested, state the exact count. Do not invent or duplicate candidates, or imply a match to a requirement that was not verified.
