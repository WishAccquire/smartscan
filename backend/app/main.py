from io import BytesIO
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
import cv2
from .processing import (
    decode_image,
    detect_and_warp,
    enhance,
    advanced_enhance
)
from .quality import analyze_image, compare_quality
from .comparison import comparison_report
from .detection import compare_detections

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



@app.post('/advanced-enhance')
async def advanced_enhancement(
    file: UploadFile = File(...),
    method: str = Form('combined'),
    gamma: float = Form(1.2),
    clip_limit: float = Form(2.0),
    denoise_strength: int = Form(10),
    sharpen_strength: float = Form(1.0),
    auto_crop: bool = Form(False)
):
    image = await read_image(file)

    if auto_crop:
        image, _ = detect_and_warp(image)

    try:
        result = advanced_enhance(
            image,
            method=method,
            gamma=gamma,
            clip_limit=clip_limit,
            denoise_strength=denoise_strength,
            sharpen_strength=sharpen_strength
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    success, encoded = cv2.imencode('.png', result)

    if not success:
        raise HTTPException(500, 'Image encoding failed')

    return Response(
        content=encoded.tobytes(),
        media_type='image/png'
    )


# ==========================================
# MODULE B: IMAGE QUALITY ANALYSIS
# ==========================================

@app.post('/quality-analysis')
async def quality_analysis(file: UploadFile = File(...)):
    image = await read_image(file)
    return analyze_image(image)


@app.post('/quality-comparison')
async def quality_comparison(
    original: UploadFile = File(...),
    enhanced: UploadFile = File(...)
):
    original_image = await read_image(original)
    enhanced_image = await read_image(enhanced)

    if original_image.shape != enhanced_image.shape:
        raise HTTPException(
            status_code=422,
            detail=(
                "Original and enhanced images must have "
                "identical dimensions. Disable auto crop "
                "when generating the enhanced image."
            )
        )

    try:
        return compare_quality(original_image, enhanced_image)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# =====================================
# MODULE C: ALGORITHM COMPARISON
# =====================================

@app.post("/compare-algorithms")
async def compare_algorithms(
    file: UploadFile = File(...),
    gamma: float = Form(1.2),
    clip_limit: float = Form(2.0),
    denoise_strength: int = Form(10),
    sharpen_strength: float = Form(1.0)
):
    if not 0.1 <= gamma <= 5.0:
        raise HTTPException(
            422, "Gamma must be between 0.1 and 5"
        )

    if not 1.0 <= clip_limit <= 10.0:
        raise HTTPException(
            422, "CLAHE clip limit must be between 1 and 10"
        )

    if not 0 <= denoise_strength <= 30:
        raise HTTPException(
            422, "Denoising strength must be between 0 and 30"
        )

    if not 0 <= sharpen_strength <= 5:
        raise HTTPException(
            422, "Sharpening strength must be between 0 and 5"
        )

    image = await read_image(file)

    try:
        return comparison_report(
            image,
            gamma=gamma,
            clip_limit=clip_limit,
            denoise_strength=denoise_strength,
            sharpen_strength=sharpen_strength
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc



# =====================================
# MODULE D: YOLO DETECTION COMPARISON
# =====================================

@app.post("/yolo-comparison")
async def yolo_comparison(
    original: UploadFile = File(...),
    enhanced: UploadFile = File(...),
    confidence: float = Form(0.25)
):
    if not 0.01 <= confidence <= 1.0:
        raise HTTPException(
            status_code=422,
            detail="Confidence must be between 0.01 and 1.0"
        )

    original_image = await read_image(original)
    enhanced_image = await read_image(enhanced)

    try:
        return compare_detections(
            original_image,
            enhanced_image,
            confidence=confidence
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc
