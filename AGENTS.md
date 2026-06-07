# AGENTS.md

## Project Shape
- This repo has two independent parts: `backend/` is a FastAPI API server, and `extension/` is an unpacked Chrome Manifest V3 extension.
- There is no root package manager, workspace config, CI, lint, formatter, typecheck, or test config checked in.

## Backend
- Run backend commands from `backend/`; `main.py` imports `handler` as a sibling module, so running from the repo root can break imports.
- Setup: `python -m venv venv`, `source venv/bin/activate`, then `pip install -r requirements.txt`.
- Dev server: `uvicorn main:app --reload` from `backend/`.
- `backend/main.py` loads `.env` with `python-dotenv`; Gemini calls require `GEMINI_API_KEY` in `backend/.env` or the process environment.
- API entrypoints are `GET /`, `GET /health`, and `POST /process` with JSON `{ "prompt": "..." }`.

## Chrome Extension
- Load `extension/` as the unpacked extension directory in Chrome; there is no build step.
- `extension/manifest.json` registers `popup.html` and injects `youtube.js` plus `youtube.css` only on `https://www.youtube.com/*`.
- The YouTube content script inserts an `aside#hello-world-youtube-side-menu` into `#secondary-inner` or `#secondary` on `/watch?v=...` pages, and removes it in fullscreen or theater mode.

## Verification
- No automated tests are configured. Use focused manual checks: backend health via `uvicorn main:app --reload` plus `/health`, and extension behavior by reloading the unpacked extension on a YouTube watch page.
