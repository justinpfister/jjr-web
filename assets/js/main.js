(function init() {
    document.addEventListener('DOMContentLoaded', function () {
        const title = document.querySelector('h1');
        if (title) {
            title.appendChild(document.createElement('br'));
            title.appendChild(document.createTextNode('dynamic ready'));
        }

        // Example: future API call
        // fetch('/api/health').then(r => r.json()).then(console.log).catch(console.error);
    });
})();

