import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Writable } from 'stream';
import { DocumentStorageService } from './document-storage.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
    },
  },
}));

const configMock = cloudinary.config as jest.Mock;
const uploadStreamMock = cloudinary.uploader
  .upload_stream as unknown as jest.Mock;

function buildConfigService(): ConfigService {
  const values: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
  };
  return {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('DocumentStorageService', () => {
  beforeEach(() => {
    configMock.mockClear();
    uploadStreamMock.mockReset();
  });

  it('does not read Cloudinary credentials until the first upload (rest of the app boots fine without them configured yet)', () => {
    const configService = {
      getOrThrow: jest.fn(() => {
        throw new Error('CLOUDINARY_CLOUD_NAME is not configured');
      }),
    } as unknown as ConfigService;

    expect(() => new DocumentStorageService(configService)).not.toThrow();
    expect(configMock).not.toHaveBeenCalled();
  });

  it('configures the Cloudinary SDK from ConfigService on the first upload', async () => {
    uploadStreamMock.mockImplementation(
      (
        _options: unknown,
        callback: (error: unknown, result: unknown) => void,
      ) => {
        return new Writable({
          write(_chunk, _enc, cb) {
            cb();
          },
          final(cb) {
            callback(null, {
              secure_url: 'https://res.cloudinary.com/demo/raw/upload/v1/x.pdf',
              bytes: 1,
            });
            cb();
          },
        });
      },
    );

    const service = new DocumentStorageService(buildConfigService());
    await service.uploadDocument(Buffer.from('hola'), 'contrato.pdf');

    expect(configMock).toHaveBeenCalledWith({
      cloud_name: 'demo',
      api_key: 'key',
      api_secret: 'secret',
    });
  });

  it('uploads with resource_type raw into the documents folder and maps the response', async () => {
    let capturedOptions: unknown;
    uploadStreamMock.mockImplementation(
      (
        options: unknown,
        callback: (error: unknown, result: unknown) => void,
      ) => {
        capturedOptions = options;
        return new Writable({
          write(_chunk, _enc, cb) {
            cb();
          },
          final(cb) {
            callback(null, {
              secure_url:
                'https://res.cloudinary.com/demo/raw/upload/v1/vivia-chat/documents/contrato.pdf',
              bytes: 42,
            });
            cb();
          },
        });
      },
    );

    const service = new DocumentStorageService(buildConfigService());
    const result = await service.uploadDocument(
      Buffer.from('hola'),
      'contrato.pdf',
    );

    expect(capturedOptions).toMatchObject({
      resource_type: 'raw',
      folder: 'vivia-chat/documents',
    });
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/vivia-chat/documents/contrato.pdf',
      bytes: 42,
    });
  });

  it('rejects when Cloudinary returns an error', async () => {
    uploadStreamMock.mockImplementation(
      (
        _options: unknown,
        callback: (error: unknown, result: unknown) => void,
      ) => {
        return new Writable({
          write(_chunk, _enc, cb) {
            cb();
          },
          final(cb) {
            callback(new Error('upload failed'), null);
            cb();
          },
        });
      },
    );

    const service = new DocumentStorageService(buildConfigService());

    await expect(
      service.uploadDocument(Buffer.from('hola'), 'contrato.pdf'),
    ).rejects.toThrow('upload failed');
  });
});
