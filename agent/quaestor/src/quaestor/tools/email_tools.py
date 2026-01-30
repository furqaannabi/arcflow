import os
import requests
from dotenv import load_dotenv
import resend

load_dotenv()

class EmailTools:
    def __init__(self):
        self.resend_api_key = os.getenv("RESEND_API_KEY")
        self.from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
        resend.api_key = self.resend_api_key  

    def send_waiting_notification(self, gas_price, wait_minutes, override_link, to_email)  -> dict:
        """ Send waiting notification email to the user """
        subject = f"Arcflow: Gas price is high: {gas_price} gwei"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; }}
                .header h1 {{ color: #fff; margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; }}
                .status-box {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }}
                .metric {{ display: inline-block; margin: 10px 20px 10px 0; }}
                .metric-value {{ font-size: 28px; font-weight: bold; color: #333; }}
                .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
                .btn {{ display: inline-block; background: #dc3545; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }}
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⏳ Payroll Waiting</h1>
                </div>
                <div class="content">
                    <div class="status-box">
                        <strong>Gas prices are elevated.</strong> Quaestor is waiting for optimal conditions.
                    </div>
                    <div class="metric">
                        <div class="metric-value">{gas_price:.2f}</div>
                        <div class="metric-label">Current Gas (gwei)</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">{wait_minutes}</div>
                        <div class="metric-label">Wait Time (min)</div>
                    </div>
                    <p>The system will automatically retry when gas drops. Or you can force execution now:</p>
                    <a href="{override_link}" class="btn">⚡ Pay Anyway</a>
                </div>
                <div class="footer">
                    ArcFlow — Autonomous Treasury Management
                </div>
            </div>
        </body>
        </html>
        """
        params = {
            "from": self.from_email,  # Change to your verified sender
            "to": [to_email],  # Change to your recipient
            "subject": subject,
            "html": html_body,
        }
        
        try:
            email = resend.Emails.send(params)
            return {"status": "success", "id": email.get("id", "unknown")}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    
    def send_completion_notification(self, amount, employee_count, tx_hash, to_email) -> dict:
        """ Send completion notification email to the user """
        subject = f"Arcflow: Payroll completed successfully"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; text-align: center; }}
                .header h1 {{ color: #fff; margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; }}
                .success-box {{ background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px; }}
                .metric {{ display: inline-block; margin: 10px 20px 10px 0; }}
                .metric-value {{ font-size: 28px; font-weight: bold; color: #333; }}
                .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
                .tx-hash {{ background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; }}
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Payroll Complete</h1>
                </div>
                <div class="content">
                    <div class="success-box">
                        <strong>Success!</strong> All payments have been distributed.
                    </div>
                    <div class="metric">
                        <div class="metric-value">${amount:,.2f}</div>
                        <div class="metric-label">Total Distributed</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">{employee_count}</div>
                        <div class="metric-label">Employees Paid</div>
                    </div>
                    <p><strong>Transaction:</strong></p>
                    <div class="tx-hash">{tx_hash}</div>
                </div>
                <div class="footer">
                    ArcFlow — Autonomous Treasury Management
                </div>
            </div>
        </body>
        </html>
        """
        params = {
            "from": self.from_email,  # Change to your verified sender
            "to": [to_email],  # Change to your recipient
            "subject": subject,
            "html": html_body,
        }
        
        try:
            email = resend.Emails.send(params)
            return {"status": "success", "id": email.get("id", "unknown")}
        except Exception as e:
            return {"status": "error", "message": str(e)}


    def send_urgent_notification(self, gas_price, hours_waited, override_link, to_email) -> dict:
        """ Send urgent notification email to the user """
        subject = f"Arcflow: Gas price is too high: {gas_price} gwei"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); padding: 30px; text-align: center; }}
        .header h1 {{ color: #fff; margin: 0; font-size: 24px; }}
        .content {{ padding: 30px; }}
        .urgent-box {{ background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        .metric {{ display: inline-block; margin: 10px 20px 10px 0; }}
        .metric-value {{ font-size: 28px; font-weight: bold; color: #333; }}
        .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
        .btn {{ display: inline-block; background: #dc3545; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }}
        .footer {{ background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 Action Required</h1>
                </div>
                <div class="content">
                    <div class="urgent-box">
                        <strong>Extended Wait!</strong> Gas has remained high. Your decision is needed.
                    </div>
                    <div class="metric">
                        <div class="metric-value">{gas_price:.2f}</div>
                        <div class="metric-label">Current Gas (gwei)</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">{hours_waited}</div>
                        <div class="metric-label">Hours Waited</div>
                    </div>
                    <p>Choose to proceed now or continue waiting:</p>
                    <a href="{override_link}" class="btn">⚡ Execute Now</a>
                </div>
                <div class="footer">
                    ArcFlow — Autonomous Treasury Management
                </div>
            </div>
        </body>
        </html>
        """
        params = {
            "from": self.from_email,  # Change to your verified sender
            "to": [to_email],  # Change to your recipient
            "subject": subject,
            "html": html_body,
        }
        
        try:
            email = resend.Emails.send(params)
            return {"status": "success", "id": email.get("id", "unknown")}
        except Exception as e:
            return {"status": "error", "message": str(e)}