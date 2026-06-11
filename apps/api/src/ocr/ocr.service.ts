import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import pdfParse from 'pdf-parse';
import { OpenAiService } from '../ai/openai.service';
import { MetricsService } from '../metrics/metrics.service';

const SCANNED_PDF_TEXT_THRESHOLD = 50;

const VISION_FALLBACK_PROMPT =
  'Transcribe ALL text in this image exactly as it appears, preserving line breaks. ' +
  'Include every ingredient quantity, unit and instruction. ' +
  'Output only the transcribed text with no commentary.';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly vision: ImageAnnotatorClient | null;

  constructor(
    private readonly openAi: OpenAiService,
    private readonly metrics: MetricsService,
  ) {
    // The Google client reads GOOGLE_APPLICATION_CREDENTIALS itself; only
    // instantiate when the credentials file is configured.
    this.vision = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? new ImageAnnotatorClient()
      : null;
  }

  async extractTextFromImage(buffer: Buffer, mime: string): Promise<string> {
    if (this.vision) {
      this.metrics.increment('ocr_requests_total', { engine: 'google_vision' });
      // documentTextDetection handles dense text (recipe pages) better than
      // plain textDetection.
      const [result] = await this.vision.documentTextDetection({
        image: { content: buffer },
      });
      const text =
        result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? '';
      if (!text.trim()) {
        throw new UnprocessableEntityException('No text could be detected in the image');
      }
      return text;
    }

    if (this.openAi.isConfigured()) {
      this.metrics.increment('ocr_requests_total', { engine: 'openai_vision' });
      const text = await this.openAi.visionText({
        imageBase64: buffer.toString('base64'),
        mime,
        prompt: VISION_FALLBACK_PROMPT,
        maxTokens: 3000,
      });
      if (!text.trim()) {
        throw new UnprocessableEntityException('No text could be detected in the image');
      }
      return text;
    }

    throw new ServiceUnavailableException(
      'OCR is not configured — set GOOGLE_APPLICATION_CREDENTIALS for Google Cloud Vision ' +
        'or OPENAI_API_KEY for the OpenAI vision fallback',
    );
  }

  async extractTextFromPdf(buffer: Buffer): Promise<string> {
    this.metrics.increment('ocr_requests_total', { engine: 'pdf_parse' });
    let text: string;
    try {
      const parsed = await pdfParse(buffer);
      text = (parsed.text ?? '').trim();
    } catch (err) {
      this.logger.warn(
        `pdf-parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnprocessableEntityException('The uploaded PDF could not be read');
    }
    if (text.length < SCANNED_PDF_TEXT_THRESHOLD) {
      throw new UnprocessableEntityException(
        'Scanned PDFs are not supported yet — upload page photos instead',
      );
    }
    return text;
  }
}
