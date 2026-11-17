import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareTextFile(name: string, content: string, mimeType: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('The share sheet is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}
