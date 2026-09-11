'use strict';

// Service worker próprio do Megan.
//
// POR QUE NÃO O DO FLUTTER: o `flutter_service_worker.js` gerado a cada build
// hoje é só uma lápide de migração (flutter/flutter#156910) — o handler de
// `activate` dele chama `self.registration.unregister()` e se apaga. Registrar
// aquele arquivo deixava o site permanentemente SEM service worker, e sem um
// service worker com handler de `fetch` o Chrome nunca marca o site como
// instalável: o `beforeinstallprompt` não dispara e a opção "Instalar app"
// não aparece nem no menu do navegador.
//
// ESTRATÉGIA: rede primeiro, cache como rede de segurança. Isso é deliberado
// num app Flutter — cache primeiro faria um deploy novo ficar escondido atrás
// de um `main.dart.js` velho, que é a forma clássica de um PWA Flutter
// "congelar" numa versão antiga. Aqui o aluno sempre recebe o que está no ar;
// o cache só responde quando a rede falha.

const CACHE = 'megan-shell-v1';

// O mínimo para a tela abrir offline. Note que NÃO listamos o bundle do app:
// ele entra no cache sozinho na primeira visita, pelo handler de fetch.
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icons/Icon-192.png',
  './icons/Icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Um a um, tolerando falha individual: um único recurso ausente não pode
      // derrubar a instalação inteira. (Um `addAll` rejeita tudo se qualquer
      // item falhar — e uma instalação que falha faz o registro virar
      // `redundant`, deixando o site sem service worker de novo.)
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Só interceptamos o que é do próprio site. As chamadas ao backend
  // (api.effectiveenglishcourse.com), ao Firebase Auth e ao Google passam
  // direto, sem nenhuma interferência nossa.
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          // clone() porque o corpo da resposta só pode ser lido uma vez.
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Offline numa navegação: devolve a casca do app em vez do erro do
        // navegador.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
