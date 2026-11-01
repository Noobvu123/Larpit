/** Portable application services. No network, credentials, native modules, or paid providers. */
export type Platform = 'instagram' | 'linkedin';
export type Style = 'casual' | 'confident' | 'professional';
export type Reference = {
  id: string;
  sourceUrl: string;
  photographer: string;
  tags: string[];
  /** Frontend resolves this identifier to a bundled require(...) image. */
  assetKey: string;
  review: 'verified';
};
export type Photo = {
  uri: string;
  width: number;
  height: number;
  source: 'camera' | 'library' | 'simulator';
};
export type SessionInput = {
  sport: 'tennis';
  platforms: Platform[];
  idea: string;
  style: Style;
};
export type Session = SessionInput & { id: string; photos: Photo[] };
export type Match = { reference: Reference; matchedTags: string[] };
export type Caption = { platform: Platform; text: string; method: 'template' };
export class LarpError extends Error {
  code: 'INVALID_INPUT' | 'NOT_FOUND' | 'LIMIT_REACHED';
  constructor(code: LarpError['code'], message: string) {
    super(message);
    this.name = 'LarpError';
    this.code = code;
  }
}

function invalid(message: string): never { throw new LarpError('INVALID_INPUT', message); }
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    return invalid(`${name} must contain 1 to ${max} characters.`);
  }
  return value.trim();
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function tokens(value: string): string[] {
  const synonyms: Record<string, string> = {
    seated: 'sitting', sit: 'sitting', racquet: 'racket', racquets: 'racket',
    rackets: 'racket', serves: 'serve', serving: 'serve', courts: 'court',
    portraits: 'portrait', friends: 'group', partners: 'group',
  };
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(t => synonyms[t] ?? t);
}

function validateReference(value: Reference): Reference {
  if (!value || typeof value !== 'object') return invalid('Invalid reference.');
  const id = text(value.id, 'Reference ID', 100);
  const sourceUrl = text(value.sourceUrl, 'Unsplash source URL', 1000);
  // Strict host/path allowlist. No remote image download or URL fetching occurs.
  if (!/^https:\/\/unsplash\.com\/photos\/[a-zA-Z0-9_-]+$/.test(sourceUrl)) {
    return invalid('A reference must have an original Unsplash photo URL.');
  }
  if (value.review !== 'verified') return invalid('Reference visual review is required.');
  if (!Array.isArray(value.tags) || value.tags.length < 1 || value.tags.length > 30) {
    return invalid('References need 1 to 30 verified tags.');
  }
  return {
    id, sourceUrl, photographer: text(value.photographer, 'Photographer', 150),
    assetKey: text(value.assetKey, 'Bundled asset key', 200), review: 'verified',
    tags: value.tags.map(t => text(t, 'Reference tag', 80)),
  };
}

function validateInput(input: SessionInput): SessionInput {
  if (!input || typeof input !== 'object' || input.sport !== 'tennis') {
    return invalid('Only tennis is currently available.');
  }
  if (!Array.isArray(input.platforms) || input.platforms.length < 1 || input.platforms.length > 2 ||
      input.platforms.some(p => p !== 'instagram' && p !== 'linkedin') ||
      new Set(input.platforms).size !== input.platforms.length) {
    return invalid('Choose Instagram, LinkedIn, or both without duplicates.');
  }
  if (!['casual', 'confident', 'professional'].includes(input.style)) return invalid('Invalid caption style.');
  return { sport: 'tennis', platforms: [...input.platforms], idea: text(input.idea, 'Photo idea', 500), style: input.style };
}

export function createLarpService(options: { references?: Reference[]; maxSessions?: number } = {}) {
  const references = (options.references ?? []).map(validateReference);
  if (new Set(references.map(r => r.id)).size !== references.length) invalid('Reference IDs must be unique.');
  const maxSessions = options.maxSessions ?? 20;
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 100) invalid('Invalid session capacity.');
  const sessions = new Map<string, Session>();
  let sequence = 0;
  const get = (id: string): Session => {
    const session = sessions.get(id);
    if (!session) throw new LarpError('NOT_FOUND', 'Session not found. Start a new session.');
    return session;
  };

  return {
    capabilities() {
      return {
        networkRequired: false, paidProviders: false, accountRequired: false,
        referenceCount: references.length, referenceMatching: 'tag-based',
        captions: 'templates', imageAnalysis: false, imageGeneration: false,
        automaticPosting: false, persistence: 'memory-only',
      } as const;
    },
    createSession(input: SessionInput): Session {
      const valid = validateInput(input);
      if (sessions.size >= maxSessions) throw new LarpError('LIMIT_REACHED', 'Delete an earlier session before starting another.');
      const session: Session = { ...valid, id: `session-${++sequence}`, photos: [] };
      sessions.set(session.id, session);
      return clone(session);
    },
    getSession(id: string): Session { return clone(get(id)); },
    matchReferences(id: string, limit = 3): { matches: Match[]; status: 'matched' | 'no-match' | 'catalog-empty' } {
      const session = get(id);
      if (!Number.isInteger(limit) || limit < 1 || limit > 3) invalid('Request 1 to 3 references.');
      const query = new Set(tokens(session.idea));
      const matches = references.map(reference => ({
        reference,
        matchedTags: [...new Set(reference.tags.flatMap(tokens).filter(t => query.has(t)))],
      })).filter(m => m.matchedTags.length > 0)
        .sort((a, b) => b.matchedTags.length - a.matchedTags.length || a.reference.id.localeCompare(b.reference.id))
        .slice(0, limit);
      return clone({ matches, status: references.length === 0 ? 'catalog-empty' : matches.length ? 'matched' : 'no-match' });
    },
    shotPlan(id: string) {
      const session = get(id);
      const query = new Set(tokens(session.idea));
      const pose = query.has('sitting') ? 'Sit comfortably beside the court with the racket visible.'
        : query.has('serve') ? 'Use a stationary serve pose with clear space around the racket.'
        : 'Stand comfortably with the racket visible and look toward the camera.';
      return [
        { index: 1, title: 'Full frame', instruction: `${pose} Keep your whole body inside the frame.` },
        { index: 2, title: 'Closer view', instruction: 'Move closer for a waist-up photo. Keep the racket and face clear.' },
        { index: 3, title: 'Court detail', instruction: 'Frame your racket, shoes, or a court detail for a supporting shot.' },
      ];
    },
    attachPhoto(id: string, input: Photo): Session {
      const session = get(id);
      if (!input || typeof input !== 'object') return invalid('Choose a photo first.');
      const uri = text(input.uri, 'Local photo URI', 2000);
      if (!/^(file:\/\/|content:\/\/|ph:\/\/)/.test(uri)) invalid('Use a device-local photo URI.');
      if (![input.width, input.height].every(n => Number.isInteger(n) && n > 0 && n <= 30000)) {
        invalid('Photo dimensions must be positive pixel integers.');
      }
      if (!['camera', 'library', 'simulator'].includes(input.source)) invalid('Invalid photo source.');
      if (session.photos.length >= 3) throw new LarpError('LIMIT_REACHED', 'This session already has three photos. Retake or remove a photo.');
      session.photos.push({ uri, width: input.width, height: input.height, source: input.source });
      return clone(session);
    },
    removePhoto(id: string, index: number): Session {
      const session = get(id);
      if (!Number.isInteger(index) || index < 0 || index >= session.photos.length) invalid('Photo index does not exist.');
      session.photos.splice(index, 1);
      return clone(session);
    },
    assessPhoto(id: string, index: number) {
      const session = get(id);
      if (!Number.isInteger(index) || !session.photos[index]) invalid('Photo index does not exist.');
      return { status: 'not-assessed', score: null, approved: false,
        reason: 'Image analysis is not connected. Review the photo yourself before sharing.' } as const;
    },
    createCaptions(id: string): Caption[] {
      const session = get(id);
      const copy: Record<Style, Record<Platform, string>> = {
        casual: { instagram: 'A little court time. 🎾 #Tennis #CourtTime', linkedin: 'Making time for tennis and a change of pace.' },
        confident: { instagram: 'Showing up, racket in hand. 🎾 #Tennis', linkedin: 'Showing up for a tennis session, one step at a time.' },
        professional: { instagram: 'Time on court. Room to grow. 🎾 #Tennis', linkedin: 'A tennis session is an opportunity to practise focus and consistency.' },
      };
      return session.platforms.map(platform => ({ platform, text: copy[session.style][platform], method: 'template' }));
    },
    deleteSession(id: string): void { get(id); sessions.delete(id); },
    clearAll(): void { sessions.clear(); },
  };
}
