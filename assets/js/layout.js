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
        ]);
    });
})();

