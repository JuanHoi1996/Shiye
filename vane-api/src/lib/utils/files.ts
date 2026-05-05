import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || process.cwd();

export const getFileDetails = (fileId: string) => {
  const fileLoc = path.join(
    DATA_DIR,
    'data',
    'uploads',
    fileId + '-extracted.json',
  );

  const parsedFile = JSON.parse(fs.readFileSync(fileLoc, 'utf8'));

  return {
    name: parsedFile.title,
    fileId: fileId,
  };
};
