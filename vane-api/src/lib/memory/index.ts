import db from '@/lib/db';
import { userMemory } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import ModelRegistry from '@/lib/models/registry';
import configManager from '@/lib/config';
import {
  appendTokenUsage,
  normalizeOpenAIUsage,
} from '@/lib/observability/tokenUsage';

const DEFAULT_MEMORY_ID = 'default';

async function resolveDefaultChatModel(): Promise<{
  providerId: string;
  key: string;
}> {
  const registry = new ModelRegistry();
  const providers = await registry.getActiveProviders();
  const uiState = configManager.getCurrentConfig().uiState ?? {};

  if (uiState.chatModelProviderId && uiState.chatModelKey) {
    const provider = providers.find((p) => p.id === uiState.chatModelProviderId);
    if (provider?.chatModels.some((m) => m.key === uiState.chatModelKey)) {
      return {
        providerId: uiState.chatModelProviderId,
        key: uiState.chatModelKey,
      };
    }
  }

  const first = providers.find((p) => p.chatModels.length > 0);
  if (!first) {
    throw new Error('No chat model configured');
  }
  return { providerId: first.id, key: first.chatModels[0]!.key };
}

export async function loadUserMemory(): Promise<string> {
  const row = await db.query.userMemory.findFirst({
    where: eq(userMemory.id, DEFAULT_MEMORY_ID),
  });
  return row?.body ?? '';
}

export async function getUserMemoryMeta(): Promise<{
  body: string;
  updatedAt: string | null;
  updatedBy: string;
}> {
  const row = await db.query.userMemory.findFirst({
    where: eq(userMemory.id, DEFAULT_MEMORY_ID),
  });
  return {
    body: row?.body ?? '',
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? 'system',
  };
}

export async function saveUserMemory(
  body: string,
  updatedBy: 'user' | 'advisor' | 'system',
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.query.userMemory.findFirst({
    where: eq(userMemory.id, DEFAULT_MEMORY_ID),
  });

  if (existing) {
    await db
      .update(userMemory)
      .set({ body, updatedAt: now, updatedBy })
      .where(eq(userMemory.id, DEFAULT_MEMORY_ID))
      .execute();
    return;
  }

  await db.insert(userMemory).values({
    id: DEFAULT_MEMORY_ID,
    body,
    updatedAt: now,
    updatedBy,
  });
}

export async function updateMemoryFromAdvisor(input: {
  currentMemory: string;
  advisorReport: string;
  corpusSnippet?: string;
  observability?: { chatId: string; messageId: string };
}): Promise<string> {
  const model = await resolveDefaultChatModel();
  const registry = new ModelRegistry();
  const llm = await registry.loadChatModel(model.providerId, model.key);

  const corpusBlock = input.corpusSnippet?.trim()
    ? `\n<extra_context>\n${input.corpusSnippet.trim()}\n</extra_context>\n`
    : '';

  const userContent = `<current_impression>
${input.currentMemory.trim() || '（尚无记录）'}
</current_impression>
${corpusBlock}
<new_insights>
${input.advisorReport.trim()}
</new_insights>

请更新师爷的 **内部工作笔记**（融合新洞察后的完整版）。要求：
- 输出 **仅** 更新后的笔记正文，不要解释、不要 JSON、不要标题包裹。
- **受众是师爷自己，不是主人**——不要写成给主人看的劝勉信或第二人称长文。
- 笔记应回答：师爷心目中主人是谁、有何格局与盲区、**师爷应如何调整策略才能更好帮主人**（切入点、语气、该催什么/该放什么、跨界可嫁接的资源）。
- 保留仍然准确的老判断；修正或淡化已被新信息推翻的部分。
- 用简练、可执行的内部备忘体（可分点），**600–1200 字** 为宜。
- 若新洞察与现有笔记无实质增量，可原样输出 current_impression（允许微调措辞）。`;

  llm.setGenerateContext?.({ reasoningPreset: 'off' });

  const result = await llm.generateText({
    messages: [
      {
        role: 'system',
        content:
          '你是师爷的秘书记官，维护一份 **仅师爷可读** 的「主公工作笔记」：不是用户画像营销稿，而是指导师爷如何更有效辅佐主人的内部备忘（格局、习惯、盲区、潜力、服务策略）。只输出更新后的笔记正文。',
      },
      { role: 'user', content: userContent },
    ],
    options: { reasoningPreset: 'off' },
  });

  if (input.observability && result.additionalInfo?.usage) {
    appendTokenUsage({
      chatId: input.observability.chatId,
      messageId: input.observability.messageId,
      providerId: model.providerId,
      modelKey: model.key,
      phase: 'memory_update',
      reasoningPreset: 'off',
      ...normalizeOpenAIUsage(result.additionalInfo.usage),
    });
  }

  return result.content.trim();
}
