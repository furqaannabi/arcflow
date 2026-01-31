"""Email templates for ArcFlow notifications."""

# Base styles
BASE_CONTAINER = """
    font-family: 'Segoe UI', Arial, sans-serif;
    max-width: 600px;
    margin: auto;
    padding: 30px;
    border-radius: 10px;
"""

def waiting_template(gas_price: float, wait_minutes: int, override_link: str) -> str:
    return f"""
    <div style="{BASE_CONTAINER} background: #f8f9fa;">
        <h1 style="color: #212529; margin-bottom: 20px;">⏳ Payroll Waiting</h1>
        <p style="margin-bottom: 15px; font-size: 16px;">
            Gas price is elevated: <strong style="color: #dc3545;">{gas_price:.2f} gwei</strong>
        </p>
        <p style="margin-bottom: 25px; font-size: 16px;">
            Estimated wait: <strong>{wait_minutes} minutes</strong>
        </p>
        <a href="{override_link}" style="display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            ⚡ Pay Anyway
        </a>
    </div>
    """


def completion_template(amount: float, employee_count: int, tx_hash: str) -> str:
    return f"""
    <div style="{BASE_CONTAINER} background: #d4edda; border: 1px solid #28a745;">
        <h1 style="color: #155724; margin-bottom: 20px;">✅ Payroll Complete</h1>
        <p style="margin-bottom: 15px; font-size: 16px;">
            Amount: <strong>${amount:,.2f}</strong>
        </p>
        <p style="margin-bottom: 15px; font-size: 16px;">
            Employees paid: <strong>{employee_count}</strong>
        </p>
        <p style="margin-bottom: 0;">
            <code style="background: #c3e6cb; padding: 6px 10px; border-radius: 4px; font-size: 14px;">{tx_hash}</code>
        </p>
    </div>
    """


def insufficient_funds_template(required_amount: float, available_funds: float, shortfall: float) -> str:
    return f"""
    <div style="{BASE_CONTAINER} background: #fff3cd; border: 1px solid #ffc107;">
        <h1 style="color: #856404; margin-bottom: 20px;">⚠️ Insufficient Funds</h1>
        <p style="margin-bottom: 15px; font-size: 16px;">
            Treasury has <strong>${available_funds:,.2f}</strong> but <strong>${required_amount:,.2f}</strong> is required.
        </p>
        <p style="margin-bottom: 15px; font-size: 16px;">
            Shortfall: <strong style="color: #dc3545;">${shortfall:,.2f}</strong>
        </p>
        <p style="margin-bottom: 0; font-size: 16px;">Please deposit more funds to cover the payroll.</p>
    </div>
    """