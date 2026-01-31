import sys
sys.path.insert(0, "../src")

from quaestor.tools.email_tools import (
    WaitingNotificationTool, 
    CompletionNotificationTool,
    InsufficientFundsNotificationTool
)

def test_waiting_notification():
    tool = WaitingNotificationTool()
    result = tool._run(
        gas_price=45.5,
        wait_minutes=15,
        override_link="https://arcflow.io/override/abc123",
        to_email="williamikeji@gmail.com"
    )
    print(f"Waiting notification: {result}")

def test_completion_notification():
    tool = CompletionNotificationTool()
    result = tool._run(
        amount=5000.00,
        employee_count=10,
        tx_hash="0x123abc456def...",
        to_email="williamikeji@gmail.com"
    )
    print(f"Completion notification: {result}")

def test_insufficient_funds():
    tool = InsufficientFundsNotificationTool()
    result = tool._run(
        required_amount=10000.00,
        available_funds=7500.00,
        to_email="williamikeji@gmail.com"
    )
    print(f"Insufficient funds notification: {result}")

if __name__ == "__main__":
    print("Testing Waiting Notification...")
    test_waiting_notification()
    
    print("\nTesting Completion Notification...")
    test_completion_notification()
    
    print("\nTesting Insufficient Funds Notification...")
    test_insufficient_funds()