import os

from google import genai
from google.genai import errors


MODEL = "gemini-3.1-flash-lite"


def build_prompt(prompt: str, highlighted_text: str | None) -> str:
    highlighted_text = (highlighted_text or "").strip()
    if not highlighted_text:
        return prompt

    return f"""User prompt:
{prompt}

Highlighted transcript:
{highlighted_text}"""


async def process_prompt(prompt: str, highlighted_text: str | None = None) -> dict:
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=build_prompt(prompt, highlighted_text),
        )
    except errors.APIError as exc:
        return {
            "error": "Gemini API request failed",
            "status_code": exc.code,
            "details": exc.message,
            "model": MODEL,
        }

    return {"response": response.text, "model": MODEL}
