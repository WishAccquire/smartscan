from io import BytesIO
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
import cv2
from .processing import decode_image, detect_and_warp, enhance

app = FastAPI(title='Document Scanner API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_methods=['*'], allow_headers=['*'])
MAX_BYTES = 12 * 1024 * 1024

async def read_image(file: UploadFile):
    if file.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
        raise HTTPException(415, 'Upload JPG, PNG or WebP')
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Image exceeds 12 MB')
    try:
        return decode_image(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.post('/scan')
async def scan(file: UploadFile = File(...), mode: str = Form('color'), auto_crop: bool = Form(True)):
    if mode not in ('color', 'gray', 'bw'):
        raise HTTPException(422, 'Mode must be color, gray or bw')
    image = await read_image(file)
    if auto_crop:
        image, detected = detect_and_warp(image)
    else:
        detected = False
    result = enhance(image, mode)
    ok, encoded = cv2.imencode('.png', result)
    if not ok:
        raise HTTPException(500, 'Encoding failed')
    return Response(content=encoded.tobytes(), media_type='image/png', headers={'X-Document-Detected': str(detected).lower()})

@app.post('/ocr')
async def ocr(file: UploadFile = File(...)):
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    image = await read_image(file)
    try:
        text = pytesseract.image_to_string(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(503, 'Install Tesseract OCR on the server') from exc
    return {'text': text}

@app.post('/pdf')
async def pdf(files: list[UploadFile] = File(...)):
    if not 1 <= len(files) <= 30:
        raise HTTPException(422, 'Upload 1 to 30 pages')
    images = []
    for file in files:
        bgr = await read_image(file)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        images.append(Image.fromarray(rgb).convert('RGB'))
    out = BytesIO()
    images[0].save(out, format='PDF', save_all=True, append_images=images[1:], resolution=150)
    return Response(content=out.getvalue(), media_type='application/pdf', headers={'Content-Disposition': 'attachment; filename="scanned-document.pdf"'})
