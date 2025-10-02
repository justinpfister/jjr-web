(function loadLayout() {
    function include(selector, url) {
        var host = document.querySelector(selector);
        if (!host) return Promise.resolve();
        return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (html) {
            host.innerHTML = html;
        }).catch(function () { /* ignore */ });
    }

    document.addEventListener('DOMContentLoaded', function () {
        Promise.all([
            include('header[data-include]', '/partials/header.html'),
            include('footer[data-include]', '/partials/footer.html')
        ]).then(function () {
            // Populate dynamic nav
            var nav = document.getElementById('dynamicNav');
            if (nav) {
                fetch('/api/content', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (items) {
                    items.forEach(function (item) {
                        var a = document.createElement('a');
                        a.href = item.href;
                        a.textContent = item.name;
                        nav.appendChild(a);
                    });
                }).catch(function () { /* ignore */ });
            }
        });
    });
})();

