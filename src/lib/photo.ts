// Compression des photos dans le navigateur avant envoi (bucket « photos » : jpg/png/webp, 5 Mo max).

export const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const TAILLE_MAX_PHOTO = 5 * 1024 * 1024;
const TAILLE_MAX_ORIGINAL = 25 * 1024 * 1024;
const COTE_MAX = 1600;

export class ErreurPhoto extends Error {}

export function verifierPhoto(fichier: File) {
  if (!TYPES_PHOTO.includes(fichier.type)) {
    throw new ErreurPhoto('Format non accepté : choisissez une photo JPG, PNG ou WEBP.');
  }
  if (fichier.size > TAILLE_MAX_ORIGINAL) {
    throw new ErreurPhoto('Photo trop lourde (plus de 25 Mo). Choisissez une autre photo.');
  }
}

function versBlob(canvas: HTMLCanvasElement, type: string, qualite: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, qualite));
}

// Redimensionne (1600 px max) et réencode en WEBP, ou en JPEG si le navigateur ne sait pas produire du WEBP.
export async function compresserPhoto(fichier: File): Promise<Blob> {
  verifierPhoto(fichier);

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new ErreurPhoto('Impossible de lire cette image. Essayez avec une autre photo.');
  }

  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * echelle);
  canvas.height = Math.round(image.height * echelle);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  let blob = await versBlob(canvas, 'image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await versBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) throw new ErreurPhoto('La compression de la photo a échoué. Essayez avec une autre photo.');
  if (blob.size > TAILLE_MAX_PHOTO) throw new ErreurPhoto('Photo trop lourde même après compression (5 Mo max).');
  return blob;
}

export const extensionPhoto = (blob: Blob) => (blob.type === 'image/webp' ? 'webp' : 'jpg');
