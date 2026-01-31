"""FastAPI application for ArcFlow Payroll."""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="ArcFlow Payroll API",
    description="Autonomous treasury management and payroll execution",
    version="1.0.0"
)


class TriggerRequest(BaseModel):
    """Request body for triggering payroll."""
    payroll_id: str
    contract_address: str
    chain_id: int = 84532
    source_chain_id: int = 84532
    wallet_id: str = "your-circle-wallet-id"
    pool_address: str = "0x123...abc"
    owner_address: str = "0xABC...123"
    ceo_email: str = "williamikeji@gmail.com"


class OverrideRequest(BaseModel):
    """Request body for CEO override."""
    payroll_id: str
    override_token: str
    force_execute: bool = True


class TriggerResponse(BaseModel):
    """Response for trigger endpoint."""
    status: str
    payroll_id: str
    message: str


def run_crew_async(inputs: dict):
    """Run crew in background."""
    from quaestor.crew import QuaestorCrew
    try:
        QuaestorCrew().crew().kickoff(inputs=inputs)
    except Exception as e:
        print(f"Crew execution error: {e}")


@app.get("/health")
async def health():
    """Health check endpoint with dependency checks."""
    checks = {
        "api": "ok",
        "alchemy_api_key": "ok" if os.getenv("ALCHEMY_API_KEY") else "missing",
        "resend_api_key": "ok" if os.getenv("RESEND_API_KEY") else "missing",
        "openai_api_key": "ok" if os.getenv("OPENAI_API_KEY") else "missing",
    }
    
    all_ok = all(v == "ok" for v in checks.values())
    
    return {
        "status": "ok" if all_ok else "degraded",
        "service": "arcflow-payroll",
        "checks": checks
    }


@app.post("/trigger", response_model=TriggerResponse)
async def trigger_payroll(request: TriggerRequest, background_tasks: BackgroundTasks):
    """
    Trigger payroll execution. Called by Gelato or manually.
    Runs crew in background to avoid timeout.
    """
    inputs = {
        "payroll_id": request.payroll_id,
        "contract_address": request.contract_address,
        "chain_id": request.chain_id,
        "source_chain_id": request.source_chain_id,
        "wallet_id": request.wallet_id,
        "pool_address": request.pool_address,
        "owner_address": request.owner_address,
        "ceo_email": request.ceo_email,
        "override_link": f"https://arcflow.io/override/{request.payroll_id}",
        "hours_waited": 0,
        "recipient_count": 0,  # Will be fetched by agent
    }
    
    background_tasks.add_task(run_crew_async, inputs)
    
    return TriggerResponse(
        status="triggered",
        payroll_id=request.payroll_id,
        message="Payroll crew started in background"
    )


@app.post("/override")
async def ceo_override(request: OverrideRequest, background_tasks: BackgroundTasks):
    """
    CEO override endpoint. Forces payroll execution despite high gas.
    """
    # TODO: Validate override_token against stored tokens
    expected_token = os.getenv("OVERRIDE_SECRET", "dev-secret")
    
    if request.override_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid override token")
    
    # Force execute by setting gas threshold very high
    inputs = {
        "payroll_id": request.payroll_id,
        "chain_id": 8453,
        "source_chain_id": 8453,
        "wallet_id": "your-circle-wallet-id",
        "pool_address": "0x123...abc",
        "owner_address": "0xABC...123",
        "contract_address": "0xPayrollContract...",
        "ceo_email": "williamikeji@gmail.com",
        "override_link": "",
        "hours_waited": 0,
        "recipient_count": 0,
        "force_execute": True,  # Agent should check this
    }
    
    background_tasks.add_task(run_crew_async, inputs)
    
    return {
        "status": "override_accepted",
        "payroll_id": request.payroll_id,
        "message": "Payroll will be executed immediately"
    }


@app.get("/status/{payroll_id}")
async def get_status(payroll_id: str):
    """
    Get payroll execution status.
    TODO: Integrate with database or state store.
    """
    # Mock response - in production, fetch from DB
    return {
        "payroll_id": payroll_id,
        "status": "pending",
        "message": "Status tracking not yet implemented"
    }
