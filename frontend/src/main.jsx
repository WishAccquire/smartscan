
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

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
  const pagesRef = useRef([]);
  const current = pages[selected];

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => {
    pagesRef.current.forEach(p => {
      URL.revokeObjectURL(p.originalUrl);
      if (p.processedUrl) URL.revokeObjectURL(p.processedUrl);
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
    event.target.value = '';
  }

  async function process() {
    if (!current || busy) return;
    const pageIndex = selected;
    const pageUrl = current.originalUrl;
    setBusy(true);
    setError('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
    try {
      const form = new FormData();
      form.append('file', current.file);
      form.append('auto_crop', String(autoCrop));
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
        if (old[pageIndex]?.originalUrl !== pageUrl) {
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
        form.append('original', current.file);
        form.append(
          'enhanced',
          current.processedBlob,
          'enhanced.png'
        );
      } else {
        form.append('file', current.file);
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

      form.append('file', current.file);

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



  async function extract() {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append(
        'file',
        current.processedBlob || current.file,
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
          p.processedBlob || p.file,
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
    if (!current || busy) return;
    URL.revokeObjectURL(current.originalUrl);
    if (current.processedUrl)
      URL.revokeObjectURL(current.processedUrl);
    setPages(old => old.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
    setOcr('');
    setQuality(null);
    setComparison(null);
    setComparisonError('');
  }

  function move(direction) {
    if (busy) return;
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
              disabled={busy}
              className={'thumb ' + (selected === i ? 'active' : '')}
              key={p.originalUrl}
              onClick={() => {
                setSelected(i);
                setOcr('');
                setQuality(null);
                setComparison(null);
                setComparisonError('');
              }}
            >
              <img
                src={p.processedUrl || p.originalUrl}
                alt={`Page ${i + 1}`}
              />
              <span>Page {i + 1}</span>
            </button>
          )}
        </div>

        <div className="row">
          <button
            disabled={!current || busy || selected === 0}
            onClick={() => move(-1)}
          >↑ Move</button>
          <button
            disabled={!current || busy ||
              selected === pages.length - 1}
            onClick={() => move(1)}
          >↓ Move</button>
        </div>

        <button disabled={!current || busy} onClick={remove}>
          Remove page
        </button>
      </aside>

      <article>
        <h2>Original vs Enhanced Preview</h2>
        <div className="comparison">
          <div className="comparison-pane">
            <h3>Original</h3>
            <div className="preview">
              {current
                ? <img src={current.originalUrl}
                  alt="Original document" />
                : <p>Upload an image to begin</p>}
            </div>
          </div>

          <div className="comparison-pane">
            <h3>Enhanced</h3>
            <div className="preview">
              {current
                ? <img
                  src={current.processedUrl || current.originalUrl}
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
              }}
            />
          </div>}

        <label className="check">
          <input
            type="checkbox"
            checked={autoCrop}
            onChange={e => setAutoCrop(e.target.checked)}
          />
          Automatic crop
        </label>

        <button
          className="primary"
          disabled={!current || busy}
          onClick={process}
        >
          {busy ? 'Working...' : 'Scan & Enhance'}
        </button>

        <p className="hint">
          If no clear document boundary is found, the original
          framing is retained. Advanced filters always process
          the original uploaded file.
        </p>
        {error &&
          <p className="error" role="alert">{error}</p>}
      </aside>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
