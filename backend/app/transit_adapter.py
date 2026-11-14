from .schemas import Problem


def adapt_transit(raw):
    allowed = {
        "schema_version",
        "title",
        "provenance",
        "calendar",
        "vehicles",
        "operators",
        "passenger_groups",
        "service_types",
        "service_blocks",
        "transfer_groups",
        "policies",
        "corridors",
    }
    if not isinstance(raw, dict) or set(raw) - allowed:
        raise ValueError(
            "Expected documented structural transit proxy format; arbitrary GTFS is not supported"
        )
    p = dict(
        schema_version=raw["schema_version"],
        id="TRANSIT_PROXY",
        title=raw["title"],
        institution="Transit-derived structural scheduling proxy",
        provenance={
            **raw["provenance"],
            "kind": "adapted",
            "description": raw["provenance"]["description"]
            + " Adapted explicit resource-allocation constraints; not academic enrollment evidence.",
        },
        calendar=raw["calendar"],
        rooms=raw["vehicles"],
        faculty=raw["operators"],
        groups=raw["passenger_groups"],
        courses=raw["service_types"],
        events=raw["service_blocks"],
        baskets=raw["transfer_groups"],
        policies=raw["policies"],
    )
    return Problem.model_validate(p).model_dump()
