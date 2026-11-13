/**
 * Helper utility to handle reliable, authenticated client-side loading
 * and opening of the 43MB Virtuoso 2026–27 Official Brochure PDF.
 *
 * In iframe/sandboxed environments, direct top-level navigation to
 * binary files can fail Cloud Run auth verification (returning HTTP 500).
 * By fetching the PDF within the active authenticated session and creating
 * an in-memory Blob URL, the browser opens the native PDF viewer in a new
 * tab with zero network auth errors.
 */

let cachedBlobUrl: string | null = null;
let fetchPromise: Promise<string> | null = null;

export async function getBrochureBlobUrl(): Promise<string> {
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const response = await fetch('/virtuoso-brochure.pdf');
      if (!response.ok) {
        throw new Error(`Failed to load brochure: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      cachedBlobUrl = URL.createObjectURL(pdfBlob);
      return cachedBlobUrl;
    } catch (err) {
      fetchPromise = null;
      throw err;
    }
  })();

  return fetchPromise;
}

export async function openOfficialBrochure(e?: React.MouseEvent): Promise<void> {
  if (e) {
    e.preventDefault();
  }

  try {
    const blobUrl = await getBrochureBlobUrl();
    const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

    // If pop-up blocker suppressed the new window, trigger direct download
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = 'Virtuoso_2026_Official_Brochure.pdf';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  } catch (error) {
    console.error('Failed to open brochure PDF:', error);
    // Fallback to direct navigation if fetch fails
    window.open('/virtuoso-brochure.pdf', '_blank');
  }
}
