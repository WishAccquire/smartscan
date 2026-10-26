import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

const API = 'http://localhost:8000';
const METHODS = [
  ['color', 'Enhanced color (existing)'],
  ['gray', 'Grayscale (existing)'],
  ['bw', 'Black & white (existing)'],
  ['original', 'Original (no filter)'],
  ['gamma', 'Gamma correction'],
  ['clahe', 'CLAHE'],
  ['denoise', 'Denoising'],
  ['sharpen', 'Sharpening'],
  ['combined', 'Combined enhancement'],
];


function Histogram({ original = [], enhanced = [] }) {
  if (!original.length) return null;

  const width = 600;
  const height = 180;
  const padding = 12;

  const maximum = Math.max(
    1,
    ...original,
    ...enhanced
  );

  function makePoints(values) {
    return values.map((value, index) => {
      const x = padding + (index / 255) *
        (width - padding * 2);
      const y = height - padding -
        (value / maximum) *
        (height - padding * 2);

      return `${x},${y}`;
    }).join(' ');
  }

  return (
    <div className="histogram-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Grayscale intensity histogram"
      >
        <polyline
          points={makePoints(original)}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
        />
        {enhanced.length > 0 && (
          <polyline
            points={makePoints(enhanced)}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
          />
        )}
      </svg>
      <div className="histogram-legend">
        <span>🔵 Original</span>
        {enhanced.length > 0 &&
          <span>🟠 Enhanced</span>}
      </div>
      <p className="hint">
        Horizontal axis: intensity (0–255).
        Vertical axis: pixel count.
      </p>
    </div>
  );
}


async function createCroppedBlob(imageUrl, cropPixels) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = imageUrl;
  });

  const canvas = document.createElement('canvas');

  canvas.width = Math.round(cropPixels.width);
  canvas.height = Math.round(cropPixels.height);

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not supported');
  }

  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Cropping failed'));
      },
      'image/png'
    );
  });
}



function App() {
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState('color');
  const [autoCrop, setAutoCrop] = useState(true);
  const [gamma, setGamma] = useState(1.2);
  const [clipLimit, setClipLimit] = useState(2);
  const [denoiseStrength, setDenoiseStrength] = useState(10);
  const [sharpenStrength, setSharpenStrength] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocr, setOcr] = useState('');
  const [quality, setQuality] = useState(null);
  const [qualityBusy, setQualityBusy] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const [selectedHistogram, setSelectedHistogram] = useState('gamma');
  const [yoloResult, setYoloResult] = useState(null);
  const [yoloBusy, setYoloBusy] = useState(false);
  const [yoloError, setYoloError] = useState('');
  const [yoloConfidence, setYoloConfidence] = useState(0.25);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80
  });

  const cropImageRef = useRef(null);
  const [cropBusy, setCropBusy] = useState(false);
  const pagesRef = useRef([]);
  const current = pages[selected];
  const activeFile = current?.croppedFile || current?.file;
  const activeUrl = current?.croppedUrl || current?.originalUrl;

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => {
    pagesRef.current.forEach(p => {
      URL.revokeObjectURL(p.originalUrl);
      if (p.processedUrl) URL.revokeObjectURL(p.processedUrl);
      if (p.croppedUrl) URL.revokeObjectURL(p.croppedUrl);
    });
  }, []);

  function addFiles(event) {
    const files = Array.from(event.target.files || []).filter(f =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    if (!files.length) return;
    const start = pages.length;
    setPages(old => [...old, ...files.map(file => ({
      file, originalUrl: URL.createObjectURL(file),
      processedUrl: null, processedBlob: null
    }))]);
    setSelected(start);
    setOcr('');
    setError('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    setYoloResult(null);
    setYoloError('');
    event.target.value = '';
  }

  async function process() {
    if (!current || busy || cropBusy || cropOpen) return;
    const pageIndex = selected;
    const pageUrl = current.originalUrl;
    const inputUrl = activeUrl;
    setBusy(true);
    setError('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    setYoloResult(null);
    setYoloError('');
    try {
      const form = new FormData();
      form.append('file', activeFile);
      form.append('auto_crop', String(autoCrop && !current.croppedFile));
      const legacy = ['color', 'gray', 'bw'].includes(mode);
      let endpoint;

      if (legacy) {
        endpoint = '/scan';
        form.append('mode', mode);
      } else {
        endpoint = '/advanced-enhance';
        form.append('method', mode);
        form.append('gamma', String(gamma));
        form.append('clip_limit', String(clipLimit));
        form.append('denoise_strength', String(denoiseStrength));
        form.append('sharpen_strength', String(sharpenStrength));
      }

      const response = await fetch(API + endpoint, {
        method: 'POST', body: form
      });
      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setPages(old => {
        if (old[pageIndex]?.originalUrl !== pageUrl ||
          (old[pageIndex]?.croppedUrl || old[pageIndex]?.originalUrl) !== inputUrl) {
          URL.revokeObjectURL(url);
          return old;
        }
        return old.map((p, i) => {
          if (i !== pageIndex) return p;
          if (p.processedUrl) URL.revokeObjectURL(p.processedUrl);
          return { ...p, processedUrl: url, processedBlob: blob };
        });
      });
      setOcr('');
    } catch (e) {
      setError(e.message || 'Enhancement failed');
    } finally {
      setBusy(false);
    }
  }


  async function analyzeQuality() {
    if (!current || busy || qualityBusy) return;

    setQualityBusy(true);
    setError('');
    setQuality(null);

    try {
      const form = new FormData();
      let endpoint = '/quality-analysis';

      if (current.processedBlob) {
        endpoint = '/quality-comparison';
        form.append('original', activeFile);
        form.append(
          'enhanced',
          current.processedBlob,
          'enhanced.png'
        );
      } else {
        form.append('file', activeFile);
      }

      const response = await fetch(API + endpoint, {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details);
      }

      const data = await response.json();
      setQuality(data);

    } catch (e) {
      setError(e.message || 'Quality analysis failed');
    } finally {
      setQualityBusy(false);
    }
  }


  async function compareAlgorithms() {
    if (!current || busy || comparisonBusy) return;

    setComparisonBusy(true);
    setComparisonError('');
    setComparison(null);

    try {
      const form = new FormData();

      form.append('file', activeFile);

      // Module A ke existing parameter states use karo.
      // Agar variable names different hain, unhe match karo.
      form.append('gamma', String(gamma));
      form.append('clip_limit', String(clipLimit));
      form.append('denoise_strength', String(denoiseStrength));
      form.append('sharpen_strength', String(sharpenStrength));

      const response = await fetch(
        API + '/compare-algorithms',
        {
          method: 'POST',
          body: form
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setComparison(data);

    } catch (error) {
      setComparisonError(
        error.message || 'Algorithm comparison failed'
      );
    } finally {
      setComparisonBusy(false);
    }
  }


  async function runYoloComparison() {
    if (!current || busy || yoloBusy) return;

    if (!current.processedBlob) {
      setYoloError(
        'Please click Scan & Enhance before running YOLO comparison.'
      );
      return;
    }

    setYoloBusy(true);
    setYoloError('');
    setYoloResult(null);

    try {
      const form = new FormData();

      form.append('original', activeFile);
      form.append(
        'enhanced',
        current.processedBlob,
        'enhanced.png'
      );
      form.append('confidence', String(yoloConfidence));

      const response = await fetch(
        API + '/yolo-comparison',
        {
          method: 'POST',
          body: form
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setYoloResult(data);

    } catch (error) {
      setYoloError(
        error.message || 'YOLO comparison failed'
      );
    } finally {
      setYoloBusy(false);
    }
  }




  async function extract() {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append(
        'file',
        current.processedBlob || activeFile,
        'page.png'
      );
      const response = await fetch(API + '/ocr', {
        method: 'POST', body: form
      });
      if (!response.ok) throw new Error(await response.text());
      setOcr((await response.json()).text);
    } catch (e) {
      setError(e.message || 'OCR failed');
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!pages.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      pages.forEach((p, i) =>
        form.append(
          'files',
          p.processedBlob || p.croppedFile || p.file,
          `page-${i}.png`
        )
      );
      const response = await fetch(API + '/pdf', {
        method: 'POST', body: form
      });
      if (!response.ok) throw new Error(await response.text());
      download(await response.blob(), 'scanned-document.pdf');
    } catch (e) {
      setError(e.message || 'PDF export failed');
    } finally {
      setBusy(false);
    }
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function remove() {
    if (!current || busy || cropBusy || cropOpen) return;
    URL.revokeObjectURL(current.originalUrl);
    if (current.croppedUrl) URL.revokeObjectURL(current.croppedUrl);
    if (current.processedUrl)
      URL.revokeObjectURL(current.processedUrl);
    setPages(old => old.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
    setOcr('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    setYoloResult(null);
    setYoloError('');
  }

  function openManualCrop() {
    if (!current || busy || cropBusy) return;

    setCrop({
      unit: '%',
      x: 10,
      y: 10,
      width: 80,
      height: 80
    });

    setCropOpen(true);
  }

  async function applyManualCrop() {
    if (!current || cropBusy) return;

    const pageIndex = selected;
    const pageUrl = current.originalUrl;
    const inputUrl = activeUrl;

    setCropBusy(true);
    setError('');

    try {
      const image = cropImageRef.current;

      if (!image || !crop.width || !crop.height) {
        throw new Error('Please select a crop area');
      }

      const widthScale = image.naturalWidth / image.width;
      const heightScale = image.naturalHeight / image.height;

      const cropPixels = {
        x: (crop.x / 100) * image.width * widthScale,
        y: (crop.y / 100) * image.height * heightScale,
        width: (crop.width / 100) * image.width * widthScale,
        height: (crop.height / 100) * image.height * heightScale
      };

      const blob = await createCroppedBlob(
        activeUrl,
        cropPixels
      );

      const croppedFile = new File(
        [blob],
        'manual-crop.png',
        { type: 'image/png' }
      );

      const croppedUrl = URL.createObjectURL(blob);

      setPages(old => old.map((page, index) => {
        if (
          index !== pageIndex ||
          page.originalUrl !== pageUrl ||
          (page.croppedUrl || page.originalUrl) !== inputUrl
        ) {
          return page;
        }

        if (page.croppedUrl) {
          URL.revokeObjectURL(page.croppedUrl);
        }

        if (page.processedUrl) {
          URL.revokeObjectURL(page.processedUrl);
        }

        return {
          ...page,
          croppedFile,
          croppedUrl,
          processedUrl: null,
          processedBlob: null
        };
      }));

      setOcr('');
      setQuality(null);
      setComparison(null);
      setComparisonError('');
      setYoloResult(null);
      setYoloError('');
      setCropOpen(false);

    } catch (error) {
      setError(error.message || 'Manual cropping failed');
    } finally {
      setCropBusy(false);
    }
  }

  function resetManualCrop() {
    if (!current || busy || cropBusy || cropOpen) return;

    setPages(old => old.map((page, index) => {
      if (index !== selected) return page;

      if (page.croppedUrl) {
        URL.revokeObjectURL(page.croppedUrl);
      }

      if (page.processedUrl) {
        URL.revokeObjectURL(page.processedUrl);
      }

      return {
        ...page,
        croppedFile: null,
        croppedUrl: null,
        processedUrl: null,
        processedBlob: null
      };
    }));

    setOcr('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    setYoloResult(null);
    setYoloError('');
    setCropOpen(false);
  }


  function move(direction) {
    if (busy || cropBusy || cropOpen) return;
    const next = selected + direction;
    if (next < 0 || next >= pages.length) return;
    setPages(old => {
      const copy = [...old];
      [copy[selected], copy[next]] =
        [copy[next], copy[selected]];
      return copy;
    });
    setSelected(next);
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    setYoloResult(null);
    setYoloError('');
  }

  const showGamma = mode === 'gamma' || mode === 'combined';
  const showClahe = mode === 'clahe' || mode === 'combined';
  const showDenoise = mode === 'denoise' || mode === 'combined';
  const showSharpen = mode === 'sharpen' || mode === 'combined';

  return <main>
    <header>
      <h1>▣ SmartScan</h1>
      <span>Advanced Document Scanner & Image Enhancement</span>
    </header>


    {cropOpen && current && (
      <div className="crop-modal-backdrop">
        <div className="crop-modal">
          <h2>✂️ Manual Image Cropping</h2>

          <p className="hint">
            Drag the corners or edges to resize the crop area.
          </p>

          <div className="crop-editor">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              keepSelection
              minWidth={20}
              minHeight={20}
            >
              <img
                ref={cropImageRef}
                src={activeUrl}
                alt="Crop preview"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: '400px',
                  width: 'auto',
                  height: 'auto'
                }}
              />
            </ReactCrop>
          </div>

          <div className="crop-modal-buttons">
            <button
              disabled={cropBusy}
              onClick={() => setCropOpen(false)}
            >
              Cancel
            </button>

            <button
              className="primary"
              disabled={!crop.width || !crop.height || cropBusy}
              onClick={applyManualCrop}
            >
              {cropBusy ? 'Cropping...' : 'Apply Crop'}
            </button>
          </div>
        </div>
      </div>
    )}


    <section className="layout">
      <aside>
        <h2>Documents</h2>
        <label className="upload">
          + Add images
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            onChange={addFiles}
          />
        </label>

        <div className="pages">
          {pages.map((p, i) =>
            <button
              disabled={busy || cropBusy || cropOpen}
              className={'thumb ' + (selected === i ? 'active' : '')}
              key={p.originalUrl}
              onClick={() => {
                setSelected(i);
                setOcr('');
                setQuality(null);
                setComparison(null);
                setComparisonError('');
                setYoloResult(null);
                setYoloError('');
              }}
            >
              <img
                src={p.processedUrl || p.croppedUrl || p.originalUrl}
                alt={`Page ${i + 1}`}
              />
              <span>Page {i + 1}</span>
            </button>
          )}
        </div>

        <div className="row">
          <button
            disabled={!current || busy || cropBusy || cropOpen || selected === 0}
            onClick={() => move(-1)}
          >↑ Move</button>
          <button
            disabled={!current || busy || cropBusy || cropOpen ||
              selected === pages.length - 1}
            onClick={() => move(1)}
          >↓ Move</button>
        </div>

        <button disabled={!current || busy || cropBusy || cropOpen} onClick={remove}>
          Remove page
        </button>
      </aside>

      <article>
        <h2>Original vs Enhanced Preview</h2>

        <div className="manual-crop-actions">
          <button
            disabled={!current || busy || cropBusy}
            onClick={openManualCrop}
          >
            ✂️ Manual Crop
          </button>

          <button
            disabled={
              !current?.croppedFile ||
              busy ||
              cropBusy
            }
            onClick={resetManualCrop}
          >
            Reset Crop
          </button>
        </div>

        {current?.croppedFile && (
          <p className="hint">Manual crop applied. Reset Crop restores the full image.</p>
        )}
        <div className="comparison">
          <div className="comparison-pane">
            <h3>Original</h3>
            <div className="preview">
              {current
                ? <img src={activeUrl}
                  alt="Original document" />
                : <p>Upload an image to begin</p>}
            </div>
          </div>

          <div className="comparison-pane">
            <h3>Enhanced</h3>
            <div className="preview">
              {current
                ? <img
                  src={current.processedUrl || activeUrl}
                  alt="Enhanced document"
                />
                : <p>Enhanced preview appears here</p>}
            </div>
            {current && !current.processedBlob &&
              <p className="hint">
                Apply a filter to generate the enhanced image.
              </p>}
          </div>
        </div>

        <div className="row">
          <button
            disabled={!current?.processedBlob || busy}
            onClick={() =>
              download(current.processedBlob, 'enhanced-page.png')}
          >Download PNG</button>
          <button
            disabled={!pages.length || busy}
            onClick={exportPdf}
          >Export PDF</button>
        </div>


        <section className="quality-section">
          <h2>📊 Image Quality Analysis</h2>

          <button
            className="primary"
            disabled={!current || busy || qualityBusy}
            onClick={analyzeQuality}
          >
            {qualityBusy ? 'Analyzing...' : 'Analyze Quality'}
          </button>

          {quality && (() => {
            const original = quality.original || quality;
            const enhanced = quality.enhanced;
            const comparison = quality.comparison;

            const metrics = [
              ['Brightness', 'brightness'],
              ['Contrast', 'contrast'],
              ['Blur Score', 'blur_score']
            ];

            return (
              <div className="quality-results">
                <div className="quality-grid">
                  {metrics.map(([label, key]) => (
                    <div className="quality-card" key={key}>
                      <h3>{label}</h3>
                      <p>Original: <strong>{original[key]}</strong></p>
                      {enhanced && (
                        <p>
                          Enhanced:
                          <strong> {enhanced[key]}</strong>
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {comparison && (
                  <div className="quality-grid">
                    <div className="quality-card">
                      <h3>PSNR</h3>
                      <strong>
                        {comparison.psnr === null
                          ? '∞ (identical)'
                          : `${comparison.psnr} dB`}
                      </strong>
                    </div>
                    <div className="quality-card">
                      <h3>SSIM</h3>
                      <strong>{comparison.ssim}</strong>
                    </div>
                  </div>
                )}

                <h3>Grayscale Histogram</h3>
                <Histogram
                  original={original.histogram}
                  enhanced={enhanced?.histogram || []}
                />

                <p className="hint">
                  Higher metric values do not always mean
                  better image quality. PSNR and SSIM measure
                  similarity to the original image.
                </p>
              </div>
            );
          })()}
        </section>


        <section className="algorithm-section">
          <h2>🔬 Algorithm Comparison</h2>

          <p className="hint">
            Compare original image with Gamma, CLAHE,
            Denoising, Sharpening and Combined Enhancement.
          </p>

          <button
            className="primary"
            disabled={!current || busy || comparisonBusy}
            onClick={compareAlgorithms}
          >
            {comparisonBusy
              ? 'Comparing algorithms...'
              : 'Compare All Algorithms'}
          </button>

          {comparisonError && (
            <p className="error">{comparisonError}</p>
          )}

          {comparison && (
            <>
              <div className="algorithm-grid">
                {[
                  ['original', 'Original'],
                  ['gamma', 'Gamma Correction'],
                  ['clahe', 'CLAHE'],
                  ['denoised', 'Denoising'],
                  ['sharpened', 'Sharpening'],
                  ['combined', 'Combined Enhancement']
                ].map(([key, title]) => {
                  const result = comparison[key];

                  if (!result) return null;

                  return (
                    <div className="algorithm-card" key={key}>
                      <h3>{title}</h3>

                      <img
                        src={`data:image/jpeg;base64,${result.image}`}
                        alt={title}
                      />

                      <div className="algorithm-metrics">
                        <p>
                          Brightness:
                          <strong> {result.metrics.brightness}</strong>
                        </p>
                        <p>
                          Contrast:
                          <strong> {result.metrics.contrast}</strong>
                        </p>
                        <p>
                          Blur Score:
                          <strong> {result.metrics.blur_score}</strong>
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          const binary = atob(result.image);
                          const bytes = Uint8Array.from(
                            binary,
                            char => char.charCodeAt(0)
                          );
                          download(
                            new Blob([bytes], { type: 'image/jpeg' }),
                            `${key}-enhanced.jpg`
                          );
                        }}
                      >
                        Download Image
                      </button>
                    </div>
                  );
                })}
              </div>

              <h3>📊 Histogram Comparison</h3>

              <label className="field-label">
                Compare Original with:
                <select
                  value={selectedHistogram}
                  onChange={e => setSelectedHistogram(e.target.value)}
                >
                  <option value="gamma">Gamma</option>
                  <option value="clahe">CLAHE</option>
                  <option value="denoised">Denoising</option>
                  <option value="sharpened">Sharpening</option>
                  <option value="combined">Combined</option>
                </select>
              </label>

              <Histogram
                original={comparison.original.metrics.histogram}
                enhanced={
                  comparison[selectedHistogram]?.metrics.histogram || []
                }
              />

              <h3>📋 Quality Metrics Comparison</h3>

              <div className="algorithm-table-wrap">
                <table className="algorithm-table">
                  <thead>
                    <tr>
                      <th>Algorithm</th>
                      <th>Brightness</th>
                      <th>Contrast</th>
                      <th>Blur Score</th>
                    </tr>
                  </thead>

                  <tbody>
                    {Object.entries(comparison).map(([key, result]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{result.metrics.brightness}</td>
                        <td>{result.metrics.contrast}</td>
                        <td>{result.metrics.blur_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>


        <section className="yolo-section">
          <h2>🎯 YOLO Object Detection Comparison</h2>

          <p className="hint">
            Detect objects in original and enhanced images
            using the same YOLO model.
          </p>

          <div className="yolo-controls">
            <label>
              Confidence Threshold:
              <strong> {yoloConfidence.toFixed(2)}</strong>
            </label>

            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={yoloConfidence}
              onChange={e => {
                setYoloConfidence(Number(e.target.value));
                setYoloResult(null);
                setYoloError('');
              }}
            />

            <button
              className="primary"
              disabled={
                !current?.processedBlob ||
                busy ||
                yoloBusy
              }
              onClick={runYoloComparison}
            >
              {yoloBusy
                ? 'Running YOLO Detection...'
                : 'Compare YOLO Detection'}
            </button>

            {current && !current.processedBlob && (
              <p className="hint">
                First click Scan & Enhance to generate
                the enhanced image.
              </p>
            )}
          </div>

          {yoloError && (
            <p className="error">{yoloError}</p>
          )}

          {yoloResult && (
            <>
              <div className="yolo-grid">
                {[
                  ['original', 'Original Image'],
                  ['enhanced', 'Enhanced Image']
                ].map(([key, title]) => {
                  const result = yoloResult[key];

                  return (
                    <div className="yolo-card" key={key}>
                      <h3>{title}</h3>

                      <img
                        src={`data:image/jpeg;base64,${result.image}`}
                        alt={`${title} with YOLO detections`}
                      />

                      <div className="yolo-stats">
                        <p>
                          Detected Objects:
                          <strong> {result.detection_count}</strong>
                        </p>

                        <p>
                          Average Confidence:
                          <strong>
                            {' '}
                            {result.average_confidence === null
                              ? 'N/A'
                              : `${(
                                result.average_confidence * 100
                              ).toFixed(2)}%`}
                          </strong>
                        </p>
                      </div>

                      <h4>Detected Objects</h4>

                      {result.detections.length === 0 ? (
                        <p className="hint">
                          No objects detected.
                        </p>
                      ) : (
                        <div className="yolo-detection-list">
                          {result.detections.map((item, index) => (
                            <div
                              className="yolo-detection-item"
                              key={index}
                            >
                              <span>{item.object}</span>
                              <strong>
                                {(item.confidence * 100).toFixed(1)}%
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          const binary = atob(result.image);

                          const bytes = Uint8Array.from(
                            binary,
                            char => char.charCodeAt(0)
                          );

                          download(
                            new Blob(
                              [bytes],
                              { type: 'image/jpeg' }
                            ),
                            `yolo-${key}.jpg`
                          );
                        }}
                      >
                        Download Detection Image
                      </button>
                    </div>
                  );
                })}
              </div>

              <h3>📊 Detection Comparison Summary</h3>

              <div className="yolo-summary">
                <div className="yolo-summary-card">
                  <span>Original Detections</span>
                  <strong>
                    {yoloResult.comparison.original_count}
                  </strong>
                </div>

                <div className="yolo-summary-card">
                  <span>Enhanced Detections</span>
                  <strong>
                    {yoloResult.comparison.enhanced_count}
                  </strong>
                </div>

                <div className="yolo-summary-card">
                  <span>Detection Difference</span>
                  <strong>
                    {yoloResult.comparison.detection_difference > 0
                      ? '+'
                      : ''}
                    {yoloResult.comparison.detection_difference}
                  </strong>
                </div>
              </div>

              <p className="hint">
                A higher detection count or confidence does not
                necessarily mean better accuracy. Compare the
                bounding boxes and false detections as well.
              </p>
            </>
          )}
        </section>




        <h2>OCR text</h2>
        <button disabled={!current || busy} onClick={extract}>
          Extract text
        </button>
        <textarea
          value={ocr}
          onChange={e => setOcr(e.target.value)}
          placeholder="Extracted text appears here"
        />
        <button
          disabled={!ocr}
          onClick={() => download(
            new Blob([ocr], { type: 'text/plain' }),
            'extracted-text.txt'
          )}
        >Download TXT</button>
      </article>

      <aside>
        <h2>Enhancement</h2>
        <label className="field-label">
          Filter
          <select
            value={mode}
            onChange={e => {
              setMode(e.target.value);
              setComparison(null);
              setComparisonError('');
              setYoloResult(null);
              setYoloError('');
            }}
          >
            {METHODS.map(([value, label]) =>
              <option value={value} key={value}>{label}</option>
            )}
          </select>
        </label>

        {showGamma &&
          <div className="slider-field">
            <label htmlFor="gamma">
              Gamma <strong>{gamma.toFixed(1)}</strong>
            </label>
            <input id="gamma" type="range"
              min="0.2" max="3" step="0.1"
              value={gamma}
              onChange={e => {
                setGamma(Number(e.target.value));
                setComparison(null);
                setComparisonError('');
                setYoloResult(null);
                setYoloError('');
              }}
            />
          </div>}

        {showClahe &&
          <div className="slider-field">
            <label htmlFor="clip">
              CLAHE clip limit
              <strong>{clipLimit.toFixed(1)}</strong>
            </label>
            <input id="clip" type="range"
              min="1" max="5" step="0.5"
              value={clipLimit}
              onChange={e => {
                setClipLimit(Number(e.target.value));
                setComparison(null);
                setComparisonError('');
                setYoloResult(null);
                setYoloError('');
              }}
            />
          </div>}

        {showDenoise &&
          <div className="slider-field">
            <label htmlFor="denoise">
              Denoising strength
              <strong>{denoiseStrength}</strong>
            </label>
            <input id="denoise" type="range"
              min="1" max="30" step="1"
              value={denoiseStrength}
              onChange={e => {
                setDenoiseStrength(Number(e.target.value));
                setComparison(null);
                setComparisonError('');
                setYoloResult(null);
                setYoloError('');
              }}
            />
          </div>}

        {showSharpen &&
          <div className="slider-field">
            <label htmlFor="sharpen">
              Sharpening strength
              <strong>{sharpenStrength.toFixed(1)}</strong>
            </label>
            <input id="sharpen" type="range"
              min="0" max="3" step="0.1"
              value={sharpenStrength}
              onChange={e => {
                setSharpenStrength(Number(e.target.value));
                setComparison(null);
                setComparisonError('');
                setYoloResult(null);
                setYoloError('');
              }}
            />
          </div>}

        <label className="check">
          <input
            type="checkbox"
            checked={autoCrop}
            onChange={e => {
              setAutoCrop(e.target.checked);
              setYoloResult(null);
              setYoloError('');
            }}
          />
          Automatic crop
        </label>

        <button
          className="primary"
          disabled={!current || busy || cropBusy || cropOpen}
          onClick={process}
        >
          {busy ? 'Working...' : 'Scan & Enhance'}
        </button>

        <p className="hint">
          If no clear document boundary is found, the framing is retained.
          Advanced filters use the manually cropped image when available.
          Automatic crop is skipped after manual cropping.
        </p>
        {error &&
          <p className="error" role="alert">{error}</p>}
      </aside>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);