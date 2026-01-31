from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field
import os
import resend
from dotenv import load_dotenv
from quaestor.tools.email_templates import (
    waiting_template,
    completion_template,
    insufficient_funds_template
)


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
        html_body = waiting_template(gas_price, wait_minutes, override_link)
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
        html_body = completion_template(amount, employee_count, tx_hash)
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

class InsufficientFundsNotificationInput(BaseModel):
    """Input for sending insufficient funds notification."""
    required_amount: float = Field(..., description="Total required for payroll")
    available_funds: float = Field(..., description="Available funds in treasury")
    to_email: str = Field(..., description="CEO email address")


class InsufficientFundsNotificationTool(BaseTool):
    name: str = "Send Insufficient Funds Notification"
    description: str = "Sends email to CEO when treasury has insufficient funds for payroll."
    args_schema: Type[BaseModel] = InsufficientFundsNotificationInput

    def _run(self, required_amount: float, available_funds: float, to_email: str) -> dict:
        shortfall = required_amount - available_funds
        html_body = insufficient_funds_template(required_amount, available_funds, shortfall)
        try:
            email = resend.Emails.send({
                "from": FROM_EMAIL,
                "to": [to_email],
                "subject": "ArcFlow: Insufficient Funds for Payroll",
                "html": html_body,
            })
            return {"status": "success", "id": email.get("id")}
        except Exception as e:
            return {"status": "error", "message": str(e)}