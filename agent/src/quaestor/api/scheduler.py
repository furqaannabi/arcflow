"""Shared scheduler instance for the application."""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore

# Initialize scheduler with memory job store
jobstores = {
    'default': MemoryJobStore()
}

scheduler = AsyncIOScheduler(jobstores=jobstores)


def start_scheduler():
    """Start the scheduler if not already running."""
    if not scheduler.running:
        scheduler.start()
        print("✅ APScheduler started")


def shutdown_scheduler():
    """Shutdown the scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        print("⏹️ APScheduler stopped")
