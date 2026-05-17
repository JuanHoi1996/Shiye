import path from "path";
import BaseEmbedding from "../models/base/embedding"
import crypto from "crypto"
import fs from 'fs';
import { splitText } from "../utils/splitText";
import { decodeBufferToString } from "../utils/decodeText";
import { bufferToJsonSearchableText } from "../utils/jsonUploadText";
import { embedTextsBatched } from "./embedBatches";
import {
    maxEmbeddingChunksPerFile,
    maxTextLikeUploadBytes,
} from "./uploadLimits";
import { UploadRejectedError } from "./uploadErrors";
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';
import officeParser from 'officeparser'

const supportedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

type SupportedMimeType = typeof supportedMimeTypes[number];

type UploadManagerParams = {
    embeddingModel: BaseEmbedding<any>;
}

const DATA_DIR = process.env.DATA_DIR || process.cwd();

type RecordedFile = {
    id: string;
    name: string;
    filePath: string;
    contentPath: string;
    uploadedAt: string;
}

type FileRes = {
    fileName: string;
    fileExtension: string;
    fileId: string;
    truncated?: boolean;
}

const TEXT_LIKE_MIMES = new Set<string>([
    'application/json',
    'text/plain',
    'text/markdown',
    'text/csv',
]);

class UploadManager {
    private embeddingModel: BaseEmbedding<any>;
    static uploadsDir = path.join(DATA_DIR, 'data', 'uploads');
    static uploadedFilesRecordPath = path.join(this.uploadsDir, 'uploaded_files.json');

    constructor(private params: UploadManagerParams) {
        this.embeddingModel = params.embeddingModel;

        if (!fs.existsSync(UploadManager.uploadsDir)) {
            fs.mkdirSync(UploadManager.uploadsDir, { recursive: true });
        }

        if (!fs.existsSync(UploadManager.uploadedFilesRecordPath)) {
            const data = {
                files: []
            }

            fs.writeFileSync(UploadManager.uploadedFilesRecordPath, JSON.stringify(data, null, 2));
        }
    }

    private static getRecordedFiles(): RecordedFile[] {
        const data = fs.readFileSync(UploadManager.uploadedFilesRecordPath, 'utf-8');
        return JSON.parse(data).files;
    }

    private static addNewRecordedFile(fileRecord: RecordedFile) {
        const currentData = this.getRecordedFiles()

        currentData.push(fileRecord);

        fs.writeFileSync(UploadManager.uploadedFilesRecordPath, JSON.stringify({ files: currentData }, null, 2));
    }

    static getFile(fileId: string): RecordedFile | null {
        const recordedFiles = this.getRecordedFiles();

        return recordedFiles.find(f => f.id === fileId) || null;
    }

    static getFileChunks(fileId: string): { content: string; embedding: number[] }[] {
        try {
            const recordedFile = this.getFile(fileId);

            if (!recordedFile) {
                throw new Error(`File with ID ${fileId} not found`);
            }

            const contentData = JSON.parse(fs.readFileSync(recordedFile.contentPath, 'utf-8'))

            return contentData.chunks;
        } catch (err) {
            console.log('Error getting file chunks:', err);
            return [];
        }
    }

    private async extractContentAndEmbed(
        filePath: string,
        fileType: SupportedMimeType,
    ): Promise<{ contentPath: string; truncated: boolean }> {
        switch (fileType) {
            case 'application/json':
            case 'text/plain':
            case 'text/markdown':
            case 'text/csv':
                const textBuf = fs.readFileSync(filePath);
                const content =
                    fileType === 'application/json'
                        ? bufferToJsonSearchableText(textBuf)
                        : decodeBufferToString(textBuf);

                let splittedText = splitText(content, 512, 128);
                const maxChunks = maxEmbeddingChunksPerFile();
                let truncated = false;
                if (splittedText.length > maxChunks) {
                    splittedText = splittedText.slice(0, maxChunks);
                    truncated = true;
                }

                const embeddings = await embedTextsBatched(this.embeddingModel, splittedText);

                const contentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const data = {
                    chunks: splittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: embeddings[i],
                        }
                    })
                }

                fs.writeFileSync(contentPath, JSON.stringify(data));

                return { contentPath, truncated };
            case 'application/pdf':
                const pdfBuffer = fs.readFileSync(filePath);

                const parser = new PDFParse({
                    data: pdfBuffer,
                    CanvasFactory
                })

                const pdfText = await parser.getText().then(res => res.text)

                let pdfSplittedText = splitText(pdfText, 512, 128);
                const pdfMaxChunks = maxEmbeddingChunksPerFile();
                let pdfTruncated = false;
                if (pdfSplittedText.length > pdfMaxChunks) {
                    pdfSplittedText = pdfSplittedText.slice(0, pdfMaxChunks);
                    pdfTruncated = true;
                }
                const pdfEmbeddings = await embedTextsBatched(this.embeddingModel, pdfSplittedText)

                const pdfContentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const pdfData = {
                    chunks: pdfSplittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: pdfEmbeddings[i],
                        }
                    })
                }

                fs.writeFileSync(pdfContentPath, JSON.stringify(pdfData));

                return { contentPath: pdfContentPath, truncated: pdfTruncated };
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                const docBuffer = fs.readFileSync(filePath);

                const docText = await officeParser.parseOfficeAsync(docBuffer)

                let docSplittedText = splitText(docText, 512, 128);
                const docMaxChunks = maxEmbeddingChunksPerFile();
                let docTruncated = false;
                if (docSplittedText.length > docMaxChunks) {
                    docSplittedText = docSplittedText.slice(0, docMaxChunks);
                    docTruncated = true;
                }
                const docEmbeddings = await embedTextsBatched(this.embeddingModel, docSplittedText)

                const docContentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';

                const docData = {
                    chunks: docSplittedText.map((text, i) => {
                        return {
                            content: text,
                            embedding: docEmbeddings[i],
                        }
                    })
                }

                fs.writeFileSync(docContentPath, JSON.stringify(docData));

                return { contentPath: docContentPath, truncated: docTruncated };
            case 'image/jpeg':
            case 'image/png':
            case 'image/webp':
                // For images, we don't embed for now, just create a dummy content file
                const imageContentPath = filePath.split('.').slice(0, -1).join('.') + '.content.json';
                const imageData = { chunks: [] };
                fs.writeFileSync(imageContentPath, JSON.stringify(imageData));
                return { contentPath: imageContentPath, truncated: false };
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    async processFiles(files: File[]): Promise<FileRes[]> {
        const processedFiles: FileRes[] = [];

        await Promise.all(files.map(async (file) => {
            let mimeType = file.type;
            if (!mimeType || mimeType === 'application/octet-stream') {
                const ext = file.name.split('.').pop()?.toLowerCase();
                if (ext === 'md' || ext === 'markdown') {
                    mimeType = 'text/markdown';
                } else if (ext === 'csv') {
                    mimeType = 'text/csv';
                } else if (ext === 'xlsx') {
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                }
            }
            if (!(supportedMimeTypes as unknown as string[]).includes(mimeType)) {
                throw new Error(`File type ${mimeType || file.type || '(empty)'} not supported`);
            }

            const fileId = crypto.randomBytes(16).toString('hex');

            const fileExtension = file.name.split('.').pop();
            const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
            const filePath = path.join(UploadManager.uploadsDir, fileName);

            const buffer = Buffer.from(await file.arrayBuffer())

            if (TEXT_LIKE_MIMES.has(mimeType)) {
                const maxB = maxTextLikeUploadBytes();
                if (buffer.length > maxB) {
                    throw new UploadRejectedError(
                        `This upload is too large for text/JSON processing (${buffer.length} bytes; limit ${maxB} bytes). Use a smaller file or set VANE_MAX_TEXT_UPLOAD_BYTES.`,
                        413,
                    );
                }
            }

            fs.writeFileSync(filePath, buffer);

            const { contentPath, truncated } = await this.extractContentAndEmbed(
                filePath,
                mimeType as SupportedMimeType,
            );

            const fileRecord: RecordedFile = {
                id: fileId,
                name: file.name,
                filePath: filePath,
                contentPath: contentPath,
                uploadedAt: new Date().toISOString(),
            }

            UploadManager.addNewRecordedFile(fileRecord);

            processedFiles.push({
                fileExtension: fileExtension || '',
                fileId,
                fileName: file.name,
                ...(truncated ? { truncated: true } : {}),
            });
        }))

        return processedFiles;
    }
}

export default UploadManager;