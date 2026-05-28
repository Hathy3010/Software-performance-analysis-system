from fastapi import APIRouter, HTTPException
from app.controller import DemoController
from app.scenarios import SCENARIO_REGISTRY

router = APIRouter(prefix="/demo", tags=["demo-scenarios"])


@router.get("/list")
def list_scenarios():
    """List all available demo scenarios with descriptions."""
    return {
        name: {"description": desc}
        for name, (desc, _) in SCENARIO_REGISTRY.items()
    }


@router.get("/status")
def get_status():
    """Get currently active scenario and its live effect state."""
    return DemoController.get().status()


@router.post("/{scenario}/start")
async def start_scenario(scenario: str):
    """
    Start a demo scenario. If another scenario is running it is stopped first.
    Only ONE scenario can be active at a time.
    """
    if scenario not in SCENARIO_REGISTRY:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario '{scenario}'. Available: {sorted(SCENARIO_REGISTRY)}",
        )
    desc, fn = SCENARIO_REGISTRY[scenario]
    await DemoController.get().start(scenario, desc, fn)
    return {
        "started": scenario,
        "description": desc,
        "stop_with": f"POST /demo/{scenario}/stop  or  POST /demo/stop",
    }


@router.post("/{scenario}/stop")
async def stop_named_scenario(scenario: str):
    """Stop a specific scenario (errors if a different one is running)."""
    ctrl = DemoController.get()
    if ctrl.active and ctrl.active.name != scenario:
        raise HTTPException(
            status_code=400,
            detail=f"Active scenario is '{ctrl.active.name}', not '{scenario}'. "
                   f"Use POST /demo/stop to force-stop any scenario.",
        )
    stopped = await ctrl.stop()
    return {"stopped": stopped or "nothing_was_running"}


@router.post("/stop")
async def stop_any_scenario():
    """Stop whatever scenario is currently running."""
    stopped = await DemoController.get().stop()
    return {"stopped": stopped or "nothing_was_running"}
