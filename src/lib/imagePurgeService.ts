import { db } from './firebase';
import { 
  collection, getDocs, doc, updateDoc, writeBatch 
} from 'firebase/firestore';
import { RecordDoc } from '../types';

export interface ImageStats {
  totalRecords: number;
  recordsWithImages: number;
  recordsOlderThan29DaysWithImages: number;
  totalImagesCount: number;
}

/**
 * Calculates current statistics about stored images in the clinical records.
 */
export async function getImageStorageStats(): Promise<ImageStats> {
  const recordsSnap = await getDocs(collection(db, 'records'));
  const now = Date.now();
  const cycle29DaysMs = 29 * 24 * 60 * 60 * 1000;

  let totalRecords = 0;
  let recordsWithImages = 0;
  let recordsOlderThan29DaysWithImages = 0;
  let totalImagesCount = 0;

  recordsSnap.forEach((docSnap) => {
    totalRecords++;
    const data = docSnap.data() as RecordDoc;
    const hasPhotosArray = Array.isArray(data.photos) && data.photos.length > 0;
    const hasPhotoInAnswers = Object.entries(data.answers || {}).some(([k, v]) => 
      (k.toLowerCase().includes('foto') || k.toLowerCase().includes('photo')) && 
      typeof v === 'string' && v.startsWith('data:image') || (typeof v === 'string' && v.startsWith('http'))
    );

    if (hasPhotosArray || hasPhotoInAnswers) {
      recordsWithImages++;
      const count = (data.photos?.length || 0) + (hasPhotoInAnswers ? 1 : 0);
      totalImagesCount += count;

      const recordAge = now - (data.createdAt || now);
      if (recordAge >= cycle29DaysMs) {
        recordsOlderThan29DaysWithImages++;
      }
    }
  });

  return {
    totalRecords,
    recordsWithImages,
    recordsOlderThan29DaysWithImages,
    totalImagesCount
  };
}

/**
 * Automatically purges images older than 29 days across all records.
 * Keeps 100% of all clinical records, answers, and evaluations intact.
 */
export async function purgeImagesOlderThanCycle(days = 29): Promise<{ updatedCount: number }> {
  const recordsSnap = await getDocs(collection(db, 'records'));
  const now = Date.now();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  let updatedCount = 0;
  const batch = writeBatch(db);
  let batchOps = 0;

  for (const docSnap of recordsSnap.docs) {
    const data = docSnap.data() as RecordDoc;
    const recordAge = now - (data.createdAt || now);

    if (recordAge >= thresholdMs) {
      const hasPhotosArray = Array.isArray(data.photos) && data.photos.length > 0;
      let hasPhotoInAnswers = false;
      const updatedAnswers = { ...(data.answers || {}) };

      Object.entries(updatedAnswers).forEach(([k, v]) => {
        if (
          (k.toLowerCase().includes('foto') || k.toLowerCase().includes('photo')) &&
          typeof v === 'string' &&
          (v.startsWith('data:image') || v.startsWith('http'))
        ) {
          hasPhotoInAnswers = true;
          updatedAnswers[k] = '[Foto expurgada no ciclo de 29 dias]';
        }
      });

      if (hasPhotosArray || hasPhotoInAnswers) {
        batch.update(doc(db, 'records', docSnap.id), {
          photos: [],
          answers: updatedAnswers,
          imagesPurgedAt: now,
          imagesPurgeReason: `Ciclo automático de ${days} dias`
        });
        batchOps++;
        updatedCount++;

        if (batchOps >= 450) {
          await batch.commit();
          batchOps = 0;
        }
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return { updatedCount };
}

/**
 * Admin action: Expunge ALL image attachments from all system records,
 * releasing maximum storage while keeping every record, status, and history intact.
 */
export async function purgeAllImagesFromSystem(): Promise<{ updatedCount: number }> {
  const recordsSnap = await getDocs(collection(db, 'records'));
  const now = Date.now();

  let updatedCount = 0;
  const batch = writeBatch(db);
  let batchOps = 0;

  for (const docSnap of recordsSnap.docs) {
    const data = docSnap.data() as RecordDoc;
    const hasPhotosArray = Array.isArray(data.photos) && data.photos.length > 0;
    let hasPhotoInAnswers = false;
    const updatedAnswers = { ...(data.answers || {}) };

    Object.entries(updatedAnswers).forEach(([k, v]) => {
      if (
        (k.toLowerCase().includes('foto') || k.toLowerCase().includes('photo')) &&
        typeof v === 'string' &&
        (v.startsWith('data:image') || v.startsWith('http'))
      ) {
        hasPhotoInAnswers = true;
        updatedAnswers[k] = '[Foto expurgada pelo Administrador]';
      }
    });

    if (hasPhotosArray || hasPhotoInAnswers) {
      batch.update(doc(db, 'records', docSnap.id), {
        photos: [],
        answers: updatedAnswers,
        imagesPurgedAt: now,
        imagesPurgeReason: 'Expurgo manual executado pelo Administrador'
      });
      batchOps++;
      updatedCount++;

      if (batchOps >= 450) {
        await batch.commit();
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return { updatedCount };
}
