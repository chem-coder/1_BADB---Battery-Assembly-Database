(function loadRenamedSeparatorsScript() {
  const script = document.createElement('script');
  script.src = '/js/separators.js';
  document.currentScript?.after(script) || document.head.appendChild(script);
}());
