# SmartScan — Advanced Document Scanner

Starter application for a four-member engineering project. Includes image upload, automatic contour-based cropping, perspective correction, color/grayscale/BW enhancement, OCR, and multi-page image PDF export.

## Requirements
- Python 3.10+
- Node.js 20+
- Tesseract OCR installed on your operating system and available on PATH (for `/ocr`)

## Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
API: http://localhost:8000/docs ; health: http://localhost:8000/health

## Frontend (second terminal)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

## Current endpoints
- `GET /health`
- `POST /scan` multipart: file, mode=color|gray|bw, auto_crop=true|false
- `POST /ocr` multipart: file
- `POST /pdf` multipart: repeated files fields (1–30 images)

## Known limitations / next steps
- Automatic detection is contour-based and can miss cluttered/low-contrast documents. Add manual 4-point correction UI.
- No rotate UI, brightness slider, shadow removal, persistent sessions, or searchable PDF yet.
- PDF endpoint produces image-based PDF (not searchable); OCR currently exports plain text separately.
- OCR requires a separate Tesseract binary install.
- Camera uses the browser file input `capture` hint; behavior depends on browser/device.
- Add image dimension limits, more tests, and production hardening before deployment.
