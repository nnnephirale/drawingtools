/* ════════════════════════════════════════════════════════════════════
   images in
   ════════════════════════════════════════════════════════════════════ */
function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(200, Math.round(img.naturalWidth * k)), hgt = Math.max(200, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
    URL.revokeObjectURL(url);
    mutate(() => { resizeDoc(w, hgt); doc.bgImage = cv; });
    afterChange();
    toast(`${w}×${hgt}`);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("That image couldn't be read"); };
  img.src = url;
}
$('#btnImage').onclick = () => $('#file').click();
$('#file').onchange = e => { loadImageFile(e.target.files[0]); e.target.value = ''; };
{
  const veil = $('#veil'); let depth = 0;
  addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { depth++; veil.classList.add('on'); e.preventDefault(); } });
  addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) veil.classList.remove('on'); });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); depth = 0; veil.classList.remove('on'); loadImageFile(e.dataTransfer.files[0]); });
  addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) loadImageFile(f); });
}

