# Activate venv: source venv/bin/activate
# Run server: uvicorn main:app --reload

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from pydantic import BaseModel

from handler import process_prompt

app = FastAPI(title="AI API Server")


class InputData(BaseModel):
    prompt: str
    highlighted_text: str | None = None
    translation_mode: str | None = None


@app.get("/")
def root():
    return {"status": "ok", "message": "API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/process")
async def process(input_data: InputData):
    return await process_prompt(
        input_data.prompt,
        input_data.highlighted_text,
        input_data.translation_mode,
    )
