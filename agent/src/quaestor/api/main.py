"""FastAPI application for ArcFlow Payroll."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from quaestor.api.scheduler import scheduler, start_scheduler, shutdown_scheduler

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI app."""
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(
    title="ArcFlow Payroll API",
    description="Autonomous treasury management and payroll execution",
    version="1.0.0",
    lifespan=lifespan
)


class TriggerRequest(BaseModel):
    """Request body for triggering payroll."""
    payroll_id: str
    contract_address: str
    chain_id: int = 84532  # Base Sepolia
    source_chain_id: int = 84532  # Base Sepolia
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
        "override_link": f"{os.getenv("APP_BASE_URL", "https://arcflow.io")}/override/{request.payroll_id}",
        "hours_waited": 0,
        "recipient_count": 0,  # Will be fetched by agent
    }
    
    background_tasks.add_task(run_crew_async, inputs)
    
    return TriggerResponse(
        status="triggered",
        payroll_id=request.payroll_id,
        message="Payroll crew started in background"
    )


@app.post("/trigger-daily")
async def trigger_daily_payrolls(background_tasks: BackgroundTasks):
    """
    Daily cron endpoint. Fetches all payrolls due today and triggers each.
    Call this from a daily cron job (e.g., every day at 9 AM).
    """
    import asyncio
    from quaestor.tools.treasury_tools import GetDuePayrollsTool
    
    # Fetch all payrolls due today
    due_payrolls_result = GetDuePayrollsTool()._run()
    due_payrolls = due_payrolls_result.get("payrolls", [])
    
    triggered = []
    for payroll in due_payrolls:
        inputs = {
            "payroll_id": payroll["payroll_id"],
            "contract_address": payroll["contract_address"],
            "chain_id": payroll.get("chain_id", 84532),
            "source_chain_id": payroll.get("chain_id", 84532),
            "wallet_id": "your-circle-wallet-id",
            "pool_address": payroll.get("pool_address", "0x..."),
            "owner_address": payroll.get("owner_address", "0x..."),
            "ceo_email": payroll.get("ceo_email", "williamikeji@gmail.com"),
            "override_link": f"{os.getenv('APP_BASE_URL', 'https://arcflow.io')}/override/{payroll['payroll_id']}",
            "hours_waited": 0,
            "recipient_count": 0,
        }
        background_tasks.add_task(run_crew_async, inputs)
        triggered.append(payroll["payroll_id"])
        
        # Delay between triggers to avoid OpenAI rate limits
        if len(due_payrolls) > 1:
            await asyncio.sleep(5)
    
    return {
        "status": "daily_trigger_complete",
        "date": due_payrolls_result.get("date"),
        "triggered_count": len(triggered),
        "payroll_ids": triggered
    }


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


class ScheduleRetryRequest(BaseModel):
    """Request body for scheduling a retry."""
    payroll_id: str
    wait_minutes: int = 15
    chain_id: int = 84532  # Base Sepolia
    contract_address: str = "0xPayrollContract..."


@app.post("/schedule-retry")
async def schedule_retry(request: ScheduleRetryRequest):
    """
    Schedule a delayed payroll retry using APScheduler.
    Called by the agent when gas is high.
    """
    run_time = datetime.now() + timedelta(minutes=request.wait_minutes)
    
    inputs = {
        "payroll_id": request.payroll_id,
        "contract_address": request.contract_address,
        "chain_id": request.chain_id,
        "source_chain_id": request.chain_id,
        "wallet_id": "your-circle-wallet-id",
        "pool_address": "0x123...abc",
        "owner_address": "0xABC...123",
        "ceo_email": "williamikeji@gmail.com",
        "override_link": f"{os.getenv("APP_BASE_URL", "https://arcflow.io")}/override/{request.payroll_id}",
        "hours_waited": 0,
        "recipient_count": 0,
    }
    
    job = scheduler.add_job(
        run_crew_async,
        trigger="date",
        run_date=run_time,
        args=[inputs],
        id=f"retry_{request.payroll_id}_{int(run_time.timestamp())}"
    )
    
    return {
        "status": "scheduled",
        "payroll_id": request.payroll_id,
        "retry_at": run_time.isoformat(),
        "job_id": job.id,
        "wait_minutes": request.wait_minutes
    }


@app.get("/scheduled-jobs")
async def list_scheduled_jobs():
    """List all scheduled retry jobs."""
    jobs = scheduler.get_jobs()
    return {
        "count": len(jobs),
        "jobs": [
            {
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None
            }
            for job in jobs
        ]
    }
