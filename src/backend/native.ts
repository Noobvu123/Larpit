/** App entry point. Do not import Node or memory adapters into the app. */
import { openBackend } from './service.ts';
import { createOllamaIntelligence } from './intelligence.ts';
import type { OllamaOptions } from './intelligence.ts';
import type { Backend } from './service.ts';
import { TENNIS_REFERENCES } from './references.ts';
import { createExpoMediaStore, openExpoStorage, readExpoPhotoBase64 } from './adapters/expo.ts';

export function createNativeBackend(options: { localAI?: Omit<OllamaOptions,'readPhotoBase64'> } = {}): () => Promise<Backend> {
  let pending: Promise<Backend> | undefined;
  return () => {
    if(!pending) {
      pending=(async()=>{
        const storage=await openExpoStorage();
        const app=await openBackend({storage,media:createExpoMediaStore(),references:TENNIS_REFERENCES,
          ...(options.localAI?{intelligence:createOllamaIntelligence({...options.localAI,readPhotoBase64:readExpoPhotoBase64})}:{})});
        // Photo cleanup is best effort. A failure keeps the queue for a later explicit retry.
        await app.collectGarbage().catch(()=>{});
        return app;
      })().catch(error=>{pending=undefined;throw error;});
    }
    return pending;
  };
}
/** Default app setup: durable local data and explicit template captions. No model calls. */
export const getBackend = createNativeBackend();
