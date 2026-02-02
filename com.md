cd src && uv run uvicorn quaestor.api.main:app --reload --port 8000

curl http://localhost:8000/health
curl -X POST http://localhost:8000/schedule-retry \
  -H "Content-Type: application/json" \
  -d '{"payroll_id": "PAY-001", "wait_minutes": 1}'
curl http://localhost:8000/scheduled-jobs


curl -X POST http://localhost:8000/trigger-daily
# Trigger a single payroll
curl -X POST http://localhost:8000/trigger \
  -H "Content-Type: application/json" \
  -d '{"payroll_id": "PAY-001", "contract_address": "0xTest..."}'




  verify domain on resend