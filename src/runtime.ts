export type AuthProvider = (context: { url: URL; method: string }) => Promise<Record<string,string>> | Record<string,string>;
export type RuntimeEvent =
  | { type: 'request'; method: string; url: string; attempt: number }
  | { type: 'retry'; method: string; url: string; attempt: number; delayMs: number; status?: number }
  | { type: 'response'; method: string; url: string; attempt: number; status: number; durationMs: number };
export interface RetryPolicy { attempts: number; baseDelayMs: number; maxDelayMs: number; statuses: number[] }
export interface ClientOptions { baseUrl:string; auth?:AuthProvider; fetch?:typeof globalThis.fetch; retry?:Partial<RetryPolicy>; timeoutMs?:number; onEvent?:(event:RuntimeEvent)=>void; sleep?:(ms:number)=>Promise<void> }
export interface RequestOptions { method?:string; path:string; query?:Record<string,string|number|boolean|undefined>; headers?:Record<string,string>; body?:unknown; idempotencyKey?:string; signal?:AbortSignal }
const defaultRetry:RetryPolicy={attempts:3,baseDelayMs:250,maxDelayMs:5_000,statuses:[408,425,429,500,502,503,504]};
const naturallyIdempotent=new Set(['GET','HEAD','OPTIONS','PUT','DELETE']);
export const redactHeaders=(headers:Record<string,string>):Record<string,string>=>Object.fromEntries(Object.entries(headers).map(([key,value])=>[key,/authorization|api[-_]?key|token|secret|cookie/i.test(key)?'[REDACTED]':value]));
export function isRetrySafe(method:string,idempotencyKey?:string):boolean{return naturallyIdempotent.has(method.toUpperCase())||Boolean(idempotencyKey);}
export function retryAfterMs(value:string|null,now=Date.now()):number|undefined{if(!value)return;const seconds=Number(value);if(Number.isFinite(seconds))return Math.max(0,seconds*1_000);const date=Date.parse(value);return Number.isNaN(date)?undefined:Math.max(0,date-now);}
export class IntegrationError extends Error { constructor(message:string,readonly status?:number,readonly requestId?:string,readonly responseBody?:unknown){super(message);this.name='IntegrationError';} }
export class IntegrationClient {
  private readonly fetcher:typeof globalThis.fetch; private readonly retry:RetryPolicy; private readonly sleep:(ms:number)=>Promise<void>;
  constructor(private readonly options:ClientOptions){this.fetcher=options.fetch??globalThis.fetch;this.retry={...defaultRetry,...options.retry};this.sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));}
  async request<T>(request:RequestOptions):Promise<T>{
    const method=(request.method??'GET').toUpperCase();const url=new URL(request.path,this.options.baseUrl.endsWith('/')?this.options.baseUrl:`${this.options.baseUrl}/`);
    for(const [key,value] of Object.entries(request.query??{}))if(value!==undefined)url.searchParams.set(key,String(value));
    const auth=await this.options.auth?.({url,method})??{};const headers:Record<string,string>={accept:'application/json',...auth,...request.headers};if(request.idempotencyKey)headers['idempotency-key']=request.idempotencyKey;
    let body:BodyInit|undefined;if(request.body!==undefined){headers['content-type']??='application/json';body=headers['content-type'].includes('json')?JSON.stringify(request.body):String(request.body);}
    const maxAttempts=isRetrySafe(method,request.idempotencyKey)?this.retry.attempts:1;let lastError:unknown;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(new Error('Request timed out')),this.options.timeoutMs??15_000);const onAbort=()=>controller.abort(request.signal?.reason);request.signal?.addEventListener('abort',onAbort,{once:true});const started=Date.now();this.options.onEvent?.({type:'request',method,url:url.toString(),attempt});
      try{const response=await this.fetcher(url,{method,headers,body,signal:controller.signal});this.options.onEvent?.({type:'response',method,url:url.toString(),attempt,status:response.status,durationMs:Date.now()-started});if(response.ok)return response.status===204?undefined as T:await response.json() as T;const payload=await parseBody(response);if(attempt<maxAttempts&&this.retry.statuses.includes(response.status)){const delay=Math.min(this.retry.maxDelayMs,retryAfterMs(response.headers.get('retry-after'))??this.retry.baseDelayMs*2**(attempt-1));this.options.onEvent?.({type:'retry',method,url:url.toString(),attempt,delayMs:delay,status:response.status});await this.sleep(delay);continue;}throw new IntegrationError(`Integration request failed with HTTP ${response.status}`,response.status,response.headers.get('x-request-id')??undefined,payload);}
      catch(error){lastError=error;if(error instanceof IntegrationError||attempt>=maxAttempts||controller.signal.aborted)throw error;const delay=Math.min(this.retry.maxDelayMs,this.retry.baseDelayMs*2**(attempt-1));this.options.onEvent?.({type:'retry',method,url:url.toString(),attempt,delayMs:delay});await this.sleep(delay);}
      finally{clearTimeout(timeout);request.signal?.removeEventListener('abort',onAbort);}
    }throw lastError;
  }
}
async function parseBody(response:Response):Promise<unknown>{const text=await response.text();if(!text)return;try{return JSON.parse(text);}catch{return text.slice(0,2_000);}}
export async function* paginate<T>(load:(cursor?:string)=>Promise<{items:T[];nextCursor?:string}>):AsyncGenerator<T>{let cursor:string|undefined;const seen=new Set<string>();do{const page=await load(cursor);for(const item of page.items)yield item;cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error('Pagination cursor loop detected');if(cursor)seen.add(cursor);}while(cursor);}
