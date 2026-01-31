from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
import os
import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")


class WaitingNotificationInput(BaseModel):
    """Input for sending waiting notification."""
    gas_price: float = Field(..., description="Current gas price in gwei")
    wait_minutes: int = Field(..., description="Estimated wait time in minutes")
    override_link: str = Field(..., description="URL for CEO to force execution")
    to_email: str = Field(..., description="CEO email address")


class CompletionNotificationInput(BaseModel):
    """Input for sending completion notification."""
    amount: float = Field(..., description="Total amount distributed")
    employee_count: int = Field(..., description="Number of employees paid")
    tx_hash: str = Field(..., description="Transaction hash")
    to_email: str = Field(..., description="CEO email address")


class WaitingNotificationTool(BaseTool):
    name: str = "Send Waiting Notification"
    description: str = "Sends email to CEO when gas prices are elevated and payroll is waiting."
    args_schema: Type[BaseModel] = WaitingNotificationInput

    def _run(self, gas_price: float, wait_minutes: int, override_link: str, to_email: str) -> dict:
        html_body = f"""
        <div style="font-family: Arial; max-width: 600px; margin: auto;">
            <h1>⏳ Payroll Waiting</h1>
            <p>Gas price is elevated: <strong>{gas_price:.2f} gwei</strong></p>
            <p>Estimated wait: {wait_minutes} minutes</p>
            <a href="{override_link}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none;">⚡ Pay Anyway</a>
        </div>
        """
        try:
            email = resend.Emails.send({
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": f"ArcFlow: Gas elevated - {gas_price:.2f} gwei",
                "html": html_body,
            })
            return {"status": "success", "id": email.get("id")}
        except Exception as e:
            return {"status": "error", "message": str(e)}


class CompletionNotificationTool(BaseTool):
    name: str = "Send Completion Notification"
    description: str = "Sends email to CEO when payroll has been successfully executed."
    args_schema: Type[BaseModel] = CompletionNotificationInput

    def _run(self, amount: float, employee_count: int, tx_hash: str, to_email: str) -> dict:
        html_body = f"""
        <div style="font-family: Arial; max-width: 600px; margin: auto;">
            <h1>✅ Payroll Complete</h1>
            <p>Amount: <strong>${amount:,.2f}</strong></p>
            <p>Employees paid: {employee_count}</p>
            <p>Transaction: <code>{tx_hash}</code></p>
        </div>
        """
        try:
            email = resend.Emails.send({
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": "ArcFlow: Payroll Completed Successfully",
                "html": html_body,
            })
            return {"status": "success", "id": email.get("id")}
        except Exception as e:
            return {"status": "error", "message": str(e)}