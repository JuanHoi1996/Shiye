import z from 'zod';
import {
  GenerateObjectInput,
  GenerateOptions,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
} from '../types';

abstract class BaseLLM<CONFIG> {
  constructor(protected config: CONFIG) {}

  /** Session-scoped defaults merged into generate/stream calls (OpenAI-compatible LLMs). */
  setGenerateContext(
    _ctx: Pick<GenerateOptions, 'reasoning' | 'reasoningPreset'>,
  ): void {}

  supportsVision(): boolean {
    return false;
  }

  abstract generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  abstract streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput>;
  abstract generateObject<T>(input: GenerateObjectInput): Promise<z.infer<T>>;
  abstract streamObject<T>(
    input: GenerateObjectInput,
  ): AsyncGenerator<Partial<z.infer<T>>>;
}

export default BaseLLM;
