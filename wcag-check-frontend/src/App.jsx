import { useState, useEffect } from 'react';
import './App.css';

/**
 * Extrahiert den src-Wert aus einem HTML-Snippet (z.B. <img src="...">).
 */
function getImageUrlFromHtml(htmlSnippet) {
  const match = htmlSnippet.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match && match[1] ? match[1] : null;
}

/**
 * Wandelt ein Array von Alt-Text-Vorschlägen in ein Mapping um:
 * { absoluteImageUrl: generatedAltText }
 */
function createAltSuggestionsMap(array) {
  return array.reduce((acc, item) => {
    acc[item.imageUrl] = item.altText;
    return acc;
  }, {});
}

/**
 * DistributionBar:
 * Zeigt die Verteilung von Passes, Violations und Incompletes (oberer Balken),
 * sowie die Aufschlüsselung der Violations nach Schweregrad (unterer Balken)
 * und die absoluten Zahlen plus gemessene Laufzeiten.
 * => Zeitmessung wird nun in Sekunden (statt ms) angezeigt.
 */
function DistributionBar({ report, wcagCheckDuration, generateAltTextsDuration }) {
  if (!report) return null;

  const passesCount = report.passes ? report.passes.length : 0;
  const incompleteCount = report.incomplete ? report.incomplete.length : 0;
  const violationsCount = report.violations ? report.violations.length : 0;
  const inapplicableCount = report.inapplicable ? report.inapplicable.length : 0;

  const topTotal = passesCount + incompleteCount + violationsCount;
  if (topTotal === 0) return null;

  const passesPct = (passesCount / topTotal) * 100;
  const incompletePct = (incompleteCount / topTotal) * 100;
  const violationsPct = (violationsCount / topTotal) * 100;

  const severityLevels = ['critical', 'serious', 'moderate', 'minor'];
  let severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  if (report.violations) {
    report.violations.forEach(v => {
      if (severityLevels.includes(v.impact)) {
        severityCounts[v.impact] += 1;
      }
    });
  }
  const totalSeverity = Object.values(severityCounts).reduce((sum, count) => sum + count, 0);
  const severityPcts = {};
  severityLevels.forEach(level => {
    severityPcts[level] = totalSeverity ? (severityCounts[level] / totalSeverity) * 100 : 0;
  });

  const colors = {
    passes: "#4caf50",
    violations: "#ff9999",
    incomplete: "#8B0000",
    inapplicable: "#d3d3d3",
    critical: "#f44336",
    serious: "#ff9800",
    moderate: "#ffeb3b",
    minor: "#2196F3"
  };

  // Hilfsfunktion: Millisekunden -> Sekunden mit 2 Nachkommastellen
  const msToSeconds = (ms) => (ms / 1000).toFixed(2);

  return (
    <div className="distribution-container">
      <div className="distribution-bar">
        <div
          className="distribution-segment"
          style={{ background: colors.passes, width: `${passesPct}%`, minWidth: passesPct > 0 ? '2px' : 0 }}
        >
          {passesPct > 5 && <span>{passesPct.toFixed(0)}% Passes</span>}
        </div>
        <div
          className="distribution-segment"
          style={{ background: colors.violations, width: `${violationsPct}%`, minWidth: violationsPct > 0 ? '2px' : 0 }}
        >
          {violationsPct > 5 && <span>{violationsPct.toFixed(0)}% Violations</span>}
        </div>
        <div
          className="distribution-segment"
          style={{ background: colors.incomplete, width: `${incompletePct}%`, minWidth: incompletePct > 0 ? '2px' : 0 }}
        >
          {incompletePct > 5 && <span>{incompletePct.toFixed(0)}% Incompletes</span>}
        </div>
      </div>

      {violationsCount > 0 && (
        <div className="distribution-bar" style={{ marginTop: '10px' }}>
          {severityLevels.map(level => {
            const segWidth = severityPcts[level];
            return (
              <div
                key={level}
                className="distribution-subsegment"
                style={{ background: colors[level], width: `${segWidth}%`, minWidth: segWidth > 0 ? '2px' : 0 }}
              >
                {segWidth > 5 && <span>{segWidth.toFixed(0)}% {level}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="distribution-stats">
        <div className="distribution-stat-item">
          <span className="color-box" style={{ backgroundColor: colors.passes }}></span>
          <span>Passes: {passesCount}</span>
        </div>
        <div className="distribution-stat-item">
          <span className="color-box" style={{ backgroundColor: colors.incomplete }}></span>
          <span>Incompletes: {incompleteCount}</span>
        </div>
        <div className="distribution-stat-item">
          <span className="color-box" style={{ backgroundColor: colors.violations }}></span>
          <span>Violations: {violationsCount}</span>
        </div>
        <div className="distribution-stat-item">
          <span className="color-box" style={{ backgroundColor: colors.inapplicable }}></span>
          <span>Inapplicable: {inapplicableCount}</span>
        </div>
        {wcagCheckDuration > 0 && (
          <div className="distribution-stat-item">
            <strong>WCAG Check Dauer:</strong> {msToSeconds(wcagCheckDuration)} s
          </div>
        )}
        {generateAltTextsDuration > 0 && (
          <div className="distribution-stat-item">
            <strong>Alt-Texts Generierung Dauer:</strong> {msToSeconds(generateAltTextsDuration)} s
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Alt-Text Mapping
  const [altSuggestionsMap, setAltSuggestionsMap] = useState({});
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState('');

  // Gemessene Zeiten
  const [wcagCheckDuration, setWcagCheckDuration] = useState(0);
  const [generateAltTextsDuration, setGenerateAltTextsDuration] = useState(0);

  const IMPACT_ORDER = {
    critical: 1,
    serious: 2,
    moderate: 3,
    minor: 4
  };

  const sortByImpact = (violations) => {
    return violations.sort((a, b) => {
      const impactA = IMPACT_ORDER[a.impact] || 999;
      const impactB = IMPACT_ORDER[b.impact] || 999;
      return impactA - impactB;
    });
  };

  const getSortedViolations = () => {
    if (!report) return [];
    const violations = report.violations && report.violations.length > 0
      ? report.violations
      : (report.inapplicable || []);
    return sortByImpact([...violations]);
  };

  const getPasses = () => (report && report.passes) || [];
  const getIncompletes = () => (report && report.incomplete) || [];
  const getInapplicable = () => (report && report.inapplicable) || [];

  const handleCheck = async () => {
    if (!url) {
      setError('Bitte gib eine URL ein.');
      return;
    }
    setError('');
    setReport(null);
    setAltSuggestionsMap({});
    setLoading(true);
    const start = Date.now();
    try {
      const response = await fetch(`http://localhost:7071/api/wcagCheck?url=${encodeURIComponent(url)}`);
      if (!response.ok) throw new Error(`HTTP Fehler: ${response.statusText}`);
      const data = await response.json();
      setReport(data);
      console.log('Passes vom Server:', data.passes);
      console.log('Incompletes vom Server:', data.incomplete);
      console.log('Inapplicable vom Server:', data.inapplicable);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      const end = Date.now();
      setWcagCheckDuration(end - start);
    }
  };

  const handleGenerateAltTexts = async () => {
    setAltError('');
    setAltSuggestionsMap({});
    setAltLoading(true);
    const start = Date.now();
    try {
      const response = await fetch(`http://localhost:7071/api/generateAltTexts?url=${encodeURIComponent(url)}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP Fehler: ${response.statusText}`);
      const data = await response.json();
      console.log('Alt-Text results from server:', data);
      const map = createAltSuggestionsMap(data);
      setAltSuggestionsMap(map);
    } catch (err) {
      setAltError(err.message);
    } finally {
      setAltLoading(false);
      const end = Date.now();
      setGenerateAltTextsDuration(end - start);
    }
  };

  // useEffect: Finales Debug-Logging
  useEffect(() => {
    if (report) {
      console.log("=== Final Node Logs ===");
      console.log("Passes Nodes:");
      getPasses().forEach((pass, idx) => {
        console.log(`Pass ${idx}:`, pass.nodes);
      });
      console.log("Incompletes Nodes:");
      getIncompletes().forEach((inc, idx) => {
        console.log(`Incomplete ${idx}:`, inc.nodes);
      });
      console.log("Inapplicable Nodes:");
      getInapplicable().forEach((inapp, idx) => {
        console.log(`Inapplicable ${idx}:`, inapp.nodes);
      });
      console.log("=== End Final Node Logs ===");
    }
  }, [report]);

  return (
    <div className="App">
      <div className="container">
        <h1>WCAG-Prüfung</h1>
        <div className="input-container">
          <input
            type="text"
            placeholder="Gib eine URL ein, z.B. https://www.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={handleCheck} disabled={loading}>
            {loading ? 'Prüfung läuft…' : 'Prüfung starten'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}

        {report && (
          <>
            <DistributionBar
              report={report}
              wcagCheckDuration={wcagCheckDuration}
              generateAltTextsDuration={generateAltTextsDuration}
            />

            <div className="report">
              <h2>
                Prüfbericht für <a href={report.url} target="_blank" rel="noopener noreferrer">{report.url}</a>
              </h2>

              {/* Violations Accordion */}
              {getSortedViolations().length > 0 ? (
                getSortedViolations().map((violation, index) => {
                  // Button soll nur bei "image-alt" Violation erscheinen
                  const isImageAlt = (violation.id === 'image-alt');
                  const impactClass = violation.impact === 'minor'
                    ? 'impact-minor-blue'
                    : `impact-${violation.impact || 'none'}`;

                  return (
                    <details key={index} className={`violation ${impactClass}`}>
                      {/*
                        Wir bauen hier ein flex-Container, damit der Button
                        oben rechts angezeigt wird (auf gleicher Höhe wie der Text)
                      */}
                      <summary className="violation-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                          {violation.help} {violation.impact ? `(${violation.impact})` : ''}
                        </span>
                        {/* Button rechts */}
                        {isImageAlt && (
                          <button onClick={handleGenerateAltTexts} disabled={altLoading}>
                            {altLoading ? 'Generiere Alt-Texte…' : 'Alt-Texte generieren'}
                          </button>
                        )}
                      </summary>

                      <div className="violation-content">
                        <p>
                          <a href={violation.helpUrl} target="_blank" rel="noopener noreferrer">
                            WCAG Erfolgskriterium
                          </a>
                        </p>

                        {violation.nodes && violation.nodes.length > 0 && (
                          <div className="violation-nodes">
                            {violation.nodes.map((node, nodeIndex) => {
                              const elementInfo = node.html || (node.target ? node.target.join(", ") : "Kein spezifisches Element gefunden");
                              let imageUrl = getImageUrlFromHtml(node.html);
                              if (imageUrl && !imageUrl.startsWith('http')) {
                                imageUrl = new URL(imageUrl, report.url).href;
                              }
                              const suggestedAlt = altSuggestionsMap[imageUrl] || '';
                              return (
                                <div key={nodeIndex} className="violation-node">
                                  <p>
                                    <strong>Element:</strong> <code>{elementInfo}</code>
                                  </p>
                                  {imageUrl && (
                                    <div className="image-preview">
                                      <img
                                        src={imageUrl}
                                        alt={suggestedAlt || 'Bild ohne Alt-Text'}
                                        style={{ maxWidth: '500px', maxHeight: '500px' }}
                                      />
                                    </div>
                                  )}
                                  {suggestedAlt && (
                                    <p>
                                      <strong>Alt-Text Vorschlag:</strong> {suggestedAlt}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Fehlermeldung bei Alt-Text Generierung (nur falls isImageAlt) */}
                        {isImageAlt && altError && (
                          <div className="error" style={{ marginTop: '10px' }}>{altError}</div>
                        )}
                      </div>
                    </details>
                  );
                })
              ) : (
                <p>Keine Verstöße gefunden oder Daten nicht im erwarteten Format.</p>
              )}

              {/* Passes Accordion */}
              {getPasses().length > 0 && (
                <details className="pass-accordion">
                  <summary className="pass-summary">Passes</summary>
                  <div className="pass-content">
                    {getPasses().map((pass, index) => (
                      <details key={index} className="pass">
                        <summary className="pass-summary">
                          <a href={pass.helpUrl} target="_blank" rel="noopener noreferrer">
                            {pass.help}
                          </a>
                        </summary>
                        <div className="pass-content">
                          {pass.description && <p>{pass.description}</p>}
                          {pass.nodes && pass.nodes.length > 0 && (
                            <div className="pass-nodes">
                              {pass.nodes.map((node, nodeIndex) => {
                                const elementInfo = node.html || (node.target ? node.target.join(", ") : "Kein spezifisches Element gefunden");
                                let imageUrl = getImageUrlFromHtml(node.html);
                                if (imageUrl && !imageUrl.startsWith('http')) {
                                  imageUrl = new URL(imageUrl, report.url).href;
                                }
                                return (
                                  <div key={nodeIndex} className="pass-node">
                                    <p>
                                      <strong>Element:</strong> <code>{elementInfo}</code>
                                    </p>
                                    {imageUrl && (
                                      <div className="image-preview">
                                        <img
                                          src={imageUrl}
                                          alt="Bild"
                                          style={{ maxWidth: '100px', maxHeight: '100px' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              )}

              {/* Incompletes Accordion */}
              {getIncompletes().length > 0 && (
                <details className="incomplete-accordion">
                  <summary className="incomplete-summary">Incompletes</summary>
                  <div className="incomplete-content">
                    {getIncompletes().map((inc, index) => (
                      <details key={index} className="incomplete-item">
                        <summary className="incomplete-summary">
                          <a href={inc.helpUrl} target="_blank" rel="noopener noreferrer">
                            {inc.help}
                          </a>
                        </summary>
                        <div className="incomplete-content">
                          {inc.description && <p>{inc.description}</p>}
                          {inc.nodes && inc.nodes.length > 0 && (
                            <div className="incomplete-nodes">
                              {inc.nodes.map((node, nodeIndex) => {
                                const elementInfo = node.html || (node.target ? node.target.join(", ") : "Kein spezifisches Element gefunden");
                                let imageUrl = getImageUrlFromHtml(node.html);
                                if (imageUrl && !imageUrl.startsWith('http')) {
                                  imageUrl = new URL(imageUrl, report.url).href;
                                }
                                return (
                                  <div key={nodeIndex} className="incomplete-node">
                                    <p>
                                      <strong>Element:</strong> <code>{elementInfo}</code>
                                    </p>
                                    {imageUrl && (
                                      <div className="image-preview">
                                        <img
                                          src={imageUrl}
                                          alt="Bild"
                                          style={{ maxWidth: '100px', maxHeight: '100px' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              )}

              {/* Inapplicable Accordion */}
              {getInapplicable().length > 0 && (
                <details className="inapplicable-accordion">
                  <summary className="inapplicable-summary">Inapplicable</summary>
                  <div className="inapplicable-content">
                    {getInapplicable().map((inapp, index) => (
                      <details key={index} className="inapplicable-item">
                        <summary className="inapplicable-summary">
                          <a href={inapp.helpUrl} target="_blank" rel="noopener noreferrer">
                            {inapp.help}
                          </a>
                        </summary>
                        <div className="inapplicable-content">
                          {inapp.description && <p>{inapp.description}</p>}
                          {inapp.nodes && inapp.nodes.length > 0 && (
                            <div className="inapplicable-nodes">
                              {inapp.nodes.map((node, nodeIndex) => {
                                const elementInfo = node.html || (node.target ? node.target.join(", ") : "Kein spezifisches Element gefunden");
                                let imageUrl = getImageUrlFromHtml(node.html);
                                if (imageUrl && !imageUrl.startsWith('http')) {
                                  imageUrl = new URL(imageUrl, report.url).href;
                                }
                                return (
                                  <div key={nodeIndex} className="inapplicable-node">
                                    <p>
                                      <strong>Element:</strong> <code>{elementInfo}</code>
                                    </p>
                                    {imageUrl && (
                                      <div className="image-preview">
                                        <img
                                          src={imageUrl}
                                          alt="Bild"
                                          style={{ maxWidth: '100px', maxHeight: '100px' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
