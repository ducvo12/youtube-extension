# Activate venv: source venv/bin/activate
# Run server: uvicorn main:app --reload

from fastapi import FastAPI
from pydantic import BaseModel

from handler import process_data

app = FastAPI(title="Basic API Server")

class InputData(BaseModel):
    value: str | None = None

@app.get("/")
def root():
    return {"status": "ok", "message": "API is running"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/process")
def process(input_data: InputData):
    result = process_data(input_data.model_dump())
    return result
