from crewai import Agent, Crew, Process, Task, LLM
from crewai.project import CrewBase, agent, crew, task
from quaestor.tools.gas_tools import GasTools
from quaestor.tools.treasury_tools import TreasuryTools
from quaestor.tools.email_tools import EmailTools
import os

@CrewBase
class QuaestorCrew:
	"""Quaestor crew"""
	agents_config = 'config/agents.yaml'
	tasks_config = 'config/tasks.yaml'


	@agent
	def market_optimizer(self) -> Agent:
		return Agent(
			config=self.agents_config['market_optimizer'],
			tools=[GasTools()],
			verbose=True
		)

	@agent
	def treasury_analyst(self) -> Agent:
		return Agent(
			config=self.agents_config['treasury_analyst'],
			tools=[TreasuryTools()],
			verbose=True
		)

	@agent
	def compliance_officer(self) -> Agent:
		return Agent(
			config=self.agents_config['compliance_officer'],
			tools=[EmailTools()],
			verbose=True
		)

	@task
	def analyze_gas(self) -> Task:
		return Task(
			config=self.tasks_config['analyze_gas'],
			agent=self.market_optimizer()
		)

	@task
	def calculate_distribution(self) -> Task:
		return Task(
			config=self.tasks_config['calculate_distribution'],
			agent=self.treasury_analyst()
		)
  
	@task
	def execute_payroll(self) -> Task:
		return Task(
			config=self.tasks_config['execute_payroll'],
			agent=self.treasury_analyst()
		)

	@task
	def notify_ceo_waiting(self) -> Task:
		return Task(
			config=self.tasks_config['notify_ceo_waiting'],
			agent=self.compliance_officer()
		)
  
	@task
	def notify_ceo_urgent(self) -> Task:
		return Task(
			config=self.tasks_config['notify_ceo_urgent'],
			agent=self.compliance_officer()
		)

	@task
	def notify_ceo_complete(self) -> Task:
		return Task(
			config=self.tasks_config['notify_ceo_complete'],
			agent=self.compliance_officer()
		)

	@crew
	def crew(self) -> Crew:
		"""Creates the Quaestor crew"""
		return Crew(
			agents=self.agents, # Automatically collected by @agent decorator
			tasks=self.tasks,   # Automatically collected by @task decorator
			process=Process.sequential,
			verbose=True,
		)
