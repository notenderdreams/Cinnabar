import { commands } from '../../lib/bindings';
import { isTauri } from './runtime';

export interface ScannedPdfResult {
  file_name: string;
  file_path: string;
  file_size: number;
  modified_timestamp: number;
  directory_path: string;
  num_pages?: number | null;
}

export async function tauriOpenPdf(): Promise<{ fileName: string; filePath: string; data: Uint8Array } | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.openPdfDialog();
    if (res && res.data) {
      return {
        fileName: res.file_name,
        filePath: res.file_path,
        data: new Uint8Array(res.data),
      };
    }
  } catch (err) {
    console.warn('Tauri open PDF dialog error:', err);
  }
  return null;
}

export async function tauriReadFile(filePath: string): Promise<{ fileName: string; filePath: string; data: Uint8Array } | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.readFileFromPath(filePath);
    if (res && res.data) {
      return {
        fileName: res.file_name,
        filePath: res.file_path,
        data: new Uint8Array(res.data),
      };
    }
  } catch (err) {
    console.error('Tauri read file error:', err);
  }
  return null;
}

export async function tauriOpenImage(): Promise<{ fileName: string; filePath: string; dataUrl: string } | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.openImageDialog();
    if (res && res.data_url) {
      return {
        fileName: res.file_name,
        filePath: res.file_path,
        dataUrl: res.data_url,
      };
    }
  } catch (err) {
    console.warn('Tauri open image dialog error:', err);
  }
  return null;
}

export async function tauriSavePdf(pdfBytes: Uint8Array, defaultName: string): Promise<{ success: boolean; path?: string }> {
  if (!isTauri()) return { success: false };
  try {
    const res = await commands.savePdfDialog(Array.from(pdfBytes), defaultName);
    return {
      success: res.success,
      path: res.file_path || undefined,
    };
  } catch (err) {
    console.error('Tauri save PDF error:', err);
    return { success: false };
  }
}

export async function tauriWritePdf(pdfBytes: Uint8Array, filePath: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const res = await commands.writePdfFile(filePath, Array.from(pdfBytes));
    return res.success;
  } catch (err) {
    console.error('Tauri write PDF error:', err);
    return false;
  }
}

export async function tauriSaveJson(jsonString: string, defaultName: string): Promise<{ success: boolean; path?: string }> {
  if (!isTauri()) return { success: false };
  try {
    const res = await commands.saveJsonDialog(jsonString, defaultName);
    return {
      success: res.success,
      path: res.file_path || undefined,
    };
  } catch (err) {
    console.error('Tauri save JSON error:', err);
    return { success: false };
  }
}

export async function tauriOpenJson(): Promise<{ fileName: string; filePath: string; content: string } | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.openJsonDialog();
    if (res && res.data) {
      const content = new TextDecoder('utf-8').decode(new Uint8Array(res.data));
      return {
        fileName: res.file_name,
        filePath: res.file_path,
        content,
      };
    }
  } catch (err) {
    console.warn('Tauri open JSON dialog error:', err);
  }
  return null;
}

export async function tauriSelectDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const res = await commands.selectDirectoryDialog();
    return res;
  } catch (err) {
    console.error('Tauri select directory error:', err);
    return null;
  }
}

export async function tauriScanDirectoryPdfs(directoryPath: string): Promise<ScannedPdfResult[]> {
  if (!isTauri()) return [];
  try {
    const res = await commands.scanDirectoryPdfs(directoryPath);
    return res.map((item) => ({
      ...item,
      file_size: item.file_size ?? 0,
      modified_timestamp: item.modified_timestamp ?? 0,
    }));
  } catch (err) {
    console.error('Tauri scan directory error:', err);
    return [];
  }
}
export async function tauriGetDefaultDirectories(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const res = await commands.getDefaultDirectories();
    return res || [];
  } catch (err) {
    console.error('Tauri get default directories error:', err);
    return [];
  }
}
