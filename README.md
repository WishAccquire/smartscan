SmartScan — Advanced Document Scanner & Image Enhancement
SmartScan is a browser-based document scanning and image enhancement application built with a React + Vite frontend and a FastAPI backend. It helps users upload, crop, enhance, inspect, extract text from, and export document images.
Features
- Multi-image document workspace: Upload JPEG, PNG, or WebP images; switch between pages, reorder them, and remove pages.
- Document cropping: Automatic contour-based cropping and an interactive manual crop tool with reset.
- Image enhancement: Color, grayscale, black-and-white, original, gamma correction, CLAHE, denoising, sharpening, and combined enhancement modes.
- Manual image adjustments: Brightness, contrast, saturation, sharpness, exposure, and color temperature sliders, with an enhanced-image preview, Apply Adjustments, and Reset Sliders controls.
- Side-by-side preview: Compare the source/cropped image with the enhanced image.
- Image quality analysis: Brightness, contrast, blur score, grayscale histograms, and—when supported by the backend—PSNR and SSIM comparison.
- Algorithm comparison: Compare enhancement methods, visual outputs, histograms, and metrics.
- YOLO object detection comparison: Compare detected objects in original and enhanced images with an adjustable confidence threshold.
- OCR: Extract text from an image and export the result as a TXT file.
- Export: Download the selected image or export a multi-page, image-based PDF.
Technology Stack
Layer	Technologies
Frontend	React, Vite, JavaScript, CSS, react-image-crop
Backend	Python, FastAPI
Image processing	Browser Canvas API for manual adjustments; backend image-processing endpoints for scanning/enhancement
OCR	Tesseract OCR (system installation required)
Object detection	YOLO through the backend comparison endpoint


Prerequisites
- Node.js 20+ and npm
- Python 3.10+
- Tesseract OCR, installed and accessible on your system's PATH for OCR functionality
- Backend dependencies listed in backend/requirements.txt
Project Structure
document-scanner-starter/
├── backend/
│   ├── app/
│   │   └── main.py           # FastAPI application / routes
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx          # React application
│   │   └── style.css         # Application styles
│   └── package.json
└── README.md
The structure above reflects the starter layout and expected file locations. If your project has additional backend modules or model files, keep them in their existing locations.

Getting Started
1. Start the backend
From the project root:
cd backend
python -m venv .venv
Activate the environment:

Windows (PowerShell):
.venv\Scripts\Activate.ps1
macOS / Linux:
source .venv/bin/activate
Install dependencies and run FastAPI:
pip install -r requirements.txt
uvicorn app.main:app --reload
Backend API: http://localhost:8000
Interactive API documentation: http://localhost:8000/docs
Health check: http://localhost:8000/health
2. Start the frontend
Open a second terminal at the project root:
cd frontend
npm install
npm run dev
Open http://localhost:5173 in your browser.

The frontend currently expects the backend at http://localhost:8000 (configured by the API constant in frontend/src/main.jsx). If you change the backend port or host, update that constant.
How to Use
1. Click Add images and upload one or more document photos.
2. Select a page from the Documents sidebar. Reorder pages with Move if needed.
3. Optionally select Manual Crop, adjust the crop area, and click Apply Crop. Use Reset Crop to restore the original framing.
4. Choose an Enhancement filter, configure its settings, and click Scan & Enhance.
5. Fine-tune the result with Manual Image Adjustments. The enhanced preview reflects slider changes; click Apply Adjustments to save the result to the current page.
6. Optionally run Analyze Quality, Compare All Algorithms, Compare YOLO Detection, or Extract text.
7. Click Download Image, Export PDF, or Download TXT as needed.
Important behavior: Run Scan & Enhance before applying manual adjustments if you want both. Running Scan & Enhance again can replace previously applied manual adjustments. Reset Sliders resets the controls; it does not undo adjustments already applied to the image.
API Endpoints
The React frontend uses the following backend routes:
Method	Endpoint	Purpose
GET	/health	Backend health check
POST	/scan	Basic scanning and color/grayscale/BW enhancement
POST	/advanced-enhance	Advanced enhancement methods and parameters
POST	/quality-analysis	Analyze one image
POST	/quality-comparison	Compare original and enhanced image quality
POST	/compare-algorithms	Run multiple enhancement algorithms
POST	/yolo-comparison	Compare object detections
POST	/ocr	Extract text
POST	/pdf	Create a multi-page PDF from images


The original starter documents /health, /scan, /ocr, and /pdf. The advanced endpoints must also be implemented in your current backend for the corresponding frontend features to work. Check /docs to confirm which routes are available.
Troubleshooting
Problem	What to check
Frontend does not open	Run npm install and npm run dev inside frontend/.
Enhancement/API request fails	Confirm FastAPI is running on port 8000 and the required endpoint appears in /docs.
OCR fails	Install Tesseract and verify it is on PATH.
Apply Adjustments fails	Confirm applyAdjustments() is defined inside the React App component and the adjustment states are present.
Preview does not update	Confirm the enhanced image uses `adjustPreview
YOLO comparison fails	Check that the YOLO backend route, model dependencies, and any required model weights are available.


Current Limitations
- PDF export creates an image-based PDF, not a searchable PDF.
- OCR text is exported separately as TXT.
- Automatic cropping may miss documents with cluttered backgrounds or weak edges.
- Manual crop uses a rectangular selection rather than four-corner perspective adjustment.
- Live manual-adjustment preview may be slow on very large images because browser Canvas processing is performed at image resolution.
- Image changes are held in the browser session; persistent storage is not included in the starter.
- YOLO and advanced image-processing capabilities depend on backend implementation and installed dependencies.
Future Improvements
- Faster, downscaled live previews for large images
- Undo/redo and per-page adjustment history
- Four-point perspective correction and rotation controls
- Searchable PDF generation with embedded OCR text
- Automated tests, file-size limits, and production deployment configuration
Project Status
This README describes the SmartScan frontend features and starter setup shared for this project. Run the application and verify each backend endpoint before presenting the features as fully tested.
