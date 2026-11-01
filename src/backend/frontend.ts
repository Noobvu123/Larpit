import { BackendError } from './contracts.ts';
import type { DraftPatch, Platform, PhotoInput } from './contracts.ts';

/** Adapter for the delivered Front End v1 state. New screens can use DraftPatch directly. */
export function fromFrontendDraft(value: {
  sport: 'Tennis' | null; platforms: string[]; content: 'photos' | 'written' | 'both';
  style: string; pose: string; photoCount?: number; topic?: string;
}): DraftPatch {
  if(value.sport!==null && value.sport!=='Tennis')throw new BackendError('INVALID_INPUT','Only tennis is available.');
  const names:Record<string,Platform>={Instagram:'instagram',LinkedIn:'linkedin'};
  if(value.platforms.some(p=>!Object.hasOwn(names,p)))throw new BackendError('INVALID_INPUT','Only Instagram and LinkedIn are implemented.');
  return {content:value.content,toneBrief:value.style,poseBrief:value.pose,platforms:value.platforms.map(p=>names[p]),
    ...(value.photoCount!==undefined?{photoCount:value.photoCount}:{}),...(value.topic!==undefined?{topic:value.topic}:{})};
}

/** Pass real dimensions from Camera/ImagePicker. Resolve bundled demo assets first. */
export function fromFrontendPhoto(value:{source:unknown;isDemo:boolean;origin:'camera'|'library'|'demo'},
  metadata:{width:number;height:number;mimeType:PhotoInput['mimeType'];resolvedLocalUri?:string}):PhotoInput {
  const source=value.source as {uri?:string}|null;
  const uri=metadata.resolvedLocalUri??(typeof source==='object'?source?.uri:undefined);
  if(!uri)throw new BackendError('INVALID_INPUT','Resolve the image to a local file URI and preserve its dimensions first.');
  if(value.isDemo!==(value.origin==='demo'))throw new BackendError('INVALID_INPUT','Demo image provenance does not match its origin.');
  return {uri,width:metadata.width,height:metadata.height,mimeType:metadata.mimeType,origin:value.origin};
}
