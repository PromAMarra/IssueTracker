import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportElementToPdf(elementId: string, title: string, filename: string): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Could not find the dashboard content to export.');
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

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
