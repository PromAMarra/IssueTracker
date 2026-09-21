/**
 * Client-side-only helper (must run in a browser, not during SSR) that
 * rasterizes a DOM element to a paginated PDF. Used by
 * components/dashboard/ExportDashboardButton.tsx / ExportPdfButton.tsx to
 * let a user download a snapshot of the current dashboard view.
 *
 * Approach: screenshot the live DOM node with html2canvas, then slice that
 * single tall image across as many A4 pages as needed with jsPDF — this is a
 * visual snapshot of whatever is currently rendered (including any
 * client-side filters/phase selection already applied on screen), not a
 * server-rendered or data-driven PDF report. Anything not actually visible
 * on screen (e.g. content scrolled out of view within a nested scroll
 * container, if the target element itself isn't the full page) will not
 * appear in the export.
 */
// Dynamically imported below — html2canvas + jsPDF pull in a large rendering
// dependency chain that should only load when someone actually clicks
// "Download as PDF", not on every dashboard visit.
export async function exportElementToPdf(elementId: string, title: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Could not find the dashboard content to export.');

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  pdf.setFontSize(14);
  pdf.text(title, 10, 10);
  const dateLabel = `Exported ${new Date().toLocaleDateString('en-GB')}`;
  pdf.setFontSize(9);
  pdf.text(dateLabel, 10, 16);

  let position = 20; // leave room for the title/date on page 1
  let heightLeft = imgHeight;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - position;

  // jsPDF has no built-in "continue this image on the next page" primitive:
  // the same full-height image is re-added on every page, just shifted
  // further up (increasingly negative `position`) so each page's fixed
  // viewport reveals a different vertical slice of it — this is what
  // produces pagination rather than a giant single page.
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
