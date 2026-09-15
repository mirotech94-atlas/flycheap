'use client';

/**
 * Opens the browser print dialog scoped to a specific element on the page.
 * The user picks "Save as PDF" in the print dialog — no server-side PDF
 * rendering deps required.
 */
export function PrintButton({
  targetId,
  label = '⬇ Save as PDF',
  title = 'Print to PDF (browser print dialog)',
}: {
  targetId: string;
  label?: string;
  title?: string;
}) {
  function go() {
    const root = document.getElementById(targetId);
    if (!root) {
      window.print();
      return;
    }
    // Toggle a body class that the print stylesheet uses to hide everything
    // except the targeted element, so users get a clean PDF.
    root.classList.add('fc-print-target');
    document.body.classList.add('fc-printing');
    const cleanup = () => {
      root.classList.remove('fc-print-target');
      document.body.classList.remove('fc-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
  return (
    <button onClick={go} className="btn btn-sm" type="button" title={title}>
      {label}
    </button>
  );
}
