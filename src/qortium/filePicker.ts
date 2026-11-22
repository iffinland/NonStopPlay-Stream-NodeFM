/** Browser file selection stays inside the user gesture; files are never serialized into drafts. */
export function pickPublishFile(
  accept = 'audio/*,.mp3,.flac,.ogg,.wav,.m4a,.aac,.opus',
): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = () => {
      timer = setTimeout(() => finish(input.files?.[0] ?? null), 1000);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    try {
      input.click();
    } catch (error) {
      input.remove();
      window.removeEventListener('focus', onFocus);
      reject(error);
    }
  });
}
