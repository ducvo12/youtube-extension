import os

from google import genai
from google.genai import errors


MODEL = "gemini-3.1-flash-lite"

TRANSLATION_INSTRUCTIONS = {
    "vi-to-en": "Translate the highlighted Vietnamese transcript into natural English.",
    "en-to-vi": "Translate the highlighted English transcript into natural Vietnamese.",
    "any-to-en": "Translate the highlighted transcript into English.",
}


def build_prompt(prompt: str, highlighted_text: str | None, translation_mode: str | None) -> str:
    prompt = (prompt or "").strip()
    highlighted_text = (highlighted_text or "").strip()
    instruction = TRANSLATION_INSTRUCTIONS.get(translation_mode or "")

    if not highlighted_text:
        return prompt or instruction or ""

    parts = []

    if instruction:
        parts.extend(["Instruction:", instruction])

    if prompt:
        parts.extend(["User extra instructions:", prompt])

    parts.extend(["Highlighted transcript:", highlighted_text])

    return "\n".join(parts)


async def process_prompt(
    prompt: str,
    highlighted_text: str | None = None,
    translation_mode: str | None = None,
) -> dict:
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    try:
        response = await client.aio.models.generate_content(
            model=MODEL,
            contents=build_prompt(prompt, highlighted_text, translation_mode),
        )
    except errors.APIError as exc:
        return {
            "error": "Gemini API request failed",
            "status_code": exc.code,
            "details": exc.message,
            "model": MODEL,
        }

    return {"response": response.text, "model": MODEL}
