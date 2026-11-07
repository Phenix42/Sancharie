import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './LegalDocument.css';

function ContentBlocks({ section }) {
  return <>
    {section.paragraphs?.map((paragraph, index) => <p key={`p-${index}`}>{paragraph}</p>)}
    {section.bullets && <ul>{section.bullets.map((item, index) => <li key={`b-${index}`}>{item}</li>)}</ul>}
    {section.subsections?.map((subsection, index) => (
      <div className="legal-subsection" key={`s-${index}`}>
        <h3>{subsection.title}</h3>
        {subsection.paragraphs?.map((paragraph, paragraphIndex) => <p key={`sp-${paragraphIndex}`}>{paragraph}</p>)}
        {subsection.bullets && <ul>{subsection.bullets.map((item, itemIndex) => <li key={`sb-${itemIndex}`}>{item}</li>)}</ul>}
      </div>
    ))}
    {section.table && <div className="legal-table-wrap"><table><thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </>;
}

export default function LegalDocument({ title, effectiveDate = '08/11/2026', lastUpdated = '08/11/2026', sections, children }) {
  const location = useLocation();

  useEffect(() => {
    const targetId = decodeURIComponent(location.hash.slice(1));
    if (!targetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);

  return (
    <main className="legal-page">
      <div className="legal-page-shell">
        <header className="legal-page-header">
          <span className="legal-kicker">Sancharie · Legal information</span>
          <h1>{title}</h1>
          <p>Effective Date: {effectiveDate} <span aria-hidden="true">·</span> Last Updated: {lastUpdated}</p>
        </header>
        <aside className="legal-draft-notice" role="note">
          Draft for legal review. Replace bracketed placeholders and have the final text reviewed against Sancharie’s actual services, contracts, integrations and applicable law before publication.
        </aside>
        {children}
        <div className="legal-sections">
          {sections.map((section, index) => (
            <section className="legal-section" id={section.id} key={section.id || section.title}>
              <h2>{section.title}</h2>
              <ContentBlocks section={section} />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
