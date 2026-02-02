#!/usr/bin/env python
import os
import sys
from quaestor.crew import QuaestorCrew

# This main file is intended to be a way for your to run your
# crew locally, so refrain from adding necessary logic into this file.
# Replace with inputs you want to test with, it will automatically
# interpolate any tasks and agents information

def run():
    """
    Run the crew.
    """
    inputs = {
        "wallet_id": "your-circle-wallet-id",
        "payroll_id": "PAY-2026-001",  
        "pool_address": "0x123...abc",
        "owner_address": "0xABC...123",
        "contract_address": "0xPayrollContract...",
        "recipient_count": 50,
        "chain_id": 84532,  # Base Sepolia
        "ceo_email": "williamikeji@gmail.com",
        "override_link": f"{os.getenv('APP_BASE_URL', 'https://arcflow.io')}/override/token123",
        "hours_waited": 2,
        "source_chain_id": 84532,  # Base Sepolia
    }
    QuaestorCrew().crew().kickoff(inputs=inputs)


def train():
    """
    Train the crew for a given number of iterations.
    """
    inputs = {
        "topic": "AI LLMs"
    }
    try:
        QuaestorCrew().crew().train(n_iterations=int(sys.argv[1]), filename=sys.argv[2], inputs=inputs)

    except Exception as e:
        raise Exception(f"An error occurred while training the crew: {e}")

def replay():
    """
    Replay the crew execution from a specific task.
    """
    try:
        QuaestorCrew().crew().replay(task_id=sys.argv[1])

    except Exception as e:
        raise Exception(f"An error occurred while replaying the crew: {e}")

def test():
    """
    Test the crew execution and returns the results.
    """
    inputs = {
        "topic": "AI LLMs"
    }
    try:
        QuaestorCrew().crew().test(n_iterations=int(sys.argv[1]), openai_model_name=sys.argv[2], inputs=inputs)

    except Exception as e:
        raise Exception(f"An error occurred while testing the crew: {e}")

if __name__ == "__main__":
    run()
