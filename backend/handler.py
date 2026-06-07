import os

from google import genai
from google.genai import errors


MODEL = "gemini-3.1-flash-lite"


async def process_prompt(prompt: str) -> dict:
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=prompt,
        )
    except errors.APIError as exc:
        return {
            "error": "Gemini API request failed",
            "status_code": exc.code,
            "details": exc.message,
            "model": MODEL,
        }

    return {"response": response.text, "model": MODEL}
