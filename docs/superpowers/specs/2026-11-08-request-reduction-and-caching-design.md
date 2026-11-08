# İstek Azaltma ve Prompt Caching — Tasarım

Tarih: 2026-11-08
Kaynak: `optimization.md`

## Amaç

Claude Code CLI ve Claude Desktop'ın OpenRouter'a gönderdiği **yan istekleri** azaltmak, prompt caching'i çalışır hale getirmek ve proxy'nin Claude Code'un kendi sıkıştırmasını engellemesini durdurmak.

Konuşma trafiği (her turda bir `/v1/messages`) azaltılamaz — model üretimi için zorunlu. Azaltılan şey **yan sorgular**:

- `/api/models` — yalnızca 60 sn cache, frontend her tuşta çağırıyor
- `/api/models/endpoints` — 5 dk TTL var ama in-flight dedup yok
- `/api/status` — önbelleksiz 5 sn'lik upstream probe
- `/v1/messages` içinde `context_management` siliniyor → Claude Code'un kendi context compaction'ı devre dışı

## Kapsam dışı

- Yanıt cache'i, semantik cache, POST retry — `optimization.md` §8 açıkça yasaklıyor.
- Mimari yeniden tasarım, yeni bağımlılık, yeni abstraction katmanı.
- `/v1/models` cevap formatı, `DESKTOP_SLOTS`, `model-resolver.ts` davranışı, Anthropic tool-calling formatı değişmiyor.

## Sıralama

1 → 2 → 3 → 5 → 4 → 6. Gerekçe: önce ölçülebilir istek azaltması ve fidelity (2), sonra üstüne caching (3), en son doğrulanmamış varsayımlara dayanan sticky routing (4).

---

## 1. Yan isteklerin azaltılması

**Dosyalar:** `apps/server/src/proxy/openrouter-client.ts`, `apps/server/src/routes/api.route.ts`

### `fetchModels()`

- 10 dk TTL memory cache.
- In-flight dedup: aynı anda gelen çağrılar tek upstream promise'i paylaşır.
- `response.ok` kontrolü; başarısız HTTP ve parse hatası **cache'e yazılmaz**.
- AbortSignal: bir çağrının iptali diğer bekleyenleri iptal etmez. Çağıranın kendi sinyali yoksa paylaşılan promise'e bağlanmaz; paylaşılan promise kendi iç `AbortController`'ını kullanır (yalnızca timeout).
- Cache'den dönen dizi kopyalanır.

### `fetchEndpoints()`

- Mevcut 5 dk TTL korunur.
- In-flight dedup eklenir (aynı model+anahtar için tek upstream isteği).
- Cache anahtarı `model + apiKey fingerprint`; fingerprint `node:crypto` `createHash('sha256')` ile alınır, anahtar düz metin olarak anahtarda/logda tutulmaz.
- Cache boyutu sınırlanır (256 kayıt, LRU-ish: en eski `at` atılır). Süresi dolan kayıtlar yazma sırasında temizlenir.
- Cache'den dönen dizi kopyalanır (`[...endpoints]`).
- Hatalı yanıt cache'e yazılmaz.

### `api.route.ts`

- `/api/models` içindeki ayrı 60 sn `modelsCache` ve `allModels()` **silinir**. Tek cache katmanı `fetchModels()` içindedir. Katmanlı cache yok.
- `/api/status` upstream probe'u 60 sn cache'lenir (`lastCheck` alanı korunur, tazelenirse güncellenir).

---

## 2. Fidelity — `stripFields` yapılandırması

**Dosyalar:** `apps/server/src/proxy/request-validator.ts`, `packages/shared/src/types.ts`, `apps/server/src/routes/messages.route.ts`

`STRIP_KEYS` sabit `Set`'i kaldırılır. Yerine config'ten gelen liste:

```ts
stripFields?: string[]  // AppConfig, varsayılan []
```

`stripAnthropicFields(body, stripFields)` yalnızca listedeki anahtarları atar. Varsayılan boş liste = tam pass-through.

Sonuç: `cache_control`, `thinking`, `context_management`, `output_config`, `metadata` varsayılan olarak upstream'e gider. `context_management` Claude Code'un kendi compaction'ını taşır; silinmesi kullanıcının istediği sıkıştırmayı engelliyordu.

`MessageRequestSchema` `.passthrough()` olarak kalır — `session_id` ve `cache_control` zaten geçiyor. `messages.route.ts`'teki `tools` yeniden ekleme bloğu kaldırılır: `passthrough` sayesinde `tools` zaten `stripAnthropicFields`'ın çıktısında (varsayılan liste boş ve `tools` hiçbir zaman listede değil).

Ayar frontend'de Proxy sekmesinde metin alanı olarak sunulmaz; config dosyası üzerinden yönetilir. Bu bilinçli: `optimization.md` frontend'i yalnızca prompt caching için istiyor.

---

## 3. Prompt caching

**Dosyalar:** `apps/server/src/routes/messages.route.ts`, `packages/shared/src/types.ts` (tip+zod hazır), `apps/web/src/components/ProxySettings.tsx`, `apps/web/src/App.tsx`

`enablePromptCaching?: boolean`, varsayılan `false` (tip ve Zod şeması zaten mevcut, tüketici yok).

Ayar açıkken ve **hepsi** sağlanıyorsa upstream body'ye `cache_control: { type: 'ephemeral' }` eklenir:

1. Çözümlenmiş model bir Anthropic Claude modeli (`anthropic/` ile başlıyor veya ID'de `claude` geçiyor).
2. Body'de zaten açık `cache_control` breakpoint yok (top-level veya `messages[].content[]` / `system[]` içinde).

Kullanıcının gönderdiği breakpoint'ler hiçbir koşulda ezilmez veya üzerine yazılmaz. Non-Claude modelde alan eklenmez.

Ayar değişikliği anında etkili olur — her istek `loadConfig()` çağırıyor.

Frontend: `ProxySettings.tsx`'e bir checkbox; local `Config` tipi `enablePromptCaching` içerecek şekilde genişletilir, `App.tsx`'teki `Config` tipi de.

---

## 4. Sticky routing — **en son**

**Dosya:** `apps/server/src/routes/messages.route.ts`

Öncelik:

1. Body `session_id` (dokunulmaz, olduğu gibi geçer).
2. `x-claude-code-session-id` header.
3. `x-session-id` header.

Kurallar:

- Değer string, boş değil, ≤256 karakter olmalı. Aksi halde `session_id` gönderilmez.
- Rastgele per-request ID **asla** üretilmez.
- Header değeri loga açık yazılmaz.

**Risk:** Claude Code'un sabit bir oturum ID'si gönderdiği doğrulanmadı. Bu yüzden en sona bırakıldı ve kod yalnızca "varsa geçir" davranışı uygular — kaynaksız ID uydurmaz. Doğrulama başarısızsa davranış zararsızdır (header yoksa hiçbir şey değişmez).

---

## 5. Streaming ve abort

**Dosyalar:** `apps/server/src/proxy/openrouter-client.ts`, `apps/server/src/routes/messages.route.ts`

### `fetchMessage()` imzası

`model` parametresi kaldırılır (kullanılmıyor; model bilgisi `body.model`'de). Çağrı noktaları ve testler güncellenir.

```ts
fetchMessage(config, body, signal?, timeoutMs?)
```

### Timeout

- `timeoutMs` **bağlantı + response header + JSON body okuma** aşamasını kapsar (mevcut davranış: `clearTimeout` `finally`'de, `response.json()` sonrası).
- Timeout dolduğunda JSON body okuması da iptal edilir ve 504'e düşer.
- SSE yanıtına **toplam süre sınırı uygulanmaz**; stream açıldıktan sonra timer temizlenir.
- Idle timeout eklenmez.

### Abort sınıflandırması

`fetchMessage` artık hata sebebini ayırt edilebilir kılar (`AbortError` + sebep). `messages.route.ts` eşler:

| Durum | Status | `error.type` |
|---|---|---|
| İstemci bağlantısı kapandı | 499 | `client_closed` |
| Proxy timeout | 504 | `upstream_timeout` |
| OpenRouter bağlantı/upstream hatası | 502 | `upstream_error` |
| Geçerli upstream HTTP hata yanıtı | gerçek kod korunur | upstream gövdesi olduğu gibi |

Pre-aborted sinyal `timeout` olarak değil, istemci iptali olarak sınıflandırılır.

### Kaynak temizliği

- Her `AbortSignal` listener'ı `finally`'de `removeEventListener` ile kaldırılır.
- Timer'lar `finally`'de temizlenir.
- `req.raw.on('aborted')` listener'ı istek sonunda kaldırılır.

### Header'lar

- İstek: `Accept`, body'deki `stream` değerine göre `text/event-stream` veya `application/json`.
- Yanıt: `content-encoding`, `content-length` ve hop-by-hop header'lar aktarılmaz. `content-type`, `cache-control`, `retry-after`, OpenRouter request ID header'ı korunur.
- SSE yanıtı buffer'lanmaz; `ReadableStream` olduğu gibi `reply.send()` edilir.

### İstemci kopması (`messages.route.ts`)

Yalnızca `req.raw.on('aborted')` yeterli değil. Fastify response socket kapanması (`reply.raw.on('close')`) da izlenir; yanıt **henüz tamamlanmamışsa** upstream abort edilir. Normal tamamlanma `reply.raw.writableEnded` ile ayırt edilir — başarılı bitiş yanlışlıkla iptal sayılmaz. Listener `finally`'de kaldırılır.

---

## 6. Loglama ve testler

### `logRequest`

Mevcut şekil korunur (`{ time, model, status, duration?, ctxTokens? }`); yeni alanlar opsiyonel eklenir:

```ts
inputTokens?: number
outputTokens?: number
cachedInputTokens?: number
cacheWriteTokens?: number
cost?: number
```

`ctxTokens` (`estimateContextTokens`) ayrı bir alan olarak kalır ve gerçek kullanım gibi sunulmaz. `RequestHistory.tsx` yeni alanları tablo kolonlarına ekler; eski kayıtlar `undefined` olduğu için boş görünür.

Usage alanları yanıt gövdesinden okunur. SSE'de: gövde loglama için **buffer'lanmaz**; streaming bittiğinde toplam süre loglanır, token alanları SSE'den çıkarılamıyorsa boş bırakılır. `stream_options` gibi upstream için belirsiz parametre eklenmez.

`duration` = istek başlangıcından yanıt bitişine; ilk-byte süresi ayrı ölçülmek istenirse ayrı alan, mevcut `duration` anlamı değişmez.

### Testler

`optimization.md` §10'daki 16 senaryo:

1. Body `session_id` header'ı ezer
2. Body yoksa geçerli header aktarılır
3. 256 karakter sınırı
4. Boş/geçersiz session ID aktarılmaz
5. `cache_control` korunur
6. `enablePromptCaching` açık/kapalı
7. Non-Claude modele otomatik cache eklenmez
8. SSE bozulmadan geçer
9. Uzun streaming timeout ile kesilmez
10. İstemci kopmasında upstream iptal
11. Timeout→504, iptal→499
12. Eşzamanlı `fetchModels()` tek istek
13. Eşzamanlı `fetchEndpoints()` tek istek
14. TTL dolunca yeni istek
15. Farklı API key eski cache'i kullanmaz
16. OpenRouter JSON hata yanıtı gerçek status ile korunur

Ek: cache'e hata yazılmadığı, cache'den dönen dizinin kopya olduğu.

Mevcut testler korunur; `fetchMessage` imzası değiştiği için çağrıları güncellenir.

### Doğrulama

`npm run build` (tsc — ayrı bir typecheck script'i yok) ve `npm test` (server, vitest). Değişen dosya listesi ve test sonucu raporlanır; yapılamayan/riskli madde açıkça belirtilir.

---

## Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Claude Code sabit session ID göndermiyor olabilir | Sticky routing faydasız | Son sırada; yalnızca varsa geçirir |
| `x-session-id` header kabulü `/messages` için dokümante değil | Header yok sayılır | Body `session_id` öncelikli; header yalnızca fallback |
| Tam pass-through, OpenRouter'ın reddettiği bir alanı geçirebilir | 400 | `stripFields` ile ayarlanabilir; kullanıcı alan ekleyerek kapatır |
| Prompt caching ilk yazımda maliyeti artırır | Geçici maliyet | Varsayılan `false`; `usage` loglanır, tasarruf ölçülebilir |
| `thinking`/`output_config` geçişi cache'i bozabilir | Cache miss | Kullanım alanları loglandığında görünür |

## Kabul kriterleri

- `/api/models` ve `/api/models/endpoints` tek cache katmanı kullanır, eşzamanlı çağrılar tek upstream isteği üretir.
- `cache_control`, `context_management`, `metadata`, `thinking`, `output_config` varsayılan olarak upstream'e ulaşır.
- `enablePromptCaching` açıkken Claude modellerine tek üst seviye breakpoint eklenir; kullanıcı breakpoint'i ezilmez.
- SSE akışı buffer'lanmaz, toplam süre sınırı yok.
- Timeout 504, istemci iptali 499, upstream hatası 502, upstream HTTP hatası gerçek kodu.
- Mevcut `/v1/models`, tool-calling ve model-resolver davranışı değişmez.
