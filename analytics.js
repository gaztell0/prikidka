// Only the published calculator contributes to its audience statistics.
const production = location.protocol === 'https:'
  && location.hostname === 'gaztell0.github.io'
  && ['/prikidka', '/prikidka/', '/prikidka/index.html'].includes(location.pathname);

if (production) {
  // Standard asynchronous Yandex Metrica loader; independent of the calculator.
  (function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=114088227', 'ym');

  window.ym(114088227, 'init', {
    defer: true,
    webvisor: false,
    clickmap: false,
    trackLinks: false,
    trackHash: false,
    ecommerce: false,
    accurateTrackBounce: false,
    disableYtm: true,
  });

  // Count one page view. Estimate values in old URL hashes or query strings
  // are not part of the reported page URL; sources are reduced to their origin.
  let referer = '';
  try { referer = document.referrer ? `${new URL(document.referrer).origin}/` : ''; } catch {}
  window.ym(114088227, 'hit', `${location.origin}${location.pathname}`, {
    title: 'Прикидка — калькулятор оценки задач',
    referer,
  });
}
