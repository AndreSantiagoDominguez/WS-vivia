import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

const DOCUMENTS_FOLDER = 'vivia-chat/documents';

export interface UploadedDocument {
  url: string;
  bytes: number;
}

/**
 * Sube documentos a Cloudinary. `resource_type: 'raw'` es el modo de
 * Cloudinary para archivos que no son imagen/video (PDF, Word, Excel, texto
 * plano) — sin transformaciones, solo almacenamiento + CDN.
 *
 * La configuración de credenciales es perezosa (recién en el primer upload,
 * no en el constructor): así el resto del backend arranca y funciona normal
 * aunque todavía no existan `CLOUDINARY_*` en el entorno — solo falla, con un
 * error claro, si alguien efectivamente intenta subir un documento.
 */
@Injectable()
export class DocumentStorageService {
  private configured = false;

  constructor(private readonly configService: ConfigService) {}

  private ensureConfigured(): void {
    if (this.configured) return;
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
    });
    this.configured = true;
  }

  uploadDocument(
    buffer: Buffer,
    originalName: string,
  ): Promise<UploadedDocument> {
    this.ensureConfigured();
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: DOCUMENTS_FOLDER,
          filename_override: originalName,
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(
              error instanceof Error
                ? error
                : new Error('Cloudinary upload failed'),
            );
            return;
          }
          resolve({ url: result.secure_url, bytes: result.bytes });
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }
}
