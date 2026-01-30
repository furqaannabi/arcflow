import sys
sys.path.insert(0, "../src")

from quaestor.tools.email_tools import EmailTools

def test_email_tools():
    email = EmailTools()
    
    # Test waiting notification
    result = email.send_waiting_notification(
        gas_price=45.5,
        wait_minutes=15,
        override_link="https://arcflow.io/override/abc123",
        to_email="williamikeji@gmail.com"  # Replace with your email
    )
    print(f"Waiting notification: {result}")

if __name__ == "__main__":
    test_email_tools()